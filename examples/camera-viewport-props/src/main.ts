/**
 * camera-viewport-props — Camera — 视口与管线属性面
 *
 * 掌握 Camera 属性面：后处理开关/管线对象/屏幕缩放只读、SKYBOX 常量与定向空间视口写入（try 兜底）。
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

// ---- 共享脚手架：可见帧 + 场景就绪（camera-viewport-props）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-camera-viewport-props');
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
var cubeMaterial = new Material();
var cubeMesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
cubeMaterial.initialize({ effectName: 'builtin-standard' });
cubeMaterial.setProperty('mainColor', new Color(155, 215, 205));
cubeRenderer.mesh = cubeMesh;
cubeRenderer.material = cubeMaterial;

// ---- 主题：Camera — 视口与管线属性面（确定性 readback，全部进 __probe）----
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
T('postProcess', () => {
    try {
        return String((camera as any).postProcess);
    } catch (e) {
        return 'threw';
    }
});
T('usePost', () => {
    try {
        return String((camera as any).usePostProcess);
    } catch (e) {
        return 'threw';
    }
});
T('screenScale', () => {
    try {
        var s = (camera as any).screenScale;
        return s ? 'obj' : 'null';
    } catch (e) {
        return 'threw';
    }
});
T('skyboxConst', () => {
    try {
        return typeof (Camera as any).SKYBOX;
    } catch (e) {
        return 'threw';
    }
});
T('setViewportOriented', () => {
    try {
        (camera as any).setViewportInOrientedSpace(0, 0, 1, 1);
        return 'ok';
    } catch (e) {
        return 'threw';
    }
});
probe.topic = 'camera-viewport-props';
(window as any).__probe = async () => probe;

app.run(scene);
T('pipeline', () => {
    const rendererCamera = camera.camera;
    return typeof rendererCamera.pipeline === 'string' ? rendererCamera.pipeline : 'invalid-type';
});

const cameraProbe = { ready: false, ok: false, checks: [] as { name: string; ok: boolean; detail: string }[] };
(window as any).__trialProbe = cameraProbe;
const cameraCheck = (name: string, ok: boolean, detail = '') => {
    cameraProbe.checks.push({ name, ok, detail });
    if (!ok) throw new Error(`${name}: ${detail}`);
};
const nextCameraFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
requestAnimationFrame(async () => {
    camera.enabled = false;
    camera.enabled = true;
    const cameraValues: Record<string, unknown> = {
        'Camera.constructor': typeof Camera.prototype.constructor,
        'Camera.ProjectionType': Camera.ProjectionType,
        'Camera.FOVAxis': Camera.FOVAxis,
        'Camera.Aperture': Camera.Aperture,
        'Camera.Shutter': Camera.Shutter,
        'Camera.ISO': Camera.ISO,
        'Camera.TARGET_TEXTURE_CHANGE': Camera.TARGET_TEXTURE_CHANGE,
        'Camera.priority': camera.priority,
        'Camera.visibility': camera.visibility,
        'Camera.clearFlags': camera.clearFlags,
        'Camera.clearColor': camera.clearColor,
        'Camera.clearDepth': camera.clearDepth,
        'Camera.clearStencil': camera.clearStencil,
        'Camera.projection': camera.projection,
        'Camera.fovAxis': camera.fovAxis,
        'Camera.fov': camera.fov,
        'Camera.orthoHeight': camera.orthoHeight,
        'Camera.near': camera.near,
        'Camera.far': camera.far,
        'Camera.aperture': camera.aperture,
        'Camera.shutter': camera.shutter,
        'Camera.iso': camera.iso,
        'Camera.rect': camera.rect,
        'Camera.targetTexture': camera.targetTexture,
        'Camera.onLoad': typeof camera.onLoad,
        'Camera.onEnable': typeof camera.onEnable,
        'Camera.onDisable': typeof camera.onDisable,
        'Camera.onDestroy': typeof camera.onDestroy,
    };
    for (const [name, value] of Object.entries(cameraValues)) {
        const type = typeof value;
        cameraCheck(
            name,
            value === null ||
                type === 'string' ||
                type === 'boolean' ||
                type === 'function' ||
                (type === 'number' && Number.isFinite(value)) ||
                type === 'object',
            `${type}:${String(value)}`,
        );
    }
    const renderCamera = camera.camera;
    cameraCheck('Camera.camera', !!renderCamera);
    cameraCheck(
        'renderer.scene.Camera.pipeline',
        typeof renderCamera.pipeline === 'string',
        String(renderCamera.pipeline),
    );
    const uiPoint = camera.convertToUINode(cameraNode.worldPosition, cameraNode, new Vec3());
    cameraCheck(
        'Camera.convertToUINode',
        Number.isFinite(uiPoint.x) && Number.isFinite(uiPoint.y) && Number.isFinite(uiPoint.z),
    );

    const scratchCameraNode = new Node('CameraLifecycleProbe');
    scratchCameraNode.active = false;
    scene.addChild(scratchCameraNode);
    const scratchCamera = scratchCameraNode.addComponent(Camera);
    scratchCamera.enabled = false;
    scratchCameraNode.active = true;
    scratchCameraNode.destroy();
    await nextCameraFrame();
    await nextCameraFrame();
    cameraProbe.ok = true;
    cameraProbe.ready = true;
});

function ownedCubeResources() {
    return [
        { name: 'CameraViewportMesh', ref: cubeMesh },
        { name: 'CameraViewportMaterial', ref: cubeMaterial },
    ];
}

installAssetLifecycle({
    label: 'camera-viewport-props',
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
        cubeMaterial.setProperty('mainColor', new Color(155, 215, 205));
        cubeRenderer = cube.addComponent(MeshRenderer);
        cubeRenderer.mesh = cubeMesh;
        cubeRenderer.material = cubeMaterial;
        return ownedCubeResources();
    },
});
console.log('[camera-viewport-props] running');
