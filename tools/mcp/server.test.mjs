import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, LIMITS } from './server.mjs';
import { localPage } from './browser.mjs';

async function fixture(t, writable = false, call = async () => ({ ok: true })) {
    let calls = 0;
    const adapter = {
        writable,
        call: async (...args) => {
            calls++;
            return call(...args);
        },
        close: async () => {},
    };
    const server = createServer(adapter);
    const client = new Client({ name: 'air-test', version: '1' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    await client.connect(b);
    t.after(async () => {
        await client.close();
        await server.close();
    });
    return { client, calls: () => calls };
}
test('real SDK negotiation, compact capabilities and read-only denial', async (t) => {
    const { client, calls } = await fixture(t);
    const list = await client.listTools();
    assert.equal(list.tools.length, 6);
    assert.ok(Buffer.byteLength(JSON.stringify(list)) < 16000);
    const capabilities = await client.callTool({ name: 'air_capabilities', arguments: {} });
    assert.equal(capabilities.structuredContent.writable, false);
    const denied = await client.callTool({
        name: 'air_create_node',
        arguments: { requestId: 'r', parentId: 'p', name: 'n' },
    });
    assert.equal(denied.structuredContent.error.code, 'OUT_OF_SCOPE');
    assert.equal(calls(), 0);
});
test('schema validation rejects invalid transforms before browser evaluation', async (t) => {
    const { client, calls } = await fixture(t, true);
    for (const scale of [
        [0, 1, 1],
        [1, 2],
        [1e20, 1, 1],
        ['1', 1, 1],
    ]) {
        const result = await client.callTool({
            name: 'air_set_transform',
            arguments: { requestId: 'r', nodeId: 'n', scale },
        });
        assert.equal(result.isError, true);
    }
    assert.equal(calls(), 0);
});
test('observation/capture limits and underlying errors remain explicit', async (t) => {
    const { client } = await fixture(t, true, async (method) =>
        method === 'capture' ? { png: 'bad' } : { payload: 'x'.repeat(LIMITS.responseBytes) },
    );
    assert.equal(
        (await client.callTool({ name: 'air_inspect', arguments: { kind: 'scene' } })).structuredContent.error.code,
        'RESPONSE_LIMIT',
    );
    assert.equal(
        (await client.callTool({ name: 'air_capture', arguments: {} })).structuredContent.error.code,
        'CAPTURE_LIMIT',
    );
});
test('serial execution and bounded admission', async (t) => {
    let release;
    let active = 0;
    let maximum = 0;
    const gate = new Promise((resolve) => {
        release = resolve;
    });
    const { client } = await fixture(t, true, async () => {
        maximum = Math.max(maximum, ++active);
        await gate;
        active--;
        return { ok: true };
    });
    const calls = Array.from({ length: 12 }, () =>
        client.callTool({ name: 'air_inspect', arguments: { kind: 'scene' } }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    release();
    const results = await Promise.all(calls);
    assert.equal(maximum, 1);
    assert.ok(results.some((r) => r.structuredContent?.error?.code === 'BUSY'));
});
test('launch destination is explicit loopback only', () => {
    assert.equal(localPage('http://127.0.0.1:7454/hello-cube/').port, '7454');
    for (const url of [
        'https://example.com',
        'http://localhost:7454/',
        'file:///tmp/a',
        'http://127.0.0.1:7454/?x=1',
        'http://user@127.0.0.1:7454/',
    ])
        assert.throws(() => localPage(url));
});

test('unknown fields are rejected rather than used as browser code or destinations', async (t) => {
    const { client, calls } = await fixture(t, true);
    for (const name of ['air_capabilities', 'air_capture', 'air_close']) {
        assert.equal(
            (await client.callTool({ name, arguments: { url: 'https://example.com', code: 'alert(1)' } })).isError,
            true,
        );
    }
    assert.equal(calls(), 0);
});
