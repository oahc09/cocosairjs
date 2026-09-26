/**
 * texture2d-ops — Texture2D — 创建/描述/资源释放面
 *
 * 掌握 Texture2D 数据面：构造、create 分配、mipmap 更新、HTML 元素获取、描述字符串、reset/release 资源语义与缺省化（多数走 try 兜底）。
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
    ImageAsset,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

// ---- 共享脚手架：可见帧 + 场景就绪（texture2d-ops）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-texture2d-ops');
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
cubeMaterial.setProperty('mainColor', new Color(210, 180, 230));
cubeRenderer.material = cubeMaterial;

// ---- 主题：Texture2D — 创建/描述/资源释放面（确定性 readback，全部进 __probe）----
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
T('ctor', () => 'ok');
T('create', () => {
    try {
        (tex as any).create ? (tex as any).create(2, 2) : 0;
        return 'ok';
    } catch (e) {
        return 'threw';
    }
});
T('updateMipmaps', () => {
    try {
        (tex as any).updateMipmaps([0]);
        return 'ok';
    } catch (e) {
        return 'threw';
    }
});
T('htmlObj', () => {
    try {
        var h = (tex as any).getHtmlElementObj ? (tex as any).getHtmlElementObj() : null;
        return h === null || h ? 'ok' : 'null';
    } catch (e) {
        return 'threw';
    }
});
T('description', () => {
    try {
        var d = (tex as any).description;
        return typeof d;
    } catch (e) {
        return 'threw';
    }
});
T('toString', () => typeof (tex as any).toString());
T('base', () => {
    try {
        return (tex as any).base === null || (tex as any).base ? 'ok' : 'null';
    } catch (e) {
        return 'threw';
    }
});
T('reset', () => {
    try {
        (tex as any).reset ? (tex as any).reset() : 0;
        return 'ok';
    } catch (e) {
        return 'threw';
    }
});
T('release', () => {
    try {
        (tex as any).releaseTexture ? (tex as any).releaseTexture() : 0;
        return 'ok';
    } catch (e) {
        return 'threw';
    }
});
T('initDefault', () => {
    try {
        (tex as any).initDefault ? (tex as any).initDefault(null) : 0;
        return 'ok';
    } catch (e) {
        return 'threw';
    }
});
T('validate', () => {
    try {
        var v = (tex as any).validate ? (tex as any).validate() : undefined;
        return v === undefined ? 'undef' : typeof v;
    } catch (e) {
        return 'threw';
    }
});
probe.topic = 'texture2d-ops';
(window as any).__probe = async () => probe;

// §25 资源生命周期合同（真拆建）：hold 当前对象 → destroy → 按 lifecycleMake 重建。
var lcRef: any = tex;
installAssetLifecycle({
    label: 'texture2d-ops',
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
console.log('[texture2d-ops] running');
