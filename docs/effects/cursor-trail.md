# Cursor Trail（E08）算法与原生接线

2026-10-10：[六维当前 Gate](../evidence/shaders-absorption/e08-cursor-trail-current-gate-r2.json)在冻结子集内 PASS。[十三项交付](cursor-trail-validation-delivery.md)记录实测范围。完整Wave3见[汇总交付](wave3-validation-delivery.md)；Agent Gate未通过。

## CPU 记录器与数据纹理

[记录器](../../examples/shader-cursor-trail/src/recorder.ts)维护最多63个提交点，保留第64槽作为关联头副本。UV从真实Canvas CSS rect转换，Y翻转为v-up。首个可信指针观测建立起点；Reset/Escape推进代次，清除速度和历史状态，避免从画布中心瞬移连线。

速度平滑系数0.2，宽度为sqrt(speed/1.5)并钳到0.2–1；间距考虑aspect，Chaikin松弛为0.25/0.5/0.25。跟踪dt上限0.1秒，年龄dt上限0.25秒，按寿命最旧优先清除。x/y/age/signed-width打包为64×1 RGBA16F，负宽度标记新段，上传512字节；无活点时清除一次而非不断上传空数据。

独立JS oracle从固定上游算法另写，不解析或执行生产TS。每步原始pointer、dt、参数、帧、代次与半精度bits全部保存，逐步重算后再与实际upload receipt、GPU和PNG交叉验证。

## 原生片元扫描

[着色器](../../examples/shader-cursor-trail/src/trail.frag)在原生Material单quad内读取纹素；各关节中点形成二次Bézier，每段分为三子弦。距离为投影到子弦的距离减线性插值半径，以min构成union，年龄按指数深度权重混合。它不是精确的变半径圆锥SDF，也不采用上游头注释所说的“最新覆盖段硬胜出”；实际参考函数执行的是深度加权。

柔边宽度为1.5 backing像素加半径相关softness，年龄0.8–1渐隐。仅支持两个线性RGB颜色端点。预览一次OETF后在RGBA8上alpha混合；透明诊断RT记录straight linear量化输出。两条链独立复算，±2码值不放宽；没有第二渲染Canvas、TypeGPU或上游runtime。

## 输入、生命周期与边界

普通查看走原生Component.update/pacer；采集仅一个step clock。真实鼠标和浏览器协议21次可信触摸tap分别记录；触摸走primary PointerEvent，旧式TouchEvent未收到，实体滑动/设备测试未执行。诊断脚本和性能轨迹不能标作可信用户输入。

四份自有引用mesh/material/effect/pointsTexture各持一份；renderer和sampler先解绑，再销毁节点、移除EffectAsset注册、decRef并观察失效。释放Promise精确幂等，终态拒TRAIL_DISPOSED。300轮实测1→0与引擎内存登记回基线；借用引擎缓存不销毁，物理显存不可测。独立Gallery harness仍NOT_RUN。

## 实测与限制

三引擎36标准视觉及透明RT、45PNG、84参数边界、18非法整批拒绝、3同页resize、鼠标/触摸各3例、300资源轮与9性能窗口通过。性能稳态每帧64个texel、512字节上传，原生pass/draw实存，无计时内readPixels。该成本不是空场景或单点模型；GPU时间仅Chromium可测，完整数值见Gate。

支持范围、来源与许可证见[UPSTREAM](../../examples/shader-cursor-trail/UPSTREAM.md)。多色stops/其它颜色空间、实体触屏、长时、多标签页、独立Agent Benchmark尚未验证。没有确证的新ENGINE_BUG，也没有因此扩充公共API。
