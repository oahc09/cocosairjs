# C01 Laser Card 镭射卡片

Wave 4 原生三段组合。上游 `dbfd42abe3…`（MIT），母效果 E03/E05/E06；组合语义为本地设计。

## 组合语义（本地冻结）

- **三段原生顺序**：Holographic → Emboss → Sparkle。三相机同 Scene 分 priority（0/1/2），两个中间 rgba8 RT（NEAREST/CLAMP）。
- Stage 1：E03 完整全息 → straight linear → **premultiply RT1**。
- Stage 2：读 RT1 → **安全 un-premultiply** → E05 签名高度/two shadows/UV warp → **premultiply RT2**。
- Stage 3：读 RT2 → un-premultiply → E06 星芒（**读实际 Emboss 内容的颜色和亮度**）→ **一次 OETF** + screen blend。
- **中间不 OETF**。层开关真 identity：holo=off → 中性输入；emboss=off → 直接采样 RT1 并禁用浮雕相机；sparkle=off → display copy（仍一个 pass）。

## 验证面（全部 NOT_RUN 待 Lead 采集）

| 维度        | 内容                                                                   |
| ----------- | ---------------------------------------------------------------------- |
| Build       | strict tsc + esbuild + 三变体 GLSL                                     |
| Runtime     | create/update/resize/pause/resume/destroy/recreate + 可信控件 + 层开关 |
| Visual      | 11 案例×DPR1 + 2×DPR2，PNG+透明底 RT                                   |
| Boundary    | 20 参数（含 time 只读）× 边界                                          |
| Resource    | 100 轮（7 引用）                                                       |
| Performance | 3 profile×3 引擎，三 pass 合同                                         |

### 采集前合同修复（2026-10-10）

Lead 在 Orca Worker 使用限额中止后接管。CPU 与三段 GLSL 均保留完整母效果算法；Emboss warp 采样实际最近邻 Holo 纹素，两次中间 RGBA8 预乘量化逐段纳入 oracle。Sparkle 的网格使用 CSS 坐标，DPR 仅决定 backing；seed 进入真实 uniform。三段之间没有 OETF/EOTF，最终屏幕输出一次 OETF。

关闭 Emboss 后跳过该相机和 RT2 写入，RT2 仍由实例持有并在 release 归还，不宣称关闭层立即减少纹理内存。关闭 Holo 保留可见的中性卡片；关闭 Sparkle 保留最终显示 pass。native 线性诊断使用同一 Cocos 场景/相机及公开 render-target API，没有额外 canvas。

完整三浏览器功能/性能正例与篡改测试是 NODE_CONTRACT 合成合同，不能替代浏览器证据。当前真实浏览器六维、独立 Gallery 与 Agent Gate 仍为 NOT_RUN。
