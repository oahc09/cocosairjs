# 当前颜色、透明与斜裁剪对照

2026-10-08，执行渠道Lead。SDK身份固定为任务起始的当前构建。此前[HDR当前复验](../evidence/examples/interactive-engine-improvements/hdr-current-s1-index.json)三浏览器45项通过：sRGB/线性、双解码负例、浮点capture/tone map与离线GGX消费。普通自动mip仅下采样，不能称PMREM；预过滤资产合同合规不证明过滤质量、IBL已认证或解析反射等价环境反射。原私有云端参考仍NOT_RUN。

[Water当前复验](../evidence/examples/interactive-engine-improvements/water-runtime-s1.json)三引擎各39项通过。现有例已经使用AirRenderTarget，并非本批才从旧render-window迁移：RGBA16F/4x resolve、独立反射/折射/深度/焦散、三世界点线性深度、上下标记裁剪、固定状态相同PNG、透明fin source-over和depth-off负例、真实pointer/rain与目标resize/释放重建均实测。不能沿用Oct5旧缺口作为当前结论，历史记录未覆写。

[独立裁剪与透明对照](../evidence/examples/interactive-engine-improvements/color-compare-s2.json.gz)用固定相机、256² RGBA8捕获、时间与无纹理色块；仅复用既有编译JSON绑定声明，在局部例改写GLSL3片段，不改SDK内置effect。原生calculateObliqueMat与片段world-space discard留相同半平面，三浏览器图像逐字节相同，changedPixels=0。近裁剪法线必须把相机放在被排除一侧；首轮法线相反导致远裁剪多截2362像素，[失败诊断摘要](../evidence/examples/interactive-engine-improvements/color-compare-s1-failed-summary.json)与日志保留，完整旧数组可从提交 `5a967c7` 恢复，未放宽预先256 edge-pixel预算。

透明圆形阴影两路径分别为base `Material.initialize({states})`和renderer `getMaterialInstance().overridePipelineStates`。读取原生blendTargets=true、depthWrite=false，256²颜色结果相同；中心约(127,115,0)为红色半透明覆盖绿色背景，周围仍绿，软边可见，不是实心红圆。RGBA alpha合成也记录，不将RGB正确推断alpha预乘合同正确。原始捕获和compositor PNG分开保存；Lead人工查看了Chromium阴影、裁剪和安装时间轴截图。

负例复用已有当前HDR/颜色合同（undefined枚举、重复解码、数据纹理sRGB）与[误用诊断](interactive-diagnostics.md)（base override、函数型EffectAsset、绑定冲突）。函数工厂必须置于纯JSON之外；当前增量只修可选effect-layout，不给运行时新增替身框架。

```powershell
node tools/verify/interactive-water-browser.cjs --out=<new.json>
node tools/verify/interactive-color-compare-browser.cjs --out=<new.json>
node tools/verify/interactive-color-compare-audit.cjs --report=<report.json> --out=<new-audit.json>
```

归档的 S2 报告使用 `.json.gz` 无损压缩，审计命令的 `--report` 也接受该路径；完整 RGBA 数组与 PNG 仍可独立复核。压缩记录见[证据目录说明](../evidence/examples/interactive-engine-improvements/README.md)。

前两条服务既有构建、启动三浏览器，写显式新JSON/相邻截图与原日志，不安装或构建。第三条只读当前来源和真实PNG，克隆篡改写新审计。原参考匹配、实体设备、长期稳定性仍NOT_RUN；这是当前局部对照，不是IER-03全范围或release完成证明。
