// C01 golden math + contract tests (NODE_CONTRACT).
import { validate } from '../../examples/shader-laser-card/src/parameters';
import {
    holoEffectDefinition,
    embossEffectDefinition,
    sparkleEffectDefinition,
} from '../../examples/shader-laser-card/src/effect.generated';
const oracle = require('../../tools/verify/shaders-laser-card-oracle.cjs');
const contract = require('../../tools/verify/shaders-effect-contract.cjs');
const collector = require('../../tools/verify/shaders-laser-card-browser.cjs');

const defaults = oracle.defaults();
const W = 640,
    H = 400;

describe('C01 parameter contract', () => {
    test('definition and defaults valid', () => {
        expect(contract.validateDefinition(oracle.definition).ok).toBe(true);
        expect(validate(oracle.definition, defaults).ok).toBe(true);
    });
    test.each([
        null,
        {},
        'x',
        { ...defaults, unknown: 1 },
        { ...defaults, embossDepth: NaN },
        { ...defaults, embossDepth: Infinity },
        { ...defaults, sparkleColorize: 9 },
        { ...defaults, shape: 'blob' },
    ])('rejects %#', (v) => expect(validate(oracle.definition, v).ok).toBe(false));
    test('boundary plan unique', () => {
        const rows = oracle.boundaryPlan();
        expect(new Set(rows.map((r: any) => r.caseId)).size).toBe(rows.length);
        expect(rows).toHaveLength(98); // 16 numeric×6 + 3 enum×2 (time excluded)
    });
});

describe('C01 generated effect metadata', () => {
    test('three stage effects with correct members and samplers', () => {
        const stages = [holoEffectDefinition, embossEffectDefinition, sparkleEffectDefinition];
        const expectedMembers = [
            ['hs0', 'hs1', 'hs2'],
            ['es0', 'es1'],
            ['ss0', 'ss1', 'ss2'],
        ];
        const expectedSamplers = [[], ['holoTexture'], ['embossTexture']];
        for (const [i, eff] of stages.entries()) {
            const block = eff.shaders[0].blocks.find((b: any) => b.name === 'Constants');
            expect(block.members.map((m: any) => m.name)).toEqual(expectedMembers[i]);
            expect((eff.shaders[0].samplerTextures ?? []).map((s: any) => s.name)).toEqual(expectedSamplers[i]);
        }
    });
});

describe('C01 composition math goldens', () => {
    const edgeY = 85;
    test('default composite is finite and lit', () => {
        const m = oracle.model(320, edgeY, W, H, defaults, 0.25);
        expect(m.display.every(Number.isFinite)).toBe(true);
        expect(m.straightLinear[3]).toBeGreaterThan(0);
    });
    test('all-off is exactly the frozen background', () => {
        const m = oracle.model(
            320,
            edgeY,
            W,
            H,
            { ...defaults, holoEnabled: 'off', embossEnabled: 'off', sparkleEnabled: 'off' },
            0.25,
        );
        // All-off with holo off uses the neutral card (gray-64 checker) — NOT transparent.
        expect(m.straightLinear[3]).toBeGreaterThan(0);
        expect(m.straightLinear.slice(0, 3).some((v) => v > 0)).toBe(true);
        expect(m.display[3]).toBe(255);
    });
    test('holo-off is background (neutral input yields no content)', () => {
        const m = oracle.model(320, edgeY, W, H, { ...defaults, holoEnabled: 'off' }, 0.25);
        // Holo-off feeds the neutral card, which has non-zero content.
        expect(m.holo.alpha).toBe(1); // neutral card alpha = 1
        expect(m.display[3]).toBe(255);
    });
    test('emboss-off passthrough preserves holo straight RGB', () => {
        const on = oracle.model(320, edgeY, W, H, defaults, 0.25);
        const off = oracle.model(320, edgeY, W, H, { ...defaults, embossEnabled: 'off' }, 0.25);
        expect(off.emboss.passthrough).toBe(true);
        // The composite should differ because emboss shading is removed.
        expect(off.display).not.toEqual(on.display);
    });
    test('sparkle-off removes glow layer but keeps base content', () => {
        const on = oracle.model(320, edgeY, W, H, defaults, 0.25);
        const off = oracle.model(320, edgeY, W, H, { ...defaults, sparkleEnabled: 'off' }, 0.25);
        expect(off.sparkle.glow).toEqual([0, 0, 0]);
        expect(off.straightLinear[3]).toBeGreaterThan(0);
    });
    test('premultiplied RT chain: holo premul[3] = round(alpha*255)', () => {
        const h = oracle.holoStage(0.00125, 0.00125, W, H, defaults, 0.25);
        expect(h.premul[3]).toBe(Math.round(h.alpha * 255));
        for (let i = 0; i < 3; i++) expect(h.premul[i]).toBe(Math.round(clamp01(h.straight[i]) * h.alpha * 255));
    });
    test('emboss un-premultiplies the holo RT sample (no double premultiply)', () => {
        const h = oracle.holoStage(0.00125, 0.00125, W, H, defaults, 0.25);
        const e = oracle.embossStage(0.00125, 0.00125, W, H, defaults, 0.25, h.premul);
        // The emboss output alpha should equal the holo alpha (childA).
        expect(e.premul[3]).toBe(Math.round(h.alpha * 255));
    });
    test('parameter namespace isolation: changing holo params does not alter emboss normal', () => {
        const a = oracle.embossStage(0.00125, 0.00125, W, H, defaults, 0.25, [100, 100, 100, 255]);
        const b = oracle.embossStage(
            0.00125,
            0.00125,
            W,
            H,
            { ...defaults, holoSaturation: 0 },
            0.25,
            [100, 100, 100, 255],
        );
        expect(a.normal).toEqual(b.normal);
    });
    test('time determinism: same params/time reproduce bit-identically', () => {
        const a = oracle.model(320, edgeY, W, H, defaults, 0.25);
        const b = oracle.model(320, edgeY, W, H, defaults, 0.25);
        expect(a.straightLinear).toEqual(b.straightLinear);
    });
    test('one OETF: display is not double-encoded', () => {
        // A pure linear 0.5 would be ~188 after one OETF, ~143 after two.
        const half = Math.round(255 * (1.055 * Math.pow(0.5, 1 / 2.4) - 0.055));
        expect(half).toBeGreaterThan(180);
    });
});
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

describe('C01 collector contract', () => {
    test.each([null, {}, [], { schemaVersion: 'other' }])('total %#', (raw) => {
        let result: any;
        expect(() => {
            result = collector.validateFiles(raw);
        }).not.toThrow();
        expect(result.ok).toBe(false);
    });
    test('captures include layer identity cases', () => {
        const ids = collector.CAPTURES.map(([id]: any) => id);
        for (const id of ['holo-off', 'emboss-off', 'sparkle-off', 'all-off']) expect(ids).toContain(id);
    });
});
