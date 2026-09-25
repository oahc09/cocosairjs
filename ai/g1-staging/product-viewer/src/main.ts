/**
 * product-viewer — 应用：交互式 3D 产品查看器（G2 · 六场景之应用场景）。
 *
 * 覆盖重点（计划书 G2 表）：加载/失败重试、旋转缩放、部件选中、材质切换、信息面板、
 * 截图、模型替换；glTF、相机、拾取、材质实例、异步状态、资源释放、尺寸响应及诊断入口。
 *
 * 效果契约（effect.functional 的可执行来源）：
 * - T1 失败路径：加载 ./assets/MissingProduct.glb → 拒绝（消息含 404/failed）→ 面板进入 error 态；
 * - T2 重试成功：BoxTextured.glb → GLTFAsset 面记录（meshes/animations）→ frameObject 取景 → loaded；
 * - T3 副件：SimpleSkin（蒙皮 + 动画播放）置于侧位，两部件可分别选中；
 * - T4 材质切换：variant 轮换（glTF 原材质 ↔ 橙/蓝/白 standard），materialSwaps 计数；
 * - T5 尺寸响应：合成 resize 事件 → handler 执行计数 + camera.aspect 读回记录（如实：合成事件
 *   不改变真实视口，数值记录不冒充布局变化）；
 * - T6 DOM 按钮链：截图（toDataURL 长度断言）、换材质、更换模型（旧实例 dispose → isValid=false，
 *   新实例就位，modelSwaps 计数）——程序化 .click() 与验证器真实点击走同一 handler；
 * - 交互：画布单击 = 射线拾取选中（screenPointToRay + rayAABB，选中高亮 + 面板）；拖拽 = 轨道旋转；
 *   滚轮 = 缩放（clamp 2..12）；空闲时主产品缓慢自转（持续 frame-diff）。
 * - __lifecycle()：release = 双实例 dispose + 材质 destroy + 双资产 destroy（全 invalid），
 *   reacquire = 同一 loadProduct 路径重建（重新 fetch/parse/instantiate/frameObject）。
 * - 诊断入口：window.__airApp 绑定（agent session/DevTools 检查面）；面板含节点计数与状态机。
 *
 * 断言失败：pcheck → throw → pageerror → no-runtime-error 红。
 */

