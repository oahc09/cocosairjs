/** Optional development transport. No imports from the runtime or default SDK package. */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { reviewGrid } from './review-grid.mjs';

export const LIMITS = Object.freeze({ responseBytes: 128 * 1024, imageBytes: 1024 * 1024, queuedCalls: 8 });
const id = z.string().min(1).max(128);
const vector = z.tuple([
    z.number().finite().min(-1e6).max(1e6),
    z.number().finite().min(-1e6).max(1e6),
    z.number().finite().min(-1e6).max(1e6),
]);
const textResult = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data });
export function failure(code, message) {
    return { ...textResult({ ok: false, error: { code, message } }), isError: true };
}
export function createServer(adapter) {
    const server = new McpServer({ name: 'cocosair-agent', version: '0.1.0' });
    let queue = Promise.resolve();
    let queued = 0;
    const register = (name, description, schema, readOnly, handler) =>
        server.registerTool(
            name,
            {
                description,
                inputSchema: z.object(schema).strict(),
                annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly, openWorldHint: false },
            },
            (args) => {
                if (queued >= LIMITS.queuedCalls)
                    return failure('BUSY', 'Too many pending calls; wait for the current result.');
                queued++;
                const run = queue.then(async () => {
                    try {
                        const result = await handler(args);
                        if (
                            Buffer.byteLength(JSON.stringify(result)) >
                            LIMITS.responseBytes + LIMITS.imageBytes * 1.4
                        ) {
                            return failure(
                                'RESPONSE_LIMIT',
                                'Response exceeds the transport budget. Inspect a specific node instead.',
                            );
                        }
                        return result;
                    } catch (error) {
                        return failure(error.code ?? 'TOOL_FAILED', String(error.message ?? error).slice(0, 2000));
                    }
                });
                queue = run
                    .catch(() => {})
                    .finally(() => {
                        queued--;
                    });
                return run;
            },
        );
    const observed = async (method, args) => {
        const data = await adapter.call(method, args);
        if (Buffer.byteLength(JSON.stringify(data)) > LIMITS.responseBytes) {
            return failure('RESPONSE_LIMIT', 'Observation exceeds 128 KiB. Inspect a specific node instead.');
        }
        return data.ok === false ? { ...textResult(data), isError: true } : textResult(data);
    };
    register(
        'air_capabilities',
        'Discover this attached development session and its limits. Does not claim engine-wide support.',
        {},
        true,
        async () =>
            textResult({
                protocolVersion: 1,
                writable: adapter.writable,
                limits: LIMITS,
                actions: adapter.writable ? ['createNode', 'setTransform', 'review'] : [],
                review: {
                    maxShots: 4,
                    camera: 'Exactly one enabled Camera on the chosen active node',
                    frameDelta: 0,
                    restore: 'Camera local pose only, not application state',
                },
                scope: 'The scene attached at launch only; existing-node edits persist after close.',
                unsupported: [
                    'asset loading',
                    'arbitrary code',
                    'batch transactions',
                    'undo',
                    'global revision tracking',
                    'video export',
                    'remote pages',
                ],
                clock: 'Writes and captures use createStepClock; no deterministic replay of arbitrary application logic.',
            }),
    );
    register(
        'air_inspect',
        'Read the current scene, a node, assets, or recent runtime errors. IDs come from scene inspection.',
        {
            kind: z.enum(['scene', 'node', 'assets', 'errors']),
            nodeId: id.optional(),
        },
        true,
        async (args) => {
            if (args.kind === 'node' && !args.nodeId)
                return failure('INVALID_ARGUMENT', 'nodeId is required for node inspection.');
            if (args.kind !== 'node' && args.nodeId)
                return failure('INVALID_ARGUMENT', 'nodeId is only valid for node inspection.');
            return observed('inspect', args);
        },
    );
    register(
        'air_create_node',
        'Create one native Node in the explicitly writable scene. Request IDs are deduplicated for 60 seconds within a bounded window; do not blindly retry.',
        {
            requestId: id,
            parentId: id,
            name: z.string().min(1).max(128),
        },
        false,
        async (args) => {
            if (!adapter.writable) return failure('OUT_OF_SCOPE', 'Restart with --writable to enable writes.');
            return observed('createNode', args);
        },
    );
    register(
        'air_set_transform',
        'Set native local transform fields in one validated request. This is not a transaction or undo operation.',
        {
            requestId: id,
            nodeId: id,
            position: vector.optional(),
            rotationEuler: vector.optional(),
            scale: vector.refine((v) => v.every((n) => n !== 0), 'Scale components must be nonzero').optional(),
        },
        false,
        async (args) => {
            if (!adapter.writable) return failure('OUT_OF_SCOPE', 'Restart with --writable to enable writes.');
            if (!args.position && !args.rotationEuler && !args.scale)
                return failure('INVALID_ARGUMENT', 'Provide at least one transform field.');
            return observed('setTransform', args);
        },
    );
    register(
        'air_capture',
        'Advance one controlled frame and capture a fresh AFTER_DRAW PNG. This advances application simulation; returns dimensions and frame metadata.',
        {},
        false,
        async () => {
            const data = await adapter.call('capture', {});
            if (data.ok === false) return { ...textResult(data), isError: true };
            const { png, ...metadata } = data;
            const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(png ?? '');
            if (!match || Buffer.from(match[1], 'base64').length > LIMITS.imageBytes)
                return failure('CAPTURE_LIMIT', 'PNG invalid or over 1 MiB; use a smaller launch viewport.');
            return {
                ...textResult(metadata),
                content: [...textResult(metadata).content, { type: 'image', mimeType: 'image/png', data: match[1] }],
            };
        },
    );
    register(
        'air_review',
        'Compare 1–4 local camera poses in one numbered PNG grid. Requires --writable and exactly one enabled Camera. Restores camera pose; zero-delta ticks can still run callbacks. No scene snapshot or rewind.',
        {
            cameraNodeId: id,
            shots: z
                .array(z.object({ label: z.string().min(1).max(32), position: vector, rotationEuler: vector }).strict())
                .min(1)
                .max(4),
        },
        false,
        async (args) => {
            if (!adapter.writable)
                return failure('OUT_OF_SCOPE', 'Restart with --writable for temporary camera edits.');
            const result = await adapter.call('review', args);
            if (result.ok === false) return { ...textResult(result), isError: true };
            try {
                const grid = reviewGrid(result, LIMITS.imageBytes);
                return {
                    ...textResult(grid.metadata),
                    content: [
                        ...textResult(grid.metadata).content,
                        { type: 'image', mimeType: 'image/png', data: grid.data },
                    ],
                };
            } catch (error) {
                return {
                    ...failure('REVIEW_IMAGE_FAILED', String(error.message)),
                    structuredContent: {
                        ok: false,
                        error: { code: 'REVIEW_IMAGE_FAILED', message: String(error.message) },
                        cameraRestored: result.cameraRestored,
                    },
                };
            }
        },
    );
    register(
        'air_close',
        'Detach the session and close its owned browser. Existing-node edits are not rolled back.',
        {},
        false,
        async () => {
            await adapter.close();
            return textResult({ closed: true });
        },
    );
    return server;
}
