# PixiJS June 能力借鉴实施

用户授权：按 2026-10-07 会话建议逐项开发；不提交、不发布、不修改版本号。

## 顺序与验收

| 阶段 | 内容 | 状态 | 验收 |
| --- | --- | --- | --- |
| P1 | 现有纹理、资源、遮罩、混合、锚点能力及回归 | completed (定向范围) | 定向 Jest、真实浏览器像素与交互 |
| P2 | DOM overlay、纹理 Sprite、AIR Skills 随包 | completed | 所有权、销毁、布局、打包检查 |
| P3 | 原生 Graphics 命令回放与 SVG；Canvas 纹理填充与软遮罩；显式混合继承 | completed | 序列化、像素、动态更新、资源释放 |
| P4 | 可选 HTML-in-Canvas 模块 | completed (实验 Chrome) | 无 API 拒绝、能力探测、实验浏览器实际结果 |
| P5 | WebGPU transient MSAA 独立可行性记录 | completed (立项) | [独立后端阶段](webgpu-backend.md)，未实现后端 |

## 本轮基线

- 原工作区存在 AGENTS、启动、构建元数据及生成产物修改，保留它们。
- 6 个定向 Jest suite，69 个测试通过。
- `output/pixi-capabilities/baseline-texture-01.json`：Chromium/WebKit 完成 runner 的子集检查；Firefox 创建页面时基础设施异常。该 runner 的 PASS 不等于每类源的 3D 方向都一致，需检查逐项结果。
- 系统 npm shim 指向缺失 npm-cli.js；使用现有 `node node_modules/...` 入口，不更改主机配置。

完成状态仅由本轮验证更新；不以旧证据补齐。

## 接口与修复

- `createAirDOMOverlay`：借用并恢复 DOM，原生节点/正交相机的平移、旋转、缩放同步。
- `createAirTextureSprite`：原生 Sprite/UITransform/SpriteFrame、锚点和纹理 resize 后 refresh。
- `drawAirGraphics` / `airGraphicsCommandsToSvg`：数据回放到原生 Graphics，保留曲线和逐批样式导出 SVG。
- `rasterizeAirGraphics`：Canvas2D 生成原生 Texture2D；渐变、孔洞、local/global pattern、直接 affine transform、非正方形及小数 tile 尺寸。
- `attachAirSpriteMask`：red/alpha、soft/threshold/inverted；atlas 与旋转 UV 映射。
- `createAirUIBlendScope`：显式 UI/粒子子树继承和子节点覆盖，移出/解绑恢复。
- `cocosair.js/html-source`：engine-free 子路径、paint 上传、GPU 表单交互、不可变快照、几何同步与明确 unsupported。
- WebGL2 PSO 修复：GPU 缓存使用自有 raster/depth/blend 快照，避免已缓存加法管线被后续 normal 材质状态污染。
- 三项 AIR Skill 已通过 quick_validate，随包交付，不自动安装到宿主。

用法与生命周期合同见 [手册](../../docs/manual/graphics-and-dom.md)。

## 证据与限制

- Firefox 在沙箱内因 tab subprocess 启动失败而不能创建页面；在宿主许可的沙箱外执行后实际检查通过。保留首次失败尝试，不转换为 UNSUPPORTED。
- 普通 Chromium/Firefox/WebKit 对 HTML 实验 API 返回 UNSUPPORTED；系统 Chrome 开启实验 flags 后验证实际上传、变化、按钮、输入与 snapshot。实验能力不能作为默认三浏览器共同支持面。
- 安装包 TypeScript 消费沿用当前 consumer 的 `skipLibCheck: true` 合同；没有宣称整个上游声明在 skipLibCheck=false 下无诊断。
- iOS 真机、Pixi 特有 Canvas renderer/SplitText 修复、视频就绪与富文本/位图文本专项没有本轮新增行为证据；不盲目移植其修复。
- WebGPU/Canvas renderer、renderer preference 数组、任意 Node 子树软遮罩、任意 Graphics 实例恢复 SVG、任意 SVG 导入器均未实现。富填充为栅格路径。
- 未执行完整 Gallery/API coverage/release 门禁；旧正式证据不能代表新增 API 验收，未声明 release READY。
- 原有 `build/build.zip` 保留，没有用本轮产物替换该文件。

## 最终验收（2026-10-07）

| 检查 | 本轮结果 | 原始记录 |
| --- | --- | --- |
| Root typecheck | exit 0 | [日志](../../output/pixi-capabilities/typecheck-final.log) |
| 定向 Jest | 9 suites / 40 tests PASS | [日志](../../output/pixi-capabilities/jest-final-03.log) |
| 三浏览器 | Chromium / Firefox / WebKit 各 22 断言 PASS，drift=[]；普通 HTML API UNSUPPORTED | [JSON](../../output/pixi-capabilities/graphics-dom-final-03.json) |
| 系统 Chrome + flags | 29 断言 PASS，包括 HTML 实时变化、实际输入后的 GPU 像素变化、按钮、snapshot 不变与清理；drift=[] | [JSON](../../output/pixi-capabilities/html-dom-final-03.json) |
| 包消费 | 5 项 PASS；源与两套 source map 匹配、tarball 文件、无 DOM HTML entry、TS4.9 usage、实际 bundler | [JSON](../../output/pixi-capabilities/package-final-03.json) |
| Web-only 闭包 | PASS | [日志](../../output/pixi-capabilities/web-only.log) |
| 文件映射 | PASS，modifiedCount=191 | [日志](../../output/pixi-capabilities/file-map-final-02.log) |
| 文档路径 | unresolved=0，staleBaseline=0 | [日志](../../output/pixi-capabilities/doc-refs-final-02.log) |
| 三项 Skill | quick_validate 全通过 | air-code-first / air-graphics-and-dom / air-verification |
| 局部 Prettier 与 diff | 新探针/runner 检查通过，git diff --check 通过 | 检查终端结果 |

