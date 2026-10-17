# WebGPU 浏览器环境与采集配置

2026-10-16：Firefox 的本机 WebGPU 阻塞来自无头运行配置；默认有窗口配置能取得非 fallback adapter，原生纹理读回通过。Windows Playwright WebKit 在有/无窗口模式均未提供 `navigator.gpu`。用户已确认目前无 Mac，Safari 保留外部验收项。

## Firefox

原生探针不加载 AIR，只创建 WebGPU device、清屏、复制并读回像素。对同一 Firefox 二进制的实测为：

| 配置                        | API / adapter               | 原生结果                                            |
| --------------------------- | --------------------------- | --------------------------------------------------- |
| 默认无头                    | 有 API，adapter=null        | 不具备 WebGPU 渲染条件                              |
| 默认有窗口                  | 有 API、非 fallback adapter | BGRA 读回 `[191,127,64,255]`，validation error=null |
| 无头，仅开启 GPU 进程首选项 | adapter 仍为 null           | 不能将强制开关视为支持证明                          |

Mozilla 的默认配置中，Windows 不允许 WebGPU 在父进程运行，GPU 进程也默认不允许无头运行；参见 [StaticPrefList.yaml](https://raw.githubusercontent.com/mozilla-firefox/firefox/main/modules/libpref/init/StaticPrefList.yaml) 中的 `dom.webgpu.allow-in-parent`、`layers.gpu-process.allow-headless`。这与本机对比结果一致，不表示打开一个首选项就一定能取得 adapter。

有窗口自动化窗口被遮挡后，刷新等待曾达到约 50 秒，WebGL2 的 GPU 读回与截图也曾不一致。仅固定刷新率不足，关闭 Windows 窗口遮挡跟踪后，原来卡住的 UI 场景约 2.7 秒完成采样，WebGL2 有窗口对照也通过。正式采集显式使用 `--headed --firefox-fixed-refresh`，临时 profile 记录以下配置：

- `layout.frame_rate=60`；
- `layout.testing.top-level-always-active=true`；
- `widget.windows.window_occlusion_tracking.enabled=false`。

这些是刷新/自动化配置，未强制启用 WebGPU、未改用软件 adapter，也未改变用户的 Firefox 设置。官方 [默认配置源码](https://raw.githubusercontent.com/mozilla-firefox/firefox/main/modules/libpref/init/StaticPrefList.yaml) 分别描述了刷新率、自动化 always-active 与 Windows 遮挡跟踪。最终 WebGL2/WebGPU 均使用同一有窗口 profile；原始默认配置预检与失败尝试另行保留。

## Windows WebKit 与 Safari

本机 Windows WebKit 在有/无窗口模式都没有 WebGPU API。官方 [WebKitFeatures.cmake](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/cmake/WebKitFeatures.cmake) 默认关闭 `ENABLE_WEBGPU`，[Windows 端口配置](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/cmake/OptionsWin.cmake) 没有启用它。结合本机原生探针，应归类为当前端口/构建能力边界，而不是 AIR 初始化错误；不修改脚本去模拟该 API。

这不代表 Safari 不支持 WebGPU：[Safari 26.0 的官方说明](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)列出了 WebGPU。Windows WebKit 的拒绝合同和 WebGL2 对照不能替代 macOS Safari 的真实 WebGPU 验收。Safari 继续保留 `NOT_RUN`。

## 可复跑命令

要求已配置的 Playwright 模块目录、匹配的 Firefox/WebKit 二进制，以及可用的 Chromium/Edge。`AIR_CHROMIUM_PATH` 可显式指定现有 Chromium 浏览器；本轮使用已安装 Chrome，避免依赖已被清理的旧浏览器缓存。不升级项目或浏览器版本。

```powershell
$env:AIR_CHROMIUM_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
$webgpuRun = 'output/webgpu-completion/run-' + (Get-Date -Format yyyyMMdd-HHmmss)
node tools/verify/webgpu-completion-runner.cjs --out=$webgpuRun
node tools/verify/webgpu-acceptance.cjs --reports=$webgpuRun
```

runner 只接受新输出目录；先运行原生环境对照，再采集浏览器矩阵及独立安装包 dev/min，记录真实命令、开始/结束时间、退出码和超时。它不构建、不提交、不发布；consumer 会更新 `build/npm/`，在独立临时目录打包安装并清理本轮临时文件。

验收器默认只读，核对当前源码、JS/map、独立 shader 资产、完整行集、实际 backend/profile、GPU errors、设备丢失合同、17 项资源结果（含普通上传纹理的 canvas 图像拷贝），并从 PNG 重算阴影、蒙皮和七效果的开启/恢复及 LUT 颜色结果。只有通过时，`--archive=<新目录>` 才会复制原始报告、日志、PNG、采集源码与 SHA-256 清单；不修改旧证据的指纹。

采集器等待入口模块的 top-level await 完成后再暂停 pacer，手动步进，并确认等待浏览器呈现时引擎帧计数未增长。首轮暴露的模型未就绪/时钟恢复及 Firefox 截图失败记录保留在 `output/webgpu-completion/`，不能当作通过证据。
