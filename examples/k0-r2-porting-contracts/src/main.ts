/**
 * K0 R2 Porting Contracts — 交互式示例：原生顶点色 / 混合 / 动态网格 / Billboard。
 *
 * 演示 AIR 原生合同的关键行为（不覆盖全部 17 项）：
 *  - N8  顶点色：USE_VERTEX_COLOR + a_color
 *  - N12 混合：BlendFactor.SRC_ALPHA / ONE（alpha / add）+ depthWrite=false
 *  - N3  动态网格：createDynamicMesh + positions-only updateSubMesh + renderer.onGeometryChanged()
 *  - N14 Billboard：独立 width/height 缩放边界（非 node.scale）
 *
 * 完整 17 项合同由 docs/manual/k0-r2-porting-contracts.md 与 K0 探针覆盖。
 * 单一引擎时钟：director EVENT_BEFORE_UPDATE 驱动更新（不自建 rAF）。
 */
import {
    createAirApp,
    Scene,
    Node,
    Camera,
    MeshRenderer,
    Material,
    gfx,
    utils,
    Texture2D,
    Color,
    Billboard,
    director,
    Director,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

// #GameCanvas 必须在引擎导入前存在
const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas, pixelRatioCap: 1 });
(window as unknown as { __airApp: typeof app }).__airApp = app;
const scene = new Scene('k0-r2-porting-contracts');
const cameraNode = new Node('Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(0, 0, 5);
const cam = cameraNode.addComponent(Camera);
cam.projection = Camera.ProjectionType.ORTHO;
cam.orthoHeight = 2;
cam.near = 0.1;
cam.far = 30;
cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
cam.clearColor = new Color(14, 17, 22, 255);
await app.run(scene);

// ── 状态 ──
type Mode = 'vertex-color' | 'blend' | 'dynamic-mesh' | 'billboard';
let currentMode: Mode = 'vertex-color';
let paused = false;
let released = false;
let dynamicUpdateCount = 0;

interface Lease {
    name: string;
    beforeRefCount: number;
    afterRefCount: number | null;
    ref: { refCount: number; isValid: boolean; addRef(): void; decRef(): void; destroy(): boolean };
}
const ownedAssets: Lease[] = [];
const ownedNodes: Node[] = [];
const releaseHistory: Array<{ name: string; beforeRefCount: number; afterRefCount: number }> = [];
let subscribed = false;
const errors: string[] = [];
window.addEventListener('error', (e) => {
    errors.push(String(e.message));
});

function track<T extends Lease['ref']>(name: string, ref: T): T {
    ref.addRef();
    ownedAssets.push({ name, beforeRefCount: ref.refCount, afterRefCount: null, ref });
    return ref;
}

function releaseAll(): void {
    if (released) return; // 幂等
    released = true;
    director.off(Director.EVENT_BEFORE_UPDATE, onBeforeUpdate);
    subscribed = false;
    // 先解绑 renderer 与 Billboard 的资源引用
    for (const n of ownedNodes) {
        if (!n.isValid) continue;
        const mr = n.getComponent(MeshRenderer);
        if (mr) {
            mr.mesh = null;
            mr.setSharedMaterial(null as never, 0);
        }
        const bb = n.getComponent(Billboard);
        if (bb) bb.texture = null;
    }
    // 退出场景并销毁节点
    for (const n of ownedNodes) {
        if (n.isValid) {
            n.removeFromParent();
            n.destroy();
        }
    }
    ownedNodes.length = 0;
    // 归还自有资产
    for (const lease of ownedAssets) {
        lease.ref.decRef();
        lease.afterRefCount = lease.ref.refCount;
        releaseHistory.push({
            name: lease.name,
            beforeRefCount: lease.beforeRefCount,
            afterRefCount: lease.afterRefCount,
        });
        lease.ref.destroy();
    }
    ownedAssets.length = 0;
    dynamicMesh = null;
    dynamicRenderer = null;
}

// ── N8: 顶点色 ──
function buildVertexColor(): void {
    const node = makeNode('vertex');
    const renderer = node.addComponent(MeshRenderer);
    const mesh = track(
        'mesh',
        utils.MeshUtils.createDynamicMesh(
            0,
            {
                positions: new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]),
                colors: new Float32Array([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 0, 1]),
                indices16: new Uint16Array([0, 1, 2, 1, 3, 2]),
            },
            undefined,
            { maxSubMeshes: 1, maxSubMeshVertices: 4, maxSubMeshIndices: 6 },
        ),
    );
    renderer.mesh = mesh;
    const material = track('material', new Material());
    material.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true } });
    renderer.setSharedMaterial(material, 0);
}

