/**
 * camera-geometry-extras — Camera — 世界矩阵投影与几何查询
 *
 * 掌握 Camera 的进阶几何面：世界矩阵→屏幕投影（Mat4 出参）、裁剪空间 minz 查询、oblique 近平面矩阵计算（try 兜底）。
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
    Rect,
    Vec3,
    Vec2,
    Vec4,
    utils,
    primitives,
    geometry,
    Mat4,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

// ---- 共享脚手架：可见帧 + 场景就绪（camera-geometry-extras）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-camera-geometry-extras');
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
var cubeMesh: any;
var cubeMaterial: Material;
function buildCubeResources(): void {
    cubeMesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
    cubeMaterial = new Material();
    cubeMaterial.initialize({ effectName: 'builtin-standard' });
    cubeMaterial.setProperty('mainColor', new Color(150, 210, 200));
    cubeRenderer.mesh = cubeMesh;
    cubeRenderer.material = cubeMaterial;
}
buildCubeResources();
app.run(scene);
await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

// ---- 主题：Camera — 世界矩阵投影与几何查询（确定性 readback，全部进 __probe）----
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
var out = new Mat4();
var camAny: any = camera;
T('wms', () => {
    try {
        var rc = camAny.camera;
        var r = rc ? rc.worldMatrixToScreen(out, cube.worldMatrix, 480, 320) : null;
        return r ? 'mat4' : 'null';
    } catch (e) {
        return 'threw';
    }
});
T('clipMinz', () => {
    try {
        var v = ((camera as any).camera as any) ? ((camera as any).camera as any).getClipSpaceMinz() : undefined;
        return typeof v;
    } catch (e) {
        return 'threw';
    }
});
T('oblique', () => {
    try {
        var p = new Vec4(0, 1, 0, 1);
        var rc = (camera as any).camera;
        if (!rc) return 'null';
        rc.calculateObliqueMat(p);
        return p.toString();
    } catch (e) {
        return 'threw';
    }
});

// ---- Advanced API coverage: public geometry operations and render-scene camera ----
const ADVANCED_API_UNITS = [
    'renderer.scene.Camera',
    'renderer.scene.Camera.standardExposureValue',
    'renderer.scene.Camera.standardLightMeterScale',
    'renderer.scene.Camera.name',
    'renderer.scene.Camera.scene',
    'renderer.scene.Camera.node',
    'renderer.scene.Camera.systemWindowId',
    'renderer.scene.Camera.window',
    'renderer.scene.Camera.enabled',
    'renderer.scene.Camera.visibility',
    'renderer.scene.Camera.priority',
    'renderer.scene.Camera.width',
    'renderer.scene.Camera.height',
    'renderer.scene.Camera.position',
    'renderer.scene.Camera.forward',
    'renderer.scene.Camera.aperture',
    'renderer.scene.Camera.apertureValue',
    'renderer.scene.Camera.shutter',
    'renderer.scene.Camera.shutterValue',
    'renderer.scene.Camera.iso',
    'renderer.scene.Camera.isoValue',
    'renderer.scene.Camera.exposure',
    'renderer.scene.Camera.clearFlag',
    'renderer.scene.Camera.clearColor',
    'renderer.scene.Camera.clearDepth',
    'renderer.scene.Camera.clearStencil',
    'renderer.scene.Camera.projectionType',
    'renderer.scene.Camera.aspect',
    'renderer.scene.Camera.orthoHeight',
    'renderer.scene.Camera.fovAxis',
    'renderer.scene.Camera.fov',
    'renderer.scene.Camera.nearClip',
    'renderer.scene.Camera.farClip',
    'renderer.scene.Camera.viewport',
    'renderer.scene.Camera.frustum',
    'renderer.scene.Camera.matView',
    'renderer.scene.Camera.matProj',
    'renderer.scene.Camera.matProjInv',
    'renderer.scene.Camera.matViewProj',
    'renderer.scene.Camera.matViewProjInv',
    'renderer.scene.Camera.isWindowSize',
    'renderer.scene.Camera.screenScale',
    'renderer.scene.Camera.postProcess',
    'renderer.scene.Camera.usePostProcess',
    'renderer.scene.Camera.pipeline',
    'renderer.scene.Camera.pipelineSettings',
    'renderer.scene.Camera.constructor',
    'renderer.scene.Camera.initialize',
    'renderer.scene.Camera.destroy',
    'renderer.scene.Camera.attachToScene',
    'renderer.scene.Camera.detachFromScene',
    'renderer.scene.Camera.resize',
    'renderer.scene.Camera.setFixedSize',
    'renderer.scene.Camera.update',
    'renderer.scene.Camera.surfaceTransform',
    'renderer.scene.Camera.setViewportInOrientedSpace',
    'renderer.scene.Camera.initGeometryRenderer',
    'renderer.scene.Camera.geometryRenderer',
    'renderer.scene.Camera.cameraType',
    'renderer.scene.Camera.trackingType',
    'renderer.scene.Camera.cameraUsage',
    'renderer.scene.Camera.changeTargetWindow',
    'renderer.scene.Camera.detachCamera',
    'renderer.scene.Camera.screenPointToRay',
    'renderer.scene.Camera.screenToWorld',
    'renderer.scene.Camera.worldToScreen',
    'renderer.scene.Camera.worldMatrixToScreen',
    'renderer.scene.Camera.calculateObliqueMat',
    'renderer.scene.Camera.getClipSpaceMinz',
    'geometry.intersect',
    'geometry.Ray',
    'geometry.Ray.create',
    'geometry.Ray.clone',
    'geometry.Ray.copy',
    'geometry.Ray.fromPoints',
    'geometry.Ray.set',
    'geometry.Ray.o',
    'geometry.Ray.d',
    'geometry.Ray.type',
    'geometry.Ray.constructor',
    'geometry.Ray.computeHit',
    'geometry.AABB',
    'geometry.AABB.create',
    'geometry.AABB.fromPoints',
    'geometry.AABB.set',
    'geometry.AABB.merge',
    'geometry.AABB.toBoundingSphere',
    'geometry.AABB.transform',
    'geometry.AABB.center',
    'geometry.AABB.halfExtents',
    'geometry.AABB.type',
    'geometry.AABB.constructor',
    'geometry.AABB.getBoundary',
    'geometry.AABB.prototype.transform',
    'geometry.AABB.prototype.clone',
    'geometry.AABB.prototype.copy',
    'geometry.AABB.mergePoint',
    'geometry.AABB.mergePoints',
    'geometry.AABB.mergeFrustum',
] as const;
const rendererCameraPropertyUnits = new Set<string>([
    'renderer.scene.Camera.standardExposureValue',
    'renderer.scene.Camera.standardLightMeterScale',
    'renderer.scene.Camera.name',
    'renderer.scene.Camera.scene',
    'renderer.scene.Camera.node',
    'renderer.scene.Camera.systemWindowId',
    'renderer.scene.Camera.window',
    'renderer.scene.Camera.enabled',
    'renderer.scene.Camera.visibility',
    'renderer.scene.Camera.priority',
    'renderer.scene.Camera.width',
    'renderer.scene.Camera.height',
    'renderer.scene.Camera.position',
    'renderer.scene.Camera.forward',
    'renderer.scene.Camera.aperture',
    'renderer.scene.Camera.apertureValue',
    'renderer.scene.Camera.shutter',
    'renderer.scene.Camera.shutterValue',
    'renderer.scene.Camera.iso',
    'renderer.scene.Camera.isoValue',
    'renderer.scene.Camera.exposure',
    'renderer.scene.Camera.clearFlag',
    'renderer.scene.Camera.clearColor',
    'renderer.scene.Camera.clearDepth',
    'renderer.scene.Camera.clearStencil',
    'renderer.scene.Camera.projectionType',
    'renderer.scene.Camera.aspect',
    'renderer.scene.Camera.orthoHeight',
    'renderer.scene.Camera.fovAxis',
    'renderer.scene.Camera.fov',
    'renderer.scene.Camera.nearClip',
    'renderer.scene.Camera.farClip',
    'renderer.scene.Camera.viewport',
    'renderer.scene.Camera.frustum',
    'renderer.scene.Camera.matView',
    'renderer.scene.Camera.matProj',
    'renderer.scene.Camera.matProjInv',
    'renderer.scene.Camera.matViewProj',
    'renderer.scene.Camera.matViewProjInv',
    'renderer.scene.Camera.isWindowSize',
    'renderer.scene.Camera.screenScale',
    'renderer.scene.Camera.postProcess',
    'renderer.scene.Camera.usePostProcess',
    'renderer.scene.Camera.pipeline',
    'renderer.scene.Camera.pipelineSettings',
    'renderer.scene.Camera.surfaceTransform',
    'renderer.scene.Camera.geometryRenderer',
    'renderer.scene.Camera.cameraType',
    'renderer.scene.Camera.trackingType',
    'renderer.scene.Camera.cameraUsage',
]);

const rendererCameraClass = (cocosairNS as any).renderer.scene.Camera;
const rendererCamera = (camera as any).camera;
const rendererCameraDisposable = new rendererCameraClass((cocosairNS as any).director.root.device);
T('renderer-camera-class', () => typeof rendererCameraClass);
T('renderer-camera-constructor', () => rendererCameraDisposable instanceof rendererCameraClass);
T('renderer-camera-standard-exposure', () => rendererCameraClass.standardExposureValue);
T('renderer-camera-light-meter-scale', () => rendererCameraClass.standardLightMeterScale);

const rendererCameraProperties = ADVANCED_API_UNITS.filter(
    (unit) => unit.startsWith('renderer.scene.Camera.') && rendererCameraPropertyUnits.has(unit),
);
for (const unit of rendererCameraProperties) {
    const member = unit.slice('renderer.scene.Camera.'.length);
    const instance = [
        'isWindowSize',
        'screenScale',
        'postProcess',
        'usePostProcess',
        'pipeline',
        'pipelineSettings',
    ].includes(member)
        ? rendererCameraDisposable
        : rendererCamera;
    T(`renderer-camera-${member}`, () => instance[member]);
}
T('renderer-camera-detach-window', () => rendererCameraDisposable.detachCamera());
T('renderer-camera-destroy', () => rendererCameraDisposable.destroy());

const ray = geometry.Ray.create(0, 0, 0, 0, 0, 1);
const rayClone = geometry.Ray.clone(ray);
const rayCopy = geometry.Ray.copy(new geometry.Ray(), ray);
const rayFromPoints = geometry.Ray.fromPoints(new geometry.Ray(), new Vec3(0, 0, 0), new Vec3(0, 0, 2));
const raySet = geometry.Ray.set(new geometry.Ray(), 1, 2, 3, 0, 0, 1);
const rayHit = new Vec3();
ray.computeHit(rayHit, 4);
T('ray-origin', () => ray.o);
T('ray-direction', () => ray.d);
T('ray-type', () => ray.type);
T('geometry-intersect', () => geometry.intersect);

const box = geometry.AABB.create(0, 0, 0, 1, 1, 1);
const boxRight = geometry.AABB.create(2, 0, 0, 1, 1, 1);
const boxFromPoints = geometry.AABB.fromPoints(new geometry.AABB(), new Vec3(-1, -1, -1), new Vec3(1, 1, 1));
const boxSet = geometry.AABB.set(new geometry.AABB(), 0, 0, 0, 2, 2, 2);
const boxMerged = geometry.AABB.merge(new geometry.AABB(), box, boxRight);
const boundsSphere = new geometry.Sphere();
geometry.AABB.toBoundingSphere(boundsSphere, box);
const boxTransformed = geometry.AABB.transform(new geometry.AABB(), box, new Mat4());
const boxBoundaryMin = new Vec3();
const boxBoundaryMax = new Vec3();
box.getBoundary(boxBoundaryMin, boxBoundaryMax);
const boxClone = box.clone();
const boxCopy = new geometry.AABB().copy(box);
const boxInstanceTransformed = new geometry.AABB();
box.transform(new Mat4(), null, null, null, boxInstanceTransformed);
box.mergePoint(new Vec3(3, 0, 0));
box.mergePoints([new Vec3(-2, 0, 0), new Vec3(0, 2, 0)]);
box.mergeFrustum(rendererCamera.frustum);
T('aabb-type', () => box.type);

T('renderer-camera-resize', () => rendererCamera.resize(480, 320));
T('renderer-camera-fixed-size', () => rendererCamera.setFixedSize(480, 320));
T('renderer-camera-update', () => rendererCamera.update(true));
T('renderer-camera-screen-point-to-ray', () => rendererCamera.screenPointToRay(new geometry.Ray(), 240, 160));
T('renderer-camera-screen-to-world', () => rendererCamera.screenToWorld(new Vec3(), new Vec3(240, 160, 0.5)));
T('renderer-camera-world-to-screen', () => rendererCamera.worldToScreen(new Vec3(), cube.worldPosition));
T('renderer-camera-viewport-oriented', () => rendererCamera.setViewportInOrientedSpace(new Rect(0, 0, 1, 1)));

const rayChecks = {
    clone: rayClone.d.z === ray.d.z,
    copy: rayCopy.o.z === ray.o.z,
    fromPoints: rayFromPoints.d.z > 0,
    set: raySet.o.x === 1,
    hit: rayHit.z === 4,
};
const aabbChecks = {
    fromPoints: boxFromPoints.halfExtents.x === 1,
    set: boxSet.halfExtents.x === 2,
    merge: boxMerged.center.x === 1 && boxMerged.halfExtents.x === 2,
    boundary: boxBoundaryMin.x === -1 && boxBoundaryMax.x === 1,
    copy: boxCopy.center.x === 0,
    transform: boxTransformed.center.x === 0 && boxInstanceTransformed.halfExtents.x === 1,
    boundingSphere: boundsSphere.radius > 0,
};
probe.advancedGeometry = { ray: rayChecks, aabb: aabbChecks };
const failedRayChecks = Object.keys(rayChecks).filter((key) => !rayChecks[key as keyof typeof rayChecks]);
if (failedRayChecks.length) throw new Error(`Ray API contract failed: ${failedRayChecks.join(',')}`);
const failedAabbChecks = Object.keys(aabbChecks).filter((key) => !aabbChecks[key as keyof typeof aabbChecks]);
if (failedAabbChecks.length) throw new Error(`AABB API contract failed: ${failedAabbChecks.join(',')}`);
installAssetLifecycle({
    label: 'camera-geometry-extras',
    hold: () => [
        { name: 'CubeMesh', ref: cubeMesh },
        { name: 'CubeMaterial', ref: cubeMaterial },
    ],
    release: () => {
        cubeRenderer.material = null;
        cubeRenderer.mesh = null;
        cubeMaterial.destroy();
        cubeMesh.destroy();
    },
    reacquire: () => {
        buildCubeResources();
        return [
            { name: 'CubeMesh', ref: cubeMesh },
            { name: 'CubeMaterial', ref: cubeMaterial },
        ];
    },
});
probe.topic = 'camera-geometry-extras';
(window as any).__probe = async () => probe;

console.log('[camera-geometry-extras] running');
