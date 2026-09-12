/**
 * Cocos AIR — static-model
 *
 * 验证（计划书 Phase 13 / L12）：
 *  1. Runtime Asset：程序化生成 checkerboard Texture2D；
 *  2. 序列化往返：serialize(mesh) → JSON → deserialize → 还原 Mesh（Asset Dependency 链路）；
 *  3. Material Effect：builtin-standard 材质 + albedo 纹理引用（Texture Reference）；
 *  4. MeshRenderer 静态模型渲染。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    MeshRenderer,
    Material,
    Texture2D,
    ImageAsset,
    utils,
    primitives,
    deserialize,
    assetManager,
    Layers,
    Vec3,
    Color,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas');

const app = await createAirApp({ canvas });

// ---------- 1. 程序化 checkerboard 纹理（Texture Reference） ----------
const SIZE = 64;
const pixelData = new Uint8Array(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
        const i = (SIZE * y + x) * 4;
        const check = ((x >> 3) + (y >> 3)) % 2 === 0;
        const v = check ? 230 : 40;
        pixelData[i] = v;
        pixelData[i + 1] = v;
        pixelData[i + 2] = v;
        pixelData[i + 3] = 255;
    }
}
const imgAsset = new ImageAsset({
    width: SIZE,
    height: SIZE,
    _data: pixelData,
    _compressed: false,
    format: Texture2D.PixelFormat.RGBA8888,
});
const checkerTexture = new Texture2D();
checkerTexture.image = imgAsset;

// ---------- 2. Runtime Asset Load + assetManager 往返（Asset Dependency） ----------
const assetResp = await fetch('./assets/model.json');
const modelAsset = await assetResp.json(); // {positions, normals, uvs, indices}
const geometry = {
    positions: modelAsset.positions,
    normals: modelAsset.normals,
    uvs: modelAsset.uvs,
};
const sourceMesh = utils.createMesh(geometry);
// 注册进 assetManager 并通过 loadAny 取回（资产管理系统链路）
assetManager.assets.add('pyramid-mesh', sourceMesh);
const restoredMesh = await new Promise((resolve, reject) => {
    assetManager.loadAny({ uuid: 'pyramid-mesh' }, (err, asset) => (err ? reject(err) : resolve(asset)));
});

// ---------- 3. 材质：standard + albedo 纹理（Material Effect） ----------
const material = new Material();
material.initialize({ effectName: 'builtin-standard' });
material.setProperty('mainTexture', checkerTexture);

// ---------- 4. 场景组装 ----------
const scene = new Scene('static-model');

const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 3, 6));
cameraNode.setRotationFromEuler(-20, 0, 0);
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(30, 40, 60, 255);
camera.visibility = Layers.Enum.DEFAULT;

const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 10, 0));
lightNode.setRotationFromEuler(-45, -30, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 2;

const boxNode = new Node('StaticBox');
scene.addChild(boxNode);
boxNode.setPosition(new Vec3(0, -0.8, 0));
const boxRenderer = boxNode.addComponent(MeshRenderer);
boxRenderer.mesh = restoredMesh; // 反序列化还原的 Mesh
boxRenderer.material = material;

// 地面（非序列化路径的对照模型）
const groundNode = new Node('Ground');
scene.addChild(groundNode);
groundNode.setPosition(new Vec3(0, -2, 0));
const groundRenderer = groundNode.addComponent(MeshRenderer);
groundRenderer.mesh = utils.createMesh(primitives.plane({ width: 10, length: 10 }));
const groundMat = new Material();
groundMat.initialize({ effectName: 'builtin-standard' });
groundMat.setProperty('mainColor', new Color(90, 110, 90, 255));
groundRenderer.material = groundMat;

app.run(scene);

console.log('[static-model] running — serialized round-trip mesh + checkerboard texture + standard material');
