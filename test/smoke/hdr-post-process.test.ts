import { airToneMap, airLinearToSRGB, normalizePostSettings } from '../../src/air/rendering/post-process-settings';
import { normalizeEffectShader } from '../../src/air/rendering/effect-json-contract';
import {
    beginAirCameraOutput,
    restoreAirCameraOutput,
    registerAirHDRCamera,
} from '../../src/air/rendering/hdr-context';
import { SubModel } from '../../src/cocos/render-scene/scene/submodel';
import { Material, createAirApp } from '../../src';
import { programLib } from '../../src/cocos/render-scene/core/program-lib';

describe('HDR post-process contracts', () => {
    test('tone curves preserve highlight distinctions above one, with one output encoding', () => {
        expect(airToneMap(1, 'aces')).toBeCloseTo(0.8037974683544302, 10);
        expect(airToneMap(4, 'aces')).toBeGreaterThan(airToneMap(1, 'aces'));
        expect(airToneMap(4, 'reinhard')).toBeCloseTo(0.8, 10);
        expect(airToneMap(2, 'reinhard', 2)).toBeCloseTo(airToneMap(4, 'reinhard'), 10);
        expect(airLinearToSRGB(0.18)).toBeCloseTo(0.4613561295, 9);
        expect(airLinearToSRGB(0)).toBe(0);
        expect(airToneMap(-1, 'aces')).toBe(0);
    });

    test('invalid options fail before altering existing settings', () => {
        const before = normalizePostSettings({ exposure: 2, bloom: { threshold: 3 } });
        const snapshot = JSON.stringify(before);
        for (const patch of [
            { exposure: NaN },
            { exposure: -1 },
            { exposure: null },
            { toneMapping: 'invalid' },
            { bloom: { scatter: 2 } },
            { bloom: { enabled: 1 } },
            { unknown: 1 },
        ]) {
            expect(() => normalizePostSettings(patch as any, before)).toThrow('AIR_E_POST_PROCESS');
        }
        expect(JSON.stringify(before)).toBe(snapshot);
        const next = normalizePostSettings({ bloom: { intensity: 1 } }, before);
        expect(next.bloom.threshold).toBe(3);
        expect(next.exposure).toBe(2);
    });

    test('legacy and surface output bridges are opt-in, idempotent, and leave fog conditions intact', () => {
        const legacy = {
            name: 'hdr-legacy',
            glsl3: { vert: '', frag: 'vec4 CCFragOutput (vec4 color) { return vec4(0.5); }' },
        };
        const a = normalizeEffectShader(legacy) as any;
        expect(a.glsl3.frag).toContain('#if CC_AIR_LINEAR_HDR\nreturn color;');
        expect((legacy as any).defines).toBeUndefined();
        expect(normalizeEffectShader(a).hash).toBe(a.hash);
        const frag =
            'vec3 HDRToLDR(vec3 c){return c;}\nvec3 LinearToSRGB(vec3 c){return c;}\n' +
            '#if !CC_USE_FLOAT_OUTPUT || CC_IS_TRANSPARENCY_PASS\nc=LinearToSRGB(HDRToLDR(c));\n#endif\n' +
            '#if CC_USE_FOG != 4 && (!CC_USE_FLOAT_OUTPUT || CC_IS_TRANSPARENCY_PASS)\nfog();\n#endif';
        const b = normalizeEffectShader({ name: 'hdr-surface', glsl3: { vert: '', frag } }) as any;
        expect(b.glsl3.frag).toContain('#if (!CC_USE_FLOAT_OUTPUT || CC_IS_TRANSPARENCY_PASS) && !CC_AIR_LINEAR_HDR');
        expect(b.glsl3.frag).toContain('#if CC_USE_FOG != 4 && (!CC_USE_FLOAT_OUTPUT || CC_IS_TRANSPARENCY_PASS)');
    });

    test('camera output scope isolates other cameras and caches variants outside the frame hot path', () => {
        const camera = {},
            other = {},
            sub = new SubModel() as any;
        const base = {},
            hdr = {},
            compile = jest.fn(() => hdr);
        sub._shaders = [base];
        sub._passes = [{ getShaderVariant: compile }];
        registerAirHDRCamera(camera, true);
        const previous = beginAirCameraOutput(camera);
        try {
            expect(sub.shaders).toEqual([hdr]);
            expect(sub.shaders).toEqual([hdr]);
            expect(compile).toHaveBeenCalledTimes(1);
            const outer = beginAirCameraOutput(other);
            try {
                expect(sub.shaders).toEqual([base]);
            } finally {
                restoreAirCameraOutput(outer);
            }
            sub._shaders[0] = {};
            expect(sub.shaders).toEqual([hdr]);
            expect(compile).toHaveBeenCalledTimes(2);
        } finally {
            restoreAirCameraOutput(previous);
            registerAirHDRCamera(camera, false);
        }
        expect(sub.shaders).toEqual([sub._shaders[0]]);
    });
});

describe('native macro patch restoration', () => {
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    test('temporary HDR patches restore pre-existing values even on shader failure', () => {
        const material = new Material();
        material.initialize({ effectName: 'builtin-unlit', defines: { CC_AIR_LINEAR_HDR: false } });
        const pass = material.passes[0],
            before = { ...pass.defines };
        const get = jest.spyOn(programLib, 'getGFXShader').mockImplementation(() => {
            throw new Error('injected compile failure');
        });
        try {
            expect(() => pass.getShaderVariant([{ name: 'CC_AIR_LINEAR_HDR', value: true }])).toThrow(
                'injected compile failure',
            );
            expect(pass.defines).toEqual(before);
        } finally {
            get.mockRestore();
            material.destroy();
        }
    });
});
