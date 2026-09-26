/**
 * material-transparent — glTF alphaMode BLEND 半透明材质（引擎公开透明合同）。
 *
 * 演示：通过 GLTFLoader.parseAsync 加载 alphaMode=BLEND 的材质，
 * 半透明青色面板悬浮在不透明方块之前，可透见后方物体。
 */

import {
    createAirApp,
    Scene,
    Node,
    MeshRenderer,
    Camera,
    DirectionalLight,
    Layers,
    Vec3,
    Color,
    Material,
    utils,
    primitives,
    GLTFLoader,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('material-transparent');

function materialWith(color: Color): Material {
    var material = new Material();
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('mainColor', color);
    return material;
}

var cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2, 6));
cameraNode.lookAt(new Vec3(0, 0.7, 0));
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

// 不透明参考物与半透明面板一并由 acquire() 构建：首帧与 §25 合同的 reacquire 共用路径
var solidMesh: any;
var solidMaterial: any;
var solid: any;
var asset: any;
var instance: any;

function owned(): any[] {
    return [
        { name: 'SolidReference', ref: solid },
        { name: 'Mesh', ref: solidMesh },
        { name: 'Material', ref: solidMaterial },
        { name: 'GLTFAsset(glass-panel)', ref: asset },
        { name: 'instance.root', ref: instance.root },
    ];
}

async function acquireSolid(): Promise<void> {
    // 不透明参考物：红色实心立方体
    solid = new Node('SolidReference');
    solid.layer = Layers.Enum.DEFAULT;
    scene.addChild(solid);
    solid.setPosition(new Vec3(0, 0.5, -0.8));
    var solidRenderer = solid.addComponent(MeshRenderer);
    solidMesh = utils.createMesh(primitives.box({ width: 1.6, height: 1.6, length: 1.6 }));
    solidRenderer.mesh = solidMesh;
    solidMaterial = materialWith(new Color(230, 90, 60, 255));
    solidRenderer.material = solidMaterial;
}

await acquireSolid();

// 半透明面板：glTF JSON（alphaMode=BLEND + baseColorFactor alpha 0.45）→ parseAsync → instantiate
function quadBytesUri(): string {
    var positions = new Float32Array([-1.2, -1.2, 0, 1.2, -1.2, 0, -1.2, 1.2, 0, 1.2, 1.2, 0]);
    var normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
    var indices = new Uint16Array([0, 1, 2, 2, 1, 3]);
    var total = positions.byteLength + normals.byteLength + indices.byteLength;
    var bytes = new Uint8Array(total);
    bytes.set(new Uint8Array(positions.buffer), 0);
    bytes.set(new Uint8Array(normals.buffer), positions.byteLength);
    bytes.set(new Uint8Array(indices.buffer), positions.byteLength + normals.byteLength);
    var s = '';
    for (var v of bytes) {
        s += String.fromCharCode(v);
    }
    return 'data:application/octet-stream;base64,' + btoa(s);
}

var gltf = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: 108, uri: quadBytesUri() }],
    bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 48 },
        { buffer: 0, byteOffset: 48, byteLength: 48 },
        { buffer: 0, byteOffset: 96, byteLength: 12 },
    ],
    accessors: [
        { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [-1.2, -1.2, 0], max: [1.2, 1.2, 0] },
        { bufferView: 1, componentType: 5126, count: 4, type: 'VEC3' },
        { bufferView: 2, componentType: 5123, count: 6, type: 'SCALAR' },
    ],
    materials: [
        {
            name: 'glass-panel',
            alphaMode: 'BLEND',
            doubleSided: true,
            pbrMetallicRoughness: { baseColorFactor: [0.3, 0.75, 0.95, 0.45], metallicFactor: 0, roughnessFactor: 0.2 },
        },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    nodes: [{ name: 'BlendPanel', mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
};

var panel = document.createElement('div');
panel.style.cssText =
    'position:fixed;left:10px;top:8px;color:#9cd;font:12px monospace;white-space:pre;background:rgba(0,0,0,.45);padding:6px 8px;border-radius:4px';
document.body.appendChild(panel);

/** 半透明面板：alphaMode=BLEND 的 glTF → parseAsync → instantiate → 挂场景。 */
async function acquirePanel(): Promise<void> {
    asset = await new GLTFLoader().parseAsync(JSON.stringify(gltf));
    instance = asset.instantiate();
    instance.root.setPosition(new Vec3(0, 0.9, 0.8));
    scene.addChild(instance.root);
    panel.textContent = 'alphaMode BLEND\nbaseColorFactor alpha = 0.45\ndoubleSided = true';
}

await acquirePanel();

// §25 Lifecycle Contract：BLEND 资产与参考物资源整体释放 → 泄漏核对 → 全量重建。
installAssetLifecycle({
    label: 'material-transparent',
    hold: owned,
    release: () => {
        solid.destroy();
        solidMesh.destroy();
        solidMaterial.destroy();
        instance.dispose();
        asset.destroy();
    },
    reacquire: async () => {
        await acquireSolid();
        await acquirePanel();
        return owned();
    },
});

app.run(scene);
console.log('[material-transparent] running — alphaMode BLEND panel over solid cube');
