# 3D 物理后端与行为调查

当前默认 bundle 同时包含 builtin 与 Cannon；初始化前使用 `createAirApp({ physics: 'cannon' })` 选择，默认仍为 builtin。下文仅在变体内验证 Cannon 的结果属于当时快照，不能沿用为当前排除结论。

> 本文保留原调查日期、命令和观察结果，属于专题调查记录。阶段编号与旧测量值不表示当前发行状态；现行范围见 [功能范围](../reference/web-features.md)，验收状态见 [发布复核](../reference/release-review.md)。

对象：`examples/physics-3d-basic`（计划书 G1：默认发行产物里 3D 物理后端 = builtin，逐 API 钉死能力边界）。
断言位置：`tools/verify/browser-matrix-contract.json` 的 `physics-3d-basic` 行（组 LV12-15，三引擎，
**304 条 `probeEquals`（274 顶层 + 15 条 `before.*` + 15 条 `unsynced.*`）+ 2 条 `probeNonEmpty`**，
`waitMs 3500`、`click 240,180`、`afterClickMs 1500`、`minPngBytes 8000`、`frameChanged false`）。
本笔记每条引擎行为结论都附「实测命令 + JSON 产物路径」；未附的即「待核」，不作为结论使用。
诊断证据目录：`E:/AIProMax/cocosair-scratch/v12-diag/`（仓库外 scratch，清单见第 10 节）。

上游给 builtin 的定位是这句话，本例把它拆成可复跑断言：
"efficient discrete collision detector, **not a full physical simulator**"（`src/cocos/physics/cocos/builtin-world.ts:50-55`）。

## 1. 「不模拟」有四条互相独立的证据，而不是一条

单看 `crateDriftX/Y/Z = 0` 会以为是自己没驱动它。四条独立证据（三引擎一致，见第 9 节）：

| 证据 | 实测键 = 值 |
| --- | --- |
| 60 轮手动步进后世界形状与节点都不动 | `stepsRun 60`、`crateDriftX/Y/Z 0`、`crateObbCenterDriftX 0`、`obbCenterAfterFirstSyncX -2.2`（初始位置本身） |
| 速度接口连输出参数都不写 | `linearSentinelX/Y/Z 9`、`angularSentinelX/Z 8`（用 (9,9,9)/(8,8,8) 哨兵调 `getLinearVelocity(out)`，读回原值） |
| 刚体属性只是组件记账 | `massReadBack 2.5`、`useGravityReadBack true`、`allowSleepReadBack true`、`linearDampingReadBack 0.2`、`angularDampingReadBack 0.3`、`sleepThresholdReadBack 0`、`useCcdReadBack false`、`isAwakeReadBack true`、`isSleepingReadBack false` |
| 材质根本没有下行通道 | `matShapeHasNoMaterial true`、`matShapeCtorStillBuiltin "BuiltinBoxShape"`（`BuiltinShape.setMaterial(v){}` 是空函数） |

源码侧对应：`BuiltinRigidBody` 的 setMass/setType/useGravity/apply 系列/setLinearVelocity 为空函数，
`getLinearVelocity(out)` 不写 out（`builtin-rigid-body.ts:63-89`）；`BuiltInWorld.setGravity` 空实现
（`builtin-world.ts:125-127`）⇒ `worldHasGravity false`（世界对象上没有 gravity 状态可读），
而 framework 层 `PhysicsSystem.gravity` 读回 `(0,-10,0)`（`gravityX 0`/`gravityY -10`/`gravityZ 0`）。
`syncAfterEvents()` 只调 `syncSceneToPhysics()`，方向仍是 scene→physics（`builtin-world.ts:194-202`）
⇒ **不存在 physics→scene 的写回路径**，所以自由落体在 builtin 下不是「没调 step」而是「没有积分器」。

禁止的取证捷径（已写进 `example.json` 的 `forbiddenShortcut`）：用 `autoSimulation=false` 冒充「不模拟」——
builtin 的 `step()` 本来就不积分，关掉 autoSimulation 会连帧内 scene→physics 同步一起关掉，把第 4 节的三态时序搅浑。

## 2. 后端身份只能运行时判定：顶层 `selector` 这个名字被 2D 侧占走了

`physics/framework/index.ts:87` 与 `physics-2d/framework/index.ts:63` 各自导出同名 `selector`，
经 `src/exports/air.ts` 聚合后 `import { selector } from 'cocosair'` 拿到的是 **2D** 那个。
实测（`--out=.../matrix-physics3d-3eng-r7.json`，records[*].probe）：
`flatSelectorId "box2d"`、`flatSelectorBackendKeys "box2d"`、`flatSelectorWrapperCount 13`、
`flatSelectorHasBoxShape true`、`flatSelectorHasCircleShape true` ⇒ 这 13 个 wrapper 全是 2D 形状/关节，
3D builtin 只注册 5 个 wrapper 这一事实**无法**从顶层 `selector` 读出。

