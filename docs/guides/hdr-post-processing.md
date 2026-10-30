# Code First HDR 后处理

默认 WebGL2 ForwardPipeline 可以直接使用主入口的 `createAirPostProcess`。它为一台相机提供线性 RGBA16F 场景捕获、多级 Bloom、曝光、色调映射和统一输出，不需要安装其他引擎或手写全屏绘制链。

```ts
import { createAirPostProcess } from 'cocosair.js';

// createAirApp() 之后创建；也可以在 app.run(scene) 之前装配。
const post = createAirPostProcess(camera, {
    levels: 5,
    exposure: 1,
    toneMapping: 'aces',
    bloom: { intensity: 0.6, threshold: 1, softKnee: 0.5, scatter: 0.7 },
});

post.setOptions({ toneMapping: 'reinhard', exposure: 0.8 });
post.setOptions({ bloom: { enabled: false } });
console.log(post.info); // 实际尺寸、层数、采样数、设置和自有资源数
post.dispose(); // 恢复相机原目标；重复调用安全
```

## 图像合同

顺序为：线性 HDR 场景 → 软阈值预过滤与逐级降采样 → tent 上采样合成 → 添加 Bloom → 曝光 → ACES/Reinhard/none → 一次 sRGB 输出。中间目标全部使用 RGBA16F，不提前夹紧到 1。上采样按 scatter 归一混合，增加层数不会直接把所有层亮度相加。

原生 standard/unlit 的输出转换按相机切换到线性 HDR 变体，其他相机保持原有行为。自定义 shader 必须输出线性辐射亮度；发光值可以大于 1。已经做过 sRGB 编码或 tone mapping 的自定义输出无法自动还原，请移除那一次转换。原生光照已经使用相机曝光；这里的 exposure 是后处理增益，避免把同一曝光增益重复设置两次。

`aces` 是 ACES fitted 曲线，`reinhard` 使用 `x/(1+x)`；`none` 仍执行曝光、最终显示范围夹紧和 sRGB 编码。它不是将原生 `postSettings.toneMappingType` 重命名。

## 参数

| 参数              | 默认值   | 合法范围                                    |
| ----------------- | -------- | ------------------------------------------- |
| `levels`          | 5        | 整数 1–8；尺寸到 1×1 后提前停止             |
| `resolutionScale` | 1        | 大于 0，至多 1                              |
| `samples`         | 1        | 1、2、4、8；按设备降级，读取 `info.samples` |
| `exposure`        | 1        | 0–64                                        |
| `toneMapping`     | `'aces'` | `'aces'`、`'reinhard'`、`'none'`            |
| `bloom.enabled`   | true     | boolean                                     |
| `bloom.intensity` | 0.6      | 0–32                                        |
| `bloom.threshold` | 1        | 0–65504，线性 HDR 亮度                      |
| `bloom.softKnee`  | 0.5      | 0–1                                         |
| `bloom.scatter`   | 0.7      | 0–1，控制低分辨率光晕贡献                   |

层数、分辨率比例和采样数是创建选项；其余参数可以用 `setOptions` 原子更新。未知字段、非有限值和越界值报 `AIR_E_POST_PROCESS`。不支持的 HDR 附件明确失败，不静默回落到 LDR。当前不支持 WebGPU 或自定义/延迟管线。

## 生命周期与输出

目标尺寸随原输出窗口变化，支持相机 viewport 和原有 RenderTexture 输出。一个相机只允许一个句柄；启用期间不要改写 `camera.targetTexture`。`setEnabled(false)` 恢复原目标并保留缓冲供再次启用；`dispose()` 释放自有目标、材质、全屏几何和 PSO，销毁相机节点也会触发释放。四个固定 effect 的布局与 shader 缓存按内建资源方式共享保留，不应当把它们视为实例资源泄漏。

统一出口只输出颜色，不把捕获目标的深度复制到原目标；后续相机若依赖前一相机的深度，应另外安排深度共享。`source.readColor()` 用于诊断线性 HDR 捕获值，不是最终显示图，也不证明 compositor 已呈现。不要手动销毁 `source` 或改写其附件。

## 示例和验证

运行开发服务器后打开 [霓虹夜城](../../examples/neon-city/index.html)，可交互切换 Bloom、ACES/Reinhard 和曝光。窗灯与光条直接输出 HDR 值，Bloom 在几何外产生光晕。

CPU 回归：`npx jest --runInBand --runTestsByPath test/smoke/hdr-post-process.test.ts`。

真实浏览器定向回归：`node tools/verify/hdr-post-process.cjs --out=output/hdr-attempt`。可用 `--bundle=output/candidate/cocosair.module.js` 指向候选构建；需要 Playwright、pngjs、esbuild 和匹配浏览器。输出新目录中的原始截图及报告，保留失败尝试；不会更新规范示例证据，不构成全浏览器或发布验收。

## 视觉设计示例：AFTERLIGHT

[AFTERLIGHT](../../examples/afterlight/index.html) 使用单一悬浮光学装置、冷暖光环、暗色核心、原生网格和独立镜像相机展示 HDR。相比密集城市，它通过暗部留白与局部强发光体保留亮度层次；地面倒影来自真实 RGBA16F 镜像捕获。配套 [说明](../../examples/afterlight/README.md) 与 `tools/verify/afterlight-example.cjs` 覆盖控件像素差异、暂停恢复、竖屏和释放。