// ── N12: 混合（alpha / add）──
function buildBlend(): void {
    // 背景 z=0（无混合）
    const bgNode = makeNode('bg');
    const bgR = bgNode.addComponent(MeshRenderer);
    bgR.mesh = track(
        'bgMesh',
        utils.createMesh({ positions: [-1.5, -1, 0, 1.5, -1, 0, -1.5, 1, 0, 1.5, 1, 0], indices: [0, 1, 2, 1, 3, 2] }),
    );
    const bgM = track('bgMaterial', new Material());
    bgM.initialize({ effectName: 'builtin-unlit' });
    bgM.setProperty('mainColor', new Color(0, 200, 0, 255));
    bgR.setSharedMaterial(bgM, 0);

    // alpha 混合 z=0.1
    const aNode = makeNode('alpha');
    const aR = aNode.addComponent(MeshRenderer);
    aR.mesh = track(
        'alphaMesh',
        utils.createMesh({
            positions: [-0.8, -0.8, 0.1, 0.2, -0.8, 0.1, -0.8, 0.8, 0.1, 0.2, 0.8, 0.1],
            indices: [0, 1, 2, 1, 3, 2],
        }),
    );
    const aM = track('alphaMaterial', new Material());
    aM.initialize({
        effectName: 'builtin-unlit',
        states: {
            blendState: {
                targets: [
                    { blend: true, blendSrc: gfx.BlendFactor.SRC_ALPHA, blendDst: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA },
                ],
            },
            depthStencilState: { depthWrite: false },
        },
    });
    aM.setProperty('mainColor', new Color(255, 0, 0, 128));
    aR.setSharedMaterial(aM, 0);

    // additive z=0.2
    const adNode = makeNode('add');
    const adR = adNode.addComponent(MeshRenderer);
    adR.mesh = track(
        'addMesh',
        utils.createMesh({
            positions: [-0.2, -0.8, 0.2, 0.8, -0.8, 0.2, -0.2, 0.8, 0.2, 0.8, 0.8, 0.2],
            indices: [0, 1, 2, 1, 3, 2],
        }),
    );
    const adM = track('addMaterial', new Material());
    adM.initialize({
        effectName: 'builtin-unlit',
        states: {
            blendState: {
                targets: [{ blend: true, blendSrc: gfx.BlendFactor.SRC_ALPHA, blendDst: gfx.BlendFactor.ONE }],
            },
            depthStencilState: { depthWrite: false },
        },
    });
    adM.setProperty('mainColor', new Color(0, 0, 255, 128));
    adR.setSharedMaterial(adM, 0);
}

// ── N3: 动态网格 ──
type DynMesh = ReturnType<typeof utils.MeshUtils.createDynamicMesh>;
let dynamicMesh: DynMesh | null = null;
let dynamicRenderer: MeshRenderer | null = null;
let dynamicBase: Float32Array | null = null;
const DYN_CAPS = { maxSubMeshes: 1, maxSubMeshVertices: 4, maxSubMeshIndices: 6 };

function buildDynamicMesh(): void {
    const node = makeNode('dyn');
    dynamicRenderer = node.addComponent(MeshRenderer);
    dynamicBase = new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]);
    dynamicMesh = track(
        'dynMesh',
        utils.MeshUtils.createDynamicMesh(
            0,
            {
                positions: dynamicBase.slice(),
                indices16: new Uint16Array([0, 1, 2, 1, 3, 2]),
            },
            undefined,
            DYN_CAPS,
        ),
    );
    dynamicRenderer.mesh = dynamicMesh;
    const material = track('dynMaterial', new Material());
    material.initialize({ effectName: 'builtin-unlit' });
    material.setProperty('mainColor', new Color(0, 200, 255, 255));
    dynamicRenderer.setSharedMaterial(material, 0);
    dynamicUpdateCount = 0;
}

let wave = 0;
function updateDynamic(): void {
    if (!dynamicMesh || !dynamicBase || !dynamicRenderer || released) return;
    wave += 0.02;
    const positions = dynamicBase.slice();
    for (let i = 0; i < 4; i++) positions[i * 3 + 1] += Math.sin(wave + i * 1.2) * 0.15;
    dynamicMesh.updateSubMesh(0, { positions });
    dynamicRenderer.onGeometryChanged();
    dynamicUpdateCount++;
}

// ── N14: Billboard（独立缩放边界）──
function makeBillboardTexture(): Texture2D {
    // 确定性 2×2 彩色纹理（不假定默认 texture 有像素）
    const data = new Uint8Array([255, 100, 40, 255, 40, 200, 255, 255, 255, 255, 40, 255, 100, 255, 40, 255]);
    const tex = track('billboardTexture', new Texture2D());
    tex.reset({ width: 2, height: 2, format: Texture2D.PixelFormat.RGBA8888 });
    tex.uploadData(data);
    return tex;
}
function buildBillboard(): void {
    const node = makeNode('billboard');
    const billboard = node.addComponent(Billboard);
    billboard.width = 2;
    billboard.height = 1.5;
    billboard.texture = makeBillboardTexture();
}

