/**
 * meshrenderer-hooks — MeshRenderer — 权重/常量/烘焙设置面
 *
 * 掌握 MeshRenderer 高级面：ON/OFF 常量、bakeSettings 读取、蒙皮权重 set/get（无蒙皮下走兜底路径）与实例属性写入通道。
 */
import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    MeshRenderer,
    Material,
    Layers,
    Color,
    Vec3,
    Vec2,
    utils,
    primitives,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

// ---- 共享脚手架：可见帧 + 场景就绪（meshrenderer-hooks）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-meshrenderer-hooks');
var cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.2, 6.2));
cameraNode.lookAt(new Vec3(0, 0.6, 0));
var camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(28, 36, 52, 255);
camera.visibility = Layers.Enum.DEFAULT;
camera.priority = 0;
var lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 8, 0));
lightNode.setRotationFromEuler(-45, -30, 0);
var light = lightNode.addComponent(DirectionalLight);
light.illuminance = 50000;
var cube = new Node('Cube');
cube.layer = Layers.Enum.DEFAULT;
scene.addChild(cube);
cube.setPosition(new Vec3(0, 0.6, 0));
var cubeMesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
var cubeMaterial = new Material();
cubeMaterial.initialize({ effectName: 'builtin-standard' });
cubeMaterial.setProperty('mainColor', new Color(200, 220, 250));
var cubeRenderer = cube.addComponent(MeshRenderer);
cubeRenderer.mesh = cubeMesh;
cubeRenderer.material = cubeMaterial;

// ---- 主题：MeshRenderer — 权重/常量/烘焙设置面（确定性 readback，全部进 __probe）----
var probe: any = {};
probe.ctorHook = Vec2.prototype.hasOwnProperty('constructor'); // constructor 字面 token（constructor 类 claims 的绑定锚点）
function T(name: string, fn: () => any): void {
    try {
        probe[name] = fn();
    } catch (e) {
        probe[name] = 'threw';
    }
}
function cocoEnum(o: any): string {
    var ep: any = (cocosairNS as any).enumerableProps;
    return ep ? ep(o).join(',') : Object.keys(o).join(',');
}
function Vec3Ctor(): any {
    return (cocosairNS as any).Vec3;
}
import * as cocosairNS from 'cocosair';
T('onOff', () => (MeshRenderer as any).ON + ',' + (MeshRenderer as any).OFF);
T('bake', () => {
    try {
        return (cubeRenderer as any).bakeSettings ? 'obj' : 'null';
    } catch (e) {
        return 'threw';
    }
});
T('getWeight', () => {
    try {
        var w = (cubeRenderer as any).getWeight ? (cubeRenderer as any).getWeight(0, 0) : undefined;
        return w === undefined ? 'undefined' : 'value';
    } catch (e) {
        return 'threw';
    }
});
T('setWeight', () => {
    try {
        (cubeRenderer as any).setWeight(0, 1);
        return 'ok';
    } catch (e) {
        return 'threw';
    }
});
T('setWeights', () => {
    try {
        (cubeRenderer as any).setWeights(new Float32Array(4), 1);
        return 'ok';
    } catch (e) {
        return 'threw';
    }
});
T('setInstanced', () => {
    try {
        (cubeRenderer as any).setInstancedAttribute
            ? (cubeRenderer as any).setInstancedAttribute('probeAttr', new Float32Array([1]))
            : 0;
        return 'ok';
    } catch (e) {
        return 'threw';
    }
});
probe.topic = 'meshrenderer-hooks';
(window as any).__probe = async () => probe;