可行的判定是构造器身份：`backend "box2d"`（本例刻意把这个扁平读回与下面 3D 读回并列，避免读者误判）、
`worldCtor "BuiltInWorld"`、`flagBuiltin true`、`flagCannon false`、`flagBullet false`、`flagPhysx false`、`flagNone false`，
形状侧 `groundShapeCtor/crateShapeCtor "BuiltinBoxShape"`、`ballShapeCtor "BuiltinSphereShape"`、`capsuleShapeCtor "BuiltinCapsuleShape"`。
另外 `PhysicsSystem.instance` 要等 `createAirApp()` 之后才存在（`_instance` 由
`director.once(DirectorEvent.INIT, () => PhysicsSystem.constructAndRegister())` 建立，`physics-system.ts:875-912`），
模块顶层取到的是 null。

## 3. 碰撞过滤是双向与运算：只 `setGroup` 会让该刚体从所有配对里静默消失

`step()` 里 `bodyA.collisionFilterGroup & bodyB.collisionFilterMask` 与反向各判一次，任一为 0 就跳过配对
（`builtin-world.ts:183-186`），而 `Collider.collisionMask` 默认只有 `PhysicsGroup.DEFAULT`（= 1）。
示例分两阶段取证（同一页内先后跑，两阶段都进契约）：

- 只 `crateCollider.setGroup(2)`：`trigEnterFiltered 0`、`trigStayFiltered 0`（**不是「触发器坏了」**），
  且 `crateMaskAfterGroupOnly 1`、`sensorMaskBefore 1` 说明两侧 mask 都还是默认值。
- 两侧都 `setMask(0xffffffff)`：`trigEnter 1`、`trigStay 1`、`trigExit 1`、
  `trigMaskAfterFix 4294967295`、`trigSensorMaskAfterFix 4294967295`、`trigCountsRestored true`。

接触回调在 builtin 下不存在：`emitEvents()` 只调 `emitTriggerEvent()`（`builtin-world.ts:204-206`）
⇒ `trigCollision 0`，无论怎么配组。`trigSelfName "Sensor"`、`trigOtherName "Crate"`、
`trigNeedEventSensor true`、`trigNeedEventCrate false`、`trigCollisionFlagCrate true` 一起说明
「碰撞对只在至少一侧注册过 trigger 监听时才被记录」（`collider.needTriggerEvent`，`builtin-shared-body.ts:118-131`）。

## 4. 变换同步是惰性的：`before` / `unsynced` / `now` 三态必须同时钉住

点击处理函数一次 `crate.setPosition()` 之后**只**调一次 `syncSceneToPhysics()`，其间读三次完整快照。
契约用 15 条 `before.*` + 15 条 `unsynced.*` + 顶层（= `now`）钉这三态；判据是 `before` 与 `unsynced`
逐字段全等、`now` 相对它们只在 33 个字段上变化。举五组（全量见 `probe-lines.txt`）：

| 路径 | `before.*` = `unsynced.*` | 顶层 `now` |
| --- | --- | --- |
| `crateAabbcY` | `0.75` | `3.6` |
| `nearXName` | `"Crate"` | `"Ball"`（`nearXDist 5.3` vs `3.05`） |
| `castXNames` | `"Ball,Capsule,Crate"`（`castXCount 3`） | `"Ball,Capsule"`（`castXCount 2`） |
| `castCrateOnlyHit` | `true`（`castCrateOnlyNames "Crate"`） | `false`（`castCrateOnlyCount 0`） |
| `stripCount` | `3`（`stripNames "Ball,Capsule,Crate"`） | `2`（`stripNames "Ball,Capsule"`） |

源码依据：改 `node.setPosition` 后 `collider.worldBounds` 仍是旧世界形状，直到 `syncSceneToPhysics()`
（或下一帧 postUpdate）按 `node.hasChangedFlags` 重算（`builtin-shared-body.ts:147-157`）。
首帧的另一条同向证据：`obbCenterPreSyncX 0`（未同步前 OBB 中心还在原点）→ `obbCenterAfterFirstSyncX -2.2`。

因为 builtin 无积分，点击后画面静止 ⇒ 契约 `frameChanged false`（矩阵 `checks.frameChanged` 为「与期望一致」）。

## 5. 查询能力边界：命中是真的，但六处细节只能读回、不能凭签名推

`raycast / raycastClosest / lineStripCast` 走 `geometry.intersect.resolve` 对 OBB/Sphere/Capsule 求交
（`builtin-world.ts:208-253`），命中集与手算几何一致（`castXNames "Ball,Capsule"`、
`castXFirstDist 5.3`、`castXFirstHitX -0.7`、`castSensorNames "Crate,Sensor"`、`castSensorFirstDist 3.05`）。
六处必须钉住的边界：

1. **命中法线恒为零向量**：`cast*NormalX/Y/Z` 与 `near*NormalX/Y/Z` 全为 `0`（225、247 行写死 `Vec3.ZERO`）。
2. **结果顺序 = 刚体注册序，不是距离序**：`castXNames "Ball,Capsule"` 里 Ball 先注册；要最近命中只能用
   `raycastClosest()`（`nearXName "Ball"`、`nearSensorName "Sensor"`）。
3. **「起点在形状内部」不等于不命中，`distance === 0` 的跳过分支要按形状类型区分**：从球心 `(0,0.7,0)` 向 +X 打，
   Ball 仍以出射距离命中（`castInsideBallNames "Ball,Capsule"`、`castInsideBallFirstDist 0.7`、
   `castInsideBallFirstHitX 0.7`）。`raycast`/`raycastClosest` 里的 `if (distance === 0 || distance > max_d) continue`
   （`builtin-world.ts:217-219`、`238-240`）只在 `geometry.intersect.resolve` 恰好返回 0 时生效；
   **本例没有构造出该分支的正例**，所以它只登记为源码事实，不写成行为结论。
