# C03 Glass Trail 固定十三项交付

## 1. Goal

C03 是 Cursor Trail → 中间 RT → Glass 的 CocosAirJS 原生组合，使用真实鼠标轨迹与独立组合数学验证。它是本地组合设计，不称上游预设。最终六项状态以 [当前源码 C03 Gate](../evidence/shaders-absorption/c03-glass-trail-current-sdk-gate.json) 为准；[先前 Gate](../evidence/shaders-absorption/c03-glass-trail-current-gate.json)保留为历史。完整 Wave4 的当前前置身份、独立 Gallery 与 Agent Gate 单独记录。

## 2. Upstream references

固定 `shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a`，母效果 E08 CursorTrail / E09 Glass 和六个 helper 共八个参考文件，绑定完整 SHA-256 和字节数。MIT 通知随例保留。未执行上游 runtime 或 TypeGPU，详见 [来源](../../examples/shader-glass-trail/UPSTREAM.md)。

## 3. CocosAirJS APIs used

createAirApp/createStepClock/createAirRenderTarget、Scene/Node/Camera、MeshRenderer、Material.initialize/setProperty、EffectAsset、utils.createMesh、Texture2D 和 gfx。八条 API evidence 绑定实际调用行，生产定位器、API 库存、生成器及实际依赖均纳入输入闭包。两个相机共享 Scene，单 GameCanvas；诊断 RT 通过原生公开 API 创建。

## 4. Implementation details

E08 recorder 将每个正 dt 模拟帧的轨迹打包为 64×1 RGBA16F 点纹理，一次上传 512 字节。Trail 保留胶囊链、二次 Bézier、年龄权重与覆盖计算，将线性预乘颜色写入 RGBA8 RT。Glass 使用 E09 完整梯度、折射、内变焦、九点 Vogel 模糊、色散、Fresnel 和高光，从真实 Trail RT 采样并安全逆预乘，最终执行一次 OETF。

中间存储显式执行 `floor(clamp(premultiplied,0,1)*255+0.5)/255`。这是本地确定性 RGBA8 存储合同，未改变 Trail 的线性算法或 ±2 容差。目标纹素的一个蓝色码值差异在小 Alpha 逆预乘时会被放大；Lead 的三浏览器中间 RT 对照定位了该问题，关闭 DITHER 并未修复，不能把它归因为 dither 或引擎缺陷。

每帧账本保存实际 dt、使用的 pointer、当时 aspect/参数、时间、会话与完整 packed 字。CPU 按逐帧值回放；原生上传钩子保存全 256 个 uint16，并绑定同一纹理、帧和会话。低成本 uploadContext 仅暴露帧与会话，不在性能窗口读取材质或 GPU 像素。Glass 关闭是显示 copy；Trail 关闭提供透明输入。

## 5. Tests performed

执行渠道：**Orca Worker** 完成实施及多轮合同修复；**Lead** 独立审查、实际采集、参数映射与显式存储修正、Gallery 接线和最终门禁。Worker 最新实际报告为五套 **166/166**，其中完整报告正例覆盖三浏览器功能与九个性能 tuple；合成 PNG 只证明 NODE_CONTRACT，不称浏览器实证。

最终采集的 strict tsc、esbuild 与真实浏览器 shader 编译分别记录。两个真实 PASS 基线的 structuredClone 审计 **65/65 拒收**，直接 NaN 不经 JSON 转成 null；各拒绝原因见 [实际审计](../evidence/shaders-absorption/c03-glass-trail-actual-audit.json)。历史失败、OS 回执、冻结身份和原始日志均保留。

## 6. Screenshots / visual evidence

三浏览器共 **39 标准视觉案例**，每例有 compositor PNG 与透明线性 RT 读回。另六张时间对照、三张同页 resize，共 **48 PNG，不是 48 算法案例**。包含圆/圆角矩形、层开关、模糊、色散、折射边缘、DPR2、暂停恢复与轨迹确定性，数学容差维持 ±2。截图与输入指纹由生产校验器重新读取核对，截图相似不作为算法正确的判断依据。

## 7. Performance evidence

冻结 720p 1280×720@1、1080p 1920×1080@1、mobile 390×844@2，三浏览器共九个串行窗口。每窗口使用新 recorder 与会话、真实累计 dt 驱动的 DIAGNOSTIC_CPU_TRACE；该路径是确定性 CPU 诊断轨迹，不能冒称可信鼠标输入。

