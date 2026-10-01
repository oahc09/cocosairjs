# 验证与发布检查

在仓库根目录执行检查。脚本是否写入文件、需要哪些前置产物，见根目录 `AGENTS.md` 的命令表。历史版本的验收、交接、进展和体积快照已清理；它们不能证明当前版本已通过验收。

## 源码与文档

```bash
npm run typecheck
npm run verify:web-only
npm run verify:file-map
npm run verify:licenses
npm run verify:doc-refs
npm test -- --runInBand
```

`verify:doc-refs` 检查文档中的本地路径，不验证外部网址或渲染行为。对于已主动清理的审计和运行证据，它会单独登记引用；这类登记不属于有效验收证据。`verify:file-map` 需要可访问的上游源码，基线与差异登记见 [UPSTREAM.md](../UPSTREAM.md)。

## 构建与独立消费

```bash
npm run build:all
npm run verify:decoders
npm run verify:consumer
npm run verify:tarball-consumer
```

`build:all` 生成开发 bundle、声明和 npm 发布副本。`verify:tarball-consumer` 在浏览器中运行实际安装包；成功构建和 Node 导入不能替代这一检查。模型支持和解码器部署见 [glTF 运行时](../gltf/gltf-runtime.md) 与 [部署指南](../gltf/gltf-decoder-deployment.md)。

## 浏览器证据与发布就绪

```bash
npm run verify:browser-matrix
npm run verify:perf-lifecycle
npm run verify:release
```

这些命令需要对应浏览器环境及已构建产物。浏览器采集器会重新生成 JSON 和截图；子集结果不得用作全量验收。V1.1 示例、DevTools 和 Gallery 的采集器分别位于 `tools/verify/example-spec-browser.cjs`、`tools/verify/devtools-examples.cjs`、`tools/verify/gallery-artifact.cjs`；按各脚本的参数说明执行完整采集，再生成 API 覆盖报告。

历史清理不豁免当前候选的完整验收。`verify:release` 会现算候选指纹、以 `coverage-report.cjs --check` 核对库存、规格与逐 API 执行证据，并调用许可门禁；缺失、过时、授权未闭环均阻断发布。发布前还要求工作区干净。单独截图不能替代汇总和指纹检查。

2026-09-30 已重新采集当前候选的完整示例、DevTools、Gallery、三浏览器矩阵及 Recipe 证据。
执行与未解决项见 [发布复核记录](release-review.md)。2026-10-01 已改用公开 MIT PAL 源码，旧 npm 包退出发行来源；固定来源与复现步骤见 [PAL 来源](pal-source.md)。新构建仍须以对应指纹的完整运行证据通过发布门禁。

## 历史性能比较值

`tools/verify/runtime-baseline.cjs` 保留了 V0.5 的 BoxTextured 冷加载中位数 **4.1 ms**，作为该旧版对标脚本的固定比较值。这是旧环境测量值，不是当前设备的性能承诺。当前性能应重新采样，并记录浏览器、设备、模型、构建指纹、加载条件和测量方法。

V0.6 汇总报告由 `tools/verify/recipe-review-gate.cjs` 在运行时生成；历史报告已删除，重新生成仍需要其 Golden Reference、Catalog 和 Recipe 输入。报告输出不是当前发布通过的替代证据。