4. **`options.queryTrigger` 在 builtin 分支从未被读取** ⇒ `raycast(ray, mask, dist, false)` 照样命中触发盒
   （`castSensorHit true`）。
5. **`distance` 以 `ray.d` 的长度为单位**（`geometry.Ray` 不归一化方向）⇒ 示例一律传单位向量。
6. **`PhysicsRayResult.segmentIndex` 从不赋值**：`stripFirstSegType "undefined"`（typeof 读回）。

`sweepBox` / `sweepBoxClosest` 在 builtin 下恒不命中：`sweepAll false`、`sweepAllCount 0`、`sweepClosest false`
（`warnID(9640)` + return false，`physics-selector.ts:331-366`）；传 `new Quat()` 姿态也是 0 条。
`MeshCollider` 进不了世界：`cocos/instantiate.ts:34-40` 只登记 RigidBody/Box/Sphere/Capsule/PhysicsWorld 五项，
`createShape(MESH)` 命中 `check()` 分支打印 `builtin physics does not support MeshCollider` 并返回 `ENTIRE_SHAPE` 空桩
⇒ `trimeshInWorld false`、`trimeshShapeCtor "Object"`、`shapeCount 5`（不含它）、`trimeshColliderType 5`、
`trimeshAabbcX 0`/`trimeshAabbhx 1`（空桩 `getAABB` 是空函数，worldBounds 停在构造默认值）。
组查询的分组读回：`castBallOnly*` 1 条、`castDefaultOnly*` 1 条（只命中 Capsule，因为其余三类 group/mask 不匹配）、
`castCrateOnly*` 0 条（点击后木箱已在半空）、`castMiss*`/`castTooFar*`/`castNear*` 未命中族
（未命中时 `distance` 与法线读回 `-1`，是本例的「未命中哨兵」而非引擎值）。

## 6. 两个尺寸陷阱：世界形状与组件记账、网格与碰撞体都不自动对齐

- **`CapsuleCollider.height` 在 `onLoad` 之前设置不会传进 builtin 形状**：`BuiltinCapsuleShape.onLoad`
  只回读 `radius` 与 `direction`（`builtin-capsule-shape.ts:75-79`），`halfHeight` 停在构造默认 0.5。
  实测组件侧 `capsuleHeight 1.6`、`capsuleRadius 0.4`、`capsuleCylinderHeight 0.8`、`capsuleDirection 1`，
  世界侧 `capsuleShapeHalfHeight 0.5`、`capsuleShapeRadius 0.4`、`capsuleShapeTotalHeight 1.8`
  ⇒ 世界胶囊实高 1.8，而 `capsuleAabbhy 0.9`（= 1.8/2）。
- **`primitives` 三个入口签名不对称**：`box(opts)` 收对象、`sphere(radius)` 收半径、
  `capsule(radiusTop, radiusBottom, height)` 收三个位置参数且 `height` 是含两端球的总高
  （`src/cocos/primitive/capsule.ts:52-53`）。照 `sphere` 的习惯写 `capsule(0.4, 1.6)` 会得到
  `torsoHeight = 0` 的退化碗状体且不报错 ⇒ 本例写 `capsule(0.4, 0.4, 1.6)`，网格高 1.6 与碰撞体 1.8 不重合是**事实**。
- 视觉是否正确只能靠网格 min/max 回读判定（`*_MeshMax.x` 一类）：`groundMeshMax 4.5/0.15/3`、
  `crateMeshMax 0.75³`、`ballMeshMax 0.7³`、`capsuleMeshMax 0.4/0.8/0.4`、`capsuleMeshMin -0.4/-0.8/-0.4`、
  `trimeshMeshMax 0.68/0.18/0.68`。
- **`Collider.boundingSphere` 在 builtin 下永远读不到形状**：getter 先建一个默认 `geometry.Sphere`，
  再在有形状时调 `_shape.getBoundingSphere(out)`（`collider.ts:196-200`），而
  `BuiltinShape.getBoundingSphere(v){ }` 与 `setMaterial` 是同一族空函数（`builtin-shape.ts:34`）
  ⇒ 动态木箱已同步到 `x=-2.2` 之后读回仍是 `crateSphereCenterX 0`、`crateSphereRadius 1`（构造默认值）。
  同族默认值坑（与 2D 那条同源）：`BoxCollider.size` 默认 1×1×1（`box-collider.ts:87`）、
  `SphereCollider.radius` 默认 0.5，都不跟随 Mesh 尺寸 ⇒ 逐个显式设定后断言
  `groundSizeX/Y/Z 9/0.3/6`、`groundAabbhx/hy 4.5/0.15`、`ballWorldRadius 0.7`、`ballAabbhx 0.7`、
  `crateObbHalfX 0.75`。**`worldBounds` 会被 `syncSceneToPhysics()` 更新，`boundingSphere` 没人写**——
  两者不对称，宽相位相关的代码不能拿 `boundingSphere` 当依据。

## 7. 四个框架层「类」自身的构造契约（本轮新增，24 条 `probeEquals`）

