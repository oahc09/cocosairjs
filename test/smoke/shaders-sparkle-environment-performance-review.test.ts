/** Lead review: production contracts, NODE_CONTRACT only; no browser evidence. */
const P = require('../../tools/verify/shaders-sparkle-environment-performance.cjs');

describe('Sparkle environment collector Lead review', () => {
    test.each([null, undefined, 'x', 3, [], {}, { schemaVersion: 'sparkle-env-performance/1', rows: {} }])(
        'malformed report returns a structured rejection (%p)', (value) => {
            let result: any;
            expect(() => { result = P.validateReport(value); }).not.toThrow();
            expect(result.ok).toBe(false);
            expect(Array.isArray(result.errors)).toBe(true);
        },
    );

    test.each([[0.02, NaN], [0.02, Infinity], [0.02, 0], [0.02, -1]])(
        'clock rejects any invalid increment, without filtering (%p)', (...values) => {
            expect(P.recomputeClockStats(values).ok).toBe(false);
        },
    );

    test('exports an executable collection main without running it on import', () => {
        expect(typeof P.main).toBe('function');
    });

    test('uses the original Sparkle performance oracle', () => {
        expect(typeof P.B.oracles).toBe('function');
        expect(typeof P.B.oracles().performance).toBe('function');
    });

    test('identity includes all original source, SDK, runner and reference inputs', () => {
        const base = require('../../tools/verify/shaders-sparkle-browser.cjs').currentIdentity();
        const closure = JSON.stringify(P.collectorIdentity());
        const visit = (x: any) => {
            if (!x || typeof x !== 'object') return;
            if (typeof x.path === 'string' && typeof x.sha256 === 'string') {
                expect(closure).toContain(x.path);
                expect(closure).toContain(x.sha256);
            }
            for (const value of Object.values(x)) visit(value);
        };
        visit(base);
    });

    test('environment and release receipts alone cannot establish measured performance', () => {
        const profiles = require('../../tools/verify/shaders-sparkle-browser.cjs').PROFILES;
        const rows = ['chromium', 'firefox', 'webkit'].flatMap(browser => profiles.map((p: any) => ({
            browser, profile: { ...p }, status: 'PASS',
            environmentReceipt: {
                responseStatus: 200, deliveredHeaders: { coop: 'same-origin', coep: 'require-corp' },
                phases: ['after-navigation', 'after-viewport-repair'].map(id => ({
                    id, dpr: p.dpr, coi: true, css: { w: p.width, h: p.height },
                    backing: { w: p.width * p.dpr, h: p.height * p.dpr },
                })), ok: true, errors: [],
            },
            clockPrecision: { allRaw: [0.02], minimumPositiveIncrementMs: 0.02, calibrationPositiveIncrements: 1 },
            release: { refs: [{ before: 1, after: 0 }] }, pageErrors: [], consoleErrors: [],
        })));
        const report = { schemaVersion: 'sparkle-env-performance/1', identity: P.collectorIdentity(), rows,
            cleanup: { proxyClosed: true, serverClosed: true } };
        expect(P.validateReport(report).ok).toBe(false);
    });
});

// Fully populated deterministic measurement shapes, checked by the original
// production oracle. These numbers are fixtures, never browser evidence.
function measuredFixture(): any {
    return require('../fixtures/shaders-sparkle-performance-contract.cjs').makeReport(P);
}

describe('Sparkle collector complete measurement gate (NODE_CONTRACT)', () => {
    test('accepts the complete deterministic baseline, without ignoring any errors', () => {
        const report = measuredFixture();
        for (const row of report.rows) expect(P.B.oracles().performance(row).errors).toEqual([]);
        expect(P.validateReport(report)).toEqual({ ok: true, errors: [] });
    });
    const mutations: [string, (r: any) => void][] = [
        ['clock count', r => { r.rows[0].clockPrecision.calibrationPositiveIncrements = 999; }],
        ['clock isolation', r => { r.rows[0].clockPrecision.crossOriginIsolated = false; }],
        ['FAIL status', r => { r.rows[0].status = 'FAIL'; }],
        ['unknown status', r => { r.rows[0].status = 'invented'; }],
        ['missing status', r => { delete r.rows[0].status; }],
        ['missing page closure', r => { delete r.rows[0].pageClosed; }],
        ['missing browser closure', r => { delete r.cleanup.browsersClosed; }],
        ['inflated refcount', r => { r.rows[0].release.refs[0].before = 9; }],
        ['missing renderer observation', r => { delete r.rows[0].release.rendererRetired; r.rows[0].release.retirement.rendererUnbound = false; }],
        ['missing listener observation', r => { delete r.rows[0].release.listenersRemoved; r.rows[0].release.listenerRemoves = 0; }],
        ['shared template retained', r => { r.rows[0].release.sharedTemplates[0].after = 1; }],
        ['app close failed', r => { r.rows[0].release.receipt.status = 'failed'; }],
    ];
    test.each(mutations)('rejects %s from an accepted baseline', (_label, mutate) => {
        const report = measuredFixture();
        expect(P.validateReport(report).ok).toBe(true);
        mutate(report);
        expect(P.validateReport(report).ok).toBe(false);
    });
    test('validateFiles propagates data failures into ok=false', () => {
        const result = P.validateFiles({ schemaVersion: 'invalid', rawOutputs: [] });
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.ok).toBe(false);
    });
    test('validateFiles rejects null without throwing', () => {
        let result: any;
        expect(() => { result = P.validateFiles(null); }).not.toThrow();
        expect(result.ok).toBe(false);
    });
});
