import { createAirApp, EffectAsset } from '../../src';
import { Format } from '../../src/cocos/gfx';
import { validateAirTextureColorContract } from '../../src/air/rendering/color-contract';
import { createAirDepthSamplerTemplate, prepareEffectForRegistration } from '../../tools/debug/effect-layout';
import { fragmentSource } from '../fixtures/upstream-color-contract/final-source';
const reference = require('../fixtures/upstream-color-contract/reference.cjs');
const { requireDepthPrecision } = require('../../tools/verify/upstream-depth-source-audit.cjs');
const depthEffect = require('../../tools/debug/probes/rendering-contracts/depth.effect.json');

export function depthFixture(): any {
    const effect = JSON.parse(JSON.stringify(depthEffect));
    const template = createAirDepthSamplerTemplate({ name: 'sceneDepth', binding: 1, mode: 'manual-compare' });
    effect.shaders[0].glsl4.frag = effect.shaders[0].glsl4.frag.replace(
        'layout(set = 1, binding = 1) uniform sampler2D sceneDepth;',
        template.glsl4,
    );
    effect.shaders[0].glsl3.frag = effect.shaders[0].glsl3.frag.replace(
        'uniform sampler2D sceneDepth;',
        template.glsl3,
    );
    effect.shaders[0].samplerTextures[0] = template.resource;
    return prepareEffectForRegistration(effect).effect;
}

describe('U03 T12 final WebGL submission boundary and independent depth model (no GPU)', () => {
    beforeAll(async () => {
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    test('native standard shadow and spotlight declarations and function parameters remain highp after lowering', () => {
        const source = fragmentSource(EffectAsset.get('builtin-standard')!.shaders[0], { CC_RECEIVE_SHADOW: true });
        expect(
            requireDepthPrecision(source, ['cc_shadowMap', 'cc_spotShadowMap']).filter((row: any) =>
                /ShadowMap|shadowMap/.test(row.name),
            ),
        ).toHaveLength(2);
        const samplerParameters = [
            ...source.matchAll(/\w+\s*\([^\n)]*?(?:(highp|mediump|lowp)\s+)?sampler2D\s+shadowMap/g),
        ];
        expect(samplerParameters.length).toBeGreaterThan(4);
        for (const parameter of samplerParameters) expect(parameter[0]).toContain('highp sampler2D shadowMap');
    });
    test('manual depth template travels through real ProgramLib and WebGL2 shaderSource with highp intact', () => {
        const source = fragmentSource(depthFixture().shaders[0]);
        expect(requireDepthPrecision(source, ['sceneDepth']).find((row: any) => row.name === 'sceneDepth')).toEqual({
            name: 'sceneDepth',
            type: 'sampler2D',
            precision: 'highp',
            explicit: true,
        });
        expect(source).toContain('step(referenceDepth - bias, texture(sceneDepth, uv).r)');
        expect(source).not.toMatch(/layout\([^)]*(set|binding)\s*=/);
    });
    test('highp float alone cannot mask a removed/degraded depth sampler qualifier', () => {
        const source = fragmentSource(depthFixture().shaders[0]);
        expect(source).toContain('precision highp float;');
        for (const qualifier of ['', 'mediump ', 'lowp '])
            expect(() =>
                requireDepthPrecision(
                    source.replace('highp sampler2D sceneDepth', `${qualifier}sampler2D sceneDepth`),
                    ['sceneDepth'],
                ),
            ).toThrow(/DEPTH_PRECISION/);
        expect(() => requireDepthPrecision(source.slice(source.indexOf('\n') + 1), ['sceneDepth'])).toThrow(
            /FINAL_GLSL_REQUIRED/,
        );
        expect(() =>
            createAirDepthSamplerTemplate({ name: 'sceneDepth', binding: 1, mode: 'hardware-compare' }),
        ).toThrow(/DEPTH_COMPARISON_UNAVAILABLE/);
    });
    test('raw depth format and decode semantics are explicit', () => {
        for (const format of [Format.DEPTH, Format.DEPTH_STENCIL]) {
            expect(validateAirTextureColorContract({ format, usage: 'depth', decode: 'none' }).format).toBe(format);
            expect(() => validateAirTextureColorContract({ format, usage: 'depth', decode: 'shader-srgb' })).toThrow(
                /AIR_E_TEXTURE_COLOR/,
            );
        }
    });
    test.each([0.125, 0.5, 0.875])(
        'controlled depth24 at %f distinguishes comparisons finer than mediump spacing',
        (depth) => {
            const stored = Math.round(depth * (2 ** 24 - 1)) / (2 ** 24 - 1);
            const delta = 2 ** -20;
            const visible = (referenceDepth: number, bias: number) =>
                Math.fround(referenceDepth - bias) <= Math.fround(stored) ? 1 : 0;
            expect(visible(depth - delta, 0)).toBe(1);
            expect(visible(depth + delta, 0)).toBe(0);
            expect(visible(depth + delta, delta * 2)).toBe(1);
            const near = 0.1,
                far = 1000;
            expect(
                Math.abs(reference.depthAtDistance(reference.distanceAtDepth(stored, near, far), near, far) - stored),
            ).toBeLessThan(1e-12);
        },
    );
});