// ── 节点工厂 ──
function makeNode(name: string): Node {
    const n = new Node(name);
    scene.addChild(n);
    ownedNodes.push(n);
    return n;
}

// ── 模式切换 ──
function switchMode(mode: Mode): void {
    releaseAll();
    released = false;
    wave = 0;
    dynamicUpdateCount = 0;
    currentMode = mode;
    switch (mode) {
        case 'vertex-color':
            buildVertexColor();
            break;
        case 'blend':
            buildBlend();
            break;
        case 'dynamic-mesh':
            buildDynamicMesh();
            break;
        case 'billboard':
            buildBillboard();
            break;
    }
    if (!subscribed) {
        director.on(Director.EVENT_BEFORE_UPDATE, onBeforeUpdate);
        subscribed = true;
    }
    updateButtons();
    updateStatus();
}

// ── 单一引擎时钟（director EVENT_BEFORE_UPDATE，不自建 rAF）──
function onBeforeUpdate(): void {
    if (!paused && !released) updateDynamic();
    updateStatus();
}
// ── UI（命名函数 + AbortController 便于 pagehide 解绑）──
const uiAbort = new AbortController();
const buttons = document.querySelectorAll<HTMLButtonElement>('#controls button[data-mode]');
buttons.forEach((btn) => {
    btn.addEventListener('click', () => switchMode(btn.dataset.mode as Mode), { signal: uiAbort.signal });
});
const btnPause = document.querySelector<HTMLButtonElement>('#btn-pause')!;
const btnReset = document.querySelector<HTMLButtonElement>('#btn-reset')!;
const btnRelease = document.querySelector<HTMLButtonElement>('#btn-release')!;
btnPause.addEventListener(
    'click',
    () => {
        paused = !paused;
        btnPause.textContent = paused ? '恢复' : '暂停';
        updateStatus();
    },
    { signal: uiAbort.signal },
);
btnReset.addEventListener('click', () => switchMode(currentMode), { signal: uiAbort.signal });
btnRelease.addEventListener(
    'click',
    () => {
        releaseAll();
        updateStatus();
    },
    { signal: uiAbort.signal },
);

function updateButtons(): void {
    buttons.forEach((btn) => btn.classList.toggle('active', btn.dataset.mode === currentMode));
}
function updateStatus(): void {
    const el = document.querySelector('#status');
    if (!el) return;
    const assetInfo = ownedAssets
        .map((a) => `${a.name}:${a.ref.refCount}${a.afterRefCount !== null ? `→${a.afterRefCount}` : ''}`)
        .join(' ');
    el.textContent = `模式: ${currentMode} | 暂停动画: ${paused} | 已释放: ${released} | 更新: ${dynamicUpdateCount} | 资产: ${assetInfo || '（已释放）'}`;
}

// ── pagehide 清理 ──
function onPageHide(): void {
    director.off(Director.EVENT_BEFORE_UPDATE, onBeforeUpdate);
    uiAbort.abort();
    releaseAll();
    app.close?.();
}
window.addEventListener('pagehide', onPageHide, { once: true });

// ── __k0Example 只读观测（快照冻结，errors 拷贝）──
(window as unknown as Record<string, unknown>).__k0Example = {
    get mode(): Mode {
        return currentMode;
    },
    get paused(): boolean {
        return paused;
    },
    get released(): boolean {
        return released;
    },
    get subscribed(): boolean {
        return subscribed;
    },
    get ownedNodeCount(): number {
        return ownedNodes.length;
    },
    get dynamicUpdateCount(): number {
        return dynamicUpdateCount;
    },
    get ownedAssetCount(): number {
        return ownedAssets.length;
    },
    get ownedAssets(): Array<{ name: string; beforeRefCount: number; afterRefCount: number | null; isValid: boolean }> {
        return ownedAssets.map((a) =>
            Object.freeze({
                name: a.name,
                beforeRefCount: a.beforeRefCount,
                afterRefCount: a.afterRefCount,
                isValid: a.ref.isValid,
            }),
        );
    },
    get releasedAssets(): Array<{ name: string; beforeRefCount: number; afterRefCount: number | null }> {
        return releaseHistory.map((a) => Object.freeze({ ...a }));
    },
    get errors(): readonly string[] {
        return Object.freeze([...errors]);
    },
};

// 初始化
switchMode('vertex-color');
console.log('[k0-r2] ready');

// Gallery validators use the same ownership and recreation paths as the buttons.
installAssetLifecycle({
    label: 'k0-r2-porting-contracts',
    hold: () => [
        ...ownedAssets.map((a) => ({ name: a.name, ref: a.ref })),
        ...ownedNodes.map((n) => ({ name: n.name, ref: n })),
    ],
    release: releaseAll,
    reacquire: async () => {
        switchMode(currentMode);
        return ownedAssets.map((a) => ({ name: a.name, ref: a.ref }));
    },
});
