# IER-02 · Multipass 与 Mip 渲染路径示例

同一页面的两条**独立原生渲染路线**（`examples/interactive-multipass/`）：

- `?mode=capture`（默认）：场景 capture → 全屏采样。真实 `AirRenderTarget`
  （`attachCamera` / `bindColor` / `resolve` / `resize` / `dispose`），MSAA resolve 与
  RGBA16F HDR 捕捉由引擎既有路径承担。
- `?mode=native`：低层 gfx 多 pass + **真实 mip 链**。逐级纹素上传
  （`copyBuffersToTexture`）、`textureLod` 逐级采样、std140 uniform block、显式
  descriptor binding / input layout / pass 外 buffer 更新顺序，私有 command buffer
  提交到窗口 framebuffer。

启动：`npm run dev -- --example interactive-multipass`（或直接访问
`http://127.0.0.1:7454/examples/interactive-multipass/`）。

## 控制与测试面

普通页面：Pause / Resume / Reset / Resize / Release（native 另有 Mip LOD+ 按钮切换
采样 LOD 组）。`?test=1` 切换到冻结步进时钟控制面 `window.__multipass`
（`step/resize/reset/setLodBase/negatives/matrix/lifecycle/release`）。

## 两路线的原生对象职责

| 资源 | capture 路线 | native 路线 |
|---|---|---|
| 颜色附件 | `AirRenderTarget` 拥有 `RenderTexture`（含 4x resolve 输出） | `device.createTexture`（自建 framebuffer） |
| 采样视图 | `AttachmentView`（引擎内部，借 GFX 纹理） | `descriptorSet.bindTexture` 直绑 |
| 相机绑定 | `attachCamera` 返回解绑函数，dispose 前调用 | 无相机；`EVENT_AFTER_DRAW` 后提交自绘 pass |
| 网格/材质 | 引擎 `MeshRenderer` + 生成 effect JSON | 自建 `InputAssembler`/`PipelineState`（顶点 24B stride，3×vec2） |

## std140 / binding / 更新顺序（native 路线要点）

1. **set 0 是引擎内部保留**（`bindingMappings` 对 set-0 sampler 使用负偏移）；用户
   descriptor 按 material 约定放 **set 1**：binding 0 = UBO（16B std140 vec4），
   binding 1 = sampler2D。pipelineLayout 用空 set-0 占位布局 + set-1 实布局。
2. GLSL ES 3.00 **不支持** `set/binding` 限定符与 varying 上的 `location`——声明写在
   `ShaderInfo` 元数据（`UniformBlock`/`UniformSamplerTexture`），shader 源里是裸块声明。
3. `descriptorSet.bind*()` 之后必须调用 `descriptorSet.update()`（引擎 pass.ts 同款
   时机）；**UBO/DS 更新在 render pass 之外**、每帧 `cmdBuff.begin()` 之前。
4. 采样 mip 必须 `mipFilter != NONE`（`NONE` 时 GLSL `textureLod` 也只回基础级）。
5. 顶点属性偏移由 IA 属性顺序累计；属性格式必须与数据打包一致（vec2 用 `RG32F`）。

## 能力矩阵与限制

`probe.matrix()` 实测 rgba8/rgba16f × 1x/4x：真实分配、framebuffer 完整性、
`glSamples`、resolve、按格式类型化回读（rgba16f → Float32Array）。

**native 路线 MSAA = NOT_RUN（如实）**：引擎把 samples>1 的 TEX2D 分配为 GL
renderbuffer（`webgl2-commands.ts` 纹理路径），无公开 sampler2DMS 读回路径；
MSAA resolve 用 capture 路线的 `AirRenderTarget`（4x 真实 resolve + blit）。

## 负例（两类真实错误 + 两类静态一致性检测 + 重复挂载引擎错误）

| 负例 | 路线 | 实际诊断 | 正确版 |
|---|---|---|---|
| 重复挂载（引擎错误，保留为额外负例） | capture | `AIR_E_RENDER_TARGET_CAMERA`（同一相机重复 attach） | detach 后单次重挂成功 |
| GLSL 声明顺序（真实编译错误） | native | 单一变量先用后声明 → `undeclared identifier` 完整日志（compileStatus false/true 如实记录） | 声明前置编译通过 |
| std140 错布局（真实 GL 错误） | native | `gl.getError()` ∈ 0x501/0x502（12B buffer 配 16B vec4 块） | 16B 后 NO_ERROR |
| 未绑 sampler（静态一致性检测） | native | 本批三浏览器实测引擎回退 null 纹理（driver NO_ERROR）→ 静态完备性检测定位 binding 1 缺失 | 绑定后 NO_ERROR 且槽位实占 |
| descriptor binding 冲突（静态一致性检测） | 两路线 | 引擎无运行时校验（后写者胜）；由声明数组重算碰撞（slot 唯一性+资源类别） | 唯一 binding 槽声明重算无碰撞 |

native 负例在 `&neg=1` 独立诊断页运行（故意产生的 GL 错误不进证据页 console）。

## 普通模式与生命周期观测

普通模式（无 `?test=1`）跑引擎原生 pacer；Pause/Resume/Reset/Resize/Release 是真实
click（trusted 事件单独记录，probe 动作不冒充用户输入）。三浏览器均覆盖两条普通路线：
capture 的帧前进、暂停/恢复、reset 退役重建、resize、终态释放，以及 native 的 LOD 点击和释放。

10 轮 create/resize/dispose：generation 前进、每轮 camera 先解绑（`targetTexture` 归还）
再 dispose、节点离开场景图（destroy 帧末提交）、native 每轮 `objectID` 唯一且
memoryStatus 释放字节数精确等于分配（21504/16）。gfx 销毁实时观测 = gpu 访问器
null/抛错 + 计数下降；引擎计数不是物理 GPU 分配量，GPU 时间 unavailable。

另有 10 轮真实 reset/step：每轮先归还旧 Mesh/Material 的一份引用，自有资产保持 8 份。
同步观察可能仍为 `isValid=true`；这表示待释放调度，并不等于已销毁。Lead 在 Chromium
等待 350ms 后确认 bufferSize/textureSize 回到重置前基线；最终解绑并归还当前资产。

`sourceStatus: recreated`——原云端 02/13/soft 素材未获得，本页为独立复现场景，
referenceComparison 记 NOT_RUN。

## 证据与验收

- 采集器：`tools/verify/interactive-multipass-browser.cjs --browser=all --out=<new.json>`
  （纯导出 `checkCase/validateReport` + require.main guard；三浏览器 DPR1/2；
  AFTER_DRAW 后等两次浏览器 rAF 再 compositor 截图，不推进引擎时钟）。
- 合同测试：`test/smoke/interactive-multipass.test.ts`（22 用例，临时目录与合成 PNG；不依赖历史 output），
  以及 Lead 的七条拒绝回归；合成 PNG 不作为真实浏览器证据。
- [归档报告](../../docs/evidence/examples/interactive-engine-improvements/multipass-s3.json)：
  Orca Worker 实际采集 45 个定步状态与 6 个普通模式可见状态；Lead 归档相同 PNG 字节，
  独立[实际报告审计](../../docs/evidence/examples/interactive-engine-improvements/multipass-s3-audit.json)16/16 篡改拒绝。
- Gallery 规格已登记；展示状态保留 draft，专用子集验证不自动替代通用 Gallery/发布门禁。
- 效果 JSON：`node examples/interactive-multipass/generate-effects.mjs`（离线生成
  `src/effects.generated.ts`，运行时无编译器）。
