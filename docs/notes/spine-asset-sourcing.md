# Spine 运行资产来源

> 本文保留原调查日期、命令和观察结果，属于专题调查记录。阶段编号与旧测量值不表示当前发行状态；现行范围见 [功能范围](../reference/web-features.md)，验收状态见 [发布复核](../reference/release-review.md)。

> 调查日期：2026-09-21。上游基线：`cocos4 @ 4.0.0-alpha.34`（commit `557b06f7e6`，冻结点 `fffd9a514a`）。
> 结论：spine 与批次 G-3（bullet/physx）、批次 D-3（box2d wasm）同属 **R8 外部二进制缺失** 类，LV12-10 运行时验收 BLOCKED；代码回归侧已完成。

## 1. 计划书 C1 的事实错误

计划书 §6 C1 写「`cocos/spine`（24 文件，含 `lib/` 内置 spine-core.js 3.8/4.2 双版本运行时与 LICENSE）」「wasm 变体资产另部署（决策点 D2）」，隐含假设：`lib/spine-core.js` 是可独立运行的 JS 运行时，wasm 只是可选增强。

实测（alpha.34）：

| 证据 | 实测值 |
|---|---|
| `cocos/spine/lib/spine-core.js` 体积 | 3,747 字节 / 177 行 |
| 其内容 | 只有 `spine.MixBlend`…`spine.MathUtils` 等枚举与桩；`export default spine` |
| `grep -c SpineWasmUtil spine-core.js` | 0 |
| `grep -c wasmUtil spine-core.js` | 0 |
| `cocos/spine/lib/spine-core.d.ts` | 1,500+ 行完整类型面（含 `class wasmUtil`） |
| 上游 web 路径 `spine/skeleton-data.ts:212/223/228/231/299`、`skeleton-cache.ts:173/383/473`、`assembler/simple.ts:180` | **无 null 守卫**地直接调用 `spine.wasmUtil.*` |

即：alpha.34 的 spine 模块在 Web 侧 **只有 wasm/asm 后端**，`spine.wasmUtil` 由 `spine-define.ts:92 overrideClass(wasm)` 在 emscripten 实例化成功后注入。所谓「3.8/4.2 双版本 JS 运行时」在本基线已不存在，`spine-core.js` 只是枚举/类型桩。

## 2. 资产来源核查（四处，全部落空）

| 候选来源 | 实测 |
|---|---|
| `cocos4/cocos/spine/lib/` | 仅 15 个 ts/js/d.ts + LICENSE，无 `.wasm/.asm.js/.js.mem` |
| `cocos4/external/`（仓库根） | 仅 `compression/`、`deserialize/`，无 `emscripten/` |
| `cocos4/native/external/emscripten/` | 目录不存在（`external:emscripten/*` 虚拟模块在 Air 侧解析到 `<engine>/native/external/emscripten/*`） |
| `node_modules/@cocos/*`（Air 已装 box2d/cannon/dragonbones-js） | 无 spine 包；`find node_modules -iname '*spine*.wasm*'` = 0 命中 |

全仓 `find -iname "*spine*" -size +100k` = 0 命中。官方这些产物由 `cocos-engine-native`（emscripten 编译 spine-cpp）单独分发，不在引擎仓库快照内 —— 与 R8 对 bullet/physx 的结论同因。

## 3. 本轮处置（代码回归完成 + 缺失降级）

1. **代码回归侧（已完成，不缩范围）**：`cocos/spine` 24 文件（含 `lib/spine-core.js`、`lib/spine-core.d.ts`、`LICENSE`）按官方原文抽取入库，byte-identical；`exports/spine.ts` 官方原文接线；`features.spine-3.8 / spine-4.2` 注册（含 `SPINE_3_8/SPINE_4_2` 常量与 3 条 spine `moduleOverrides` 规则原样保留）；`external:emscripten/spine/*` 的 ambient 声明补入 `src/@types/emscripten-assets.d.ts`（仅为 typecheck 面）。
2. **构建侧**：新增 `src/cocos/spine/lib/air-spine-instantiate-js.ts`，经 `src/cc.config.json` 末位 `moduleOverrides` 规则顶替 `cocos/spine/lib/spine-instantiate.ts`。上游 `spine-instantiate.ts / -3.8.ts / -4.2.ts / -dynamic.ts` 四个文件保留官方原文不改，只是不在默认构建闭包内。
3. **运行侧**：shim 注入 `spine.wasmUtil` 缺失守卫（上游调用点无守卫），任何 spine 资产调用输出单条可读 `warn` 并返回 null，引擎启动与其余模块不受影响；同时保留 `_CC_SPINE_VERSION` → `setSpineVersion()` 的官方版本选择语义（单版本构建无 `setSpineVersion`，按需调用）。
4. **登记**：`docs/upstream-file-map.json` 新增该条（`modified: true` + 完整 reason）；旧验收报告的 LV12-10 标记为 **PARTIAL/BLOCKED**，该历史报告现已清理。

## 4. 解除阻塞需要的动作（后续会话）

- 取得与 alpha.34 匹配的 spine emscripten 产物（3.8 与 4.2 各 `spine.wasm.js`/`spine.wasm`/`spine.asm.js`/`spine.js.mem`），按 P2 模式落盘到构建资产目录而非 bundle；
- 删除 `src/cc.config.json` 末位的 spine override 规则（及 `src/cocos/spine/lib/air-spine-instantiate-js.ts`）即回到官方行为；
- 补 `examples/spine-basic`（skeletonData json+atlas+texture 三件套 `loadRemote`、动画/皮肤/事件断言）+ 三浏览器矩阵，才可判 LV12-10 PASS。

**许可提醒（R3）**：Spine Runtimes License 非 MIT —— 一旦真实分发 spine 运行时产物，`THIRD_PARTY_LICENSES.md` 必须单列该许可并核对再分发条款；本轮只回归了官方仓库内的 `cocos/spine/LICENSE`（Esoteric Software 声明文件），未分发任何二进制。

## §5. 结案（r46，2026-09-24，owner-decisions #9 并入 #10）

Owner 批复：D2 并入 D3/R8 一次决策，#10 = (a) ⇒ spine 与 bullet/physx/box2d-wasm/webgpu **同一份资产缺口、同一结案口径**
（「代码回归 + 选择器可达 + 降级可测」= 部分通过；§3 实测的 `spine-core.js` 3,747 B / `wasmUtil` 零实现 / 调用点无守卫维持原判）。
LV12-10 以「产物面 verified + 示例面 not-delivered（显著标注）」结案；`src/cocos/spine/lib/air-spine-instantiate-js.ts`
替身（moduleOverrides 顶替）保留，资产到位后按 §4 路径回官方行为。
