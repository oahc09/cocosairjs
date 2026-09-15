# V0.5.1 Runtime Baseline（T6）

> 测量日期 2026-09-14；环境：Windows 11 x64、HeadlessChrome 151（chromium-1234，ANGLE
> WebGL2）、视口 640×480、本机 dev server（no-store）、debug 面板默认关闭。
> 复现命令见文末。原始数据：`docs/evidence/v051-runtime-baseline.json`。

## 1. V0.5 冻结基线参照（不重测、不虚构）

直接沿用 `docs/gltf-performance-baseline.md`（V0.5 G5 冻结）：

| 参照 | V0.5 冻结值 |
|---|---|
| BoxTextured 官方字节校验副本，30 次冷加载中位 | **4.1 ms**（p5/p95 = 3.7/7.2） |
| 主 bundle / min / d.ts | 3,726,835 / 2,124,553 / 2,229,831 bytes（gzip 651,424 / 498,178 / 414,179） |
| gltf-decoders 全部 | 1,463,752 bytes（独立于主 bundle） |
| 加载与释放口径 | `fetch(bytes) → parseAsync` → `asset.destroy()` 为一轮；冷 HTTP no-store |

本次对账的制品 revision 与字节校验以 V0.5 T0 交接记录为准
（`docs/acceptance-v051-t0.md`）；本版未改动解析/渲染路径，bundle 字节数差异仅来自
`src/air/app.ts`（AirApp 接口增加只读 `canvas` 声明，类型层面、无运行时增量）。

## 2. 加载回归（工具关闭，30 次中位，≤15% 回退线）

| 指标 | 本次 | V0.5 冻结 | 比值 | 判定 |
|---|---|---|---|---|
| BoxTextured 30 次冷加载中位 | 2.10 ms | 4.1 ms | **0.512** | ✅ 无回退 |

同机不同进程时段的测量（与 V0.5 两轮之间同理）：绝对值同数量级且低于冻结值，
按"同机重测优先"规则判定为无回退。原始逐次数据见 evidence JSON 的
`boxTextured30.runsMs`。

## 3. 新增指标（每配置 ≥3 次页面加载，中位/范围）

| 指标 | 定义（起止点） | 中位 | 范围 |
|---|---|---|---|
| startup | bench 模块脚本起点 → `createAirApp` resolve | 34.9 ms | 33.3–35.6 |
| scene ready | `app.run(scene)` 调用 → `runSceneImmediate` 返回（同步激活） | ~8 ms（含场景搭建，单页内一次） | — |
| first visible frame | scene ready → 首次画布中心像素 ≠ 清屏色（`readPixels` 判定，不以 rAF 到达代替） | 2.9 ms | 2.9–4.3 |
| asset load 冷 | `GLTFLoader` 公开入口，每轮 `fetch`（no-store）→ `parseAsync` | 2.5 ms | 5 轮 |
| asset load 热 | 同 bytes 重复 `parseAsync` | 2.6 ms | 5 轮 |
| debug ops overhead | 同一场景 `inspectScene+inspectNode×50`：面板开 − 关 | 0.1 ms | 3 次页面 |
| debug fps overhead | 同场景 rAF 帧率 面板关/开 | 60 / 60 fps | 3 次页面 |
| memory | `performance.memory.usedJSHeapSize`（Chromium 专属；其他平台记 unavailable） | ~18.4 MB | 单点快照 |

口径说明：

- startup/scene ready 的分界是 bench 页内显式 `performance.now()` 标记；
  scene ready 与 first visible frame 之和即"从场景激活到可见"的完整链路。
- 冷/热缓存分开报告；冷缓存首轮含 HTTP 建连（no-store），报告取 5 轮中位。
- debug overhead 单独比较同一场景与操作的工具开/关；不与其他指标混算。
- GPU 可见信息（显存/纹理字节）在 WebGL 后端不可观测，记 **unavailable**；
  引擎对象级证据沿用 V0.5 §4 的行为级结论（12 轮加载/销毁零模型泄漏）。

## 4. 与计划的对应（V0.5.1 §8）

- 固定 OS/浏览器/WebGL 后端/视口/资产/工具状态：见环境行与 `environment` 字段。
- BoxTextured 回归沿用 30 次中位与 15% 同口径要求 ✅。
- 新增指标每配置 3 次、报告中位/范围 ✅；加载回归保持 30 次未降级 ✅。
- 不引入渲染器调优目标；不以单次 GC 证明无泄漏（内存项为行为级 + 快照）。

## 5. 复现

```bash
# 终端 1：dev server
node tools/dev/dev-server.cjs --example automation --port 7455
# 终端 2：基线测量（BoxTextured 30 轮 + 3 次页面指标）
NODE_PATH=<playwright 的 node_modules> node tools/verify/v051-runtime-baseline.cjs
```

V0.5 冻结基线复现见 `docs/gltf-performance-baseline.md` §5。
