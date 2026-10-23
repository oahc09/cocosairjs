import { readFileSync } from 'node:fs';
import { createAirApp, EffectAsset, Scene } from '../../src';
import { Format } from '../../src/cocos/gfx';
import { Camera as RenderCamera } from '../../src/cocos/render-scene/scene/camera';
import { validateAirTextureColorContract } from '../../src/air/rendering/color-contract';
import { fragmentSource } from '../fixtures/upstream-color-contract/final-source';
const reference = require('../fixtures/upstream-color-contract/reference.cjs');
const frozen = require('../fixtures/upstream-color-contract/vectors.json');
const manifest = require('../../ai/ledgers/upstream-update/acceptance-manifest.json');

function controlledFloat(value: number): number {
    const f = Math.fround;
    const x = f(Math.min(f(value), 8));
    const numerator = f(x * f(f(f(2.51) * x) + f(0.03)));
    const denominator = f(f(x * f(f(f(2.43) * x) + f(0.59))) + f(0.14));
    return f(Math.sqrt(f(numerator / denominator)));
}

describe('U03 T10/T11 independent color reference and submitted-source contract (not GPU evidence)', () => {
    beforeAll(async () => {
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    test('frozen thresholds and vector identities remain independent of production', () => {
        expect(frozen.cpuAbsoluteError).toBe(manifest.thresholds.cpuAbsoluteError);
        expect(frozen.rgba8AbsoluteError).toBe(manifest.thresholds.rgba8FlatRoiAbsoluteError);
        expect(frozen.vectors.map((v: any) => v.id)).toEqual([
            'black',
            'gray18',
            'white',
            'hdr2',
            'hdr4',
            'cap8',
            'above-cap',
            'red',
            'green',
            'blue',
            'mixed',
            'tiny',
        ]);
        const source = readFileSync('test/fixtures/upstream-color-contract/reference.cjs', 'utf8');
        expect(source).not.toMatch(/require\(|import\s|builtin-glsl|color-contract\.ts/);
        expect(frozen.inputMatrix).toBe('identity');
        expect(frozen.outputMatrix).toBe('identity');
    });
    test.each(frozen.vectors as { id: string; rgba: number[]; encoded: number[]; rgba8: number[] }[])(
        '$id: decimal golden, double oracle and controlled float obey frozen bounds',
        (vector: any) => {
            const actual = reference.output(vector.rgba);
            actual.forEach((value: number, i: number) =>
                expect(Math.abs(value - vector.encoded[i])).toBeLessThan(1e-14),
            );
            vector.rgba
                .slice(0, 3)
                .forEach((value: number, i: number) =>
                    expect(Math.abs(controlledFloat(value) - vector.encoded[i])).toBeLessThanOrEqual(
                        frozen.cpuAbsoluteError,
                    ),
                );
            expect(actual.map((value: number) => Math.round(reference.clamp(value) * 255))).toEqual(vector.rgba8);
            expect(actual[3]).toBe(vector.rgba[3]);
        },
    );
    test('Cocos defaults, cap, complete scalar operator and encoding survive final WebGL source generation', () => {
        expect(new Scene('tone-default').globals.postSettings.toneMappingType).toBe(0);
        const shader = EffectAsset.get('builtin-unlit')!.shaders[0];
        const source = fragmentSource(shader, {
            CC_USE_HDR: true,
            CC_TONE_MAPPING_TYPE: 0,
            CC_USE_FLOAT_OUTPUT: false,
        });
        expect(source).toContain('#define CC_USE_HDR 1');
        expect(source).toContain('#define CC_TONE_MAPPING_TYPE 0');
        expect(source).toContain('#define TONE_MAPPING_ACES 0');
        expect(source).toContain('#if CC_USE_HDR && CC_TONE_MAPPING_TYPE == TONE_MAPPING_ACES');
        expect(source).toContain('color = min(color, vec3(8.0));');
        for (const value of ['A = 2.51', 'B = 0.03', 'C = 2.43', 'D = 0.59', 'E = 0.14'])
            expect(source).toContain(value);
        expect(source).toContain('(color * (A * color + B)) / (color * (C * color + D) + E)');
        expect(source).toContain('return gamma * gamma;');
        expect(source).toContain('return sqrt(linear);');
        expect(source).not.toContain('0.983729'); // three.js matrix ACES is not the selected operator.
        expect(source).not.toMatch(/layout\([^)]*(set|binding)\s*=/);
    });
    test('exposure is an upstream lighting input, not another multiplier in CCFragOutput', () => {
        const standard = fragmentSource(EffectAsset.get('builtin-standard')!.shaders[0], { CC_USE_HDR: true });
        expect(standard).toContain('result *= cc_exposure.w * cc_exposure.x;');
        expect(RenderCamera.standardExposureValue).toBe(1 / 38400);
        expect(reference.cameraExposure(16, 1 / 125, 100) / RenderCamera.standardExposureValue).toBeCloseTo(
            0.9999996,
            12,
        );
        expect(reference.cameraExposure(16, 1 / 125, 200) / reference.cameraExposure(16, 1 / 125, 100)).toBe(2);
        const unlit = fragmentSource(EffectAsset.get('builtin-unlit')!.shaders[0]);
        const output = unlit.slice(unlit.indexOf('vec4 CCFragOutput'), unlit.indexOf('uniform CCGlobal'));
        expect(output).not.toContain('cc_exposure');
        expect(reference.output([4, 0.18, 0.001, 0.5], { floatOutput: true })).toEqual([4, 0.18, 0.001, 0.5]);
        expect(reference.output([0.25, 1, 4, 0.5], { hdr: false })).toEqual([0.5, 1, 2, 0.5]);
        expect(reference.output([0.25, 1, 4, 0.5], { toneMapping: 'linear' })).toEqual([0.5, 1, 2, 0.5]);
    });
    test.each(['normal', 'roughness', 'metallic', 'occlusion'])('%s bytes remain linear data', () => {
        expect(validateAirTextureColorContract({ format: Format.RGBA8, usage: 'linear-data', decode: 'none' })).toEqual(
            { format: Format.RGBA8, usage: 'linear-data', decode: 'none' },
        );
        for (const decode of ['shader-srgb', 'hardware-srgb'] as const)
            expect(() =>
                validateAirTextureColorContract({ format: Format.RGBA8, usage: 'linear-data', decode }),
            ).toThrow(/AIR_E_TEXTURE_COLOR/);
        expect(reference.decodeRGBA([0.5, 0.25, 0.75, 0.4], 'none')).toEqual([0.5, 0.25, 0.75, 0.4]);
    });
    test('hardware IEC sRGB and existing gamma-square shader decode differ; neither decodes alpha', () => {
        const rgba = [0.5, 0.25, 0.75, 0.4];
        const hardware = reference.decodeRGBA(rgba, 'hardware-srgb');
        const software = reference.decodeRGBA(rgba, 'shader-srgb');
        expect(hardware[0]).toBeCloseTo(0.21404114048223255, 14);
        expect(software).toEqual([0.25, 0.0625, 0.5625, 0.4]);
        expect(hardware[3]).toBe(0.4);
        expect(Math.abs(hardware[0] - software[0])).toBeGreaterThan(frozen.rgba8AbsoluteError);
        expect(() =>
            validateAirTextureColorContract({ format: Format.SRGB8_A8, usage: 'color', decode: 'shader-srgb' }),
        ).toThrow(/already decodes RGB/);
        expect(
            validateAirTextureColorContract({ format: Format.SRGB8_A8, usage: 'color', decode: 'hardware-srgb' })
                .decode,
        ).toBe('hardware-srgb');
        expect(reference.srgbEncode(reference.srgbDecode(0.5))).toBeCloseTo(0.5, 14);
    });
    test('linear straight and premultiplied source-over agree only when RGB is premultiplied after decode', () => {
        const source = reference.decodeRGBA([0.5, 0.25, 0.75, 0.4], 'hardware-srgb');
        const background = [0.1, 0.2, 0.3, 0.8];
        const premultiplied = source.map((value: number, i: number) => (i === 3 ? value : value * source[3]));
        expect(reference.sourceOver(source, background)).toEqual(reference.sourceOver(premultiplied, background, true));
        expect(reference.sourceOver(source, background)[3]).toBeCloseTo(0.88, 14);
        const wrong = reference.decodeRGBA([0.2, 0.1, 0.3, 0.4], 'hardware-srgb');
        expect(Math.abs(wrong[0] - premultiplied[0])).toBeGreaterThan(0.04);
    });
});
