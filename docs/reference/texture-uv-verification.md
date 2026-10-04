# 纹理行序与 UV 的当前验证

2026-10-04，Lead 使用默认统一产物 `de4e0472e8a9cf86af801e3f9f164c564ef43202278a3ef4ff6f67609de33d69`，在 Chromium、Firefox、WebKit 实际绘制并读取四角像素。上传行序与几何 UV 需要配对说明；不能仅凭一条渲染路径定义全局“正确方向”。

| 实际路径 | 图像或字节 | 视觉顶边 UV | 实测 |
| --- | --- | --- | --- |
| 原生 Sprite | HTMLImage/Canvas/ImageBitmap、顶优先字节或IMemoryImageSource | v=0 | 四角朝上、左右正确 |
| 原生 plane，绕 X 旋转 +90° | 相同图片或顶优先字节 | v=1 | 上下翻转、左右正确 |
| 相同 plane | `copyCanvasRows` 翻行后的字节 | v=1 | 四角朝上、左右正确 |
| 公开 GLTFLoader，外部 PNG | 顶优先图像，nearest/clamp sampler | v=0 | 四角朝上、左右正确 |
| 公开 GLTFLoader，嵌入 image bufferView | 同一 PNG 编码和 sampler | v=0 | 四角朝上、左右正确 |

前三行的原始基准来自 `output/playwright/air-uv-s11-runner-current.json/.log`（三浏览器，每浏览器八次观察）。`output/playwright/air-texture-source-s13-identity.json/.log`扩展到HTMLImage/Canvas/ImageBitmap、顶/底优先直接字节、helper及IMemoryImageSource七种输入，在每浏览器Sprite/plane与上传前后共20次实际观察，合计60次四角绘制；每个必需kind/source/stage由runner独立枚举并拒绝缺失/重复。上传前保存原始Texture2D/SpriteFrame引用，上传后使用相同对象，不重新解码或上传；三浏览器方向一致、引用归零和所有资产正常释放。真实TS4.9同时检查ImageData参数应被公开声明拒绝（NOT_APPLICABLE，不强转为GPU执行）。最终plane截图也人工核对，蓝黄在上、红绿在下，符合v=1顶边。

这些3D材质使用真实引擎网格和shader，plane与Sprite的区别来自原生几何UV。`examples/shared/canvas-texture.js`用于上述plane路径，其翻行行为正确；注释已明确适用的UV条件，没有改变helper算法。[多源规范化报告](../evidence/port-gap/eg3-texture-sources-s13.json)保留原始输入指纹/版本/日志，仍是完整EG3的一部分。

glTF 两行来自 `output/playwright/air-gltf-texture-s12-sampler-enums.json/.log`。每浏览器检查外部/嵌入图像，以及交错上传顶优先、底优先字节后复用原纹理，共四次四角观察。实际 GFX sampler 为 nearest/clamp，非法 wrap 值通过公开解析器拒绝。实例、资产、纹理及对照资源按所有权合同释放，原生有效性与引用归零；GPU 分配量不可测。WebKit 截图也经人工查看，红绿在上、蓝黄在下。

首轮探针调用不存在的纹理查询方法而失败；随后真实 TS4.9 检查又捕获资产枚举与 GFX 枚举的类型差别。探针现使用公开 `getGFXSampler().info` 和引擎实际采用的数值映射，类型检查及三浏览器均通过。失败原始日志保留，补偿链见 [EG3 glTF 方向报告](../evidence/port-gap/eg3-gltf-direction-s12.json)。

本轮保持默认上传行为，未增加全局 `flipY` 开关，也未修改 glTF UV/绕序补偿或引擎上传源码。需要改变方向时，按目标几何调整 UV 或准备对应行序的独立字节副本。没有新增抽取源码差异需要登记。`ImageData` 不是公开 `ImageSource`：业务可先写入 Canvas 或将字节交给 `uploadData`，不能依赖强制类型转换得到纹理。

[多源方向手册](../manual/texture-source-orientation.md)中的 run1/run4 和最小 plane 未绘制结果保留为各自历史范围；本页补齐当前候选的独立 plane/glTF 证据。所有报告仍是限定子集，不认证所有模型 UV、压缩纹理、颜色空间或实体设备，也不表示完整 EG3 或发布门禁通过。
