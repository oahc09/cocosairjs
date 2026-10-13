import {
    ShaderInfo,
    ShaderStage,
    ShaderStageFlagBit,
    UniformBlock,
    UniformSamplerTexture,
} from '../../src/cocos/gfx/base/define';
import { WebGL2Shader } from '../../src/cocos/gfx/webgl2/webgl2-shader';

describe('WebGL2 shader input diagnostics', () => {
    test('rejects an extra version before replacing initialized state', () => {
        const shader = new WebGL2Shader();
        shader.initialize(new ShaderInfo('valid'));
        expect(() =>
            shader.initialize(
                new ShaderInfo('bad-version', [
                    new ShaderStage(ShaderStageFlagBit.VERTEX, '#version 300 es\nvoid main() {}'),
                ]),
            ),
        ).toThrow(expect.objectContaining({ code: 'WEBGL2_SHADER_VERSION', shader: 'bad-version' }));
        expect(shader.name).toBe('valid');
    });

    test('rejects a block and sampler sharing a logical descriptor binding', () => {
        const info = new ShaderInfo('bad-binding');
        info.blocks = [new UniformBlock(1, 0, 'Constants')];
        info.samplerTextures = [new UniformSamplerTexture(1, 0, 'image')];
        expect(() => new WebGL2Shader().initialize(info)).toThrow(
            expect.objectContaining({ code: 'WEBGL2_SHADER_BINDING_CONFLICT' }),
        );
    });

    test('accepts comments mentioning version and equal bindings in different sets', () => {
        const info = new ShaderInfo('valid', [
            new ShaderStage(ShaderStageFlagBit.VERTEX, '/* #version 300 es */\n// #version 300 es\nvoid main() {}'),
        ]);
        info.blocks = [new UniformBlock(0, 0, 'Global')];
        info.samplerTextures = [new UniformSamplerTexture(1, 0, 'image')];
        expect(() => new WebGL2Shader().initialize(info)).not.toThrow();
    });
});
