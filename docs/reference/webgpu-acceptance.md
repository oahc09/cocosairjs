# WebGPU 实施与验收范围

2026-10-17：提交前 review 修复补入 CommandBuffer 纹理上传及 compute → upload → blit 顺序合同，资源合同现为 18 项。下述 2026-10-16 的完整矩阵与静态结果为历史快照；合并 main 后的候选须按新版冻结采证流程重新验收，不能继承旧 PASS。真实 Safari 继续保留外部 NOT_RUN，定向回归不代替完整验收。

本机 Gallery 与完整 WebGL 三引擎矩阵的最新刷新、普通 API 的 Linux 采证阻塞及当前发布门禁见 [发布证据刷新](release-gate-refresh.md#2026-10-17本机可执行项刷新)。本次 78 项 browser-matrix 不代签下述 21 场景原生 WebGPU 专项。

2026-10-16：本轮 Windows 桌面专项验收通过。默认 WebGL2、显式 WebGPU、无自动回退；版本仍为 1.0.0，冻结源码仍为 cocos4 4.0.0-alpha.34 / fffd9a514a。Safari 按用户确认保留外部 NOT_RUN；本结论不代表发布 READY。

## 已补齐的实现

- 显式启动、按需 shader 资产加载、错误 cause、设备丢失后停止提交与受控重载。
- stage/binding 布局、mip/layer 附件、MSAA resolve、带步幅/偏移的异步读回、compute/storage 及 compute → draw。
- 新增 indirect compute 与原始 GPU 参数上传；颜色 blit 支持二维区域的 nearest/linear 缩放和选定 mip/layer，保留未覆盖目标像素。
- 修复组合/零写色掩码、MIN/MAX 混合、constant-alpha 与逐 draw 的混合常量快照。WebGPU 无法表达的 RGB constant-color/constant-alpha 混用明确拒绝。
- 深度采样使用 depth-only view 与匹配的不可过滤浮点布局，附件仍保留需要的 depth/stencil aspects。
- 原生 TAA 关闭时恢复相机投影，消除两后端残余 jitter；此共享偏差已登记，custom 导出门禁只允许该文件的固定 SHA，不放宽其他文件。
- builtin 22 effect / 50 shader 由冻结 MIT effect/chunk 重建，统一 CCShadow/CCCSM CPU/shader ABI，保留 Profiler、skybox 等 7 个 pipeline/util 注册入口；WebGPU glTF joints 与冻结 glsl4 的无符号输入一致。
- 修复普通二维颜色上传纹理缺少原生 render-attachment usage，canvas 上传读回进入资源回归。Profiler 的原生 WebGPU 补验确认统计文字实际呈现，初始化至截图零错误；真实文字区域为 947 个有效像素。
- WebGL2 雾效 helper 保留冻结模板的无雾 planar-shadow stage；其他 stage 仍严格校验并注入片元雾，模板缓存与销毁合同通过。

## 实测矩阵（2026-10-16 历史快照）

| 环境                            | 结果                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------- |
| Chrome / Chromium 155.0.8059.40 | 21/21；真实 WebGPU，GPU validation errors=0                                       |
| 系统 Edge 156.0.4314.23         | 21/21；真实 WebGPU，GPU validation errors=0                                       |
| Playwright Firefox 155.0        | 21/21；真实 WebGPU，GPU validation errors=0                                       |
| 独立安装包 dev / min            | 各 21/21；安装后的真实 JS/WASM、类型消费及资产字节通过                            |
| Windows Playwright WebKit 26.5  | 10 项 WebGL2 对照通过；11 项 WebGPU 场景按原生无 API 明确拒绝，原报告仍为 BLOCKED |
| 真实 Safari                     | NOT_RUN；用户已确认保留外部验收                                                   |

另存 glTF 物理材质补验：6 组 WebGL2 探针通过，原生 WebGPU 材质强度 A/B 截图差分为 7,832 个像素，初始化至截图无错误。transmission/volume/dispersion 仍保持现有 WebGL2 capture 的 `device-dependent` 合同，不由本次补验扩大声明。物理材质模板、glsl4 sampler 布局及延迟原生布局修复见 [上游差异](../UPSTREAM.md)。

21 行包括同场景双后端、单阴影/CSM、shader 资产重定位、glTF PBR/骨骼/变形、UI/软遮罩、离屏合成及原生 custom pipeline。17 项 GPU 资源合同全部通过；device lost 与 4 类启动失败分别验收。对照只证明各项合同，不声称全部像素逐字节跨后端相同。

Bloom、FXAA、ColorGrading、HBAO、DOF、FSR、TAA 的开启均产生超过预设门槛的差分，逐效果关闭恢复 maxDelta=0。PNG 差分由验收器独立重算；LUT oracle 同时核对真实彩色输入和输出。骨骼动画的图像形变、单阴影与 CSM 也由原始 PNG 复算。

该历史候选的启动/glTF 回归 56/56、物理材质回归 40/40、雾效 3/3、视频 16/16、D10 4/4、typecheck、dev/min/dts、修改范围格式、file-map、Web-only、物理 WASM 边界、custom 导出、builtin 重编一致性与许可检查通过。静态记录为 19 条真实命令及退出码；许可审计保留无关 spark-rs pending。

## 浏览器配置与证据

Firefox 默认无头不能取得 adapter。正式采集使用有窗口模式，在独立临时 profile 固定 60 Hz 刷新、将页面标为活动并关闭 Windows 窗口遮挡跟踪，避免自动化窗口被覆盖后刷新停滞。WebGL2/WebGPU 使用同一有窗口配置，不启用软件 WebGPU 或修改用户 profile。默认有窗口的原生 GPU 对照单独保留；详见 [环境排查](webgpu-environment.md)。

原始报告、真实命令/退出码、日志、311 张 PNG、采集代码快照和逐文件 SHA-256 在仓库 `docs/evidence/webgpu-release-refresh/`，CPU 检查的实际命令与退出码在 `static/report.json`，Profiler 补验在 `profiler-utility/`。清单绑定 408 个文件，该证据目录不随 npm 分发。旧 `webgpu-backend/`、`webgpu-completion/` 仅保留历史，不改标为当前通过。

验收器返回 desktopScopePassed=true、failures=[]、releaseReady=false。构建 164/165 的完整 browser-matrix 已通过 78/78；Windows WebKit 视频的运行时兼容修复见 [专项记录](webkit-video-loop.md)。全仓 API 183/183、DevTools 5/5、Gallery 303/303 与覆盖率门禁均通过；Safari 仍为外部 NOT_RUN；详见 [全仓刷新记录](release-gate-refresh.md)。

本轮全仓 Jest 为 197/197 套件、3,105/3,105 项通过，测试清单已更新。发布门禁仍 NOT READY，唯一阻塞为用户要求保留的未提交工作区。

## 复跑与写入

```powershell
$env:AIR_CHROMIUM_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
$webgpuRun = 'output/webgpu-completion/run-' + (Get-Date -Format yyyyMMdd-HHmmss)
node tools/verify/webgpu-completion-runner.cjs --out=$webgpuRun
node tools/verify/webgpu-acceptance.cjs --reports=$webgpuRun
```

前置是可解析的 Playwright 及匹配 Firefox/WebKit。runner 不构建、不安装/升级项目依赖、不提交或发布；consumer 会写 build/npm，在独立临时目录打包安装，结束清理。验收器默认只读；仅显式 --archive=<新目录> 时复制通过的证据，归档不能位于输入目录内。

--resume=<旧输出目录> 只复用源码、采集器、完整范围和成功退出码均匹配的记录，并保留 reusedFrom/原时间与报告 SHA；不会把超时或失败改标为成功。本轮最终浏览器和 dev/min 矩阵均为修正采集配置后的新执行，只有原生环境预检复用了相同脚本的有效记录。

builtin 22 个默认效果与 10 个独立 post 效果的生成源、编译器版本/哈希、输出和许可见 vendor/builtin-source/manifest.json。正常构建只核对哈希，不要求 Creator；重编 --write/--check 需要显式配置现有 cocos-cli 与冻结上游。本机编译器不被认证为官方发布工件，也不随包分发。10 个原生 post 资产/布局仅供独立配置与验证，不放入默认运行时或 npm 包，不新增 AIR 管线选项。

## 保留边界

- Safari 外部验收、移动端、其他 GPU、GPU timestamp 性能专项仍未运行。startupAndProbeMs 是启动加探针的墙钟时间，不能当 GPU 帧耗时，不承诺 WebGPU 更快。
- 保留默认 legacy pipeline。原生 custom 通过已有 settings/macro/delegate 显式配置；三方辅助框架、TSL、透明设备恢复、native/小游戏和 transient MSAA 不在范围。
- 直接深度/压缩/多采样读回拒绝；读回要求 TRANSFER_SRC。secondary command buffer、三维/深度 blit 仍明确不支持；整数或压缩纹理的缩放不能伪装成浮点颜色 blit。
- AIR 的 WebGL2 专用高级 helper 保留设备限制。本轮通过不等于每个原生 GFX 组合、每个 glTF 扩展或全部应用工作流已穷举验收。

部署见 [WebGPU 指南](../guides/webgpu.md)。
