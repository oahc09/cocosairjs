# C03 来源与独立组合边界

固定参考：shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a。MIT。完整通知束见 [LICENSE.reference.txt](LICENSE.reference.txt)。

**本地组合设计**，不称上游预设。

## 母效果参考

| 文件（packages/core/src/）     | SHA-256 前 16 位    |
| ------------------------------ | ------------------- |
| `shaders/CursorTrail/index.ts` | `1cfdb60b981438b8…` |
| `shaders/Glass/index.ts`       | `964f8b456050a05e…` |
| `gpu/kit/effects/glass.ts`     | `180cb03fa5871263…` |
| `gpu/kit/blur.ts`              | `341117aeba293c0d…` |
| `gpu/kit/blend.ts`             | `0c5156d535da07f0…` |
| `gpu/kit/host/pointer.ts`      | `bed3a363bd0a368e…` |
| `gpu/kit/agents.ts`            | `0dc5f7aeb5b50e88…` |
| `std/paint/materials.ts`       | `7cb6e03cf96c26cd…` |

## 组合语义（本地冻结）

- **双段原生顺序**：Cursor Trail → RT（premultiplied rgba8）→ Glass → screen（一次 OETF）。
- Trail：E08 完整胶囊链（64×1 rgba16f points texture、5-tap diamond stencil、quadratic Bézier spine、min-union SDF、age-weighted blend）→ straight linear → premultiply RT → **显式 RGBA8 舍入**（`floor(clamp(premul,0,1)*255+0.5)/255`，本地存储合同，非上游行为）。
- Glass：读 trail RT → 安全 un-premultiply → E09 折射/内变焦/Vogel 模糊/色散/fresnel/highlight → 一次 OETF。
- **单次上传**：每模拟帧最多一次 points texture 上传；Glass 不再上传/生成轨迹。
- 层开关：glass=off → trail passthrough display copy（仍一 pass）；trail=off → 透明 identity（Glass 读到全零 RT）。

## 差异声明

- 本地组合设计。
- E09 Glass 完整链（field/eps .01/lensUV/9 固定 Vogel taps/aberration/composite，一次 OETF）。
- 固定母参数（highlightSoftness/fresnelSoftness/tint 系列）来自本地冻结模块 `src/glass-defaults.ts`（取 E09 parameters.json 同值），无跨示例运行时 fetch。
- trail recorder 直接复用 E08 代码（shared recorder.ts 副本，非 import）。
