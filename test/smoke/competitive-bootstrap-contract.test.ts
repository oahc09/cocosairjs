import { createAirApp, EffectAsset, Material, Node, Camera, Layers } from '../../src';
import { effects } from '../../src/air/builtin/builtin-effects';
import { CCObject } from '../../src/cocos/core/data/object';

describe('competitive bootstrap contract', () => {
    // This HEADLESS test covers metadata and renderer timing. The former FULL Web enableEffectImport
    // capabilities TypeError is regressed separately by tools/verify/competitive-early-effect-browser.cjs.
    test('early effect registration remains legal; material creation before renderer gives a diagnostic', async () => {
        const data = JSON.parse(JSON.stringify(effects.find((effect) => effect.name === 'builtin-unlit')));
        const effect = Object.assign(new EffectAsset(), data);
        effect.name = 'competitive-early-registration';
        // Distinct program names keep this pre-device fixture out of builtin shader-template caches.
        const programNames = new Map<string, string>();
        effect.shaders.forEach((shader) => {
            const previous = shader.name;
            shader.name += '|competitive-early';
            // Renaming changes shader identity; let the normalizer derive its content hash.
            Reflect.deleteProperty(shader, 'hash');
            programNames.set(previous, shader.name);
        });
        effect.techniques.forEach((technique) =>
            technique.passes.forEach((pass) => {
                pass.program = programNames.get(pass.program)!;
            }),
        );
        const precompile = jest.spyOn(effect as any, '_precompile').mockImplementation(() => {});
        expect(() => effect.onLoaded()).not.toThrow();
        expect(EffectAsset.get(effect.name)).toBe(effect);
        expect(precompile).not.toHaveBeenCalled();
        const early = new Material();
        expect(() => early.initialize({ effectAsset: effect })).toThrow('AIR_E_MATERIAL_NOT_READY');
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
        expect(precompile).toHaveBeenCalledTimes(1);
        const material = new Material();
        expect(() => material.initialize({ effectName: 'builtin-unlit' })).not.toThrow();
        expect(material.passes.length).toBeGreaterThan(0);
        early.destroy();
        material.destroy();
        effect.destroy();
        precompile.mockRestore();
        CCObject._deferredDestroy();
    });

    test('new native cameras include the DEFAULT render layer without manual visibility assignment', () => {
        const node = new Node('camera-default-mask');
        const camera = node.addComponent(Camera);
        expect(camera.visibility & Layers.Enum.DEFAULT).toBe(Layers.Enum.DEFAULT);
        node.destroy();
        CCObject._deferredDestroy();
    });
});
