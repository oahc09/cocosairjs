/* W05 坐标空间探针（tools/debug/probes 隔离，不登记 files.json，不进 Gallery/coverage）。
 *
 * 同一鼠标事件读取各空间数值并断言（DPR 1/2 两模式由运行器 deviceScaleFactor 驱动）：
 *   A_location   — EventMouse.getLocation()：左下原点像素 = (clientX, H*dpr - clientY*dpr)，
 *                  DPR=2 下同样精确（乘法发生在 PAL，不依赖启动缓冲尺寸）；
 *   B_uiLocation — getUILocation() 与 getLocation 的 DPR 换算关系（记录 + 宽容断言）；
 *   C_worldRay   — camera.screenPointToRay(location) 中心点击 → 与 (0,1,0)（相机 lookAt 点）
 *                  命中误差 < 0.01（屏幕→世界必须经相机，不能从像素直接减）；
 *   D_localAR    — 变换父节点（平移+旋转+缩放）下 UITransform.convertToNodeSpaceAR(world)
 *                  往返 ≈ 子节点 localPosition（ε=1e-3）——设计/世界→局部必须经世界矩阵；
 *   E_trap       — 「朴素对画面中心相减」的伪局部坐标与真值偏差显著（反例留证）。
 *
 * 运行：NODE_PATH=<playwright> node tools/verify/w05-coordinate-spaces.cjs
 * 证据：docs/evidence/w05-coordinate-spaces.json
 */
import {
    createAirApp,
    Scene,
    Node,
    MeshRenderer,
    Camera,
    DirectionalLight,
    Layers,
    Vec3,
    Color,
    Material,
    utils,
    primitives,
    UITransform,
    input,
    Input,
} from 'cocosair';

const probe = { id: 'coordinate-spaces-probe', ready: false, ok: true, checks: [], samples: {}, info: {} };
window.__coordProbe = probe;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, pass, detail) {
    probe.checks.push({ name, pass: !!pass, detail: detail === undefined ? undefined : String(detail) });
    if (!pass) {
        probe.ok = false;
    }
}
const r3 = (v) => Math.round(v * 1000) / 1000;

const app = await createAirApp({ canvas: '#GameCanvas' });
const scene = new Scene('coord-probe');
const cameraNode = new Node('Cam');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.6, 6));
cameraNode.lookAt(new Vec3(0, 1, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(30, 40, 60, 255);
camera.visibility = Layers.Enum.DEFAULT;
const lightNode = new Node('Light');
scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 8, 0));
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight).illuminance = 65000;
const box = new Node('Box');
box.layer = Layers.Enum.DEFAULT;
scene.addChild(box);
box.setPosition(new Vec3(0, 1, 0));
const renderer = box.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1.6, height: 1.6, length: 1.6 }));
const mat = new Material();
mat.initialize({ effectName: 'builtin-standard' });
mat.setProperty('mainColor', new Color(70, 120, 235, 255));
renderer.setSharedMaterial(mat, 0);

// 变换父节点 + UITransform 子节点（D/E 载体；父也挂 UITransform 作世界→局部的转换面）
const parent = new Node('TransformedParent');
scene.addChild(parent);
parent.setPosition(new Vec3(2, 0.5, -1));
parent.setRotationFromEuler(0, 30, 0);
parent.setScale(new Vec3(2, 1.5, 1));
parent.addComponent(UITransform);
const child = new Node('Child');
parent.addChild(child);
child.setPosition(new Vec3(0.3, 0.2, 0.1));
child.addComponent(UITransform);

app.run(scene);
await sleep(600);
probe.info.dpr = window.devicePixelRatio;

