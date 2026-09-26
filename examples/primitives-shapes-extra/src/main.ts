/**
 * primitives-shapes-extra — primitives — cone/quad/circle 图元
 *
 * 掌握三件补充图元：圆锥、单位四边形、单位圆盘——同一 createMesh 管线下的顶点规模对照。
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

// ---- 共享脚手架：可见帧 + 场景就绪（primitives-shapes-extra）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-primitives-shapes-extra');
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
cubeMaterial.setProperty('mainColor', new Color(230, 190, 130));
cubeRenderer.material = cubeMaterial;

// ---- 主题：primitives — cone/quad/circle 图元（确定性 readback，全部进 __probe）----
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
var coneGeo = primitives.cone({ radius: 0.5, height: 1, segs: 8 } as any);
var quadGeo = (primitives as any).quad({ width: 1, height: 1 });
var circleGeo = primitives.circle({ segments: 12 } as any);
var coneMesh = utils.createMesh(coneGeo);
var quadMesh = utils.createMesh(quadGeo);
var circleMesh = utils.createMesh(circleGeo);
probe.conePosLen = (coneMesh as any).renderInfo ? (coneMesh as any).renderInfo.vertCount : 'meta';
probe.quadPosLen = (quadMesh as any).renderInfo ? (quadMesh as any).renderInfo.vertCount : 'meta';
probe.circlePosLen = (circleMesh as any).renderInfo ? (circleMesh as any).renderInfo.vertCount : 'meta';
probe.allCreated = !!(coneMesh && quadMesh && circleMesh);
probe.topic = 'primitives-shapes-extra';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[primitives-shapes-extra] running');
