# Cocos AIR WebGL2 图形合同修复开发任务书

日期：2026-10-10。2026-10-11 实施更新：WGL-00 三浏览器修前反例及 WGL-01～09 核心源码已实施，定向测试与构建/消费者通过；GPU 验收及完整完成状态以执行台账为准。实际结论持续记录在 [执行台账](../ledgers/webgl2-gfx-contract-remediation.md)。

目标：修复九类 WebGL2 能力与状态合同缺口，使公开 gfx 声明、实际 GL 状态、像素和读回值一致。保留原生 gfx、Material、Texture、Sampler、Framebuffer、Input 与资源生命周期；不引入第二套渲染器或采样器系统。

本任务书是 [端口缺口统一计划](port-gap-remediation.md) S0/S2/S6 的专项细化，不替代其范围、上游纪律与证据合同。与 [渲染合同台账](../ledgers/rendering-contracts.md) 和 [原生合同台账](../ledgers/engine-contract-hardening.md) 协调。外部清单的 ENG-12～15 与本地 ENG-01～09 不直接重号；外部清单关联引用的 ENG-01～10 则属于另一套编号语义，不能与本地同号条目自动合并。本任务以 WGL 编号为执行标识，引用外部 ENG 时明确来源。

## 1. 范围与交付

### 1.1 主线

| 编号 | 外部来源 | 优先级 | 开发任务 | 状态 |
| --- | --- | --- | --- | --- |
| WGL-01 | ENG-12 | P2 | 半浮点过滤能力表与实际格式能力对齐 | 源码已实施；验收见台账 |
| WGL-02 | ENG-13 | P1 | 比较 sampler 的状态、绑定与缓存 | 源码已实施；验收见台账 |
| WGL-03 | ENG-14 | P2 | 各向异性 sampler 的后端参数与规范化 | 源码已实施；验收见台账 |
| WGL-04 | ENG-15 | P1 | depth bias 启用位、constant/slope 顺序和缓存 | 源码已实施；验收见台账 |
| WGL-05 | Spark integer-format | P1 | 整数纹理外部格式及错误过滤能力纠正 | 源码已实施；验收见台账 |
| WGL-06 | Spark integer-clear | P1 | 整数附件清屏及混合 MRT | 源码已实施；验收见台账 |
| WGL-07 | Spark integer-attribute | P1 | 整数 shader 属性与两条 attribute 绑定路径 | 源码已实施；验收见台账 |
| WGL-08 | Spark array-framebuffer | P1 | GPU view 层信息、array/3D/cube 附件选择 | 源码已实施；验收见台账 |
| WGL-09 | Spark array-readback | P1 | 读回布局、层/mip、格式映射、失败与状态恢复 | 源码已实施；验收见台账 |

WGL-01～04 的优先级沿用 E-01：P2/P1/P2/P1；WGL-03 原稿已是 P2，不存在该项优先级漂移。WGL-05～09 的 P1 是本计划对 Spark 问题的实施分类，不冒称来源报告给出了同一优先级。批次内部顺序体现共享文件和复用依赖，不能将先做依赖解释为来源优先级被更改。

交付包含 TypeScript 源码、必要的 GPU 私有结构与缓存调整、自动化测试、自包含 public-gfx 浏览器夹具、普通路径回归、三浏览器原始证据、构建/声明与 npm 消费检查、手册边界说明及上游映射。

### 1.2 边界

- 正式目标为 WebGL2。WebGL1、WebGPU 仅用于语义参考或明确隔离的源级回归，不因本任务增加运行时支持承诺。
- 不直接合入 Spark 的 vendor bundle patch；从其定向反例和因果对照移植修复思路。主运行时不依赖 Spark、Three.js、Rapier 或新的解码器。
- 不更改版本号，不重置 AIR_BUILD_NUMBER。JS 构建会递增序号，声明构建和打包不递增。
- 不包含提交、推送、发布、部署或外部应用自动迁移。
- 不把 APP-01～05 或 WebGPU/云浏览器环境限制转为核心缺陷；不修改应用算法来掩盖图形状态错误。
- 现有普通浮点/归一化纹理、顶点色、蒙皮、普通深度采样及默认 sampler 必须保持行为。

## 2. 来源、发现与修复路径

### 2.1 当前核查身份

核查时 HEAD 为 `4fdfc096258cd1b6f2aa1d8132edda7be7a27a20`。工作区存在其他主题的未提交与未跟踪文件；这不是一个已冻结、可声明 release READY 的候选。

