# Thin Film 参考范围

固定上游：shader-effects-inc/shaders `dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a`。逐文件路径与 SHA 见 [UPSTREAM.json](UPSTREAM.json)。保留 [MIT 通知](LICENSE.txt)。

借鉴 `thinFilmShade` 的内侧二次 rim、SDF 梯度法线、方向/厚度相位与 `thinFilmRainbow` 的截断三等分 cosine palette，及 `thinFilmCompose` 的线性 straight RGBA。使用 Cocos 原生材质、网格、相机重新实现；未引入上游 runtime、TypeGPU 或编译代码。

本地仅解析 circle/rounded-box，固定 center/scale/rotation；没有 volumetric/custom palette/color-space interpolation/intensity>1/任意 SDF。`phase` 对应上游 hueShift。`opacity` 是本地扩展。解析梯度取代纹理有限差分；fwidth 仅补充覆盖 AA。显示入口单独应用 sRGB OETF 后 straight-alpha blend 到 display-code-value backdrop，并非上游 screen/linearDodge 组合器。线性核心通过独立 RGBA8 原生 RenderTarget 未混合读回验算。

这是视觉化的 cosine 虹彩模型，不是光谱干涉物理求解器。
