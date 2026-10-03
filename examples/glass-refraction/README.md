# A Study in Facets and Light

96 面原创晶体以自包含 glTF 数据交给 `GLTFLoader.parseAsync()`，产物是原生 Node/Mesh/Material。`AirTransmissionCapture` 捕获真实背景，物理 effect 通过 transmission、volume、IOR 与 dispersion 渲染折射和色散；不是黑色透明球或彩虹贴图。

```powershell
npm run dev -- --example glass-refraction
```

- 五个色样改变实际 Beer–Lambert 吸收色。
- 双击取景相机用 900ms smoothstep 从距离 10 推至 5.5，再双击返回 10；没有改 CSS/视口比例。
- IOR、transmission、dispersion 控件写入真实材质 uniform。
- Export PNG 在实际渲染后读取当前画布，触发浏览器下载；计数在生成下载链接并触发后递增。
- Reset 恢复初始参数、颜色、相机和下载计数；原生节点自转继续运行。

背景是原创中性色条几何，没有烘焙彩虹；彩色边缘由 RGB 不同 IOR 的折射采样产生。主、辅、轮廓三盏 SpotLight 使用真实原生附加灯 pass；OPAQUE 的 glTF alpha 与 transmission 独立，forward-add 保留加法混合且不重复采样场景色。

本场景使用当前屏幕空间场景色折射实现。它不等于多次穿透实体的光线追踪；屏外内容或深层内部反射不在该路径范围。

`window.__bench` 对齐公开冻结 E09 的全部状态与 Reset 合同。规范原字节保存在 `assets/benchmark-spec.json`，SHA-256 与来源记录在 `example.json.benchmarkOrigin`。`window.__lifecycle()` 释放并重建 glTF 实例、共享资产和 capture 纹理；舞台与灯光是持续场景资源。

```powershell
# NODE_PATH 指向已有 Playwright/pngjs 工具环境。
node tools/verify/competitive-scenes-browser.cjs --scene=glass-refraction --browser=chromium
```

验收独立观测两次真实 PNG 下载（>10KB、分辨率匹配）、相机往返与切面运动，并冻结旋转后分别比较 IOR/transmission/dispersion 和三盏灯的实际像素。输出 PNG、WebM、状态与候选指纹到 `output/playwright/`，不修改 canonical evidence。只有状态字段变化不能算画面验收通过。

行为/帧率执行与独立 P1/P2 录像重放分开记录，避免把视频编码开销计入引擎帧率；报告明确标识两次执行，不伪称同一次录像全绿。WebKit 全程录像的帧率失败结果保留在本地 `output/playwright/glass-refraction-webkit-recording-overhead.json`。fps 与导出期间帧间隔只代表实际 render-loop 时间，不代表 GPU 或 display-present 轴。

晶体、底座与背景全部原创程序化资源，无第三方模型或纹理依赖。

## 本批验证

Chromium、Firefox、WebKit 各 27/27，代码/规范/验证器指纹一致，零 console error。候选 SHA-256 为 `572f0a41fc0ac115e566f9596957d81137e26015d2838017624e8dfdbfd2b3f4`。报告分别记录主行为/性能执行与独立视频重放，不将两次运行拼成一次。

Chromium 自包含嵌套静态产物也通过 27/27：`node tools/verify/competitive-scenes-browser.cjs --static`。独立 strict `spec-validate` 对两例为 2/2 frozen、零问题，独立 TS 检查与格式检查通过；Gallery、正典证据注册仍由集成步骤完成。