每个稳态帧要求至少两个原生 beginRenderPass 与两个实际 GL draw，正 dt 帧恰一次原生 512 字节上传，完整内容与独立回放相等；窗口内 readPixels 必须为零。环境采用真实 HTTP 隔离、Firefox 导航后 DPR 修复和 25000 次时钟标定。CPU 更新、gfx wall envelope、GL 派发、队列记账与可用 GPU timestamp 分开报告，具体数值由 Gate 直接重算。

上传追踪与命令包装有 CPU 开销，这是**插桩诊断窗口**，不是无插桩基准。AFTER_DRAW 间隔不是显示帧率，零时长只代表低于计时精度。模拟 mobile profile 不是实体 iPhone；物理显存不可用，GPU timestamp 不可用时如实记录。

九窗口合计 **2952 个稳态帧**。Chromium GPU timestamp 中位数按720p/1080p/mobile为 **3.023872 / 4.562944 / 3.553280 ms**；Firefox/WebKit不可用。CPU更新中位数九档约0.42–0.48 ms，包含轨迹模拟与上传追踪成本，不能替代独立无插桩基准。

## 8. Resource/lifecycle evidence

三浏览器共 300 轮退役。每轮六类资产 mesh/trailMaterial/glassMaterial/trailEffect/glassEffect/pointsTexture 各持一份并归还 1→0，合计 1800 份配对归还。先解绑 renderer 和采样器，再独立调用 attachCamera 的 detach 回调，最后 dispose RT、销毁节点和资产。纹理/缓冲登记回到基线。

诊断使用一次性临时 Material，finally 恢复原材质、相机和呈现状态后才返回回执；临时引用 1→0，原实例、轨迹和账本保持不变。变体切换使用全新基 Material 初始化一次并退役旧材质，保持同一 Scene、mesh、recorder 和借用 RT。独立 Gallery 生命周期 harness 尚未执行，不能由这 300 轮替代。

## 9. API DX gaps

本轮未新增确证 ENGINE_BUG。base Material 的 initialize/recompileShaders 使用边界、attachCamera 与 bindColor 两个解绑回调的独立性已写入例内说明。初稿将基类变体接口当作有效重编译、忽略 detach 回调、遗漏参数映射和账本链，按 AGENT_FAILURE/EXAMPLE_GAP/DOC_GAP 记录，不把它们转嫁为 SDK 缺陷。

## 10. Workarounds

没有额外 canvas、raw WebGL 渲染器、上游 runtime 或 TypeGPU 旁路。原生 GL 包装只观察 Cocos 上下文的调用；公开 render-target API 承担诊断。显式量化属于已声明的中间存储策略。

## 11. Proposed engine changes

C03 没有修改引擎或新增公共运行时 API。当前 SDK 的 `69127f39… / 5b67a560… / b7771393…` 来自并行 WebGL2 gfx 修复任务；仅冻结和验证这些字节，不回退它们，也不继承旧 SDK 下 Wave1–3、C01、C02 的当前身份 PASS。

## 12. Validation status

**当前源码 C03 六维 Engine Gate PASS**。完整声明范围为：合计18个六项维度行、39视觉、264边界、18非法输入、300资源循环、3live resize、9性能窗口。原功能OS UTC2026-10-11T05:19:51.494Z–05:21:59.536Z、性能05:23:07.799Z–05:25:18.701Z属于先前冻结身份；随后 main.ts/example.json 改变，生产验证器正确拒绝继承该报告。

Lead 未回退现有源码，于2026-10-11重新冻结36输入+8参考并完整采集：lead-w4-current-sdk-c03-functional-attempt1 OS UTC08:17:32.104–08:19:12.188，performance-attempt1 UTC08:19:13.040–08:21:19.150。两进程自然exit=0/signal=null/error=null/inputsUnchanged=true，阶段不重叠，2952稳态帧，65类真实报告篡改全部拒收。当前 SDK69127f39/5b67a560/b7771393未变。`subset=true`、`completed=false`；没有完成整个项目或解锁 Wave5 的声明。

Gallery 从 183 增至 184，旧 183 项逐项 deepEqual 保留。全局库存沿用既有记录，本轮不重复执行全库 Jest 或把已知失败标绿。

## 13. Known limitations

仅共享 circle/rounded-box 解析形状；无上游 SDF 资产平台。RT 与原生上传日志产生可计量的存储与 CPU 开销。Agent Gate、独立 Gallery harness、实体移动设备、长时、多标签页和完整 Wave4 未完成。旧失败与旧身份报告保留，不能重新标注为当前成功。
