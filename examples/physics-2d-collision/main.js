/**
 * Cocos AIR — physics-2d-collision（LV12-13 接触事件 / sensor / 碰撞过滤，box2d 后端）
 *
 * 全部数值来自**手工确定性驱动**，与帧率无关：
 *   physics.autoSimulation = false
 *   world.syncSceneToPhysics() → N × physics.step(fixedTimeStep) → world.syncPhysicsToScene()
 * ⇒ 结果只由 step 次数决定，三引擎（chromium/firefox/webkit）读回逐字节同构。
 *
 * 三条要写下来的上游事实：
 * 1) `autoSimulation = false` 会让 `physics-system.ts` 的 `postUpdate()` 提前 return，帧变换同步
 *    与 debug draw 一起停掉 —— 位置回写必须由上面第 3 步代替。
 * 2) 接触回调的门控发生在 **emit 时**（`box2d/physics-contact.ts` 的 `PhysicsContact.emit`）：
 *    只有 `collider.body.enabledContactListener` 为真的那一侧收到事件。所以「晚开」的刚体拿不到
 *    已经发生过的 BEGIN_CONTACT，但同一接触的 PRE_SOLVE / POST_SOLVE / END_CONTACT 仍会送达。
 * 3) 过滤位 `categoryBits`/`maskBits` 只在**创建 fixture 时**读一次（`box2d/shapes/shape-2d.ts` 的
 *    `getFilter`）⇒ 改 `PhysicsSystem2D.collisionMatrix` 后必须 `Collider2D.apply()` 才生效；
 *    box2d 的判定是**双向**的，单向开 mask 不产生接触。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Canvas,
    Component,
    UITransform,
    Layers,
    Color,
    Sprite,
    Label,
    SpriteFrame,
    Texture2D,
    ImageAsset,
    Size,
    Vec2,
    PhysicsSystem2D,
    PHYSICS_2D_PTM_RATIO,
    RigidBody2D,
    Collider2D,
    BoxCollider2D,
    CircleCollider2D,
    ERigidBody2DType,
    Contact2DType,
    PhysicsGroup,
    view,
    ResolutionPolicy,
} from 'cocosair';
import { installAssetLifecycle } from '../shared/asset-lifecycle.js';

const UI_LAYER = Layers.Enum.UI_3D;
const r2 = (v) => Math.round(v * 100) / 100;
const safe = (fn) => {
    try {
        const v = fn();
        return v === undefined ? 'undefined' : v;
    } catch (e) {
        return 'ERR:' + e.message;
    }
};

// ---- 运行期生成贴图（零第三方资产）----
const frameCache = new Map();
const spriteSlots = [];

function createFrame(key, cssColor, w, h, radius) {
    if (frameCache.has(key)) {
        return frameCache.get(key).spriteFrame;
    }
    const cvs = document.createElement('canvas');
    cvs.width = w;
    cvs.height = h;
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = cssColor;
    if (radius > 0) {
        ctx.beginPath();
        ctx.roundRect(0, 0, w, h, radius);
        ctx.fill();
    } else {
        ctx.fillRect(0, 0, w, h);
    }
    const image = new ImageAsset(cvs);
    const texture = new Texture2D();
    texture.image = image;
    const spriteFrame = new SpriteFrame();
    spriteFrame.texture = texture;
    frameCache.set(key, { spriteFrame, texture, image });
    return spriteFrame;
}

function assignFrame(slot) {
    slot.sprite.spriteFrame = createFrame(slot.key, slot.color, slot.w, slot.h, slot.radius);
}

function makeBody(spec) {
    const node = new Node(spec.name);
    node.layer = UI_LAYER;
    const t = node.addComponent(UITransform);
    t.width = spec.w;
    t.height = spec.h;
    node.setPosition(spec.x, spec.y, 0);
    node.parent = canvasNode;
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    const slot = {
        name: spec.name,
        key: spec.name,
        color: spec.color,
        w: spec.w,
        h: spec.h,
        radius: spec.shape === 'circle' ? spec.w / 2 : 6,
        sprite,
    };
    spriteSlots.push(slot);
    assignFrame(slot);

    const body = node.addComponent(RigidBody2D);
    body.type = spec.static ? ERigidBody2DType.Static : ERigidBody2DType.Dynamic;
    body.enabledContactListener = spec.listener !== false;

    const collider = spec.shape === 'circle' ? node.addComponent(CircleCollider2D) : node.addComponent(BoxCollider2D);
    if (spec.shape === 'circle') {
        collider.radius = spec.w / 2;
    } else {
        collider.size = new Size(spec.w, spec.h);
    }
    collider.density = spec.density === undefined ? 1 : spec.density;
    collider.friction = spec.friction === undefined ? 0.2 : spec.friction;
    collider.restitution = spec.restitution === undefined ? 0 : spec.restitution;
    collider.group = spec.group === undefined ? PhysicsGroup.DEFAULT : spec.group;
    if (spec.sensor) {
        collider.sensor = true;
    }
    return { name: spec.name, node, body, collider, start: [spec.x, spec.y], slot };
}

// ---- 启动：先配置物理系统，再挂组件 ----
const canvasEl = document.querySelector('#GameCanvas');
const app = await createAirApp({ canvas: canvasEl });
view.setDesignResolutionSize(window.innerWidth, window.innerHeight, ResolutionPolicy.EXACT_FIT);

const physics = PhysicsSystem2D.instance;
physics.enable = true;
physics.autoSimulation = false; // 确定性手工驱动，见文件头

const scene = new Scene('v12-physics-2d-collision');
const canvasNode = new Node('Canvas');
canvasNode.layer = UI_LAYER;
canvasNode.addComponent(UITransform).width = 480;
canvasNode.getComponent(UITransform).height = 360;
const canvas = canvasNode.addComponent(Canvas);
scene.addChild(canvasNode);

const cameraNode = new Node('UICamera');
cameraNode.layer = UI_LAYER;
cameraNode.addComponent(UITransform).width = 1;
const cam = cameraNode.addComponent(Camera);
cam.projection = Camera.ProjectionType.ORTHO;
cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
cam.clearColor = new Color(22, 28, 40, 255);
cam.visibility = UI_LAYER;
canvasNode.addChild(cameraNode);
canvas.cameraComponent = cam;

// Ground 上表面 y=-120；SensorBand 覆盖 y∈[-54,-18]
const ground = makeBody({
    name: 'Ground',
    static: true,
    x: 0,
    y: -130,
    w: 440,
    h: 20,
    color: '#465064',
    listener: true,
});
const band = makeBody({
    name: 'SensorBand',
    static: true,
    x: 0,
    y: -36,
    w: 440,
    h: 36,
    color: '#2f6f7a',
    sensor: true,
    listener: true,
});

const FALL_Y = 130;
const box = makeBody({ name: 'Box', x: -160, y: FALL_Y, w: 40, h: 40, color: '#c88c46', friction: 0.3 });
const ball = makeBody({
    name: 'Ball',
    x: -80,
    y: FALL_Y,
    w: 40,
    h: 40,
    shape: 'circle',
    color: '#5ac878',
    restitution: 0.6,
    friction: 0.1,
});
const mute = makeBody({
    name: 'Mute',
    x: 0,
    y: FALL_Y,
    w: 40,
    h: 40,
    color: '#b0b6c0',
    friction: 0.3,
    listener: false,
});
const p = makeBody({ name: 'P', x: 70, y: FALL_Y, w: 30, h: 30, color: '#5aa0f0', group: 2 });
const q = makeBody({ name: 'Q', x: 95, y: FALL_Y, w: 30, h: 30, color: '#f0c04a', group: 4 });

const fallers = [box, ball, mute, p, q];
const pqPair = [p, q];
const tracked = [ground, band].concat(fallers);

const statusLabel = (() => {
    const node = new Node('Status');
    node.layer = UI_LAYER;
    const t = node.addComponent(UITransform);
    t.width = 460;
    t.height = 22;
    node.setPosition(-10, 158, 0);
    node.parent = canvasNode;
    const label = node.addComponent(Label);
    label.string = 'physics-2d collision (box2d) — click to run the deterministic sequence';
    label.fontSize = 15;
    label.lineHeight = 19;
    label.color = Color.WHITE;
    return label;
})();

// ---- 事件记录：按 (类型|A|B) 计数，每种最多留 2 条样本 ----
const EVENTS = [
    Contact2DType.BEGIN_CONTACT,
    Contact2DType.END_CONTACT,
    Contact2DType.PRE_SOLVE,
    Contact2DType.POST_SOLVE,
];
const tally = {};
let stepIndex = 0;

function sampleContact(contact) {
    const wm = safe(() => contact.getWorldManifold());
    const md = safe(() => contact.getManifold());
    const imp = safe(() => contact.getImpulse());
    const ok = (o) => !!o && typeof o === 'object';
    return {
        step: stepIndex,
        touching: safe(() => contact.isTouching()),
        pts: ok(wm) ? wm.points.map((pt) => [r2(pt.x), r2(pt.y)]) : [],
        sep: ok(wm) ? wm.separations.map(r2) : [],
        n: ok(wm) ? [r2(wm.normal.x), r2(wm.normal.y)] : [],
        mType: ok(md) ? md.type : -1,
        fr: safe(() => contact.getFriction()),
        re: safe(() => contact.getRestitution()),
        impN: ok(imp) ? imp.normalImpulses.map(r2) : 'impulse-null',
        impT: ok(imp) ? imp.tangentImpulses.map(r2) : 'impulse-null',
    };
}

function onContact(type) {
    return (self, other, contact) => {
        // 方向键：接收方在前。同一接触的两侧是否收到事件，取决于各自刚体的 enabledContactListener。
        const key = `${type}|${self.node.name}<->${other.node.name}`;
        let entry = tally[key];
        if (!entry) {
            entry = tally[key] = { count: 0, firstStep: stepIndex, lastStep: stepIndex, samples: [] };
        }
        entry.count += 1;
        entry.lastStep = stepIndex;
        if (entry.samples.length < 2) {
            entry.samples.push(sampleContact(contact));
        }
    };
}

for (const item of tracked) {
    for (const type of EVENTS) {
        item.collider.on(type, onContact(type));
    }
}

// ---- 手工驱动 ----
const world = physics.physicsWorld;
const dt = physics.fixedTimeStep;

function drive(n) {
    world.syncSceneToPhysics();
    for (let i = 0; i < n; i++) {
        stepIndex += 1;
        physics.step(dt);
    }
    world.syncPhysicsToScene();
}

function velocityOf(item) {
    const v = safe(() => item.body.linearVelocity);
    return v && typeof v === 'object' && v.x !== undefined ? [r2(v.x), r2(v.y)] : String(v);
}

function positions() {
    const out = {};
    for (const item of tracked) {
        out[item.name] = [r2(item.node.position.x), r2(item.node.position.y)];
    }
    return out;
}

function velocities() {
    const out = {};
    for (const item of tracked) {
        out[item.name] = velocityOf(item);
    }
    return out;
}

function applyFilter(...items) {
    for (const item of items) {
        item.collider.apply();
    }
}

function resetBodies(items) {
    for (const item of items) {
        item.node.setPosition(item.start[0], item.start[1], 0);
        item.body.linearVelocity = new Vec2(0, 0);
        item.body.angularVelocity = 0;
        item.body.wakeUp();
    }
}

const matrix = physics.collisionMatrix;
const defaultMatrix = Object.assign({}, matrix);
const phases = [];

function snapshot(index, name, note) {
    phases[index] = {
        index,
        name,
        note,
        stepIndex,
        positions: positions(),
        velocities: velocities(),
        tally: JSON.parse(JSON.stringify(tally)),
    };
}

function at(phaseIdx, type, self, other) {
    const t = phases[phaseIdx] ? phases[phaseIdx].tally[`${type}|${self}<->${other}`] : null;
    return t || { count: 0, firstStep: -1, lastStep: -1, samples: [{}] };
}
function cnt(phaseIdx, type, self, other) {
    return at(phaseIdx, type, self, other).count;
}
function fst(phaseIdx, type, self, other) {
    return at(phaseIdx, type, self, other).firstStep;
}
function smp(phaseIdx, type, self, other) {
    return at(phaseIdx, type, self, other).samples[0];
}
function posY(phaseIdx, name) {
    return phases[phaseIdx] ? phases[phaseIdx].positions[name][1] : 0;
}
function posX(phaseIdx, name) {
    return phases[phaseIdx] ? phases[phaseIdx].positions[name][0] : 0;
}
function gap(phaseIdx) {
    return r2(posX(phaseIdx, 'Q') - posX(phaseIdx, 'P'));
}

function runSequence() {
    if (phases.length) {
        return;
    }
    snapshot(0, 'initial', '未模拟：全部在起始高度 y=130');

    // 1) 默认 collisionMatrix 下自由落体。Box/Ball/Mute（category 1，mask[1]=1）穿过 sensor 带落到地面；
    //    P(2)/Q(4) 的 mask 默认为 0 ⇒ 既穿 sensor 也穿地面。Mute 的 listener 此段为 false。
    drive(90);
    snapshot(1, 'fall-and-sensor', '落地 + sensor 穿过；Mute 侧全程收不到事件');

    // 2) 已静止接触后才打开 Mute 的 listener：补不回 BEGIN，但 PRE_SOLVE/POST_SOLVE 立刻送达。
    mute.body.enabledContactListener = true;
    drive(30);
    snapshot(2, 'listener-late-on', '门控在 emit 时：Mute 侧无 begin 却有 pre/post');

    // 3) 单向开 mask（matrix[2]=1，地面 matrix[1] 仍不含 2）⇒ box2d 双向条件不成立，P 仍穿地。
    resetBodies(pqPair);
    matrix[2] = 1;
    applyFilter(p);
    drive(90);
    snapshot(3, 'filter-asymmetric', 'matrix[2]=1 单向 ⇒ 无接触，P/Q 直穿地面');

    // 4) 双向补齐 ⇒ P 落地；P/Q 精确重叠 5px 但互相仍被过滤（mask[2] 不含 4）。
    resetBodies(pqPair);
    matrix[1] = 1 | 2;
    applyFilter(ground, p);
    drive(90);
    snapshot(4, 'filter-symmetric-p', 'P 落地，与 Q 重叠却无 P|Q 接触');

    // 5) 让 P/Q 互相可见 ⇒ 5px 重叠沿 x 被推开，且两者都能落到地面。
    resetBodies(pqPair);
    matrix[1] = 1 | 2 | 4;
    matrix[2] = 1 | 4;
    matrix[4] = 1 | 2;
    applyFilter(ground, p, q);
    drive(90);
    snapshot(5, 'filter-pq-open', 'P<->Q 接触 ⇒ 位置沿 x 分离，两者都落地');

    // 6) 把过滤位全部清掉但**不** apply()：fixture 只在创建时读一次 filter ⇒ 仍然被地面托住。
    matrix[1] = 1;
    matrix[2] = 0;
    matrix[4] = 0;
    drive(40);
    snapshot(6, 'filter-clear-no-apply', '改 matrix 不 apply ⇒ 支撑不变');

    // 7) 这时才 apply() ⇒ filter 重读，P/Q 立刻穿地。
    applyFilter(ground, p, q);
    drive(30);
    snapshot(7, 'filter-clear-applied', 'apply() 后 filter 生效 ⇒ P/Q 穿地');

    drive(30);
    snapshot(8, 'settle', '终态');

    const s = summary();
    statusLabel.string = `collision step=${s.stepIndex} keys=${s.tallyKeys} P↔Q gap ${s.pqGapFiltered}px→${s.pqGapOpen}px`;
}

const preClickPositions = positions();

function summary() {
    const pos = phases.length ? phases[phases.length - 1].positions : preClickPositions;
    const boxSensor = smp(1, Contact2DType.BEGIN_CONTACT, 'Box', 'SensorBand');
    const boxBegin = smp(1, Contact2DType.BEGIN_CONTACT, 'Box', 'Ground');
    const boxPost = smp(1, Contact2DType.POST_SOLVE, 'Box', 'Ground');
    const ballPost = smp(1, Contact2DType.POST_SOLVE, 'Ball', 'Ground');
    return {
        backend: PhysicsSystem2D.PHYSICS_BOX2D
            ? 'box2d'
            : PhysicsSystem2D.PHYSICS_BUILTIN
              ? 'builtin'
              : PhysicsSystem2D.PHYSICS_BOX2D_WASM
                ? 'box2d-wasm'
                : 'none',
        worldCtor: physics.physicsWorld.constructor.name,
        ptmRatio: PHYSICS_2D_PTM_RATIO,
        autoSimulation: !!physics.autoSimulation,
        fixedTimeStepR2: r2(dt),
        gravityY: physics.gravity.y,
        stepIndex,
        tallyKeys: Object.keys(tally).length,
        colliderIsBase: box.collider instanceof Collider2D,
        sensorFlag: !!band.collider.sensor,
        groupDefault: PhysicsGroup.DEFAULT,
        muteListenerNow: !!mute.body.enabledContactListener,
        // ---- sensor：only 触发事件，不参与碰撞求解 ----
        sensorBeginStep: fst(1, Contact2DType.BEGIN_CONTACT, 'Box', 'SensorBand'),
        sensorEndStep: fst(1, Contact2DType.END_CONTACT, 'Box', 'SensorBand'),
        sensorCount: cnt(1, Contact2DType.BEGIN_CONTACT, 'Box', 'SensorBand'),
        sensorPts: (boxSensor.pts || []).length,
        sensorSep: (boxSensor.sep || []).length,
        sensorNormal: JSON.stringify(boxSensor.n || []),
        sensorManifoldType: boxSensor.mType,
        sensorImpulse: String(boxSensor.impN),
        sensorTouching: boxSensor.touching,
        // ---- 实体接触：四事件时序 + manifold + impulse 只在 POST_SOLVE 存活 ----
        boxBeginStep: fst(1, Contact2DType.BEGIN_CONTACT, 'Box', 'Ground'),
        boxPreStep: fst(1, Contact2DType.PRE_SOLVE, 'Box', 'Ground'),
        boxPostStep: fst(1, Contact2DType.POST_SOLVE, 'Box', 'Ground'),
        boxEndStep: fst(2, Contact2DType.END_CONTACT, 'Box', 'Ground'),
        boxBeginPts: JSON.stringify(boxBegin.pts || []),
        boxBeginNormal: JSON.stringify(boxBegin.n || []),
        boxManifoldType: boxBegin.mType,
        boxBeginImpulse: String(boxBegin.impN),
        boxPostPts: JSON.stringify(boxPost.pts || []),
        boxPostImpN: JSON.stringify(boxPost.impN || []),
        boxPostImpT: JSON.stringify(boxPost.impT || []),
        boxFrictionCombine: r2(boxPost.fr),
        boxRestitutionCombine: r2(boxPost.re),
        ballRestitutionCombine: r2(ballPost.re),
        ballPostImpN: JSON.stringify(ballPost.impN || []),
        ballBounces: cnt(1, Contact2DType.BEGIN_CONTACT, 'Ball', 'Ground'),
        ballEndStep: fst(1, Contact2DType.END_CONTACT, 'Ball', 'Ground'),
        ballEndCount: cnt(1, Contact2DType.END_CONTACT, 'Ball', 'Ground'),
        // ---- listener 门控：同一接触，Ground 侧收到、Mute 侧收不到；晚开后 pre/post 立刻有、begin 仍为 0 ----
        muteSideBeginBeforeFlip: cnt(1, Contact2DType.BEGIN_CONTACT, 'Mute', 'Ground'),
        groundSideBeginAtFlip: cnt(1, Contact2DType.BEGIN_CONTACT, 'Ground', 'Mute'),
        muteSideBeginAfterFlip: cnt(2, Contact2DType.BEGIN_CONTACT, 'Mute', 'Ground'),
        muteSidePreAfterFlip: cnt(2, Contact2DType.PRE_SOLVE, 'Mute', 'Ground'),
        muteSidePostAfterFlip: cnt(2, Contact2DType.POST_SOLVE, 'Mute', 'Ground'),
        muteSidePreFirstStep: fst(2, Contact2DType.PRE_SOLVE, 'Mute', 'Ground'),
        // ---- 过滤：默认矩阵 / 单向 / 双向 / P↔Q ----
        pDefaultFellTo: posY(1, 'P'),
        pAsymFellTo: posY(3, 'P'),
        pAsymBegin: cnt(3, Contact2DType.BEGIN_CONTACT, 'P', 'Ground'),
        pSymRestY: posY(4, 'P'),
        qSymFellTo: posY(4, 'Q'),
        pqBeginSymmetric: cnt(4, Contact2DType.BEGIN_CONTACT, 'P', 'Q'),
        pqGapFiltered: gap(4),
        pqBeginOpen: cnt(5, Contact2DType.BEGIN_CONTACT, 'P', 'Q'),
        pqGapOpen: gap(5),
        pNoApplyRestY: posY(6, 'P'),
        qNoApplyRestY: posY(6, 'Q'),
        pqGapNoApply: gap(6),
        pAfterApplyFellTo: posY(7, 'P'),
        qAfterApplyFellTo: posY(7, 'Q'),
        matrixFinal: JSON.stringify([matrix[1], matrix[2], matrix[4]]),
        // ---- 终态 ----
        boxRestY: pos.Box[1],
        ballRestY: pos.Ball[1],
        muteRestY: pos.Mute[1],
        pRestY: pos.P[1],
        qRestY: pos.Q[1],
        positions: pos,
    };
}

canvasNode.on(Node.EventType.TOUCH_START, runSequence);

class CollisionReadout extends Component {
    update() {
        window.__geom = readback();
    }
}
canvasNode.addComponent(CollisionReadout);

function readback() {
    return {
        summary: summary(),
        before: preClickPositions,
        contactTypes: EVENTS.slice(),
        defaultMatrix: Object.assign({}, defaultMatrix),
        matrix: Object.assign({}, matrix),
        masses: {
            Ground: safe(() => ground.body.getMass()),
            Box: safe(() => box.body.getMass()),
            Ball: safe(() => ball.body.getMass()),
        },
        positions: positions(),
        velocities: velocities(),
        tally,
        phases,
    };
}

function ownedAssets() {
    return [...frameCache.entries()].flatMap(([name, entry]) => [
        { name: `SpriteFrame:${name}`, ref: entry.spriteFrame },
        { name: `Texture2D:${name}`, ref: entry.texture },
        { name: `ImageAsset:${name}`, ref: entry.image },
    ]);
}

installAssetLifecycle({
    label: 'physics-2d-collision',
    hold: ownedAssets,
    release: () => {
        for (const slot of spriteSlots) {
            slot.sprite.spriteFrame = null;
        }
        for (const asset of ownedAssets()) {
            asset.ref.destroy();
        }
        frameCache.clear();
    },
    reacquire: () => {
        for (const slot of spriteSlots) {
            assignFrame(slot);
        }
        return ownedAssets();
    },
});

window.__airApp = app;
window.__runSequence = runSequence;
app.run(scene);

window.__probe = async () => readback();
