// Deterministic NODE_CONTRACT fixtures. Not browser measurements or evidence.
const clone = value => JSON.parse(JSON.stringify(value));
function makeReport(P) {
    const identity = P.collectorIdentity();
    const rows = ['chromium', 'firefox', 'webkit'].flatMap(browser => P.PROFILES.map(profile => {
        const frames = Array.from({ length: 92 }, (_, frame) => ({ frame: frame + 3, intervalMs: 16, drawCalls: 1 }));
        const release = {
            retirement: { rendererUnbound: true, nodeRemoved: true,
                refs: ['mesh', 'material', 'texture'].map(kind => ({ kind, before: 1, after: 0 })) },
            sharedTemplates: ['air-e06-sparkle-zero', 'air-e06-sparkle-expanded'].map(name => ({
                name, before: 1, after: 0, registryRemoved: true, validAfterClose: false,
            })), receipt: { status: 'released', pending: [], failures: [] },
            listenerAdds: 3, listenerRemoves: 3, sceneCleared: true, releaseIdentity: true,
        };
        // Compatibility fields for the independent Lead mutation cases.
        release.refs = release.retirement.refs;
        release.rendererRetired = true; release.nodeDetached = true; release.listenersRemoved = true;
        const before = { params: { ...P.PARAMETERS }, inputKind: 'bright-region', frame: 2, time: 0,
            canvas: { width: profile.width * profile.dpr, height: profile.height * profile.dpr,
                css: { width: profile.width, height: profile.height } }, oneCanvas: 1,
            shaderPasses: [{ program: 'air-e06-sparkle-zero', shaderCompiled: true }],
            counters: { texture: 1, buffer: 3 }, memory: { textureSize: 65536, bufferSize: 140 } };
        const after = { ...clone(before), frame: 96, time: 1.5 };
        const raw = { frames,
            updateCalls: frames.map(f => ({ frame: f.frame, ms: .03 })),
            commands: frames.map(f => ({ frame: f.frame, operation: 'beginRenderPass', ms: .04 })),
            draws: frames.map(f => ({ frame: f.frame, ms: .01 })),
            queueBookkeeping: frames.map(f => ({ frame: f.frame, ms: .005 })),
            gpuSamples: [], queryTerminal: [], timerAvailable: false, pageErrors: [], consoleErrors: [],
            viewport: { width: profile.width, height: profile.height, dpr: profile.dpr,
                backing: { width: profile.width * profile.dpr, height: profile.height * profile.dpr } },
            release: clone(release) };
        const clockPrecision = { allRaw: [.02, .04], minimumPositiveIncrementMs: .02,
            calibrationPositiveIncrements: 2, crossOriginIsolated: true };
        return { browser, browserVersion: 'NODE_CONTRACT', caseId: profile.id, profile: { ...profile },
            method: 'REAL_BROWSER', status: 'PASS',
            environmentReceipt: { responseStatus: 200, deliveredHeaders: { coop: 'same-origin', coep: 'require-corp' },
                phases: ['after-navigation', 'after-viewport-repair'].map(id => ({ id, dpr: profile.dpr, coi: true,
                    css: { w: profile.width, h: profile.height }, backing: { w: profile.width * profile.dpr, h: profile.height * profile.dpr } })), ok: true, errors: [] },
            clockPrecision, observation: P.buildObservation(raw, before, clockPrecision, after), release,
            pageErrors: [], consoleErrors: [], pageClosed: true };
    }));
    return { schemaVersion: 'sparkle-env-performance/1', identity, identityAfter: clone(identity), rows,
        cleanup: { proxyClosed: true, serverClosed: true, browsersClosed: true }, errors: [] };
}
module.exports = { makeReport, clone };
