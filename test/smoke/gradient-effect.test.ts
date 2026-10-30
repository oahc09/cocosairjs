import { createAirApp, Material, Vec4, EffectAsset, gfx } from '../../src';
import { createAirGradientEffect } from '../../src/air/effects/gradient';
import { cclegacy } from '../../src/cocos/core/global-exports';
import { programLib } from '../../src/cocos/render-scene/core/program-lib';

// These are CPU/HEADLESS API and layout tests, not evidence of GPU compilation.
describe('AIR local-Y gradient effect', () => {
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });

    function dispose(effect: EffectAsset, material?: Material): void {
        material?.destroy();
        EffectAsset.remove(effect);
        effect.destroy();
    }

    test('returns native independently owned assets with stable shader identities', () => {
        const a = createAirGradientEffect();
        const b = createAirGradientEffect();
        expect(a).toBeInstanceOf(EffectAsset);
        expect(a.name).not.toBe(b.name);
        expect(a.shaders[0].name).toBe(b.shaders[0].name);
        expect(a.shaders[0].hash).toBe(b.shaders[0].hash);
        expect(a.techniques[0].passes[0].program).toBe(a.shaders[0].name);
        a.techniques[0].passes[0].properties!.topColor.value = [0, 1, 0, 1];
        expect(b.techniques[0].passes[0].properties!.topColor.value).toEqual([1, 0, 0, 1]);
        dispose(a);
        expect(EffectAsset.get(b.name)).toBe(b);
        dispose(b);
    });

    test('native material properties update all packed channels independently', () => {
        const effect = createAirGradientEffect();
        const material = new Material();
        material.initialize({ effectAsset: effect, defines: { AIR_GRADIENT_UNLIT: true } });
        const pass = material.passes[0];
        const read = (): Vec4 => {
            const out = new Vec4();
            pass.getUniform(pass.getHandle('gradient'), out);
            return out;
        };
        expect(read()).toEqual(new Vec4(0, 1, 1, 1));
        material.setProperty('offset', 0.5);
        material.setProperty('scale', -2);
        material.setProperty('smoothness', 12);
        material.setProperty('alpha', 0.25);
        expect(read()).toEqual(new Vec4(0.5, -2, 12, 0.25));
        const color = new Vec4(0.1, 0.2, 0.3, 0.4);
        material.setProperty('topColor', color);
        const out = new Vec4();
        pass.getUniform(pass.getHandle('topColor'), out);
        expect(out.x).toBeCloseTo(color.x);
        expect(out.w).toBeCloseTo(color.w);
        dispose(effect, material);
    });

    test('shared effects do not share material uniforms and invalid writes are atomic', () => {
        const effect = createAirGradientEffect();
        const a = new Material();
        const b = new Material();
        a.initialize({ effectAsset: effect });
        b.initialize({ effectAsset: effect });
        a.setProperty('offset', 0.5);
        b.copy(a);
        b.setProperty('offset', -0.25);
        expect(a.getProperty('offset')).toBe(0.5);
        expect(b.getProperty('offset')).toBe(-0.25);
        for (const invalid of [NaN, Infinity, -Infinity, 1e40]) {
            expect(() => a.setProperty('offset', invalid)).toThrow();
            expect(a.getProperty('offset')).toBe(0.5);
            expect(() => a.setProperty('topColor', new Vec4(invalid, 0, 0, 1))).toThrow();
        }
        const packed = new Vec4();
        a.passes[0].getUniform(a.passes[0].getHandle('gradient'), packed);
        expect(packed.x).toBe(0.5);
        b.passes[0].getUniform(b.passes[0].getHandle('gradient'), packed);
        expect(packed.x).toBe(-0.25);
        a.destroy();
        dispose(effect, b);
    });

    test('selects explicit opaque or straight-alpha state without runtime overrides', () => {
        const effect = createAirGradientEffect();
        for (const technique of [0, 1]) {
            const material = new Material();
            material.initialize({ effectAsset: effect, technique });
            const pass = material.passes[0];
            expect(pass.depthStencilState.depthWrite).toBe(technique === 0);
            expect(pass.blendState.targets[0].blend).toBe(technique === 1);
            expect(pass.blendState.targets[0].blendSrc).toBe(gfx.BlendFactor.SRC_ALPHA);
            expect(pass.blendState.targets[0].blendDst).toBe(gfx.BlendFactor.ONE_MINUS_SRC_ALPHA);
            expect(pass.blendState.targets[0].blendSrcAlpha).toBe(gfx.BlendFactor.ONE);
            material.destroy();
        }
        dispose(effect);
    });

    test('matches std140/native block order and keeps response calculation per fragment', () => {
        const effect = createAirGradientEffect();
        const shader = effect.shaders[0];
        expect(shader.blocks[0].members.map((member) => [member.name, member.type, member.count])).toEqual([
            ['topColor', gfx.Type.FLOAT4, 1],
            ['bottomColor', gfx.Type.FLOAT4, 1],
            ['gradient', gfx.Type.FLOAT4, 1],
        ]);
        for (const variant of ['glsl3', 'glsl4'] as const) {
            expect(shader[variant].vert).toContain('v_gradientY = a_position.y');
            expect(shader[variant].vert).not.toContain('pow(');
            expect(shader[variant].frag).toContain('pow(height, max(gradient.z, 0.01))');
            expect(shader[variant].frag).toContain('mix(bottomColor, topColor, weight)');
            expect(shader[variant].frag).toContain('clamp(color.a * gradient.w, 0.0, 1.0)');
            expect(shader[variant].frag).toContain('cc_ambientSky.w');
            expect(shader[variant].frag).toContain('cc_mainLitColor.w');
        }
        expect(shader.glsl3.vert).not.toMatch(/layout\s*\(/);
        expect(shader.glsl4.vert).toContain('layout(set = 2, binding = 0)');
        dispose(effect);
    });

    test('repeated create/remove leaves no effect registry, callback or program template growth', () => {
        const warm = createAirGradientEffect();
        dispose(warm);
        const registryCount = Object.keys(EffectAsset.getAll()).length;
        const templateCount = Object.keys((programLib as any)._templates).length;
        const event = cclegacy.Game.EVENT_RENDERER_INITED;
        for (let i = 0; i < 25; i++) {
            const effect = createAirGradientEffect();
            expect(cclegacy.game.hasEventListener(event, (effect as any)._precompile, effect)).toBe(false);
            dispose(effect);
        }
        expect(Object.keys(EffectAsset.getAll()).length).toBe(registryCount);
        expect(Object.keys((programLib as any)._templates).length).toBe(templateCount);
    });
});
