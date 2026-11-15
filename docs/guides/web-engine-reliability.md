# Web 渲染能力与 Agent 使用索引

本页对应 2026-11-15 的 WA-01～08 源码工作区；功能入口、产物身份和验收范围分别列出。尚未提交或发布，不能假定已安装的旧 npm 包包含这些改动。默认 WebGL2；WebGPU 必须显式选择，仍为实验后端。

## 按问题选择入口

| 需要解决的问题                         | 入口与产物                                                       | 使用边界与说明                                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 编码后替换纹理、丢失设备、异步读回过期 | 主运行时原生 GFX、`app.contextHealth`                            | [GPU 生命周期](gpu-lifecycle.md)：替换资源延迟回收，不增加全队列等待；丢失后受控失败/重载，不承诺原地恢复。         |
| 颜色、速度和精确对象 ID 多附件         | 主入口 `createAirMRTTarget`、`gfx`                               | [MRT](mrt.md)：管理原生资源组，不自动改造 Forward Camera 输出；整数附件保持整数链路，检查实际采样数。               |
| HDR、Bloom、ACES/Reinhard 与曝光       | 主入口 `createAirPostProcess`                                    | [HDR 后处理](hdr-post-processing.md)：当前限 WebGL2 ForwardPipeline；原生 MRT 支持 WebGPU 不等于后处理链也支持。    |
| Shader 注册身份、引用、可确定布局错误  | 可选 `cocosair.js/shader-preflight`、`cocosair-shader-preflight` | [独立预检](shader-preflight.md)：CPU-only，无 DOM；`unknown` 保留，`passed` 不等于 GPU 编译或画面通过。             |
| GPU 区域计时与提交对应                 | 可选开发工具，不进入主运行时                                     | [GPU 计时](gpu-timing.md)：区分 Pass sum、elapsed span、CPU 提交、等待完成和实际呈现；不自动拦截默认 Forward 管线。 |
| HTML 纹理、交互和尺寸                  | 主入口 `getAirHTMLSourceSupport`、`createAirHTMLSource`          | [HTML 纹理](html-texture.md)：动态/快照/命中能力分别判断；首次 paint、resize 后刷新消费者绑定，源借用纹理。         |
| 首帧、多帧、截图与释放判断             | 仓库定向采集器与保留的原始报告                                   | [画面回归](visual-regression.md)：一个时钟、固定场景、保留失败；GPU 读回与 compositor 截图分别验证。                |

主运行时的直接文件入口是 `build/cocosair.module.js`，类型是 `build/cocosair.module.d.ts`；不额外引入 bootstrap 或 HTML 独立包。独立预检使用自己的 JS/声明/CLI 与构建收据，不导入主引擎。工具源码、采集器和浏览器不因复制 Skills 而自动安装。

## 身份与当前证据

验收必须读取报告中的完成状态、子集标记、错误及指纹，再对照实际文件。版本号相同不代表 JS 内容相同。以下是已保留的候选记录，不是对任意后来构建的默认包作认证：

- MRT 双后端画面候选 JS SHA256：`fd62d073e9fd42a474c7a05dc1453b2504643348bb559959eaeecedd1e98df5b`；map SHA256：`f0ee818d2e9fc95fdb860365730f56d09c11b3f37e0a4a5b0f96204f2d3597cd`。源码收据 SHA256：`fc90d2c7b5b49fb0033b366791ccd50ca9d869b7004e9d5b17e14d1c217a93d4`。报告为 `output/web-engine-absorption/wa07-mrt-compositor-{webgl2,webgpu}/report.json`，1027 项源码绑定匹配，`completed=true`、`subset=true`。该候选包含当时工作区输入，不只本任务的修改。
- 独立预检真实安装消费者 tarball SHA256：`888ca204c38c70794e3c0bae16ca754554060ef75f470102ae0a7face2611059`，报告为 `output/web-engine-absorption/wa05-package-final/report.json`。仅验证该可选入口、类型及 CLI，不认证主 JS 发布副本新鲜性。
- 上述 `output/` 是本地保留证据，不随普通文档或 Skills 分发。完整来源、失败重试、浏览器版本及实际 renderer 见[执行台账](../../ai/ledgers/web-engine-technical-absorption.md)。其他场景各有自己的候选身份，不能串用指纹。

Intel ANGLE D3D11 的 HDR 固定时间重画精确相等仍失败；SwiftShader 显式软件参考配置通过，不能替代硬件门禁。Chrome 157 的 HTML 纹理局部通过，也不能推断普通 Chromium 151、移动端或所有浏览器支持。默认包重新构建、完整 example campaign 和发布验收是独立工作，本次文档更新不执行或补写这些结论。

## 常见静默画面错误的排查顺序

1. 先核对所运行的 JS、声明和资源是否属于目标候选，再确认后端与功能能力；不要从文档存在推断旧包已更新。
2. 保留 Shader 原始错误及编号源码；离线预检排除确定的身份/引用错误，未知项交给实际 GPU 编译与绘制。
3. MRT 核对输出 location/标量类型、附件格式和 sampler；全局 binding 避开公开映射中保留的 UBO 槽，写附件与采样描述符避免反馈。
4. resize 或 HTML 首次 paint 后核对底层 allocation、材质绑定、视图和兼容 PSO；对象引用没变不代表 native 资源没变。
5. 固定时钟分别检查源读回、最终画面和输入实际效果；释放检查 native 对象及所有权，不把共享缓存留存当作泄漏。

## Skills 对应阅读

从 [统一路由](../../skills/cocosair/SKILL.md)进入，按需读取现有主题：rendering 的 render-target / pipeline-reachability、materials-effects 的 custom-glsl、graphics-and-dom 的 html-source，以及 verification 的 report-layers。新说明位于原 reference 的日期补充区；历史正文完整保留，过时条目不再作为当前能力结论。没有新增技能路由或启动第二阶段拆分。

完整 P1 与真实 B1 冷读分别验证保存、路由、分发及冻结文档的回答行为；它们不是新增渲染能力的 GPU 验收，也不是模型收费 token 的实测。最新状态与收据由执行台账记录。
