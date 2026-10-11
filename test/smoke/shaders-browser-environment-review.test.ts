import * as http from 'http';

const environment = require('../../tools/verify/shaders-browser-environment.cjs');

const expected = () => ({
    viewport: { width: 390, height: 844 },
    dpr: 2,
    backing: { w: 780, h: 1688 },
    crossOriginIsolated: true,
    headers: { coop: 'same-origin', coep: 'require-corp' },
});

const receipt = () => ({
    expected: expected(),
    responseStatus: 200,
    deliveredHeaders: { coop: 'same-origin', coep: 'require-corp' },
    phases: [
        { id: 'after-navigation', dpr: 1, coi: true, css: { w: 390, h: 844 }, backing: { w: 390, h: 844 } },
        { id: 'after-viewport-repair', dpr: 2, coi: true, css: { w: 390, h: 844 }, backing: { w: 780, h: 1688 } },
    ],
    ok: true,
    errors: [],
});

describe('shader browser environment: Lead review contracts', () => {
    test('the production checker accepts an actual-shaped repaired profile', () => {
        expect(typeof environment.validateEnvironmentReceipt).toBe('function');
        expect(environment.validateEnvironmentReceipt(receipt(), expected()).ok).toBe(true);
    });

    test.each([
        ['DPR', (r: any) => { r.phases[1].dpr = 1; }],
        ['backing height', (r: any) => { r.phases[1].backing.h = 844; }],
        ['CSS width', (r: any) => { r.phases[1].css.w = 1; }],
        ['CSS height', (r: any) => { r.phases[1].css.h = 1; }],
        ['COEP', (r: any) => { delete r.deliveredHeaders.coep; }],
        ['COOP', (r: any) => { delete r.deliveredHeaders.coop; }],
        ['COI', (r: any) => { r.phases[1].coi = false; }],
        ['NaN height', (r: any) => { r.phases[1].backing.h = NaN; }],
        ['HTTP error', (r: any) => { r.responseStatus = 502; }],
        ['missing navigation', (r: any) => { r.phases.shift(); }],
        ['duplicate repair', (r: any) => { r.phases.push(r.phases[1]); }],
        ['forged expected', (r: any) => { r.expected.dpr = 1; r.phases[1].dpr = 1; }],
    ])('rejects %s despite self-reported ok=true', (_name: string, change: (r: any) => void) => {
        const row = receipt();
        change(row);
        expect(environment.validateEnvironmentReceipt(row, expected()).ok).toBe(false);
    });

    test('malformed receipts are total structured rejection', () => {
        for (const row of [null, undefined, [], '', 1, {}]) {
            expect(() => environment.validateEnvironmentReceipt(row, expected())).not.toThrow();
            expect(environment.validateEnvironmentReceipt(row, expected()).ok).toBe(false);
        }
    });

    test('invalid authoritative dimensions are rejected', () => {
        for (const value of [NaN, Infinity, 0, -1, 1.5]) {
            const plan = expected();
            plan.viewport.width = value;
            expect(environment.validateEnvironmentReceipt(receipt(), plan).ok).toBe(false);
        }
    });

    test('the isolation parameter never corrupts other query parameters', async () => {
        const requests: string[] = [];
        const upstream = http.createServer((req, res) => {
            requests.push(req.url!);
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(req.url);
        });
        await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
        let proxy: any;
        try {
            const address = upstream.address() as import('net').AddressInfo;
            proxy = await environment.startIsolationProxy({ origin: `http://127.0.0.1:${address.port}` });
            for (const query of ['?_isolate=1&test=1', '?test=1&_isolate=1', '?test=1&_isolate=1&seed=2']) {
                await new Promise<void>((resolve, reject) => {
                    http.get(`${proxy.origin}/effect/${query}`, (res) => {
                        res.resume();
                        res.on('end', resolve);
                        res.on('error', reject);
                    }).on('error', reject);
                });
            }
            expect(requests).toEqual(['/effect/?test=1', '/effect/?test=1', '/effect/?test=1&seed=2']);
        } finally {
            if (proxy) await proxy.close();
            await new Promise<void>((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
        }
    });
});