前 6 节全部经 `PhysicsSystem.instance` / 组件实例取证，因此 `Collider`、`PhysicsMaterial`、
`PhysicsSystem`、`PhysicsRayResult` **这四个类本身**在门禁里是「从未被构造」（详见第 9 节的 `api-executed`）。
示例为此加了 `proveFrameworkClasses()`（memoize，整页每种各一个），读回全部为真：

- `Collider` 构造签名是 `(type: EColliderType)`（`collider.ts:237-240`），子类用 `static readonly Type` 暴露枚举表。
  裸实例：`colliderBareType 0`、`colliderBareTypeMatchesCrate true`、`colliderBareIsCollider true`、
  `colliderBareIsComponent true`、`colliderBareShapeNull true`、`colliderBareSharedMaterialNull true`，
  `bodyCount` 仍是 5 ⇒ 不挂节点就不进世界。**`worldBounds` 不是零盒**：`colliderBareBoundsCenterX 0` /
  `colliderBareBoundsHalfX 1` 是 `geometry.AABB` 的构造默认值（这条是实测纠偏——直觉上会写成 0）。
- `PhysicsMaterial` 是 `Asset` 子类：构造即把自己 push 进 `PhysicsMaterial.allMaterials`
  （`physics-material.ts:148-153`），默认 `matDefaultFriction 0.6`、`matDefaultRestitution 0`
  （**不是** 3D 建模习惯里的 0.3）；`crateCollider.sharedMaterial = mat` 后
  `matSharedIsMine true`、`matFrictionOnCollider 0.9`、`matInAllMaterials true`，但世界形状上没有材质
  （`matShapeHasNoMaterial true`）⇒ 这是「builtin 不模拟」的第 4 条证据（第 1 节）。
  注意 `Collider.material` getter 在共享态下会 **clone**，取证只读 `sharedMaterial`。
- `PhysicsSystem`：`constructAndRegister()` 幂等（`sysConstructAndRegisterIdempotent true`——再调一次
  `instance` 不变），但它**不禁止** `new PhysicsSystem()`：游离实例 `sysStrayIsPhysicsSystem true`、
  `sysStrayNotSingleton true`，而 `sysStraySeesSameWorld true`——因为 `physicsWorld` getter 读的是
  selector 的模块级状态而不是实例字段。⇒ 不得把 `new PhysicsSystem()` 说成「第二个物理系统」。
- `PhysicsRayResult` 可自构造：`rayResFreshDistance 0`、`rayResFreshColliderNull true`、
  `rayResFreshHitPoint "0,0,0"`、`rayResFreshSameClassAsPooled true`，且池对象
  `rayResPooledIsInstanceField true`（`raycastClosestResult` 就是 `instance` 上的字段实例）。

这些临时对象刻意**不进** §25 `ownedAssets` 生命周期合同（不 destroy、不计入 release 断言）：
`PhysicsMaterial` 的 `destroy()` 走 `Asset` 通道且只打 `debug()` 日志，但把它纳入合同会让
「资源已释放」断言与本页的物理状态耦合，取证收益为零。

## 8. 引擎默认值与系统级读回（一次性登记，防止后续示例改数值）

`enabled true`、`autoSimulation true`、`allowSleep true`、`maxSubSteps 1`、`fixedTimeStep 0.02`、
`minVolumeSize 0.00001`、`systemSleepThreshold 0.1`（系统默认 0.1 vs 组件读回 0，见第 1 节）、
`bodyCount 5`、`shapeCount 5`、`attachedBodyIdentity true`、`shapeColliderIdentity true`、
`colliderInheritsBase true`、`isDynamicReadBack true`、`isSleepyReadBack false`、
`defaultGroup 1`、`groundGroup 1`/`groundMask 1`、`crateGroup 2`、`ballGroup 4`、`capsuleGroup 1`、`sensorGroup 1`、
`groundBodyType "STATIC"`、`crateBodyType "DYNAMIC"`、`ballBodyType "STATIC"`、`sensorBodyType "STATIC"`、
`capsuleBodyType "KINEMATIC"`、`groundColliderType 0`、`ballColliderType 1`、`capsuleColliderType 2`、`trimeshColliderType 5`。

## 9. 逐引擎差异、良性日志与截图

**0 条语义差**：304 条 `probeEquals` 在 chromium / firefox / webkit 全部相等，且 r4→r5→r6→r7 四轮
`0 条次间漂移`（对照脚本 `harvest-r4.cjs`，产物 `matrix-physics3d-3eng-r4.json`）。
`probeNonEmpty` 只有 `before`、`unsynced` 两个容器（其字段逐条进 `probeEquals`，容器本身只判存在）。
本例没有任何计时类探针，所以不需要 `probePresent` 通道。

良性日志 1 条（`benignConsole`，全局 allowlist `[Physics] PhysicsSystem initDefaultMaterial()`）：
`[Physics] PhysicsSystem initDefaultMaterial() Failed to load builtinMaterial.` —— 三引擎各 1 次，
`consoleErrors []`、`failedRequests []`。builtin 没有 default physics material 的内置资源，属已知上游行为。

