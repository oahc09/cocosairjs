import { Texture2D } from '../../src/cocos/asset/assets/texture-2d';
import { TextureBase } from '../../src/cocos/asset/assets/texture-base';
import { ImageAsset } from '../../src/cocos/asset/assets/image-asset';
import { PixelFormat, TextureFilter } from '../../src/cocos/asset/assets/asset-enum';
import { API, TextureFlagBit } from '../../src/cocos/gfx/base/define';
import {
    WebGL2CmdFuncCopyBuffersToTexture,
    WebGL2CmdFuncCopyTexImagesToTexture,
} from '../../src/cocos/gfx/webgl2/webgl2-commands';

// Native assets and upload commands, with only the GFX device/GL boundary substituted.
// No pixel simulation: these tests prove submitted bytes, allocation and command order, not GPU output.
function setup() {
    const resources: any[] = [];
    const gl = { bindTexture: jest.fn(), texSubImage2D: jest.fn(), generateMipmap: jest.fn() };
    const cache = { glTexUnits: [{ glTexture: null }], texUnit: 0 };
    const device: any = {
        gfxAPI: API.WEBGL2,
        gl,
        getStateCache: () => cache,
        getSampler: jest.fn(() => ({})),
        createTexture: jest.fn((info: any) => {
            const resource = {
                ...info,
                glTarget: 0x0de1,
                glTexture: {},
                glInternalFmt: 0x8058,
                glFormat: 0x1908,
                glType: 0x1401,
                destroy: jest.fn(),
            };
            if (!info.texture) resources.push(resource);
            return resource;
        }),
        copyBuffersToTexture: jest.fn((buffers, texture, regions) =>
            WebGL2CmdFuncCopyBuffersToTexture(device, buffers, texture, regions),
        ),
        copyTexImagesToTexture: jest.fn((images, texture, regions) =>
            WebGL2CmdFuncCopyTexImagesToTexture(device, images, texture, regions),
        ),
    };
    jest.spyOn(TextureBase.prototype as any, '_getGFXDevice').mockReturnValue(device);
    const texture = new Texture2D();
    return { texture, device, gl, resources };
}

function memoryImage(size: number, value: number): ImageAsset {
    return new ImageAsset({
        width: size,
        height: size,
        format: PixelFormat.RGBA8888,
        _compressed: false,
        _data: new Uint8Array(size * size * 4).fill(value),
    });
}

function canvasImage(size: number): ImageAsset {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    return new ImageAsset(canvas);
}

function packedImage(): ImageAsset {
    const data = new Uint8Array(84);
    data.fill(11, 0, 64);
    data.fill(22, 64, 80);
    data.fill(33, 80);
    return new ImageAsset({
        width: 4,
        height: 4,
        format: PixelFormat.RGBA8888,
        _compressed: false,
        _data: data,
        mipmapLevelDataSize: [64, 16, 4],
    });
}

function expectExplicit({ texture, gl, resources }: ReturnType<typeof setup>, count = 3) {
    expect(texture.mipmapLevel).toBe(count);
    expect(resources[0].levelCount).toBe(count);
    expect(resources[0].flags & TextureFlagBit.GEN_MIPMAP).toBe(0);
    expect(gl.generateMipmap).not.toHaveBeenCalled();
    expect(gl.texSubImage2D.mock.calls.map((call) => call[1])).toEqual(
        Array.from({ length: count }, (_, level) => level),
    );
}

afterEach(() => jest.restoreAllMocks());

describe('Texture2D explicit mip uploads', () => {
    it.each(['before', 'after'] as const)(
        'preserves buffer mip bytes with LINEAR configured %s assignment',
        (order) => {
            const state = setup();
            if (order === 'before') state.texture.setMipFilter(TextureFilter.LINEAR);
            state.texture.mipmaps = [memoryImage(4, 11), memoryImage(2, 22), memoryImage(1, 33)];
            if (order === 'after') state.texture.setMipFilter(TextureFilter.LINEAR);
            expectExplicit(state);
            expect(state.device.copyBuffersToTexture).toHaveBeenCalledTimes(3);
            expect(state.gl.texSubImage2D.mock.calls.map((call) => [...call[8]])).toEqual([
                Array(64).fill(11),
                Array(16).fill(22),
                Array(4).fill(33),
            ]);
        },
    );

    it.each(['before', 'after'] as const)('preserves DOM image mips with LINEAR configured %s assignment', (order) => {
        const state = setup();
        const images = [canvasImage(4), canvasImage(2), canvasImage(1)];
        if (order === 'before') state.texture.setMipFilter(TextureFilter.LINEAR);
        state.texture.mipmaps = images;
        if (order === 'after') state.texture.setMipFilter(TextureFilter.LINEAR);
        expectExplicit(state);
        expect(state.device.copyTexImagesToTexture).toHaveBeenCalledTimes(3);
        expect(state.gl.texSubImage2D.mock.calls.map((call) => call[6])).toEqual(images.map((image) => image.data));
    });

    it('preserves multiple levels extracted from a single ImageAsset', () => {
        const state = setup();
        state.texture.setMipFilter(TextureFilter.LINEAR);
        state.texture.image = packedImage();
        expectExplicit(state);
        expect(state.gl.texSubImage2D.mock.calls.map((call) => [...call[8]])).toEqual([
            Array(64).fill(11),
            Array(16).fill(22),
            Array(4).fill(33),
        ]);
    });

    it('preserves an explicitly allocated partial chain and direct buffer uploads', () => {
        const state = setup();
        state.texture.setMipFilter(TextureFilter.LINEAR);
        state.texture.reset({ width: 4, height: 4, mipmapLevel: 2 });
        state.texture.uploadData(new Uint8Array(64).fill(11), 0);
        state.texture.uploadData(new Uint8Array(16).fill(22), 1);
        expectExplicit(state, 2);
    });

    it.each(['buffer', 'image'] as const)('retains automatic generation for a single base %s', (kind) => {
        const state = setup();
        state.texture.setMipFilter(TextureFilter.LINEAR);
        state.texture.image = kind === 'buffer' ? memoryImage(4, 11) : canvasImage(4);
        expect(state.resources[0].flags & TextureFlagBit.GEN_MIPMAP).not.toBe(0);
        expect(state.texture.mipmapLevel).toBe(3);
        expect(state.gl.generateMipmap).toHaveBeenCalledTimes(1);
        expect(state.gl.texSubImage2D).toHaveBeenCalledTimes(1);
    });

    it('switches between explicit and automatic chains without retaining the previous generation flag', () => {
        const state = setup();
        state.texture.setMipFilter(TextureFilter.LINEAR);
        state.texture.image = memoryImage(4, 11);
        state.texture.mipmaps = [memoryImage(4, 11), memoryImage(2, 22), memoryImage(1, 33)];
        state.texture.image = memoryImage(4, 44);
        expect(state.resources.map((resource) => Boolean(resource.flags & TextureFlagBit.GEN_MIPMAP))).toEqual([
            true,
            false,
            true,
        ]);
        expect(state.gl.generateMipmap).toHaveBeenCalledTimes(2);
    });
});
