# glTF / GLB 验证记录

日期：2026-09-12。范围：运行时加载器、原生模型/动画适配、SDK 导出、本地浏览器示例。

## 结果

| 检查 | 结果与依据 |
|---|---|
| TypeScript | `npm run typecheck` 通过 |
| 全量测试 | `node node_modules/jest/bin/jest.js --runInBand`：7 个套件、25 项通过；其中新增 glTF 12 项 |
| ESM 构建 | `npm run build` 通过；[构建输出](../output/playwright/gltf-build.log) |
| 声明构建 | `npm run build:dts` 通过；[构建输出](../output/playwright/gltf-dts.log) |
| 声明消费 | `node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target ES2017 --moduleResolution node test/types/gltf.ts` 通过；验证 named imports、Promise 返回值和只读资源集合 |
| Web-only | `npm run verify:web-only` 通过，763 个可达文件；没有引入外部引擎或模型解码依赖 |
| WebGL2 | Chromium / WebGL 2.0，5 个模型全部通过，无浏览器/着色器/WebGL 错误；[原始结果](../output/playwright/gltf-webgl2-result.json) |
| WebGL1 | 强制 WebGL1 回退，5 个模型全部通过；仅记录预期的 WebGL2 不可用诊断，无其他错误；[原始结果](../output/playwright/gltf-webgl1-result.json) |

声明消费检查使用 `skipLibCheck` 验证新 API 的可消费性，不代表整个上游声明库无诊断。声明工具仍报告原有 Meshopt 外部模块及部分 PAL 类型解析告警；未修改这些已有模块，也未删除或降低项目原有检查。

## 画面证据

固定 1280×800 viewport，相同相机与光照，读取实际 WebGL framebuffer。动画比较 `t=0` 与 `t=duration×0.37`，每像素 RGB 绝对差之和大于 15 才计入变化；这些数量用于行为验证，不是性能指标。

| 模型 | 初始前景像素 | 动画变化像素 | 截图 |
|---|---:|---:|---|
| BoxTextured.glb | 72,559 | 静态 | [纹理模型](../output/playwright/BoxTextured.png) |
| SimpleSkin.gltf | 92,878 | 29,842 | [骨骼姿态](../output/playwright/SimpleSkin.png) |
| AnimatedMorphCube.glb | 219,572 | 199,168 | [Morph 姿态](../output/playwright/AnimatedMorphCube.png) |
| diagnostics.glb | 167,160 | 静态 | [材质检查](../output/playwright/diagnostics.png) |
| combined.glb | 12,864 | 33,525 | [组合动画](../output/playwright/combined.png) |

本机 WebGL1 与 WebGL2 得到相同的上述计数。材质探针验证 UV0 红色 `[229,0,0]`、UV1 绿色 `[0,229,0]`、透明混合 `[126,16,25]`、镜像单面模型红色 `[229,0,0]`。此外验证点击播放后时间推进、点击暂停后时间保持不变。

这不是对所有 glTF 文件或所有显卡的认证，也没有执行 Three.js 的像素级对照。参考引擎用于架构和格式语义定位；实际渲染结果遵循 Cocos 的光照与色调映射。

## 问题与处理

| Evidence | Finding | Path |
|---|---|---|
| 四元数三次样条中间帧保持初始值 | 原生 Animation 跳过无曲线通道的自定义 Track | 自定义四元数轨道保留真实分量曲线，由原生调度执行 Hermite 求值与归一化；原生采样测试通过 |
| Morph 的 WebGL 着色器编译错误 | 转换后的源码残留 Vulkan `gl_VertexIndex` | glTF effect 分别使用 WebGL2 `gl_VertexID` 与 WebGL1 顶点 ID 属性，兼容 WebGL1 纹理采样 |
| Morph buffer 的数值读取范围 | 原生位移 buffer.count 是浮点分量数 | 写入 `vertexCount×3`，补实际位移数组断言与画面变化检查 |
| WebGL1 蒙皮报 `cc_joints` 未声明 | 通用 UBO 展开器遗漏以宏表达式声明的数组 | 仅在 glTF effect 中恢复该原生 uniform；WebGL1 蒙皮与组合模型验证通过 |
| 原 `extname('model.glb#scene')` 选错加载类型 | fragment 被当作扩展名内容 | 最小修改上游 path 工具，补 URL 回归并更新 upstream-file-map |
| 直接从构建声明导入报“不是模块” | ccbuild 输出全局 `cc` 声明 | 声明输出转换为 SDK 外部模块，并重写内部自引用；类型消费测试通过 |

