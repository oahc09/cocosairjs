// Lead independent regressions. NODE_CONTRACT only; no real browser evidence.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const O = require('../../tools/verify/shaders-film-neon-oracle.cjs');
const N = require('../../tools/verify/shaders-neon-oracle.cjs');
const P = require('../../tools/verify/shaders-film-neon-performance.cjs');
const C = require('../../tools/verify/shaders-film-neon-browser.cjs');

describe('Lead C02 independent composition and collection regressions', () => {
    test('disabling film preserves parent neon HDR before target quantization', () => {
        const p = { ...O.defaults(), filmEnabled: 'off', intensity: 3, specularIntensity: 2, hotCoreIntensity: 1 };
        const parent = N.model(310, 75, 640, 400, O.neonParamsOf(p), 0.25).straightLinear;
        const result = O.model(310, 75, 640, 400, p, 0.25).straightLinear;
        expect(parent[2]).toBeGreaterThan(1.5);
        for (let i = 0; i < 4; i++) expect(result[i]).toBeCloseTo(parent[i], 12);
    });
    test('positive small-alpha film retains its straight RGB when neon is disabled', () => {
        const p = { ...O.defaults(), neonEnabled: 'off', opacity: 0.00001 };
        const value = O.model(320, 80, 640, 400, p, 0.25);
        expect(value.film.alpha).toBeGreaterThan(0);
        expect(value.film.alpha).toBeLessThan(0.001);
        for (let i = 0; i < 3; i++) expect(value.straightLinear[i]).toBeCloseTo(value.film.straight[i], 12);
    });
    test('GLSL consumes phase from the field actually packed by sync', () => {
        const frag = fs.readFileSync(path.join(root, 'examples/shader-film-neon/src/film-neon.frag'), 'utf8');
        // sync packs c1=(saturation, phase, opacity, lightAngle).
        expect(frag).toMatch(/float\s+phase\s*=\s*c1\.y\s*\+/);
    });
    test('film animation has a real time uniform distinct from phase', () => {
        const frag = fs.readFileSync(path.join(root, 'examples/shader-film-neon/src/film-neon.frag'), 'utf8');
        const source = fs.readFileSync(path.join(root, 'examples/shader-film-neon/src/main.ts'), 'utf8');
        // c5.z was reserved and is now the explicit shared simulation time slot.
        expect(frag).toMatch(/float\s+theta\s*=\s*c1\.w[^;]*c5\.z/);
        expect(source).toMatch(/new Vec4\(\s*params\.filmEnabled[^;]*\btime\b/s);
    });
    test('composition explicitly computes the centre SDF once, outside both layer functions', () => {
        const frag = fs.readFileSync(path.join(root, 'examples/shader-film-neon/src/film-neon.frag'), 'utf8');
        const main = frag.slice(frag.indexOf('void main()'));
        const layers = frag.slice(frag.indexOf('vec4 filmLayer'), frag.indexOf('void main()'));
        expect((main.match(/distanceField\(p\)/g) || []).length).toBe(1);
        expect((layers.match(/distanceField\(p\)/g) || []).length).toBe(0);
    });
    test('reference and effect documentation preserve positive-small-alpha composition', () => {
        for (const file of ['examples/shader-film-neon/UPSTREAM.md', 'docs/effects/film-neon.md']) {
            const text = fs.readFileSync(path.join(root, file), 'utf8');
            expect(/alpha\s*>\s*0\.001/i.test(text)).toBe(false);
        }
    });
    test('C02 has three profiles without nonexistent quality tiers', () => {
        expect(C.PERFORMANCE_PLAN).toHaveLength(3);
        for (const row of C.PERFORMANCE_PLAN) expect(Object.hasOwn(row, 'quality')).toBe(false);
    });
    test('identity closure covers imported mother oracle code and both parameter definitions', () => {
        const files = new Set(C.currentIdentity().inputs.map((x: any) => x.path));
        for (const file of [
            'tools/verify/shaders-thin-film-oracle.cjs',
            'tools/verify/shaders-neon-oracle.cjs',
            'examples/shader-thin-film/parameters.json',
            'examples/shader-neon/parameters.json',
        ])
            expect(files.has(file)).toBe(true);
    });
    test('display target alpha includes its opaque cleared background, even with both layers off', () => {
        const p = { ...O.defaults(), filmEnabled: 'off', neonEnabled: 'off' };
        const value = O.model(320, 80, 640, 400, p, 0.25);
        expect(value.straightLinear).toEqual([0, 0, 0, 0]);
        expect(value.display).toEqual([8, 9, 12, 255]);
    });
    test('collector does not submit an absent speed parameter copied from another effect', () => {
        expect(O.definition.params).not.toHaveProperty('speed');
        const source = fs.readFileSync(path.join(root, 'tools/verify/shaders-film-neon-browser.cjs'), 'utf8');
        expect(source).not.toMatch(/\bspeed\s*:\s*0\b/);
    });

    const profile = P.PROFILES[0];
    function baseline(): any {
        const frames = Array.from({ length: 120 }, (_, i) => ({
            frame: i + 1,
            intervalMs: 16,
            renderEnvelopeMs: 1,
            bufferBytes: 500,
            textureBytes: 500,
            drawCalls: 1,
        }));
        return {
            frames,
            warmupFrames: 30,
            updateCalls: frames.map((r) => ({ frame: r.frame, ms: 0.1 })),
            commands: frames.map((r) => ({ frame: r.frame, ms: 0.3, name: 'beginRenderPass' })),
            draws: frames.map((r) => ({ frame: r.frame, ms: 0.2, name: 'drawElements' })),
            queueBookkeeping: frames.map((r) => ({ frame: r.frame, ms: 0.01 })),
            gpuSamples: [],
            queryEvents: [],
            timerAvailable: false,
            readPixelsDuringWindow: 0,
            viewport: { ...profile.viewport, dpr: 1, backing: { ...profile.viewport } },
            device: { renderer: 'NODE_CONTRACT' },
            window: { start: 1, end: 120, durationMs: 1920 },
            methods: {
                commands: 'includes immediate GL',
                queue: 'not GPU command submission',
                frames: 'not monitor presentation',
            },
        };
    }
    test('performance baseline genuinely accepted before mutation', () => {
        expect(P.validatePerformance(baseline(), profile).errors).toEqual([]);
    });
    test.each(['pass-missing', 'wrong-pass', 'non-draw', 'readback', 'readback-missing'])(
        'performance rejects %s from accepted baseline',
        (kind) => {
            const row = baseline();
            expect(P.validatePerformance(row, profile).errors).toEqual([]);
            if (kind === 'pass-missing') row.commands = row.commands.filter((x: any) => x.frame !== 80);
            if (kind === 'wrong-pass') row.commands[79].name = 'updateBuffer';
            if (kind === 'non-draw') row.draws[79].name = 'getError';
            if (kind === 'readback') row.readPixelsDuringWindow = 1;
            if (kind === 'readback-missing') delete row.readPixelsDuringWindow;
            expect(P.validatePerformance(row, profile).errors.length).toBeGreaterThan(0);
        },
    );
    test('performance accepts additional real command methods alongside a beginRenderPass per frame', () => {
        const row = baseline();
        row.commands.push({ frame: 80, ms: 0.01, name: 'bindDescriptorSet' });
        expect(P.validatePerformance(row, profile).errors).toEqual([]);
    });
    test.each(['commands', 'draws', 'gpuSamples', 'queryEvents'])(
        'performance rejects malformed %s without throwing',
        (key) => {
            const row = baseline();
            row[key] = {};
            if (key === 'gpuSamples' || key === 'queryEvents') row.timerAvailable = true;
            let value: any;
            expect(() => {
                value = P.validatePerformance(row, profile);
            }).not.toThrow();
            expect(value.errors.length).toBeGreaterThan(0);
        },
    );
    test.each([{}, { id: 'unknown' }, { id: '720p' }])('malformed profile is rejected without throwing %#', (bad) => {
        let value: any;
        expect(() => {
            value = P.validatePerformance(baseline(), bad);
        }).not.toThrow();
        expect(value.errors.length).toBeGreaterThan(0);
    });
});

describe('Lead C02 temporal observation bindings (NODE_CONTRACT synthetic pixels)', () => {
    const os = require('node:os');
    const crypto = require('node:crypto');
    const { PNG } = require('pngjs');
    let temp: string;
    let pngA: any;
    let pngB: any;
    let pngOff: any;
    const params = O.defaults();
    const clone = (x: any): any => JSON.parse(JSON.stringify(x));
    function picture(time: number, p: any = params): any {
        const png = new PNG({ width: 640, height: 400 });
        for (let i = 0; i < png.data.length; i += 4) png.data.set([8, 9, 12, 255], i);
        for (const point of O.auditPoints(640, 400)) {
            png.data.set(O.model(point.x, point.y, 640, 400, p, time).display, ((399 - point.y) * 640 + point.x) * 4);
        }
        const bytes = PNG.sync.write(png);
        const file = path.join(temp, crypto.randomUUID() + '.png');
        fs.writeFileSync(file, bytes);
        return { path: file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
    }
    function snapshot(time: number, instance = 1, paused = false, frame = 21): any {
        return {
            params: clone(params),
            time,
            instance,
            paused,
            frame,
            viewport: { width: 640, height: 400 },
            canvas: { width: 640, height: 400 },
            dpr: 1,
            background: [8, 9, 12],
            gpuReceipt: { frame: frame - 1, time, canvas: { width: 640, height: 400 }, glError: 0 },
            pixels: O.auditPoints(640, 400).map((p: any) => ({
                ...p,
                rgba: O.model(p.x, p.y, 640, 400, params, time).display,
            })),
        };
    }
    function probe(time: number): any {
        return {
            frame: 21,
            time,
            gpuReceipt: {
                frame: 20,
                time,
                targetRGBA8: true,
                transparentClear: true,
                detached: true,
                disposed: true,
                glError: 0,
                canvas: { width: 640, height: 400 },
            },
            pixels: O.auditPoints(640, 400).map((p: any) => ({
                ...p,
                rgba: O.model(p.x, p.y, 640, 400, params, time).straightLinear.map((v: number) =>
                    Math.round(Math.max(0, Math.min(1, v)) * 255),
                ),
            })),
        };
    }
    function baselineTemporal(): any {
        return {
            engine: 'chromium',
            temporal: {
                params: clone(params),
                a: { time: 0.25, snapshot: snapshot(0.25), probe: probe(0.25), png: pngA },
                b: { time: 0.27, snapshot: snapshot(0.27), probe: probe(0.27), png: pngB },
                determinism: { snapshot: snapshot(0.25, 2), equal: true },
                pause: {
                    params: clone(params),
                    before: snapshot(0.25, 2, true, 30),
                    after: snapshot(0.25, 2, true, 31),
                    paused: true,
                },
                resume: {
                    params: clone(params),
                    before: snapshot(0.25, 2, false, 31),
                    after: snapshot(0.25 + 1 / 60, 2, false, 32),
                    dt: 1 / 60,
                },
            },
        };
    }
    function errorsFor(e: any): any[] {
        const errors: any[] = [];
        C.validateTemporal(e, errors);
        return errors;
    }
    beforeAll(() => {
        temp = fs.mkdtempSync(path.join(os.tmpdir(), 'c02-lead-temporal-'));
        pngA = picture(0.25);
        pngB = picture(0.27);
        pngOff = picture(0.25, { ...params, filmEnabled: 'off', neonEnabled: 'off' });
    });
    afterAll(() => fs.rmSync(temp, { recursive: true, force: true }));
    test('complete temporal synthetic fixture is genuinely accepted', () => {
        expect(errorsFor(baselineTemporal())).toEqual([]);
    });
    test.each([
        'pause-time-missing',
        'pause-params',
        'pause-state',
        'pause-receipt',
        'resume-time-missing',
        'resume-time-nan',
        'resume-dt',
        'resume-params',
        'resume-receipt',
        'pause-instance',
        'pause-frame',
        'pause-before-state',
        'resume-instance',
        'resume-frame',
        'resume-before-state',
        'resume-backing',
        'resume-dt-consistent',
    ])('temporal rejects %s from accepted fixture', (kind) => {
        const row = baselineTemporal();
        expect(errorsFor(row)).toEqual([]);
        const p = row.temporal.pause;
        const r = row.temporal.resume;
        if (kind === 'pause-time-missing') delete p.after.time;
        if (kind === 'pause-params') p.after.params.phase += 0.1;
        if (kind === 'pause-state') p.after.paused = false;
        if (kind === 'pause-receipt') p.after.gpuReceipt.frame += 10;
        if (kind === 'resume-time-missing') delete r.after.time;
        if (kind === 'resume-time-nan') r.after.time = Number.NaN;
        if (kind === 'resume-dt') r.dt *= 2;
        if (kind === 'resume-params') r.after.params.phase += 0.1;
        if (kind === 'resume-receipt') r.after.gpuReceipt.time = 999;
        if (kind === 'pause-instance') p.after.instance += 100;
        if (kind === 'pause-frame') {
            p.after.frame = p.before.frame;
            p.after.gpuReceipt.frame = p.before.gpuReceipt.frame;
        }
        if (kind === 'pause-before-state') p.before.paused = false;
        if (kind === 'resume-instance') r.after.instance += 100;
        if (kind === 'resume-frame') {
            r.after.frame = r.before.frame;
            r.after.gpuReceipt.frame = r.before.gpuReceipt.frame;
        }
        if (kind === 'resume-before-state') r.before.paused = true;
        if (kind === 'resume-backing') r.after.canvas.width = 1;
        if (kind === 'resume-dt-consistent') {
            r.dt *= 2;
            r.after = snapshot(r.before.time + r.dt, r.before.instance, false, r.before.frame + 1);
        }
        expect(errorsFor(row).length).toBeGreaterThan(0);
    });
    test('both-off identity PNG is accepted while still verifying every frozen background point', () => {
        expect(O.pngAudit(pngOff.path, { ...params, filmEnabled: 'off', neonEnabled: 'off' }, 0.25).errors).toEqual([]);
    });
    test('pause observation generation uses the in-scope temporal snapshot', () => {
        const source = fs.readFileSync(path.join(root, 'tools/verify/shaders-film-neon-browser.cjs'), 'utf8');
        expect(/after:\s*temporalPauseAfter,\s*paused:\s*temporalPauseAfter\??\.paused\s*===\s*true/.test(source)).toBe(
            true,
        );
    });
});
