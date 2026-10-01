# glTF decoder 部署指南（V0.5 / T7）

> 原则：引擎主 bundle **永不内嵌** decoder（JS/WASM/worker 均不打包、不初始化）；decoder 是
> 随包分发的**独立静态资产**，由应用注入 provider。缺文件/哈希/离线复现证据即阻断验收。

> **Draco 浏览器边界（2026-09-30）**：随包的 `draco3d.js` 与 `draco_decoder_nodejs.js`
> 是 CommonJS / Node 入口，不能直接作为浏览器 `<script>` 或 ESM 动态 import 的 factory。
> 当前包没有提供浏览器版 `DracoDecoderModule` glue；需要 Draco 正向解码的应用必须另行取得
> 兼容的浏览器 decoder，并向 `createDracoDecoder()` 注入其 factory。
> 下文 `DracoDecoderModule` 表示应用提供的浏览器模块，不由随包 `draco3d.js` 创建。
> `verify:decoders` 只证明发布资产及哈希完整、Meshopt 可加载，不证明 Draco 浏览器正向解码。

## 1. 资产清单（权威 = MANIFEST）

```
build/gltf-decoders/
├── MANIFEST.md            # 逐文件 bytes + SHA-256 + 版本/来源/许可 + 决策记录
├── meshopt/               # meshoptimizer 1.2.0 (MIT)：decoder.cjs/.mjs、encoder(仅 fixture)、index.js、LICENSE.md
├── draco/                 # draco3d 1.5.7 (Apache-2.0)：draco3d.js、decoder/encoder .wasm + nodejs 胶水、LICENSE.md（全文）
└── basis/                 # BasisU 转码器（three r168 构建，Apache-2.0）：basis_transcoder.js/.wasm、LICENSE.md（全文）
```

- `npm pack` / `files:["build/"]` 原样携带；解包哈希不漂移（审计项）。
- 许可聚合：`THIRD_PARTY_LICENSES.md` §解码器资产 → 本目录逐文件哈希与 notice。

## 2. 注入 API（应用侧唯一入口）

```ts
import { GLTFLoader, createMeshoptDecoder, createDracoDecoder, createKTX2Transcoder } from 'cocosair';

// 浏览器：先以 <script>/动态 import 取得 decoder 模块（UMD 全局或 ESM 导出），再包装注入
const loader = new GLTFLoader()
    .setMeshoptDecoder(createMeshoptDecoder(MeshoptDecoder))            // meshopt_decoder.mjs
    .setDRACODecoder(createDracoDecoder(() => DracoDecoderModule()))     // provider factory
    .setKTX2Transcoder(createKTX2Transcoder(() => BASIS()));             // basis_transcoder.js（UMD 全局 BASIS）
loader.unregister?.(...)  // 可注销；未注入对应 provider 时：optional 扩展告警回退，
                          // required 扩展按 GLTF_DECODER_MISSING 干净失败 —— 不会隐式初始化。
```

进程级默认值：`configureGLTFLoaderDefaults({...})`；实例配置优先。
**未使用压缩/转码扩展时，上述注入不发生、WASM 不加载、worker 不创建**（§10 探针实测为 0）。

## 3. 静态服务要求（MIME / CORS / 缓存 / worker）

| 扩展名 | 必需 MIME | 说明 |
|---|---|---|
| `.js` `.mjs` `.cjs` | `text/javascript` | ESM `<script type=module>` 与动态 import 强校验 MIME |
| `.wasm` | `application/wasm` | `WebAssembly.instantiateStreaming` 前置；错 MIME 直接失败 |
| `.glb/.gltf` | `model/gltf-binary` `model/gltf+json` | 浏览器解码路径 |

- **同源部署**（本仓库示例均相对路径）；跨源需 `Access-Control-Allow-Origin`（wasm 流式编译
  同样受 CORS 限制）。
- **缓存**：decoder 内容寻址（MANIFEST sha256），生产可长缓存并携带 `?v=<hash>`；示例 dev 路径
  一律 `no-store`（改代码即见）。`.wasm` 不可 gzip 编码破坏（`Content-Encoding` 需完整解压）。
- **worker**：本版无 worker 集成（draco/meshopt 主线程执行，capabilities 报告注明）；应用若自备
  worker 池，属应用侧资产，引擎不生成也不共享。
- 现成参考实现：`tools/dev/dev-server.cjs`（MIME 表 + importmap 注入）、
  `tools/verify/serve-gltf.cjs`（模型+解码器静态路由）；
  `tools/verify/prepare-static.cjs` 已把 `build/gltf-decoders/` 复制进离线静态目录（T7 修复项）。

## 4. 路径与嵌套部署

- 引擎对 decoder **零路径假设**：provider 是应用传入的模块/factory，任何 URL 布局均可；
  示例采用 `import('/build/gltf-decoders/<name>/…')`。
- 嵌套部署（如 `/nested/demo/normal/`）由 `prepare-static.cjs` 产出、
  `v03-review-browser`/catalog 回归覆盖：相对目录 ID、示例 URL 与解码器路由全部验证。

## 5. 离线可复现验收（G5-build）

```bash
npm run verify:decoders
# JSON 报告：清单双向核对（缺行/缺文件/字节或 SHA-256 漂移均退出 1）、
# 每目录 LICENSE.md、主 bundle/min/map 零内嵌（无 WASM 魔数、无 gltf-decoders/ 引用）、
# npm pack → 解包 → require(meshopt decoder) 得 decodeGltfBuffer/ready → 解包哈希复验
```

浏览器侧真实 wasm 证据：`tools/verify/gltf-ktx2-browser.js`（basis 全链）与官方样本
KTX-BasisU 变体（见性能基线文档 §2）。

## 6. 失败语义速查

| 场景 | 结果 |
|---|---|
| required 压缩扩展 + 未注入 provider | `GLTFError{code:'GLTF_DECODER_MISSING'}`，整包拒绝 |
| optional 压缩扩展 + 未注入 | `warnings[]` 记录，按未压缩核心数据继续 |
| 容器/头非法、转码目标全失败 | `GLTF_DECODE_FAILED`（extension 字段定位扩展名） |
| 设备缺纹理格式能力（KTX2） | 目标格式 rank 降级；无可用核心源且 required → `GLTF_DEVICE_UNSUPPORTED` |
