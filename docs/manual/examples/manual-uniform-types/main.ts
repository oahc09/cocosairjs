/**
 * Cocos AIR 开发手册 — Uniform Types（Uniform 类型）
 * 配套文章：docs/manual/uniform-types.md
 *
 * 材质属性就是 uniform。builtin-standard 的每个可 setProperty 的属性都有一个
 * 声明类型（float / Vec3 / Vec4 / sampler2D），setProperty 要传**对应的 JS 类型**：
 *   float      → number            （metallic / roughness / alphaThreshold …）
 *   Vec3       → Vec3              （albedoScale / emissiveScale …）
 *   Vec4/Color → Color 或 Vec4     （mainColor / emissive / tilingOffset …）
 *   sampler2D  → Texture2D         （mainTexture / normalMap / emissiveMap …）
 *
 * 四个并排立方体，每个只改一类 uniform，肉眼对照效果：
 *   1 number    metallic=1.0 + roughness=0.2  → 镜面金属
 *   2 Color     mainColor=红                  → 哑光纯色
 *   3 Vec4+Tex  mainTexture=棋盘 + tilingOffset=(2,2,0,0) → 2×2 平铺
 *   4 Color+Vec3 emissive=青 + emissiveScale=(2,2,2)      → 自发光
 *
 * 注意：共享的 builtin 材质不可原地改，一律 new Material() + initialize 再 setProperty。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    MeshRenderer,
    Material,
    ImageAsset,
    Texture2D,
    Layers,
    Vec3,
    Vec4,
    Color,
    utils,
    primitives,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('uniform-types');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.2, 9.2));
cameraNode.lookAt(new Vec3(0, 0.4, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(22, 28, 40, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 光源 ----
const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-40, -25, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 2;

// ---- 程序化棋盘纹理（给 3 号 cube 演示 sampler2D + tilingOffset） ----
const SIZE = 32;
function checkerboardPixels(): Uint8Array {
    const pixels = new Uint8Array(SIZE * SIZE * 4);
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const i = (SIZE * y + x) * 4;
            const check = ((x >> 3) + (y >> 3)) % 2 === 0;
            const v = check ? 235 : 45;
            pixels[i] = v;
            pixels[i + 1] = v;
            pixels[i + 2] = v;
            pixels[i + 3] = 255;
        }
    }
    return pixels;
}
const imageAsset = new ImageAsset({
    width: SIZE,
    height: SIZE,
    _data: checkerboardPixels(),
    _compressed: false,
    format: Texture2D.PixelFormat.RGBA8888,
});
const checkerTexture = new Texture2D();
checkerTexture.image = imageAsset;

// ---- 四个 cube，每个一个独立材质（不碰共享 builtin 材质） ----
function addCube(
    name: string,
    x: number,
    initOptions: { effectName: string; defines?: Record<string, boolean> },
    configure: (m: Material) => void,
): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.DEFAULT;
    node.setPosition(new Vec3(x, 0.5, 0));
    scene.addChild(node);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.box({ width: 1.4, height: 1.4, length: 1.4 }));
    const material = new Material();
    material.initialize(initOptions);
    configure(material);
    renderer.material = material;
    return node;
}

// 1) number（float uniform）：metallic / roughness
//    注意：metallic=1 且场景无环境光/IBL 时金属接近全黑（无漫反射、镜面无物可反），
//    那是 PBR 的正确行为而非 bug；这里用 metallic=0 让 float 的效果肉眼可见。
addCube('float: metallic+roughness', -3.6, { effectName: 'builtin-standard' }, (m) => {
    m.setProperty('metallic', 0.0);
    m.setProperty('roughness', 0.35);
});

// 2) Color（Vec4 uniform）：mainColor
addCube('Color: mainColor', -1.2, { effectName: 'builtin-standard' }, (m) => {
    m.setProperty('mainColor', new Color(225, 70, 60, 255));
});

// 3) Texture2D + Vec4：mainTexture + tilingOffset（需打开 USE_ALBEDO_MAP）
addCube('Vec4+Tex: tilingOffset', 1.2, { effectName: 'builtin-standard', defines: { USE_ALBEDO_MAP: true } }, (m) => {
    m.setProperty('mainTexture', checkerTexture);
    m.setProperty('tilingOffset', new Vec4(2, 2, 0, 0));
});

// 4) Color + Vec3：emissive + emissiveScale
addCube('Color+Vec3: emissive', 3.6, { effectName: 'builtin-standard' }, (m) => {
    m.setProperty('emissive', new Color(40, 220, 210, 255));
    m.setProperty('emissiveScale', new Vec3(2, 2, 2));
});

window.__airApp = app;
app.run(scene);

(document.querySelector('#info') as HTMLElement).textContent = [
    'uniform types → JS types (builtin-standard)',
    '1 metallic/roughness : number (float)',
    '2 mainColor          : Color (Vec4)',
    '3 mainTexture+tiling : Texture2D + Vec4',
    '4 emissive+scale     : Color + Vec3',
].join('\n');

console.log('[manual/uniform-types] running on cocosair');
