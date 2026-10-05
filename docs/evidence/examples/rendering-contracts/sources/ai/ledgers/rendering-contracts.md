# 渲染 DX 七项实施与定向验收

2026-10-05。七项在下表限定范围内完成；不宣称完整发布就绪，也不把旧 Gallery 全集证据改成当前结果。原始报告、源码副本、截图与 SHA256 见[本轮证据索引](../../docs/evidence/examples/rendering-contracts/index.json)。

## 实现与实际结果

| 项目 | 交付与验证 | 边界 |
| --- | --- | --- |
| 1. 统一离屏目标 | 原生 `AirRenderTarget` 组合颜色/深度格式、样本、过滤、缩放、生命周期；三浏览器查询真实附件、尺寸和位宽，resize 新颜色与释放通过。 | 无新增平行引擎对象体系；请求/effective 分开；本机未触发实际样本降低，模拟 CPU `4→1` 另列。 |
| 2. 纹理格式、HDR 与颜色 | 原生 PixelFormat 浮点别名、显式格式与颜色校验；HDR 例三浏览器各 15 项通过：sRGB/等价线性、重复解码负控、浮点保留、tone map、真实离线 GGX 与生命周期。 | 不新增运行期 PMREM 卷积；metadata 是声明，真实 fixture 的离线生产和像素对照单独保留。 |
| 3. binding 与深度模板 | Effect 布局预检、binding 定位、raw/manual depth sampler 模板；原生材质 inspector 与当前公开包消费、定向单测通过。 | 可选 tools 不进默认 SDK；硬件 compare 明确拒绝；不是完整 GLSL 编译器。 |
| 4. 多通道水面 | 反射、折射、实际深度重建、Jacobian 焦散、相机斜裁剪与 resize；最终规格下三浏览器各 39 项通过。 | 使用既有原生相机/网格/材质，不是通用水体求解器。 |
| 5. 透明状态与实际顺序 | 材质 blend/depth 状态、鱼鳍深度负控、水花；真实 CAMERA_END queue 观察 6 项通过：opaque 16、transparent 13，鱼鳍 order0/priority1、水花 order1–12/priority2。 | 观察实际 legacy 常规队列，不重算排序；custom、instancing、UI 和队列外辅助 draw 不覆盖。 |
| 6. MSAA 与 resolve | 三浏览器 RGBA8/RGBA16F 的 1×/4×真实存储、单采样解析纹理、同帧采样、读回、深度 1×/4×通过；RGBA16F 读出 `[4,2,0.5,1]`。 | 专属目标探针未测 RGBA32F/sRGB 目标组合。 |
| 7. 可重复画面 | 固定相机、时间与波种；四通道、雨、可信鼠标、水花、透明负控、resize/reset 的实际截图和通道数据；两新例在三浏览器正式 collector 各 2/2 scope PASS。 | CPU 提交墙钟、GPU timer、截图耗时分别记录；Firefox/WebKit timer 缺失为 null；无显示器 present/FPS 认证。 |

## 当前候选与门禁

- 开发 JS：`72f37ee6f4fdd80e2fb89908e7c634ae422ce7fb52ab5d54812b43a2438650ba`。
- min JS：`c4a14cc5d9a5644010c4ecaa9a8c7e5ee26a551afcb9996abc0c4121d8df6eaf`。
- dts：`67ff4c489feb3ed79b69341a4cceaddc004d674e7ce756671ba730309274c9b9`。
- `build:all`、`typecheck`、`verify:web-only`、`verify:file-map`、实际安装包 `verify:consumer`、六个专属 suite 共 22 个测试通过。consumer 验证新 RT/格式/颜色/环境/inspector 的实际 JS 出口与 TS4.9 签名，开发 tools 不泄漏。
- 正式 manifest/API 库由生成器刷新；仅两个新例经 strict spec 校验与 `--ids` collector 重采。生产者的 `subset` 和 `completed:false` 保持原值，不改成全 161 例通过；没有回写旧全例报告或自动晋级。
- 构建仍有上游 PAL/B2 声明打包诊断，命令退出 0；本轮实际包消费签名通过，不宣称这些历史诊断已消除。

## 失败链与存量问题

