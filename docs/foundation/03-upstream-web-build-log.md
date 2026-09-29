# 03 — Upstream Web Build Log（Phase 0.3 / 验收 L0）

> 基线：`cocos4 @ 4.0.0-alpha.33 (snapshot 2026-09-12)`

## Run 1 — 上游默认命令 `npm run build:dev`

- 结果：**FAILED（Upstream Baseline Failure）**
- 耗时：~1m30s
- 错误：
  ```
  Error: Could not load external:emscripten/webgpu/glslang.js
  (imported by cocos/gfx/webgpu/instantiated.ts):
  ENOENT: no such file or directory,
  open '...\native\external\emscripten\webgpu\glslang.js'
  ```
- 原因：默认 build 不传 `features` → 全量 feature 集；`gfx-webgpu`（以及 physics-physx / physics-ammo / physics-2d-box2d-wasm / spine-3.8 / spine-4.2 / meshopt）import `external:emscripten/...`，而 `native/external/` 不在源码快照中（.gitignore 排除，需 `update:native-external` 单独下载）。
- 处置：按计划书 Task 0.3，**不为 Air 顺手修改上游**，记录失败并改用显式 feature 集复现（Run 2）。

## Run 2 — 同一构建器 + 显式 Web feature 集（tools/baseline/build-baseline.cjs）

- 命令：`node tools/baseline/build-baseline.cjs`
- 参数：与 `build:dev` 完全一致（engine/ccbuild/mode=BUILD/platform=HTML5/format=system），仅增加：
  - `features`：cc.config.json 全部 feature 减去 `['gfx-webgpu','physics-physx','physics-ammo','physics-2d-box2d-wasm','spine-3.8','spine-4.2','meshopt']`（7 个依赖 native/external 的 feature）
  - `split: true`（消除 ccbuild 的隐式 split 警告）
- 结果：**BUILD OK**
- 耗时：1m17s
- 输出：`bin/dev/cc-baseline/`（SystemJS split chunks，27 MB，~100 个 chunk，含 `_virtual_internal_constants-*.js`）
- 未修改任何上游文件。

## 依赖 `external:`（native/external）的模块清单（证据）

| 源文件 | external 依赖 | 所属 feature |
|---|---|---|
| `cocos/gfx/webgpu/instantiated.ts` | glslang.js | gfx-webgpu |
| `cocos/webgpu/instantiated.ts` | webgpu 相关 | 无默认引用（不可达） |
| `cocos/physics/physx/physx-adapter.ts` | physx wasm | physics-physx |
| `cocos/physics/bullet/instantiated.ts` | bullet wasm | physics-ammo |
| `cocos/physics-2d/box2d-wasm/instantiated.ts` | box2d wasm | physics-2d-box2d-wasm |
| `cocos/spine/lib/spine-instantiate-*.ts` | spine wasm | spine-3.8 / spine-4.2 |
| `cocos/3d/misc/mesh-codec.ts` | meshopt wasm | 3d（但被 `CULL_MESHOPT=true` 常量折叠剔除） |

## 结论

- Web baseline 本身可用（Run 2 证明），前提是 feature 集不含依赖 `native/external` 的 7 个 feature。
- Air V0.1 的 Web feature 集天然落在该范围内（见 docs/foundation/01-web-feature-set.md）。