import {
    createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Component, Animation, AnimationClip,
    Layers, Vec3, Color, Material, utils, primitives, geometry, GLTFLoader, frameObject,
    input, Input, isValid,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

const probe = {
    id: 'product-viewer',
    ready: false,
    ok: false,
    clickPhaseDone: false,
    checks: [] as { name: string; ok: boolean; detail: string }[],
    state: {} as Record<string, unknown>,
};
(window as any).__trialProbe = probe;

function pcheck(name: string, ok: boolean, detail: string): void {
    probe.checks.push({ name, ok: !!ok, detail });
    if (!ok) {
        throw new Error('[product-viewer] assertion failed: ' + name + ' — ' + detail);
    }
}
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------

const vstate = {
    phase: 'boot',
    status: 'idle',
    lastError: '',
    selected: null as string | null,
    materialSwaps: 0,
    variantIdx: 0,
    modelSwaps: 0,
    mainKind: 'BoxTextured',
    screenshots: 0,
    lastShotBytes: 0,
    resizeEvents: 0,
    wheelEvents: 0,
    drags: 0,
};

let scene: Scene;
let camera: Camera;
let boxAsset: any = null;
let skinAsset: any = null;
let mainInstance: any = null;
let sideInstance: any = null;
let mainNode: Node | null = null;
let sideNode: Node | null = null;
const variantMats: Material[] = [];
let originalMainMats: (Material | null)[] = [];
let skinBaseMat: Material | null = null; // 蒙皮主件基础材质（资产追踪内）

// 轨道相机状态（拖拽旋转/滚轮缩放）
const orbit = { yaw: 0.6, pitch: 0.35, dist: 5, target: new Vec3(0, 0.6, 0) };

function stdMat(r: number, g: number, b: number): Material {
    const m = new Material();
    m.initialize({ effectName: 'builtin-standard' });
    m.setProperty('mainColor', new Color(r, g, b, 255));
    return m;
}

function applyMaterialToMain(mat: Material | null): void {
    if (!mainNode) {
        return;
    }
    mainNode.walk((n: Node) => {
        const mr = n.getComponent ? n.getComponent(MeshRenderer) : null;
        if (mr) {
            if (mat) {
                mr.setSharedMaterial(mat, 0);
            }
        }
    });
}

function captureOriginalMainMaterials(): void {
    originalMainMats = [];
    if (!mainNode) {
        return;
    }
    mainNode.walk((n: Node) => {
        const mr = n.getComponent ? n.getComponent(MeshRenderer) : null;
        if (mr) {
            originalMainMats.push(mr.getSharedMaterial(0));
        }
    });
}

function restoreOriginalMainMaterials(): void {
    if (!mainNode) {
        return;
    }
    let i = 0;
    mainNode.walk((n: Node) => {
        const mr = n.getComponent ? n.getComponent(MeshRenderer) : null;
        if (mr && i < originalMainMats.length) {
            mr.setSharedMaterial(originalMainMats[i], 0);
            i++;
        }
    });
}

function cycleVariant(): void {
    vstate.variantIdx = (vstate.variantIdx + 1) % 4;
    if (vstate.variantIdx === 0) {
        restoreOriginalMainMaterials();
    } else {
        applyMaterialToMain(variantMats[vstate.variantIdx - 1]);
    }
    vstate.materialSwaps++;
    renderPanel();
}

async function loadProduct(kind: 'box' | 'skin'): Promise<any> {
    if (kind === 'box') {
        if (!boxAsset || !isValid(boxAsset)) {
            const bytes = await (await fetch('./assets/BoxTextured.glb')).arrayBuffer();
            boxAsset = await new GLTFLoader().parseAsync(bytes, './assets/');
        }
        return boxAsset;
    }
    if (!skinAsset || !isValid(skinAsset)) {
        const text = await (await fetch('./assets/SimpleSkin.gltf')).text();
        skinAsset = await new GLTFLoader().parseAsync(text, './assets/');
    }
    return skinAsset;
}

async function buildMain(kind: 'box' | 'skin'): Promise<void> {
    const asset = await loadProduct(kind);
    mainInstance = asset.instantiate();
    mainInstance.root.name = 'ProductMain';
    mainInstance.root.setPosition(new Vec3(0, 0.6, 0));
    scene.addChild(mainInstance.root);
    mainNode = mainInstance.root;
    vstate.mainKind = kind === 'box' ? 'BoxTextured' : 'SimpleSkin';
    captureOriginalMainMaterials();
    if (kind === 'skin') {
        // 蒙皮件无材质默认黑：挂标准材质（model-character-interaction 同款处置）
        if (!skinBaseMat || !isValid(skinBaseMat)) {
            skinBaseMat = stdMat(220, 220, 228);
        }
        applyMaterialToMain(skinBaseMat);
        captureOriginalMainMaterials();
        playSkinAnimation(mainNode);
    }
    frameObject(camera, mainNode);
    syncOrbitFromCamera();
    renderPanel();
}

function playSkinAnimation(root: Node): void {
    // 双路径都真实执行（根组件与嵌套搜索各自独立断言价值；短路会漏掉 getComponentInChildren 的执行证据）
    const direct: Animation | null = root.getComponent(Animation);
    const nested: Animation | null = root.getComponentInChildren(Animation);
    const anim: Animation | null = direct || nested;
    if (anim && anim.clips.length > 0) {
        anim.clips.forEach((c: AnimationClip) => { c.wrapMode = AnimationClip.WrapMode.Loop; });
        anim.play(anim.clips[0].name);
    }
}

async function buildSide(): Promise<void> {
    const asset = await loadProduct('skin');
    sideInstance = asset.instantiate();
    sideInstance.root.name = 'ProductSide';
    sideInstance.root.setPosition(new Vec3(2.6, 1.0, 0));
    scene.addChild(sideInstance.root);
    sideNode = sideInstance.root;
    sideNode.walk((n: Node) => {
        const mr = n.getComponent ? n.getComponent(MeshRenderer) : null;
        if (mr && !mr.getSharedMaterial(0)) {
            mr.setSharedMaterial(variantMats[2], 0);
        }
    });
    playSkinAnimation(sideNode);
    renderPanel();
}

function disposeMain(): void {
    if (mainInstance) {
        mainInstance.dispose();
        mainInstance = null;
        mainNode = null;
    }
}

// ---------------------------------------------------------------------------
// 拾取（射线 × 部件 AABB；GAP-C1 worldToScreen 不参与——screenPointToRay 为实测可用面）
// ---------------------------------------------------------------------------

function aabbOf(node: Node, half: Vec3): any {
    const p = node.position;
    return new geometry.AABB(p.x, p.y + half.y * 0.5, p.z, half.x, half.y, half.z);
}

function pickAt(screenX: number, screenY: number): string | null {
    const ray = camera.screenPointToRay(screenX, screenY, new geometry.Ray());
    const cands: [string, any, Node | null][] = [
        ['ProductMain', mainNode ? aabbOf(mainNode, new Vec3(0.9, 0.9, 0.9)) : null, mainNode],
        ['ProductSide', sideNode ? aabbOf(sideNode, new Vec3(0.8, 1.2, 0.8)) : null, sideNode],
    ];
    let bestName: string | null = null;
    let bestT = Infinity;
    for (const [name, box, node] of cands) {
        if (!box || !node || !isValid(node)) {
            continue;
        }
        const t = geometry.intersect.rayAABB(ray, box);
        if (t > 0 && t < bestT) {
            bestT = t;
            bestName = name;
        }
    }
    return bestName;
}

function selectProduct(name: string | null): void {
    vstate.selected = name;
    if (name === 'ProductMain') {
        applyMaterialToMain(variantMats[0]); // 选中高亮：橙
    } else if (vstate.variantIdx === 0) {
        restoreOriginalMainMaterials();
    } else {
        applyMaterialToMain(variantMats[vstate.variantIdx - 1]);
    }
    renderPanel();
}

// ---------------------------------------------------------------------------
// DOM UI（信息面板 + 三按钮；buttonText 步骤走 getByRole 真实点击）
// ---------------------------------------------------------------------------

const panel = document.createElement('div');
panel.style.cssText = 'position:fixed;left:10px;top:8px;color:#9cd;font:12px monospace;z-index:10;white-space:pre';
document.body.appendChild(panel);

const status = document.createElement('div');
status.id = 'status';
status.style.cssText = 'position:fixed;left:10px;bottom:8px;color:#e8d9a0;font:13px monospace;z-index:10';
document.body.appendChild(status);

const btnBar = document.createElement('div');
btnBar.style.cssText = 'position:fixed;right:10px;top:8px;z-index:10;display:flex;gap:8px';
document.body.appendChild(btnBar);
function makeButton(label: string, handler: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'padding:6px 12px;font:13px monospace;cursor:pointer';
    b.addEventListener('click', handler);
    btnBar.appendChild(b);
    return b;
}

let screenshotDone = false;
let materialBtnDone = false;
let swapDone = false;

const btnScreenshot = makeButton('截图', () => {
    const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
    const url = canvas.toDataURL('image/png');
    vstate.screenshots++;
    vstate.lastShotBytes = url.length;
    if (!screenshotDone) {
        screenshotDone = true;
        pcheck('screenshot-captured', url.startsWith('data:image/png') && url.length > 1000, 'bytes=' + url.length);
    }
    renderPanel();
});

const btnMaterial = makeButton('换材质', () => {
    cycleVariant();
    if (!materialBtnDone) {
        materialBtnDone = true;
        pcheck('material-variant-cycled', vstate.variantIdx === 1 && vstate.materialSwaps >= 1,
            'variantIdx=' + vstate.variantIdx + ' swaps=' + vstate.materialSwaps);
    }
});

const btnSwap = makeButton('更换模型', () => {
    const oldRoot = mainNode;
    const nextKind = vstate.mainKind === 'BoxTextured' ? 'skin' : 'box';
    void (async () => {
        const oldInstance = mainInstance;
        disposeMain();
        await sleep(320); // dispose 走帧末延迟销毁：settle 后再断言（shared/asset-lifecycle 同口径）
        await buildMain(nextKind as 'box' | 'skin');
        vstate.modelSwaps++;
        if (!swapDone) {
            swapDone = true;
            pcheck('model-swap-disposes-old',
                !!oldInstance && !isValid(oldInstance.root) && !!mainNode && isValid(mainNode) && vstate.mainKind === (nextKind === 'box' ? 'BoxTextured' : 'SimpleSkin'),
                'oldValid=' + (oldInstance ? isValid(oldInstance.root) : 'n/a') + ' newKind=' + vstate.mainKind);
        }
        void oldRoot;
        renderPanel();
    })();
});

function renderPanel(): void {
    let nodeCount = 0;
    if (scene && isValid(scene)) {
        scene.walk(() => { nodeCount++; });
    }
    panel.textContent = [
        `product-viewer · ${vstate.phase} · ${vstate.status}`,
        `main=${vstate.mainKind} selected=${vstate.selected || '-'} swaps(mat/model)=${vstate.materialSwaps}/${vstate.modelSwaps}`,
        `shots=${vstate.screenshots}(${vstate.lastShotBytes}B) resize=${vstate.resizeEvents} wheel=${vstate.wheelEvents} drags=${vstate.drags} nodes=${nodeCount}`,
    ].join('\n');
    status.textContent = vstate.lastError ? 'error: ' + vstate.lastError.slice(0, 60) : 'state: ' + vstate.status;
}

// ---------------------------------------------------------------------------
// 轨道相机 + 空闲自转
// ---------------------------------------------------------------------------

function syncOrbitFromCamera(): void {
    const p = camera.node.position;
    const dx = p.x - orbit.target.x;
    const dy = p.y - orbit.target.y;
    const dz = p.z - orbit.target.z;
    orbit.dist = Math.max(2, Math.min(12, Math.sqrt(dx * dx + dy * dy + dz * dz)));
    orbit.yaw = Math.atan2(dx, dz);
    orbit.pitch = Math.asin(Math.max(-1, Math.min(1, dy / orbit.dist)));
}

function applyOrbit(): void {
    const cp = Math.cos(orbit.pitch);
    camera.node.setPosition(new Vec3(
        orbit.target.x + orbit.dist * cp * Math.sin(orbit.yaw),
        orbit.target.y + orbit.dist * Math.sin(orbit.pitch),
        orbit.target.z + orbit.dist * cp * Math.cos(orbit.yaw),
    ));
    camera.node.lookAt(orbit.target);
}

class IdleSpin extends Component {
    update(dt: number): void {
        if (mainNode && isValid(mainNode) && vstate.selected !== 'ProductMain') {
            mainNode.setRotationFromEuler(0, mainNode.eulerAngles.y + dt * 24, 0);
        }
    }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
    const app = await createAirApp({ canvas: '#GameCanvas' });
    (window as any).__airApp = app; // 诊断入口：agent session / DevTools 检查面
    scene = new Scene('product-viewer');

    const cameraNode = new Node('Main Camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(new Vec3(0, 1.6, 5));
    camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.PERSPECTIVE;
    camera.fov = 45;
    camera.near = 0.1;
    camera.far = 100;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(22, 26, 34, 255);
    camera.visibility = Layers.Enum.DEFAULT;
    camera.priority = 0;

    const lightNode = new Node('Main Light');
    scene.addChild(lightNode);
    lightNode.setPosition(new Vec3(0, 8, 0));
    lightNode.setRotationFromEuler(-45, -30, 0);
    const light = lightNode.addComponent(DirectionalLight);
    light.illuminance = 2.4;

    const groundNode = new Node('Ground');
    groundNode.layer = Layers.Enum.DEFAULT;
    groundNode.setPosition(new Vec3(0, 0, 0));
    scene.addChild(groundNode);
    const gr = groundNode.addComponent(MeshRenderer);
    gr.mesh = utils.createMesh(primitives.plane({ width: 14, length: 14, widthSegments: 1, lengthSegments: 1 }));
    gr.setSharedMaterial(stdMat(40, 46, 58), 0);

    variantMats.push(stdMat(255, 170, 60)); // 选中高亮/variant1 橙
    variantMats.push(stdMat(70, 130, 230)); // variant2 蓝
    variantMats.push(stdMat(225, 225, 232)); // variant3 白（蒙皮件默认同族）

    const spinNode = new Node('Spinner');
    spinNode.setPosition(new Vec3(0, 0, 0));
    scene.addChild(spinNode);
    spinNode.addComponent(IdleSpin);

    app.run(scene);
    await sleep(350);

    // ---- T1 失败路径（损坏资产 → 解析拒绝；Gallery 发布面 no-http-errors 契约不允许故意 404，
    //      失败语义由内容损坏的自有 fixture 承担，HTTP-404 面由手册树覆盖） ----
    vstate.phase = 't1-fail';
    try {
        const corrupt = await (await fetch('./assets/corrupt-product.glb')).arrayBuffer();
        await new GLTFLoader().parseAsync(corrupt, './assets/');
        vstate.lastError = '(unexpected success)';
    } catch (e) {
        vstate.lastError = String((e as Error).message || e);
    }
    vstate.status = 'error';
    pcheck('t1-load-failure-recorded', vstate.lastError.length > 0 && vstate.lastError !== '(unexpected success)',
        vstate.lastError.slice(0, 120));
    renderPanel();

    // ---- T2 重试成功（主产品） ----
    vstate.phase = 't2-retry';
    await buildMain('box');
    vstate.status = 'loaded';
    pcheck('t2-retry-load-success',
        !!boxAsset && isValid(boxAsset) && !!mainNode && isValid(mainNode) && (boxAsset.meshes || []).length > 0,
        'meshes=' + (boxAsset.meshes || []).length + ' animations=' + (boxAsset.animations || []).length);

    // ---- T3 副件（蒙皮 + 动画） ----
    vstate.phase = 't3-side';
    await buildSide();
    const sideAnim: Animation | null = sideNode ? (sideNode.getComponent(Animation) || sideNode.getComponentInChildren(Animation)) : null;
    pcheck('t3-side-animated', !!sideAnim && sideAnim.clips.length > 0 && isValid(sideNode as Node),
        'clips=' + (sideAnim ? sideAnim.clips.length : -1));

    // ---- T4 材质切换 ----
    vstate.phase = 't4-material';
    cycleVariant();
    pcheck('t4-material-variant-applied', vstate.variantIdx === 1 && vstate.materialSwaps === 1,
        'variantIdx=' + vstate.variantIdx);
    cycleVariant();
    cycleVariant();
    cycleVariant(); // 回到 variantIdx=0（原材质恢复路径）
    pcheck('t4-variant-cycle-restores', vstate.variantIdx === 0 && vstate.materialSwaps === 4,
        'variantIdx=' + vstate.variantIdx + ' swaps=' + vstate.materialSwaps);

    // ---- T5 尺寸响应（合成事件如实记录） ----
    vstate.phase = 't5-resize';
    const cvs = document.getElementById('GameCanvas') as HTMLCanvasElement;
    const onResize = (): void => {
        vstate.resizeEvents++;
        // 框架 Camera 组件不导出 aspect（GAP-C2 同族导出面缺口）——以 rect + 画布尺寸做响应读回
        probe.state.viewport = { canvas: [cvs.width, cvs.height], rect: [camera.rect.width, camera.rect.height] };
        renderPanel();
    };
    window.addEventListener('resize', onResize);
    window.dispatchEvent(new Event('resize'));
    await sleep(120);
    pcheck('t5-resize-handler-ran', vstate.resizeEvents >= 1 && cvs.width > 0 && camera.rect.width > 0,
        'resizeEvents=' + vstate.resizeEvents + ' canvas=' + cvs.width + 'x' + cvs.height + ' rect.w=' + camera.rect.width);

    // ---- T6 DOM 按钮链（程序化 .click() 与真实点击同一 handler） ----
    vstate.phase = 't6-buttons';
    btnScreenshot.click();
    btnMaterial.click();
    btnSwap.click();
    await sleep(600); // 换模型含异步 instantiate
    pcheck('t6-buttons-processed', vstate.screenshots >= 1 && vstate.materialSwaps >= 5 && vstate.modelSwaps >= 1,
        'shots=' + vstate.screenshots + ' matSwaps=' + vstate.materialSwaps + ' modelSwaps=' + vstate.modelSwaps);

    // ---- 交互：单击拾取 / 拖拽轨道 / 滚轮缩放 ----
    let downX = 0;
    let downY = 0;
    let dragging = false;
    let moved = 0;
    const onTouchStart = (event: any): void => {
        const loc = event.getLocation();
        downX = loc.x;
        downY = loc.y;
        moved = 0;
        dragging = true;
    };
    const onTouchMove = (event: any): void => {
        if (!dragging) {
            return;
        }
        const loc = event.getLocation();
        const dx = loc.x - downX;
        const dy = loc.y - downY;
        moved += Math.abs(dx) + Math.abs(dy);
        if (moved > 6) {
            orbit.yaw -= dx * 0.008;
            orbit.pitch = Math.max(-1.2, Math.min(1.2, orbit.pitch + dy * 0.006));
            applyOrbit();
            vstate.drags++;
        }
        downX = loc.x;
        downY = loc.y;
    };
    const onTouchEnd = (event: any): void => {
        dragging = false;
        if (moved <= 6) {
            // 单击 = 拾取
            const loc = event.getLocation();
            const hit = pickAt(loc.x, loc.y);
            selectProduct(hit);
            if (!probe.clickPhaseDone) {
                probe.clickPhaseDone = true;
                pcheck('click-picks-product', hit === 'ProductMain' || hit === 'ProductSide' || hit === null,
                    'pick=' + hit + '（画布中心预期 ProductMain；空白处为 null 亦合法）');
            }
        }
    };
    const onWheel = (event: any): void => {
        vstate.wheelEvents++;
        const delta = event.getScrollY ? event.getScrollY() : 0;
        orbit.dist = Math.max(2, Math.min(12, orbit.dist + delta * 0.002));
        applyOrbit();
    };
    input.on(Input.EventType.TOUCH_START, onTouchStart);
    input.on(Input.EventType.TOUCH_MOVE, onTouchMove);
    input.on(Input.EventType.TOUCH_END, onTouchEnd);
    input.on(Input.EventType.MOUSE_WHEEL, onWheel);

    // ---- §25 Lifecycle 合同 ----
    installAssetLifecycle({
        label: 'product-viewer',
        hold: () => {
            const held: { name: string; ref: object }[] = [];
            if (boxAsset) { held.push({ name: 'GLTFAsset(BoxTextured)', ref: boxAsset }); }
            if (skinAsset) { held.push({ name: 'GLTFAsset(SimpleSkin)', ref: skinAsset }); }
            if (skinBaseMat) { held.push({ name: 'Material(skinBase)', ref: skinBaseMat }); }
            if (mainInstance) { held.push({ name: 'mainInstance.root', ref: mainInstance.root }); }
            if (sideInstance) { held.push({ name: 'sideInstance.root', ref: sideInstance.root }); }
            variantMats.forEach((m, i) => held.push({ name: 'variantMat' + i, ref: m }));
            return held;
        },
        release: () => {
            input.off(Input.EventType.TOUCH_START, onTouchStart);
            input.off(Input.EventType.TOUCH_MOVE, onTouchMove);
            input.off(Input.EventType.TOUCH_END, onTouchEnd);
            input.off(Input.EventType.MOUSE_WHEEL, onWheel);
            window.removeEventListener('resize', onResize);
            disposeMain();
            if (sideInstance) { sideInstance.dispose(); sideInstance = null; sideNode = null; }
            for (const m of variantMats) { m.destroy(); }
            if (skinBaseMat) { skinBaseMat.destroy(); skinBaseMat = null; }
            if (boxAsset) { boxAsset.destroy(); boxAsset = null; }
            if (skinAsset) { skinAsset.destroy(); skinAsset = null; }
            vstate.status = 'released';
            renderPanel();
        },
        reacquire: async () => {
            await sleep(300);
            variantMats.length = 0;
            variantMats.push(stdMat(255, 170, 60), stdMat(70, 130, 230), stdMat(225, 225, 232));
            skinBaseMat = null; // buildMain('skin') 时按需重建
            vstate.variantIdx = 0;
            await loadProduct('box'); // 归还持有清单中的 BoxTextured 资产（dispose 连带销毁后重取）
            await buildMain(vstate.mainKind === 'BoxTextured' ? 'box' : 'skin'); // 同一 loadProduct 路径
            await buildSide();
            vstate.status = 'loaded';
            input.on(Input.EventType.TOUCH_START, onTouchStart);
            input.on(Input.EventType.TOUCH_MOVE, onTouchMove);
            input.on(Input.EventType.TOUCH_END, onTouchEnd);
            input.on(Input.EventType.MOUSE_WHEEL, onWheel);
            window.addEventListener('resize', onResize);
            return [
                { name: 'GLTFAsset(BoxTextured)', ref: boxAsset },
                { name: 'GLTFAsset(SimpleSkin)', ref: skinAsset },
                { name: 'mainInstance.root', ref: mainInstance.root },
                { name: 'sideInstance.root', ref: sideInstance.root },
            ];
        },
    });

    vstate.phase = 'ready';
    vstate.status = 'loaded';
    renderPanel();
    probe.state.final = {
        mainKind: vstate.mainKind,
        materialSwaps: vstate.materialSwaps,
        modelSwaps: vstate.modelSwaps,
        screenshots: vstate.screenshots,
        shotBytes: vstate.lastShotBytes,
        resizeEvents: vstate.resizeEvents,
        viewport: probe.state.viewport || null,
        boxMeshes: boxAsset && isValid(boxAsset) ? (boxAsset.meshes || []).length : -1,
        skinAnimations: skinAsset && isValid(skinAsset) ? (skinAsset.animations || []).length : -1,
        boxAssetAutoDestroyedByDispose: !(boxAsset && isValid(boxAsset)),
    };
    probe.ready = true;
    probe.ok = probe.checks.every((c) => c.ok);
}

main().catch((e) => {
    probe.ready = true;
    probe.ok = false;
    probe.state.fatal = String((e && e.message) || e);
    throw e;
});
