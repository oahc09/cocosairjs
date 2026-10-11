const collector = require('../../tools/verify/shaders-thin-film-browser.cjs');

// NODE_SYNTHETIC contract data; never a browser observation or an Engine Gate PASS.
function environmentReport(): any {
    return {
        authorization: 'SYNTHETIC_UNIT',
        command: 'node synthetic --authorization=SYNTHETIC_UNIT',
        cleanup: { proxyClosed: true, serverClosed: true, errors: [] },
        engines: [{ engine: 'chromium', performance: collector.profiles.map((profile: any) => {
            const backing = { w: profile.viewport.width * profile.dpr, h: profile.viewport.height * profile.dpr };
            const expected = { viewport: profile.viewport, dpr: profile.dpr, backing, crossOriginIsolated: true, headers: { coop: 'same-origin', coep: 'require-corp' } };
            return {
                profile,
                environmentReceipt: { url: 'http://localhost/synthetic', expected, responseStatus: 200, deliveredHeaders: expected.headers, phases: ['after-navigation', 'after-viewport-repair'].map(id => ({ id, dpr: profile.dpr, coi: true, css: { w: profile.viewport.width, h: profile.viewport.height }, backing })) },
                precision: { allRaw: [.02, .04], positiveCount: 2, minimumPositiveDeltaMs: .02, crossOriginIsolated: true, calls: 25000 },
                release: { sceneCleared: true, listenerAdds: 3, listenerRemoves: 3, retirement: { refs: ['mesh', 'material', 'effect'].map(kind => ({ kind, before: 1, after: 0 })), rendererUnbound: true, nodeRemoved: true } },
                pageClosed: true,
                updateCalls: [{ ms: .02 }], commands: [{ ms: .04 }], draws: [{ ms: .02 }],
                httpDocument: { status: 200, url: 'http://localhost/synthetic' },
            };
        }) }],
    };
}

describe('Thin Film collector environment review', () => {
    test('the production environment gate accepts complete synthetic contract data', () => {
        expect(collector.validatePerformanceEnvironment(environmentReport())).toEqual([]);
    });
    test.each([
        ['missing clock', (r: any) => { delete r.engines[0].performance[0].precision.allRaw; }],
        ['NaN clock', (r: any) => { r.engines[0].performance[0].precision.allRaw.push(NaN); }],
        ['wrong clock count', (r: any) => { r.engines[0].performance[0].precision.positiveCount = 1; }],
        ['missing clock minimum', (r: any) => { delete r.engines[0].performance[0].precision.minimumPositiveDeltaMs; }],
        ['missing release', (r: any) => { delete r.engines[0].performance[0].release; }],
        ['unclosed proxy', (r: any) => { r.cleanup.proxyClosed = false; }],
        ['unclosed page', (r: any) => { r.engines[0].performance[0].pageClosed = false; }],
        ['all-zero dispatch', (r: any) => { r.engines[0].performance[0].draws = [{ ms: 0 }]; }],
        ['missing authorization', (r: any) => { r.authorization = ''; }],
    ])('rejects %s', (_name: string, change: (r: any) => void) => {
        const row = environmentReport(); change(row);
        expect(collector.validatePerformanceEnvironment(row).length).toBeGreaterThan(0);
    });
    test('functional verification independently retains shader, pixels, boundary and ownership checks', () => {
        const r = { schemaVersion: 'e02-thin-film/1', phase: 'functional', inputs: [], requestedEngines: ['chromium'], engines: [{ engine: 'chromium', browserVersion: 'SYNTHETIC', pageErrors: [], consoleErrors: [], captures: [], boundaries: [], performance: [], shaderCompile: [{ compiled: false }], normal: { release: { refs: [{ after: 0 }] } } }] };
        const result = collector.validateFiles(r);
        expect(result.ok).toBe(false);
        expect(result.errors).toContain('chromium: shader compile');
        expect(result.errors).toContain('chromium: visual set');
        expect(result.errors).toContain('boundary exact set');
        expect(result.errors).toContain('chromium: terminal cleanup');
    });
});