截图（r7 单例轮，`docs/evidence/browser-matrix/physics-3d-basic/matrix-<engine>.png`）：
chromium 11402 B `d1aaeb5bc0e179ce`、firefox 13690 B `3107a3292153d018`、webkit 12828 B `f30950970319ae68`，
`pngFloors {"after":8000}`。r3→r6→r7 三张图**逐字节不变**（覆盖前快照：
`r3-{chromium,firefox,webkit}.png`、`r6-{chromium,firefox,webkit}.png`），
即「加 24 条探针 + 两处取证纠偏」没有改动画面。

## 10. 门禁侧机制发现（本轮新增，属工具事实而非引擎事实）

`tools/verify/api-trace.cjs` 的插桩口径决定了「claimed 但未执行」判红的确切含义：

1. **带命名空间前缀的类单元是「别名」，只能靠构造扁平导出计数**：`physics.Collider` /
   `physics.PhysicsRayResult` / `physics.PhysicsSystem` 经 `nsCopy` 记成 `alias:Collider` 等，
   `normalizeTrace` 里 `via` 只看 `calls`（dotted 单元不吃 `reads`）。引擎内部 `new` 用的是 bundle 原始类，
   不经过导出 Proxy ⇒ 必须由示例自己 `new` 一次。第 7 节就是为此而加，**不是**为了凑数：
   三条 `not-observed` 判红（`api-executed: 3/67 claimed APIs never executed`）在 r7 后消失。
2. **三段式「命名空间.类.实例方法」结构性不可插桩**：`install()` 对 `parts.length > 2` 的宿主只试
   `patchOwn(host, leaf, unit, 'static')`（`api-trace.cjs` 的 install 分支），而
   `physics.Collider.getGroup`、`physics.PhysicsSystem.raycast` 这类是**原型/实例**成员 ⇒ 永远 `unresolved`。
   后果是口径而非结果：`unresolved` 走 `attested`（要求 `bound`，即证据行 + PASS validator），
   所以物理系示例的 `verified` 天花板低于扁平 API 示例（本例 35 verified / 34 attested / 0 unproven）。
   这是门禁自身的边界，登记进审计台账，不得当作「API 未使用」。
3. **`spec-evidence` 的证据行按词强度退避，同名弱词会塌到无关行**：`findSymbolLine` 的接收者 narrowing
   只对 `^[A-Z]...\.method` 形式的单元生效，`physics.Collider.type`（首段小写 `physics`）落到「裸标识符」档，
   首次绑到 `groundBody.type = ERigidBodyType.STATIC`（那是刚体类型，与 `Collider.type` 无关）；
   `primitives.capsule` 因局部变量名恰为 `capsule` 而绑到 `scene.addChild(capsule)`。
   两处已在源码侧纠偏而非改绑：加 `colliderTypeOf()` 读取器（真实读 `collider.type`，位置在 RigidBody 之前），
   局部变量 `capsule` → `capsuleNode`。复核命令：`node E:/AIProMax/cocosair-scratch/v12-diag/show-evidence.cjs`
   ⇒ `physics.Collider.type L198 return collider.type;`、`primitives.capsule L264 ... primitives.capsule(0.4, 0.4, 1.6) ...`。
   另：`physics.PhysicsRayResult.clone` 刻意**不**claim——`findSymbolLine` 会把它绑到无关的
   `sensor.position.clone()`，宁可少 claim 也不留错证据行。

## 11. 证据清单（诊断轮次 → 结论）

| 产物（scratch `v12-diag/`） | 内容 |
| --- | --- |
| `gen-example-json.cjs` | `examples/physics-3d-basic/example.json` 的唯一权威生成器（69 claims、validator 绑定表、契约数字） |
| `matrix-physics3d-3eng-r4.json` | 首次把 24 条类构造探针接入后的 3/3 PASS；`harvest-r4.cjs` 由此导出未断言键并做跨引擎/跨轮对照 |
| `matrix-physics3d-3eng-r5.json` | 修 `colliderBareBounds*`（零盒假设被证伪）与 restitution 默认值后的 3/3 PASS，契约 304 条 |
| `matrix-physics3d-3eng-r6.json` | 契约追加后复跑：3/3 PASS、`contractFingerprint 1b545ae5a7bef3f3`、截图字节不变 |
| `matrix-physics3d-3eng-r7.json` | 两处证据行纠偏后复跑：3/3 PASS、`completed:true`、`subset:true`、截图与 r6 逐字节一致 |
| `r3-*.png` / `r6-*.png` | 覆盖前逐字节快照（一文件名 = 一次捕获） |
| `append-row.cjs` | 契约行追加器：跨引擎不一致 / 三态值不同 / 非有限数一律拒写（本轮 `rejected 0`） |
| `dump-probe.cjs` → `probe-lines.txt` | 304 条 `path = value` 全清单（本笔记引用值的来源） |
| `show-evidence.cjs` | 69 条 `api → 行号 → 该行内容` 复核表（第 10 节 3 条结论的来源） |

实测命令（单例轮，可复跑）：

```
NODE_PATH=E:/AIProMax/Y2026M08/AIShaderBenchmark/node_modules \
  node tools/verify/browser-matrix.cjs --ids=physics-3d-basic \
  --out=E:/AIProMax/cocosair-scratch/v12-diag/matrix-physics3d-3eng-r7.json   # 3/3 PASS, completed=true
```

## 12. 规格侧收尾链（顺序不可换，否则自伤 stale 判定）

