/** Real stdio MCP -> browser -> existing AgentSession. Requires an independently running dev server. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const { PNG } = createRequire(import.meta.url)('pngjs');
function foreground(data) {
    const png = PNG.sync.read(Buffer.from(data, 'base64'));
    let count = 0;
    for (let i = 0; i < png.data.length; i += 4) {
        if ([0, 1, 2].some((c) => Math.abs(png.data[i + c] - png.data[c]) > 8)) count++;
    }
    return count;
}
async function save(name, data) {
    if (!process.env.AIR_MCP_EVIDENCE) return;
    await mkdir(process.env.AIR_MCP_EVIDENCE, { recursive: true });
    await writeFile(join(process.env.AIR_MCP_EVIDENCE, name), Buffer.from(data, 'base64'));
}
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const url = process.env.AIR_MCP_URL ?? 'http://127.0.0.1:7454/hello-cube/';
const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
async function run(writable) {
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: [cli, '--url', url, ...(writable ? ['--writable'] : [])],
        env: Object.fromEntries(Object.entries(process.env).filter(([, value]) => typeof value === 'string')),
        stderr: 'pipe',
    });
    const client = new Client({ name: 'cocosair-browser-smoke', version: '1' });
    let stderr = '';
    transport.stderr?.on('data', (data) => {
        stderr += data;
    });
    const call = async (name, args = {}, expectError = false) => {
        const result = await client.callTool({ name, arguments: args });
        assert.equal(Boolean(result.isError), expectError, JSON.stringify(result));
        return result;
    };
    try {
        await client.connect(transport);
        const capabilities = (await call('air_capabilities')).structuredContent;
        assert.equal(capabilities.writable, writable);
        const scene = (await call('air_inspect', { kind: 'scene' })).structuredContent;
        const cube = scene.nodes.find((node) => node.name === 'Cube');
        assert.ok(cube, 'hello-cube fixture must expose its Cube');
        const first = await call('air_capture');
        const image = first.content.find((part) => part.type === 'image');
        assert.ok(image?.data.length > 100);
        const foregroundBefore = foreground(image.data);
        assert.ok(foregroundBefore > 500, 'Cube must produce visible foreground pixels');
        await save(`${writable ? 'writable' : 'readonly'}-before.png`, image.data);
        assert.equal(first.structuredContent.width, 640);
        const denied = await call('air_set_transform', { requestId: 'bad', nodeId: cube.id, scale: [0, 1, 1] }, true);
        assert.equal(denied.isError, true);
        if (!writable) {
            const response = await call(
                'air_create_node',
                { requestId: 'read-only', parentId: cube.id, name: 'probe' },
                true,
            );
            assert.equal(response.structuredContent.error.code, 'OUT_OF_SCOPE');
        } else {
            const response = await call('air_set_transform', {
                requestId: 'move',
                nodeId: cube.id,
                position: [1000, 0, 0],
            });
            assert.deepEqual(response.structuredContent.after.position, [1000, 0, 0]);
            assert.equal(response.structuredContent.frame.afterDraw, true);
            const second = await call('air_capture');
            const secondImage = second.content.find((part) => part.type === 'image');
            const foregroundAfter = foreground(secondImage.data);
            assert.ok(
                foregroundAfter < foregroundBefore * 0.1,
                'Moving Cube offscreen must remove its foreground, not merely change animation pixels',
            );
            await save('writable-after.png', secondImage.data);
            assert.notEqual(
                createHash('sha256').update(image.data).digest('hex'),
                createHash('sha256').update(secondImage.data).digest('hex'),
            );
            assert.ok(second.structuredContent.frameIndex > first.structuredContent.frameIndex);
            const duplicate = await call(
                'air_set_transform',
                { requestId: 'move', nodeId: cube.id, position: [0, 0, 0] },
                true,
            );
            assert.equal(duplicate.structuredContent.error.code, 'INVALID_ARGUMENT');
            const unchanged = (await call('air_inspect', { kind: 'node', nodeId: cube.id })).structuredContent;
            assert.deepEqual(unchanged.local.position, [1000, 0, 0]);
            const created = await call('air_create_node', {
                requestId: 'create',
                parentId: cube.parentId,
                name: 'MCP-probe',
            });
            assert.ok(created.structuredContent.result.nodeId);
            await call('air_set_transform', { requestId: 'restore', nodeId: cube.id, position: [0, 0, 0] });
        }
        const errors = (await call('air_inspect', { kind: 'errors' })).structuredContent;
        assert.equal(errors.errors.length, 0, JSON.stringify(errors));
        await call('air_close');
        const closed = await call('air_capture', {}, true);
        assert.equal(closed.structuredContent.error.code, 'SESSION_CLOSED');
        return {
            writable,
            scene: scene.name,
            pngBytes: Buffer.from(image.data, 'base64').length,
            foregroundBefore,
            checks: 'schema, scope, controlled frame, PNG, close',
            stderr,
        };
    } catch (error) {
        console.error(stderr);
        throw error;
    } finally {
        await client.close();
        await transport.close();
    }
}
console.log(JSON.stringify({ readOnly: await run(false), writable: await run(true) }, null, 2));
