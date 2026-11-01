# Post Processing（后处理）

默认 Code First WebGL2 路径现在提供 `createAirPostProcess(camera, options)`，包含线性 HDR 捕获、多级 Bloom、ACES/Reinhard、曝光及统一输出编码。完整参数、资源所有权、限制及运行方法见 [HDR 后处理指南](../guides/hdr-post-processing.md)。

```ts
const post = createAirPostProcess(camera, {
    levels: 5,
    toneMapping: 'aces',
    exposure: 1,
    bloom: { intensity: 0.6, threshold: 1 },
});
post.setOptions({ bloom: { enabled: false } });
// 离开场景时释放；销毁相机节点也会自动释放。
post.dispose();
```

主引擎入口直接导出该接口。先调用 `createAirApp`，再装配后处理；可在 `app.run(scene)` 前创建。示例：[霓虹夜城](../../examples/neon-city/index.html)，提供实际 Bloom 开关、色调映射和曝光控件。

## 输出与限制

- 自定义 shader 输出线性场景亮度，发光值可大于 1；不要提前进行 tone mapping 或 sRGB 编码。
- 原生 standard/unlit 的输出转换按相机切换，不修改其他相机的材质行为。
- 捕获及 Bloom 中间目标为 RGBA16F；不支持 HDR 时明确失败，不静默转为 8 位。
- 当前支持默认 WebGL2 ForwardPipeline；不承诺 WebGPU、延迟或第三方自定义管线。
- 输出颜色，不复制深度。resize 自动重建并重新绑定；启用期间不要外部覆盖相机目标。
- 旧 `attachAirBloom` 是 LDR 近似，保持兼容；不要同时把两条链叠到同一相机。

## 与原生 postProcess 设置的区别

原生 `camera.postProcess`、`camera.usePostProcess` 和 `postSettings.toneMappingType` 的历史调查见 [How to use Post Processing](how-to-use-post-processing.md)。该调查不代表新的 AIR 链没有效果；两个入口不应混为同一次验收。

历史文档中“没有用户 fragment shader 入口”“只能无着色器合成”“本篇 N/A”的结论已过期。AIR 新接口使用现有 GFX、RenderTexture 和 ForwardPipeline 命令链，不新增平行播放器或其他引擎依赖。

## 定向验证

CPU 数值及宏作用域回归：`test/smoke/hdr-post-process.test.ts`。真实 Chromium 像素、MSAA、viewport、资源释放与霓虹控件回归：`tools/verify/hdr-post-process.cjs`，写入新的本地尝试目录。它不更新规范示例证据，也不等于全浏览器发布验收。

上一篇：[鼠标拾取](picking.md) ｜ 下一篇：[Shadertoy](shadertoy.md)
