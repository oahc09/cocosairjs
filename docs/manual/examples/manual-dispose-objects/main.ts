/**
 * Cocos AIR 开发手册 — How to dispose of Objects（销毁对象）
 * 配套文章：docs/manual/how-to-dispose-of-objects.md
 *
 * 三条销毁路径同页演示：
 *  1) NodePool 回收复用（put/get，不触发 destroy）；
 *  2) node.destroy() 真销毁（延迟到帧末，isValid 下一周期读回为 false）；
 *  3) 资产侧 assetManager.releaseAsset + addRef/decRef 引用计数（一次性纹理实测）。
 * 立方体自转保证任意 400ms 双帧不同（frame-diff）。
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
    utils,
    primitives,
    NodePool,
    ImageAsset,
    Texture2D,
    assetManager,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('dispose-objects');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(3.0, 3.2, 6.2));
cameraNode.lookAt(new Vec3(0, 1.2, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(18, 22, 30, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 一盏方向光 ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-50, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 2;

// ---- 立方体工厂（mesh 与 material 全例共享：节点销毁不牵动共享资产） ----
const cubeMesh = utils.createMesh(primitives.box({ width: 0.9, height: 0.9, length: 0.9 }));
const cubeMaterial = new Material();
cubeMaterial.initialize({ effectName: 'builtin-standard' });
cubeMaterial.setProperty('mainColor', new Color(95, 205, 120, 255));
let spawned = 0;
function makeCube(): Node {
    const node = new Node(`Cube-${spawned++}`);
    node.layer = Layers.Enum.DEFAULT;
    scene.addChild(node);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = cubeMesh;
    renderer.material = cubeMaterial;
    node.addComponent(Spinner);
    return node;
}

class Spinner extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 40, 0);
    }
}

// ---- 资产侧实测：引用计数 + releaseAsset ----
const throwaway = new Texture2D();
throwaway.image = new ImageAsset({
    width: 4,
    height: 4,
    _data: new Uint8Array(4 * 4 * 4),
    _compressed: false,
    format: Texture2D.PixelFormat.RGBA8888,
});
const refBase = throwaway.refCount;
throwaway.addRef();
const refAdded = throwaway.refCount;
throwaway.decRef();
const refBack = throwaway.refCount;
let releaseNote = 'ok';
try {
    assetManager.releaseAsset(throwaway);
} catch (e) {
    releaseNote = `throw: ${String((e && e.message) || e).slice(0, 60)}`;
}

// ---- 回收池 + 生长/排空循环 ----
const pool = new NodePool();
const alive: Node[] = [];
let destroyedTotal = 0;
let lastDestroyed: Node | null = null;
let lastDestroyedValid = 'n/a';
let phase = 'grow';

class Cycler extends Component {
    private _t = 0;
    private _tick = 0;
    constructor() {
        super();
        this._t = 0;
        this._tick = 0;
    }
    update(dt: number): void {
        this._t += dt;
        if (this._t < 1.2) return;
        this._t = 0;
        this._tick++;
        if (lastDestroyed) {
            lastDestroyedValid = String(lastDestroyed.isValid);
        }
        if (phase === 'grow') {
            const node = pool.size() > 0 ? pool.get() : makeCube();
            if (!node.parent) scene.addChild(node);
            node.active = true;
            node.setPosition(new Vec3((alive.length - 2) * 1.4, 0.9, 0));
            alive.push(node);
            if (alive.length >= 5) phase = 'drain';
        } else {
            const node = alive.shift() as Node;
            if (this._tick % 2 === 0) {
                pool.put(node); // 回收复用：不 destroy
            } else {
                node.destroy(); // 真销毁：帧末生效
                destroyedTotal++;
                lastDestroyed = node;
            }
            if (alive.length <= 1) phase = 'grow';
        }
        showDispose();
    }
}

// ---- 覆盖层 ----
const info = document.querySelector('#info') as HTMLElement;
function showDispose(): void {
    info.textContent = [
        'dispose: NodePool put/get + node.destroy() + assetManager.releaseAsset',
        `alive: ${alive.length}  pooled: ${pool.size()}  spawned: ${spawned}  destroyed: ${destroyedTotal}  phase: ${phase}`,
        `texture refCount: base=${refBase} addRef→${refAdded} decRef→${refBack}`,
        `after releaseAsset: isValid=${throwaway.isValid} (${releaseNote})`,
        `lastDestroyed.isValid (read next cycle): ${lastDestroyedValid}`,
    ].join('\n');
}
cameraNode.addComponent(Cycler);
showDispose();

window.__airApp = app;
app.run(scene);

console.log('[manual/dispose-objects] running on cocosair');
