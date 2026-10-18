import { Color, Vec4 } from '../../src/cocos/core/math';
import { Camera } from '../../src/cocos/misc/camera-component';
import { EffectAsset, Material } from '../../src';
import { Node } from '../../src/cocos/scene-graph/node';
import { Scene } from '../../src/cocos/scene-graph/scene';
import { ShaderStageFlagBit, Type } from '../../src/cocos/gfx';
import { createAirApp } from '../../src';
import { createAirScreenEffect } from '../../src/air/rendering/screen-effect';
import { AIR_SCREEN_PASS_LAYER, createAirScreenPass } from '../../src/air/rendering/screen-pass';
import { attachAirVignette } from '../../src/air/effects/vignette';
import { attachAirBloom } from '../../src/air/effects/bloom';

/**
 * Headless coverage for the full-screen pass stack. The jsdom device is not WebGL2, so
 * `createAirRenderTarget` — and therefore every pass — is expected to fail here. What this suite
 * can still prove is the assembled effect surface (source, layout, properties, material handles)
 * and the "validate first, never leak on any failure" contract. Pixel behaviour is proven by the
 * browser gate, not by this file.
 */
describe('AIR full-screen effect stack', () => {
    const owned: EffectAsset[] = [];
    let app: Awaited<ReturnType<typeof createAirApp>>;
    let camera: Camera;

    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });

    afterAll(async () => {
        await app.close?.();
    });

    beforeEach(() => {
        // `Node._scene` only propagates once the scene is the running one, and the pass reads
        // `camera.node.scene` to place its quad.
        const scene = new Scene('screen-pass-scene');
        const cameraNode = new Node('source-camera');
        scene.addChild(cameraNode);
        app.run(scene);
        camera = cameraNode.addComponent(Camera);
        camera.visibility = 1;
        camera.rect.set(0, 0, 1, 1);
    });

    afterEach(() => {
        while (owned.length) {
            const effect = owned.pop()!;
            if (effect.isValid) effect.destroy();
        }
    });

    function makeEffect(over: Partial<Parameters<typeof createAirScreenEffect>[0]> = {}): EffectAsset {
        const effect = createAirScreenEffect({
            name: `probe-${Math.random().toString(36).slice(2)}`,
            body: 'void main () {\n  cc_FragColor = texture(sourceTexture, v_uv) * probe0;\n}',
            constants: ['probe0'],
            samplers: ['sourceTexture'],
            ...over,
        });
        owned.push(effect);
        return effect;
    }

    function codeOf(action: () => void): string {
        try {
            action();
        } catch (error) {
            return String((error as { code?: string }).code);
        }
        return 'NO_THROW';
    }

    test('assembles a WebGL2-ready shader template with the material-set layout', () => {
        const effect = makeEffect({ constants: ['probe0', 'probe1'], defines: ['AIR_PROBE_ON'] });
        expect(EffectAsset.get(effect.name)).toBe(effect);
        const shader = effect.shaders[0];
        expect(shader.name).toBe(`${effect.name}-program`);
        expect(shader.glsl4.vert).toContain('layout(set = 0, binding = 1) uniform CCCamera');
        expect(shader.glsl4.vert).toContain('layout(set = 2, binding = 0) uniform CCLocal');
        // Clip-space quad: no MVP is applied to the position.
        expect(shader.glsl4.vert).toContain('gl_Position = vec4(a_position.xy, 0.0, 1.0)');
        expect(shader.glsl4.frag).toContain('layout(set = 1, binding = 0) uniform Constants');
        expect(shader.glsl4.frag).toContain('layout(set = 1, binding = 1) uniform highp sampler2D sourceTexture');
        expect(shader.glsl4.frag).toContain('out vec4 cc_FragColor');
        // The variant WebGL2 selects (`program-lib.ts:592-600`) is the same source minus layout.
        expect(shader.glsl3.frag).not.toContain('layout(');
        expect(shader.glsl3.frag).toContain('uniform Constants');
        expect(shader.glsl3.vert).toContain('uniform CCCamera');
        expect(shader.glsl1).toBeUndefined();

        expect(shader.blocks[0].members.map((member: { name: string }) => member.name)).toEqual(['probe0', 'probe1']);
        expect(shader.blocks[0].stageFlags).toBe(ShaderStageFlagBit.FRAGMENT);
        expect(shader.samplerTextures[0]).toMatchObject({
            name: 'sourceTexture',
            type: Type.SAMPLER2D,
            set: 1,
            binding: 1,
        });
        // `EffectAsset` normalizes the raw define list into engine macro-collection objects, so match
        // the fields that carry meaning instead of the exact instance type.
        expect(shader.defines).toHaveLength(1);
        expect(shader.defines[0]).toMatchObject({ name: 'AIR_PROBE_ON', type: 'boolean' });
        expect(effect.techniques[0].passes[0]).toMatchObject({
            program: shader.name,
            depthStencilState: { depthTest: false, depthWrite: false },
            blendState: { targets: [{ blend: false }] },
        });
    });

    test('exposes declared constants and the sampler as material uniform handles', () => {
        const effect = makeEffect({ constants: ['probe0', 'airVignette0'], defaults: { probe0: [1, 2, 3, 4] } });
        expect(effect.techniques[0].passes[0].properties).toEqual({
            probe0: { value: [1, 2, 3, 4], type: Type.FLOAT4 },
        });
        const material = new Material();
        material.initialize({ effectAsset: effect });
        const pass = material.passes[0];
        expect(pass.getHandle('probe0')).not.toBe(0);
        expect(pass.getHandle('airVignette0')).not.toBe(0);
        expect(pass.getHandle('sourceTexture')).not.toBe(0);
        expect(pass.getHandle('undeclared')).toBe(0);
        material.destroy();
    });

    test('rejects malformed effect options before registering anything', () => {
        expect(codeOf(() => createAirScreenEffect({} as never))).toBe('AIR_E_SCREEN_EFFECT_NAME');
        expect(codeOf(() => createAirScreenEffect({ name: '', body: 'void main(){}', constants: ['a'] }))).toBe(
            'AIR_E_SCREEN_EFFECT_NAME',
        );
        expect(
            codeOf(() => createAirScreenEffect({ name: 'probe-body', body: 'no main here', constants: ['a'] })),
        ).toBe('AIR_E_SCREEN_EFFECT_BODY');
        expect(codeOf(() => createAirScreenEffect({ name: 'probe-const', body: 'void main(){}', constants: [] }))).toBe(
            'AIR_E_SCREEN_EFFECT_CONSTANTS',
        );
        expect(
            codeOf(() => createAirScreenEffect({ name: 'probe-id', body: 'void main(){}', constants: ['2bad'] })),
        ).toBe('AIR_E_SCREEN_EFFECT_MEMBER');
        expect(
            codeOf(() =>
                createAirScreenEffect({ name: 'probe-dup', body: 'void main(){}', constants: ['a'], samplers: ['a'] }),
            ),
        ).toBe('AIR_E_SCREEN_EFFECT_MEMBER');
        expect(
            codeOf(() =>
                createAirScreenEffect({
                    name: 'probe-define',
                    body: 'void main(){}',
                    constants: ['a'],
                    defines: ['lower_case'],
                }),
            ),
        ).toBe('AIR_E_SCREEN_EFFECT_DEFINE');
        expect(
            codeOf(() =>
                createAirScreenEffect({
                    name: 'probe-default-key',
                    body: 'void main(){}',
                    constants: ['a'],
                    defaults: { b: [0, 0, 0, 0] },
                }),
            ),
        ).toBe('AIR_E_SCREEN_EFFECT_DEFAULT');
        expect(
            codeOf(() =>
                createAirScreenEffect({
                    name: 'probe-default-len',
                    body: 'void main(){}',
                    constants: ['a'],
                    defaults: { a: [0, 0, 0] },
                }),
            ),
        ).toBe('AIR_E_SCREEN_EFFECT_DEFAULT');
        const first = makeEffect({ name: 'probe-unique-name' });
        expect(
            codeOf(() => createAirScreenEffect({ name: 'probe-unique-name', body: 'void main(){}', constants: ['a'] })),
        ).toBe('AIR_E_SCREEN_EFFECT_NAME');
        expect(EffectAsset.get('probe-unique-name')).toBe(first);
    });

    test('validates every pass option before touching the camera or the device', () => {
        const effect = makeEffect();
        expect(codeOf(() => createAirScreenPass(null as never))).toBe('AIR_E_SCREEN_PASS_OPTIONS');
        expect(codeOf(() => createAirScreenPass({ camera: null as never, effect, sampler: 'sourceTexture' }))).toBe(
            'AIR_E_SCREEN_PASS_CAMERA',
        );
        expect(
            codeOf(() => createAirScreenPass({ camera: camera.node as never, effect, sampler: 'sourceTexture' })),
        ).toBe('AIR_E_SCREEN_PASS_CAMERA');
        expect(codeOf(() => createAirScreenPass({ camera, effect: null as never, sampler: 'sourceTexture' }))).toBe(
            'AIR_E_SCREEN_PASS_EFFECT',
        );
        expect(codeOf(() => createAirScreenPass({ camera, effect: new EffectAsset(), sampler: 'sourceTexture' }))).toBe(
            'AIR_E_SCREEN_PASS_EFFECT',
        );
        expect(codeOf(() => createAirScreenPass({ camera, effect, sampler: 'otherTexture' }))).toBe(
            'AIR_E_SCREEN_PASS_SAMPLER',
        );
        expect(codeOf(() => createAirScreenPass({ camera, effect, sampler: 'sourceTexture', layer: 0 }))).toBe(
            'AIR_E_SCREEN_PASS_LAYER',
        );
        expect(codeOf(() => createAirScreenPass({ camera, effect, sampler: 'sourceTexture', layer: 3 }))).toBe(
            'AIR_E_SCREEN_PASS_LAYER',
        );
        expect(
            codeOf(() =>
                createAirScreenPass({ camera, effect, sampler: 'sourceTexture', constants: { nope: [0, 0, 0, 0] } }),
            ),
        ).toBe('AIR_E_SCREEN_PASS_CONSTANT');
        // A camera that can already see the quad layer would feed the pass into itself.
        camera.visibility = AIR_SCREEN_PASS_LAYER;
        expect(codeOf(() => createAirScreenPass({ camera, effect, sampler: 'sourceTexture' }))).toBe(
            'AIR_E_SCREEN_PASS_LAYER',
        );
        // Every rejection above left the source camera on the framebuffer and the effect owned here.
        expect(camera.targetTexture).toBeNull();
        expect(effect.refCount).toBe(0);
        expect(effect.isValid).toBe(true);
    });

    test('releases the effect it referenced when the device refuses a render target', () => {
        // The jsdom device has no WebGL2, so the first GPU step inside the pass throws. That must
        // not leave the effect registered with a dangling reference — otherwise a legitimate retry
        // is blocked by the duplicate-name gate forever.
        const orphan = createAirScreenEffect({
            name: 'probe-retry-gate',
            body: 'void main(){}',
            constants: ['probe0'],
            samplers: ['sourceTexture'],
        });
        const leaked = EffectAsset.get('probe-retry-gate');
        expect(leaked).toBe(orphan);
        orphan.destroy();
        expect(EffectAsset.get('probe-retry-gate')).toBeNull();

        // A pass releases the reference it took, so a caller that still owns the effect keeps it
        // registered and a caller that does not gets it destroyed. Either way no phantom reference
        // survives to block a retry through the duplicate-name gate.
        const kept = makeEffect();
        kept.addRef();
        expect(codeOf(() => createAirScreenPass({ camera, effect: kept, sampler: 'sourceTexture' }))).toBe(
            'AIR_E_RENDER_TARGET_DEVICE',
        );
        expect(EffectAsset.get(kept.name)).toBe(kept);
        expect(kept.refCount).toBe(1);
        kept.decRef(false);

        const unowned = makeEffect();
        // `CCObject.destroy()` only queues (`objectsToDestroy`), so `isValid` stays true until the
        // engine flushes; the registry entry is what the pass contract changes synchronously.
        const destroyCall = jest.spyOn(unowned, 'destroy');
        expect(codeOf(() => createAirScreenPass({ camera, effect: unowned, sampler: 'sourceTexture' }))).toBe(
            'AIR_E_RENDER_TARGET_DEVICE',
        );
        expect(EffectAsset.get(unowned.name)).toBeNull();
        expect(destroyCall).toHaveBeenCalledTimes(1);
        destroyCall.mockRestore();

        const name = 'probe-vignette-pass-device';
        const code = codeOf(() => attachAirVignette(camera, { name }));
        expect(code).toBe('AIR_E_RENDER_TARGET_DEVICE');
        expect(EffectAsset.get(name)).toBeNull();
        expect(camera.targetTexture).toBeNull();
        expect(camera.node.scene!.children.filter((child: Node) => child.name.startsWith(name)).length).toBe(0);
    });

    test('vignette and bloom reject unsupported branches and bad values before creating anything', () => {
        const before = (name: string): boolean => Boolean(EffectAsset.get(name));

        expect(codeOf(() => attachAirVignette(null as never))).toBe('AIR_E_VIGNETTE_CAMERA');
        expect(codeOf(() => attachAirBloom(camera.node as never))).toBe('AIR_E_BLOOM_CAMERA');
        expect(codeOf(() => attachAirVignette(camera, { mode: 'masked' as never, name: 'vig-masked' }))).toBe(
            'AIR_E_VIGNETTE_MODE',
        );
        expect(codeOf(() => attachAirVignette(camera, { intensity: 4.5, name: 'vig-range' }))).toBe(
            'AIR_E_VIGNETTE_OPTION',
        );
        expect(codeOf(() => attachAirVignette(camera, { smoothness: -0.1, name: 'vig-smooth' }))).toBe(
            'AIR_E_VIGNETTE_OPTION',
        );
        expect(codeOf(() => attachAirVignette(camera, { center: { x: 0, y: 2 }, name: 'vig-center' }))).toBe(
            'AIR_E_VIGNETTE_OPTION',
        );
        expect(
            codeOf(() => attachAirVignette(camera, { color: new Vec4(0, 0, 0, 1) as never, name: 'vig-color' })),
        ).toBe('AIR_E_VIGNETTE_OPTION');
        expect(codeOf(() => attachAirBloom(camera, { dirtTexture: {} as never, name: 'bloom-dirt' }))).toBe(
            'AIR_E_BLOOM_DIRT',
        );
        expect(codeOf(() => attachAirBloom(camera, { dirtIntensity: 1, name: 'bloom-dirt2' }))).toBe(
            'AIR_E_BLOOM_DIRT',
        );
        expect(codeOf(() => attachAirBloom(camera, { threshold: 1.5, name: 'bloom-th' }))).toBe('AIR_E_BLOOM_OPTION');
        expect(codeOf(() => attachAirBloom(camera, { diffusion: 64.5, name: 'bloom-df' }))).toBe('AIR_E_BLOOM_OPTION');
        expect(codeOf(() => attachAirBloom(camera, { anamorphicRatio: -1.5, name: 'bloom-an' }))).toBe(
            'AIR_E_BLOOM_OPTION',
        );

        [
            'vig-masked',
            'vig-range',
            'vig-smooth',
            'vig-center',
            'vig-color',
            'bloom-dirt',
            'bloom-dirt2',
            'bloom-th',
            'bloom-df',
            'bloom-an',
        ].forEach((name) => expect(before(name)).toBe(false));
        expect(camera.targetTexture).toBeNull();
    });

    test('vignette and bloom still fail clean on a device without WebGL2', () => {
        const vig = 'probe-vig-device';
        const bloom = 'probe-bloom-device';
        expect(
            codeOf(() => attachAirVignette(camera, { name: vig, color: new Color(10, 20, 30, 200), rounded: true })),
        ).toBe('AIR_E_RENDER_TARGET_DEVICE');
        expect(codeOf(() => attachAirBloom(camera, { name: bloom, intensity: 2, fastMode: true }))).toBe(
            'AIR_E_RENDER_TARGET_DEVICE',
        );
        expect(EffectAsset.get(vig)).toBeNull();
        expect(EffectAsset.get(bloom)).toBeNull();
        expect(camera.targetTexture).toBeNull();
        const scene = camera.node.scene!;
        [vig, bloom].forEach((name) =>
            expect(scene.children.filter((child: Node) => child.name.startsWith(name)).length).toBe(0),
        );
    });
});
