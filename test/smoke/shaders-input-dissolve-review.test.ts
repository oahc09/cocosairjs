import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const main = fs.readFileSync(path.join(root, 'examples/shader-input-dissolve/src/main.ts'), 'utf8');
const shader = fs.readFileSync(path.join(root, 'examples/shader-input-dissolve/src/dissolve.frag'), 'utf8');
const browserSource = fs.readFileSync(path.join(root, 'tools/verify/shaders-input-dissolve-browser.cjs'), 'utf8');
const O = require('../../tools/verify/shaders-input-dissolve-oracle.cjs');
const B = require('../../tools/verify/shaders-input-dissolve-browser.cjs');
const P = require('../../tools/verify/shaders-input-dissolve-performance.cjs');

function resourceFixture() {
    return {
        rows: Array.from({ length: 100 }, (_, index) => {
            const route = ['image', 'procedural', 'rendered'][index % 3];
            return {
                index,
                id: index + 1,
                route,
                before: { bufferSize: 10, textureSize: 10 },
                created: { bufferSize: 20, textureSize: 20 },
                after: { bufferSize: 10, textureSize: 10 },
                trace: {
                    refs: O.OWNED_KINDS_BY_ROUTE(route).map((kind: string) => ({ kind, before: 1, after: 0 })),
                    renderersUnbound: true,
                    nodesRemoved: true,
                    contentDetached: true,
                    sourceDisposed: true,
                    repeat: { idempotent: true },
                },
                nodeValid: false,
                registryPresent: false,
            };
        }),
    };
}

function perfFixture() {
    const profile = P.PROFILES[0];
    const params = { ...O.defaults(), route: 'rendered' };
    const snap = (frame: number, time: number) => ({
        params: { ...params },
        route: 'rendered',
        viewport: { ...profile.viewport },
        dpr: profile.dpr,
        canvas: { ...profile.viewport, css: { ...profile.viewport } },
        background: [8, 9, 12],
        linearDiagnostic: false,
        instance: 1,
        frame,
        time,
        shaderPasses: [
            { program: 'content', shaderCompiled: true },
            { program: 'dissolve', shaderCompiled: true },
        ],
        renderTargets: { source: { ...profile.viewport, attached: true } },
    });
    const frames = Array.from({ length: 90 }, (_, i) => ({
        frame: i + 1,
        intervalMs: 1000 / 60,
        renderEnvelopeMs: 1,
        drawCalls: 2,
        bufferBytes: 100,
        textureBytes: 100,
    }));
    return {
        viewport: { ...profile.viewport, dpr: 1, backing: { ...profile.viewport } },
        frames,
        warmupFrames: 30,
        readPixelsDuringWindow: 0,
        commands: frames.flatMap((f) => [0, 1].map(() => ({ frame: f.frame, name: 'beginRenderPass', ms: 0.1 }))),
        draws: frames.flatMap((f) => [0, 1].map(() => ({ frame: f.frame, name: 'drawElements', ms: 0.1 }))),
        updateCalls: frames.map((f) => ({ frame: f.frame, ms: 0.1 })),
        timerAvailable: false,
        gpuSamples: [],
        queryEvents: [],
        fixedStart: snap(0, 0),
        fixedEnd: snap(90, 1.5),
        device: { renderer: 'NODE_CONTRACT' },
        window: { durationMs: 1500, start: 1, end: 90 },
        methods: { instrumentation: 'instrumented NODE_CONTRACT' },
    };
}

