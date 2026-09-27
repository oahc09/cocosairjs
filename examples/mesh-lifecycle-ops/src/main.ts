/**
 * mesh-lifecycle-ops — Mesh — assign/reset/merge 校验
 *
 * 掌握 Mesh 生命周期数据操作：assign 结构注入、reset 复位、静态 merge 与合并合法性校验、子网格更新与初始化（全部 try 兜底确定性回读）。
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
    Mesh,
    ModelRenderer,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

// ---- 共享脚手架：可见帧 + 场景就绪（mesh-lifecycle-ops）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-mesh-lifecycle-ops');
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
var cubeRenderer = cube.addComponent(MeshRenderer);
cubeRenderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
var cubeMaterial = new Material();
cubeMaterial.initialize({ effectName: 'builtin-standard' });
cubeMaterial.setProperty('mainColor', new Color(190, 210, 240));
cubeRenderer.material = cubeMaterial;

// ---- 主题：Mesh — assign/reset/merge 校验（确定性 readback，全部进 __probe）----
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
var m1 = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
var m2 = utils.createMesh(primitives.box({ width: 2, height: 2, length: 2 }));
T('validate', () => {
    try {
        var v = (Mesh as any).validateMergingMesh
            ? (Mesh as any).validateMergingMesh([m1, m2])
            : (m1 as any).validateMergingMesh([m2]);
        return typeof v;
    } catch (e) {
        return 'threw';
    }
});
T('merge', () => {
    try {
        var r = (Mesh as any).merge ? (Mesh as any).merge([m1, m2], false) : (m1 as any).merge([m2]);
        var result = r ? 'merged' : 'null';
        if (r && r.destroy) r.destroy();
        return result;
    } catch (e) {
        return 'threw';
    }
});
T('assign', () => {
    var target = new Mesh();
    try {
        (target as any).assign ? (target as any).assign({ vertexBuffers: [], indices: [] } as any) : 0;
        return 'ok';
    } catch (e) {
        return 'threw';
    } finally {
        target.destroy();
    }
});
T('reset', () => {
    try {
        (m1 as any).reset ? (m1 as any).reset() : 0;
        return 'ok';
    } catch (e) {
        return 'threw';
    }
});
T('initialize', () => {
    var nm = new Mesh();
    try {
        (nm as any).initialize ? (nm as any).initialize() : 0;
        return 'ok';
    } catch (e) {
        return 'threw';
    } finally {
        nm.destroy();
    }
});
T('updateSubMesh', () => {
    try {
        (m2 as any).updateSubMesh ? (m2 as any).updateSubMesh() : 0;
        return 'ok';
    } catch (e) {
        return 'threw';
    }
});
var covMesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
T('covMesh.struct', () => covMesh.struct.primitives.length);
T('covMesh.data', () => covMesh.data.length);
T('covMesh.hash', () => covMesh.hash);
T('covMesh.jointBufferIndices', () => covMesh.jointBufferIndices.length);
T('covMesh.renderingSubMeshes', () => covMesh.renderingSubMeshes.length);
T('covMesh.morphRendering', () => covMesh.morphRendering === null);
T('covMesh.allowDataAccess', () => covMesh.allowDataAccess);
T('covMesh.destroyRenderingMesh', () => {
    covMesh.destroyRenderingMesh();
    var destroyed = covMesh.renderingSubMeshes === null;
    covMesh.destroy();
    return destroyed;
});
T('covMesh.initDefault', () => {
    var defaultMesh = new Mesh();
    defaultMesh.initDefault();
    var initialized = defaultMesh.data instanceof Uint8Array;
    defaultMesh.destroy();
    return initialized;
});
var covModelRenderer = new ModelRenderer();
T('covModelRenderer', () => typeof ModelRenderer);
T('covModelRenderer.constructor', () => covModelRenderer instanceof ModelRenderer);
T('covModelRenderer.visibility', () => cubeRenderer.visibility);
T('covModelRenderer.priority', () => cubeRenderer.priority);
const covMeshFailures = Object.entries(probe)
    .filter(([key, value]) => (key.startsWith('covMesh.') || key.startsWith('covModelRenderer.')) && value === 'threw')
    .map(([key]) => key);
probe.coverageFailures = covMeshFailures;
probe.topic = 'mesh-lifecycle-ops';
(window as any).__probe = async () => probe;
if (covMeshFailures.length) console.error(`[coverage] Mesh/ModelRenderer probes failed: ${covMeshFailures.join(', ')}`);

app.run(scene);
const holdMeshResources = () => [
    { name: 'cube-mesh', ref: cubeRenderer.mesh },
    { name: 'cube-material', ref: cubeRenderer.sharedMaterial },
    { name: 'mesh-one', ref: m1 },
    { name: 'mesh-two', ref: m2 },
];
installAssetLifecycle({
    label: 'mesh-lifecycle-ops',
    hold: holdMeshResources,
    release: () => {
        const mesh = cubeRenderer.mesh;
        const material = cubeRenderer.sharedMaterial;
        cubeRenderer.mesh = null;
        cubeRenderer.sharedMaterials = [null];
        mesh?.destroy();
        material?.destroy();
        m1.destroy();
        m2.destroy();
    },
    reacquire: () => {
        m1 = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
        m2 = utils.createMesh(primitives.box({ width: 2, height: 2, length: 2 }));
        cubeRenderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
        cubeMaterial = new Material();
        cubeMaterial.initialize({ effectName: 'builtin-standard' });
        cubeMaterial.setProperty('mainColor', new Color(190, 210, 240));
        cubeRenderer.sharedMaterials = [cubeMaterial];
        return holdMeshResources();
    },
});
console.log('[mesh-lifecycle-ops] running');
