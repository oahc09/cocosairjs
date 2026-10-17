import { EffectAsset, createAirApp } from '../../src';
import { createAirUnlitFogEffect } from '../../src/air/effects/unlit-fog';
import { effects } from '../../src/air/builtin/builtin-effects';
import { glsl4 } from '../../src/air/builtin/builtin-glsl4';
import { cclegacy } from '../../src/cocos/core/global-exports';
import { programLib } from '../../src/cocos/render-scene/core/program-lib';

describe('AIR accurate unlit fog specialization', () => {
    let builtin: EffectAsset;
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    beforeEach(() => {
        const index = effects.findIndex((e: any) => e.name === 'builtin-unlit');
        const json: any = JSON.parse(JSON.stringify(effects[index]));
        for (let i = 0; i < json.shaders.length; i++) {
            json.shaders[i].glsl4 = { ...glsl4[index][i] };
            json.shaders[i].glsl3 = Object.fromEntries(
                Object.entries(glsl4[index][i]).map(([stage, text]) => [
                    stage,
                    (text as string).replace(/layout\s*\([^)]*\)\s*/g, ''),
                ]),
            );
        }
        builtin = Object.assign(new EffectAsset(), json);
        EffectAsset.register(builtin);
    });
    afterEach(() => {
        EffectAsset.remove(builtin);
        builtin.destroy();
    });
    test('specializes fog variants, preserves shadow variants and keeps instance ownership independent', () => {
        const before = JSON.stringify([builtin.techniques, builtin.shaders]);
        const a = createAirUnlitFogEffect();
        const b = createAirUnlitFogEffect();
        expect(a.name).not.toBe(b.name);
        for (const [index, shader] of a.shaders.entries())
            for (const variant of ['glsl3', 'glsl4'] as const) {
                if (builtin.shaders[index].name.includes('|planar-shadow-vs:')) {
                    expect(shader[variant]).toEqual(builtin.shaders[index][variant]);
                    continue;
                }
                expect(shader[variant].vert).toContain('air_fogWorldPos = (matWorld * position).xyz');
                expect(shader[variant].frag).toContain('CC_APPLY_FOG(o, air_fogWorldPos);');
                expect(shader[variant].frag).not.toContain('CC_APPLY_FOG(o);');
                expect(shader[variant].vert).toContain('CCGetWorldMatrix');
                expect(shader[variant].vert).toContain('USE_INSTANCING');
            }
        expect(a.shaders[0].name).toBe(a.techniques[0].passes[0].program);
        expect(a.shaders[0].hash).toBe(b.shaders[0].hash);
        expect(JSON.stringify([builtin.techniques, builtin.shaders])).toBe(before);
        EffectAsset.remove(a);
        a.destroy();
        expect(EffectAsset.get(b.name)).toBe(b);
        EffectAsset.remove(b);
        b.destroy();
    });
    test('rejects incompatible builtin source before registering a partial effect', () => {
        builtin.shaders[0].glsl3.frag = 'void main() {}';
        expect(() => createAirUnlitFogEffect()).toThrow(/incompatible builtin-unlit glsl3/);
    });
    test('repeated owned assets share templates per variant and leave no deferred listener or registry growth', () => {
        const registryCount = Object.keys(EffectAsset.getAll()).length;
        const event = cclegacy.Game.EVENT_RENDERER_INITED;
        const listeners = () => cclegacy.game._callbackTable[event]?.callbackInfos.length || 0;
        const beforeListeners = listeners();
        const templates = () =>
            Object.keys((programLib as any)._templates).filter((name) => name.includes('|air-fog:'));
        for (let i = 0; i < 50; i++) {
            const effect = createAirUnlitFogEffect();
            expect(cclegacy.game.hasEventListener(event, (effect as any)._precompile, effect)).toBe(false);
            EffectAsset.remove(effect);
            effect.destroy();
        }
        expect(Object.keys(EffectAsset.getAll()).length).toBe(registryCount);
        expect(listeners()).toBe(beforeListeners);
        expect(templates().length).toBe(builtin.shaders.length);
    });
});
