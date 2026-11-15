# 显式使用 WebGPU

WebGPU 实验后端已接入。默认仍为 WebGL2；支持声明以当前 GPU 验收矩阵为准，不能将源码存在或启动成功视为功能对齐和发布就绪。

```ts
import { createAirApp, gfx, director } from 'cocosair.js';
const app = await createAirApp({ canvas: '#GameCanvas', renderer: 'webgpu' });
console.log(director.root!.device.gfxAPI === gfx.API.WEBGPU);
```

`renderer` 与旧 `renderMode` 互斥。不提供 renderer 时保持默认 WebGL2。显式 WebGPU 失败会 reject，不自动换后端。历史数值 HEADLESS 仅供测试使用。

## 离线部署

主 JS、相邻 `webgpu/` 目录及其中的 glslang/twgsl JS/WASM、manifest 和许可证一并部署。`npm run build` 与 `build:min` 将 `vendor/webgpu/` 的冻结资产复制到 `build/webgpu/`；`prepack` 将其复制到 `build/npm/webgpu/`。无需外部 CDN，不在 WebGL2 启动时下载或实例化这些资产。

可重定位 shader 资产：

```ts
const app = await createAirApp({
    canvas: '#GameCanvas',
    renderer: 'webgpu',
    webgpu: { assetBaseUrl: '/static/cocos-shaders/' },
});
```

资产 URL 以文档 baseURI 解析，目录末尾可省略斜线。服务器应提供 JS 模块 MIME、`application/wasm`，跨域部署需正确 CORS。CSP 应允许对应模块及 WASM 编译；不会通过 eval 绕过策略。页面必须具备浏览器允许的 WebGPU 安全上下文条件。

资产来自 Cocos 冻结外部包 `v4.0.0-9` 的 commit `11dde1bdc5af95b0227cbe8cc29340f4b757aea9`。许可证和具体文件哈希见随包 manifest；这是固定发行字节，未声称从源码本地重建或确认其编译器子模块版本。TWGSL 许可依据为 Babylon.js 官方 NOTICE，Dawn/Tint 和 glslang 许可原文一同保留。

## 错误与生命周期

- `WEBGPU_UNSUPPORTED`：环境未提供 WebGPU。
- `WEBGPU_ADAPTER_UNAVAILABLE`：requestAdapter 返回 null。
- `WEBGPU_DEVICE_REQUEST_FAILED`：设备能力协商或创建失败，cause 保留原错误。
- `WEBGPU_DEVICE_LOST`：初始化期间设备丢失或关闭；异步 shader translator 加载完成后也会重新检查，不返回失效的应用实例。
- `WEBGPU_SHADER_ASSETS_FAILED`：JS/WASM 加载、实例化或导出不正确。
- `WEBGPU_CANVAS_FAILED`：无法取得目标画布的 WebGPU context。
- shader 转换错误保留 shader 名称、stage 和 cause；GPU validation error 仍属于失败。

初始化失败为本页终态；清理本轮资源后重载页面再试。不得假设已经取得 WebGPU context 的同一 canvas 可以切换为 WebGL2。设备丢失会停止提交，健康状态进入 failed，使用已有 `contextHealth.requestReload()` 受控重载，不承诺透明重建业务资源。

异步加载的 AbortSignal、session token 与场景私有模型释放示例见 [GPU 生命周期与会话所有权](gpu-lifecycle.md)。

## 读取 GPU 纹理

```ts
await director.root!.device.copyTextureToBuffersAsync(texture, buffers, regions);
```

WebGPU 不允许用旧同步读回入口伪装完成：它会抛出 `WEBGPU_ASYNC_READBACK_REQUIRED`。当前异步路径支持单采样、非压缩颜色纹理，处理 GPU 行对齐、buffer 子视图、步幅、mip/layer。深度、压缩和多采样纹理读回明确拒绝；先 resolve 到可读颜色目标。

同一次调用的全部 region 在等待映射前一起提交，读回过程中 resize 不会混合新旧纹理内容。所有 staging 映射完成且所属设备、源纹理/view 仍有效后才写目标缓冲；native device 丢失或关闭时以 `WEBGPU_DEVICE_LOST` 拒绝，保留底层 cause，源纹理/view 已释放则报 `WEBGPU_READBACK_TEXTURE_DESTROYED`，两者均不交付部分结果。失效设备上的资源创建、上传及新读回也会明确拒绝。`app.close()` 保留共享 GFX 设备，其会话自有源纹理释放会取消相应读回。

如果 native 映射取消早于 device-lost 通知，读回返回 `WEBGPU_READBACK_ABORTED` 并保留原始 AbortError 为 cause；同样不写目标缓冲且释放 staging。[WebGPU promise ordering](https://www.w3.org/TR/webgpu/#promise-ordering) 不保证 mapAsync 与 device.lost 的结算先后，应用应结合 contextHealth 处理设备级终态，不能把较早收到的取消误当成成功或强行判为设备丢失。

## 验证与边界

```bash
node tools/build/webgpu-assets.cjs --check
node tools/verify/webgpu-backend.cjs
node tools/verify/webgpu-backend.cjs --examples --custom
```

浏览器命令需要已配置的 Playwright 和匹配浏览器，写 `output/webgpu-backend/`。探针暂停原生时钟并单步采样，保存截图、真实 backend、GPU validation errors 和资源结果；完整 Windows 矩阵及默认只读的验收入口见 [环境与复跑](../reference/webgpu-environment.md)。

二维颜色 blit 支持 nearest/linear 缩放与区域更新，同尺寸同格式且具备 transfer usage 时走 copy；深度、三维和不支持的过滤组合明确拒绝。移动端、自动后端回退、透明设备恢复、transient MSAA 优化不在本轮。AIR 原有 WebGL2 专用高级 helper 仍按其自身设备合同判断，不因引入后端就自动扩大兼容声明。

当前实现、验证范围和复跑入口见 [验收说明](../reference/webgpu-acceptance.md)。

多颜色附件、整数输出及 MSAA 格式边界见 [MRT 指南](mrt.md)；浮点多采样通过不能代替整数采样组合的验收。
