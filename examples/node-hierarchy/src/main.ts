/**
 * node-hierarchy — Node 父子层级与 Local/World Transform（E002 scene-hierarchy）。
 *
 * 演示：
 *  - Node.addChild 组装 Root → Arm → Hand 机械臂式结构；
 *  - 旋转 Root 时 Arm/Hand 世界位置跟随（world = parent world × local）；
 *  - getChildByName 按名称取节点。
 *
 * 启动：npm run dev -- --example node-hierarchy → http://localhost:7454/$d/node-hierarchy/
 */

import {
    createAirApp,
    Scene,
    Node,
    MeshRenderer,
    Camera,
    DirectionalLight,
    Component,
    Layers,
    Vec3,
    Color,
    Material,
    utils,
    primitives,
} from 'cocosair';

var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('node-hierarchy');

function materialWith(color: Color): Material {
    var material = new Material();
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('mainColor', color);
    return material;
}

function boxNode(
    name: string,
    parent: Node,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: Color,
): Node {
    var node = new Node(name);
    node.layer = Layers.Enum.DEFAULT;
    parent.addChild(node);
    node.setPosition(new Vec3(x, y, z));
    node.setScale(new Vec3(sx, sy, sz));
    var renderer = node.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
    renderer.material = materialWith(color);
    return node;
}

var cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 3.2, 8));
cameraNode.lookAt(new Vec3(0, 1.26, 0));
var camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(30, 40, 60, 255);
camera.visibility = Layers.Enum.DEFAULT;
camera.priority = 0;
var lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 8, 0));
lightNode.setRotationFromEuler(-45, -30, 0);
var light = lightNode.addComponent(DirectionalLight);
light.illuminance = 50000;

// Root → Arm → Hand：旋转 Root，整条链一起运动（world = parent world × local）
var root = boxNode('Root', scene, 0, 0.4, 0, 0.6, 0.6, 0.6, new Color(65, 155, 235, 255));
var arm = boxNode('Arm', root, 0, 1.2, 0, 0.4, 1.6, 0.4, new Color(95, 205, 120, 255));
var hand = boxNode('Hand', arm, 0, 1.2, 0, 0.7, 0.4, 0.7, new Color(235, 125, 65, 255));

class RootRotator extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 30, 0);
    }
}
root.addComponent(RootRotator);

var handNode = scene.getChildByName('Root')!.getChildByName('Arm')!.getChildByName('Hand');
console.log('[node-hierarchy] hand resolved via getChildByName:', handNode === hand);

app.run(scene);
void import('./transform-contract.js')
    .then(({ verifyTransforms }) => verifyTransforms())
    .catch((error) => {
        if ((window as any).__trialProbe) (window as any).__trialProbe.ready = true;
        throw error;
    });
