# 引擎开发循环

> 使用 `npm run dev` 监听源码和示例变化，对应 `tools/dev/dev-server.cjs`。

## 启动

```bash
npm run dev [-- --example starter --port 7454]
```

## Watch 三频道分类（V0.2 Task 7）

| 频道 | 目录 | 行为 |
|---|---|---|
| engine | `src/cocos/**` `src/pal/**` `src/exports/**` | Engine rebuild → Browser reload |
| air | `src/air/**` | Air rebuild → Browser reload |
| example | `examples/**` | **仅 reload，绝不触发构建** |

rebuild 统一走 `tools/build/build.cjs`（单一管线，不换 bundler）。
V0.3 前置审查补充 `tools/build/incremental.cjs`，为 ccbuild 原有 Rollup 管线接入原生模块缓存。
未改动模块跳过重复转换；TypeScript program 初始化与最终链接仍会执行，不是 HMR。
配置/锁文件变化、缓存损坏或构建失败会失效缓存；min/system 构建走完整管线。
缓存位于 `build/.tmp-rollup-cache/`。同目录构建通过进程锁串行，避免多个 dev server 争用产物。

## Example 即时编译

- `examples/**/*.ts` / `*.mts` 由 dev server 用 esbuild transform 后按 ESM JS 服务
  （`loader: 'ts'`, target es2022，支持 top-level await），按源内容缓存转换结果，避免快速保存时 mtime 相同而读到旧代码。
- 没有 importmap 的 example HTML 才注入 `cocosair` → `/build/cocosair.module.js`，
  因此 example 里直接 `import { createAirApp } from 'cocosair'`。
- 编译错误返回 500 并打印终端，浏览器 console 可见。

## Browser Reload 与错误可见性

- 保存 → rebuild → **full page reload**（V0.2 明确不做 HMR：引擎 global state /
  GPU 资源复杂，HMR 状态不可控，计划书 §17）。
- 构建失败：不清 reload token（浏览器保留上一个可用 bundle），
  页面顶部显示红色错误横幅（`/__build_status` 轮询），终端保留完整错误。
- `/__reload_token`、`/__build_status`、`/__stats`（频道耗时统计）为诊断端点。

## 诊断工具

- `/__air-test.html`：仅 import bundle 的自检页（title 报告导出数量与 createAirApp 类型）。
- air-prelude：捕获 window error / unhandledrejection / 资源加载错误到 `window.__airErrors`，
  并观察 WebGL draw 计数、shader/link 错误到 `window.__glStats`。
  不调用 getError 消耗错误状态，也不查询无效枚举；像素采样由独立验收工具负责。
- `/__runtime-assets.js`：只读 Inspect/Validate 工具，使用方法见 [V0.3 运行时集成](runtime-inspection.md)。

## 示例验证

```bash
NODE_PATH=<playwright 所在目录> node tools/verify/basic-examples-browser.cjs
# starter / hello-cube / static-model / skinned-animation → ALL-EXAMPLES-PASS
```

## 已知约束

1. 默认模板使用 `GameCanvas`；自定义 canvas 需在引擎 import 前预绑定，见 [启动约定](code-first.md)。
2. `fs.watch` 只响应内容变化；仅 mtime 的 touch 不触发事件（实际编辑器保存无影响）。
3. Windows 下 recursive watch 可用；其他平台若不可用则退化为无 watch（终端有告警）。

## V0.5.1 增量

- dev 页面注入右下角 `debug` 按钮（`/__debug-button.js`，点击才加载
  `tools/debug/panel.ts` 面板）；agent session 合同见 [Agent 调试会话](agent-development.md)。
- `tools/debug/**` 变更与 examples 同频道：仅浏览器 reload，不触发引擎构建。
- 开发期性能测量页：`examples/shared/bench.html`（示例发现排除 shared/），
  测量和发布检查见 [验证指南](../reference/verification.md)。
