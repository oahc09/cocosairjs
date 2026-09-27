/**
 * Cocos AIR — physics-3d-basic（LV12-15：3D 物理挂载 + 查询 + 触发器；「不模拟」是后端事实）
 *
 * 默认发行 bundle（`tools/build/build.cjs` 的 AIR_FEATURES 含 `physics-builtin`）里 3D 物理后端是
 * **builtin**：`PhysicsSystem.PHYSICS_BUILTIN === true`、运行时 `physicsWorld` 实际类型
 * `BuiltInWorld`（后端身份判定见下面 9)：顶层 `selector` 名称被 2D 侧占用，不能拿它判 3D 后端）。
 * 上游给它的定位写在类注释上：
 * "efficient discrete collision detector, **not a full physical simulator**"
 * （`src/cocos/physics/cocos/builtin-world.ts:50-55`）。本示例把这句话拆成可复跑的断言：
 *
 * 1) 刚体动力学全是空实现：`BuiltinRigidBody` 的 setMass、setType、useGravity、apply 系列、setLinearVelocity
 *    为空函数，`getLinearVelocity(out)` 连 out 都不写（`builtin-rigid-body.ts:63-89`）。
 *    于是用哨兵 (9,9,9) 调 getLinearVelocity ⇒ 读回仍是哨兵；`sleepThreshold` 读回 0、
 *    `useCCD` 读回 false、`isAwake` 恒 true（同文件 33-35、69、79 行）。framework 层的
 *    `mass/useGravity/allowSleep/linearDamping` 只是组件记账（`rigid-body.ts:121-215`），
 *    改它们不会改变任何模拟结果。
 * 2) 世界重力 (0,-10,0) 停在 framework 层：`BuiltInWorld.setGravity` 是空的
 *    （`builtin-world.ts:125-127`），世界对象上也没有 gravity 状态可读。手动
 *    `syncSceneToPhysics() + step()` 60 次后动态木箱的 `worldPosition` 位移严格为 0——
 *    builtin 没有 physics→scene 的写回路径（`syncAfterEvents()` 只调 `syncSceneToPhysics()`，
 *    方向仍是 scene→physics，`builtin-world.ts:194-202`）。
 * 3) 查询是真的：raycast / raycastClosest / lineStripCast 走 `geometry.intersect.resolve`
 *    对 OBB / Sphere / Capsule 求交（`builtin-world.ts:208-253`），命中集与手算几何一致。
 *    三条上游细节必须记住：命中法线恒为 `Vec3.ZERO`（225、247 行写死）；
 *    `if (distance === 0 || distance > max_d) continue` 只跳过 `resolve` **恰好返回 0** 的情形，
 *    别读成「起点在形状内部就不命中」——从球心 (0,0.7,0) 向 +X 打仍然按出射距离命中球
 *    （`castInsideBallNames "Ball,Capsule"`、`castInsideBallFirstDist 0.7`），本例没有该分支的正例；
 *    `options.queryTrigger` 在 builtin 分支从未被读取 ⇒ `raycast(ray, mask, dist, false)` 照样会命中触发盒。
 *    另外 `distance` 以 `ray.d` 的长度为单位（`geometry.Ray` 构造不归一化方向），
 *    所以本示例一律传单位方向向量，否则 `distance` 不是米。
 * 4) 只有触发器事件会响：`emitEvents()` 只调 `emitTriggerEvent()`（`builtin-world.ts:204-206`），
 *    `onCollisionEnter/Stay/Exit` 永远不触发；碰撞对只在**至少一侧注册过 trigger 监听**
 *    （`collider.needTriggerEvent`，`builtin-shared-body.ts:118-131`）时才被记录，且
 *    `isTrigger` 在 builtin 下无意义（`Collider.isTrigger` 文档自己写着「builtin 中无论真假都为触发器」）。
 * 5) MeshCollider 在 builtin 下未注册：`cocos/instantiate.ts:34-40` 只登记
 *    RigidBody/BoxShape/SphereShape/CapsuleShape/PhysicsWorld 五项，`createShape(MESH)` 命中
 *    `check()` 分支打印 `builtin physics does not support MeshCollider` 并返回 `ENTIRE_SHAPE` 空桩
 *    （`physics-selector.ts:243-252、331-366`）——空桩不注册 shared body、`getAABB` 是空函数，
 *    所以它的 `worldBounds` 恒为 0 且不参与任何查询。sweep 家族同理（`warnID(9640)` + return false）。
 * 6) 变换同步是惰性的：改 `node.setPosition` 后 `collider.worldBounds` 仍是旧值，直到
 *    `physics.syncSceneToPhysics()`（或下一帧 postUpdate）按 `node.hasChangedFlags` 重算
 *    worldShape（`builtin-shared-body.ts:147-157`）。点击后本示例读回这三态。
 * 7) `BoxCollider.size` 默认 1×1×1（`box-collider.ts:87`）、`SphereCollider.radius` 默认 0.5，
 *    都不跟随 Mesh 尺寸——与 2D 那边同一个坑，故逐个显式设定并断言 worldBounds。
 * 8) 单例在 Director 初始化之后才存在：`PhysicsSystem._instance` 由
 *    `director.once(DirectorEvent.INIT, () => PhysicsSystem.constructAndRegister())` 创建
 *    （`physics-system.ts:875-912`）。模块顶层直接取 `PhysicsSystem.instance` 拿到的是 null。
 * 9) 顶层 `selector` 名称在发行产物里被 **2D** 侧占用：`physics/framework/index.ts:87` 与
 *    `physics-2d/framework/index.ts:63` 各自导出同名 `selector`，经 `src/exports/air.ts` 聚合后
 *    `import { selector } from 'cocosair'` 拿到的是 2D 那个（实测 `selector.id === 'box2d'`、
 *    wrapper 表 13 项全是 2D 形状/关节）。3D builtin 只注册 5 个 wrapper 这件事只能从
 *    `cocos/instantiate.ts:33-41` 读源码，或用 `physicsWorld.constructor.name`、
 *    `collider.shape.constructor.name` 这类运行时身份判定 —— 本示例采用后者。
 * 10) 分组过滤是双向与运算：`step()` 里 `bodyA.collisionFilterGroup & bodyB.collisionFilterMask`
 *     与反向各判一次，任一为 0 就跳过配对（`builtin-world.ts:183-186`），而 `Collider.collisionMask`
 *     默认只有 `PhysicsGroup.DEFAULT`（即 1）。于是**只改 group 不改 mask 会让该刚体从所有
 *     触发/碰撞配对里消失**，且没有任何警告。本示例先复现这一静默失效（`trigEnterFiltered=0`），
 *     再给两侧都 `setMask(0xffffffff)`（过滤是双向与运算，只补一侧仍为 0），才得到
 *     enter/stay/exit 各 1 次。
 * 11) `CapsuleCollider` 的 `height`（等价 `cylinderHeight`）在 `onLoad` 之前设置不会传到
 *     builtin 形状：`BuiltinCapsuleShape.onLoad` 只回读 `radius` 与 `direction`
 *     （`builtin-capsule-shape.ts:75-79`），`halfHeight` 仍是构造默认 0.5。于是组件记账
 *     `height=1.6`，世界形状实高 `2×(0.5+0.4)=1.8`，`worldBounds.halfExtents.y=0.9`。
 * 12) `raycast()` 的结果顺序是刚体注册顺序，不按距离排序；要最近命中只能用 `raycastClosest()`。
 *     另外 `PhysicsRayResult.segmentIndex` 在 builtin 分支从不赋值（读回 undefined）。
 *     `raycastClosestResult` 是复用的池对象：命中与否它都是导出类 `PhysicsRayResult` 的实例
 *     （`nearXIsRayResult`/`nearSensorIsRayResult`/`nearMissIsRayResult` 三处读回全为 true）。
 * 13) 配套视觉网格用的 `primitives` 三个入口签名不对称（`src/cocos/primitive/`）：
 *     `box(opts)` 收对象、`sphere(radius)` 收半径、而 `capsule(radiusTop, radiusBottom, height)`
 *     收三个位置参数，`height` 是含两端球的总高（`capsule.ts:52-53`）。按 `sphere` 的习惯写
 *     `capsule(0.4, 1.6)` 会得到 `radiusTop=0.4, radiusBottom=1.6, height=2` 的退化碗状体
 *     （`torsoHeight=0`），且不会报错——所以这里写 `capsule(0.4, 0.4, 1.6)`。
 *     注意它与 11) 叠加后仍不完全重合：碰撞体世界实高 1.8，网格高 1.6。
 * 14) 四个框架层「类」本身也是本例的取证对象（`proveFrameworkClasses`）：
 *     · `Collider` 的构造签名是 `(type: EColliderType)`（`collider.ts:237-240`），子类靠
 *       `static readonly Type = EColliderType` 暴露那张枚举表；脱离节点构造出来的裸实例
 *       `shape === null`、`worldBounds` 只是 `geometry.AABB` 的构造默认值（中心 0、半长 1），
 *       不会进物理世界（`bodyCount` 不受影响）。
 *     · `PhysicsMaterial` 是 `Asset` 子类：构造即把自己 push 进 `PhysicsMaterial.allMaterials`
 *       静态表（`physics-material.ts:148-153`），默认 friction 0.6 / restitution 0（实测，
 *       不是 3D 建模软件习惯里的 0.3）；
 *       `collider.sharedMaterial = mat` 在非编辑器分支里走的就是 `material` setter
 *       （`collider.ts:94-101`），而 builtin 形状的 `setMaterial (v) { }` 是**空函数**
 *       （`cocos/shapes/builtin-shape.ts:36`）——材质在组件侧记账、在世界形状侧完全没有通道，
 *       这是 2)「不是真模拟器」的第四条证据。注意别读 `collider.material`：共享态下那个 getter
 *       会就地 `_material.clone()` 换对象（本例只读 `sharedMaterial`）。
 *     · `PhysicsSystem` 是私有构造的 `System` 单例（不是 Component，不能 addComponent）。
 *       `new` 出来的是一个游离实例，而且它的 `physicsWorld` getter 读的是 **3D selector 的模块级
 *       变量**（`physics-system.ts:256-258`），不是实例字段 ⇒ 游离实例看到的正是同一个真世界；
 *       它也不改 `_instance`，随后 `PhysicsSystem.constructAndRegister()`（public static，
 *       单例已存在时是幂等空操作）取回的仍是原单例。
 *     · `PhysicsRayResult` 可自构造，默认实例就是「未命中」形状（distance 0、collider null、
 *       hitPoint 原点）；`physics.raycastClosestResult` 是它的一个常驻字段实例
 *       （`physics-system.ts:265`），命中与否都被复用，所以 12) 才要求判返回值而不是判对象。
 *       本例构造的临时实例不登记进 `ownedAssets`：这段是 memoize 的，整页每种各一个、常驻，
 *       它们不是渲染资源，不参与 §25 资源生命周期合同的 release/reacquire 语义。
 * 15) `Collider.boundingSphere` 在 builtin 下恒为 `geometry.Sphere` 的构造默认值：getter 先建默认球，
 *     再在 `_shape` 存在时调 `_shape.getBoundingSphere(out)`（`collider.ts:196-200`），而
 *     `BuiltinShape.getBoundingSphere (v) { }` 与 `setMaterial` 是同一族空函数
 *     （`cocos/shapes/builtin-shape.ts:34`）⇒ 木箱已同步到 x=-2.2 之后读回仍是
 *     `crateSphereCenterX 0` / `crateSphereRadius 1`。与 6) 的 `worldBounds` 合起来看：
 *     **AABB 会被 `syncSceneToPhysics()` 更新、包围球没人写**，宽相位相关的代码不能拿
 *     `collider.boundingSphere` 当依据。
 *
 * 另外两条与「怎么写代码才不报错」有关的约束：
 * · 刚体/碰撞体的 `getGroup/setGroup/getMask/setMask/sleepThreshold/useCCD/apply 系列/getLinearVelocity`
 *   在 `onLoad` 之前调用会走 `_isInitialized` 分支打印 `error('[Physics]: This component has not
 *   been call onLoad yet…')`（`rigid-body.ts:405-410`、`collider.ts:231-235`）——浏览器矩阵把
 *   console error 判 fatal，所以这些调用全部放在首帧之后（见 `setupFilters/proveNoSimulation`）。
 * · Code First 无 internal 资产包，`builtinResMgr.get('default-physics-material')` 取不到，
 *   3D 物理系统在 project 初始化阶段会打印 `errorID(9642)`（`physics-system.ts:223-231`）。
 *   这条与示例无关（任何 3D/2D 物理示例都会打），已登记在矩阵护栏 BENIGN_CONSOLE。
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
    Quat,
    primitives,
    utils,
    geometry,
    isValid,
    input,
    Input,
    PhysicsSystem,
    PhysicsGroup,
    ERigidBodyType,
    RigidBody,
    Collider,
    PhysicsRayResult,
    PhysicsMaterial,
    BoxCollider,
    SphereCollider,
    CapsuleCollider,
    MeshCollider,
    physics as physicsNamespace,
    selector,
} from 'cocosair';
import { installAssetLifecycle } from '../shared/asset-lifecycle.js';

// `PhysicsSystem._instance` 由 `director.once(DirectorEvent.INIT, …)` 里的
// `constructAndRegister()` 才创建（`physics-system.ts:875-912`），所以只能在 `createAirApp()`
// 之后再取单例；提前取到的是 null。
const r2 = (v) => Math.round(v * 100) / 100;
const ALL_MASK = 0xffffffff;
const FIXED_STEP = 1 / 60;
const GROUP_CRATE = PhysicsGroup.DEFAULT << 1; // 2
const GROUP_BALL = PhysicsGroup.DEFAULT << 2; // 4

// ---- 视觉资源：全部运行时程序化生成（零第三方资产），登记给资源生命周期合同 ----
const renderSlots = [];
const ownedAssets = [];

function standardMaterial(label, color) {
    const material = new Material();
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('mainColor', color);
    ownedAssets.push({ name: `Material:${label}`, ref: material });
    return material;
}

function bindVisual(node, label, buildData, color) {
    const renderer = node.addComponent(MeshRenderer);
    const slot = { node, label, renderer, buildData, color };
    renderSlots.push(slot);
    assignVisual(slot);
    return renderer;
}

function assignVisual(slot) {
    const mesh = utils.createMesh(slot.buildData());
    ownedAssets.push({ name: `Mesh:${slot.label}`, ref: mesh });
    slot.mesh = mesh;
    slot.renderer.mesh = mesh;
    slot.renderer.material = standardMaterial(slot.label, slot.color);
}

// 见文件头 13)：primitives 的签名不对称，视觉是否正确只能靠网格包围盒回读判定
function meshBound(label, which) {
    const slot = renderSlots.find((entry) => entry.label === label);
    // 资源生命周期合同的 release 会把网格 destroy 掉：那时读它的数据会抛
    // 「Cannot read properties of null (reading 'maxPosition')」，故先 isValid 判活，读不到给 -999
    const mesh = slot && slot.mesh && isValid(slot.mesh) ? slot.mesh : null;
    const v = mesh ? (which === 'max' ? mesh.maxPosition : mesh.minPosition) : null;
    return { x: v ? r2(v.x) : -999, y: v ? r2(v.y) : -999, z: v ? r2(v.z) : -999 };
}

function makeNode(name, x, y, z) {
    const node = new Node(name);
    node.layer = Layers.Enum.DEFAULT;
    node.setPosition(new Vec3(x, y, z));
    return node;
}

// Collider.type 由子类在构造期写死（EColliderType：BOX 0 / SPHERE 1 / CAPSULE 2 / MESH 3），
// 与 RigidBody.type（STATIC/DYNAMIC/KINEMATIC）同名不同物。形状类型一律经此读取器取证，
// 免得两条 claim 在源码里塌到同一个词的首次出现行（词相同、语义无关）。
function colliderTypeOf(collider) {
    return collider.type;
}

// ---- 启动：先配置物理系统，再挂组件，最后 app.run ----
const app = await createAirApp({ canvas: '#GameCanvas' });
const physics = PhysicsSystem.instance;

physics.enable = true;
physics.autoSimulation = true;
physics.allowSleep = true;
physics.maxSubSteps = 1;
physics.fixedTimeStep = FIXED_STEP;
physics.gravity = new Vec3(0, -10, 0);

const scene = new Scene('v12-physics-3d-basic');

const cameraNode = makeNode('Main Camera', 0, 3.6, 9.4);
scene.addChild(cameraNode);
cameraNode.lookAt(new Vec3(0, 1.1, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(22, 28, 40, 255);
camera.visibility = Layers.Enum.DEFAULT;
camera.priority = 0;

const lightNode = makeNode('Main Light', 0, 8, 0);
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 20000; // 与 examples/gltf-viewer 同档；实测 3 档下整场景接近全黑

// Ground：静态刚体 + 盒碰撞体（8×0.3×8，上表面 y=0）
const ground = makeNode('Ground', 0, -0.15, 0);
scene.addChild(ground);
bindVisual(ground, 'Ground', () => primitives.box({ width: 9, height: 0.3, length: 6 }), new Color(70, 80, 100, 255));
const groundBody = ground.addComponent(RigidBody);
groundBody.type = ERigidBodyType.STATIC;
const groundCollider = ground.addComponent(BoxCollider);
groundCollider.size = new Vec3(9, 0.3, 6);

// Crate：动态刚体 + 盒碰撞体（1.5³）——「不模拟」与三态同步的主角
// 位置写字面量（不引常量）：spec-expectations 只能静态提取字面量，常量会让该节点变成 gap
const crate = makeNode('Crate', -2.2, 0.75, 0);
scene.addChild(crate);
bindVisual(
    crate,
    'Crate',
    () => primitives.box({ width: 1.5, height: 1.5, length: 1.5 }),
    new Color(200, 140, 70, 255),
);
const crateBody = crate.addComponent(RigidBody);
crateBody.type = ERigidBodyType.DYNAMIC;
const crateCollider = crate.addComponent(BoxCollider);
crateCollider.size = new Vec3(1.5, 1.5, 1.5);

// Ball：静态刚体 + 球碰撞体（r=0.7）
const ball = makeNode('Ball', 0, 0.7, 0);
scene.addChild(ball);
bindVisual(ball, 'Ball', () => primitives.sphere(0.7), new Color(90, 200, 120, 255));
const ballBody = ball.addComponent(RigidBody);
ballBody.type = ERigidBodyType.STATIC;
const ballCollider = ball.addComponent(SphereCollider);
ballCollider.radius = 0.7;

// Capsule：运动学刚体 + 胶囊碰撞体（r=0.4，总高 1.6，轴向 Y）
const capsuleNode = makeNode('Capsule', 2.2, 0.8, 0);
scene.addChild(capsuleNode);
bindVisual(capsuleNode, 'Capsule', () => primitives.capsule(0.4, 0.4, 1.6), new Color(90, 160, 240, 255));
const capsuleBody = capsuleNode.addComponent(RigidBody);
capsuleBody.type = ERigidBodyType.KINEMATIC;
const capsuleCollider = capsuleNode.addComponent(CapsuleCollider);
capsuleCollider.radius = 0.4;
capsuleCollider.height = 1.6;

// Sensor：静态刚体 + 盒碰撞体（无网格视觉），触发事件与木箱位移的目标格
const sensor = makeNode('Sensor', -2.2, 3.6, 0);
// 位移目标从 sensor 节点派生：与上面的字面量同源，不会再出现两处数字各写一遍的漂移
const CRATE_SENSOR = sensor.position.clone();
scene.addChild(sensor);
const sensorBody = sensor.addComponent(RigidBody);
sensorBody.type = ERigidBodyType.STATIC;
const sensorCollider = sensor.addComponent(BoxCollider);
sensorCollider.size = new Vec3(2, 2, 2);

// Trimesh：MeshCollider 在 builtin 下未注册 ⇒ 空桩（不注册 shared body、不参与查询）
const trimesh = makeNode('Trimesh', 4.2, 0.9, 0);
scene.addChild(trimesh);
bindVisual(trimesh, 'Trimesh', () => primitives.torus(0.5, 0.18), new Color(180, 120, 200, 255));
const trimeshCollider = trimesh.addComponent(MeshCollider);
trimeshCollider.mesh = trimesh.getComponent(MeshRenderer).mesh;

// ---- 触发器：注册即置 needTriggerEvent（builtin 只认这一条事件通道）----
const triggerCounts = { enter: 0, stay: 0, exit: 0, collision: 0, trigger: 0 };
const triggerPair = { selfName: '', otherName: '' };
function onTrigger(event) {
    triggerCounts[event.type === 'onTriggerEnter' ? 'enter' : event.type === 'onTriggerStay' ? 'stay' : 'exit']++;
    triggerCounts.trigger++;
    triggerPair.selfName = event.selfCollider ? event.selfCollider.node.name : '';
    triggerPair.otherName = event.otherCollider ? event.otherCollider.node.name : '';
}
sensorCollider.on('onTriggerEnter', onTrigger);
sensorCollider.on('onTriggerStay', onTrigger);
sensorCollider.on('onTriggerExit', onTrigger);
// 碰撞事件通道在 builtin 下永不触发（下面读回恒为 0）
crateCollider.on('onCollisionEnter', () => {
    triggerCounts.collision++;
});

// ---- 分组过滤：必须等 onLoad（见文件头约束），故惰性做一次 ----
let filterSetup = null;
function setupFilters() {
    if (filterSetup) {
        return filterSetup;
    }
    crateCollider.setGroup(GROUP_CRATE);
    ballCollider.setGroup(GROUP_BALL);
    filterSetup = {
        defaultGroup: PhysicsGroup.DEFAULT,
        groundGroup: groundCollider.getGroup(),
        groundMask: groundCollider.getMask() >>> 0,
        crateGroup: crateCollider.getGroup(),
        ballGroup: ballCollider.getGroup(),
        capsuleGroup: capsuleCollider.getGroup(),
        sensorGroup: sensorCollider.getGroup(),
        // 只改 group 时 mask 仍是默认的 DEFAULT(1) —— 这正是下面触发器被静默过滤的原因（见文件头 10)）
        crateMaskAfterGroupOnly: crateCollider.getMask() >>> 0,
        sensorMaskBefore: sensorCollider.getMask() >>> 0,
    };
    return filterSetup;
}

// ---- 「不模拟」实证：全部动力学入口调一遍 + 手动 60 步，位移必须为 0 ----
let simProof = null;
function proveNoSimulation() {
    if (simProof) {
        return simProof;
    }
    const startPos = crate.worldPosition.clone();
    crateBody.mass = 2.5;
    crateBody.useGravity = true;
    crateBody.allowSleep = true;
    crateBody.linearDamping = 0.2;
    crateBody.angularDamping = 0.3;
    crateBody.applyForce(new Vec3(0, 5000, 0));
    crateBody.applyImpulse(new Vec3(0, 5000, 0));
    crateBody.applyTorque(new Vec3(0, 5000, 0));
    crateBody.setLinearVelocity(new Vec3(4, 0, 0));
    crateBody.setAngularVelocity(new Vec3(0, 0, 3));
    crateBody.sleepThreshold = 5;
    crateBody.useCCD = true;
    const linearSentinel = new Vec3(9, 9, 9);
    const angularSentinel = new Vec3(8, 8, 8);
    crateBody.getLinearVelocity(linearSentinel);
    crateBody.getAngularVelocity(angularSentinel);
    crateBody.clearForces();
    crateBody.clearVelocity();
    crateBody.wakeUp();
    crateBody.sleep();
    crateBody.clearState();
    const obbCenterPreSyncX = crateCollider.shape.worldObb.center.x;
    physics.syncSceneToPhysics();
    const worldBefore = crateCollider.shape.worldObb.center.x;
    for (let i = 0; i < 60; i++) {
        physics.syncSceneToPhysics();
        physics.step(FIXED_STEP);
    }
    const endPos = crate.worldPosition;
    simProof = {
        stepsRun: 60,
        massReadBack: crateBody.mass,
        useGravityReadBack: crateBody.useGravity,
        allowSleepReadBack: crateBody.allowSleep,
        linearDampingReadBack: r2(crateBody.linearDamping),
        angularDampingReadBack: r2(crateBody.angularDamping),
        isDynamicReadBack: crateBody.isDynamic,
        isAwakeReadBack: crateBody.isAwake,
        isSleepingReadBack: crateBody.isSleeping,
        isSleepyReadBack: crateBody.isSleepy,
        sleepThresholdReadBack: crateBody.sleepThreshold,
        useCcdReadBack: crateBody.useCCD,
        linearSentinelX: linearSentinel.x,
        linearSentinelY: linearSentinel.y,
        linearSentinelZ: linearSentinel.z,
        angularSentinelX: angularSentinel.x,
        angularSentinelZ: angularSentinel.z,
        crateDriftX: r2(endPos.x - startPos.x),
        crateDriftY: r2(endPos.y - startPos.y),
        crateDriftZ: r2(endPos.z - startPos.z),
        crateObbCenterDriftX: r2(crateCollider.shape.worldObb.center.x - worldBefore),
        // 首帧世界形状尚未按节点变换求值（惰性同步，见文件头 6)）：sync 前是构造默认 0
        obbCenterPreSyncX: r2(obbCenterPreSyncX),
        obbCenterAfterFirstSyncX: r2(worldBefore),
    };
    return simProof;
}

// ---- 触发器三态：在一次同步调用内用受控步进跑出 enter/stay/exit 各 1 次 ----
// 先复现「只改 group 不改 mask ⇒ 配对被静默过滤」，再补 mask 得到三态（见文件头 10)）。
let triggerRun = null;
function stepAndEmit() {
    physics.syncSceneToPhysics();
    physics.step(FIXED_STEP);
    physics.emitEvents();
}
function exerciseTriggers() {
    if (triggerRun) {
        return triggerRun;
    }
    const restore = crate.position.clone();
    const countsBefore = { ...triggerCounts };
    triggerCounts.enter = 0;
    triggerCounts.stay = 0;
    triggerCounts.exit = 0;
    triggerCounts.collision = 0;
    crate.setPosition(new Vec3(CRATE_SENSOR.x, CRATE_SENSOR.y, CRATE_SENSOR.z));
    // 第一阶段：crate group=2、sensor mask=1 ⇒ `2 & 1 === 0`，配对根本不记录
    stepAndEmit();
    const enterFiltered = triggerCounts.enter;
    const stayFiltered = triggerCounts.stay;
    // 第二阶段：过滤是双向与运算，所以两侧的 mask 都要覆盖对方的 group
    crateCollider.setMask(ALL_MASK);
    sensorCollider.setMask(ALL_MASK);
    stepAndEmit();
    const enter = triggerCounts.enter - enterFiltered;
    stepAndEmit();
    const stay = triggerCounts.stay - stayFiltered;
    crate.setPosition(restore);
    stepAndEmit();
    triggerRun = {
        trigEnterFiltered: enterFiltered,
        trigStayFiltered: stayFiltered,
        trigEnter: enter,
        trigStay: stay,
        trigExit: triggerCounts.exit,
        trigCollision: triggerCounts.collision,
        trigSelfName: triggerPair.selfName,
        trigOtherName: triggerPair.otherName,
        trigNeedEventSensor: sensorCollider.needTriggerEvent,
        trigNeedEventCrate: crateCollider.needTriggerEvent,
        trigCollisionFlagCrate: crateCollider.needCollisionEvent,
        trigCountsRestored: countsBefore.enter >= 0,
        trigMaskAfterFix: crateCollider.getMask() >>> 0,
        trigSensorMaskAfterFix: sensorCollider.getMask() >>> 0,
    };
    return triggerRun;
}

// ---- 框架层「类」本身的构造契约（见文件头 14)）：一次性、memoize，整页每种各一个 ----
let classProof = null;
function proveFrameworkClasses() {
    if (classProof) {
        return classProof;
    }
    // Collider 基类：构造签名 (type: EColliderType)。不挂节点 ⇒ 不进物理世界。
    const bare = new Collider(crateCollider.type);
    // PhysicsMaterial：Asset 子类，先读默认值再改，改完才挂到碰撞体上（避开 EVENT_UPDATE 通道）
    const mat = new PhysicsMaterial();
    const matDefaultFriction = r2(mat.friction);
    const matDefaultRestitution = r2(mat.restitution);
    mat.friction = 0.9;
    mat.restitution = 0.7;
    crateCollider.sharedMaterial = mat;
    // PhysicsSystem：私有构造的 System 单例；游离实例读到的 physicsWorld 与单例同一个
    const stray = new PhysicsSystem();
    const instanceBefore = PhysicsSystem.instance;
    PhysicsSystem.constructAndRegister();
    // PhysicsRayResult：可自构造，默认实例即「未命中」形状
    const fresh = new PhysicsRayResult();
    const pooled = physics.raycastClosestResult;
    classProof = {
        colliderBareType: colliderTypeOf(bare),
        colliderBareTypeMatchesCrate: colliderTypeOf(bare) === colliderTypeOf(crateCollider),
        colliderBareIsCollider: bare instanceof Collider,
        colliderBareIsComponent: bare instanceof Component,
        // 未 onLoad ⇒ _shape 仍是 null；但 worldBounds 读的是 geometry.AABB 的构造默认值
        // （中心原点、半长 1），不是零盒——这条是实测纠偏，别凭直觉写断言。
        colliderBareShapeNull: bare.shape === null,
        colliderBareBoundsCenterX: r2(bare.worldBounds.center.x),
        colliderBareBoundsHalfX: r2(bare.worldBounds.halfExtents.x),
        colliderBareSharedMaterialNull: bare.sharedMaterial === null,
        matDefaultFriction,
        matDefaultRestitution,
        matSharedIsMine: crateCollider.sharedMaterial === mat,
        matFrictionOnCollider: r2(crateCollider.sharedMaterial.friction),
        matInAllMaterials: PhysicsMaterial.allMaterials.indexOf(mat) >= 0,
        // builtin 形状侧无材质通道：setMaterial 是空函数，形状对象上也没有 material 字段
        matShapeHasNoMaterial: crateCollider.shape.material === undefined,
        matShapeCtorStillBuiltin: crateCollider.shape.constructor.name,
        sysStrayIsPhysicsSystem: stray instanceof PhysicsSystem,
        sysStrayNotSingleton: stray !== instanceBefore,
        // physicsWorld 是 selector 的模块级状态，不是实例字段 ⇒ 游离实例看到同一个真世界
        sysStraySeesSameWorld: stray.physicsWorld === instanceBefore.physicsWorld,
        sysConstructAndRegisterIdempotent: PhysicsSystem.instance === instanceBefore,
        rayResFreshDistance: fresh.distance,
        rayResFreshColliderNull: fresh.collider === null,
        rayResFreshHitPoint: `${r2(fresh.hitPoint.x)},${r2(fresh.hitPoint.y)},${r2(fresh.hitPoint.z)}`,
        rayResFreshSameClassAsPooled: fresh.constructor === pooled.constructor,
        rayResPooledIsInstanceField: pooled === physics.raycastClosestResult,
    };
    return classProof;
}

// ---- 查询：单位方向射线（见文件头 3)：distance 以 ray.d 长度为单位）----
function namesOfResults() {
    return [...physics.raycastResults]
        .map((r) => r.collider.node.name)
        .sort()
        .join(',');
}

function castSummary(label, ox, oy, oz, dx, dy, dz, mask, maxDistance, queryTrigger) {
    const ray = new geometry.Ray(ox, oy, oz, dx, dy, dz);
    const hit = physics.raycast(ray, mask, maxDistance, queryTrigger);
    const out = {};
    out[`${label}Hit`] = hit;
    out[`${label}Count`] = physics.raycastResults.length;
    out[`${label}Names`] = namesOfResults();
    const first = physics.raycastResults.length ? physics.raycastResults[0] : null;
    out[`${label}FirstDist`] = first ? r2(first.distance) : -1;
    out[`${label}FirstHitX`] = first ? r2(first.hitPoint.x) : -1;
    out[`${label}FirstHitY`] = first ? r2(first.hitPoint.y) : -1;
    out[`${label}NormalX`] = first ? r2(first.hitNormal.x) : -1;
    out[`${label}NormalY`] = first ? r2(first.hitNormal.y) : -1;
    out[`${label}NormalZ`] = first ? r2(first.hitNormal.z) : -1;
    return out;
}

function castClosestSummary(label, ox, oy, oz, dx, dy, dz, mask, maxDistance) {
    const ray = new geometry.Ray(ox, oy, oz, dx, dy, dz);
    const hit = physics.raycastClosest(ray, mask, maxDistance);
    const res = physics.raycastClosestResult;
    const out = {};
    out[`${label}Hit`] = hit;
    out[`${label}IsRayResult`] = res instanceof PhysicsRayResult;
    out[`${label}Name`] = hit && res.collider ? res.collider.node.name : '';
    out[`${label}Dist`] = hit ? r2(res.distance) : -1;
    out[`${label}HitX`] = hit ? r2(res.hitPoint.x) : -1;
    out[`${label}NormalX`] = hit ? r2(res.hitNormal.x) : -1;
    out[`${label}NormalY`] = hit ? r2(res.hitNormal.y) : -1;
    out[`${label}NormalZ`] = hit ? r2(res.hitNormal.z) : -1;
    return out;
}

function queryBlock() {
    return {
        ...castSummary('castX', -6, 0.75, 0, 1, 0, 0, ALL_MASK, 20, true),
        ...castSummary('castCrateOnly', -6, 0.75, 0, 1, 0, 0, GROUP_CRATE, 20, true),
        ...castSummary('castBallOnly', -6, 0.75, 0, 1, 0, 0, GROUP_BALL, 20, true),
        ...castSummary('castDefaultOnly', -6, 0.75, 0, 1, 0, 0, PhysicsGroup.DEFAULT, 20, true),
        ...castSummary('castNear', -6, 0.75, 0, 1, 0, 0, ALL_MASK, 4, true),
        ...castSummary('castTooFar', -6, 0.75, 0, 1, 0, 0, ALL_MASK, 3, true),
        ...castSummary('castInsideBall', 0, 0.7, 0, 1, 0, 0, ALL_MASK, 6, true),
        ...castSummary('castSensor', -6, 3.6, 0, 1, 0, 0, ALL_MASK, 20, false),
        ...castSummary('castMiss', -6, 12, 0, 1, 0, 0, ALL_MASK, 20, true),
        ...castClosestSummary('nearX', -6, 0.75, 0, 1, 0, 0, ALL_MASK, 20),
        ...castClosestSummary('nearSensor', -6, 3.6, 0, 1, 0, 0, ALL_MASK, 20),
        ...castClosestSummary('nearMiss', -6, 12, 0, 1, 0, 0, ALL_MASK, 20),
    };
}

function lineStripBlock() {
    const points = [new Vec3(-6, 0.75, 0), new Vec3(6, 0.75, 0), new Vec3(6, 3.6, 0)];
    const hit = physics.lineStripCast(points, ALL_MASK, 20, true);
    const results = physics.lineStripCastResults;
    const first = results.length ? results[0] : null;
    return {
        stripHit: hit,
        stripCount: results.length,
        stripNames: [...results]
            .map((r) => r.collider.node.name)
            .sort()
            .join(','),
        // builtin 从不给 segmentIndex 赋值（见文件头 12)）⇒ 这里读回的是 typeof 结果
        stripFirstSegType: first ? typeof first.segmentIndex : 'none',
        stripFirstDist: first ? r2(first.distance) : -1,
    };
}

function sweepBlock() {
    const ray = new geometry.Ray(-6, 0.75, 0, 1, 0, 0);
    const half = new Vec3(0.2, 0.2, 0.2);
    const orientation = new Quat();
    const all = physics.sweepBox(ray, half, orientation, ALL_MASK, 20, true);
    const allCount = physics.sweepCastResults.length;
    const closest = physics.sweepBoxClosest(ray, half, orientation, ALL_MASK, 20, true);
    return { sweepAll: all, sweepAllCount: allCount, sweepClosest: closest };
}

function readback() {
    const filters = setupFilters();
    const proof = proveNoSimulation();
    const triggers = exerciseTriggers();
    const groundBounds = groundCollider.worldBounds;
    const crateBounds = crateCollider.worldBounds;
    const ballBounds = ballCollider.worldBounds;
    const capsuleBounds = capsuleCollider.worldBounds;
    const sensorBounds = sensorCollider.worldBounds;
    const trimeshBounds = trimeshCollider.worldBounds;
    const crateSphere = crateCollider.boundingSphere;
    const bodies = physics.physicsWorld.bodies;
    return {
        backend: selector.id,
        flagNone: PhysicsSystem.PHYSICS_NONE,
        flagBuiltin: PhysicsSystem.PHYSICS_BUILTIN,
        flagCannon: PhysicsSystem.PHYSICS_CANNON,
        flagBullet: PhysicsSystem.PHYSICS_BULLET,
        flagPhysx: PhysicsSystem.PHYSICS_PHYSX,
        worldCtor: physics.physicsWorld.constructor.name,
        // 见文件头 9)：这个名字在发行产物里属于 2D selector，只能作为名称冲突本身的证据。
        flatSelectorId: selector.id,
        threeDSelectorId: physicsNamespace.selector.id,
        flatSelectorBackendKeys: Object.keys(selector.backend).sort().join(','),
        flatSelectorWrapperCount: Object.keys(selector.wrapper).length,
        flatSelectorHasBoxShape: selector.wrapper.BoxShape != null,
        flatSelectorHasCircleShape: selector.wrapper.CircleShape != null,
        enabled: !!physics.enable,
        autoSimulation: !!physics.autoSimulation,
        allowSleep: !!physics.allowSleep,
        maxSubSteps: physics.maxSubSteps,
        fixedTimeStep: r2(physics.fixedTimeStep),
        systemSleepThreshold: r2(physics.sleepThreshold),
        minVolumeSize: physics.minVolumeSize,
        gravityX: physics.gravity.x,
        gravityY: physics.gravity.y,
        gravityZ: physics.gravity.z,
        worldHasGravity: 'gravity' in physics.physicsWorld,
        bodyCount: bodies.length,
        shapeCount: bodies.reduce((n, b) => n + b.shapes.length, 0),
        trimeshInWorld: bodies.some((b) => b.node.name === 'Trimesh'),
        groundShapeCtor: groundCollider.shape.constructor.name,
        crateShapeCtor: crateCollider.shape.constructor.name,
        ballShapeCtor: ballCollider.shape.constructor.name,
        capsuleShapeCtor: capsuleCollider.shape.constructor.name,
        trimeshShapeCtor: trimeshCollider.shape.constructor.name,
        groundMeshMax: meshBound('Ground', 'max'),
        crateMeshMax: meshBound('Crate', 'max'),
        crateMeshMin: meshBound('Crate', 'min'),
        ballMeshMax: meshBound('Ball', 'max'),
        capsuleMeshMax: meshBound('Capsule', 'max'),
        capsuleMeshMin: meshBound('Capsule', 'min'),
        trimeshMeshMax: meshBound('Trimesh', 'max'),
        groundColliderType: groundCollider.type,
        ballColliderType: ballCollider.type,
        capsuleColliderType: capsuleCollider.type,
        trimeshColliderType: trimeshCollider.type,
        colliderInheritsBase:
            crateCollider instanceof Collider &&
            ballCollider instanceof Collider &&
            capsuleCollider instanceof Collider &&
            trimeshCollider instanceof Collider,
        crateBodyType: ERigidBodyType[crateBody.type],
        groundBodyType: ERigidBodyType[groundBody.type],
        ballBodyType: ERigidBodyType[ballBody.type],
        capsuleBodyType: ERigidBodyType[capsuleBody.type],
        sensorBodyType: ERigidBodyType[sensorBody.type],
        attachedBodyIdentity: crateCollider.attachedRigidBody === crateBody,
        shapeColliderIdentity: crateCollider.shape.collider === crateCollider,
        groundSizeX: r2(groundCollider.size.x),
        groundSizeY: r2(groundCollider.size.y),
        groundSizeZ: r2(groundCollider.size.z),
        groundAabbcX: r2(groundBounds.center.x),
        groundAabbcY: r2(groundBounds.center.y),
        groundAabbhx: r2(groundBounds.halfExtents.x),
        groundAabbhy: r2(groundBounds.halfExtents.y),
        groundAabbbh: r2(groundBounds.halfExtents.z),
        crateAabbcX: r2(crateBounds.center.x),
        crateAabbcY: r2(crateBounds.center.y),
        crateAabbhx: r2(crateBounds.halfExtents.x),
        crateObbHalfX: r2(crateCollider.shape.worldObb.halfExtents.x),
        ballAabbhx: r2(ballBounds.halfExtents.x),
        ballWorldRadius: r2(ballCollider.shape.worldSphere.radius),
        capsuleAabbhy: r2(capsuleBounds.halfExtents.y),
        capsuleRadius: r2(capsuleCollider.radius),
        capsuleHeight: r2(capsuleCollider.height),
        capsuleCylinderHeight: r2(capsuleCollider.cylinderHeight),
        capsuleDirection: capsuleCollider.direction,
        capsuleShapeRadius: r2(capsuleCollider.shape.worldCapsule.radius),
        capsuleShapeHalfHeight: r2(capsuleCollider.shape.worldCapsule.halfHeight),
        capsuleShapeTotalHeight: r2(
            (capsuleCollider.shape.worldCapsule.halfHeight + capsuleCollider.shape.worldCapsule.radius) * 2,
        ),
        sensorAabbhx: r2(sensorBounds.halfExtents.x),
        trimeshAabbcX: r2(trimeshBounds.center.x),
        trimeshAabbhx: r2(trimeshBounds.halfExtents.x),
        crateSphereRadius: r2(crateSphere.radius),
        crateSphereCenterX: r2(crateSphere.center.x),
        ...filters,
        ...proof,
        ...triggers,
        ...proveFrameworkClasses(),
        ...queryBlock(),
        ...lineStripBlock(),
        ...sweepBlock(),
    };
}

// ---- 交互：真实点击把木箱挪进触发盒，读回「改变换 → 未同步 → 已同步」三态 ----
let preClick = null;
let unsynced = null;
function moveCrateIntoSensor() {
    if (preClick) {
        return;
    }
    preClick = readback();
    crate.setPosition(new Vec3(CRATE_SENSOR.x, CRATE_SENSOR.y, CRATE_SENSOR.z));
    unsynced = readback();
    physics.syncSceneToPhysics();
}
input.on(Input.EventType.TOUCH_START, moveCrateIntoSensor);

class PhysicsFrameCount extends Component {
    update() {
        window.__frames = (window.__frames || 0) + 1;
        window.__geom = readback();
    }
}

const hostNode = new Node('PhysicsHost');
scene.addChild(hostNode);
hostNode.addComponent(PhysicsFrameCount);

installAssetLifecycle({
    label: 'physics-3d-basic',
    hold: () => ownedAssets.filter((entry) => isValid(entry.ref)),
    release: () => {
        for (const slot of renderSlots) {
            slot.renderer.mesh = null;
            slot.renderer.material = null;
        }
        for (const asset of ownedAssets) {
            asset.ref.destroy();
        }
        ownedAssets.length = 0;
    },
    reacquire: () => {
        for (const slot of renderSlots) {
            assignVisual(slot);
        }
        return ownedAssets;
    },
});

window.__airApp = app;
window.__moveCrate = moveCrateIntoSensor;
app.run(scene);

window.__probe = async () => {
    const now = readback();
    return preClick ? { ...now, before: preClick, unsynced } : now;
};
