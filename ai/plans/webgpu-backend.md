# Cocos AIR WebGPU 后端完善方案

2026-10-15：按用户批准的方案实施。固定上游 `4.0.0-alpha.34 / fffd9a514a`，不升级版本。默认 WebGL2，显式 WebGPU；桌面 Web 为正式目标，移动端及自动后端回退不在本轮。

## 支持依据与边界

- Creator 3.8 Web 发布手册提供 Web Desktop 的 WEBGPU 选项，浏览器版本说明属于旧资料，不能替代当前实测：https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/publish-web.html
- Creator 3.8.4 官方发布说明明确 WebGPU 支持：https://forum.cocosengine.org/t/cocos-creator-3-8-4-has-been-released-faster-more-stable-and-easier-to-use/61392
- 冻结源码包含 TypeScript GFX device、draw、dispatch；保留官方限制并显式拒绝不支持的用法。Three.js/PixiJS 仅作资源、绑定布局及 pass 管理参考。
- 不建设新的场景/材质系统、TSL、compute 高层 API、透明设备热恢复、transient MSAA、native/小游戏或 Creator 编辑器工作流。

## 接口与部署

`createAirApp({ canvas, renderer?: 'webgl2' | 'webgpu', webgpu?: { assetBaseUrl?: string } })`。

`renderer` 与旧 `renderMode` 互斥。WebGPU 失败 reject 并保留 cause，不静默回退。公开后端身份读取 `gfxDevice.gfxAPI`。单一主入口包含两后端注册；只有显式 WebGPU 启动才加载独立 shader JS/WASM。默认 URL 相对模块，允许部署重定位。原生 GFX 提供明确 Promise 读回接口，WebGPU 旧同步读回拒绝。设备丢失进入停止提交和受控重载状态。

## 批次与验收

| 批次 | 依赖 | 内容 | 门槛 |
| --- | --- | --- | --- |
| WG-00 | 无 | 官方源码、能力清单、资产版本哈希许可 | 来源可追溯，可离线部署 |
| WG-01 | 00 | feature、类型、构建、声明与历史桥接隔离 | dev/min/dts/typecheck 通过 |
| WG-02 | 01 | 显式启动、错误、canvas、资源清理 | 实际 GPU cube 与默认 WebGL2 通过 |
| WG-03 | 02 | shader 转换、实际绑定/stage、pipeline | 内置材质正确像素且无 validation error |
| WG-04 | 03 | limits/format、buffer/texture/view、上传复制读回 | GPU 数据正确，不支持组合明确拒绝 |
| WG-05 | 04 | 2D/3D、glTF、legacy/custom、多通道、MSAA、颜色 | 必交矩阵逐项通过，官方限制有依据 |
| WG-06 | 04 | 原生 compute、storage、顺序、device lost/销毁 | compute GPU 结果及受控生命周期通过 |
| WG-07 | 05/06 | 包消费、浏览器、文档和证据 | 当前候选指纹一致、必交无未解释失败 |

验证优先复用场景，只为缺失合同增加必要探针。原生 pacer 暂停后通过单步时钟采样；同时检查 compositor 截图、GPU 数据和 validation error。硬件支持与软件 adapter 分开。Firefox、Safari/WebKit 未测不能当通过；自动化 WebKit 不替代真实 Safari。

## 完成标准

等级依次为可启动、功能对齐、可交付；上一级不能替代下一级。缺设备记录 BLOCKED/NOT_RUN，不降低门槛。包体积、CPU/GPU 时间只记录实际测量，不承诺 WebGPU 一定更快。所有引擎偏差登记上游映射，保留并发改动；不提交、不推送、不发布、不改版本号。

当前结果见 [执行台账](../ledgers/webgpu-backend.md)。

## 2026-10-16 收尾范围

本机验收明确为 21 行×浏览器/安装包矩阵、16 项资源合同及七项原生 post 开关/恢复，新增 indirect compute、过滤颜色 blit 和混合状态修复。Firefox 环境按实际采集 profile 披露；Windows WebKit 无 API 不改标为渲染 PASS。用户确认没有 Mac，Safari 保留外部验收。Windows 专项通过不替代脏工作区、API/Gallery/browser-matrix 的发布链，也不授权提交、发布或版本变更。
