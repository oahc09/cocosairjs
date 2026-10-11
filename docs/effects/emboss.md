# E05 Emboss 浮雕

Wave 2 独立原生重实现。参考 shader-effects-inc/shaders@`dbfd42abe3…`（MIT），来源与差异见 [示例 UPSTREAM.md](../../examples/shader-emboss/UPSTREAM.md)。示例：`/examples/shader-emboss/`。

## 原生双相机 RTT 管线

单场景两相机：子相机（priority 0，visibility 1<<21）把 256×256 确定性图案 quad 预乘渲入 `createAirRenderTarget`（rgba8/nearest/CLAMP/透明清屏），`bindColor` 把 RT 颜色纹理绑入浮雕材质采样器；主相机（priority 1）渲浮雕 quad。WebGL2 legacy 相机路径在下一相机采样前 resolve。无额外 canvas/iframe/raw WebGL。

确定性图案（[pattern.frag](../../examples/shader-emboss/src/pattern.frag)）覆盖：不透明左半区（alpha=1）、半透明右半区（alpha=0.5）、alpha=0 隐藏 RGB 圆盘（预乘存储归零，unpremultiply 保护不得产生 NaN 或泄漏）、不透明锚点圆盘、8×8 不对称棋盘+u 向红渐变（UV 方向锚点）、以及 `blank` 全透明模式。

## 采纳的算法语义

- **签名高度平台**：`height = depth·(1−smoothstep(−tw,tw,s))`，tw=0.003；depth<0 凹 / depth>0 凸 / depth=0 精确直通。参考的逆边 `smoothstep(tw,−tw,s)` 改显式有序逆（高度与 inside 两处）。
- **差分法线**：中心+四向 SDF tap（eps=0.003）中央差分 `n=(−dhx,−dhy,1)/‖·‖`；lz=0.7 常数光向的 `(NdotL−lzn)·intensity` 边缘光分解 highlight/edgeShadow。
- **双 tap cast shadow**：沿光向 `spread=|depth|·0.06` 的 50%/100% 两 tap 高度差经宽过渡，`0.55/0.45` 加权；`totalShadow=clamp(edgeShadow+castShadow)·shadowIntensity`。
- **UV warp**：内侧 `1−depth·0.05` 缩放式 parallax（不声称真实几何位移）；远离形状边缘时 dispScale=1；边缘附近仍可能受到法线与 cast shadow 影响，不声称所有 sdf>0 的位置颜色必然直通。
- **预乘逆转**：child 采样为预乘 → `alpha>0.001` 安全 unpremultiply → straight 颜色数学 → straight RGBA 输出；alpha 通道原样透传。半透明区不 double-premultiply、隐藏 RGB 不泄漏，由 oracle 数值证明。
- **颜色格式链**：数学全程 linear（straight 不预clamp）；预览 OETF 片段色先被 RGBA8 定点帧缓冲 clamp 再 SRC_ALPHA 混合再量化；透明底 rgba8 RT 直读 `round(clamp01(x)·255)`。

## 验证面

| 维度        | 内容                                                                                                                                            | 状态              |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Build       | strict tsc + esbuild bundle + 两 effect 三变体编译                                                                                              | PASS（Lead 实测） |
| Runtime     | create/update/resize/pause/resume/destroy/recreate + 可信控件（真实 #release 点击+释放后事件）                                                  | PASS（Lead 实测） |
| Visual      | 11 案例×DPR1 + 2×DPR2（raised/depth-zero/blank-source/light-90/270/shadow-zero 等），PNG+透明底 RT 双证明，alpha 覆盖计划强制三族               | PASS（Lead 实测） |
| Boundary    | 8 参数 × default/min/near-min/max/near-max/invalid + 6 类非法整批拒绝                                                                           | PASS（Lead 实测） |
| Resource    | 100 轮双通道实例（6 引用+RT detach/dispose、内存基线、纹理分配平衡）                                                                            | PASS（Lead 实测） |
| Performance | 720p/1080p/mobileDPR2 三冻结 profile；两遍 RTT 帧合同（≥2 draw/≥2 render pass）；真实 HTTP 隔离+DPR 修复+25000 次时钟标定；须 `--authorization` | PASS（Lead 实测） |

工具：[oracle](../../tools/verify/shaders-emboss-oracle.cjs)（图案纹素/预乘/高度/阴影逐级复算）、[collector](../../tools/verify/shaders-emboss-browser.cjs)（六门/`--verify` 只读）、[performance](../../tools/verify/shaders-emboss-performance.cjs)（两遍帧冻结校验）。

## 审查轮次

首轮真实 Chromium（attempt1）13 视觉 tuple 数学全过，暴露两处采集器/示例接线缺口（相机 detach 回调未消费、resize presentation 残留污染），均已修复并补生产 helper 回归测试；旧报告保留 FAIL 历史。2026-10-10 Lead 新功能 attempt2 与性能 attempt1 已三浏览器通过，[当前六维 Gate](../evidence/shaders-absorption/e05-emboss-current-gate.json) PASS。见[固定十三项交付](emboss-validation-delivery.md)。单独 Gallery 验证与 Agent Gate 仍 NOT_RUN，Wave2 尚缺 E03。

## 支持范围（NOT_SUPPORTED 明确披露）

仅 circle/rounded-box 两个解析 SDF；**不支持**上游 SDF 贴图（`shapeSdfUrl`）、shape JSON 平台、`volumetric` 连续高度路径、center/origin 参数面与编辑器元数据。不声称完整上游 shape 平台。