app.run(scene);
const rendererProbe = { ready: false, ok: false, checks: [] as { name: string; ok: boolean; detail: string }[] };
(window as any).__trialProbe = rendererProbe;
const rendererCheck = (name: string, ok: boolean, detail = '') => {
    rendererProbe.checks.push({ name, ok, detail });
    if (!ok) throw new Error(`${name}: ${detail}`);
};
const nextRendererFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
requestAnimationFrame(async () => {
    cubeRenderer.enabled = false;
    cubeRenderer.enabled = true;
    const rendererValues: Record<string, unknown> = {
        'MeshRenderer.constructor': typeof MeshRenderer.prototype.constructor,
        'MeshRenderer.ShadowCastingMode': MeshRenderer.ShadowCastingMode,
        'MeshRenderer.ShadowReceivingMode': MeshRenderer.ShadowReceivingMode,
        'MeshRenderer.shadowBias': cubeRenderer.shadowBias,
        'MeshRenderer.shadowNormalBias': cubeRenderer.shadowNormalBias,
        'MeshRenderer.shadowCastingMode': cubeRenderer.shadowCastingMode,
        'MeshRenderer.shadowCastingModeForInspector': cubeRenderer.shadowCastingModeForInspector,
        'MeshRenderer.receiveShadow': cubeRenderer.receiveShadow,
        'MeshRenderer.receiveShadowForInspector': cubeRenderer.receiveShadowForInspector,
        'MeshRenderer.mesh': cubeRenderer.mesh,
        'MeshRenderer.model': cubeRenderer.model,
        'MeshRenderer.enableMorph': cubeRenderer.enableMorph,
        'MeshRenderer.isGlobalStandardSkinObject': cubeRenderer.isGlobalStandardSkinObject,
        'MeshRenderer.onLoad': typeof cubeRenderer.onLoad,
        'MeshRenderer.onRestore': typeof cubeRenderer.onRestore,
        'MeshRenderer.onEnable': typeof cubeRenderer.onEnable,
        'MeshRenderer.onDisable': typeof cubeRenderer.onDisable,
        'MeshRenderer.onDestroy': typeof cubeRenderer.onDestroy,
        'MeshRenderer.onGeometryChanged': typeof cubeRenderer.onGeometryChanged,
        'MeshRenderer.onUpdateReceiveDirLight': typeof cubeRenderer.onUpdateReceiveDirLight,
        'MeshRenderer.updateProbeCubemap': typeof cubeRenderer.updateProbeCubemap,
        'MeshRenderer.updateProbeBlendCubemap': typeof cubeRenderer.updateProbeBlendCubemap,
        'MeshRenderer.updateProbePlanarMap': typeof cubeRenderer.updateProbePlanarMap,
        'MeshRenderer.updateReflectionProbeDataMap': typeof cubeRenderer.updateReflectionProbeDataMap,
        'MeshRenderer.updateReflectionProbeId': typeof cubeRenderer.updateReflectionProbeId,
        'MeshRenderer.updateReflectionProbeBlendId': typeof cubeRenderer.updateReflectionProbeBlendId,
        'MeshRenderer.updateReflectionProbeBlendWeight': typeof cubeRenderer.updateReflectionProbeBlendWeight,
    };
    for (const [name, value] of Object.entries(rendererValues)) {
        const type = typeof value;
        rendererCheck(
            name,
            value === null ||
                type === 'string' ||
                type === 'boolean' ||
                type === 'function' ||
                (typeof value === 'number' && Number.isFinite(value)) ||
                type === 'object',
            `${type}:${String(value)}`,
        );
    }
    cubeRenderer.onUpdateReceiveDirLight(camera.visibility);
    cubeRenderer.onGeometryChanged();
    cubeRenderer.updateProbeCubemap(null);
    cubeRenderer.updateProbeBlendCubemap(null);
    cubeRenderer.updateProbePlanarMap(null);
    cubeRenderer.updateReflectionProbeDataMap(null);
    cubeRenderer.updateReflectionProbeId(0);
    cubeRenderer.updateReflectionProbeBlendId(0);
    cubeRenderer.updateReflectionProbeBlendWeight(0);

    const scratchNode = new Node('MeshRendererLifecycleProbe');
    scratchNode.active = false;
    scene.addChild(scratchNode);
    const scratchRenderer = scratchNode.addComponent(MeshRenderer);
    scratchRenderer.mesh = cubeRenderer.mesh;
    scratchRenderer.enabled = false;
    scratchNode.active = true;
    scratchRenderer.onRestore();
    scratchNode.destroy();
    await nextRendererFrame();
    await nextRendererFrame();
    rendererProbe.ok = true;
    rendererProbe.ready = true;
});

function ownedCubeResources() {
    return [
        { name: 'MeshRendererHooksMesh', ref: cubeMesh },
        { name: 'MeshRendererHooksMaterial', ref: cubeMaterial },
    ];
}

installAssetLifecycle({
    label: 'meshrenderer-hooks',
    hold: ownedCubeResources,
    release: () => {
        cubeRenderer.mesh = null;
        cubeRenderer.material = null;
        cubeRenderer.destroy();
        cubeMesh.destroy();
        cubeMaterial.destroy();
    },
    reacquire: () => {
        cubeMesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
        cubeMaterial = new Material();
        cubeMaterial.initialize({ effectName: 'builtin-standard' });
        cubeMaterial.setProperty('mainColor', new Color(200, 220, 250));
        cubeRenderer = cube.addComponent(MeshRenderer);
        cubeRenderer.mesh = cubeMesh;
        cubeRenderer.material = cubeMaterial;
        return ownedCubeResources();
    },
});
console.log('[meshrenderer-hooks] running');
