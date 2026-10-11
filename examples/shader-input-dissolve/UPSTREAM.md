# C04 来源与独立组合边界

固定参考：shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a。MIT。noise 实现含 MaterialX/OSL（BSD-3-Clause）谱系，见 [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt)。

**本地组合设计**，不称上游预设。

## 母效果参考

| 文件（packages/core/src/）       | SHA-256 前 16 位    |
| -------------------------------- | ------------------- |
| `shaders/NoiseDissolve/index.ts` | `62d834b345677b1b…` |
| `std/effects/reveal.ts`          | `665852eca6336c3d…` |
| `std/paint/materials.ts`         | `7cb6e03cf96c26cd…` |

## 组合语义（本地冻结）

- **三路线任意输入**：image = 真实本地 PNG（原生 Texture2D 上传）；procedural = 原生着色器程序内容渲染到 RT；rendered = 真实 Scene/Camera/MeshRenderer 渲到 RT（attachCamera+bindColor）。
- NoiseDissolve：MaterialX/OSL Perlin 3-octave fbm coverage（aspect 感知+seed 偏移）+ reveal 掩码（progress/softness/invert）；**只缩放 alpha**，RGB 保持。
- 端点：progress≤0 精确 identity；progress≥1 精确透明；dissolveEnabled=off 真实输入直通。
- 存储：premultiplied rgba8 量化往返；逆预乘 alpha>0 即除（1/255 保留、其下隐藏 RGB 为存储真实丢失）；一次 OETF；禁用路径同样线性经过诊断分支。
- pass 合同：image 1；procedural/rendered 2。

## 差异声明

- 本地组合设计；三路线输入与组合链为本地冻结合同。
- CPU oracle 独立重写母数学（uint32 语义 JS），不解析 GLSL。
