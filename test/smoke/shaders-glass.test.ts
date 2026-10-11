import { glassEffectDefinition } from '../../examples/shader-glass/src/effect.generated';
import { validate } from '../../examples/shader-glass/src/parameters';
const O = require('../../tools/verify/shaders-glass-oracle.cjs');
const defaults = O.defaults;
// Independent numeric facts, NODE_CONTRACT only. No cached output/browser assertions.
describe('E09 Glass mathematical foundation', () => {
    test('six vec4s and one child sampler are actual generated members', () => {
        const shader = glassEffectDefinition.shaders[0];
        expect(shader.blocks[0].members.map((m: any) => m.name)).toEqual(
            Array.from({ length: 6 }, (_, i) => 'glass' + i),
        );
        expect(Object.keys(glassEffectDefinition.techniques[0].passes[0].properties)).toEqual(
            Array.from({ length: 6 }, (_, i) => 'glass' + i),
        );
        expect(shader.samplerTextures.map((s: any) => [s.name, s.binding])).toEqual([['childTexture', 1]]);
        expect(shader.glsl3.frag).toContain('glass5');
    });
    test.each([null, undefined, [], {}, 'x', 42])('reject malformed complete parameters %#', (value) =>
        expect(validate(O.definition, value).ok).toBe(false),
    );
    test('accept actual complete defaults', () => expect(validate(O.definition, defaults()).ok).toBe(true));
    test.each([
        { refraction: NaN },
        { blur: Infinity },
        { scale: 0 },
        { aberration: 1.1 },
        { shape: 'sphere3D' },
        { tintColor: 'red' },
        { cutout: 'bad' },
        { unknown: 1 },
    ])('reject numeric/color/enum/unknown %#', (patch) =>
        expect(validate(O.definition, { ...defaults(), ...patch }).ok).toBe(false),
    );
    test('flat depth strength at rim is 1 and deep interior is 0', () => {
        expect(O.refrStrength(0, 0.25)).toBe(1);
        expect(O.refrStrength(-1, 0.25)).toBe(0);
        expect(O.refrStrength(-0.0375, 0.25)).toBeCloseTo(0.25, 12);
    });
    test('zero thickness remains finite via 0.005 depth floor', () => {
        expect(O.refrStrength(-0.0025, 0)).toBe(0.25);
    });
    test('refraction zero and zoom one are identity UV', () => {
        const r = O.lensUV([0.7, 0.6], -0.01, [1, 0], { ...defaults(), refraction: 0 }, 2);
        expect(r.lens).toEqual([0.7, 0.6]);
        expect(r.red).toEqual(r.lens);
        expect(r.blue).toEqual(r.lens);
    });
    test('zoom two halves centre-relative displacement', () =>
        expect(O.lensUV([0.7, 0.6], -1, [1, 0], { ...defaults(), innerZoom: 2 }, 1).lens).toEqual([0.6, 0.55]));
    test('slope cap binds gradient 120 to 12 before aspect correction', () => {
        const r = O.lensUV([0.5, 0.5], 0, [120, 0], defaults(), 2);
        expect(r.offset[0]).toBeCloseTo(-0.9, 12);
        expect(r.offset[1] === 0).toBe(true); // IEEE -0 is the same mathematical zero offset.
    });
    test('aberration zero produces the same red/green/blue UV', () => {
        const r = O.lensUV([0.7, 0.6], 0, [1, 1], { ...defaults(), aberration: 0 }, 1.6);
        expect(r.red).toEqual(r.lens);
        expect(r.blue).toEqual(r.lens);
    });
    test('Vogel disk has nine deterministic unit-disk samples, first zero', () => {
        expect(O.BLUR_DISK).toHaveLength(9);
        expect(O.BLUR_DISK[0]).toEqual([0, 0]);
        O.BLUR_DISK.forEach((p: any, i: number) => expect(Math.hypot(...p)).toBeCloseTo(Math.sqrt(i / 9), 12));
    });
    test('blank premultiplied texture cannot reveal hidden RGB', () => {
        expect(O.rawSample(0.75, 0.25, 'standard')).toEqual([0, 0, 0, 0]);
        expect(O.unpremultiply([1, 0.4, 0, 0])).toEqual({ straight: [0, 0, 0], alpha: 0 });
    });
    test('half-alpha raw storage unpremultiplies once', () => {
        const raw = O.rawSample(0.8, 0.6, 'standard');
        expect(raw[3]).toBe(128 / 255);
        const r = O.unpremultiply(raw);
        expect(r.straight[0]).toBe(raw[0] / raw[3]);
    });
    test('tint preserves input luminance when enabled', () => {
        const rgb = [0.2, 0.3, 0.4],
            lum = (x: number[]) => x[0] * 0.299 + x[1] * 0.587 + x[2] * 0.114;
        const r = O.tint(rgb, { ...defaults(), tintColor: '#ff0000', tintIntensity: 0.5 });
        expect(lum(r)).toBeCloseTo(lum(rgb), 12);
    });
    test('composite outside a shape is exact child passthrough', () => {
        const base = { straight: [0.2, 0.3, 0.4], alpha: 0.5 },
            lens = { straight: [0.9, 0.8, 0.7], alpha: 1 };
        expect(O.composite(base, lens, 1, [1, 0], defaults(), 400).straightLinear).toEqual([
            ...base.straight,
            base.alpha,
        ]);
        expect(O.composite(base, lens, 1, [1, 0], { ...defaults(), cutout: 'shape' }, 400).straightLinear[3]).toBe(0);
    });
    test('quarter inside mask has cubic-eased cutout alpha 0.15625', () => {
        const c = { straight: [0, 0, 0], alpha: 1 };
        const p = { ...defaults(), highlight: 0, fresnel: 0, cutout: 'shape' };
        const w = 1.5 / 400;
        expect(O.composite(c, c, -w * 0.25, [1, 0], p, 400).straightLinear[3]).toBe(0.15625);
    });
    test('blank source with all lighting off is transparent without NaN', () => {
        const p = { ...defaults(), sourceKind: 'blank', highlight: 0, fresnel: 0, blur: 12 };
        expect(O.model(319, 199, 640, 400, p, 0).straightLinear).toEqual([0, 0, 0, 0]);
    });
    test('sample UVs clamp to edge rather than wrap', () =>
        expect(O.rawSample(-2, 0.5, 'standard')).toEqual(O.rawSample(0, 0.5, 'standard')));
    test('boundary case IDs are unique and cover all parameters', () => {
        const r = O.boundaryPlan();
        expect(new Set(r.map((r: any) => r.caseId)).size).toBe(r.length);
        expect(new Set(r.map((r: any) => r.parameter)).size).toBe(Object.keys(defaults()).length);
    });
});
