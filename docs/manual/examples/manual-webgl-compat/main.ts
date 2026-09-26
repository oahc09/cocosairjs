/**
 * Cocos AIR 开发手册 — WebGL Compatibility Check（WebGL 兼容性检查）
 * 配套文章：docs/manual/webgl-compatibility-check.md
 *
 * 这一页不渲染花哨内容，只做一件事：把"当前环境到底支持什么、引擎实际跑在哪个后端"
 * 全部问出来打到覆盖层。分三层：
 *   1. 浏览器原生能力：document.createElement('canvas').getContext('webgl2') 是否为真
 *   2. 引擎枚举：gfx.API.WEBGL2 / gfx.API.WEBGPU 的数值
 *   3. 引擎实际后端 + 硬件上限：device.constructor.name + device.capabilities
 *
 * 为什么不能只看 gfx.API：那是"枚举定义"，不代表当前设备。判断实际后端要用
 * device.constructor.name（game.renderType 在 AIR 里是 -1，不可用）。
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
    Vec3,
    Color,
    utils,
    primitives,
    gfx,
    sys,
    screen,
    director,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('webgl-compat');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.6, 5.2));
cameraNode.lookAt(new Vec3(0, 0.4, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(18, 24, 34, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 光源 ----
const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 2;

// ---- 一个参照 cube + 地面（保证画面非空且颜色足够，visible-frame 可验） ----
const cubeNode = new Node('Reference Cube');
cubeNode.layer = Layers.Enum.DEFAULT;
cubeNode.setPosition(new Vec3(0, 0.5, 0));
scene.addChild(cubeNode);
const cubeRenderer = cubeNode.addComponent(MeshRenderer);
cubeRenderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
const cubeMaterial = new Material();
cubeMaterial.initialize({ effectName: 'builtin-standard' });
cubeMaterial.setProperty('mainColor', new Color(230, 130, 50, 255));
cubeRenderer.material = cubeMaterial;

const groundNode = new Node('Ground');
groundNode.layer = Layers.Enum.DEFAULT;
groundNode.setPosition(new Vec3(0, -0.02, 0));
scene.addChild(groundNode);
const groundRenderer = groundNode.addComponent(MeshRenderer);
groundRenderer.mesh = utils.createMesh(primitives.plane({ width: 12, length: 12 }));
const groundMaterial = new Material();
groundMaterial.initialize({ effectName: 'builtin-standard' });
groundMaterial.setProperty('mainColor', new Color(70, 90, 80, 255));
groundRenderer.material = groundMaterial;

window.__airApp = app;
app.run(scene);

// ============ 兼容性报告（覆盖层） ============

function safe(fn: () => any, fallback: any): any {
    try {
        const v = fn();
        return v === undefined || v === null ? fallback : v;
    } catch (e) {
        return fallback;
    }
}

// 1) 浏览器原生 WebGL2 探针（不经过引擎）
const probeCanvas = document.createElement('canvas');
const nativeGL2 = safe(() => !!probeCanvas.getContext('webgl2'), false);

// 2) 引擎枚举（定义，非当前设备）
const apiWebgl2 = safe(() => gfx.API.WEBGL2, 'n/a');
const apiWebgpu = safe(() => gfx.API.WEBGPU, 'n/a');

// 3) 引擎实际后端 + 硬件上限
const device = safe(() => director.root && director.root.device, null);
const caps: Record<string, any> = safe(() => device && device.capabilities, {}) || {};
const cap = (k: string) => (caps[k] === undefined ? 'n/a' : caps[k]);

(document.querySelector('#info') as HTMLElement).textContent = [
    '--- WebGL compatibility check ---',
    `native canvas.getContext('webgl2'): ${nativeGL2}`,
    `gfx.API.WEBGL2=${apiWebgl2}  gfx.API.WEBGPU=${apiWebgpu}`,
    `active device: ${safe(() => device.constructor.name, 'n/a')}`,
    `sys: ${sys.platform} / ${sys.browserType} / ${sys.os} / mobile=${sys.isMobile}`,
    `maxTextureSize=${cap('maxTextureSize')}  maxColorRenderTargets=${cap('maxColorRenderTargets')}`,
    `maxVertexAttributes=${cap('maxVertexAttributes')}  dpr=${screen.devicePixelRatio}`,
    `caps keys: ${Object.keys(caps).join(',')}`,
].join('\n');

console.log('[manual/webgl-compat] running on cocosair');
