# C01 来源与独立组合边界

固定参考：shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a。MIT。完整通知束见 [LICENSE.reference.txt](LICENSE.reference.txt)。

**本例是本地组合设计**，不宣称上游提供相同的镭射卡片预设。

## 母效果参考

| 文件                                                                          | 角色                      |
| ----------------------------------------------------------------------------- | ------------------------- |
| `shaders/Holographic/index.ts`（`ee3a8ea0…`）                                 | E03 全息参数面与色谱      |
| `shaders/Emboss/index.ts`（`ff31f625…`）                                      | E05 浮雕签名高度/差分法线 |
| `shaders/Sparkle/index.ts`（`fb020021…`）                                     | E06 星芒抖动网格/亮度门控 |
| `gpu/kit/effects/emboss.ts`/`std/paint/materials.ts`/`noise.ts`/`lighting.ts` | 共享 helper               |

## 组合语义（本地冻结）

- **三段原生顺序**：Holographic → Emboss → Sparkle。三相机同 Scene 分 priority（0/1/2），两个中间 rgba8 RT（NEAREST/CLAMP）。
- **Stage 1（Holo）**：E03 完整全息（blotch/hue/spectral/grain/flake）→ straight linear → **premultiply 存储 RT1**。
- **Stage 2（Emboss）**：读 RT1 → **安全 un-premultiply** → E05 签名高度/中央差分法线/two shadows/UV warp → **premultiply 存储 RT2**。embossEnabled=off 时直接采样 RT1 并禁用 Emboss 相机，跳过该渲染 pass。
- **Stage 3（Sparkle）**：读 RT2 → un-premultiply → E06 独立 uint hash 抖动网格/亮度门控/星芒（读实际 Emboss 内容的颜色和亮度）→ **一次 OETF** + screen blend。sparkleEnabled=off 时 display copy pass（仍一个 pass）。
- **中间不 OETF**；中间不再次 EOTF linear RT。一次 OETF 仅在最终 screen pass。
- **层开关 identity**：holoEnabled=off 用中性卡片（gray64/96 8×8 棋盘，alpha=1）输入 RT1；embossEnabled=off 绕过浮雕算法与 RT2 写入，主相机直接采样 RT1；sparkleEnabled=off 仅做 OETF display copy。全部关闭 = 中性输入直通 screen。
- **共享**：shape 解析 SDF + 几何域（UV/aspect/pxH）；lightAngle/时间不共享（holo 用 time 驱动色谱，emboss 用 embossLightAngle，sparkle 用 time 驱动 blink）。
- 参数子集：E03 的 roughness/crinkle/sparkle(inline glints)/foilScale/saturation/hueShift + E05 的 depth/lightAngle/shadowIntensity + E06 的 size/intensity/threshold/rayLength/colorize。不复制不存在的 speed/quality；sparkleSeed 为 E06 本地 uint hash 域参数。

## 差异声明

- 本地组合设计，不称上游 Logo/卡片预设。
- E03 保留完整前向 SDF stencil、pillow/皱褶法线、色谱/光照及 grain/flake 链。
- E06 sparkle 的源是 Emboss RT 的实际内容，非 E06 原版固定纹理。

### 采集前合同修复（2026-10-10）

Lead 在 Orca Worker 使用限额中止后接管。CPU 与三段 GLSL 均保留完整母效果算法；Emboss warp 采样实际最近邻 Holo 纹素，两次中间 RGBA8 预乘量化逐段纳入 oracle。Sparkle 的网格使用 CSS 坐标，DPR 仅决定 backing；seed 进入真实 uniform。三段之间没有 OETF/EOTF，最终屏幕输出一次 OETF。

关闭 Emboss 后跳过该相机和 RT2 写入，RT2 仍由实例持有并在 release 归还，不宣称关闭层立即减少纹理内存。关闭 Holo 保留可见的中性卡片；关闭 Sparkle 保留最终显示 pass。native 线性诊断使用同一 Cocos 场景/相机及公开 render-target API，没有额外 canvas。

完整三浏览器功能/性能正例与篡改测试是 NODE_CONTRACT 合成合同，不能替代浏览器证据。当前真实浏览器六维、独立 Gallery 与 Agent Gate 仍为 NOT_RUN。