`main.js`/`example.json`（经 `gen-example-json.cjs`）→ `node tools/examples/spec-evidence.cjs`
→ `node tools/examples/generate-manifest.cjs`（56 examples / 22 categories）
→ `NODE_PATH=… node tools/examples/spec-expectations.cjs apply --ids=physics-3d-basic`
（`graph=9 corroborated=8 gaps=1 unresolved=11 executed=35`、`authored transform-equals:9`、`gaps=0`）
→ 写 `specStatus:"frozen"` 后重复前三步
→ `NODE_PATH=… node tools/verify/example-spec-browser.cjs --ids=physics-3d-basic` ⇒ **PASS + promoted**，
`promotion = { spec 938c8a329fed, source 8118a226cff6f5af, candidate 9fa85f88b968d5f1, verified 35, attested 34, units 69 }`
→ `node tools/examples/spec-validate.cjs --strict` ⇒ `56 examples: 56 frozen / 0 draft / 0 blocked`
→ `node tools/examples/spec-compliance-audit.cjs` ⇒ `56 examples: 0 fail / 1 warn`（warn 仍是 draco BLOCKED）
→ `test/smoke/smoke-29-examples-spec.test.ts` 的 `EXAMPLE_COUNT 55 → 56` ⇒ jest smoke-29 **5/5 PASS**
→ `npm run typecheck` 退出 0。

全量三引擎矩阵（11 示例 × 3 = 33 记录）的权威捕获见第 13 节；冻结后再改源码的复发链见第 14 节。

## 13. 全量三引擎矩阵权威捕获（r39，本组收口）

契约行追加完成后，`tools/verify/browser-matrix.cjs` 必须**不带 `--ids`** 重跑一次，因为
`test/smoke/smoke-30-v12-regression.test.ts` 同时校验 ① 证据 `contractFingerprint` 与磁盘契约文件的
sha16 相等、② 每条记录的 `pngSha256` 与 `docs/evidence/browser-matrix/<id>/matrix-<engine>.png` 当前字节相等、
③ 契约声明的 `示例×引擎` 全集都有记录（缺一条即红）。单例 `--ids` 覆盖写死的 PNG 会立刻让 ② 失效。

```
NODE_PATH=E:/AIProMax/Y2026M08/AIShaderBenchmark/node_modules node tools/verify/browser-matrix.cjs
→ docs\evidence\browser-matrix\browser-matrix.json  33/33 PASS across 3 engines, completed=true, subset=false
   contractFingerprint 1b545ae5a7bef3f3（== 磁盘 `tools/verify/browser-matrix-contract.json` 的 sha16）
   bundle build/cocosair.module.js 6,081,668 B sha16 35496aebda066ab5
   measuredAt 2026-09-22T15:44:47.861Z
```

与上一轮权威捕获（`snapshot-r38b-before-physics/`，42 文件 + `sha256.txt`）逐字节对照
（`summarize-r39.cjs`）：`records 33 | png drift vs r38b: 20 | new-in-r39: 0`。20 条 PNG 变化的归属：
全部是**其它** 10 个示例，且变化源自其自身动画/时序（本次未触碰它们的源码与契约行）；
`physics-3d-basic` 三张 `same`，即本组示例的出图对契约的 304 条断言是稳定复现的，不依赖轮次运气。

本组三张截图（覆盖前已快照在 `snapshot-official-physics3d-r39/`）：

| 引擎 | 字节 | sha256（前 16） |
| --- | --- | --- |
| chromium | 11,402 | `d1aaeb5bc0e179ce` |
| firefox | 13,690 | `3107a3292153d018` |
| webkit | 12,828 | `f30950970319ae68` |

## 14. 冻结后改源码的复发链（本轮踩过，必须记全）

冻结之后我又对 `main.js` 做了两处**纯注释**修正（删掉第 3 节里被自己实测证伪的「起点在形状内部不命中」结论、
补第 15 条 `getBoundingSphere` 空实现证据）。注释不进探针，但**会移动行号**，于是：

1. 单例矩阵复跑（r8）3/3 PASS，且三张 PNG 的 sha256 与 r39 权威记录**逐字节相同**
   ⇒ `smoke-30` 的字节货币断言不受影响，无需再全量重捕。
2. `spec-evidence.cjs` 报 `1174 evidence entries updated: 69 drifted` —— 69 正是本示例全部 claim，
   因为头部注释把下方代码整体推下 6/9 行。`api.evidence` 是机器派生，重跑即自愈。
3. **陷阱**：`validationExpectations.*.provenance[].line` 同样是行号，但它由
   `tools/examples/spec-expectations.cjs apply` 派生并写死在 `example.json` 里。我这次漏跑了这一步，
   于是 `example-spec-browser.cjs` 依然 **PASS + promoted**（它不看这些行），而
   `spec-validate --strict` **EXIT=1**：`[physics-3d-basic] 出处指向注释行：main.js:L282`
   —— 插入的注释正好落在 Trimesh 的原出处行上。校验器实现在
   `tools/verify/expectation-checks.cjs:232-252`（`出处无法定位 / 出处行不存在 / 出处指向注释行 / 出处行号与引文不符`）。
   ⇒ **结论：任何让行号漂移的 `main.js` 编辑（哪怕只改注释），复发链必须是
   `spec-evidence → generate-manifest → spec-expectations apply --ids → v11-examples-verify → spec-validate --strict → spec-compliance-audit`，
   不能因为「verify 绿了」就收口。**
