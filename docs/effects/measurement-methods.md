# 效果性能测量口径

2026-10-09，Wave 1 的采集实现要求；尚不是效果性能实测。
当前源码/SDK 身份见[能力基线](capability-baseline.md)。

## WebGL 2 的提交时机

[WebGL2Queue.submit](../../src/cocos/gfx/webgl2/webgl2-queue.ts) 仅累加命令缓冲的
draw/instance/triangle 统计，执行命令包的调用已经停用。真正的 GL 调用在
[WebGL2CommandBuffer](../../src/cocos/gfx/webgl2/webgl2-command-buffer.ts)
记录 draw、bindStates 等命令时立即发生。因此 `Queue.submit` 的 CPU 时间只能叫
**队列记账时间**，不能叫 GPU 提交时间。

每个性能报告必须保留方法、原始样本、被包装的原生调用及包装恢复状态：

- `cpuUpdateMs`：本效果参数更新的 CPU 区间，包括明确列出的 uniform/resource 更新。
- `cpuEncodingMs`：原生命令调用或 BEFORE_DRAW–AFTER_DRAW 的 CPU 区间。若包含
  GL 状态设置和即时派发，标明这是编码与派发的混合区间，不能宣称纯编码成本。
- `cpuSubmissionMs`：实际 GL draw 调用的 CPU 派发区间，说明只包含哪些 draw 调用，
  不包含哪些状态设置或上传。单独保留 Queue.submit 的记账耗时。
- `frameMs`：原生连续帧回执间隔；AFTER_DRAW 不证明显示器已经 present。
- `gpuTimestamp`：支持时在引擎已有 GL 上下文包围原生绘制的扩展查询；异步读取、
  检查 disjoint，保留有效/失效样本数。不可用须说明实际原因。

`performance.now()` 的精度受浏览器环境限制。原生调用确实发生而计时差为 0 时，
保存原始样本和实际时钟分辨率，说明成本低于可观测精度；不能宣称零成本，也不能
补造正数。若工具采用 COOP/COEP 提高精度，记录实际响应头、隔离状态及该配置，
不能把该配置下的数据泛化为所有网页环境。有效 GPU 查询须关联稳定窗口中的
实际帧，并在删除后用原生 `isQuery` 观测其失效。

同上下文的扩展查询和调用计时属于 `TOOL_DIAGNOSTIC`。包装只调用原函数一次，
保持 `this`、参数、返回值和异常，并在 finally 中恢复；不得创建第二个渲染 canvas、
另行提交 draw 或把诊断接口包装成公开 gfx 能力。CPU 区间与 GPU 查询各自计量；
不得复制同一数组充当两个阶段，不能每帧 gl.finish 人为改变工作负载。

## 采集环境和资源

性能窗口至少覆盖 720p、1080p、移动 DPR，并记录实际 CSS/backing 尺寸、设备和
浏览器版本、预热、窗口、样本及诊断开销。移动浏览器配置不代表实体手机。
独立 Agent 的功能验证可并行，性能窗口由 Lead 排序；采集前其他自有浏览器工作
暂停，避免竞争。无法隔离的主机负载须披露，不宣称机器独占。

draw 统计在原生 present 后读取；材质 passes 数不是全帧 pass 数。记录实际
camera/target/pass 拓扑、原生 draw 统计、明确持有的纹理/缓冲和资产引用。
`memoryStatus` 是引擎记账，VRAM 是含尺寸、格式、采样数和 mip 的估计；二者均
不证明物理 GPU 内存。百轮 create/destroy 须保留实际分配、解绑、归还和稳定
基线，不能用百条零计数或借用资源销毁来补偿。

计时方法和独立 oracle 按[合同](effect-contract.md)验证；性能预算及视觉容差需要
实际 Pilot 支持。当前没有预设 60fps、SSIM 阈值或任何效果已通过的结论。
