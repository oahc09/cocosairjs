/**
 * Cocos AIR 开发手册 — Add a Background or Skybox（背景与天空盒）
 * 配套文章：docs/manual/backgrounds.md
 *
 * 三个按钮切三种背景：纯色（ClearFlag.SOLID_COLOR + clearColor）、
 * 默认天空盒（ClearFlag.SKYBOX + scene.globals.skybox.enabled、envmap=null）、
 * 立方体贴图天空盒（页面内 6 张 canvas 现造 TextureCube 塞进 skybox.envmap）。
 * 覆盖层打印当前模式与 skybox 读回状态，供探针取证。
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
    Color,
    TextureCube,
    ImageAsset,
    utils,
    primitives,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('backgrounds');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(2.8, 2.2, 5.2));
cameraNode.lookAt(new Vec3(0, 0.8, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 200;
camera.visibility = Layers.Enum.DEFAULT;

// ---- 一盏方向光 ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-50, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 2;

// ---- 主角立方体（斜视三面受光） ----
const cubeNode = new Node('Hero');
cubeNode.layer = Layers.Enum.DEFAULT;
cubeNode.setPosition(new Vec3(0, 0.8, 0));
scene.addChild(cubeNode);
const renderer = cubeNode.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1.2, height: 1.2, length: 1.2 }));
const material = new Material();
material.initialize({ effectName: 'builtin-standard' });
material.setProperty('mainColor', new Color(235, 125, 65, 255));
renderer.material = material;

// ---- 页面内现造 cubemap：6 张单色 canvas ----
function faceAsset(css: string): ImageAsset {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    g.fillStyle = css;
    g.fillRect(0, 0, 64, 64);
    return new ImageAsset(c);
}
let cubeMap: TextureCube | null = null;
let cubeMapError = '—';
try {
    cubeMap = new TextureCube();
    cubeMap.mipmaps = [
        {
            front: faceAsset('#c04030'),
            back: faceAsset('#30a050'),
            left: faceAsset('#3060c0'),
            right: faceAsset('#c0a030'),
            top: faceAsset('#40b0c0'),
            bottom: faceAsset('#8040a0'),
        },
    ];
} catch (e) {
    cubeMap = null;
    cubeMapError = `${e.name}: ${e.message}`;
}

// ---- 三种背景模式 ----
const info = document.querySelector('#info') as HTMLElement;
let mode = 'skybox-cubemap';
let modeError = '—';
function applyMode(next: string): void {
    mode = next;
    try {
        if (next === 'solid') {
            camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
            camera.clearColor = new Color(24, 60, 70, 255);
            scene.globals.skybox.enabled = false;
        } else if (next === 'skybox-default') {
            camera.clearFlags = Camera.ClearFlag.SKYBOX;
            scene.globals.skybox.enabled = true;
            scene.globals.skybox.envmap = null;
        } else {
            camera.clearFlags = Camera.ClearFlag.SKYBOX;
            scene.globals.skybox.enabled = true;
            scene.globals.skybox.envmap = cubeMap;
        }
        modeError = '—';
    } catch (e) {
        modeError = `${e.name}: ${e.message}`;
        camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        scene.globals.skybox.enabled = false;
        mode = `${next} (failed, fell back to solid)`;
    }
}
(document.querySelector('#btn-solid') as HTMLElement).addEventListener('click', () => applyMode('solid'));
(document.querySelector('#btn-sky-def') as HTMLElement).addEventListener('click', () => applyMode('skybox-default'));
(document.querySelector('#btn-sky-cube') as HTMLElement).addEventListener('click', () => applyMode('skybox-cubemap'));
applyMode('skybox-cubemap');

// ---- 覆盖层 ----
class Overlay extends Component {
    update(): void {
        info.textContent = [
            `background mode: ${mode}`,
            `clearFlags: ${camera.clearFlags} (SKYBOX=${Camera.ClearFlag.SKYBOX}, SOLID=${Camera.ClearFlag.SOLID_COLOR})`,
            `skybox.enabled: ${scene.globals.skybox.enabled}, useHDR: ${scene.globals.skybox.useHDR}, envmap: ${scene.globals.skybox.envmap ? 'TextureCube' : 'null'}, err: ${modeError}`,
            `cubemap build: ${cubeMap ? 'ok (6 canvas faces)' : cubeMapError}`,
        ].join('\n');
    }
}
cameraNode.addComponent(Overlay);

window.__airApp = app;
window.__inspect = {
    get mode() {
        return mode;
    },
    scene,
    camera,
    applyMode,
};
app.run(scene);

console.log('[manual/backgrounds] running on cocosair');