4. 复核脚本 `E:/AIProMax/cocosair-scratch/v12-diag/audit-provenance.cjs <id>` 会把 9 条 `text-mismatch`
   一起报出来，这是**脚本过报**：本示例 provenance 的 `text` 是中文描述（如
   `makeNode(Crate) → position [-2.2,0.75,0]（工厂形参见 L199）`）而非源码原文，校验器只在「引文能在文件里
   找到且实际行号 ≠ 声明行号」时才判不符（`expectation-checks.cjs:244-251`），找不到引文就放过。
   真正要盯的是 `comment-line` / `empty-line` / `missing-file` 三类。
5. `apply` 重跑后行号自愈（Main Camera L214→L223、Trimesh L282→L291、PhysicsHost L690→L699，
   工厂引用 L190→L199），最终全绿：

```
spec-expectations apply --ids=physics-3d-basic  EXIT=0  graph=9 corroborated=8 gaps=1 unresolved=11 executed=35
v11-examples-verify --ids=physics-3d-basic      EXIT=0  PASS, 1 promoted / 0 demoted
spec-validate --strict                          EXIT=0  56 examples: 56 frozen / 0 draft / 0 blocked
spec-compliance-audit                           EXIT=0  56 examples: 0 fail / 1 warn（warn 仍是 draco）
jest smoke-29 + smoke-30                        EXIT=0  Test Suites 2 passed, Tests 39 passed
```

最终 `promotion = { spec 885b85eafe40, source d2497f8e98052058, candidate 9fa85f88b968d5f1,
verified 35, attested 34, units 69 }`（`status: stable`、`specStatus: frozen`）。
`verified 35 / units 69` 的上界由第 10 节的三段式 API（`physics.Collider.getGroup` 这类）
结构性不可 instrument 决定，不是本示例待办。

## 15. 变体后端 cannon：构建可复现 + 「不模拟」四条证据全部反转

口径先说死：本节是**诊断级**证据，不是计划书 §12 的验收证据。两条硬约束决定了它只能到诊断级：

1. `tools/verify/browser-matrix.cjs:181` 把产物路径写死为 `build/cocosair.module.js`（`:204` 记录其指纹），
   没有任何环境变量出口 ⇒ 换 bundle 就换门禁口径，`smoke-30` 的字节货币断言会立刻失配。
2. 本组 304 条 `probeEquals` 契约与 **builtin 后端绑定**：示例探针直接读
   `collider.shape.worldObb / worldSphere / worldCapsule` 与 `sharedBody.shapes`，这些 getter
   只定义在 `src/cocos/physics/cocos/**`（`grep worldObb src/cocos/physics` 命中面即全部 builtin 文件），
   cannon 侧对应物是 `wrappedShapes` ⇒ 换后端整条 `window.__probe()` 抛错（实测三引擎都抛，见下表最后一行）。

### 15.1 变体构建（命令与产物指纹，已复跑验证逐字节可复现）

把 `tools/build/build.cjs:22-39` 默认 feature 集里的 `physics-builtin` 换成 `physics-cannon`，
产物出仓库（`AIR_OUT_DIR` ⇒ `VARIANT=true`，不共享增量缓存、不写 `build/` 附属产物）：

```
AIR_FEATURES="air,base,gfx-webgl,gfx-webgl2,gfx-empty,3d,animation,skeletal-animation,primitive,tween,\
custom-pipeline,legacy-pipeline,profiler,video,webview,2d,physics-2d-framework,particle-2d,tiled-map,ui,\
spine-3.8,spine-4.2,dragon-bones,physics-2d-box2d,physics-cannon,custom-pipeline-post-process" \
AIR_OUT_DIR=E:/AIProMax/cocosair-scratch/cannon-variant node tools/build/build.cjs        # EXIT=0
```

产物 6,599,009 B / sha256₁₆ `9ef1f01b24da043a`（默认 bundle 6,081,668 B / `35496aebda066ab5`）；
`CannonWorld` 在变体里出现 5 次、在默认 bundle 里 0 次。第二次以同一条命令构建到
`cannon-variant-verify/` 做复现核对：`identical=true`（`build-cannon-verify.log`）。

### 15.2 行为反转探针（18 条断言 × 3 引擎，只用后端无关的公开 API）

跑法（仓库外，两条命令；第二条例程是对照组）：

```
VARIANT_BUNDLE=E:/AIProMax/cocosair-scratch/cannon-variant/cocosair.module.js \
  OUT=E:/AIProMax/cocosair-scratch/v12-diag/cannon-behavior-cannon-r4.json ENGINES=chromium,firefox,webkit \
  node E:/AIProMax/cocosair-scratch/v12-diag/cannon-behavior-probe.cjs
VARIANT_BUNDLE=E:/AIProMax/github/cocosair.js/build/cocosair.module.js \
  OUT=E:/AIProMax/cocosair-scratch/v12-diag/cannon-behavior-builtin-control-r4.json ENGINES=... node 同上
```

runner 在 HTTP 层把任意 `*cocosair.module.js` 请求重定向到变体产物，页面与 `main.js` 一字不改；
结果落 `cannon-behavior-<engine>.png`。两个产物的 `completed=true`，18 条断言 0 抛错。
**三引擎读数逐字相同**（手工 `step()` 驱动，不吃帧率）：

