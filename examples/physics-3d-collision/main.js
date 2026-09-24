/**
 * Cocos AIR — physics-3d-collision（LV12-15：cannon 交付链——重力下落 / 碰撞事件 / 射线查询）
 *
 * r46（owner 批复 #8(a) = D12）：默认 bundle 同时编入 physics-builtin 与 physics-cannon，
 * `createAirApp({ physics: 'cannon' })` 在 game.init 前重注册选择器 ⇒ 交付期后端切换。
 * 本示例以 `'cannon'` 启动，把 cannon.js 与 builtin 的三条本质差异拆成可复跑断言：
 *
 * 1) 真模拟：cannon.js 是全量刚体求解器。`physics.enable = false` 冻结帧驱动后，
 *    手动按官方 postUpdate 同序（syncSceneToPhysics → step → emitEvents → syncAfterEvents，
 *    `physics-system.ts:366-372`）步进 180 个固定步 = 3 模拟秒，两球由静止下落并叠稳定：
 *    BallA 静置在 y≈0.5（半径 0.5 贴地）、BallB 叠在 A 上 y≈1.5 —— builtin 下位移恒为 0。
 *    手动步进保证三引擎逐位同解（纯 JS 同一数学），画面帧计数另由旋转环维持。
 * 2) 真碰撞事件：`collider.on('onCollisionEnter', …)` 自动置 `_needCollisionEvent`
 *    （`collider.ts:459-460`）；cannon 的 emitEvents 派发 onCollisionEnter/Stay/Exit。
 *    事件对与次序确定：BallA+Ground（先落地）、BallB+BallA（叠上）⇒ enterTotal=2、exitTotal=0。
 * 3) 真射线法线：cannon raycast 返回命中面真实法线（对照 builtin 恒写 Vec3.ZERO）；
 *    从 (0,10,0) 向下先命中 BallB（距离 8，法线 +Y），从 (5,10,0) 向下命中 Ground（距离 10）。
 *    `PhysicsSystem.raycast` 结果池 `raycastResults` 按 `isHitEmpty` 语义返回布尔 + 池。
 *
 * 与 physics-3d-basic（builtin 面）互为对照：那边证明「不模拟、无碰撞事件、零法线」，
 * 本例证明切到 cannon 后三条全部反转。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Component,
    MeshRenderer,
    DirectionalLight,
    Material,
    Layers,
    Color,
    Vec3,
    primitives,
    utils,
    geometry,
    isValid,
    physics as physicsNS,
    ERigidBodyType,
    RigidBody,
    BoxCollider,
    SphereCollider,
} from 'cocosair';
import { installAssetLifecycle } from '../shared/asset-lifecycle.js';

const r2 = (v) => Math.round(v * 100) / 100;
const FIXED_STEP = 1 / 60;
const SIM_STEPS = 180; // 3 模拟秒：A 落地 + B 叠上 + 双双入睡

// ---- 视觉资源：全部运行时程序化生成（零第三方资产），登记给资源生命周期合同 ----
const renderSlots = [];
const ownedAssets = [];

function standardMaterial (label, color) {
    const material = new Material();
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('mainColor', color);
    ownedAssets.push({ name: `Material:${label}`, ref: material });
    return material;
}

function assignVisual (slot) {
    const mesh = utils.createMesh(slot.buildData());
    ownedAssets.push({ name: `Mesh:${slot.label}`, ref: mesh });
    slot.mesh = mesh;
    slot.renderer.mesh = mesh;
    slot.renderer.material = standardMaterial(slot.label, slot.color);
}

function bindVisual (node, label, buildData, color) {
    const renderer = node.addComponent(MeshRenderer);
    const slot = { node, label, renderer, buildData, color, mesh: null };
    renderSlots.push(slot);
    assignVisual(slot);
}

function makeNode (name, x, y, z) {
    const node = new Node(name);
    node.layer = Layers.Enum.DEFAULT;
    node.setPosition(new Vec3(x, y, z));
    return node;
}

// ---- 启动：createAirApp({ physics: 'cannon' }) 是本示例的后端身份前提 ----
const app = await createAirApp({ canvas: '#GameCanvas', physics: 'cannon' });
const physics = physicsNS.PhysicsSystem.instance;

physics.enable = true;
physics.autoSimulation = true;
physics.allowSleep = true;
physics.maxSubSteps = 1;
physics.fixedTimeStep = FIXED_STEP;
physics.gravity = new Vec3(0, -10, 0);

const scene = new Scene('v12-physics-3d-collision');

const cameraNode = makeNode('Main Camera', 0, 4.2, 9.8);
scene.addChild(cameraNode);
cameraNode.lookAt(new Vec3(0, 1.2, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(18, 26, 34, 255);
camera.visibility = Layers.Enum.DEFAULT;
camera.priority = 0;

const lightNode = makeNode('Main Light', 0, 8, 0);
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 20000;

// Ground：静态盒（顶面 y=0）
const groundNode = makeNode('Ground', 0, -0.5, 0);
scene.addChild(groundNode);
bindVisual(groundNode, 'Ground', () => primitives.box({ width: 12, height: 1, length: 12 }), new Color(64, 96, 72, 255));
const groundBody = groundNode.addComponent(RigidBody);
groundBody.type = ERigidBodyType.STATIC;
const groundCollider = groundNode.addComponent(BoxCollider);
groundCollider.size = new Vec3(12, 1, 12);
groundCollider.on('onCollisionEnter', onEnter);

// BallA / BallB：动态球，B 从更高处落下叠上已静置的 A
const ballANode = makeNode('BallA', 0, 3, 0);
scene.addChild(ballANode);
bindVisual(ballANode, 'BallA', () => primitives.sphere({ radius: 0.5 }), new Color(214, 148, 62, 255));
const ballA = ballANode.addComponent(RigidBody);
ballA.type = ERigidBodyType.DYNAMIC;
const ballACollider = ballANode.addComponent(SphereCollider);
ballACollider.radius = 0.5;

const ballBNode = makeNode('BallB', 0, 5.5, 0);
scene.addChild(ballBNode);
bindVisual(ballBNode, 'BallB', () => primitives.sphere({ radius: 0.5 }), new Color(96, 148, 210, 255));
const ballB = ballBNode.addComponent(RigidBody);
ballB.type = ERigidBodyType.DYNAMIC;
const ballBCollider = ballBNode.addComponent(SphereCollider);
ballBCollider.radius = 0.5;
ballBCollider.on('onCollisionEnter', onEnter);

// 旋转环：为矩阵护栏的 frameChanged 提供与模拟无关的持续帧间变化
const ringNode = makeNode('SpinRing', -4, 2.4, 0);
scene.addChild(ringNode);
bindVisual(ringNode, 'SpinRing', () => primitives.torus(0.5, 0.18), new Color(150, 150, 160, 255));

let ringYaw = 0;
class SpinRing extends Component {
    update (dt) {
        ringYaw += dt * 90;
        this.node.setRotationFromEuler(0, ringYaw, 0);
    }
}
ringNode.addComponent(SpinRing);

// ---- 碰撞事件记录：事件对 + 次序在固定步长下确定 ----
const enterPairs = [];
let enterTotal = 0;
let stayTotal = 0;
let exitTotal = 0;
let contactsAtFirstEnter = -1;
let velocityYBAtEnter = 0;

function pairName (event) {
    const a = event.selfCollider.node.name;
    const b = event.otherCollider.node.name;
    return [a, b].sort().join('|');
}

function onEnter (event) {
    enterTotal += 1;
    enterPairs.push(pairName(event));
    if (contactsAtFirstEnter === -1) {
        contactsAtFirstEnter = event.contacts ? event.contacts.length : 0;
    }
    if (event.otherCollider.node.name === 'BallA' || event.selfCollider.node.name === 'BallA') {
        const other = event.otherCollider.node.name === 'BallA' ? event.otherCollider : event.selfCollider;
        if (other.node.name === 'BallB') {
            const v = new Vec3();
            ballB.getLinearVelocity(v);
            velocityYBAtEnter = r2(v.y);
        }
    }
}
ballACollider.on('onCollisionStay', () => { stayTotal += 1; });
ballACollider.on('onCollisionExit', () => { exitTotal += 1; });

// ---- 手动预模拟：按官方 postUpdate 同序步进（freeze 帧驱动 ⇒ 三引擎逐位同解） ----
// 必须在场景启动（组件 onLoad 挂体进世界）之后执行，因此放进首个 update 钩子。
const world = physics.physicsWorld;
let rayHitName = '';
let rayHitDist = -1;
let rayHitCount = 0;
let rayHitNormalY = 0;
let rayClosestName = '';
let rayClosestDist = -1;
let restYA = 0;
let restYB = 0;
let restStable = false;
let simDone = false;

function stepWorld (steps) {
    for (let i = 0; i < steps; i++) {
        physics.syncSceneToPhysics();
        physics.step(FIXED_STEP);
        physics.emitEvents();
        world.syncAfterEvents();
    }
}

function runSimulation () {
    physics.enable = false;
    stepWorld(SIM_STEPS);
    restYA = r2(ballANode.position.y);
    restYB = r2(ballBNode.position.y);
    stepWorld(30);
    restStable = r2(ballANode.position.y) === restYA && r2(ballBNode.position.y) === restYB;

    // 射线：cannon 返回真实命中法线（对照 builtin 恒 ZERO）；
    // 从 (0,10,0) 向下连穿 BallB→BallA→Ground 三体（raycastClosestResult 只由 raycastClosest 写入，
    // 全量命中读 raycastResults 并按距离排序取最近）
    const down = new geometry.Ray(0, 10, 0, 0, -1, 0);
    if (physics.raycast(down, 0xffffffff, 20)) {
        const results = physics.raycastResults.slice().sort((a, b) => a.distance - b.distance);
        const first = results[0];
        rayHitCount = results.length;
        rayHitName = first.collider.node.name;
        rayHitDist = r2(first.distance);
        rayHitNormalY = r2(first.hitNormal.y);
    }
    const groundRay = new geometry.Ray(5, 10, 0, 0, -1, 0);
    if (physics.raycastClosest(groundRay, 0xffffffff, 20)) {
        rayClosestName = physics.raycastClosestResult.collider.node.name;
        rayClosestDist = r2(physics.raycastClosestResult.distance);
    }
    physics.enable = true;
}

function readback () {
    return {
        backendWorldCtor: world.constructor.name,
        sysNone: physicsNS.PhysicsSystem.PHYSICS_NONE,
        sysBuiltin: physicsNS.PhysicsSystem.PHYSICS_BUILTIN,
        sysCannon: physicsNS.PhysicsSystem.PHYSICS_CANNON,
        sysBullet: physicsNS.PhysicsSystem.PHYSICS_BULLET,
        sysPhysx: physicsNS.PhysicsSystem.PHYSICS_PHYSX,
        gravityY: physics.gravity.y,
        worldHasGravity: 'gravity' in world,
        bodyCount: world.bodies.length,
        groundType: ERigidBodyType[groundBody.type],
        ballAType: ERigidBodyType[ballA.type],
        ballBType: ERigidBodyType[ballB.type],
        fixedTimeStep: r2(physics.fixedTimeStep),
        maxSubSteps: physics.maxSubSteps,
        simSteps: SIM_STEPS,
        startYA: 3,
        startYB: 5.5,
        restYA,
        restYB,
        restStable,
        fallDeltaA: r2(3 - restYA),
        enterTotal,
        stayTotal,
        exitTotal,
        enterPairs: [...new Set(enterPairs)].sort().join(','),
        contactsAtFirstEnter,
        velocityYBAtEnter,
        rayHitName,
        rayHitDist,
        rayHitCount,
        rayHitNormalY,
        rayClosestName,
        rayClosestDist,
    };
}

class FrameCount extends Component {
    update () {
        window.__frames = (window.__frames || 0) + 1;
        if (!simDone) {
            simDone = true;
            runSimulation();
            window.__geom = readback();
        }
    }
}
const frameHost = makeNode('FrameHost', 0, 0, 0);
scene.addChild(frameHost);
frameHost.addComponent(FrameCount);

installAssetLifecycle({
    label: 'physics-3d-collision',
    hold: () => ownedAssets.filter((entry) => isValid(entry.ref)),
    release: () => {
        for (const slot of renderSlots) {
            slot.renderer.mesh = null;
            slot.renderer.material = null;
        }
        for (const asset of ownedAssets) { asset.ref.destroy(); }
        ownedAssets.length = 0;
    },
    reacquire: () => {
        for (const slot of renderSlots) { assignVisual(slot); }
        return ownedAssets;
    },
});

window.__airApp = app;
window.__geom = readback();
app.run(scene);

window.__probe = async () => ({ ...window.__geom, frames: window.__frames || 0 });