开发 bundle、min bundle、声明、engine-free HTML entry 与 npm 无 source map 副本均已生成。源码与两套 runtime source map 的逐项一致性由 package-final-03 强制检查；这不是仅检查文件存在。页面截图已检查，HTML 纹理中的输入内容实际更新为 AIR input。失败旧尝试保留，仅以上最终记录用于本轮结论。

## examples 补充与复验（2026-10-07）

新增四个带控制面板、实际断言和释放入口的 Gallery 场景：

- `graphics-svg-paints`：native Graphics、渐变/孔洞、pattern、SVG 预览与真实下载字节。
- `sprite-mask-blend`：red/alpha、soft/threshold/inverted、ParticleSystem2D normal/add。
- `dom-overlay-texture`：真实输入/点击、移动/旋转、锚点、texture resize/refresh 后的 GPU 像素。
- `html-texture-experimental`：live/snapshot/repaint，实验 Chrome 输入，以及普通浏览器 unsupported。

场景使用 `src/main.ts`，已加入 `examples/files.json`；从当前声明重生成 API inventory，四份 frozen 规格 API 证据均有可执行源码定位。status 保留 draft，未进行正式 stable 晋级。

新场景的像素检查发现 texture resize 之后旧 UI descriptor cache 仍引用已替换 GPU 纹理。`createAirTextureSprite.refresh()` 现在在 GFX texture 变化时清除旧 descriptor，并用原生 Sprite setter 重绑。GPU 检查要求 resize 后绿色像素仍为期望值，不能只检查 frame 的尺寸。此修复使上节旧 bundle 指纹成为历史记录；当前候选以以下新记录为准。

| 本轮检查 | 结果 | 记录 |
| --- | --- | --- |
| 三浏览器 / 四示例（桌面启动） | 11/12 PASS；WebKit DOM 场景 desktop→mobile PNG 黑图被门禁判 FAIL；drift=[] | [桌面矩阵](../../output/pixi-capabilities/examples-desktop-accepted.json) |
| 三浏览器 / 四示例（独立移动启动） | 12/12 PASS，viewport 390×820；包含 PNG 像素检查 | [移动矩阵](../../output/pixi-capabilities/examples-mobile-accepted.json) |
| 实际静态 Gallery / 实验 Chrome | 4/4 PASS；相对 bootstrap/HTML entry，SVG 下载与 HTML 输入/快照 | [静态实验记录](../../output/pixi-capabilities/examples-static-accepted.json) |
| 四份规格 | issues=[] | [规格审查](../../output/pixi-capabilities/examples-spec-final.json) |
| 示例专属 TS | exit 0，noEmit，SDK declarations + skipLibCheck | [日志](../../output/pixi-capabilities/examples-types-final-04.log) |
| Root typecheck | exit 0 | [日志](../../output/pixi-capabilities/examples-typecheck-02.log) |
| 相关 Jest | 3 suites / 20 tests PASS | [日志](../../output/pixi-capabilities/examples-jest-02.log) |
| 最新包与两套 source map | PASS | [包记录](../../output/pixi-capabilities/examples-package-final.json) |

Gallery builder 同步携带 bootstrap/html-source.js 并重写 importmap。`COCOSAIR_GALLERY_EXAMPLES` 支持显式子集，未知 ID 拒绝，产物 manifest 标记 subset。定向 static runner 使用临时产物，不覆写默认 Gallery 或正典浏览器记录。

全库规格审查仍有既有 `gltf-viewer` 一处出处行问题和 `responsive-board-recipes` 18 项问题；全量静态构建也被后者的仓库工具/旧 output 依赖阻断。这些不在本轮四个场景的修复范围，未将子集结果宣称为全库通过。首次失败构建留下的临时目录 `C:/Users/caosh/AppData/Local/Temp/air-graphics-gallery-OyLdl1` 清理被系统策略拒绝，已保留；后续受控子集临时构建正常清理。

图像预览与 PNG 内容曾出现不一致，[独立 PNG 审查](../../output/pixi-capabilities/examples-visual-review.json) 的某次移动截图读到 `(50,190,160,255)` 并为 PASS。新 runner 强制读取实际截图像素后，桌面矩阵的 WebKit DOM 场景在跨视口切换读到 `(0,0,0,255)`，判定 FAIL。因此该问题具有间歇性，单次正确图不能排除故障，未宣称全部视觉检查通过。独立移动启动本轮 12/12、实验 Chrome 静态子集 4/4 通过，与失败范围分开记录。以上 accepted 文件名只是本轮报告命名；以 completed、逐项 status 和像素值为准。普通展示使用原生 pacer，动作/断言时暂停并用单一步进时钟，没有双时钟驱动。
