# 09 — Engine Development Loop

> V0.2 文档 09：`npm run dev` 自动开发闭环。对应 `tools/dev/dev-server.cjs`。

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
因 ccbuild 无增量缓存（见 `05-v02-build-performance.md`），air 与 engine 的 rebuild
都是全量重编；频道分类的价值在于耗时归因与 example-only 零构建。

## Example 即时编译

- `examples/**/*.ts` 由 dev server 用 esbuild transform 后按 ESM JS 服务
  （`loader: 'ts'`, target es2022，支持 top-level await），mtime 缓存。
- 所有 example HTML 自动注入 importmap：`cocosair` → `/build/cocosair.module.js`，
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
  并 hook WebGL（draw 计数、shader/link 错误、关键帧像素采样）到 `window.__glStats`。

## 示例验证

```bash
NODE_PATH=<playwright 所在目录> node tools/verify/v02-examples.cjs
# starter / hello-cube / static-model / skinned-animation → ALL-EXAMPLES-PASS
```

## 已知约束

1. 画布 id 必须是 `GameCanvas`（引擎 import 阶段即查找，见 `06-code-first-getting-started.md`）。
2. `fs.watch` 只响应内容变化；仅 mtime 的 touch 不触发事件（实际编辑器保存无影响）。
3. Windows 下 recursive watch 可用；其他平台若不可用则退化为无 watch（终端有告警）。