// ---- D/E：世界→局部必须经（父节点）世界矩阵 / convertToNodeSpaceAR ----
child.updateWorldTransform();
const worldPos = child.worldPosition.clone();
// 正法：子世界位经父 UITransform 转局部 ≈ child.position（平移+旋转+缩放全载荷）
const localViaAR = parent.getComponent(UITransform).convertToNodeSpaceAR(worldPos);
const naiveLocal = new Vec3(worldPos.x - 0, worldPos.y - 1, worldPos.z - 0); // 朴素「减画面中心」反例
probe.samples.D_localAR = {
    world: [r3(worldPos.x), r3(worldPos.y), r3(worldPos.z)],
    localExpected: [r3(child.position.x), r3(child.position.y), r3(child.position.z)],
    localViaAR: [r3(localViaAR.x), r3(localViaAR.y), r3(localViaAR.z)],
    naiveCenterSubtract: [r3(naiveLocal.x), r3(naiveLocal.y), r3(naiveLocal.z)],
};
const dErr = Math.hypot(
    localViaAR.x - child.position.x,
    localViaAR.y - child.position.y,
    localViaAR.z - child.position.z,
);
const trapErr = Math.hypot(
    naiveLocal.x - child.position.x,
    naiveLocal.y - child.position.y,
    naiveLocal.z - child.position.z,
);
check('D_local_roundtrip', dErr < 1e-3, `err=${r3(dErr)}`);
check('E_trap_deviation', trapErr > 0.1, `naive err=${r3(trapErr)}（必须显著大于真法）`);

// ---- 事件驱动空间读取（运行器点击画布中心 640,360） ----
let eventRecord = null;
input.on(Input.EventType.MOUSE_DOWN, (e) => {
    const loc = e.getLocation();
    const ui = e.getUILocation();
    eventRecord = {
        loc: { x: Math.round(loc.x), y: Math.round(loc.y) },
        ui: { x: Math.round(ui.x * 10) / 10, y: Math.round(ui.y * 10) / 10 },
    };
});
window.__coordArmed = true;
const t0 = Date.now();
while (!window.__coordClick && Date.now() - t0 < 20000) {
    await sleep(80);
}
if (window.__coordClick) {
    const { clientX, clientY, viewportH } = window.__coordClick;
    const dpr = window.devicePixelRatio;
    const expectLoc = { x: Math.round(clientX * dpr), y: Math.round((viewportH - clientY) * dpr) };
    probe.samples.A_location = { recorded: eventRecord && eventRecord.loc, expected: expectLoc };
    check(
        'A_location_mapping',
        eventRecord && eventRecord.loc.x === expectLoc.x && eventRecord.loc.y === expectLoc.y,
        eventRecord ? JSON.stringify(eventRecord.loc) + ' expect ' + JSON.stringify(expectLoc) : 'no event',
    );

    // B：UI 空间合同（默认无设计分辨率覆写：UI 空间=画布像素空间，ui ≈ loc；
    // 显式设置设计分辨率后该关系随缩放变化——手册 picking.md 记录本默认合同）
    if (eventRecord) {
        probe.samples.B_uiLocation = { ui: eventRecord.ui, loc: eventRecord.loc };
        check(
            'B_ui_location_default_contract',
            Math.abs(eventRecord.ui.x - eventRecord.loc.x) <= 2 && Math.abs(eventRecord.ui.y - eventRecord.loc.y) <= 2,
            `ui=${JSON.stringify(eventRecord.ui)} vs loc=${JSON.stringify(eventRecord.loc)}`,
        );
    }

    // C：屏幕 → 世界（相机射线经屏幕中心 = 相机 lookAt 点 (0,1,0)，与点击点解耦）
    const dprNow = window.devicePixelRatio;
    const centerLoc = { x: Math.round(640 * dprNow), y: Math.round(360 * dprNow) };
    const ray = camera.screenPointToRay(centerLoc.x, centerLoc.y);
    // 中心射线朝向 (0,1,0)：从 origin 沿 dir 求与点 (0,1,0) 的最近距离
    const o = ray.o;
    const d = ray.d;
    const target = new Vec3(0, 1, 0);
    const w = Math.max(0, Math.min(10, Vec3.dot(target.clone().subtract(o), d)));
    const hit = new Vec3(o.x + d.x * w, o.y + d.y * w, o.z + d.z * w);
    const miss = Vec3.distance(hit, target);
    probe.samples.C_worldRay = {
        origin: [r3(o.x), r3(o.y), r3(o.z)],
        hit: [r3(hit.x), r3(hit.y), r3(hit.z)],
        missDistance: r3(miss),
    };
    check('C_ray_hits_lookat', miss < 0.01, `miss=${r3(miss)}`);
} else {
    check('runner_click_timeout', false, 'no __coordClick within 20s');
}
probe.ready = true;