| 断言（同一节点/同一次 60 步） | builtin `35496aebda066ab5` | cannon `9ef1f01b24da043a` |
| --- | --- | --- |
| `worldCtor` / `PhysicsSystem.PHYSICS_BUILTIN` | `BuiltInWorld` / `true` | `CannonWorld` / `false` |
| `freeFall60Steps`（60×1/60 s 自由落体） | `dy=0`，`y1=6` 原地不动 | `dy=-4.9123`，`y1=1.0877` 落地 |
| `velocityWriteBack`（`setLinearVelocity(3,0,0)` 后读回） | `[0,0,0]` | `[3,0,0]` |
| `boundingSphereReal`（半径 0.4 的球） | `r=1 / cy=0`（`geometry.Sphere` 默认值，= F-109） | `r=0.4 / cy=1.088`（跟随节点真实位置） |
| `raycastClosest` 的池对象读回（自上而下射线） | `distance=1.6`、`hitPoint y=6.4`（打在默认半径 1 的虚构球面上） | `distance=6.5123`、`hitPoint y=1.488`（打在实际球顶 1.0877+0.4） |
| `worldBodyNames` | `Ball,Capsule,Crate,Ground,ProbeBall,Sensor`（**Trimesh 不在世界里** = 第 6 节事实 11） | 同上 **+ `Trimesh`** ⇒ MeshCollider 在 cannon 下真的进世界 |
| `raycast` 结果集（`queryTrigger=false`） | `Ball,Ground,ProbeBall`（3） | `Ball,Ground,Ground,ProbeBall`（4，`Ground` 计两次） |
| 示例自带 `window.__probe()` | 不抛（`null`） | **抛**，三引擎各自的消息：`reading 'center'` / `can't access property "center"` / `evaluating 'crateCollider.shape.worldObb.center'` |

⇒ 第 1 节那套「builtin 不模拟」的独立证据（位移 0、速度不回写、包围球是默认值、
MeshCollider 不进世界、查询几何失真）在 cannon 下**逐条反转**，因此它们是**后端事实**，
不是 `PhysicsSystem` 框架层事实。这是把 LV12-15 的结论限定在 `physics-builtin` 口径下的直接依据。

### 15.3 cannon 侧新暴露的两条引擎事实

1. **`CannonShape.setMaterial` 在 Code First 配置下必抛**（`cannon-shape.ts:62-66`）：
   `mat == null` 时退到 `PhysicsSystem.instance.defaultMaterial`，而 `initDefaultMaterial()`
   （`physics-system.ts:223-230`）在 `builtinResMgr.get('default-physics-material')` 取不到内置资源时
   只 `errorID(9642)` 就 return ⇒ `defaultMaterial` 恒 `undefined` ⇒ 读 `.id` 抛 `TypeError`。
   实测：cannon 加载示例页 3 引擎各有 5 条 `... reading 'id'` 崩溃（BoxShape×3、SphereShape×1、TrimeshShape×1）
   + 197~211 条 `reading 'center'`（`proveNoSimulation ← readback`，条数随帧数变化）；
   builtin 侧同样条件下控制台只有 1 条良性 `initDefaultMaterial` 错误。builtin 因为 `BuiltinShape.setMaterial (v) {}` 是空实现而**免疫**
   （同一个缺口，一侧崩一侧静默 —— 与 F-109 同族）。**变体后端在 AIR Code First 下不可用，属资产缺口家族**
   （与 `box2d-wasm` 缺 `.wasm`、bullet/physx 不随快照分发同类），不是代码回归缺陷。
   绕过方式（本探针采用，属公开 API）：`PhysicsSystem.instance.setDefaultPhysicsMaterial(new PhysicsMaterial('ProbeDefault'))`。
2. **`Collider.material` 无读回口**：两后端 `col.shape.material` 都 `=== undefined`（cannon 的 `CannonShape`
   只有私有 `_material`），所以「材质有没有真的落到形状上」只能从行为侧（摩擦/恢复系数引起的滑动与反弹）取证，
   不能从属性读回取证。本组未做该行为取证 ⇒ **待核**。

### 15.4 未证 / 不 claim

- **接触事件派发**：新加的两个球（`ProbeBall` 与带 `CollisionRecorder` 的 `ProbeDrop`）在 cannon 下
  确实被几何求解拦住（`dropY 5 → 0.2985`）但 `onCollisionEnter/onTriggerEnter` 计数 **两后端都是 0**。
  混淆因子有两个：运行时以 `class ... extends Component` 形式定义、未经 `@ccclass` 注册的类能否被派发到；
  以及 cannon 侧示例自带碰撞体在 `onLoad` 就因 15.3 崩溃、状态不完整。⇒ 只登记现象，不据此下结论。
- `Ground` 在 cannon `raycast` 结果里出现两次：未判定是「一个节点两个 Collider」还是「shape 粒度重复」⇒ **待核**。
- 变体证据不进官方链（15 开头两条约束）。要让非默认后端进官方证据，需要门禁侧改动
  （给 `browser-matrix.cjs` 加产物环境变量出口 + 契约行按 bundle 指纹分列），属 owner 决策项，见 F-113。

