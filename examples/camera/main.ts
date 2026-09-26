/**
 * camera — 透视 / 正交相机与取景（V0.5.1 T2）。
 *
 * 演示：
 *  - ProjectionType.PERSPECTIVE / ORTHO 切换（fov vs orthoHeight）；
 *  - utils.frameObject 按包围盒自动取景；
 *  - 页面按钮控制，不依赖键盘（键盘交互见 input 示例）。
 *
 * 启动：npm run dev -- --example camera → http://localhost:7454/$d/camera/
 */

import {
    createAirApp,
    Scene,
    Node,
    MeshRenderer,
    Camera,
    Layers,
    Vec3,
    utils,
    frameObject,
    primitives,
    builtinResMgr,
} from 'cocosair';
import { setupCamera, setupDirectionalLight } from '../shared/scene-kit.js';

const app = await createAirApp({ canvas: '#GameCanvas' });
const scene = new Scene('camera-demo');
const camera = setupCamera(scene, { position: [0, 3, 9], rotationEuler: [-15, 0, 0], fov: 45 });
setupDirectionalLight(scene, { rotationEuler: [-45, -30, 0] });

// 一排参考立方体：透视下近大远小；正交下保持同尺寸
const group = new Node('group');
scene.addChild(group);
for (let i = 0; i < 5; i++) {
    const node = new Node(`cube-${i}`);
    node.layer = Layers.Enum.DEFAULT;
    node.setPosition(new Vec3((i - 2) * 1.2, 0, -i * 1.2));
    group.addChild(node);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.box({ width: 0.8, height: 0.8, length: 0.8 }));
    renderer.material = builtinResMgr.get('builtin-standard-material');
}

window.__airApp = app; // 开发面板/agent session 显式绑定入口（V0.5.1 T5）
app.run(scene);
frameObject(camera, group); // 首帧就对准整组模型，按钮仍可重新取景。

// ---- DOM 控制条（v051 面板之外的普通页面元素）----
const bar = document.createElement('div');
bar.style.cssText =
    'position:fixed;left:12px;bottom:12px;display:flex;gap:8px;z-index:10;' +
    'font:13px system-ui;background:rgba(20,20,40,.8);padding:8px;border-radius:8px';
const button = (label: string, onClick: () => void): void => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = onClick;
    bar.appendChild(b);
};
document.body.appendChild(bar);

let ortho = false;
button('切换正交/透视', () => {
    ortho = !ortho;
    camera.projection = ortho ? Camera.ProjectionType.ORTHO : Camera.ProjectionType.PERSPECTIVE;
    if (ortho) {
        camera.orthoHeight = 4;
    }
    bar.dataset.mode = ortho ? 'ortho' : 'perspective';
});
button('frameObject 取景', () => {
    frameObject(camera, group);
});

console.log('[camera] running — 透视/正交切换与 frameObject 取景');
