/** Explicitly loaded development-only bridge; never exported by the runtime. */
import { createStepClock } from 'cocosair';
import type { AirApp } from 'cocosair';
import { createAgentSession } from './agent-session';
import { captureControlled, reviewCamera, ReviewRequest } from './mcp-review';

export function attachMcpBridge(app: AirApp, writable: boolean) {
    const scene = app.getScene();
    if (!scene) {
        throw new Error('No running scene; expose window.__airApp after app.run().');
    }
    const session = createAgentSession({ app, writableScenes: writable ? [scene] : [], captureTimeoutMs: 3000 });
    const clock = createStepClock({ stepTimeoutMs: 3000 });
    let closed = false;
    let created = 0;
    return {
        async call(method: string, args: Record<string, any>) {
            if (closed) {
                return { ok: false, error: { code: 'SESSION_CLOSED', message: 'Start a new MCP process.' } };
            }
            if (app.getScene() !== scene) {
                return {
                    ok: false,
                    error: {
                        code: 'STALE_TARGET',
                        message: 'Scene changed; start a new MCP process to attach explicitly.',
                    },
                };
            }
            if (method === 'inspect') {
                switch (args.kind) {
                    case 'scene':
                        return session.inspectScene();
                    case 'node':
                        return session.inspectNode(args.nodeId);
                    case 'assets':
                        return session.inspectAsset();
                    case 'errors':
                        return session.getRuntimeErrors({ limit: 100 });
                    default:
                        throw new Error('Unknown inspection kind');
                }
            }
            if (method !== 'capture' && !writable) {
                return { ok: false, error: { code: 'OUT_OF_SCOPE', message: 'Read-only session' } };
            }
            if (method === 'review') {
                return reviewCamera(session, clock, args as unknown as ReviewRequest, () => app.getScene() === scene);
            }
            if (!['capture', 'createNode', 'setTransform'].includes(method)) {
                throw new Error('Unsupported bridge method');
            }
            clock.begin();
            try {
                if (method === 'capture') {
                    return await captureControlled(session, clock);
                }
                if (method === 'createNode' && created >= 128) {
                    return {
                        ok: false,
                        error: { code: 'RESOURCE_LIMIT', message: 'At most 128 created nodes per session.' },
                    };
                }
                const before = method === 'setTransform' ? session.inspectNode(args.nodeId).local : undefined;
                const response = await session.dispatch(
                    method === 'createNode'
                        ? {
                              requestId: args.requestId,
                              action: 'createNode',
                              targetId: args.parentId,
                              params: { name: args.name },
                          }
                        : {
                              requestId: args.requestId,
                              action: 'setTransform',
                              targetId: args.nodeId,
                              params: {
                                  space: 'local',
                                  ...(args.position !== undefined ? { position: args.position } : {}),
                                  ...(args.rotationEuler !== undefined ? { rotationEuler: args.rotationEuler } : {}),
                                  ...(args.scale !== undefined ? { scale: args.scale } : {}),
                              },
                          },
                );
                if (response.ok) {
                    if (method === 'createNode') {
                        created++;
                    }
                    // A successful write is already committed. Do not convert a subsequent frame failure into a retryable write failure.
                    let frame: unknown;
                    try {
                        frame = await clock.step();
                    } catch (error) {
                        frame = { error: String(error), committed: true };
                    }
                    let after: unknown;
                    try {
                        after = method === 'setTransform' ? session.inspectNode(args.nodeId).local : undefined;
                    } catch (error) {
                        after = { unavailable: String(error) };
                    }
                    return { ...response, committed: true, before, after, frame };
                }
                return response;
            } finally {
                clock.end();
            }
        },
        close() {
            if (!closed) {
                closed = true;
                session.close();
                clock.end();
            }
        },
    };
}