describe('C04 Lead independent production review', () => {
    test('launch consumes the full shader launch options object', () => {
        expect(browserSource).not.toMatch(/args:\s*shaderLaunchOptions\(engine\)/);
    });
    test('all-browser enumeration comes from an actual export', () => {
        expect(browserSource).not.toMatch(
            /\{[^}]*browserEngines[^}]*\}\s*=\s*require\('\.\/shaders-browser-launch\.cjs'\)/,
        );
    });
    test('native source render target has a backing resize path', () => {
        expect(main).toMatch(/sourceRT\??\.resize\(/);
    });
    test('probe disposal receipt is not the pre-finally captured false value', () => {
        const probe = main.slice(
            main.indexOf('async function linearProbe('),
            main.indexOf('function startPerformance('),
        );
        expect(probe).not.toMatch(/disposed:\s*c\.disposed/);
    });
    test('image native texture has explicit nearest filtering', () => {
        expect(main).toMatch(/setFilters\(\s*(?:gfx\.)?Filter\.NEAREST/);
    });
    test('performance uses the production isolation and DPR environment repair', () => {
        expect(browserSource).toMatch(/(?:\.|\s)startIsolationProxy\(/);
        expect(browserSource).toMatch(/(?:\.|\s)navigateWithDPRRepair\(/);
    });
    test('release is terminal: collector never calls recreate or cycles after releasing the same page', () => {
        const body = browserSource.slice(browserSource.indexOf('const nativeRelease ='));
        const samePageReleaseToRecreate = /const nativeRelease[\s\S]*?const recreated\s*=\s*await page\.evaluate/;
        expect(body).not.toMatch(samePageReleaseToRecreate);
    });
    test('live uniform uploads use actual generated names, including probe and content', () => {
        const body = main.slice(main.indexOf('function sync('), main.indexOf('function retire('));
        const names = [...body.matchAll(/\.setProperty\(\s*'([^']+)'/g)].map((m) => m[1]);
        expect(names).toContain('params');
        expect(names).toContain('flags');
        expect(names.filter((n) => /^(dp|cp)\d+$/.test(n))).toEqual([]);
        const probe = main.slice(
            main.indexOf('async function linearProbe('),
            main.indexOf('function startPerformance('),
        );
        expect(probe).not.toMatch(/\.setProperty\(\s*'dp1'/);
    });
    test('image decoding introduces no second canvas', () => {
        expect(main).not.toMatch(/new\s+OffscreenCanvas|createElement\(\s*['"]canvas/);
    });
    test('positive alpha 1/255 survives the actual GLSL f32 inverse', () => {
        const body = shader.match(/vec4 unpremultiplySafe\([^)]*\)\s*\{([\s\S]*?)\}/)?.[1];
        expect(body).toBeDefined();
        const threshold = Number(body!.match(/s\.a\s*>\s*([\d.eE+-]+)/)?.[1]);
        expect(Number.isFinite(threshold)).toBe(true);
        const alpha = Math.fround(1 / 255);
        const actual = alpha > Math.fround(threshold) ? alpha / alpha : 0;
        expect(actual).toBe(1);
    });
    test('diagnostic disabled path also remains linear', () => {
        const body = shader.match(/if\s*\(flags\.y\s*<\s*0\.5\)\s*\{([\s\S]*?)\}/)?.[1];
        expect(body).toBeDefined();
        expect(body).not.toMatch(/cc_FragColor\s*=\s*vec4\(encode\(source\.rgb\),\s*source\.a\)/);
    });
    test('collector main actually launches the real browser, not a placeholder', () => {
        const body = browserSource.slice(browserSource.indexOf('async function main('));
        expect(body).toMatch(/launch\(|collect\w*\(/);
        expect(body).not.toContain('browser collection requires a Lead authorization window (not run here)');
    });
    test('resource fixture is accepted before mutations', () => {
        expect(O.resourceAudit(resourceFixture()).errors).toEqual([]);
    });
    test('resource asset kinds cannot all be relabeled mesh', () => {
        const r = resourceFixture();
        r.rows[1].trace.refs.forEach((a: any) => (a.kind = 'mesh'));
        expect(O.resourceAudit(r).errors.length).toBeGreaterThan(0);
    });
    test('resource RT camera detach is required', () => {
        const r = resourceFixture();
        r.rows[1].trace.contentDetached = false;
        expect(O.resourceAudit(r).errors.length).toBeGreaterThan(0);
    });
    test('resource RT disposal is required', () => {
        const r = resourceFixture();
        r.rows[2].trace.sourceDisposed = false;
        expect(O.resourceAudit(r).errors.length).toBeGreaterThan(0);
    });
    test('probe malformed rgba is rejected without throwing', () => {
        const pixels = O.auditPoints(640, 400).map((p: any) => ({ ...p, rgba: null }));
        const probe = {
            pixels,
            gpuReceipt: {
                targetRGBA8: true,
                transparentClear: true,
                detached: true,
                disposed: true,
                glError: 0,
                frame: 1,
                canvas: { width: 640, height: 400 },
            },
        };
        expect(() => O.probeAudit(probe, O.defaults())).not.toThrow();
        expect(O.probeAudit(probe, O.defaults()).errors.length).toBeGreaterThan(0);
    });
    test('performance valid fixture is accepted before mutations', () => {
        expect(P.validatePerformance(perfFixture(), P.PROFILES[0], 'rendered').errors).toEqual([]);
    });
    test.each(['canvas', 'shaderPasses', 'instance', 'time'])('performance rejects missing fixed %s', (field) => {
        const raw = perfFixture();
        delete (raw.fixedStart as any)[field];
        expect(P.validatePerformance(raw, P.PROFILES[0], 'rendered').errors.length).toBeGreaterThan(0);
    });
    test('performance GPU samples require paired query events', () => {
        const raw = perfFixture();
        raw.timerAvailable = true;
        (raw.gpuSamples as any) = [{ frame: 40, ms: 1 }];
        expect(P.validatePerformance(raw, P.PROFILES[0], 'rendered').errors.length).toBeGreaterThan(0);
    });
    test('normal requires every trusted control type, not only final release', () => {
        const d = O.defaults();
        const errors: any[] = [];
        B.validateNormal(
            {
                engine: 'chromium',
                normal: {
                    events: [{ type: 'release', isTrusted: true }],
                    pause: { before: { time: 1 }, after: { time: 1 } },
                    resume: { before: { time: 1 }, after: { time: 2 } },
                    reset: { params: d, time: 0 },
                    release: {
                        retirement: {
                            refs: [{ kind: 'mesh', before: 1, after: 0 }],
                            renderersUnbound: true,
                            nodesRemoved: true,
                        },
                        sceneCleared: true,
                        listenerAdds: 1,
                        listenerRemoves: 1,
                        ledger: 1,
                        postReleaseDispatchSilent: true,
                    },
                },
            },
            errors,
        );
        expect(errors.some((x) => String(x).includes('trusted control'))).toBe(true);
    });
});
