/**
 * Cocos AIR 开发手册 — Textures（纹理）
 * 配套文章：docs/manual/textures.md
 *
 * 零外部资产的纹理全流程：程序化生成 32×32 棋盘格像素 → ImageAsset → Texture2D
 * → builtin-standard 的 mainTexture（需 defines.USE_ALBEDO_MAP）→ tilingOffset 平铺。
 * cube 自转展示六个面采样同一张图。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    MeshRenderer,
    Material,
    Component,
    Layers,
    Vec3,
    Vec4,
    Color,
    ImageAsset,
    Texture2D,
    utils,
    primitives,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('textures');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.6, 5.5));
cameraNode.lookAt(new Vec3(0, 0.7, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(18, 24, 34, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 光源 ----
const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 2;

// ---- 程序化像素：32×32 棋盘格（8×8 个 4px 色块） ----
function checkerboardPixels(): Uint8Array {
    const size = 32;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const even = ((x >> 2) + (y >> 2)) % 2 === 0;
            const i = (y * size + x) * 4;
            data[i] = even ? 235 : 40;
            data[i + 1] = even ? 235 : 40;
            data[i + 2] = even ? 235 : 40;
            data[i + 3] = 255;
        }
    }
    return data;
}

// ---- 两步上传：ImageAsset（CPU 像素）→ Texture2D（GPU 纹理） ----
const imageAsset = new ImageAsset({
    width: 32,
    height: 32,
    _data: checkerboardPixels(),
    _compressed: false,
    format: Texture2D.PixelFormat.RGBA8888,
});
const texture = new Texture2D();
texture.image = imageAsset;
texture.setWrapMode(Texture2D.WrapMode.REPEAT, Texture2D.WrapMode.REPEAT); // 平铺前提：wrap=REPEAT

// ---- 地面 ----
const groundNode = new Node('Ground');
groundNode.layer = Layers.Enum.DEFAULT;
scene.addChild(groundNode);
const groundRenderer = groundNode.addComponent(MeshRenderer);
groundRenderer.mesh = utils.createMesh(primitives.plane({ width: 12, length: 12 }));
const groundMaterial = new Material();
groundMaterial.initialize({ effectName: 'builtin-standard' });
groundMaterial.setProperty('mainColor', new Color(70, 90, 80, 255));
groundRenderer.material = groundMaterial;

// ---- 贴棋盘格的自转 cube ----
const cubeNode = new Node('Textured Cube');
cubeNode.layer = Layers.Enum.DEFAULT;
cubeNode.setPosition(new Vec3(0, 0.8, 0));
scene.addChild(cubeNode);
const cubeRenderer = cubeNode.addComponent(MeshRenderer);
cubeRenderer.mesh = utils.createMesh(primitives.box({ width: 1.3, height: 1.3, length: 1.3 }));
const cubeMaterial = new Material();
cubeMaterial.initialize({
    effectName: 'builtin-standard',
    defines: { USE_ALBEDO_MAP: true }, // 不打开这个宏，mainTexture 不参与着色
});
cubeMaterial.setProperty('mainTexture', texture);
cubeMaterial.setProperty('tilingOffset', new Vec4(2, 2, 0, 0)); // xy=tiling zw=offset
cubeMaterial.setProperty('roughness', 0.5);
cubeRenderer.material = cubeMaterial;

class Rotator extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 40, 0);
    }
}
cubeNode.addComponent(Rotator);

window.__airApp = app;
app.run(scene);

// ============ 覆盖层：纹理参数 ============
(document.querySelector('#info') as HTMLElement).textContent = [
    'textures: procedural 32x32 checker → Texture2D',
    `image: ${texture.width}x${texture.height} RGBA8888, wrap=REPEAT`,
    'tilingOffset (2,2,0,0): 每面 2x2 平铺',
    'cube spins: six faces sample the same texture',
].join('\n');

console.log('[manual/textures] running on cocosair');
