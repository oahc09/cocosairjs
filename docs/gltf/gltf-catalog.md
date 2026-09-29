# 官方模型目录与对照预览

打开 **http://127.0.0.1:7462/gltf-catalog/**。目录当前包含 150 个 Khronos 官方模型，可以搜索、分类、选择文件格式，并在 Cocos AIR 与官方 Viewer 中查看同一版本的模型。

## 启动与使用

```bash
node tools/verify/serve-gltf.cjs
```

也可使用已有开发服务器的 `/gltf-catalog/` 路径。原 [glTF 查看器](../../examples/gltf-viewer/index.html) 保留本地验证模型与原有测试入口，新增了目录链接。

1. 在左侧搜索模型名称、标签，或选择「核心功能」「包含扩展」「本地已核验」等分类。
2. 选择模型后，AIR 自动加载默认格式；格式下拉框完整列出该模型在官方索引中的 variants。
3. 拖动 AIR 画布旋转、滚轮缩放；使用「重置视角」恢复自动取景。动画模型保留片段选择、播放、暂停和时间采样。
4. 点击「开启官方对照」，在并排区域加载 Khronos Viewer。窄屏改为上下排列，也可以使用「官方预览」或「新窗口」链接。
5. 「源文件」和「模型说明 / 许可」分别指向当前选定格式及官方说明。

所选模型与格式会写入页面 URL，可复制链接恢复选择，例如：

```text
http://127.0.0.1:7462/gltf-catalog/?model=InterpolationTest&variant=glTF-Binary
```

目录收录不代表全部已被 AIR 支持。压缩或高级扩展模型可能报告加载错误；官方参考入口仍然可用。没有把渲染失败静默替换成其他模型。

两侧使用独立的相机、光照、环境和色调映射；这是一种交互式视觉对照，不是像素一致性测试，也不提供跨域相机同步。

## 官方来源与更新

参考 [Khronos Viewer main.js](https://github.com/KhronosGroup/glTF-Sample-Viewer/blob/main/src/main.js) 及其 [GltfModelPathProvider](https://github.com/KhronosGroup/glTF-Sample-Viewer/blob/main/src/model_path_provider.js)：目录读取 `glTF-Sample-Assets/Models/model-index.json`，文件地址由模型名、variant 和文件名组成。

本地 [catalog.json](../../examples/gltf-catalog/catalog.json) 是完整索引快照，固定在 `90d7ede14c7e280af263824604b427a1ca02cb66`，含生成日期和原始来源链接。模型和缩略图按需访问；打开目录不会批量下载所有模型。

更新快照：

```bash
node tools/verify/update-gltf-catalog.cjs
```

脚本读取官方提交与索引，并逐字节核对已有本地副本的 Git blob hash；多文件 glTF 同时核对外部依赖。当前有 6 个模型格式与该版本完全匹配，AIR 可用本地副本预览；官方 Viewer 使用同一固定版本的上游 URL。未匹配的本地文件不会标记为「本地已核验」。

缩略图来自官方截图；图片请求失败时保留模型名称与占位标识，不影响目录操作。参考 Viewer 通过独立 iframe 按需加载，网络或嵌入限制时保留新窗口入口。

## 验证记录

浏览器验证脚本：[gltf-catalog-browser.js](../../tools/verify/gltf-catalog-browser.js)。使用已打开的 Playwright CLI 会话运行：

```bash
npx --yes --package @playwright/cli playwright-cli -s=gltf run-code --filename=tools/verify/gltf-catalog-browser.js --raw
```

检查应覆盖目录搜索、格式切换、AIR 模型加载、动画、官方对照地址及手机布局。脚本报错或浏览器控制台错误需要独立处理；旧版的开发机截图与报告已经清理，不作为当前通过证明。完整发布检查见 [验证指南](../reference/verification.md)。
