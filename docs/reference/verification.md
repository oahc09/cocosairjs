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

这些命令需要对应浏览器环境及已构建产物。浏览器采集器会重新生成 JSON 和截图；子集结果不得用作全量验收。V1.1 示例、DevTools 和 Gallery 的采集器分别位于 `tools/verify/v11-examples-verify.cjs`、`tools/verify/v11-devtools-examples.cjs`、`tools/verify/v11-gallery-artifact.cjs`；按各脚本的参数说明执行完整采集，再生成 API 覆盖报告。

原有发布证据已经清理，当前应以实际门禁结果为准。`verify:release` 必须拒绝缺失、过时或不属于当前候选的证据；发布前还要求工作区干净。保留在 `docs/evidence/examples/`、`docs/evidence/manual/` 和 `docs/evidence/recipes/` 的截图本身不能替代汇总和指纹检查。

## 历史性能比较值

`tools/verify/v051-runtime-baseline.cjs` 保留了 V0.5 的 BoxTextured 冷加载中位数 **4.1 ms**，作为该旧版对标脚本的固定比较值。这是旧环境测量值，不是当前设备的性能承诺。当前性能应重新采样，并记录浏览器、设备、模型、构建指纹、加载条件和测量方法。

V0.6 汇总报告由 `tools/verify/v06-report.cjs` 在运行时生成；历史报告已删除，重新生成仍需要其 Golden Reference、Catalog 和 Recipe 输入。报告输出不是当前发布通过的替代证据。