首轮 Firefox MSAA readback 因 READ framebuffer 缓存与真实绑定失配，把显示相机清屏颜色写进 RGBA8 目标；浮点目标还出现 `INVALID_OPERATION`，旧像素幸存不能作为成功。主线程同步缓存并加入结构化 GL 错误后，第二轮三浏览器读回和 GLerror=0 通过。失败报告保留在证据 `history/`，没有重绑旧 hash。

首次正式新例验收发现两处规格错误：水例 supporting API 缺 claims/evidence；HDR 固定静态画面却声明自动 `visual.frame-diff`。最终水例只声明有实际源码/trace 的 Camera 支持，移除不可定位的 helper 内部 RenderTexture claim；HDR 保留 `visible-frame` 和真实按钮后的 `interaction.frame-diff`，删除不符合静态行为的自动动画声明。最终规格、完整水/HDR 专属检查和三浏览器正式 collector 均重新采集。

额外全局 `manual-doc-consistency --strict` 有一项存量 FAIL：HEAD 已跟踪的 `manual-port-recipes` 是没有独立 `index.html` 的模块配方，旧脚本却按传统独立示例判为孤儿。五条既有教学片段 WARN 也保留。没有添加假 HTML、修改配方或放宽脚本。此项不属于本轮渲染例，仍须后续处理；不能据本轮结果声称整个手册一致性全绿。

额外 `npm run format:check` 也为 FAIL：159 个警告文件全部已跟踪，且相对 HEAD 没有内容变化；主要是旧 `example.json` 和配方 manifest。新例、tools/probe、相关手册与 README 的显式格式检查通过。没有批量改写这些旧规格并使整个 Gallery 源指纹失效；原始日志及 HEAD 对照结果保留。

## 真实命令与产物

| 命令 | 实际输出与写入 |
| --- | --- |
| `npm run build:all` | 开发 unmin/min、dts、npm 副本；unmin 字节仍为上述 72f37，既有真实 RT 结果可保留。 |
| `node tools/examples/spec-fixlines.cjs --ids=water-multipass,hdr-color-pipeline --check` | 最终源码行号无漂移。 |
| `npm run gallery:manifest` / `npm run gallery:api` | 生成 `examples/files.json` 与 `docs/example-api-inventory.json`；不生成浏览器证明。 |
| `node tools/examples/spec-validate.cjs --strict --examples-dir=output/rendering-contracts/spec-inputs-02 --out=docs/evidence/examples/rendering-contracts/spec-validation.json` | 两个最终规格的只读暂存副本验证，2 frozen、0 issues。 |
| `node tools/verify/rendering-contracts.cjs --browser=all --out=output/rendering-contracts/attempt-02.json` | 当前目标三浏览器 PASS；没有覆盖 attempt01。 |
| `node examples/water-multipass/verify-browser.cjs --browser=<engine> --url=http://127.0.0.1:55940/examples/water-multipass/ --out=output/rendering-contracts/integration-water-<engine>` | 只读 server 上最终例，三浏览器分别 39 PASS；原始 19 张/浏览器截图保留。 |
| `node examples/hdr-color-pipeline/verify.cjs` | 新独立 attempt 下三浏览器各 15 PASS；原始目录写入归档索引。 |
| `node tools/verify/example-spec-browser.cjs --ids=water-multipass,hdr-color-pipeline --browser=<engine> --out=docs/evidence/examples/rendering-contracts/formal-<engine>.json --artifact-dir=<显式新目录>` | Chromium 最终文件带 `-attempt2`；保留首轮 FAIL，最终三浏览器各 2/2 定向通过。 |
| `npm run typecheck` / `npm run verify:web-only` / `npm run verify:file-map` / `npm run verify:consumer` | 当前原始日志见证据 `logs/`；不会发布。 |
| `node node_modules/jest/bin/jest.js --runInBand test/smoke/render-dx-native-attachments.test.ts test/smoke/render-dx-target-options.test.ts test/smoke/render-dx-color-contract.test.ts test/smoke/render-dx-depth-layout.test.ts test/smoke/render-dx-material-diagnostics.test.ts test/smoke/render-dx-render-queue.test.ts --silent` | 本轮六个 suite、22 PASS；没有运行整仓 Jest。 |

没有提交、推送、部署、发布或版本变更；保留 `build/build.zip`、`err.txt`、`out.txt`。旧完整 Gallery/矩阵证据因候选变化不能解释为当前就绪。
