# WebGPU 后端与 transient MSAA 独立阶段

本轮交付的是独立可行性记录与实施门槛，不接入新渲染后端。当前默认运行时仍为 WebGL 2；HEADLESS 只用于测试。

## 当前源码依据

- `tools/build/build.cjs` 默认选择 gfx-webgl2/gfx-empty；`src/cc.config.json` 没有可直接选择的 gfx-webgpu feature。
- `src/cocos/gfx/index.ts` 的 Web 导出不接入 WebGPU。
- `src/cocos/webgpu/instantiated.ts` 依赖外部 webgpu_wasm、glslang、twgsl 的 JS/WASM；这些不是当前可用的默认 SDK 部署资产。
- 历史抽取、类型豁免与资产缺口见 [UPSTREAM](../../docs/UPSTREAM.md)；它们不能当作当前后端运行证据。

## 后续实施顺序

| 项 | 交付 | 验收门槛 |
| --- | --- | --- |
| WG-1 资产与许可 | 固定来源、哈希、许可、加载路径与离线部署 | 所有外部运行资产均可再分发、离线装包可定位；不从未授权包复制 |
| WG-2 后端接线 | feature、Device 初始化、异步能力发现及显式 renderer 选择 | 支持/不支持/初始化失败可区分；保留 WebGL2 原有合同 |
| WG-3 shader 与资源 | GLSL 转换或原生 WGSL 策略、材质布局、buffer/texture 生命周期 | Sprite、Graphics、网格、蒙皮、glTF、目标纹理真实出图，销毁无泄漏 |
| WG-4 多通道渲染 | 离屏目标、MSAA resolve、深度、resize、颜色空间 | 下游采样和读回证据、请求/有效格式分开，不以成功启动代替正确像素 |
| WG-5 transient MSAA | 设备能力探测、附件使用合同与 discard | 不支持时明确边界；仅单通道完成后不再读取的 MSAA 附件可 opt-in；禁止后续 load 使用 |
| WG-6 包与浏览器 | 独立 entry、声明、资产包与浏览器矩阵 | 冻结候选后证明真实包消费与匹配源/产物/探针指纹 |

WG-5 依赖 WG-1 至 WG-4，不能以 WebGL invalidateFramebuffer 替代 WebGPU transient attachment。性能比较需相同场景/尺寸/采样数与真实 GPU timer；无可用计量时报告 unavailable，不承诺移动 GPU 带宽收益。

Renderer preference 数组在 WG-2 有多后端可用之后才能设计，不在单一 WebGL2 运行时加入无效 fallback 列表。Canvas 后端也属于另一项独立建设，不与本阶段混用。
