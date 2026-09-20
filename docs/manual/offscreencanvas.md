# Using OffscreenCanvas in a Web Worker（在 Worker 中使用 OffscreenCanvas）

> 把渲染搬进 Web Worker、主线程只留 UI 的课题。
> 状态：**N/A** —— AIR 当前构建没有这条路线的入口，本篇给实测证据与边界，不配示例（无可行示例）。

## 1. 实测结论：无入口

- 全量 grep `build/cocosair.module.d.ts` 与 `build/cocosair.module.js`：`OffscreenCanvas`、
  `transferControlToOffscreen` **零命中**。引擎词汇表里不存在这个类型。
- canvas 类型链全程 `HTMLCanvasElement`：`AirAppOptions.canvas: HTMLCanvasElement | string`（d.ts 32782）、
  gfx 设备 `init(canvas: HTMLCanvasElement | null, …)`（d.ts 4422）、
  屏幕适配器 `static canvas: HTMLCanvasElement`（d.ts 3583）。字符串形式只是选择器糖，最终仍解析为文档内元素。
- 无 Worker 引导面：d.ts grep `Worker` 零命中；director 主循环（`game`/`director`，d.ts 22618/22054）
  假定主线程 RAF 环境。

三条加起来意味着：既不能把 canvas 转移进 Worker（类型与 pal 层都不接受），
也没有"引擎跑在 Worker、画面回传"的官方通路——OffscreenCanvas + Worker 渲染路线在 AIR 不成立。

## 2. 架构归因

AIR 的 `pal/screen-adapter` 是**模块顶层单例**，在 import 时即绑定文档里的 `#GameCanvas`
（本手册多篇示例注释里的"#GameCanvas 必须在引擎 import 前存在"即此约束的实测表现）。
这一设计把"渲染表面 = 主线程文档元素"写进了启动路径，OffscreenCanvas/Worker 化需要先把该单例参数化，
属于引擎改造而非应用层技巧。

## 3. 桌面近似（应用层，不伪装）

渲染搬不进 Worker，但**每帧重逻辑**可以：把模拟/寻路/物理后处理等纯计算放进 Worker，
用 `postMessage`（结构化克隆或 `Transferable` 的 `Float32Array.buffer`）把结果送回主线程，
主线程组件在 `update` 里消费最新一份快照写节点变换。本篇不配示例的原因：
该模式是应用层 JS 常规操作，与 AIR 渲染器无耦合，写成"手册示例"会误导读者以为渲染也在 Worker。
数据化布局消费快照的写法见 [optimize-lots-of-objects-animated](optimize-lots-of-objects-animated.md) §1
（单管理组件 + TypedArray，把 Worker 送来的数组直接当状态源即可）。

## 4. 升级条件（何时能把本篇改 FULL）

1. `createAirApp` / gfx `init` 接受 `OffscreenCanvas`（d.ts 32782/4422 类型放宽且 pal 层解耦文档单例）；
2. 出现官方 Worker 引导入口（引擎在 Worker 内初始化、主线程仅做呈现或反之）；
3. 有可运行示例通过本仓库验证器（Worker 内渲染 + 主线程可见画面取证）。

三条任一满足前，本篇保持 N/A。

---

上一篇：[优化大量动画对象（Optimizing Lots of Objects Animated）](optimize-lots-of-objects-animated.md) ｜ 下一篇：[加载 OBJ 文件（Load an .OBJ file）](load-obj.md)
