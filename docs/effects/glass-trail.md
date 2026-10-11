# C03 Glass Trail 互动玻璃

Wave 4 第三个原生组合。上游 dbfd42abe（MIT），母效果 E08/E09；本地组合设计。

## 组合语义（本地冻结）

- 双段原生顺序：Cursor Trail → RT（premultiplied rgba8）→ Glass → screen（一次 OETF）。
- Trail：E08 完整胶囊链 → straight linear → premultiply RT。
- Glass：读 trail RT → un-premultiply → E09 折射/Vogel blur/色散/fresnel/highlight → 一次 OETF。
- 单次上传/帧；Glass 不再上传轨迹。层开关 identity。

## 当前实现语义（截至最终合同轮）

- **Trail 显式存储量化**：`floor(clamp(vec4(rgb*coverage, coverage),0,1)*255+0.5)/255` —— RGBA8 显式舍入合同（非 dither 假设），小 alpha（1/255）处 1 字节差会被下一段 un-premultiply 放大，CPU oracle 与 ±2 容差不变。
- **单次 512 字节上传**：每正 dt 帧一次 `texSubImage2D`（64×1 RGBA/HALF_FLOAT/level0/offset0），原生 GL 钩子（引擎导入前包装）记录全 256 uint16 原始字节+纹理 id+帧+会话，与 CPU replay 逐字比对。
- **诊断材质一次性**：linearProbe 用一次性临时 Material（blend off/直线性/无 OETF），finally 后组装回执（tempRefs 1→0/renderer 指针恢复/轨迹保持实测）；基类 Material.recompileShaders 为 warn-only，变体切换走全新基 Material+配对退役。
- **性能会话隔离**：startPerformance 在计时窗口前全新会话（新 recorder/清账本/generation++/lifetime 保留）；诊断 Lissajous 由累计实际 dt 重算（phase=Σdt）；GPU 计时不可用时显式空数组+不可用语义；诚实插桩标注（512B trace+命令包装 CPU envelope）。
- **真实分辨率**：性能 profile 冻结 720p/1080p/mobile-dpr(390×844@2)。

## 当前六维验收（2026-10-11）

三浏览器最终功能与九个串行性能窗口均通过，自然 OS exit=0、signal=null，采集前后输入指纹一致。正式结论见 [C03 Gate](../evidence/shaders-absorption/c03-glass-trail-current-gate.json) 和 [固定十三项交付](glass-trail-validation-delivery.md)。

| 维度        | 内容                                                                           |
| ----------- | ------------------------------------------------------------------------------ |
| Build       | PASS：strict tsc、esbuild 与真实 GPU shader 编译                               |
| Runtime     | PASS：可信输入、控件、重建与三次同页 resize                                    |
| Visual      | PASS：39 标准案例，透明 RT 与 compositor 分别验证；合计 48 PNG                 |
| Boundary    | PASS：264 合法边界与 18 非法整批拒绝                                           |
| Resource    | PASS：300 轮、六类引用逐轮 1→0、RT 独立解绑与释放                              |
| Performance | PASS：三 profile×三引擎；每稳态帧至少两个原生 pass/draw，计时窗口无 readPixels |

性能含原生上传与命令追踪开销，是插桩诊断窗口；mobile profile 不是实体设备。独立 Gallery、Agent Gate、长时、多标签页与完整 Wave4 仍 NOT_RUN。SDK 已切换到并行 gfx 修复后的冻结字节，不继承历史 C01/C02 的当前身份 PASS。