初始测试基线中 `smoke-06` 使用 `Mat4.m` 导致失败；工作区另一项并行工作已修复，最终全量测试为通过。本次没有修改该测试。第一次声明构建曾与另一进程争用临时目录，待目录空闲后重试通过。

复现步骤、支持限制和 API 用法见 [运行时指南](gltf-runtime.md)；fixtures 的作者、许可和校验值见 [来源清单](../examples/gltf-viewer/assets/SOURCES.md)。

## 官方文件追加验证

按用户提供的 [KhronosGroup/glTF](https://github.com/KhronosGroup/glTF) 核对官方测试来源。规范仓库的 “Sample models” 指向 glTF-Sample-Models，后者已归档并指向 [glTF-Sample-Assets](https://github.com/KhronosGroup/glTF-Sample-Assets)。规范仓库内的 `.gltf` 文件主要是扩展示例，不能把其中尚未支持的扩展算作首版核心功能。

追加验证保留前三个官方模型，新增 Sparse、插值、顶点色和顶点透明度四项，**共 7 个官方模型**。没有使用本项目生成的 combined/diagnostics 替代官方文件。

| 官方模型 | 验证内容 | WebGL2 | WebGL1 |
|---|---|---|---|
| BoxTextured.glb | 内嵌图片、纹理模型 | 通过 | 通过 |
| SimpleSkin.gltf | 多文件依赖、蒙皮、1 个动画片段 | 通过 | 通过 |
| AnimatedMorphCube.glb | Morph、1 个动画片段 | 通过 | 通过 |
| SimpleSparseAccessor.gltf | Sparse accessor、Data URI | 通过 | 通过 |
| InterpolationTest.glb | 位移/旋转/缩放 × STEP/LINEAR/CUBICSPLINE，共 9 个片段 | 通过 | 通过，有 NPOT 采样降级 |
| VertexColorTest.glb | 顶点色与贴图参考行；截图中的红/绿/蓝勾号对应 | 通过 | 通过 |
| Material_AlphaBlend_00.gltf | 顶点 alpha 与 BLEND；两点像素混合计算 | 通过 | 通过 |

原始结果：[WebGL2](../output/playwright/gltf-official-webgl2.json)、[WebGL1](../output/playwright/gltf-official-webgl1.json)。每个动画片段使用独立实例恢复初始姿态，分别采样时长的 0、13%、37%、63%、89%、100%；每个片段都检测到实际 framebuffer 变化。此检查证明加载、求值和渲染链路工作，不等价于逐帧动画数值认证。

透明度探针的插值 alpha 为约 0.57、0.41：实际 RGB 分别为 `[28,32,40]`、`[27,33,43]`，按原文件顶点 alpha 和不透明参考帧计算的值为 `[29,32,40]`、`[27,33,43]`，最大误差 1/255。

WebGL1 的唯一格式兼容告警来自 InterpolationTest 的 **1000×100** 标签纹理。实际 sampler 已核实为 clamp/no-mipmap；WebGL2 保留 repeat/mipmap。按既定首版范围将它记录为兼容性降级，不归为无告警通过；没有忽略 shader 编译错误或 WebGL 错误。

截图：[插值模型](../output/playwright/official-InterpolationTest-webgl2.png)、[顶点色](../output/playwright/official-VertexColorTest-webgl2.png)、[Sparse](../output/playwright/official-SimpleSparseAccessor-webgl2.png)、[顶点透明混合](../output/playwright/official-Material_AlphaBlend_00-webgl2.png)。所有七项同时加入本地模型查看器。

复现命令（验收服务仍使用 `node tools/verify/serve-gltf.cjs`）：

```bash
node tools/verify/fetch-official-gltf.cjs
npx --yes --package @playwright/cli playwright-cli -s=gltf goto http://127.0.0.1:7462/gltf-viewer/
npx --yes --package @playwright/cli playwright-cli -s=gltf run-code --filename=tools/verify/gltf-official-browser.js --raw
npx --yes --package @playwright/cli playwright-cli -s=gltf goto "http://127.0.0.1:7462/gltf-viewer/?webgl=1"
npx --yes --package @playwright/cli playwright-cli -s=gltf run-code --filename=tools/verify/gltf-official-browser.js --raw
```

**Deviations：**原拟使用约 3 MB 的 AlphaBlendModeTest；其 GLB 和多文件版本中的大图片均遇到网络超时。改用同属 Khronos 官方的 glTF-Asset-Generator 小型透明混合用例；没有压缩、替换贴图或修改官方模型。未完整下载的 AlphaBlendModeTest 不列入通过清单，部分下载文件仅留在验收输出目录。本次只增加官方 fixtures、示例选择和验证脚本，没有修改加载器/渲染器。

## KHR_texture_transform 支持修复

用户报告模型在 `decodeContainer` 被 `unsupported required extension: KHR_texture_transform` 拒绝。原因是该扩展未进入支持列表，也没有纹理坐标变换适配；本次补齐实际采样行为后再允许加载，其他未支持的必需扩展仍拒绝。

- 五类核心贴图分别保存两行 UV 仿射矩阵，复用现有材质 Constants block；顶点与片元的布局保持一致，WebGL1 使用对应 uniform。
- 支持偏移、缩放、旋转与 UV0/UV1 覆盖。旋转方向结合 [官方 Sample Renderer 的实现](https://github.com/KhronosGroup/glTF-Sample-Renderer/blob/main/source/gltf/material.js) 和 [官方箭头测试](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/90d7ede14c7e280af263824604b427a1ca02cb66/Models/TextureTransformTest) 校验，避免 UV 原点及行列约定造成反向旋转。
- 材质槽互相独立，不改写共享纹理和网格 UV；法线贴图的有效 UV 通道与缺省切线生成同步处理。非法参数和超范围 UV 通道报错。

验证结果：

| 检查 | 结果 |
|---|---|
| 全量测试 | 9 个套件、36 项通过，含新增 4 项 texture transform 回归 |
| 类型、ESM、声明构建、声明消费 | 通过 |
| Web-only 依赖检查 | 通过，764 个可达文件 |
| 五类贴图 × UV0/UV1 | WebGL1/2 各 10 组，与独立烘焙 UV 参考比较；最大 RGB 通道差为 1/255 |
| 测试有效性 | 每组存在实际前景，并与未变换画面有 24,623～77,689 个像素变化，排除空帧或无变化导致的假通过 |
| 官方 TextureTransformTest | 两种 WebGL 均加载；偏移勾号与旋转/缩放/组合的绿色箭头标记正确 |
| 官方 TextureTransformMultiTest | 必需扩展通过，五类核心贴图的 UV0/UV1 均显示勾号；可选 clearcoat 仍按既定范围回退并告警 |
| 原有官方模型回归 | 7 个模型通过 |

证据：[WebGL2](../output/playwright/texture-transform-webgl2.json)、[WebGL1](../output/playwright/texture-transform-webgl1.json)、[旧模型回归](../output/playwright/texture-transform-regression.json)、[箭头测试截图](../output/playwright/TextureTransformTest-webgl2.png)、[多贴图测试截图](../output/playwright/TextureTransformMultiTest-webgl2.png)。

复现脚本为 [texture-transform-browser.js](../tools/verify/texture-transform-browser.js)。两种 API 应分别使用新的 Playwright 会话，WebGL1 会话先打开带 `?webgl=1` 的查看器，再运行脚本；脚本会在导航前设置 WebGL1 context 限制。官方案例通过模型目录按固定版本 URL 在线加载，没有改写其文件。


## V0.5 扩展验收记录（2026-09-14）

> 上表为 2026-09-12（V0.2 期，7 套件/25 测试）历史结果，保留测量日期；以下为 V0.5 终态增量。

| 检查 | 结果与依据 |
|---|---|
| 全量测试 | 20 套件 / 119 测试通过（`npm run test`） |
| typecheck / verify:web-only / esm / min / dts / NodeNext 消费 | 全绿 |
| G3 permutation | kitchen-sink 七扩展全绑定 + 九材质矩阵，真机零 GL 错误（`gltf-permutation-browser`） |
| 扩展浏览器证据链 | 12 脚本 ok:true（physical/clearcoat/anisotropy/iridescence/bump/transmission/scene/webp/ktx2/performance/stability/official-materials），`tools/verify/gltf-*.js` |
| 官方样本 | 10 个 Khronos 样本（pin `90d7ede` + SHA-256 manifest + LICENSE 随录）真机加载渲染零错误；`docs/evidence/v05-*.raw.json` |
| G5-build 包审计 | `npm run verify:decoders` ok（清单双向核对、许可、零内嵌、pack 离线 require） |
| 性能/稳定性 | BoxTextured 30 次中位 2.2ms；未压缩加载 WASM/Worker=0；12 轮加载/销毁零泄漏趋势（`docs/gltf-performance-baseline.md`） |
| 支持矩阵 | `examples/gltf-catalog/capabilities.json`：21 扩展、运行时 registry 生成、9 项 verified-official-load |

已知限制口径与 V0.2 节一致：不宣称所有设备无条件支持；decoder-required/device-dependent/fallback
以 capabilities 与 [扩展参考](gltf-extension-reference.md)、[decoder 部署](gltf-decoder-deployment.md) 为准。
