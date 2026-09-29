# 脚本组件开发流程（Code First）

> 状态：**FULL（2026-09-26 修复轮）**。配套示例位于 Gallery 的 `examples/`。
> 独立组件样板：`hello-cube/src/components/Rotator.ts` 与 `scene-switch-reentry/src/components/Ticker.ts`；
> 生命周期、事件退订和复入由场景探针验证。

## 1. 启动顺序（时机纪律）

```ts
import { createAirApp, Scene, Material, EffectAsset } from "cocosair";

const app = await createAirApp({ canvas: "#GameCanvas" }); // ① 引擎引导（device/programLib 就绪）
const mat = new Material(); // ② 引导之后才能构造材质/注册 effect
mat.initialize({ effectName: "builtin-standard" });
```

- **`Material.initialize` / `EffectAsset.onLoaded` 必须在 `createAirApp` 之后**。引导前调用会抛
  `TypeError: Cannot read properties of undefined (reading 'capabilities')`（WebProgramLibrary 空 device）。
  实证：`docs/evidence/g4-shader-probe.json` 的 `registerBeforeBoot` 相位（双后端复现）。
- 默认模板的 `#GameCanvas` 必须在引擎模块 import 前存在于 DOM。使用自定义 id 时，
  在动态 import 前执行 `globalThis.__CC_CANVAS__ = canvas`；`createAirApp` 不改写该 id，
  缺少预绑定会明确报错。键盘事件要求 canvas 聚焦。
- 物理后端等启动配置在 `createAirApp({ physics: 'cannon' })` 一次性给定（`physics-interaction` 实证；
  r46 owner 批复 #8(a) 的交付期后端切换）。

## 2. Component 类：字段、依赖与生命周期职责

贯穿示例 `scene-switch-reentry` 的 `Ticker` 组件（源码节选语义，完整见 `examples/scene-switch-reentry/src/main.ts`）：

```ts
class Ticker extends Component {
  rec!: TickerRec; // 依赖字段：addComponent 之后、场景激活之前赋值
  gen = 0;

  onLoad(): void {
    /* 一次性初始化：建记录、缓存组件引用（getComponent） */
  }
  onEnable(): void {
    /* 订阅：input.on(TOUCH_START, this.onClick, this) */
  }
  start(): void {
    /* 首帧前的一次性业务启动 */
  }
  update(): void {
    /* 每帧逻辑：计数/推进状态机 */
  }
  onDisable(): void {
    /* 退订：input.off(TOUCH_START, this.onClick, this)——与 onEnable 严格对称 */
  }
  onDestroy(): void {
    /* 释放记录；不再触碰节点 */
  }
}

const comp = node.addComponent(Ticker);
comp.gen = ++generation; // 字段注入必须发生在激活（app.run / addChild 到已激活树）之前
```

生命周期语义（实证：手册 `manual-component-lifecycle` 14 断言 + `scene-switch-reentry` 19 项探针断言）：

| 事实                                                                                                         | 出处                                                                                               |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 先构造后激活：`addComponent` 到未激活场景不触发 `onLoad`；`app.run(scene)` / 加入已激活树时才激活            | scene-switch-reentry（字段注入先于 onLoad 生效）                                                   |
| 激活序：`onLoad → onEnable → start →（首帧起）update`                                                        | manual-component-lifecycle                                                                         |
| 停用冻结：`node.active=false` → `onDisable`，`update` 停止；复活不重放 `onLoad/start`（`onEnable` 再次触发） | manual-component-lifecycle / node-active                                                           |
| 销毁隐含 `onDisable`：`destroy()` 时 `onDisable` 与 `onDestroy` 各恰一次                                     | scene-switch-reentry `gen1-lifecycle-closure`                                                      |
| `destroy()` 帧末落地：调用后到 `_deferredDestroy` 执行前，**`isValid` 仍可能为 true**                        | scene-switch-reentry `scene-destroy-invalidates`（引导前销毁不落地）；ui-asset-loading P6 竞态实测 |
| 复入全新：场景复入后同型组件 `onLoad=1、start=1、clicks=0`（无状态残留）                                     | scene-switch-reentry `reentry-fresh-state`                                                         |

