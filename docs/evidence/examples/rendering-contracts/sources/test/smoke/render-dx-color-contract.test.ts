import { createAirApp, ImageAsset, Scene, TextureCube } from '../../src';
import { Format } from '../../src/cocos/gfx';
import { MipmapMode } from '../../src/cocos/asset/assets/texture-cube';
import {
    bindAirPrefilteredEnvironment,
    resolveAirTextureFormat,
    validateAirPrefilteredEnvironment,
    validateAirTextureColorContract,
} from '../../src/air/rendering/color-contract';

function cube(format = Format.RGBA8): TextureCube {
    const result = new TextureCube();
    result.mipmaps = [4, 2, 1].map((width) => {
        const image = (): ImageAsset =>
            new ImageAsset({
                width,
                height: width,
                _data: new Uint8Array(width * width * 4),
                _compressed: false,
                format,
            });
        return { right: image(), left: image(), top: image(), bottom: image(), front: image(), back: image() };
    });
    result._mipmapMode = MipmapMode.BAKED_CONVOLUTION_MAP;
    return result;
}
const contract = {
    distribution: 'ggx' as const,
    roughnessLevels: [0, 1 / 3, 2 / 3],
    encoding: 'srgb' as const,
    source: 'test synthetic GGX attestation (not a convolution proof)',
};

describe('render DX explicit color and native prefiltered environment contracts', () => {
    beforeAll(async () => {
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    test('omitted format retains native default; explicit undefined and unknown formats fail', () => {
        expect(resolveAirTextureFormat({})).toBe(Format.RGBA8);
        expect(resolveAirTextureFormat({}, Format.RGBA16F)).toBe(Format.RGBA16F);
        for (const format of [undefined, Format.UNKNOWN, -1, NaN, 9999])
            expect(() => resolveAirTextureFormat({ format } as any)).toThrow(/AIR_E_TEXTURE_FORMAT/);
    });
    test('color input can use exactly one software or hardware sRGB decode; data and depth stay linear', () => {
        expect(
            validateAirTextureColorContract({ format: Format.RGBA8, usage: 'color', decode: 'shader-srgb' }).decode,
        ).toBe('shader-srgb');
        expect(
            validateAirTextureColorContract({ format: Format.SRGB8_A8, usage: 'color', decode: 'hardware-srgb' })
                .format,
        ).toBe(Format.SRGB8_A8);
        expect(validateAirTextureColorContract({ usage: 'linear-data', decode: 'none' }).format).toBe(Format.RGBA8);
        expect(validateAirTextureColorContract({ format: Format.DEPTH, usage: 'depth', decode: 'none' }).format).toBe(
            Format.DEPTH,
        );
        for (const input of [
            { format: Format.SRGB8_A8, usage: 'color', decode: 'shader-srgb' },
            { format: Format.RGBA8, usage: 'color', decode: 'hardware-srgb' },
            { format: Format.SRGB8_A8, usage: 'linear-data', decode: 'none' },
            { format: Format.RGBA8, usage: 'linear-data', decode: 'shader-srgb' },
            { format: Format.DEPTH, usage: 'color', decode: 'none' },
            { format: Format.RGBA8, usage: 'depth', decode: 'none' },
        ])
            expect(() => validateAirTextureColorContract(input as any)).toThrow(/AIR_E_TEXTURE_COLOR/);
    });
    test('real six-face native mips accepted only with offline attestation and actual native LOD schedule', () => {
        const data = cube();
        expect(validateAirPrefilteredEnvironment(data, contract).levels).toBe(3);
        data._mipmapMode = MipmapMode.AUTO;
        expect(() => validateAirPrefilteredEnvironment(data, contract)).toThrow(/ordinary\/AUTO mipmaps/);
        data._mipmapMode = MipmapMode.BAKED_CONVOLUTION_MAP;
        expect(() => validateAirPrefilteredEnvironment(data, { ...contract, roughnessLevels: [0, 0.5, 1] })).toThrow(
            /roughness\*envmap.mipmapLevel/,
        );
        const before = data.mipmaps[1].left;
        data.mipmaps[1].left = data.mipmaps[0].left;
        expect(() => validateAirPrefilteredEnvironment(data, contract)).toThrow(/mipmaps\[1\].left/);
        data.mipmaps[1].left = before;
        expect(() => validateAirPrefilteredEnvironment(data, { ...contract, encoding: 'linear' })).toThrow(
            /custom environment shader/,
        );
        expect(() => validateAirPrefilteredEnvironment(cube(Format.SRGB8_A8), contract)).toThrow(/hardware sRGB/);
        expect(() => validateAirPrefilteredEnvironment(cube(Format.UNKNOWN), contract)).toThrow(
            /AIR_E_ENV_PREFILTER.*known native color pixel format/,
        );
    });
    test('bind validates decode macro and mip count before changing scene reflection map', () => {
        const scene = new Scene('test'),
            environment = cube(),
            reflection = cube();
        scene.globals.skybox.envmap = environment;
        expect(bindAirPrefilteredEnvironment(scene, reflection, contract).levels).toBe(3);
        expect(scene.globals.skybox.reflectionMap).toBe(reflection);
        const rgbe = cube();
        rgbe.isRGBE = true;
        expect(() => bindAirPrefilteredEnvironment(scene, rgbe, { ...contract, encoding: 'rgbe' })).toThrow(
            /envmap.isRGBE/,
        );
        expect(scene.globals.skybox.reflectionMap).toBe(reflection);
        environment.reset({ width: 4, height: 4, format: Format.RGBA8, mipmapLevel: 2 });
        expect(() => bindAirPrefilteredEnvironment(scene, reflection, contract)).toThrow(/envmap.mipmapLevel/);
        expect(scene.globals.skybox.reflectionMap).toBe(reflection);
    });
});
