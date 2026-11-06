import { airToneMap, airLinearToSRGB, normalizePostSettings } from '../../src/air/rendering/post-process-settings';
import { normalizeEffectShader } from '../../src/air/rendering/effect-json-contract';
import {
    beginAirCameraOutput,
    restoreAirCameraOutput,
    registerAirHDRCamera,
} from '../../src/air/rendering/hdr-context';
import { SubModel } from '../../src/cocos/render-scene/scene/submodel';
import { Material, EffectAsset, createAirApp } from '../../src';
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
        expect(a.glsl3.frag).toContain('#endif\n return vec4(0.5);');
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

    test('stock skybox direct output preserves linear HDR in both shader dialects only when opted in', () => {
        const frag = [
            'precision mediump float;',
            'vec4 frag() {',
            'vec4 color = vec4(c * cc_ambientSky.w, 1.0);',
            '#if CC_USE_RGBE_OUTPUT',
            'color = packRGBE(color.rgb);',
            '#else',
            'color.rgb = HDRToLDR(color.rgb);',
            'color.rgb = LinearToSRGB(color.rgb);',
            '#endif',
            'return color;',
            '}',
        ].join('\n');
        const source = { name: 'hdr-skybox', glsl3: { vert: '', frag }, glsl4: { vert: '', frag } };
        const result = normalizeEffectShader(source) as any;
        for (const dialect of ['glsl3', 'glsl4']) {
            expect(result[dialect].frag).toContain(
                'vec4 color = vec4(c * cc_ambientSky.w, 1.0);\n#if CC_AIR_LINEAR_HDR\nreturn color;\n#endif\n#if CC_USE_RGBE_OUTPUT',
            );
            expect(result[dialect].frag).toContain(
                'precision mediump float;\n#if CC_AIR_LINEAR_HDR\nprecision highp float;\nprecision highp sampler2D;\nprecision highp samplerCube;\n#endif',
            );
            expect(result[dialect].frag).toContain('color.rgb = HDRToLDR(color.rgb);');
            expect(result[dialect].frag).toContain('color.rgb = LinearToSRGB(color.rgb);');
            expect(source[dialect as 'glsl3'].frag).toBe(frag);
        }
        expect(result.defines).toEqual([{ name: 'CC_AIR_LINEAR_HDR', type: 'boolean' }]);
        const repeated = normalizeEffectShader(result) as any;
        expect(repeated.hash).toBe(result.hash);
        expect(repeated.glsl3.frag).toBe(result.glsl3.frag);
        expect(repeated.glsl4.frag).toBe(result.glsl4.frag);
        // An effect pre-normalized by an older SDK may already contain a bridge in
        // its unused CCFragOutput helper, but still lack the direct skybox bridge.
        const older = '#if CC_AIR_LINEAR_HDR\n// pre-existing helper bridge\n#endif\n' + frag;
        const upgraded = normalizeEffectShader({
            name: 'older-skybox',
            hash: 137,
            defines: [{ name: 'CC_AIR_LINEAR_HDR', type: 'boolean' }],
            glsl3: { vert: '', frag: older },
        }) as any;
        expect(upgraded.hash).toBe(137); // Explicit caller hashes retain their existing contract.
        expect(upgraded.glsl3.frag).toContain(result.glsl3.frag);
        expect(upgraded.defines).toEqual([{ name: 'CC_AIR_LINEAR_HDR', type: 'boolean' }]);
        const precisionBlock =
            '#if CC_AIR_LINEAR_HDR\nprecision highp float;\nprecision highp sampler2D;\nprecision highp samplerCube;\n#endif';
        const directOnly = {
            ...result,
            glsl3: { ...result.glsl3, frag: result.glsl3.frag.replace(precisionBlock, '') },
        };
        expect((normalizeEffectShader(directOnly) as any).glsl3.frag).toContain(precisionBlock);
        const differentOutput = frag.replace('CC_USE_RGBE_OUTPUT', 'CUSTOM_OUTPUT');
        expect(
            (normalizeEffectShader({ name: 'other-output', glsl3: { vert: '', frag: differentOutput } }) as any).glsl3
                .frag,
        ).toBe(differentOutput);
        const unrelated = frag.replace('c * cc_ambientSky.w', 'c * customExposure');
        const untouched = normalizeEffectShader({ name: 'other-rgbe', glsl3: { vert: '', frag: unrelated } }) as any;
        expect(untouched.glsl3.frag).toBe(unrelated);
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
    test('the registered shipped skybox contains the direct HDR output bridge in both dialects', () => {
        const skybox = EffectAsset.get('pipeline/skybox');
        expect(skybox).toBeTruthy();
        const shader = skybox!.shaders[0];
        for (const dialect of ['glsl3', 'glsl4'] as const) {
            expect(shader[dialect].frag).toContain('precision highp samplerCube;');
            expect(shader[dialect].frag).toMatch(
                /vec4\s+color\s*=\s*vec4\(c\s*\*\s*cc_ambientSky\.w,\s*1\.0\);\s*#if CC_AIR_LINEAR_HDR\nreturn color;\n#endif\n#if CC_USE_RGBE_OUTPUT/,
            );
        }
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
