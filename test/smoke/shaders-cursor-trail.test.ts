// NODE_CONTRACT only: numerical and lifecycle contracts, not browser evidence.
import { TrailRecorder, toHalfFloat, fromHalfFloat } from '../../examples/shader-cursor-trail/src/recorder';
import { validate } from '../../examples/shader-cursor-trail/src/parameters';
import { effectDefinition } from '../../examples/shader-cursor-trail/src/effect.generated';
const O = require('../../tools/verify/shaders-cursor-trail-oracle.cjs');
const C = require('../../tools/verify/shaders-cursor-trail-browser.cjs');
const P = require('../../tools/verify/shaders-cursor-trail-performance.cjs');
const defaults = O.defaults();
describe('E08 host / half / scan numerical contracts', () => {
    test.each([0, -0, 1, -1, 0.5, 65504, -65504, 1 / 1024, 1 / 65536])('half known value %s', (n) => {
        expect(fromHalfFloat(toHalfFloat(n))).toBe(n);
        expect(toHalfFloat(n)).toBe(O.toHalfFloat(n));
    });
    test('four channels / 63 points plus head duplicate / inactive one-clear upload', () => {
        const rec = new TrailRecorder();
        for (let i = 0; i < 200; i++)
            rec.frame({
                pointer: { x: 0.5 + 0.3 * Math.cos(i), y: 0.5 + 0.3 * Math.sin(i) },
                deltaTime: 0.001,
                length: 2,
                radius: 0.5,
                aspect: 1.6,
            });
        expect(rec.points.length).toBe(63);
        expect(rec.count).toBe(64);
        expect(rec.texData.byteLength).toBe(512);
        const tail = Array.from(rec.texData.slice(62 * 4, 63 * 4));
        expect(Array.from(rec.texData.slice(63 * 4))).toEqual(tail);
        const pointer = rec.points.at(-1)!;
        for (let i = 0; i < 12; i++) rec.frame({ pointer, deltaTime: 0.25, length: 2, radius: 0.5, aspect: 1.6 });
        expect(rec.count).toBe(0);
        expect(rec.points).toHaveLength(0);
        expect(Array.from(rec.texData).filter((_, i) => i % 4 === 2)).toEqual(Array(64).fill(toHalfFloat(1)));
        const g = rec.generations;
        rec.frame({ pointer, deltaTime: 0.1, length: 2, radius: 0.5, aspect: 1.6 });
        expect(rec.generations).toBe(g);
    });
    test('host independent replay includes corners, zero-length, stale ageing and budget overflow', () => {
        const rec = new TrailRecorder(),
            oracle = O.makeOracleRecorder();
        for (let i = 0; i < 150; i++) {
            const p = { x: 0.5 + 0.32 * Math.cos(i * 0.51), y: 0.5 + 0.2 * Math.sin(i * 0.73) },
                dt = i % 9 === 0 ? 0 : 0.005;
            const a = rec.frame({ pointer: p, deltaTime: dt, length: 2, radius: 0.5, aspect: 1.6 });
            const b = oracle.tick(p, dt, 2, 0.5, 1.6);
            expect(Array.from(a.packed)).toEqual(Array.from(b.texData));
            expect(a.count).toBe(b.count);
        }
    });
    test('reset clears the tracker without painting an old-to-new segment', () => {
        const rec = new TrailRecorder();
        const input = { pointer: { x: 0.8, y: 0.7 }, deltaTime: 0.01, length: 0.5, radius: 0.5, aspect: 1.6 };
        rec.frame(input);
        rec.reset();
        rec.frame(input);
        expect(rec.count).toBe(0);
        expect(rec.points).toHaveLength(0);
    });
    test.each([
        null,
        {},
        { pointer: { x: NaN, y: 0.5 } },
        { pointer: { x: 0.5, y: 0.5 }, deltaTime: Infinity, length: 1, radius: 1, aspect: 1 },
    ])('reject malformed frame %p', (input) => {
        expect(() => new TrailRecorder().frame(input as any)).toThrow('Invalid recorder frame');
    });
    test.each([
        null,
        [],
        {},
        { ...defaults, radius: NaN },
        { ...defaults, radius: Infinity },
        { ...defaults, radius: 0.4 },
        { ...defaults, length: 'one' },
        { ...defaults, unknown: 1 },
        { ...defaults, colorA: '#xyzxyz' },
    ])('atomic parameter rejection %p', (input) => {
        expect(validate(O.definition, input).ok).toBe(false);
    });
    test('defaults accepted and metadata exposes exactly the GLSL block and sampler', () => {
        expect(validate(O.definition, defaults).values).toEqual(defaults);
        const shader = effectDefinition.shaders[0];
        expect(shader.blocks[0].members.map((m) => m.name)).toEqual(['trail0', 'trail1', 'trail2']);
        expect(shader.samplerTextures.map((s) => [s.name, s.binding])).toEqual([['pointsTexture', 1]]);
        expect(shader.glsl3.frag).toMatch(/texelFetch\(pointsTexture/);
    });
    test('a lone dot, far field and analytically known age-weighted coverage', () => {
        const bits = new TrailRecorder().texData;
        bits[0] = toHalfFloat(0.5);
        bits[1] = toHalfFloat(0.5);
        bits[2] = toHalfFloat(0.5);
        bits[3] = toHalfFloat(-1);
        const hit = O.scanPixel(bits, [0.5, 0.5], 1.6, 1, 0, 0, 400);
        expect(hit.minSdf).toBeCloseTo(-0.1, 12);
        expect(hit.age).toBeCloseTo(0.5, 12);
        expect(hit.coverage).toBe(1);
        expect(O.scanPixel(bits, [0, 0], 1.6, 1, 0, 0, 400).coverage).toBe(0);
    });
    test('stroke-start signed widths prevent a connecting chord', () => {
        const bits = new TrailRecorder().texData;
        for (let i = 0; i < 2; i++) {
            bits[i * 4] = toHalfFloat(i ? 0.75 : 0.25);
            bits[i * 4 + 1] = toHalfFloat(0.5);
            bits[i * 4 + 2] = 0;
            bits[i * 4 + 3] = toHalfFloat(-1);
        }
        expect(O.scanPixel(bits, [0.5, 0.5], 1.6, 0.5, 0, 0, 400).coverage).toBe(0);
        bits[7] = toHalfFloat(1);
        expect(O.scanPixel(bits, [0.5, 0.5], 1.6, 0.5, 0, 0, 400).coverage).toBe(1);
    });
    test('CPU projected-chord formula is not labelled exact round-cone SDF', () => {
        const rec = O.makeOracleRecorder();
        rec.tick({ x: 0.6, y: 0.5 }, 0.01, 1, 1, 1);
        expect(O.scanPixel(rec.texData, [0.55, 0.5], 1, 1, 0, 0, 400).coverage).toBe(1);
    });
    test('all boundary case ids unique and numeric extremes covered', () => {
        const rows = O.boundaryPlan();
        expect(rows.length).toBe(28);
        expect(new Set(rows.map((r) => r.caseId)).size).toBe(rows.length);
        expect(rows.filter((r) => r.boundary === 'invalid')).toHaveLength(6);
    });
    test.each([null, [], {}, 'bad'])('collector total rejection %p', (report) =>
        expect(C.validateFiles(report).ok).toBe(false),
    );
    test('empty performance is rejected, never counted as an active trail benchmark', () => {
        expect(P.validatePerformance({ frames: [] }, P.PROFILES[0]).errors.length).toBeGreaterThan(0);
    });
    test('probe rejects non-finite decoded texels before oracle arithmetic', () => {
        const bits = Array(256).fill(0);
        bits[0] = 0x7c00;
        expect(O.probeAudit({ gpuReceipt: {} }, bits, defaults).errors).toContain('packed half channels');
    });
});
