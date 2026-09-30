# Capturing Screenshots 页面截图采集

> 当前支持范围（2026-09-30）：浏览器渲染要求 WebGL 2；WebGL 1 已正式退役。启动不可用时返回 `WEBGL2_REQUIRED`，不会回退到空渲染设备。详见 [支持策略](../webgl2-only.md)。


> 什么时候读画布才有内容、用哪个 API、什么情况下会拿到黑图。结论来自 W03 矩阵实测
> （WebGL2 × DPR {1, 2}，含 resize、暂停、离屏 FBO 相位，
> `docs/evidence/w03-capture.json`），不是推测。

> 前置阅读：[WebGL Compatibility Check WebGL 兼容性检查](./webgl-compatibility-check.md)

## 唯一推荐采集方式

**在 `Director.EVENT_AFTER_DRAW` 回调内，把 WebGL 画布 drawImage 到一张 2D 画布再 `getImageData`/`toDataURL`。** 这是 AIR 像素验收链（v11 示例验证器、Agent Session `captureFrame`）的统一做法：

```ts
import { director, Director } from 'cocosair';

function captureFrame(): Promise<ImageData> {
    const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
    return new Promise((resolve) => {
        director.once(Director.EVENT_AFTER_DRAW, () => {
            const snap = document.createElement('canvas');
            snap.width = canvas.width;
            snap.height = canvas.height;
            const ctx = snap.getContext('2d');
            ctx.drawImage(canvas, 0, 0);
            resolve(ctx.getImageData(0, 0, snap.width, snap.height));
            // 需要 PNG 时：snap.toDataURL('image/png')
        });
    });
}
```

三条实测依据（同帧对照，四模式 `maxDiff=0`、哈希一致）：

| 路径                              | 时机约束                     | 结论                                        |
| -------------------------------- | ---------------------------- | ------------------------------------------- |
| 2D `drawImage` → `getImageData`  | `AFTER_DRAW` 帧内最稳        | **推荐**。与 `readPixels` 逐字节等价，且天然拿到 2D 顶点序 |
| `gl.readPixels`（默认帧缓冲）    | 帧内；帧外依赖 preserve      | 等价但注意 GL 原点在左下（需翻行序）；`bindFramebuffer(null)` 后读 |
| `canvas.toDataURL()`             | 帧内任意时刻                 | 编码为 PNG，验「有图」可以，像素断言用上面两条 |

## 什么时候会黑图（与 AIR 的保障）

- **暂停 / resize 之后、下一帧之前**：规范上呈现后的 drawing buffer 会被清空。AIR 的两个 WebGL
  swapchain 都以 `preserveDrawingBuffer: true` 创建上下文（[UPSTREAM.md](../UPSTREAM.md)
  「preserveDrawingBuffer on both WebGL backends」），因此**帧外读取保留最后一帧**。
  2026-09-28 之前 WebGL2 后端漏配该项：resize/暂停后 `toDataURL`/`readPixels` 恒黑而 WebGL1 正常
  ——W03 矩阵实测捕获并已修复，`tools/verify/capture.cjs` 锁定回归。
- **等待式采集遇到暂停**：`captureFrame` 这类「等下一个 `AFTER_DRAW`」的封装在 `game.pause()` 下
  永远等不到帧，必须以显式超时失败（错误码 `CAPTURE_FAILED`），**不得**把超时静默当作成功。
- **离屏 FBO**：`readPixels` 前先 `bindFramebuffer` 到目标 FBO 并确认 `checkFramebufferStatus ===
  FRAMEBUFFER_COMPLETE`；读默认帧缓冲要绑回 `null`。

## 采集与 DPR

浏览器 `devicePixelRatio` ≠ 实际 framebuffer 倍率。判据只有 `canvas.width / canvas.clientWidth`
（见 [Responsive Design 响应式设计](./responsive.md) §3 的 `__CCDPR_CAP__` 上限合同）。
像素断言一律用 `canvas.width/height` 做坐标系，不要假设 CSS 尺寸。

## API 参考

`director.once(Director.EVENT_AFTER_DRAW, fn)`、`canvas.toDataURL()`、`gl.readPixels()`、
`gl.bindFramebuffer`、`app.contextHealth`（上下文丢失态见
[WebGL Compatibility Check](./webgl-compatibility-check.md)）。以 `build/cocosair.module.d.ts` 为准。

## 下一步

上下文丢失与受控重载：[WebGL Compatibility Check WebGL 兼容性检查](./webgl-compatibility-check.md)。
