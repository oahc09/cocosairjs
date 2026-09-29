# V0.5.1 包消费（T0/T1 交接与正式发布边界）

> 承接 V0.5 G5 与 T0 冻结交接（`docs/versions/acceptance-v051-t0.md`）。本文记录包机制审计、
> decoder 清单、consumer 验收结果与正式发布边界；不复述 V0.5 包机制的实现细节。

## 1. 交接 revision

- V0.5.1 起点（T0 冻结交接）：`534f2bb`（V0.5 最终状态 + V0.5.1 T0 记录）。
- 交接内容：V0.5 四份文档（gltf-runtime / gltf-extension-reference /
  gltf-decoder-deployment / gltf-validation）、capabilities、gltf-catalog、
  decoder 部署与审计工具、性能基线（`docs/gltf/gltf-performance-baseline.md`）。
- 原预留编号 13–16/18 撤销；V0.5.1 文档使用 `v051-*` 前缀，不占数字编号。

## 2. 包机制审计（T1 复核）

| 审计项 | 结果 |
|---|---|
| `npm pack` 文件清单 = `files` 精确白名单（build 产物逐项 + build/gltf-decoders/ + docs/*.md|json + 许可文件） | ✅ |
| tarball 真实可导入：`build/package.json` 声明 `{"type":"module"}`（Node 按最近 package.json 解析 ESM），根包 `type:commonjs` 不影响产物 | ✅ |
| 随包 README 相对链接全部可解析（docs 纳入 files，consumer 校验 md 链接与反引号路径） | ✅ |
| 包内无 `src/` `test/` `tools/` `output/` 泄漏 | ✅（consumer-acceptance 文件树断言） |
| `build/` 内含 module.js / module.min.js / module.d.ts / gltf-decoders/ | ✅ |
| decoder 审计（MANIFEST 双向 SHA-256、许可、bundle 隔离、离线 require） | ✅ `tools/verify/decoder-audit.cjs` ok（15 个 manifest 文件） |
| 依赖图守卫：默认 bundle 零 debug/agent 标识 | ✅ smoke-23（`createAgentSession`/`SESSION_CLOSED`/`__airErrorHub` 等真实输出检查） |

## 3. Consumer 验收（独立临时目录）

`tools/verify/consumer-acceptance.cjs`：pack → 解包 → 临时目录（系统 tmp，不污染 build/）`npm install` tarball →

- 文件树审计（必需产物存在、源码目录不泄漏、`build/package.json` type 声明）；
- **对安装后的原始包内容**（不修改任何字段）执行真实动态 `import()`：引擎求值期需要
  浏览器全局（浏览器引擎特性），用仓库 jsdom 提供 window/navigator/document/GameCanvas
  后 import，断言 `createAirApp / GLTFLoader / GLTFAsset / Node / Scene / Vec3 /
  MeshRenderer` 等 14 个关键导出与总导出数（368）；
- README 相对链接解析校验（目标必须存在于包内）；
- TypeScript bundler 解析下的严格类型消费（仓库内 typescript，避免 npx 假 tsc）。

结果：`ok: true, failures: [], exportCount: 368`（2026-09-16 复测）。

## 4. 正式发布边界（§9.3）

本版交付**可审核 tarball**（`npm pack` 产物 + 本文审计结果）。未经用户另行授权，
不核实 npm registry 名称/权限，不执行 `npm publish`；因此**不得宣称 npm registry
已可安装**。远端部署同理需单独授权。

## 5. 复现

```bash
npm run verify:decoders     # decoder 清单与 bundle 隔离
npm run verify:consumer     # tarball 消费审计（临时目录安装 + import + 类型）
npx jest test/smoke/smoke-23-debug-isolation.test.ts   # debug 不进默认 runtime
```
