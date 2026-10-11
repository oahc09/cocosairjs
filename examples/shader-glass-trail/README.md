# 原生 Glass Trail 互动玻璃（C03）

- 双段：**Trail→RT→Glass→screen**，两相机分 priority，一个 rgba8 中间 RT。
- Trail RT **premultiplied**（线性域，无 OETF）；Glass 读实际内容 un-premultiply → 折射/blur/色散 → **一次 OETF**。
- 单次 points texture 上传/帧；Glass 不再上传轨迹。
- 层开关 identity：glass=off → display copy；trail=off → 透明 identity。

当前语义：Trail 输出显式 RGBA8 舍入（`floor(x*255+.5)/255`）；每正 dt 帧一次 512 字节原生上传（全字 CPU 比对）；probe 一次性诊断材质+finally 后回执；变体切换全新基 Material+配对退役；性能会话隔离+诊断 CPU 轨迹+诚实插桩标注。

验证工具：[采集器](../../tools/verify/shaders-glass-trail-browser.cjs)、[oracle](../../tools/verify/shaders-glass-trail-oracle.cjs)。
完整范围为 Chromium / Firefox / WebKit 的六项验收及 9 个性能窗口；实际结论以与当前输入指纹一致的采集报告和 C03 门禁为准。
独立 Gallery 生命周期验收和 Agent Gate 单独记录，不能由效果采集器的资源循环代替。

来源与 MIT 通知：[UPSTREAM.md](UPSTREAM.md)、[LICENSE.reference.txt](LICENSE.reference.txt)。
