# 验证分区画面与动作采样

CB-17 的可选工具位于 tools/debug/pixel-regions.mjs,不进入默认运行包。measurePixelRegions 接受 RGBA 数据与截图像素矩形;measureCanvasRegions 在 WebGL2 已提交帧后读取画布,自动转换自下向上的行方向。

## litRatio 的实际含义

每个分区先按 4 bit/颜色通道、隔行隔列采样估计背景主色,再计算 RGB 欧氏距离超过阈值(默认 30)的像素占比。它衡量相对于背景的内容,不是绝对亮度:浅色背景上的黑色物体也可能是有效内容。nonBlank 对多个分区取最差占比,不能用一处高亮掩盖其余分区空白。

```js
import { measureCanvasRegions } from '/tools/debug/pixel-regions.mjs';
director.once(Director.EVENT_AFTER_DRAW, () => {
    const regions = measureCanvasRegions(canvas, [
        { x: 0, y: 0, w: canvas.width / 2, h: canvas.height },
        { x: canvas.width / 2, y: 0, w: canvas.width / 2, h: canvas.height },
    ]);
    console.log(regions);
});
```

代码需要已启动的原生 director/Director 和渲染 canvas,以及显式提供该可选工具模块的静态资源路由;生产应用可复制工具或用自有模块路径导入,默认示例服务不保证暴露 tools 目录。不要在任意 evaluate 往返后读取已被浏览器丢弃的默认 framebuffer;独立验收可读取页面截图,并固定浏览器、DPR、画布尺寸及采样时刻。

## 状态与画面必须对齐

- 动作后 sampleWindowMs 是验证器合同的一部分;记录同一模拟时间的实际节点状态与画面。可见页面的 rAF 和手动 step 不得同时驱动时钟。
- 双样本的顺序必须明确:执行action,等待waitMs,采集断言before,再等待sampleWindowMs并采集after。动作前截图/状态另标preAction,不能拿来代替断言before。报告应保存完整的实际断言输入,以便重算表达式。
- motion、regionChange 要比较实际帧,仅累加计数器不构成移动证据。记录分区、像素阈值、时间间隔和摄像机变化。
- 比例差异采用绝对百分点:两者 0.20 与 0.205 相差 0.5 个百分点,不是相对误差 2.5%。CB-17 验收要求差异小于 1 个百分点。
- 填充率应按投影后像素面积估计;粒子数量、世界空间尺寸不能直接推导屏幕占比。

tools/verify/competitive-pixel-regions.mjs 对合成反例与实际 Fox 截图独立调用公开 harness 的 litRatio 复核。外部 harness 路径必须显式传入,不读取 private Reference。结果写 output/competitive-benchmark/pixel-regions.json,不覆写正式发布证据。

CB21的E01回放验证了这个差别:Three/AIR从动作前120分别缩短到约49/57,画面变化通过,但冻结P4检查的是等待500ms后的before到随后300ms的after,实际只缩短3.40/3.04,小于要求的5。诊断只给公开验证器增加断言输入记录,没有修改采样时序、阈值或原失败;不能把这次回放算成新冷启动样本。记录见 `docs/evidence/examples/competitive-benchmark/cost-sampling-diagnostic.json`。
