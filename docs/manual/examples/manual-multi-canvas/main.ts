/**
 * Cocos AIR 开发手册 — Multiple Scenes（多场景与多视口）
 * 配套文章：docs/manual/multiple-scenes.md
 *
 * AIR 的 pal/screen-adapter 是模块顶层单例、createAirApp 只认一个 #GameCanvas，
 * "多个 Scene + 多个渲染器 + 多个 canvas"的分屏路线走不通（见 offscreencanvas N/A）。
 * 本篇给 AIR 原生分屏方案：单 Scene + 多 Camera，每台相机用 rect 占屏幕一条竖带、用 visibility 层掩码
 * 只渲染自己那组节点——三带各显一组不同几何、各自转速，视觉上等价于"三个场景并排"。
 * 覆盖层读回三台相机的 rect / visibility，证明分屏与层剔除都真实生效。
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
    Rect,
    utils,
    primitives,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('multi-canvas');

// ---- 一盏方向光（对所有相机可见） ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-45, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 6;

// ---- 三条"子场景"：各占一个自定义层位，几何与转速都不同 ----
const sharedBox = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
const layerBits = [1 << 1, 1 << 2, 1 << 3];
const clusterColors = [new Color(235, 110, 105, 255), new Color(110, 225, 140, 255), new Color(120, 170, 245, 255)];
const spinSpeeds = [22, -34, 48];
const rigs: Node[] = [];

function makeCube(parent: Node, layer: number, x: number, y: number, z: number): MeshRenderer {
    const n = new Node('Cube');
    n.layer = layer;
    n.setPosition(new Vec3(x, y, z));
    parent.addChild(n);
    const r = n.addComponent(MeshRenderer);
    r.mesh = sharedBox;
    return r;
}

layerBits.forEach((layer, i) => {
    const rig = new Node(`SubScene-${i}`);
    rig.setPosition(new Vec3(0, 1.1, 0));
    scene.addChild(rig);
    const mat = new Material();
    mat.initialize({ effectName: 'builtin-standard' });
    mat.setProperty('mainColor', clusterColors[i]);
    // 三种不同排布：单块 / 2×2 方阵 / 竖叠三块
    if (i === 0) {
        makeCube(rig, layer, 0, 0, 0).material = mat;
    } else if (i === 1) {
        [
            [-0.6, -0.6],
            [0.6, -0.6],
            [-0.6, 0.6],
            [0.6, 0.6],
        ].forEach(([x, z]) => {
            makeCube(rig, layer, x, 0, z).material = mat;
        });
    } else {
        [-0.9, 0, 0.9].forEach((y) => {
            makeCube(rig, layer, 0, y, 0).material = mat;
        });
    }
    rigs.push(rig);
});

// ---- 三台相机：各占屏幕一条竖带（rect），只渲染自己那层（visibility） ----
const cameras: Camera[] = [];
layerBits.forEach((layer, i) => {
    const camNode = new Node(`Cam-${i}`);
    scene.addChild(camNode);
    camNode.setPosition(new Vec3(2.6, 2.8, 7.0));
    camNode.lookAt(new Vec3(0, 1.1, 0));
    const cam = camNode.addComponent(Camera);
    cam.projection = Camera.ProjectionType.PERSPECTIVE;
    cam.fov = 45;
    cam.near = 0.1;
    cam.far = 100;
    cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    cam.clearColor = new Color(10 + i * 8, 14, 22, 255);
    // 层掩码：本相机只看自己那组（layerBits[i]）+ 挂在 DEFAULT 层的方向光；
    // 三组立方体各占独立自定义层位，故互相不可见——这正是分屏"逻辑隔离"的关键。
    cam.visibility = layer | Layers.Enum.DEFAULT;
    cam.rect = new Rect(i / 3, 0, 1 / 3, 1);
    cam.priority = i;
    cameras.push(cam);
});

// ---- 覆盖层：读回三台相机的 rect / visibility ----
const info = document.querySelector('#info') as HTMLElement;
class Overlay extends Component {
    update(dt: number): void {
        rigs.forEach((rig, i) => {
            const e = rig.eulerAngles;
            rig.setRotationFromEuler(0, e.y + spinSpeeds[i] * dt, 0);
        });
        info.textContent = [
            'AIR multi-scene = one Scene + N Cameras (rect strip + visibility layer mask)',
            ...cameras.map(
                (c, i) =>
                    `cam${i}: rect.x=${c.rect.x.toFixed(2)} w=${c.rect.width.toFixed(2)} vis=${c.visibility} (layer ${layerBits[i]})`,
            ),
            'each strip shows a different cluster (single / 2x2 / stacked) at a different spin',
        ].join('\n');
    }
}
cameras[0].node.addComponent(Overlay);

window.__airApp = app;
window.__inspect = { cameras, rigs, layerBits };
app.run(scene);

console.log('[manual/multi-canvas] running on cocosair');
