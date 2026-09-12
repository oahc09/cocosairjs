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