| 文件 | 本次只读核查 SHA256 |
| --- | --- |
| src/cocos/gfx/webgl2/webgl2-device.ts | 8ed06bf401265f05f1d3d086dd0a692fc4df76935c760607cec96a5650026f6a |
| src/cocos/gfx/webgl2/states/webgl2-sampler.ts | de76aff26e450ff76ad2f67f6fa2cb5bf11d2c935ccf1ca34bc10304698fd8b5 |
| src/cocos/gfx/webgl2/webgl2-commands.ts | 5d1a8fbf250305ffe86f42ca73d64623caedb5074d6d2e96ff94c07953bcc103 |
| src/cocos/gfx/webgl2/webgl2-texture.ts | fa030b22cc210cdbad2146e98fc606ae4585d0da41ec06e42f4884ac50d7a5a2 |
| src/cocos/gfx/webgl2/webgl2-gpu-objects.ts | acb7fbe26aa08436aeabc09cdb2688424ee3ab854e8faa72c11d7db12804697f |
| build/cocosair.module.js | 3a448f029369ac0253f3098fc08680c65f81bdf3bb472795e3032fdd725ab01d |
| build/cocosair.module.min.js | 8e56fbd5a5b754252838204ff1c204223aadd7c401bd1615c2008e808b5fe05c |
| build/cocosair.module.d.ts | 3c2b1853a372509d040bbfc93d957b2c525764d000467f8aac8f33f8b8068fee |

这些值是记录时点身份，不是强行回退目标。实施前必须重新记录当前源码、构建工具、合同、SDK 与工作区身份，发现漂移后增量复核，不能 reset 他人的工作。

### 2.2 Evidence → Finding → Path

| 证据 | 当前发现 | 开发路径 |
| --- | --- | --- |
| E-01：`C:\Users\caosh\Downloads\engine-tasks.json`；SHA256 `7556484b78a058914a2c0be84e864d98b24971a473e9cdb17d358200bc9ec5ce` | 四项 ENG 核心反例均有对应源码遗漏；JSON 的 links 字段包含证据链接，但相对 JSON 所在 Downloads 目录解析时，四项的九个目标均不存在 | 先确认来源根目录并复用可用反例；目前未取得对应文件，不推断其在其他目录不存在。在本仓重建最小夹具并复现当前候选，覆盖 WGL-01～04 |
| E-02：`E:\AIProMax\github\spark-cocosairjs\artifacts\native-gfx-patch-controls.json`；SHA256 `b091ade15e6c7b37c108951d29f00e00862008ef50b359d117de8cc521d40be7` | 浏览器版本记录为 26.5；全修复通过，原版和五个逐项撤销失败 | 参考 public-gfx 因果对照；独立重建 WGL-05～09 夹具，不冒称本仓已验收 |
| E-03：Spark vendor 原版 `f6836f6060ed00e4bd67f71056e1d15a9c9522fcfdd5ed67292387fad4085372`，修复版 `eaad04f757843be58f99ff0c208fb45c50703d75a148d9dd4da0a61052c15cd6` | 本次本地文件哈希与报告一致；它们不是本仓当前 SDK | 保留外部历史身份，不覆盖原始 vendor，不把当前 SDK 指纹改写进历史报告 |
| E-04：本节源码指纹与下列实现入口 | 能力位、sampler 参数、depth bias、整数及 view/读回存在源级缺口 | TypeScript 最小修改；更新映射、构建后以新候选采集证据 |

Spark 报告实际有七个变体，不是六个逐项撤销。原版的 `asyncReadback.exact=true` 只证明某种一致性，仍然读回全零；撤销整数 clear 后最终绘制样本也能等于期望，但存在 GL 错误。新夹具必须验证独立期望值和错误状态，不能复用这些单一标记作为通过条件。

可参考 Spark 的 `tests/gfx-patch-probe.html`，但本仓夹具使用自造几何、纹理与确定数值，不依赖外部应用资产或在线站点。

