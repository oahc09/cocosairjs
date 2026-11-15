import { WebGL2Shader } from '../../src/cocos/gfx/webgl2/webgl2-shader';
import { WebGL2DeviceManager } from '../../src/cocos/gfx/webgl2/webgl2-define';
import { ShaderInfo, UniformSamplerTexture } from '../../src/cocos/gfx/base/define';
import { assertWebGL2ContextActive } from '../../src/air/rendering/webgl2-context-health';

describe('WebGL2 loss admission', () => {
    test('rejects lost/closed contexts while a live context remains usable', () => {
        expect(() => assertWebGL2ContextActive({ isContextLost: () => false })).not.toThrow();
        for (const context of [null, { isContextLost: () => true }])
            expect(() => assertWebGL2ContextActive(context)).toThrow(
                expect.objectContaining({ code: 'WEBGL2_CONTEXT_LOST' }),
            );
    });

    test('native restoration does not re-admit stale engine resources without reload', () => {
        let lost = true;
        const context = { isContextLost: () => lost };
        expect(() => assertWebGL2ContextActive(context)).toThrow('WebGL2 context is lost or closed.');
        lost = false;
        expect(() => assertWebGL2ContextActive(context)).toThrow('WebGL2 context is lost or closed.');
        expect(() => assertWebGL2ContextActive({ isContextLost: () => false })).not.toThrow();
    });

    test('lazy compilation during loss preserves original sampler declarations', () => {
        const previous = WebGL2DeviceManager.instance;
        const info = new ShaderInfo('retained-samplers');
        info.samplerTextures = [new UniformSamplerTexture(0, 0, 'image'), new UniformSamplerTexture(0, 1, 'ids')];
        const shader = new WebGL2Shader();
        shader.initialize(info);
        const declared = (shader as any)._gpuShader.samplerTextures;
        try {
            WebGL2DeviceManager.setInstance({ gl: { isContextLost: () => true } } as any);
            expect(() => shader.gpuShader).toThrow(expect.objectContaining({ code: 'WEBGL2_CONTEXT_LOST' }));
            expect((shader as any)._gpuShader.samplerTextures).toBe(declared);
            expect(declared.map((sampler) => sampler.name)).toEqual(['image', 'ids']);
            expect(info.samplerTextures.map((sampler) => sampler.name)).toEqual(['image', 'ids']);
        } finally {
            WebGL2DeviceManager.setInstance(previous);
        }
    });
});
