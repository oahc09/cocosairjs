/**
 * Contracts for the shared browser-environment helper: uses the ACTUAL production
 * validateEnvironmentReceipt checker (no duplicated local implementation) + real
 * Node HTTP isolated-header/byte-preservation/close tests. tmpdir fixtures only.
 */
import * as http from 'http';
import * as net from 'net';

const { startIsolationProxy, validateEnvironmentReceipt } = require('../../tools/verify/shaders-browser-environment.cjs');

// The production checker is used directly — no local re-implementation.
const checker = validateEnvironmentReceipt;

function httpGet (url: string): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: Buffer }> {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
            res.on('error', reject);
        }).on('error', reject);
    });
}

function fakeExampleServer (): Promise<{ origin: string; close: () => Promise<void>; body: Buffer }> {
    const body = Buffer.from('<!doctype html><html><body>test</body></html>');
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Length': String(body.length) });
            res.end(body);
        });
        server.listen(0, '127.0.0.1', () => {
            resolve({ origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)), body });
        });
    });
}

describe('shaders-browser-environment: production receipt checker (pure)', () => {
    const expected = () => ({ viewport: { width: 390, height: 844 }, dpr: 2, backing: { w: 780, h: 1688 },
        crossOriginIsolated: true, headers: { coop: 'same-origin', coep: 'require-corp' } });
    const receipt = () => ({ responseStatus: 200, deliveredHeaders: { coop: 'same-origin', coep: 'require-corp' },
        phases: [
            { id: 'after-navigation', dpr: 1, coi: true, css: { w: 390, h: 844 }, backing: { w: 390, h: 844 } },
            { id: 'after-viewport-repair', dpr: 2, coi: true, css: { w: 390, h: 844 }, backing: { w: 780, h: 1688 } },
        ], ok: true, errors: [] });

    test('accepts a correct repaired profile', () => {
        expect(checker(receipt(), expected()).ok).toBe(true);
    });

    test('rejects DPR mismatch using the production checker', () => {
        const r = receipt(); r.phases[1].dpr = 1;
        expect(checker(r, expected()).ok).toBe(false);
    });

    test('rejects backing mismatch using the production checker', () => {
        const r = receipt(); r.phases[1].backing.h = 844;
        expect(checker(r, expected()).ok).toBe(false);
    });

    test('rejects COI mismatch using the production checker', () => {
        const r = receipt(); r.phases[1].coi = false;
        expect(checker(r, expected()).ok).toBe(false);
    });

    test('rejects non-finite DPR using the production checker', () => {
        const r = receipt(); r.phases[1].dpr = NaN;
        expect(checker(r, expected()).ok).toBe(false);
    });

    test('rejects invalid expected DPR using the production checker', () => {
        for (const bad of [0, -1, NaN, Infinity]) {
            expect(checker(receipt(), { ...expected(), dpr: bad }).ok).toBe(false);
        }
    });

    test('rejects missing phases using the production checker', () => {
        const r = receipt(); r.phases = [{ id: 'after-navigation', dpr: 1 }];
        expect(checker(r, expected()).ok).toBe(false);
    });

    test('malformed receipts are total structured rejection', () => {
        for (const row of [null, undefined, [], '', 1, {}]) {
            expect(() => checker(row, expected())).not.toThrow();
            expect(checker(row, expected()).ok).toBe(false);
        }
    });
});

describe('shaders-browser-environment: real HTTP isolation server', () => {
    test('isolated proxy delivers COOP/COEP headers with exact body bytes', async () => {
        const upstream = await fakeExampleServer();
        const proxy = await startIsolationProxy(upstream, {});
        try {
            const response = await httpGet(`${proxy.origin}/test?_isolate=1`);
            expect(response.headers['cross-origin-opener-policy']).toBe('same-origin');
            expect(response.headers['cross-origin-embedder-policy']).toBe('require-corp');
            expect(response.body.equals(upstream.body)).toBe(true);
            expect(Number(response.headers['content-length'])).toBe(response.body.length);
        } finally { await proxy.close(); await upstream.close(); }
    });

    test('non-isolated proxy omits isolation headers and preserves bytes', async () => {
        const upstream = await fakeExampleServer();
        const proxy = await startIsolationProxy(upstream, {});
        try {
            const response = await httpGet(`${proxy.origin}/test`);
            expect(response.headers['cross-origin-opener-policy']).toBeUndefined();
            expect(response.headers['cross-origin-embedder-policy']).toBeUndefined();
            expect(response.body.equals(upstream.body)).toBe(true);
        } finally { await proxy.close(); await upstream.close(); }
    });

    test('proxy actually refuses connections after close (real close assertion)', async () => {
        const upstream = await fakeExampleServer();
        const proxy = await startIsolationProxy(upstream, {});
        const origin = proxy.origin;
        await proxy.close();
        await upstream.close();
        // Verify the port actually refuses new connections
        const refused = await new Promise<boolean>((resolve) => {
            const socket = net.connect({ host: '127.0.0.1', port: new URL(origin).port ? Number(new URL(origin).port) : 80, timeout: 1000 });
            socket.on('error', () => resolve(true)); // ECONNREFUSED = actually closed
            socket.on('connect', () => { socket.destroy(); resolve(false); });
            socket.on('timeout', () => { socket.destroy(); resolve(false); });
        });
        expect(refused).toBe(true);
    });
});
