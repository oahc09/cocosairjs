import { effectDefinition } from '../../examples/shader-liquid-metal/src/effect.generated';

const collector = require('../../tools/verify/shaders-liquid-metal-browser.cjs');
const decode = (byte: number) => {
    const c = byte / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

describe('E07 independent implementation review (NODE_CONTRACT)', () => {
    test.each([
        ['dark', [20, 20, 20]],
        ['light', [238, 240, 246]],
    ])('%s ramp constants are the declared sRGB colors decoded once', (name, bytes) => {
        const fragment = effectDefinition.shaders[0].glsl3.frag;
        const declaration = fragment.match(new RegExp(`vec3\\s+${name}\\s*=\\s*vec3\\(([^)]+)\\)`));
        expect(declaration).not.toBeNull();
        const actual = declaration![1].split(',').map(Number);
        expect(actual).toHaveLength(3);
        for (const [i, byte] of (bytes as number[]).entries()) {
            expect(Number.isFinite(actual[i])).toBe(true);
            expect(Math.abs(actual[i] - decode(byte))).toBeLessThan(1e-6);
        }
    });

    test('frozen performance plan measures both actual quality tiers for every profile', () => {
        const plan = collector.PERFORMANCE_PLAN;
        expect(Array.isArray(plan)).toBe(true);
        expect(plan).toHaveLength(6);
        const tuples = plan.map((row: any) => `${row.profile.id}/${row.quality}`).sort();
        expect(tuples).toEqual(['720p', '1080p', 'mobile-dpr'].flatMap((id) => [`${id}/high`, `${id}/low`]).sort());
    });
});
