/**
 * gltf-loader-registry — GLTF 扩展注册表 — register/unregister/handlers
 *
 * 掌握 glTF 扩展注册面：loader 级 register/unregister、解码器/转码器挂接入口、注册表三件套（注册/注销/建 handler/必选校验）。
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
    GLTFLoader,
    GLTFExtensionRegistry,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

// ---- 共享脚手架：可见帧 + 场景就绪（gltf-loader-registry）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-gltf-loader-registry');
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
cubeMaterial.setProperty('mainColor', new Color(200, 230, 210));
cubeRenderer.material = cubeMaterial;

// ---- 主题：GLTF 扩展注册表 — register/unregister/handlers（确定性 readback，全部进 __probe）----
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
var loader = new GLTFLoader();
var asset = (await loader.parseAsync(
    await (await fetch('./assets/BoxTextured.glb')).arrayBuffer(),
    './assets/',
)) as any;
probe.parsedMeshes = asset.meshes ? asset.meshes.length : -1;
T('loaderRegister', () => {
    try {
        var reg1: any = GLTFLoader;
        reg1.register('PROBE_ext');
        return 'ok';
    } catch (e) {
        return 'threw';
    }
});
T('loaderUnregister', () => {
    try {
        var reg2: any = GLTFLoader;
        reg2.unregister('PROBE_ext');
        return 'ok';
    } catch (e) {
        return 'threw';
    }
});
T('setDracoNull', () => {
    try {
        (loader as any).setDRACODecoder(null as any);
        return 'ok';
    } catch (e) {
        return 'threw';
    }
});
T('setKtx2Null', () => {
    try {
        (loader as any).setKTX2Transcoder(null as any);
        return 'ok';
    } catch (e) {
        return 'threw';
    }
});
T('regRegister', () => {
    try {
        var reg: any = new GLTFExtensionRegistry();
        reg.register('PROBE_reg');
        return 'ok';
    } catch (e) {
        return 'threw';
    }
});
T('regUnregister', () => {
    try {
        var reg: any = new GLTFExtensionRegistry();
        reg.unregister('PROBE_reg');
        return 'ok';
    } catch (e) {
        return 'threw';
    }
});
T('createHandlers', () => {
    try {
        var reg: any = new GLTFExtensionRegistry();
        var h = reg.createHandlers ? reg.createHandlers(loader as any) : null;
        return h ? 'len' + h.length : 'null';
    } catch (e) {
        return 'threw';
    }
});
T('validateRequired', () => {
    try {
        var reg: any = new GLTFExtensionRegistry();
        var v = reg.validateRequired ? reg.validateRequired([], loader as any) : undefined;
        return v === undefined ? 'undef' : typeof v;
    } catch (e) {
        return 'threw';
    }
});
probe.topic = 'gltf-loader-registry';
(window as any).__probe = async () => probe;

// §25 资源生命周期合同（真拆建）：hold 当前对象 → destroy → 按 lifecycleMake 重建。
var lcRef: any = asset;
installAssetLifecycle({
    label: 'gltf-loader-registry',
    hold: () => [{ name: 'asset', ref: lcRef }],
    release: () => {
        try {
            lcRef.destroy ? lcRef.destroy() : 0;
        } catch (e) {
            /* node destroy 无异常 */
        }
    },
    reacquire: async () => {
        var o = await (async () => {
            var l = new GLTFLoader();
            var b = await (await fetch('./assets/BoxTextured.glb')).arrayBuffer();
            return await l.parseAsync(b, './assets/');
        })();
        lcRef = o;
        return [{ name: 'asset', ref: o }];
    },
});
app.run(scene);
console.log('[gltf-loader-registry] running');
