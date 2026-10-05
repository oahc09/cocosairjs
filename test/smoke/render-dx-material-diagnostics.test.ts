import { createAirApp, Material, Texture2D } from '../../src';
import { BlendFactor, Format } from '../../src/cocos/gfx';
import { DescriptorSetInfo, DescriptorSetLayoutInfo } from '../../src/cocos/gfx';
import { WebGL2DescriptorSetLayout } from '../../src/cocos/gfx/webgl2/webgl2-descriptor-set-layout';
import { WebGL2DescriptorSet } from '../../src/cocos/gfx/webgl2/webgl2-descriptor-set';
import { inspectAirMaterial } from '../../src/air/rendering/material-diagnostics';

describe('render DX native material descriptor diagnostics', () => {
    beforeAll(async () => {
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    test('reads actual pass and descriptor state, not stale material properties, without mutating resources', () => {
        const material = new Material();
        material.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: true } });
        // HEADLESS EmptyDescriptorSetLayout omits descriptor indices. Use native WebGL2
        // descriptor metadata (no GL calls) so this checks real binding lookup rather than _props.
        const nativeLayout = new WebGL2DescriptorSetLayout();
        nativeLayout.initialize(new DescriptorSetLayoutInfo(material.passes[0].descriptorSet.layout.bindings));
        const nativeDescriptors = new WebGL2DescriptorSet();
        nativeDescriptors.initialize(new DescriptorSetInfo(nativeLayout));
        (material.passes[0] as any)._descriptorSet = nativeDescriptors;
        const texture = new Texture2D();
        texture.reset({ width: 4, height: 2, format: Format.RGBA8 });
        material.setProperty('mainTexture', texture);
        const pass = material.passes[0],
            target = pass.blendState.targets[0];
        pass.depthStencilState.depthWrite = false;
        target.blend = true;
        target.blendSrc = BlendFactor.SRC_ALPHA;
        target.blendDst = BlendFactor.ONE_MINUS_SRC_ALPHA;
        const snapshot = inspectAirMaterial(material);
        expect(snapshot[0].depthWrite).toBe(false);
        expect(snapshot[0].blendTargets[0]).toMatchObject({
            blend: true,
            blendSrc: BlendFactor.SRC_ALPHA,
            blendDst: BlendFactor.ONE_MINUS_SRC_ALPHA,
        });
        const binding = snapshot[0].textures.find((entry) => entry.name === 'mainTexture')!;
        expect(binding).toMatchObject({
            bound: true,
            width: 4,
            height: 2,
            format: { format: Format.RGBA8, srgb: false, depth: false },
        });
        const replacement = new Texture2D();
        replacement.reset({ width: 8, height: 8, format: Format.SRGB8_A8 });
        pass.descriptorSet.bindTexture(binding.binding, replacement.getGFXTexture()!);
        expect(material.getProperty('mainTexture')).toBe(texture);
        expect(inspectAirMaterial(material)[0].textures.find((entry) => entry.name === 'mainTexture')).toMatchObject({
            width: 8,
            format: { srgb: true },
        });
        expect(binding.width).toBe(4);
        expect(Object.isFrozen(snapshot)).toBe(true);
        expect(Object.isFrozen(binding)).toBe(true);
        expect(pass.depthStencilState.depthWrite).toBe(false);
        expect(material.getProperty('mainTexture')).toBe(texture);
    });
});