规范依据：[WebGL2](https://registry.khronos.org/webgl/specs/latest/2.0/)（当前页面是编辑草案，结合实际后端反例核查）、[各向异性扩展](https://registry.khronos.org/webgl/extensions/EXT_texture_filter_anisotropic/)、[polygon offset 参考](https://github.com/KhronosGroup/OpenGL-Refpages/blob/main/es3/html/glPolygonOffset.xhtml)。

## 3. 实施前准备 WGL-00

先完成共同合同与基线，再开始核心修改；缺某个外部反例只阻断该反例身份复核，不阻止重建本仓最小夹具。

1. 检查工作区、目标文件差异与上游映射。默认复用当前 checkout；并行贡献的 Shader、Skills、Gallery、测试清单不纳入本任务。
2. 确认可用 Node/npm/TypeScript/Jest/Playwright 与真实浏览器版本；不自动安装缺失工具。环境不可用记为 NOT_RUN/BLOCKED，不把配置存在写成浏览器 PASS。
3. 记录既有 typecheck、格式、文件映射、Web-only、相关测试及手册问题。此前已观察到全量手册同步门禁三项失败，必须以实施时点结果区分存量与新增。
4. 固定一个共享 SDK 写入者和构建窗口。没有协调时先做只读核查、夹具设计或源级测试；禁止竞争覆写 SDK，也不把外部材料缺失当成所有任务的停工理由。
5. 为九项建立最小 public-gfx 正负控制。记录修前真实输出，不要求未修复实现通过功能正例；缺口不存在或无法复现时重新分类并说明，而不是强行修改。
6. 在当前类型与调用者上冻结以下决策，并写入对应执行记录。

| 合同 | 实施默认与必须核对的内容 |
| --- | --- |
| 比较 sampler | 普通默认 `cmpFunc=ALWAYS` 不启用硬件比较；显式 LESS 等兑现比较。ALWAYS 比较与普通采样不能用同一个值含糊表示；若需支持，先确认现有 shader/descriptor 能否区分，不能全局打开比较模式 |
| 各向异性 | 0 保持兼容的关闭语义，实际 GL 值为 1；有效整数档按设备能力应用。非有限、负数、小数不得进入旧 bit hash。上限、规范化后的 info 与缓存键必须一致；如需支持超过旧 hash 的 16 档范围，先调整缓存表达并补回归，不静默共用错误对象 |
| 整数 attribute | 以实际 shader 输入与 gfx 数据格式决定 integer/float 绑定，不能只看 TypedArray 或 `isNormalized=false`。有符号/无符号、矩阵多 location、instancing divisor 分别核对 |
| 附件 view | WebGL2 首版采用单 mip、单层/face 附件选择。whole-resource view 如何选择默认层必须明示；多个 view 层不等于支持 layered rendering |
| 读回范围 | 明确原纹理与 TextureView 的 region 坐标语义。若 view 采用相对 mip/layer，入口必须传递并应用 base；不能丢弃 view 后只拿 underlying texture |
| 输出布局 | 保持已有合法 2D 输出布局，`buffOffset` 与 TypedArray.byteOffset 不混淆。冻结各支持 format 的输出通道、位宽、TypedArray、行距与层距；GL 上传类型不能直接当成 readPixels 合法组合 |
| 失败语义 | 入参范围/容量错误先整体预检，不写目标 buffer。执行期错误必须恢复状态并释放临时资源；是否允许已完成 region 的部分写入要明确并可定位，不把部分结果当成功 |
| 支持边界 | 首批落实本任务用到的合法颜色读回格式；压缩、深度/模板和不合法组合明确拒绝或作为独立有证据的实现项。不能用一次 RGBA32UI 成功宣布全部 Format 可读 |

## 4. 九项核心开发要求

### WGL-01：格式能力表

入口：[webgl2-device.ts](../../src/cocos/gfx/webgl2/webgl2-device.ts)、[AirRenderTarget](../../src/air/rendering/render-target.ts)。

- WebGL2 的 R16F/RG16F/RGB16F/RGBA16F 线性过滤不再依赖 WebGL1 的 `OES_texture_half_float_linear` 对象。
- 32F 线性过滤仍按自己的扩展合同处理。过滤能力与颜色附件可渲染性分开判断，不能顺带给全部格式承诺 render target 支持。
- 与 WGL-05 共同核对整数格式能力。已确认 webgl2-device.ts:358～389 的 INT/UINT 组错误继承 LINEAR_FILTER，RGB10A2UI 在 :333～334 与 :355～356 也有重复错误赋值；由 WGL-05 明确纠正，不仅作为可选审计。行号是本次核查位置，实施时以符号与实际源码为准。
- 验收：2×1 黑白 half-float 纹理，中心 LINEAR 有效分量为中灰、POINT 为白；能力位与实际行为一致。覆盖旧扩展对象缺失、32F 负例及 AirRenderTarget 的显式 HDR+linear 创建。

### WGL-02：比较 sampler

入口：[webgl2-sampler.ts](../../src/cocos/gfx/webgl2/states/webgl2-sampler.ts)、[GPU 结构](../../src/cocos/gfx/webgl2/webgl2-gpu-objects.ts)、shader/sampler 绑定及反射路径。

- 把 comparison 信息传到实际 WebGLSampler，配置 TEXTURE_COMPARE_MODE/FUNC；普通 sampler 明确保持非比较模式。
- 核对 sampler2DShadow 的 shader 反射、descriptor、纹理格式和绑定，不只修构造函数。
- 缓存覆盖比较函数、LOD 变体及创建/销毁；不得只更新 info 或错误共享 glSampler。
- 验收：深度 0.75、参考 0.5 的 LESS_EQUAL 输出白；参考 0.9 输出黑。覆盖 LESS/LESS_EQUAL/GREATER/NEVER，以及 raw/manual/comparison 三路、普通采样切换、重建。LINEAR/PCF 按实际设备单独记录，不要求各实现像素等价。

### WGL-03：各向异性 sampler

入口与 WGL-02 共享；必要时核对 [Sampler hash](../../src/cocos/gfx/base/states/sampler.ts) 与 device.getSampler。

- 保存请求或规范化后的各向异性信息，按扩展上限配置真实 WebGLSampler；无扩展有明确回退。
- 复用、LOD 变体及重建后的 GL 状态一致。当前 hash 已含该字段，不得把遗漏后端参数误诊为完全没有 hash 字段。
- 规范化在缓存之前完成；避免小数截断、负数位污染或超过 16 的请求形成含糊缓存别名。
- 验收：支持设备上 1/4/16 档实际 sampler 状态与期望一致；保留倾斜高频纹理的像素与图像。覆盖扩展缺失、0、负数、小数、非有限值和超过上限；不承诺三档画面在所有软渲染设备上具有固定差异。

### WGL-04：depth bias

入口：[状态应用与动态状态](../../src/cocos/gfx/webgl2/webgl2-commands.ts)、[初始 GL 状态](../../src/cocos/gfx/webgl2/webgl2-swapchain.ts)、[状态缓存](../../src/cocos/gfx/webgl2/webgl2-state-cache.ts)。

- 根据 depthBiasEnabled enable/disable POLYGON_OFFSET_FILL，并同步缓存与初始状态。
- 两条路径已确认参数颠倒：webgl2-commands.ts:2062 调用 `polygonOffset(rs.depthBias, rs.depthBiasSlop)`，:2480 调用 `polygonOffset(dynamicStates.depthBiasConstant, dynamicStates.depthBiasSlope)`。分别修为 `polygonOffset(rs.depthBiasSlop, rs.depthBias)` 与 `polygonOffset(dynamicStates.depthBiasSlope, dynamicStates.depthBiasConstant)`；factor 对应 slope，units 对应 constant。启用位与参数交换是独立修复，不能只做其中之一。
- 深度 clamp 的非零值如不可表达，应明确支持边界，不假装已应用。
- 状态验收：静态/动态分别请求 constant=-4、slope=1.25，实际 POLYGON_OFFSET_UNITS 必须为 -4、POLYGON_OFFSET_FACTOR 必须为 1.25；检查 POLYGON_OFFSET_FILL 启用及关闭，不以一张通过图覆盖两个路径。
- GPU 验收拆为 constant-only（slope=0）、slope-only（constant=0）、不同值组合和 disabled 四组，分别运行平面与有已知窗口深度斜率的斜面。平面上 slope-only 应与零偏移一致；斜面上检验 slope 分量，另验证 constant 分量。使用明确的正常深度方向、LESS、红先绘制并写深度、蓝后绘制，采样点位于三角形内部，避开近远裁剪和饱和区；逆深度另设期望，不能套用同一红蓝规则。
- 记录零偏移基线、附件深度格式和可见变化；constant 的可见量受深度分辨率影响，先用独立控制建立有效测试量，再冻结参数及期望，不把不可分辨的像素判为引擎失败。保留纯几何位移正控；独立撤销启用位、仅撤销静态参数交换、仅撤销动态参数交换三个负控，必须各自由对应状态和 GPU 用例检出。启用→关闭、renderpass、resize/重新初始化不能残留状态。

### WGL-05：整数纹理格式

入口：webgl2-commands.ts 的 GFXFormatToWebGLFormat；复用 GFXFormatToWebGLInternalFormat/Type，结合 webgl2-device.ts 的整数格式能力。

- 已确认缺口是 GFXFormatToWebGLFormat 将整数格式映射成普通 RED/RG/RGB/RGBA。已有 InternalFormat 和 Type 对本任务的 8/16/32 位 INT/UINT 及 RGB10A2UI 映射正确，保留复用并补组合回归；不重写这两个 switch 或把三张映射表都记为缺失。
- 整数 R/RG/RGB/RGBA 使用对应外部 INTEGER 格式；UNORM/SNORM/普通浮点保留原映射。清除上述整数组及 RGB10A2UI 的错误 LINEAR_FILTER 位，回归 POINT 采样；线性请求的拒绝/回退策略在 WGL-00 冻结并实际验证，不能继续宣告支持。
- 核对 8/16/32 位有符号/无符号及 packed 格式的支持范围；不把 RGB 能上传等同于 RGB 能作为颜色附件。
- 测试向量按每个格式的实际通道位宽分组，先验证输入可表示再上传。8 位 INT 用 -128/-1/0/127，UINT 用 0/1/255；16 位 INT 用 -32768/-1/0/32767，UINT 用 0/1/65535；32 位 INT/UINT 才使用 2^24+1、各自端点及有符号负大值。RGB10A2UI 的 RGB 分量限定 0～1023、alpha 限定 0～3，按 packed 布局另测，不能套用 32 位逐通道范围。
- 整数纹理经 isampler/usampler 写入适配的整数输出，按独立期望验证，禁止中途转为 float32；不同通道数量分别测试，不把 RGB 可上传等同于可附着。RGBA8、SNORM、16F/32F 普通采样不变，非法过滤/格式组合有明确负例。

### WGL-06：整数 clear

入口：webgl2-commands.ts 的 renderpass 开始与清屏路径。

- 按每个颜色附件选择 clearBufferiv/uiv/fv；整数单附件不能落回 clearColor，混合 MRT 逐附件处理。
- 保持普通颜色、深度/模板清屏、load/discard、color mask 和 scissor 合同。
- 分别复用四分量 Int32Array、Uint32Array 和已有 Float32Array scratch；按当前附件类型填充，再立即调用对应 clearBufferiv/uiv/fv。顺序混合 MRT 可复用同类型 scratch，不用一个 Float32Array 转存全部 clear 值；UINT 大值不能经过 Int32Array。有录制/延迟提交的路径须保留每附件原始数值，不能让后一次填充覆盖尚未提交的 clear 数据。
- clearColors 的 gfx.Color 字段目前是 JS number，可以表示 32 位整数；核对从公开 beginRenderPass 到实际 clear 的全链路，禁止先归一化或转 float32。对整数附件的非整数、非有限和超出该格式范围输入，在副作用前按冻结合同处理；普通颜色仍保持原合同。
- 验收：clear-only 与未被 draw 覆盖区域直接读回精确值。覆盖单附件、INT+UINT+普通颜色混合 MRT、掩码、LOAD/CLEAR 切换；不能以之后覆盖绘制的正确样本替代 clear 验收。

### WGL-07：整数 attribute

入口：webgl2-commands.ts 中 VAO/非 VAO 两条绑定路径及 glInput/glAttrib 信息。

- 共用绑定分类逻辑；integer shader 输入采用合法 vertexAttribIPointer，浮点/归一化输入保留 vertexAttribPointer。
- 保留 stride、offset、矩阵 location 展开和 divisor；在绑定时验证数据与 shader 类型兼容，未支持的 packed integer 输入明确拒绝。
- 验收：32 位 integer 输入真实输出 2^24+1 与可表示的有符号大值，8/16 位输入采用 WGL-05 对应位宽向量，不能只检查 CPU 输入或 integer 状态标记。覆盖 VAO 两路径、instancing、交错 buffer、属性偏移；回归 normalized U8 顶点色及既有 JOINTS/WEIGHTS 蒙皮用法。

### WGL-08：分层 view 与附件

入口：[webgl2-texture.ts](../../src/cocos/gfx/webgl2/webgl2-texture.ts)、webgl2-gpu-objects.ts、Framebuffer 创建与重建。

- GPU view 保留并校验 baseLayer/layerCount 与 mip 范围；原纹理默认 view 和显式 view 都有一致定义。
- 2D 用 framebufferTexture2D；array/3D 用 framebufferTextureLayer；cube 用具体 face target。层 0 是有效值，不能用逻辑 OR 合并不同字段。
- 3D 的可用 slice 数随 mip 缩小，array/cube 的层数按各自合同处理；尺寸、renderbuffer 附件和 resize 后 view 有效性一起核对。
- 颜色附件先闭环；深度/模板的分层范围必须明确。支持则复用相同选择逻辑并测试，不支持则在副作用前拒绝，不能默默附错层。
- 验收：各层/face 写不同 sentinel，检查层 0、非零层、首/末层、不同 mip、混合 MRT、重建。多层 view 不冒充 layered rendering；非法层/mip 明确失败。

### WGL-09：完整读回与状态恢复

入口：WebGL2CmdFuncCopyTextureToBuffers、webgl2-device.ts 的 copyTextureToBuffers 入口、GPU view 与状态缓存；如涉及 async/PBO 路径，单独登记其范围。

- 逐 region 支持冻结后的 offset/extent/mip/层合同。array/cube 使用 baseArrayLayer/layerCount；3D 使用 texOffset.z/texExtent.depth，并对不适用字段做一致校验。
- 正确处理 buffOffset/buffStride/buffTexHeight、TypedArray.byteOffset、行距、层距与容量。禁止忽略参数或每个 region 只读一层。
- 复用 WGL-05 修正的整数外部格式分类、现有 FormatInfos/FormatType 与合法类型信息；读回只增加必要的合法组合判定和输出布局策略，不再维护一套覆盖全部 Format 的平行 switch。上传与读回并非全部同构：8/16 位整数附件如采用 RGBA_INTEGER + INT/UNSIGNED_INT 的可移植读回，要用相应 32 位暂存、再按合同转换/收纳，不能直接沿用 BYTE/SHORT 上传类型；16F 读回及 packed 格式也分别定义转换或明确拒绝。真正需要不同 GL 组合时保留显式有测试的差异，而非为追求复用强行同一映射。
- 校验纹理/格式、区域与容量，检查临时附件完整性，避免已销毁资源继续读。所有参数错误先验证，保护 buffer 哨兵区。
- 保存并恢复 READ_FRAMEBUFFER、DRAW_FRAMEBUFFER、必要的 PACK/PBO 状态及相关缓存。成功、失败、异常均走 finally 清理，不以 bind(null) 代替恢复。
- 临时 FBO/buffer 有明确所有者和清理路径。批量读回避免无界中间分配；不将同步 CPU readback 包装成已测的异步性能提升。
- 验收：多 region、多层、3D 深度、cube face、多个 mip、非零 byteOffset、行距/层距以及越界负例；读回前后继续 render/clear/blit，实际 FBO 与缓存均正确。GL 错误为零且返回值符合独立期望，不能只比较两个同样错误的读回路径。

## 5. 批次与依赖

| 批次 | 任务 | 出口 |
| --- | --- | --- |
| B0 | WGL-00：身份、共同合同、当前候选负例与基线 | 接口/缓存/失败范围已冻结，九项都有明确反例或重新分类说明 |
| B1 | WGL-01 → WGL-02 → WGL-03 → WGL-04 | 能力、sampler、depth bias 分别有 public-gfx 状态与数值证据；普通路径保持 |
| B2 | WGL-05 → WGL-06 → WGL-07 | 整数上传、clear、shader attribute 三条路径各自闭环，保留逐项撤销负例 |
| B3 | WGL-08 | view 层信息及附件绑定正确，颜色/深度边界明示 |
| B4 | WGL-09，依赖 B2/B3 | 完整支持范围内的读回及成功/失败状态恢复通过 |
| B5 | 同候选整合、声明/消费、文档与证据检查 | 完成九项定向验收与普通回归；不冒称全仓 release READY |

同一阶段不要求重复完整构建；相关源码改动聚合后，满足下游验证需要再构建。B1～B4 反复修改 webgl2-commands.ts，必须单一写入者合并；只有独立无写入冲突的夹具或文档步骤可协调并行，不默认新建 agent 或任务。

## 6. 夹具与证据设计

下列是拟新增交付路径，不是已经可执行的工具：

- `tools/debug/probes/webgl2-gfx-contracts/`：自包含 HTML/TS 与生成纹理、几何；状态和 draw 均通过 public gfx。raw GL 仅作明确标记的只读诊断，不直接补状态让夹具通过。
- `tools/verify/webgl2-gfx-contracts.cjs`：独立启动同一服务与浏览器，支持九项分组、浏览器子集和显式新输出；不隐式构建、下载或发布。
- `test/smoke/webgl2-gfx-contracts.test.ts`：参数、布局、状态恢复及错误边界的源级测试；mock 调用不替代真实 GPU 输出。
- `docs/evidence/examples/webgl2-gfx-contracts/`：最终报告、raw 数值/状态与截图；失败/中间尝试写显式新路径，不能覆盖或改名为 PASS。
- `ai/ledgers/webgl2-gfx-contract-remediation.md`：实施时建立的逐项台账，与本计划同名主题。当前尚未创建。

每次运行至少记录：源码与工具/合同/SDK 指纹、Git 与 dirty 状态、浏览器版本/路径、backend、renderer/vendor 的实际可用信息、case/variant、输入/期望/实际、shader 编译链接信息、GL 错误阶段、GL 状态、buffer 数值与布局、资源创建销毁、异常路径、scope/subset 与退出码。

- Chromium、Firefox、WebKit 每项单独报告。某扩展不支持属于该能力不可用；启动、shader、draw 或读回失败不能伪装成 UNSUPPORTED。
- 状态查询成功、无 GL 错误、像素正确、资源/缓存恢复是独立条件，不能互相替代。
- `getError()` 会消费错误队列。只在冻结的诊断边界读取，保留 pre-existing 与各阶段错误，不先清空后宣称原生 draw 无错。
- 整数必须原生整数读回；PNG 可用于可见外观，不能证明 32 位整数精度。
- 页面截图、Canvas 导出和 GPU buffer 读回分开标记。Windows WebKit 活 resize 的页面合成限制不由 GPU 正确结果替代；没有 present 证据不宣称显示器性能通过。
- 默认原生 pacer；断言时明确暂停并单步，避免真实 rAF 与人工 step 同时推进。固定物理子步、wall delta 与可取消动画时钟不是同一件事。
- 保留 Spark 级别的逐项撤销设计，但本仓新负控制必须以当前 TypeScript/构建候选生成，不能替换报告里的哈希。只撤销一种机制，且判断该机制的独立观测。

## 7. 验证与最终门禁

### 7.1 每批局部验证

先完成源码/夹具格式，再记录指纹、构建和采证。执行对应 source tests、public-gfx 正负例及共享路径回归；状态失配时先定位根因，不靠反复采集直到出现 PASS。

普通路径至少包含：RGBA8 clear/采样/读回、RGBA16F/32F 合法过滤、普通深度 sampler、normalized 顶点色、实时蒙皮、单附件/MRT、MSAA resolve、附件重建、读回后继续绘制及 blit。

### 7.2 整合检查

以下是仓库已有命令；实施时才执行，并记录实际范围与退出码：

```powershell
npm run typecheck
npm run verify:web-only
npm run verify:file-map
npm run verify:licenses
node tools/build/pal-source.cjs --check
npm run build:all
npm run verify:consumer
npm run verify:doc-refs
```

- 九项核心的 final browser collector 要在最后一次影响行为或指纹的源码修改后执行。
- 新增 Jest case 后维护测试清单，先重读当前并行差异，不覆盖其他新增测试；跑相关 suites，并检查清单没有漏发现/跳过。已通过后不无理由重复全量测试。
- 按 [.prettierrc.json](../../.prettierrc.json)、[忽略规则](../../.prettierignore) 格式化配置范围内新增/修改的夹具、tools 和示例。抽取的 `src/` 与证据/生成清单不做格式化。PR/release 前完整格式门禁按仓库规则执行，局部通过不能代替它。
- 抽取文件差异必须在 [upstream-file-map.json](../../docs/upstream-file-map.json) 和 [UPSTREAM.md](../../docs/UPSTREAM.md) 登记。原本 modified:false 的 commands/texture/gpu-objects 变为真实有理由的修改，不改 pinned baseline。
- 默认 SDK、min、声明与 npm 发布副本全部检查；不只验证源码类型或开发 JS。build:all 消耗两个编译序号，证据绑定实际不同的产物身份。
- 受影响 API inventory、Gallery、browser evidence 和消费者下游按当前规则更新，不能手写历史 PASS 或同步替换历史指纹。共享工作的无关证据不得覆盖。
- 这份专项完成不等于完整发布门禁通过。只有当实际候选满足 release 要求、工作区干净、全部必要证据新鲜时，才能使用 `verify:release` 的 READY 结论。

### 7.3 完成标准

九项分别达到源码合入、正负控制、普通回归、三浏览器声明范围验证、参数/状态/资源失败边界、文档与构建一致六个条件。任何 NOT_RUN、FAIL 或只在单一浏览器有证据的条目都按实际范围保留，不能标为全部完成。

每个批次交付简述：问题触发、修复行为、涉及文件、输入输出与像素证据、错误/清理验证、SDK 新指纹、存量失败和未验范围；下一批只继承已确认的共同合同。

## 8. 后续增强队列

以下五类不是九项核心缺陷，不阻塞已具备最小夹具的核心修复：

| 来源 | 合适的后续工作 | 不应做的扩张 |
| --- | --- | --- |
| ENG-05 | 复用 createActionInput 与已修正的输入手册，补可信 Esc/wheel、抓握/释放、HTML 控件的一次性执行证据 | 不另建输入系统，不全局更改 DOM 传播策略 |
| ENG-02/03 | 在 AirRenderTarget、HDR、水面范例上补复杂效果组合、resize/resolve/read/dispose 与所有权 | 不宣称核心完全缺少 HDR/MSAA/multipass |
| ENG-06 | 明确 CSS、主 framebuffer、离屏目标及各质量档职责；动态 resize 不读自己改写后的布局作递归输入 | 不另建 resize 状态机，不强制所有低档仅缩离屏目标 |
| ENG-01/07 | 工具侧关联 input arrival、wall/source time、frame、isTrusted、动作和可见输出 | 不把晚到的快照当短窗口输入证据，不改应用算法或所有时钟 |
| ENG-09/10 | 分开 context、shader/program、资源与像素健康，质量档与真实设备性能 | 不以云 FPS 或 context healthy 代替画面与真机验收 |

高频输入 trace 如确有需要，应独立 opt-in、限制到明确游戏画布与枚举动作，不采表单文本、不发送网络、不修改业务时钟；不能取消已有 InputInspector 的只读、容量、节流和隐私合同。

## 9. 实施起点与状态

准备阶段已完成：需求分类、九类源级缺口核查、Spark 报告及 vendor 哈希核对、任务依赖与验收要求整理。

2026-10-11：当前候选九项修前 GPU 反例、基线门禁与共同合同已记录，核心 TypeScript 修复已实施。当前进行同候选三浏览器数值/状态、撤销负控与整合证据验证；未达到完成标准的项目继续按实际范围保留，详见执行台账。

实施不需为已授权范围内的可逆技术细节反复确认；变更公共签名、默认行为或扩展支持范围时，先基于实际调用者和兼容测试形成具体方案，超出本计划范围再澄清。

## 10. 任务书审查处置（2026-10-10）

本表处置的是任务书表达与验收设计；两项源码缺陷仍未实施修复，不能将文档修订登记为运行时 PASS。

| 审查项 | 核对与处置 |
| --- | --- |
| 两处 polygonOffset 参数倒序 | 源码确认；WGL-04 明列原调用、正确调用及两个路径独立负控 |
| E-01 未携带链接 | 修正：链接已提供，按当前 JSON 目录解析的目标文件未取得；允许确认来源后复用 |
| ENG 冲突提示 | 改为外部关联引用 ENG-01～10 与本地编号语义区分，ENG-12～15 不直接重号 |
| WGL-01/03 优先级 | WGL-01 恢复来源 P2；WGL-03 原本即 P2，该部分 finding 不成立；Spark 项的本地分类另作说明 |
| WGL-05 三张映射表 | 收窄缺口到外部格式表；InternalFormat/Type 已有正确整数映射，保留并验证 |
| depth-bias 红蓝验收 | 撤除单一符号/颜色判据；冻结深度合同，拆分 constant/slope、静态/动态、启用位及独立撤销 |
| scratch 与混合 MRT | 不认定复用本身矛盾；明确三种 typed scratch、逐附件提交和录制所有权，避免精度/别名问题 |
| 第二套读回格式表 | 潜在重复设计风险；要求复用格式分类，只显式处理读回特有合法组合/转换，不强行复用上传 type |
| 2^24+1 跨位宽向量 | 改为按位宽及 packed 通道范围分组；仅 32 位逐分量整数使用该向量 |
| 整数 LINEAR_FILTER | 源码确认；WGL-01 明列位置，WGL-05 承担纠正及拒绝/回退、POINT 回归 |