## 3. 输入事件：订阅/退订对称纪律

`input` 是**全局单例**，跨场景存活。组件销毁不退订 = 监听器泄漏（旧世代回调继续计数）。

```ts
onEnable (): void { input.on(Input.EventType.TOUCH_START, this.onClick, this); }
onDisable (): void { input.off(Input.EventType.TOUCH_START, this.onClick, this); }
```

- 实证：`scene-switch-reentry` 两次场景切换后真实点击只计入当代组件，历史世代 `clicks` 恒 0
  （残留即页内 `throw` → `no-runtime-error` 红）。
- UI 命中会吞掉全局事件（`manual-input-events` 11 断言）：Button 覆盖处 `input.on` 不触发，
  交互驱动要么用节点级 `node.on('click')`（Button），要么避开 UI 热区。
- 事件坐标：`event.getLocation()` 为游戏画布坐标（左下原点），可直接喂
  `camera.screenPointToRay(x, y, out?)`（`model-character-interaction` / `physics-interaction` 实证）。

## 4. 异步任务：取消 token + isValid 双守卫

**只靠 `isValid` 有竞态**（帧末落地语义，§2）：加载拒绝可能在 destroy 落地前到达。正确范式：

```ts
class GuardedLoader extends Component {
  cancelled = false;
  async loadMissing(): Promise<void> {
    try {
      const result = await loadAssetAsync(url);
      if (this.cancelled || !isValid(this.node)) return;
      this.applyResult(result);
    } catch (e) {
      if (this.cancelled || !isValid(this.node)) {
        return;
      } // 双守卫：不落任何效果
      this.showError(e);
    }
  }
}
// 销毁发起方：
guard.cancelled = true; // ① 显式取消（确定性）
node.destroy(); // ② isValid 兜底（帧末落地）
```

- 实证：`ui-asset-loading` P6——仅 isValid 守卫时实测出现 `dangling=1`（拒绝先于帧末销毁落地）；
  加取消 token 后 `dangling=0, guarded=1` 稳定复现。
- `loadAssetAsync` 的 404/未命中是**可 catch 的 Promise 拒绝**（消息含状态码），不产生 window
  error / unhandledrejection；浏览器 console 的网络日志不在 `no-runtime-error` 计数通道
  （agent-session 只收 window error + unhandledrejection）。故意失败路径示例仍需按
  `manual-examples-verify.cjs` 的 CONSOLE_ALLOWLIST 机制登记（手册树）。
- `assetManager.loadRemote` 是**回调式** API（`loadRemote(url, (err, asset) => …)`）；
  直接 `await assetManager.loadRemote(url)` 返回 undefined 且**不报错**——必须 Promise 包装
  （audio-basic / tank-battle / product-viewer 同款口径）。
- `GLTFInstance.dispose()` 会**连带销毁无其它引用的 GLTFAsset**；销毁后访问 `asset.meshes` 等
  getter 抛 null 异常（无防御）——访问前必须 `isValid(asset)` 守卫（product-viewer 实测）。
- 加载状态锁：`loading` 期间拒绝重入（防快速重复点击）——`ui-asset-loading` P5：3 个并发
  `requestLoad` 恰 1 个启动、2 个被锁拒绝。

## 5. 材质实例与资产所有权

- **两种持有方式**：`renderer.setSharedMaterial(mat, 0)` 直接引用材质资产（改 `mat` 影响所有引用者）；
  `renderer.material` getter 创建 MaterialInstance 副本（改副本不影响资产）。示例断言优先用
  setSharedMaterial（状态可预测）。`sharedMaterial` 在本快照**只有 getter**——赋值走
  `setSharedMaterial`（misc/renderer.ts 实证）。
- **实例化陷阱（GAP-I1，正典批次实测）**：任何代码（含验证器 readback）访问 `renderer.material`
  都会创建实例并把渲染切到实例上——此后对**共享材质**的 `setProperty` 与画面脱钩。持续更新
  uniform 的示例必须 `liveMat = renderer.material as Material` 驱动实例，或整体走 `setSharedMaterial`
  切换（会销毁旧实例）；lifecycle reacquire 后需重新取实例。
