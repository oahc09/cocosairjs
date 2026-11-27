# GPU 计时与性能轴

CPU 提交、GPU 执行、GPU 完成等待和屏幕呈现是不同指标。浏览器 rAF 间隔或 headless FPS 不能代替设备实际 present；`readPixels()`、异步 map 或 `onSubmittedWorkDone()` 的等待时间也不是 GPU Pass 执行耗时。

## WebGL2

现有 `tools/verify/performance-axes.cjs` 导出的 `createGpuTimerCollector(gl)` 使用 `EXT_disjoint_timer_query_webgl2` 的 `TIME_ELAPSED`。它只量一个区域经过的 GPU 时间，不声称是各 Pass 时间之和。新增 metadata 是采集方声明的关联信息，不能用手填的提交编号冒充驱动自动追踪。

```js
const token = collector.begin('scene', frame, {
    regionId: 'scene-' + frame,
    submissionIds: [submissionId],
    passIds: ['reflection', 'water'],
});
// Issue actual native GL commands here.
collector.end(token);
// Poll later; do not synchronously wait for a query result.
collector.poll();
const results = collector.snapshot();
```

WebGL2 不支持重叠 elapsed query；内层 begin 返回 `unsupported` token，使用该 token 调用 end 不会结束外层 query。保留原来无 token 的串行 begin/end 用法；新调用方应始终传 token。缺扩展、容量耗尽、disjoint、context loss 或 dispose 不填假 `0ms`。默认最多 64 个未完成 query；丢失后的浏览器 restored 不重新接纳旧 collector。

## WebGPU

`tools/debug/gpu-pass-timer.mjs` 是独立开发工具，不进入默认运行时或 npm 主入口。它提供 `withWebGPUTimingFeature()` 和 `createWebGPUPassTimer()`。

```js
// Import the development tool explicitly from the source checkout.
const app = await withWebGPUTimingFeature(() => createAirApp({ canvas, renderer: 'webgpu' }));
const timer = createWebGPUPassTimer(director.root.device.nativeDevice);
const region = timer.begin({ regionId: 'simulation-and-render', frame: 7 });
const encoder = timer.createCommandEncoder();
// Encode native compute/render passes and intervening copies on this encoder.
timer.end(region);
const submissionId = timer.submit([encoder.finish()]);
await timer.flush();
const report = timer.snapshot();
timer.dispose();
```

工具只观察经过自身 `createCommandEncoder()` 和 `submit()` 的原生命令，不自动截获默认 Forward 管线或普通 GFX CommandBuffer。`frame` 由采集方提供；Pass ID、submit ID 与实际编码和提交关联。嵌套/重叠逻辑区域复用同一组每 Pass 时间戳，不覆盖外层记录。

- `gpuPassSumMs` 累加该区域各 render/compute Pass 的时间差。
- `gpuPassUnionMs` 合并重叠的 Pass 时间区间后计算总时长，排除区间之间的空隙。
- `gpuElapsedSpanMs` 是最早 Pass 起点到最晚 Pass 终点的跨度，包含其间的 copy、队列空档等；首 Pass 前和末 Pass 后的 copy 不包含在内。copy 没有伪造的独立 Pass 耗时。
- 每个结果保留 query 类型、原始纳秒时间戳、区域/Pass/提交关联与结果被 CPU 观察到的时间。浏览器会量化时间戳；短 Pass 的真实差值可以为零，不能用它推出设备无限快。
- 槽位默认 32、可配 1～128，仅在 map 完成且 unmap 后复用；容量耗尽的区域为 unavailable。最多登记 128 个逻辑区域，短范围采集结束后 dispose，再开启下一批。
- `abandon(commandBuffer)` 结束不会提交的测量；设备丢失、map 取消、销毁保持 unavailable 和原始错误。map 失败可能先于 device-lost 通知，不猜测其原因。缺 `timestamp-query` 时原生命令仍能执行，计时结果明确不可用。
- 调用方仍须检查 GPU validation error。有效计时不能替代命令正确性或图像验收。

`withWebGPUTimingFeature()` 仅在回调启动窗口内为支持它的 adapter 追加可选特性，完成或失败后恢复原方法；窗口内不要并行初始化无关 device。默认 AIR 启动不会因此永久开启 profiling。已有 device 没请求此特性时，不能事后启用。

## 定向验证

```bash
node --test tools/verify/performance-axes.test.cjs
node tools/verify/gpu-timing.cjs --renderer=webgl2 --bundle=build/cocosair.module.js --out=output/timing-new-gl
node tools/verify/gpu-timing.cjs --renderer=webgpu --bundle=build/cocosair.module.js --out=output/timing-new-gpu
```

需要匹配的 Playwright/浏览器和源码绑定有效的 SDK；每次写新目录，保留失败尝试。WebGPU 场景验证实际计算值、render→copy 的像素、嵌套区域、槽位复用、缺特性、放弃和真实设备丢失。WebGL2 验证真实 query 与重叠拒绝；CPU 回归覆盖异步顺序、disjoint、容量和丢失状态。

这些是固定序列的计时合同验证，不是场景性能排名、完整多浏览器或 compositor 呈现验收。跨运行比较必须冻结浏览器、GPU、后端、工作负载与时间量化条件。原性能轴脚本运行会写既有证据路径，本任务的局部复验使用上面的新目录探针，不覆盖历史报告。
