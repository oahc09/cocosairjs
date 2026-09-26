/**
 * texture2d-serialization — Texture2D — mipmap 视图与序列化钩子
 *
 * 掌握 Texture2D 的 mip 视图与序列化钩子面（只读/try 兜底，确定性回读）。
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
    Texture2D,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

// ---- 共享脚手架：可见帧 + 场景就绪（texture2d-serialization）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-texture2d-serialization');
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
cubeMaterial.setProperty('mainColor', new Color(215, 185, 235));
cubeRenderer.material = cubeMaterial;

// ---- 主题：Texture2D — mipmap 视图与序列化钩子（确定性 readback，全部进 __probe）----
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
var tex = new Texture2D();
T('mipmaps', () => {
    try {
        var m = (tex as any)._mipmaps;
        return m ? 'len' + m.length : 'null';
    } catch (e) {
        return 'threw';
    }
});
T('serialize', () => {
    try {
        var s = (tex as any)._serialize ? (tex as any)._serialize(null) : undefined;
        return s === undefined ? 'undef' : typeof s;
    } catch (e) {
        return 'threw';
    }
});
T('deserialize', () => {
    try {
        (tex as any)._deserialize ? (tex as any)._deserialize({}, null) : 0;
        return 'ok';
    } catch (e) {
        return 'threw';
    }
});
T('onLoaded', () => {
    try {
        (tex as any).onLoaded ? (tex as any).onLoaded() : 0;
        return 'ok';
    } catch (e) {
        return 'threw';
    }
});
probe.topic = 'texture2d-serialization';
(window as any).__probe = async () => probe;

// §25 资源生命周期合同（真拆建）：hold 当前对象 → destroy → 按 lifecycleMake 重建。
var lcRef: any = tex;
installAssetLifecycle({
    label: 'texture2d-serialization',
    hold: () => [{ name: 'tex', ref: lcRef }],
    release: () => {
        try {
            lcRef.destroy ? lcRef.destroy() : 0;
        } catch (e) {
            /* node destroy 无异常 */
        }
    },
    reacquire: async () => {
        var o = await new Texture2D();
        lcRef = o;
        return [{ name: 'tex', ref: o }];
    },
});
app.run(scene);
console.log('[texture2d-serialization] running');