- **释放链**（所有权谁使用谁登记）：`assetManager.assets.remove(key)` → `assetManager.releaseAsset(tex)`
  → `tex.destroy()`；SpriteFrame 先 `sprite.spriteFrame = null` 摘引用再 destroy。实证：
  `ui-asset-loading` `__lifecycle`（held→released→reloaded 全链 + 画面复原）。
- **GLTFAsset 所有权**：`instance.dispose()` + `asset.destroy()`；`isValid(instance.root)` 帧末后为
  false（`runtime-asset-release` / `model-character-interaction` 实证）。
- **§25 Lifecycle 合同**：资源型示例挂 `installAssetLifecycle({label, hold, release, reacquire})`
  （`examples/shared/asset-lifecycle.js`）——release 与 reacquire 必须走**同一条实现路径**
  （"拆得掉"与"建得回"由同一份代码承担），验证器一次调用完成 释放→泄漏核对→重建→画面非空。
- 用户自定义 Shader 的资产面：`EffectAsset.remove(effect)` + `effect.destroy()` 后 `EffectAsset.get`
  → null；材质 destroy 与 effect destroy 互不崩溃（`docs/evidence/g4-shader-probe.json` H 相位）。

## 6. 场景切换与复入

```ts
app.run(sceneB); // = director.runSceneImmediate(sceneB)
```

`runSceneImmediate` 的完整语义（director.ts 源码 + scene-switch-reentry 断言）：

1. `scene._load()` → persist 节点重挂 → **旧场景 `destroy()`** → `releaseManager._autoRelease`
   （按旧场景 `autoReleaseAssets`）→ `CCObject._deferredDestroy()`（旧树帧末前即失效，
   `isValid(旧场景)` 立刻为 false——切换路径与手动 destroy 的落地时机不同，后者等帧末）；
2. 新场景 `scene._activate()`（组件 onLoad/onEnable/start 全新计数）。

纪律：

- 旧场景组件的 `update` 冻结、`onDisable/onDestroy` 恰好落地、全局输入监听随退订清空（§3）；
- 复入 = 重新 build + run，**不要缓存旧场景对象**（销毁后不可复用）；
- `Scene.autoReleaseAssets = true` 让切换自动释放场景依赖（数据属性，运行期可写；
  scene-switch-reentry 探针记录真实值）。

## 7. 调试与状态探针

- `window.__airApp = app`：bench/验证器的显式绑定合同（所有 Gallery 示例）。
- **状态探针**：页内暴露纯读函数（如 `__clickState()` / `__trialProbe` / `__lifecycleHold()`），
  验证器与 agent 会话读回断言；行为断言失败必须 `throw`（走 pageerror → `no-runtime-error` 红），
  不得静默——"证据不得静默"是本仓验证纪律。
- **像素读回**：引擎以 `preserveDrawingBuffer: true` 创建上下文（webgl-swapchain.ts AIR 注记）；
  采样统一走 `EVENT_AFTER_DRAW` 内 `drawImage → 2D canvas → getImageData`
  （`manual-examples-verify` 同口径；直接 `gl.readPixels` 在连跑批次里与合成结果有实测偏差）。
- **确定性**：物理示例冻结帧驱动手动步进（`physics.enable=false` +
  `syncSceneToPhysics → step → emitEvents → syncAfterEvents`，官方 postUpdate 同序）→ 跨引擎逐位同解
  （`physics-interaction` 重置后高度逐位一致 [0.5,1.5,2.5]）。
- **灯光单位纪律（r53 起）**：`pipelineSceneData.isHDR` 默认 **true**（exposure=1/38400）——
  `illuminance`/`luminance` 必须用 HDR 量级（主光 ~30000–65000 lux、点光 ~千级以上）；
  LDR 量级（2/40/120）× exposure ≈ 0 = 视觉不可见。GAP-L1（点/球光 att≡0）已修复
  （fixture 对齐上游 4.0 判别语义），四型光源均有真实可视贡献。
