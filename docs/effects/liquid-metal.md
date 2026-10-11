# E07 Liquid Metal 液态金属

Wave 3 独立原生单通道重实现。参考 shader-effects-inc/shaders@`dbfd42abe3…`（MIT；MaterialX/OSL 第三方条款随通知束保留），来源与差异见 [示例 UPSTREAM.md](../../examples/shader-liquid-metal/UPSTREAM.md)。示例：`/examples/shader-liquid-metal/`。**Liquid Metal 是视觉材质，不是流体模拟。**

## 采纳的算法语义

- **场与倒角法线**：前向场 stencil eps=0.01（geometricNormal 默认）；`sdf=s0/scale`；`rimT=clamp(−sdf/max(bevelWidth,0.003))`；`bevelSin`（round `1−t` / machined 0.72 台阶混合，k1=smoothstep(0,0.14)、k2=smoothstep(0.68,0.92)）→ `bevelledFlatNormal`（sB≤0.9995、`z=−sqrt(1−sB²)`）。bevel.ts 原文由本 Worker 从 pinned commit 真实 HTTP 200 获取（`8edd2b2b…`，receipt 伴随）。
- **流动浮雕**：`freq=ripple·2.6`、`flowT=t·0.12`；`flowWarpOffset` 双 sin·cos 积域扭曲（1.7/0.7/1.7、1.3/0.5/2.3、1.4/0.9/8.7、1.6/0.6/5.1）×`warp·0.9`；斜率增益 0.62 钳 ±4 ×`turbulence·0.5` 取负折入法线（nudgeNormal 语义）。
- **噪声替代（关键声明）**：上游浮雕读 `perlin12d` → hash22 = **Fi-hash 家族**（floatBitsToUint 格点散列，许可未明）——不采用；替代为已验证 MIT 的 MaterialX perlin（lookup3 u32 散列）+ 中心差分（eps=0.1）。**同类替代非等价**：分布/相位与上游不同。
- **反射与程序影棚**：透视视线 fov 0.6 `normalize((u−0.5)·aspect·0.6, (v−0.5)·0.6, 1)` 及其镜像；LiquidMetal 自有三柔光灯影棚（overhead 0,0.55 r×1.05 增益 1.75 / lower-left −0.45,−0.4 r×1.25 ×1.15 / right 0.55,0.1 r×1.15 ×1.1；`keyRad=mix(0.5,0.18,sharp)`；`drift=sin(t·0.07)·0.05`；env 旋转；sky²·0.4）；柔光灯边缘逆 smoothstep 改显式有序逆。
- **镜面与色散**：主光 elevation −0.7，`sharpGlint=pow(ndh,mix(60,900,sharp))·mix(0.4,1.4,sharp)`；desktop 色散 `dth=dispersion·0.09·(0.4+grazeD·1.3)` 旋转 B 通道影棚求值，`R=2G−B`。
- **质量档位（真实算力差）**：`low`=RGB 共享 1 次影棚求值（3 灯距求值）；`high`=2 次求值（6 灯距）+色散旋转。uniform 分支，每次 set 立即生效；上游为构建期设备分支——本例改为显式参数，为记录的差异。
- **金属 ramp**：`mix(dark,light,clamp(lum,0,1.8))`，#141414→#eef0f6 线性解码。
- **轮廓与 guard**：E03 已验证上游 silhouetteAlpha 精确链；两像素外 `sdf>2·pxH` 精确 vec4(0)。
- **动画时间**：时钟累计绝对时间，uniform 读 time×当前 speed——与上游 Σ(dt·speed) 仅 speed 恒定时等价；speed 变更重映射相位。seed 本地扩展（噪声域偏移 `seed·13.37`，0=基准域）。

## 验证面

| 维度        | 内容                                                                                                           | 状态         |
| ----------- | -------------------------------------------------------------------------------------------------------------- | ------------ |
| Build       | strict tsc + esbuild bundle + 三变体 GLSL + 生成器元数据语义测试                                               | 待 Lead 采集 |
| Runtime     | create/update/resize/pause/resume/destroy/recreate + 可信控件（真实 #release）                                 | 待 Lead 采集 |
| Visual      | 11 案例×DPR1 + 2×DPR2（turbulence/warp/quality/dispersion/env-rotation/bevel/seed 家族），PNG+透明底 RT 双证明 | 待 Lead 采集 |
| Boundary    | 17 参数 × default/min/near-min/max/near-max/invalid（94 例）+ 6 类非法整批拒绝                                 | 待 Lead 采集 |
| Resource    | 100 轮单通道实例（3 引用、内存基线）                                                                           | 待 Lead 采集 |
| Performance | 720p/1080p/mobileDPR2 × 3 引擎；单遍合同；真实 HTTP 隔离+DPR 修复+25000 时钟；须 `--authorization`             | 待 Lead 采集 |

工具：[oracle](../../tools/verify/shaders-liquid-metal-oracle.cjs)（helper/studio/quality 分层复算）、[collector](../../tools/verify/shaders-liquid-metal-browser.cjs)（六门/`--verify` 只读/temporal 数据裁定）、[performance](../../tools/verify/shaders-liquid-metal-performance.cjs)（单遍冻结校验）。

## 支持范围（NOT_SUPPORTED 明确披露）

仅 circle/rounded-box；sphere3D/volumetric/SDF 贴图/shape JSON 平台/center-origin 参数面未实现。浮雕噪声为 mx perlin 替代（Fi-hash 许可未明），同类非等价。

2026-10-10 后续验收：[六维固定十三项交付](liquid-metal-validation-delivery.md)与[当前Gate](../evidence/shaders-absorption/e07-liquid-metal-current-gate.json)已PASS。上表“待Lead采集”为实施阶段历史时点；当前39标准视觉、282边界、300资源轮、3同页resize及18双质量性能窗口均实测。Wave3整体与Agent Gate仍未通过。
