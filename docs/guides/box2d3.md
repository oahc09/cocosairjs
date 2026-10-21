# Box2D 3.2 WASM 后端

默认 2D 后端仍为纯 JavaScript Box2D。需要新版物理模拟时，在首次启动前显式选择：

```ts
import { createAirApp, RigidBody2D, BoxCollider2D } from 'cocosair';

const app = await createAirApp({
    canvas: '#GameCanvas',
    physics2D: 'box2d-v3-wasm',
    box2d3: { assetBaseUrl: '/physics/box2d3/', subStepCount: 4 },
});
```

继续使用原生 `Scene`、`Node`、`RigidBody2D`、`Collider2D` 和关节组件。后端只能在首次初始化时选择，
不支持运行中迁移物理世界。`physics` 仍是独立的 3D 后端选项。

## 部署与构建

把 `build/box2d3/` 的 `air-box2d.mjs`、`air-box2d.wasm`、许可和 receipt 一起复制到部署目录。
使用 npm tarball 时，文件位于 `build/npm/box2d3/`。浏览器需要能加载 ESM 与 WASM；服务器应为 WASM
提供 `application/wasm`。单线程版本不要求 `SharedArrayBuffer` 或 COOP/COEP。

省略 `assetBaseUrl` 时从主运行时旁的 `box2d3/` 加载。打包器重新定位主 JS 时建议显式配置部署目录。
默认 JS 后端不请求这些资产。加载失败会拒绝 `createAirApp()`，不会静默改用另一后端。

源码和资产来源见 [vendor 说明](../../vendor/box2d/README.md)。编译需要 Emscripten 4.0.21、CMake 和 Ninja：

```powershell
$env:BOX2D_EMSDK = '<emsdk-directory>'
$env:NINJA = '<ninja-executable>'
node tools/build/box2d3.cjs --check
node tools/build/box2d3.cjs --build
$env:NODE_OPTIONS = '--max-old-space-size=6144'
npm run build
npm run build:dts
```

`--check` 只读核验冻结源码哈希；`--build` 写构建目录、vendor 运行时资产及 receipt、
`build/box2d3/` 和仅供开发的 `build/box2d3-samples/`。普通主引擎构建只复制已生成资产。

## 兼容约定

- 物理比例沿用 `PHYSICS_2D_PTM_RATIO = 32`。位置、碰撞体和关节锚点使用引擎单位；刚体线速度与力等沿用原接口。
- `subStepCount` 是新版求解器每个固定步的细分数，默认 4，范围 1–64。它独立于 `PhysicsSystem2D.maxSubSteps`；
  原来的 `velocityIterations`、`positionIterations` 不转换为新版迭代次数。
- 支持 Box、Circle、Polygon 碰撞体；凹多边形沿用引擎凸分解，超过八顶点的凸片再拆分。
- 动态刚体需要正质量的碰撞形状。官方 `Bodies / Bad` 案例将零质量动态刚体视为无效配置，其表现接近运动学刚体；不要依赖旧 JS 后端的质量兜底行为。
- Distance 映射为仅限制最大距离的 Distance joint；Spring、Fixed、Relative、Slider、Wheel、Hinge 对应新版约束。Spring 的频率为 0 时保持刚性距离约束，距离按上游稳定下限处理。
  Mouse 使用官方 3.2 的 Motor joint 拖拽方式。Relative 的 correction factor 转为频率控制，不能保证与旧求解器逐帧数值相同。
- BEGIN 在首次 pre-solve 观察时派发，PRE 在求解器回调内派发，POST 使用求解后的实际接触冲量；Sensor 使用原始传感器事件。
  接触事件中的组件销毁、启停与形状重建延后到安全步进边界。休眠接触保留至真正分离，但不会重复派发旧冲量的 POST；入睡前最后一个求解步仍派发。
- BEGIN/PRE 回调内可同步调用点查询、AABB 查询和射线查询。点/AABB 不受碰撞矩阵限制；射线只按调用者 mask 与碰撞体 group 筛选，
  不受目标碰撞体自身 mask 限制，包括 mask 为 0 的形状。传感器参与查询，禁用刚体不参与。
  为兼容锁定回调及上述筛选语义，查询遍历桥接层形状而不调用锁定期间禁止的 world broadphase 查询；单次查询成本为 O(已注册形状总数)，请避免在大型世界中高频全量查询。
- `disabled`、`disabledOnce` 和逐接触材质由适配层保存；固定版本的小型原生桥写入当前 ContactSim，
  不改变其他接触或 shape 材质。升级上游时必须重新检查结构与物理效果。
- 局部 manifold 由新版世界流形重建；它不是旧 Box2D 的内部布局。跨后端比较应使用世界接触点、法线与分离距离。
- `impl` 是本后端的句柄，不能调用旧 JS Box2D 对象方法。业务代码应使用 Cocos 组件接口。
- `app.releaseScene()` 释放场景组件，`app.close()` 进一步销毁 WASM world。`getBox2D3Stats()` 用于检查资源数量。
- Shape、Joint、Aabb、Pair 和 CenterOfMass 调试标记绘制在原生 Cocos Graphics 上；设置为 None 会清空并隐藏覆盖层。新版没有粒子或 controller 模拟。
- 原生 world 的分配可释放；WebAssembly 线性内存容量不会随释放而缩小，模块随页面结束回收。

## 示例与验收

构建后启动 `npm run dev`，访问 `/box2d3-lab/index.html`，进入 AIR 交互场景及官方案例查看器。
这是独立集成实验入口，未加入既有 Gallery manifest 或修改冻结的完整案例 campaign。
官方清单固定为 147 个注册案例，包含 Replay Viewer；原始案例与模拟逻辑直接编译，桌面宿主由浏览器替代。

```powershell
node tools/verify/box2d3-native.mjs
# 使用配置好的 Playwright 依赖与浏览器；按需设置 NODE_PATH 和 PLAYWRIGHT_BROWSERS_PATH
node tools/verify/box2d3.cjs --engine=chromium --scope=all
node tools/verify/box2d3.cjs --engine=firefox --scope=all
node tools/verify/box2d3.cjs --engine=webkit --scope=all
```

专项工具只写 `output/box2d/acceptance/` 的新目录，保存每个官方案例的原始观察、截图、结果和原生资源释放值，
以及 AIR 实际组件断言、加载错误、鼠标拖拽和物理浏览器退出记录。不刷新 canonical example campaign。
`--limit=N` 仅供诊断，结果始终为 subset，不能标记完整验收。

验收状态与未决项见 [实施台账](../../ai/ledgers/box2d-3.2-integration.md)。
