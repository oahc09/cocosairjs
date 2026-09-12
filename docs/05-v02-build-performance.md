# 05 — V0.2 Build Performance Baseline

> V0.2 Task 8/17（计划书 §16/§29）：性能只记录，不优化。
> 全部数据来自本仓库 `tools/build/build.cjs`（ccbuild 单管线，未更换 bundler）真实测量。

## 测量环境

- Windows 11 / Node 22 / Ryzen AI 9 HX 370 + 32GB
- feature 集：`air,base,gfx-webgl,gfx-webgl2,gfx-empty,3d,animation,skeletal-animation,primitive,tween,custom-pipeline,legacy-pipeline`
- 产物：`build/cocosair.module.js`（ESM, ~3.5MB）+ `.map`（~10.5MB）

## 测量结果

| 指标 | 耗时 | 测量方式 |
|---|---:|---|
| Cold Build（`npm run build`，独立进程） | ~52s | ccbuild 自报 `ccbuild done in 52.1s` |
| Air-only Rebuild（dev server air 频道） | ~114s | dev-server `/__stats`，`airRebuilds[0].ms` |
| Warm Build（连续第二次 `npm run build`） | ~50-55s | 与 cold 基本一致（ccbuild 无持久缓存） |
| Min Build（`npm run build:min`，compress + map） | ~127s | ccbuild 自报 `ccbuild done in 127.1s` |
| Example-only Reload（dev server example 频道） | <1ms（服务端） | 仅 bump reload token，浏览器 full reload |
| d.ts 生成（`npm run build:dts`） | ~81s | dtsBundler 单次运行（含本机 shim 清理降级） |

## 关键结论

1. **ccbuild 无增量缓存**（`verifyCache` 为 TODO），因此 Engine/Air 变更后的 rebuild 均为全量重编，Warm ≈ Cold。
2. **Watch 分类仍有实际价值**：
   - example 变更完全不触发构建（L9 的核心要求）；
   - air / engine 频道分离使耗时数据可归因（L8 的记录要求）；
   - 未来若更换/升级 bundler，频道基础设施可直接复用。
3. dev-server 内 rebuild（stdio inherit）比独立构建慢（114s vs 52s），主要是同机并发（Playwright/jest/构建竞争）造成，不代表管线差异。
4. dev 构建已附带 source map（`.map` ~10.5MB），浏览器异常可定位回 `src/**/*.ts`（L11）。

## 复测方法

```bash
# Cold/Warm
npm run build            # 观察 "ccbuild done in Xs"

# Air rebuild（启动 dev 后改 src/air/** 任意文件）
npm run dev -- --example starter
curl http://127.0.0.1:7461/__stats

# Example reload（改 examples/** 任意文件，观察终端 "example change ... reload only"）

# d.ts
npm run build:dts
```
