# glTF Viewer：Sheen 示例

运行开发服务器后打开 `/gltf-viewer/`，在“模型”中选择“织物光泽 · Sheen 对照与纹理”。

四个球按左上、右上、左下、右下排列：

- `bare control`：无 sheen 的相同基底。
- `sheen narrow`：颜色因子 `[0.8, 0.3, 0.12]`，粗糙度 0.25。
- `sheen soft`：相同颜色，粗糙度 0.8。
- `sheen textured UV1`：颜色从 sRGB RGB 读取，粗糙度从线性 Alpha 读取；颜色纹理使用 UV1 和 `KHR_texture_transform`，粗糙度使用 UV0。

示例通过真实 `GLTFLoader.loadAsync()` 加载自包含 `assets/sheen.glb`，不需外部模型或解码器。资产和生成代码为本项目原创 MIT 内容。当前 sheen 是主方向光 Charlie 分布与简化 visibility 实现，尚无专用 sheen IBL 卷积和积分 LUT。

## 再生成与定向验证

`node tools/fixtures/generate-gltf-sheen.cjs` 仅重写 `examples/gltf-viewer/assets/sheen.glb`，无下载。

CPU 回归：

```sh
npx jest --runInBand --runTestsByPath test/smoke/gltf-sheen.test.ts
```

浏览器回归使用当前主 bundle 与 Playwright CLI，先在一个终端启动静态服务器：

```sh
node tools/verify/serve-gltf.cjs
```

在另一终端运行：

```sh
playwright-cli open http://127.0.0.1:7462/gltf-viewer/
playwright-cli run-code --filename=tools/verify/gltf-sheen-browser.js
playwright-cli close
```

探针暂停原生时钟并逐帧比较 sheen 开关、粗糙度、颜色纹理变换与 Alpha 粗糙度纹理变换的实际像素，检查 GL/控制台错误，恢复材质和原生时钟，并写入 `output/gltf-sheen-browser.png`。失败抛错；这只是当前浏览器的定向回归，不更新正典示例证据，不代表多浏览器或完整 PBR 一致性验收。
