/**
 * Cocos AIR — physics-2d-basic（LV12-13 RigidBody2D + Collider2D 挂载与查询，不模拟）
 *
 * 默认发行产物的 2D 后端是 **box2d**（决策 D7：`src/exports/air.ts` 接线 `./physics-2d-box2d`，
 * @cocos/box2d 纯 JS 端口）：运行时 `PhysicsSystem2D.PHYSICS_BOX2D === true`、
 * `PHYSICS_BUILTIN === false`，`physicsWorld` 实际类型 `b2PhysicsWorld`。
 * 因此 `testPoint / testAABB / raycast` 三类查询全部真实命中（raycast 不是空实现——
 * 空实现只属于未接线的 builtin 后端，见 `src/cocos/physics-2d/builtin/builtin-world.ts:285`）。
 *
 * 两条必须写下来的上游事实：
 * 1) `BoxCollider2D` 的尺寸默认是 **1×1**（`box-collider-2d.ts:38` `private _size = new Size(1, 1)`），
 *    **不会**跟随 UITransform 的 contentSize。漏设 size 时地面只有 1×1，动态体会穿过它坠落——
 *    本示例先踩过这个坑，故把 size 显式设为节点尺寸并断言 worldAABB 的宽高。
 * 2) 计划书本组范围是「挂载与查询，不模拟」。做到"不模拟"的手段是**逐刚体 `gravityScale = 0`**，
 *    不是 `autoSimulation = false`：后者在 `framework/physics-system.ts:274-284` 的 `postUpdate()`
 *    里提前 return，会把 `syncSceneToPhysics()` 一起关掉（实测：改节点变换 + `apply()` 后
 *    `step()` 一次，形状被拉回旧位置，查询始终命中旧位置）。重力仍是 (0,-320)、自动模拟仍开着，
 *    于是变换同步是活的，而画面与读回都不漂移。接触回调/碰撞求解属 physics-2d-collision 与 D3/R8 的范围。
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
    Vec2,
    Size,
    Rect,
    Label,
    Sprite,
    SpriteFrame,
    Texture2D,
    ImageAsset,
    PhysicsSystem2D,
    PHYSICS_2D_PTM_RATIO,
    RigidBody2D,
    Collider2D,
    BoxCollider2D,
    CircleCollider2D,
    PolygonCollider2D,
    ERigidBody2DType,
    ERaycast2DType,
    view,
    ResolutionPolicy,
} from 'cocosair';
import { installAssetLifecycle } from '../shared/asset-lifecycle.js';

const UI_LAYER = Layers.Enum.UI_3D;

// ---- 运行期生成贴图（零第三方资产）：canvas → ImageAsset → Texture2D → SpriteFrame ----
const frameCache = new Map();
const spriteSlots = [];

function createFrame (key, cssColor, w, h, radius) {
    if (frameCache.has(key)) { return frameCache.get(key).spriteFrame; }
    const cvs = document.createElement('canvas');
    cvs.width = w; cvs.height = h;
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = cssColor;
    if (radius > 0) { ctx.beginPath(); ctx.roundRect(0, 0, w, h, radius); ctx.fill(); } else { ctx.fillRect(0, 0, w, h); }
    const image = new ImageAsset(cvs);
    const texture = new Texture2D();
    texture.image = image;
    const spriteFrame = new SpriteFrame();
    spriteFrame.texture = texture;
    frameCache.set(key, { spriteFrame, texture, image });
    return spriteFrame;
}

function assignFrame (slot) {
    slot.sprite.spriteFrame = createFrame(slot.key, slot.color, slot.w, slot.h, slot.radius);
}

function makeBox (name, parent, x, y, w, h) {
    const node = new Node(name);
    node.layer = UI_LAYER;
    const t = node.addComponent(UITransform);
    t.width = w;
    t.height = h;
    node.setPosition(x, y, 0);
    parent.addChild(node);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM; // 必须先设 CUSTOM 再赋 spriteFrame，否则节点被裁到纹理尺寸
    const slot = { name, key: name, color: '#ffffff', w, h, radius: Math.min(8, h / 3), sprite };
    spriteSlots.push(slot);
    assignFrame(slot);
    return node;
}

function addLabel (parent, text, x, y) {
    const node = new Node('Status');
    node.layer = UI_LAYER;
    const t = node.addComponent(UITransform);
    t.width = 460;
    t.height = 22;
    node.setPosition(x, y, 0);
    parent.addChild(node);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = 15;
    label.lineHeight = 19;
    label.color = Color.WHITE;
    return label;
}

// ---- 启动：先配置物理系统，再挂组件，保证激活顺序与真实工程一致 ----
const canvasEl = document.querySelector('#GameCanvas');
const app = await createAirApp({ canvas: canvasEl });
view.setDesignResolutionSize(window.innerWidth, window.innerHeight, ResolutionPolicy.EXACT_FIT);

const physics = PhysicsSystem2D.instance;
physics.enable = true;
physics.autoSimulation = true; // 见文件头 2)：关掉自动模拟会连 scene→physics 变换同步一起关掉

const scene = new Scene('v12-physics-2d-basic');
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

// 地面：静态刚体 + 盒碰撞体（360×20，中心 (0,-120) ⇒ 上表面 y=-110）
const CRATE_START = { x: -120, y: 40 };
const CRATE_MOVED = { x: 0, y: -86 }; // 48 高盒正好落在地面上表面 -110 上

const ground = makeBox('Ground', canvasNode, 0, -120, 360, 20);
ground.getComponent(Sprite).color = new Color(70, 80, 100, 255);
const groundBody = ground.addComponent(RigidBody2D);
groundBody.type = ERigidBody2DType.Static;
const groundCollider = ground.addComponent(BoxCollider2D);
groundCollider.density = 1.0;
groundCollider.size = new Size(360, 20); // 上游默认 1×1，不跟随 UITransform

// 木箱：动态刚体 + 盒碰撞体（48×48）
const crate = makeBox('Crate', canvasNode, CRATE_START.x, CRATE_START.y, 48, 48);
crate.getComponent(Sprite).color = new Color(200, 140, 70, 255);
const crateBody = crate.addComponent(RigidBody2D);
crateBody.type = ERigidBody2DType.Dynamic;
crateBody.gravityScale = 0; // 系统重力仍是 (0,-320)，逐刚体关掉它才做到「不模拟」
crateBody.linearDamping = 0.25;
const crateCollider = crate.addComponent(BoxCollider2D);
crateCollider.density = 1.2;
crateCollider.friction = 0.3;
crateCollider.restitution = 0.4;
crateCollider.size = new Size(48, 48);

// 小球：动态刚体 + 圆碰撞体（半径 28）
const ball = makeBox('Ball', canvasNode, 0, 40, 56, 56);
ball.getComponent(Sprite).color = new Color(90, 200, 120, 255);
const ballBody = ball.addComponent(RigidBody2D);
ballBody.type = ERigidBody2DType.Dynamic;
ballBody.gravityScale = 0;
const ballCollider = ball.addComponent(CircleCollider2D);
ballCollider.radius = 28;

// 宝石：运动学刚体 + 多边形碰撞体（六边形，外接半径 30）
const gem = makeBox('Gem', canvasNode, 120, 40, 60, 60);
gem.getComponent(Sprite).color = new Color(90, 160, 240, 255);
const gemBody = gem.addComponent(RigidBody2D);
gemBody.type = ERigidBody2DType.Kinematic;
const gemCollider = gem.addComponent(PolygonCollider2D);
const HEX = [];
for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    HEX.push(new Vec2(Math.cos(a) * 30, Math.sin(a) * 30));
}
gemCollider.points = HEX;
gemCollider.threshold = 0.1;

const statusLabel = addLabel(canvasNode, 'physics-2d (box2d backend) — mount + queries only, gravityScale=0', -10, 150);

const r2 = (v) => Math.round(v * 100) / 100;
const namesOf = (colliders) => [...(colliders || [])].map((c) => c.node.name).sort().join(',');
const hitsOf = (hits) => [...(hits || [])].map((h) => (h.collider ? h.collider.node.name : h.node.name)).sort().join(',');

function readback () {
    const crateAABB = crateCollider.worldAABB;
    return {
        backend: PhysicsSystem2D.PHYSICS_BOX2D ? 'box2d'
            : (PhysicsSystem2D.PHYSICS_BUILTIN ? 'builtin' : (PhysicsSystem2D.PHYSICS_BOX2D_WASM ? 'box2d-wasm' : 'none')),
        flagNone: PhysicsSystem2D.PHYSICS_NONE,
        flagBuiltin: PhysicsSystem2D.PHYSICS_BUILTIN,
        flagBox2D: PhysicsSystem2D.PHYSICS_BOX2D,
        flagBox2DWasm: PhysicsSystem2D.PHYSICS_BOX2D_WASM,
        worldCtor: physics.physicsWorld.constructor.name,
        ptmRatio: PHYSICS_2D_PTM_RATIO,
        enabled: !!physics.enable,
        autoSimulation: !!physics.autoSimulation,
        gravityX: physics.gravity.x,
        gravityY: physics.gravity.y,
        fixedTimeStep: r2(physics.fixedTimeStep),
        crateType: ERigidBody2DType[crateBody.type],
        groundType: ERigidBody2DType[groundBody.type],
        gemType: ERigidBody2DType[gemBody.type],
        crateColliderType: crateCollider.TYPE,
        colliderBodyIdentity: crateCollider.body === crateBody,
        colliderInheritsBase: crateCollider instanceof Collider2D && ballCollider instanceof Collider2D && gemCollider instanceof Collider2D,
        groundSizeW: r2(groundCollider.size.width),
        groundSizeH: r2(groundCollider.size.height),
        groundAABBW: r2(groundCollider.worldAABB.width),
        groundAABBH: r2(groundCollider.worldAABB.height),
        groundWorldPoints: groundCollider.worldPoints.length,
        crateMass: r2(crateBody.getMass()),
        crateGravityScale: crateBody.gravityScale,
        crateLinearDamping: crateBody.linearDamping,
        crateDensity: crateCollider.density,
        crateFriction: crateCollider.friction,
        crateRestitution: crateCollider.restitution,
        crateAABBX: r2(crateAABB.x),
        crateAABBY: r2(crateAABB.y),
        crateAABBW: r2(crateAABB.width),
        crateAABBH: r2(crateAABB.height),
        crateWorldPoints: crateCollider.worldPoints.length,
        crateWorldMin: crateCollider.worldPoints.length ? [r2(crateCollider.worldPoints[0].x), r2(crateCollider.worldPoints[0].y)] : [],
        ballRadius: ballCollider.radius,
        ballWorldRadius: r2(ballCollider.worldRadius),
        ballWorldX: r2(ballCollider.worldPosition.x),
        ballWorldY: r2(ballCollider.worldPosition.y),
        ballAABBW: r2(ballCollider.worldAABB.width),
        gemVertices: gemCollider.worldPoints.length,
        gemThreshold: gemCollider.threshold,
        gemAABBW: r2(gemCollider.worldAABB.width),
        gemAABBH: r2(gemCollider.worldAABB.height),
        testPointCrateOld: namesOf(physics.testPoint(new Vec2(CRATE_START.x, CRATE_START.y))),
        testPointCrateMoved: namesOf(physics.testPoint(new Vec2(CRATE_MOVED.x, CRATE_MOVED.y))),
        testPointBall: namesOf(physics.testPoint(new Vec2(0, 40))),
        testPointGround: namesOf(physics.testPoint(new Vec2(0, -120))),
        testPointGem: namesOf(physics.testPoint(new Vec2(120, 40))),
        testPointEmpty: namesOf(physics.testPoint(new Vec2(2000, 2000))),
        testAABBRegion: namesOf(physics.testAABB(new Rect(-150, 20, 60, 40))),
        raycastFirst: hitsOf(physics.raycast(new Vec2(-240, 40), new Vec2(240, 40))),
        raycastAll: hitsOf(physics.raycast(new Vec2(-240, 40), new Vec2(240, 40), ERaycast2DType.All)),
    };
}

// 交互：真实点击 → 改木箱节点变换 + `Collider2D.apply()`。三态读回都是上游事实：
//   · before：查询命中旧位置
//   · applyOnly（同一帧内立刻查）：`worldPoints` 直接由节点变换算 ⇒ 已经是新位置；
//     `worldAABB` 与 testPoint/testAABB/raycast 走 box2d 碰撞树代理 ⇒ 仍是旧位置
//   · 下一次 postUpdate：`syncSceneToPhysics()` 按 `node.hasChangedFlags` 调 `SetTransformVec`
//     ⇒ 代理同步，查询与 worldAABB 全部落到新位置
let preClick = null;
let applyOnly = null;
function moveCrateToGround () {
    if (preClick) { return; }
    preClick = readback();
    crate.setPosition(CRATE_MOVED.x, CRATE_MOVED.y, 0);
    crateCollider.apply();
    applyOnly = readback();
}
canvasNode.on(Node.EventType.TOUCH_START, moveCrateToGround);

class PhysicsReadout extends Component {
    update () {
        window.__geom = readback();
        const text = `physics-2d backend=${physics.physicsWorld.constructor.name} crate@${Math.round(crate.position.x)},${Math.round(crate.position.y)}`;
        if (text !== this._text) { this._text = text; statusLabel.string = text; }
    }
}

canvasNode.addComponent(PhysicsReadout);

function ownedAssets () {
    return [...frameCache.entries()].flatMap(([name, entry]) => [
        { name: `SpriteFrame:${name}`, ref: entry.spriteFrame },
        { name: `Texture2D:${name}`, ref: entry.texture },
        { name: `ImageAsset:${name}`, ref: entry.image },
    ]);
}

installAssetLifecycle({
    label: 'physics-2d-basic',
    hold: ownedAssets,
    release: () => {
        for (const slot of spriteSlots) { slot.sprite.spriteFrame = null; }
        for (const asset of ownedAssets()) { asset.ref.destroy(); }
        frameCache.clear();
    },
    reacquire: () => {
        for (const slot of spriteSlots) { assignFrame(slot); }
        return ownedAssets();
    },
});

window.__airApp = app;
window.__moveCrate = moveCrateToGround;
app.run(scene);

window.__probe = async () => {
    const now = readback();
    return preClick ? { ...now, before: preClick, applyOnly } : now;
};
