import {
    createAirApp,
    Scene,
    Node,
    Camera,
    MeshRenderer,
    Material,
    Color,
    Vec3,
    EffectAsset,
    utils,
    director,
    Director,
    createAirUnlitFogEffect,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

async function main(): Promise<void> {
    const app = await createAirApp({ canvas: '#GameCanvas' });
    (window as any).__airApp = app;
    const scene = new Scene('Fog accuracy');
    scene.globals.skybox.useHDR = false;
    const node = new Node('Main Camera');
    scene.addChild(node);
    node.setPosition(0, 0, 5);
    const camera = node.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.orthoHeight = 1.3;
    camera.near = 0.1;
    camera.far = 30;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(0, 0, 0, 255);
    const fog = scene.globals.fog;
    fog.enabled = true;
    fog.type = 0;
    fog.accurate = false;
    fog.fogColor = new Color(0, 0, 0);
    fog.fogStart = 0;
    fog.fogEnd = 8;
    // All vertices are farther than fogEnd, but the interior has distance ~5.
    let mesh = utils.createMesh({
        positions: [-10, -10, 0, 10, -10, 0, 0, 10, 0],
        indices: [0, 1, 2],
        minPos: new Vec3(-10, -10, 0),
        maxPos: new Vec3(10, 10, 0),
    });
    let triangle = new Node('Large Triangle');
    scene.addChild(triangle);
    let renderer = triangle.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    let native = new Material();
    native.initialize({ effectName: 'builtin-unlit' });
    native.setProperty('mainColor', new Color(255, 255, 255));
    let effect = createAirUnlitFogEffect();
    let accurate = new Material();
    accurate.initialize({ effectAsset: effect });
    accurate.setProperty('mainColor', new Color(255, 255, 255));
    renderer.setSharedMaterial(native, 0);
    app.run(scene);
    function sample(): Promise<number[]> {
        return new Promise((resolve) =>
            director.once(Director.EVENT_AFTER_DRAW, () => {
                const canvas = document.querySelector('canvas')!;
                const copy = document.createElement('canvas');
                copy.width = canvas.width;
                copy.height = canvas.height;
                const ctx = copy.getContext('2d')!;
                ctx.drawImage(canvas, 0, 0);
                resolve(
                    Array.from(ctx.getImageData(Math.floor(copy.width / 2), Math.floor(copy.height / 2), 1, 1).data),
                );
            }),
        );
    }
    const vertexFog = await sample();
    fog.accurate = true;
    const nativeAccurate = await sample();
    renderer.setSharedMaterial(accurate, 0);
    const airAccurate = await sample();
    triangle.setPosition(0, 0, 1);
    const transformed = await sample();
    let instanced = new Material();
    instanced.initialize({ effectAsset: effect, defines: { USE_INSTANCING: true } });
    instanced.setProperty('mainColor', new Color(255, 255, 255));
    renderer.setSharedMaterial(instanced, 0);
    const instancePixel = await sample();
    renderer.setSharedMaterial(accurate, 0);
    triangle.setPosition(0, 0, 0);
    const before = director.root!.pipeline.macros.CC_USE_FOG;
    // A parameter-only linear bypass retains the same shader variant.
    fog.fogStart = 100;
    fog.fogEnd = 101;
    const bypass = await sample();
    const after = director.root!.pipeline.macros.CC_USE_FOG;
    fog.fogStart = 0;
    fog.fogEnd = 8;
    const checks = [
        {
            name: 'world-transform-applied',
            ok: transformed[0] > airAccurate[0] + 10,
            detail: JSON.stringify(transformed),
        },
        {
            name: 'instancing-world-transform',
            ok: Math.abs(instancePixel[0] - transformed[0]) <= 1,
            detail: JSON.stringify(instancePixel),
        },
        { name: 'vertex-interpolation-boundary', ok: vertexFog[0] < 10, detail: JSON.stringify(vertexFog) },
        {
            name: 'native-accurate-noop-reproduced',
            ok: nativeAccurate[0] > 240,
            detail: JSON.stringify(nativeAccurate),
        },
        {
            name: 'air-fragment-fog-interior',
            ok: airAccurate[0] > 40 && airAccurate[0] < 220,
            detail: JSON.stringify(airAccurate),
        },
        {
            name: 'parameter-bypass-no-macro-change',
            ok: bypass[0] > 240 && before === after,
            detail: JSON.stringify({ bypass, before, after }),
        },
    ];
    (window as any).__trialProbe = {
        id: 'fog-accuracy',
        ready: true,
        ok: checks.every((c) => c.ok),
        checks,
        state: { vertexFog, nativeAccurate, airAccurate, transformed, instancePixel, bypass },
    };
    (window as any).__fogProbe = {
        cacheCycles: async (count = 20) => {
            if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error('cycle count must be 1..100');
            const registryBefore = Object.keys(EffectAsset.getAll()).length;
            const bufferBefore = director.root!.device.memoryStatus.bufferSize;
            const shaderIDs = new Set<number>();
            for (let i = 0; i < count; i++) {
                const owned = createAirUnlitFogEffect();
                const m = new Material();
                m.initialize({ effectAsset: owned });
                shaderIDs.add(m.passes[0].getShaderVariant()!.typedID);
                m.destroy();
                EffectAsset.remove(owned);
                owned.destroy();
                await sample();
                await sample();
            }
            return {
                count,
                shaderIDs: Array.from(shaderIDs),
                registryBefore,
                registryAfter: Object.keys(EffectAsset.getAll()).length,
                bufferBefore,
                bufferAfter: director.root!.device.memoryStatus.bufferSize,
            };
        },
        sample,
        setAccurate: (value: boolean) => {
            fog.accurate = value;
        },
        release: () => {
            triangle.destroy();
            native.destroy();
            accurate.destroy();
            instanced.destroy();
            mesh.destroy();
            EffectAsset.remove(effect);
            effect.destroy();
        },
    };
    const held = (): { name: string; ref: object }[] => [
        { name: 'mesh', ref: mesh },
        { name: 'native', ref: native },
        { name: 'accurate', ref: accurate },
        { name: 'instanced', ref: instanced },
        { name: 'effect', ref: effect },
    ];
    installAssetLifecycle({
        label: 'fog-accuracy',
        hold: held,
        release: () => (window as any).__fogProbe.release(),
        reacquire: async () => {
            mesh = utils.createMesh({ positions: [-10, -10, 0, 10, -10, 0, 0, 10, 0], indices: [0, 1, 2] }, undefined, {
                calculateBounds: true,
            });
            triangle = new Node('Large Triangle');
            scene.addChild(triangle);
            renderer = triangle.addComponent(MeshRenderer);
            renderer.mesh = mesh;
            native = new Material();
            native.initialize({ effectName: 'builtin-unlit' });
            effect = createAirUnlitFogEffect();
            accurate = new Material();
            accurate.initialize({ effectAsset: effect });
            accurate.setProperty('mainColor', new Color(255, 255, 255));
            instanced = new Material();
            instanced.initialize({ effectAsset: effect, defines: { USE_INSTANCING: true } });
            renderer.setSharedMaterial(accurate, 0);
            await sample();
            return held();
        },
    });
    if (checks.some((c) => !c.ok)) throw new Error('[fog-accuracy] pixel contract failed');
    (window as any).__probe = async () => ({
        ...(window as any).__trialProbe.state,
        liveCenter: await sample(),
        draws: director.root!.device.numDrawCalls,
        fogType: fog.type,
        accurate: fog.accurate,
    });
}
main().catch((error) => {
    throw error;
});
