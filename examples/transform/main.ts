/**
 * transform — 层级与局部/世界变换（V0.5.1 T2）。
 *
 * 演示：
 *  - Node 层级（root → child → grandchild），世界变换 = 各级 local 变换复合；
 *  - position / rotation / scale 的 local 语义；
 *  - worldPosition 与 local position 的区别（运行时在控制台对照）。
 *
 * 启动：npm run dev -- --example transform → http://localhost:7454/$d/transform/
 */

import {
    createAirApp,
    Scene,
    Node,
    MeshRenderer,
    Component,
    Layers,
    Vec3,
    utils,
    primitives,
    builtinResMgr, frameObject } from 'cocosair';
import { setupCamera, setupDirectionalLight } from '../shared/scene-kit.js';

/** root 旋转带动整个子层级；child 自身再摆动。 */
class HierarchyAnimator extends Component {
    private time = 0;

    update (dt: number): void {
        this.time += dt;
        this.node.setRotationFromEuler(0, this.time * 40, 0);
        const child = this.node.getChildByName('child');
        if (child) {
            child.setPosition(new Vec3(Math.sin(this.time * 2) * 1.2, 0, 0));
            child.setScale(new Vec3(1, 1 + Math.sin(this.time * 4) * 0.2, 1));
        }
    }
}

/** 周期打印 local vs world position（挂在 root 上，对照控制台观察） */
class Reporter extends Component {
    private elapsed = 0;

    update (dt: number): void {
        this.elapsed += dt;
        if (this.elapsed < 1) { return; }
        this.elapsed = 0;
        const grandchild = this.node.getChildByName('child')?.getChildByName('grandchild');
        if (grandchild) {
            console.log('[transform] grandchild local =', grandchild.position.toString(),
                'world =', grandchild.worldPosition.toString());
        }
    }
}

function addCube (parent: Node, name: string, size: number): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.DEFAULT;
    parent.addChild(node);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.box({ width: size, height: size, length: size }));
    renderer.material = builtinResMgr.get('builtin-standard-material');
    return node;
}

const app = await createAirApp({ canvas: '#GameCanvas' });
const scene = new Scene('transform-demo');
const camera = setupCamera(scene, { position: [0, 3.5, 9], rotationEuler: [-18, 0, 0] });
setupDirectionalLight(scene, { rotationEuler: [-45, -30, 0] });

// 层级：scene → root → child → grandchild
const root = new Node('root');
scene.addChild(root);

const child = new Node('child');
child.setPosition(new Vec3(1.5, 0, 0)); // local：相对 root
root.addChild(child);

const grandchild = new Node('grandchild');
grandchild.setPosition(new Vec3(0, 1, 0)); // local：相对 child
child.addChild(grandchild);

addCube(root, 'root-cube', 0.5);
addCube(child, 'child-cube', 0.3);
addCube(grandchild, 'grandchild-cube', 0.25);

root.addComponent(HierarchyAnimator);
root.addComponent(Reporter);

window.__airApp = app; // 开发面板/agent session 显式绑定入口（V0.5.1 T5）
frameObject(camera, root); // 相机取景：层级链居中

app.run(scene);
console.log('[transform] running — 打开控制台观察 local vs world position');