- 已知缺口对照表见 `docs/reference/api-scenario-gap-matrix.md` §7（worldToScreen 的参数顺序与深度口径、
  Camera 组件与渲染相机的接口区别、USE_TEXTURE 宏名等）——写断言前先查表，别把缺口当自己的 bug 调。

## 8. 项目结构与发布

推荐布局（Gallery 示例与用户工程同构）：

```
my-app/
├── index.html          # 官方模板：GameDiv/Cocos3dGameContainer/GameCanvas + importmap
├── src/
│   ├── main.ts         # 只负责启动与组装：createAirApp → build scene → app.run
│   └── components/     # 交互与业务组件（hello-cube / scene-switch-reentry 已采用）
├── assets/             # glb/png/json 等，许可随附（*.LICENSE.md）
└── example.json        # Gallery 示例规格（效果契约 + claims/evidence + validators）
```

硬性合同（验证器强制）：

- `index.html` 的 importmap 必须**逐字**含 `"/build/cocosair.module.js"`——api-trace 插桩靠
  字符串替换生效；源码直连 bundle 路径 = `trace-bypass` 直接 FAIL（逐 API 证据不可信）。
- 入口文件 src/main.ts（或 main.ts / main.js）；`.ts` 由 esbuild transform 即时编译，
  类型合同 = 对 `build/cocosair.module.d.ts` 的 tsc 检查（strict:false；`window.__xxx` 需
  `(window as any)`）。**公开 d.ts 面之外的内部 API 会在此层被拦下**（如框架 Camera 无
  resize/width/height——GAP-C2）。
- 共享代码放 `examples/shared/`，示例内以 `../../shared/xxx.js` 引用（暂存工作区展平时由
  验证器重写层级，源码保持真实布局写法）。
- 新代码风格（G3 格式化基线）：4 空格、单语句单行、`let/const` 优先、import 顺序
  `cocosair` → `shared` → 相对模块；存量冻结示例不做全仓格式化（触达时迁移）。

## 9. 快速核对清单（新组件上线前）

- [ ] `Material/EffectAsset` 构造在 `createAirApp` 之后？
- [ ] `onEnable` 的每个订阅在 `onDisable` 有对称退订（含 `node.on('click')`）？
- [ ] 异步回调有取消 token + `isValid` 双守卫？拒绝路径全部 catch？
- [ ] 持有的资产都进了 `installAssetLifecycle` 的 hold/release/reacquire（同一路径）？
- [ ] 行为断言失败会 `throw`（而不是 console.log）？
- [ ] 状态探针（`__trialProbe`/`__lifecycle` 等）就位且纯读不副作用？
- [ ] `example.json` 的 evidence 行号与最终源码一致（`node tools/examples/spec-evidence.cjs --check`）？

## 9. 从样板到组件的开发循环

1. 以 `examples/starter/index.html` 与 `examples/starter/src/main.ts` 建立启动入口，确认画布先于引擎导入。
2. 在 `src/components/` 创建原生 `Component` 子类；使用 `hello-cube` 的 `Rotator` 作为最小模板。
3. TypeScript 源码的相对导入写 `.js` 后缀，例如 `./components/Rotator.js`。TypeScript/esbuild 解析对应 `.ts`；开发服务器按同一规则提供模块。
4. 在未激活节点上添加组件并注入依赖，随后挂入场景；`Ticker` 展示记录集合和点击回调注入。
5. `npm run dev -- --example hello-cube` 启动；运行 `npm run format:check`、`npm run verify:g3-tooling` 和该例浏览器验证。
6. 发布用户应用前由 bundler 打包 TypeScript，运行期依赖 `cocosair`；开发服务器的 `.js` 到 `.ts` 映射不是生产服务器要求。

新组件的 `src/**` 内容全部进入源码指纹。移动组件或修改行为后，应更新规格证据行号并重采对应浏览器证据；不可复用旧指纹。格式化仅覆盖项目自有示例与指定工具，第三方资产与根目录 `src/` 保持原字节。
