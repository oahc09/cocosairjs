# 高质量互动内容：执行台账

对应[任务书](../plans/vibe-content-capabilities.md)。更新：2026-10-25。

状态定义：`PENDING` 未开始；`IN_PROGRESS` 正在实施（同时只保留一项）；`IMPLEMENTED` 源码已完成但验证未齐；`VERIFIED` 已满足对应合同与当前定向验证；`BLOCKED` 有明确外部阻塞。状态不代表完整发布验收。

| ID  | 状态        | 当前结果 / 下一步                                                                                 |
| --- | ----------- | ------------------------------------------------------------------------------------------------- |
| F01 | VERIFIED    | 源码、候选/开发 JS、声明、21 项相关 CPU 回归与真实 Chromium 合同/示例交互通过；不是完整发布验收   |
| F02 | VERIFIED    | 默认 SDK/声明消费及 Chromium 全部定向用例通过；21 项 CPU 与 F01 浏览器回归通过，不代表完整发布验收 |
| F03 | VERIFIED    | 已追加抛光表面/形态法线/粗糙度；当前默认 SDK 画面、27 项 CPU、释放与兼容性回归通过，非完整发布验收 |
| F04 | PENDING     | 待 F03；建立可组合力场                                                                            |
| F05 | PENDING     | 扫掠/挤出/倒角等几何工具                                                                          |
| F06 | PENDING     | 复用现有物理材质实现，补直接创建入口                                                              |
| F07 | PENDING     | 环境资源与 IBL 装配                                                                               |
| F08 | PENDING     | AFTERLIGHT 透射捕获组件化                                                                         |
| F09 | PENDING     | 现有多通道能力组合成水面组件                                                                      |
| F10 | PENDING     | 火焰、烟雾和空间雾                                                                                |
| F11 | PENDING     | 地形/岛屿与碰撞                                                                                   |
| F12 | PENDING     | 植被与风场                                                                                        |
| F13 | PENDING     | 镜头控制器组                                                                                      |
| F14 | PENDING     | 角色/载具辅助层                                                                                   |
| F15 | PENDING     | 机械装配与运动关系                                                                                |
| F16 | PENDING     | 音频分析与驱动                                                                                    |
| F17 | PENDING     | 3D/DOM 连续过渡                                                                                   |
| F18 | PENDING     | 分区与渐进加载                                                                                    |

## 本次工作区基线

开始时已存在以下改动，保留且不纳入本任务编辑范围：`.github/workflows/format.yml`、`tools/README.md`、`.vscode/`，以及 `ai/plans/skills-token-evidence/current-p1-1792852467721/`、`reading-current-B1-1792852467721/`。它们不作为本任务完成证据。

## 执行记录

### 2026-10-25 / 开始

- 保存 F01–F18 功能范围、依赖和验收口径。
- 当前仅 F01 为 `IN_PROGRESS`；未实施项没有标为完成。
- 已确认原生实例化主要合并 renderer/model，不能直接等价为无逐实例 Node 的批次；继续核对可复用的原生网格与 IA 接入。
- 尚未为本任务运行功能测试或浏览器采集；无提交、push 或发布。

### 2026-10-25 / F01 实施中

- 新增 `instance-data.ts`、`instance-material.ts`、`instance-batch.ts`：一个原生 Node/Model，共享 Mesh 缓冲、64 字节实例记录、显式容量与有效数量、范围提交、聚合 bounds、CPU 精确射线检测、借用资源引用与幂等释放。
- 明确暂存/已提交状态：包围盒和拾取只消费已提交矩阵；颜色更新不重复计算变换 bounds。
- CPU 数据合同 3 项已通过。候选浏览器 `output/vibe-f01-browser-03/report.json` 完成：实际索引绘制与 RGB、非零区间提交、2048 实例单次 draw、零实例、GPU/CPU 自有缓冲释放及借用几何复用、线性 HDR 集成。该记录只证明其指纹对应候选，不是发布验收。
- 首轮浏览器 `output/vibe-f01-browser-01/` 保留真实失败：旧 HDR 适配器给单行函数注入 `#endif` 时缺换行。已修复 `effect-json-contract.ts` 并在现有 HDR 测试中补充边界断言；未修改抽取 Cocos 源码。
- 使用 `AIR_OUT_DIR=output/vibe-f01-candidate` 隔离候选；默认开发服务器也可能自动重建 SDK。build number 属构建生成状态，不改变版本或宣称默认产物已完成发布验收。
- 新增使用指南与 `examples/instance-batch/`，正在完成示例运行和声明检查；尚未将 F01 标为 `VERIFIED`。

### 2026-10-25 / F01 定向验证完成

- 当前候选：`output/vibe-f01-candidate/cocosair.module.js`；当前原始验证：`output/vibe-f01-verified/report.json`，`completed:true`、无控制台错误。源码与候选 source map 已绑定，所有输入字节在采集中保持不变。
- 真实 GFX 观察：一个原生索引实例化 draw 绘制 3 个彩色实例（每实例 36 索引）；扩容后一个 draw 绘制 2048 实例。批次没有逐实例子 Node。这里记录绘制事实，不承诺通用帧率或 GPU 完成时间。
- 验证零实例无绘制；非零区间更新不误写其他实例；父节点变换、已提交包围盒与 CPU 射线选择一致。未提交矩阵不会提前影响画面、bounds 或 picking。
- 重复 dispose、直接销毁 owner Node 均释放自有 GPU/CPU 缓冲；实际 `gl.isBuffer` 检查删除，借用的 Mesh 仍可供新批次复用。
- HDR 集成读回保留线性 `[4,1,0.25,1]`。HDR 与 AFTERLIGHT 的原有定向浏览器回归也通过，分别保留在 `output/vibe-f01-hdr-regression/`、`output/vibe-f01-afterlight-regression/`。
- 示例真实操作通过：144 → 2048、前 16 个实例范围更新、清空/恢复、点击拾取实例 143。入口 `/instance-batch/`，源码[示例](../../examples/instance-batch/index.html)，说明见[指南](../../docs/guides/instance-batches.md)。Gallery 只新增 draft，既有条目状态不变。
- `typecheck`、示例类型检查、声明构建、相关 21 项 Jest、格式、`verify:web-only`、`verify:file-map`、文档引用与 191 个示例规格检查通过。相关记录为 `output/vibe-f01-{types-final,example-types,unit-final,dts,format-check,web-only,file-map,doc-refs,spec-canonical}.log`。
- CI 范围调整：为 F01 的 3 项 CPU 合同，只在已有显式 Jest 列表新增 `instance-batch-data.test.ts`；编辑前重读差异，保留原有并行 P1 路径变更。未编辑并行的 `tools/README.md` 或已有 B1 记录。
- 限制：当前默认材质为不透明双面 unlit；不提供逐实例透明排序、骨骼/Morph 动画、阴影 pass 装配或 GPU picking。未执行全浏览器/全 Gallery 发布采集，压缩 SDK/npm 发布队列不是本批验收内容。无提交、push、版本升级或发布。

### 2026-10-25 / F02 接入核查开始

- `src/cocos/particle/particle-system.ts`、CPU/GPU renderer、发射器与曲线实现已在源码树内，`src/cocos/particle/index.ts` 已列出 `ParticleSystem` 等导出。
- 当前 `src/cc.config.json` 仅声明 `particle-2d`，`src/exports/particle.ts` 不存在；不能以树内有类就宣称默认 SDK 已支持 3D 粒子。
- 旧范围文档提及缺少 `optimized-curve.ts`，当前文件确实不存在，但当前粒子源码未发现对它的引用；不能仅按旧缺失文件列表认定运行阻塞或盲目补文件。
- 下一步：核对最小依赖闭包、原生 builtin 粒子材质和纯代码生命周期，再决定最小入口/feature 接入。F02 尚未实现或验收，不标记通过。

### 2026-10-25 / F02 实施与真实运行定位

- 通过 AIR 现有聚合入口新增 `particles.ts`，导出原生 ParticleSystem/CurveRange/GradientRange/Burst 与模块，并提供 `createAirParticleSystem({parent,useGPU,configure})`。不另建 feature unit 或模拟器，不改变版本。
- 装配器在 inactive、未挂载 Node 上创建模块并配置，再挂载激活；补充尺寸、速度倍率、序列帧网格及拖尾生命周期/宽度的中性默认值。GPU 明确拒绝拖尾/噪声/限速，不静默接受无效配置。
- 原生最小修复已登记 upstream map：拖尾 enable 在未绑定时保存状态；onInit 绑定后先解析材质，再构造 model，避免缺失 transform；序列帧 tiles 与 renderer alignment setter 在未绑定时延迟刷新。
- 保留失败：`output/playwright/vibe-f02-01/` 是纯导出 index 被 tree-shaking 移出 source map，后续改为只做 index 字节指纹、运行中校验公共导出；`02/` 确证拖尾材质/transform 初始化顺序；`03/` 是采集器错把秒级 step 当毫秒，已改为 1/60 秒；`05/` 的实际拖尾 indexCount=0 揭示纯代码默认 lifeTime/width 为零；`07/` 揭示序列帧 setter 绑定前访问 null。其余早期失败/重采均保留，不覆盖为 PASS。
- 中间候选 `output/playwright/vibe-f02-04/report.json` 已完成 CPU/GPU 画面、暂停/恢复/自然衰减/重播及实际 14 个 buffer / 2 个曲线 texture 删除与再次创建；这是修复默认值之前的部分验证，不能替代当前完整 F02 验收。
- 新增 `/particles-3d/` 示例与指南、定向浏览器采集器；仍需当前候选重采、声明/示例类型和格式验证，当前不标为 VERIFIED。未提交或 push。

### 2026-10-25 / F02 默认 SDK 与回归完成

- 默认 JS 已重新构建；`output/playwright/vibe-f02-default/report.json` 的 `completed:true`、`subset:true`、errors=[]，绑定当前 `build/cocosair.module.js` 与相关 AIR/原生源码。不是沿用候选或历史 PASS。
- 同一套真实 Chromium 验证覆盖：CPU/GPU 彩色像素、CPU 拖尾实际 indexCount、生命周期尺寸曲线数值、暂停/恢复/自然衰减/清空重播、四组 CPU/GPU × Local/World 的正确位置与错误位置空白、原生资源删除、再次创建、失败配置清理与 GPU 不支持模块显式拒绝。候选完整用例另存 `output/playwright/vibe-f02-12/`。
- `/particles-3d/` 的按钮和喷射/火星/烟雾粒子/雨/雪五种配置全部通过。采图计数时隐藏 HUD，避免 DOM 文字充当粒子像素；不是体积烟雾（F10）或任意 GPU 计算/力场（F03/F04）的验收。
- 默认 SDK 的 F01 实例批次浏览器回归：`output/playwright/vibe-f02-instance-regression/report.json`，completed=true，无错误；21 项相关 Jest 通过，见 `output/vibe-f02-related-cpu.log`。
- `typecheck`、示例源码类型检查、build:dts、仅使用生成声明的示例消费检查、Web-only、upstream-file-map、文档引用和 192 个示例规格检查通过。记录为 `output/vibe-f02-{types-final,example-types,dts,dts-consumer,web-only,file-map-final,doc-refs,spec-final}.log`。新增示例保持 draft，未发布完整 Gallery campaign。
- 构建中遇到旧锁的 PID 被 Windows 复用：已核对锁写入早于当前进程启动，并只删除该临时锁；记录 `output/vibe-f02-stale-build-lock.json`。未停止其他进程或改动锁实现。构建计数自然递增，不修改版本。
- 原生初始化修复仅涉及 3 个粒子文件；映射 modifiedCount 根据实际 230→233。默认/候选压缩产物与 npm 发布队列、全浏览器矩阵未运行，不宣称发布就绪。未提交或 push。

### 2026-10-25 / F03 开始

- 先新增内部 `point-shapes.ts`，建立 flat Float32 位置/线性 RGB 数据合同；实现按 alpha 加权的图像采样与按面积加权的三角网格采样，固定 seed、透明/退化/非法索引明确处理。没有逐点 Node，也不修改输入资产。
- 此内部模块尚未从 SDK 公共入口导出；GPU 渲染、文字光栅入口和实际形变验收尚未完成，不能把 CPU 采样测试当成 F03 完成。
- 下一步按任务书的 F03 设计实现 GPU 形态纹理与点/体素材质，复用 F01 的原生实例批次；全形态 envelope 提供保守 bounds，进度更新只改 uniform。F04 的反馈模拟和力场独立跟进。
- 首批采样合同 3 项 Jest 通过，验证透明排除/Y 方向/线性色彩/seed、面积权重与重心颜色、非法或退化数据；`typecheck` 通过。记录为 `output/vibe-f03-shape-tests.log`、`output/vibe-f03-types.log`。只在既有 CI 显式 Jest 列表新增此测试路径，保留并行会话的 Skills P1 指针。
- F03 目前没有 GPU 形变画面或上传量实测；保持 IN_PROGRESS。新内部采样器未进入当前默认 SDK，因此不把 F02 的 SDK 报告当成 F03 验收。

### 2026-10-25 / F03 GPU 实施中

- 新增 `morph-data.ts`、`morph-material.ts`、`morph-field.ts` 与 `point-text.ts`，通过现有 SDK 导出形态场与三种采样器。形态位置和线性 HDR RGB 使用两张 RGBA32F 纹理；进度只写原生 Material uniform。点和体素均复用 F01 单 Node/Model 的索引实例化。
- 每个样本按全部目标形态建立 envelope；点图元为面向相机的圆形 quad，采用局部空间逆变换并保守扩边，体素为有面向明暗的不透明 cube。没有透明排序、GPU picking 或反馈模拟。
- 文字等待 `document.fonts.load` 后采样字形；临时 canvas 在 finally 清零。同字体/系统/seed 可重复，不承诺不同浏览器字体栅格逐字节相同。
- `output/playwright/vibe-f03-01/report.json` 首轮完成：实际 6/36 索引的点/体素实例化、端点/0.5 进度 RGB 像素、实际无实例流/形态纹理重传、文字绘制和资源删除/外部 Node 销毁。该报告是候选核心子集；示例和更完整边界尚待验证。
- CPU 采样/atlas 合同扩展为 5 项并通过，记录 `output/vibe-f03-data-tests-02.log`；源码与示例类型检查通过。`/morph-field/` 示例使用 16,384 点、文字/球体/圆环/原创图像与现有 HDR 后处理；尚未据此承诺帧率或更新正典发布证据。

### 2026-10-25 / F03 默认 SDK 定向验证完成

- 当前默认 JS/声明已重建。最终真实 Chromium 报告 `output/playwright/vibe-f03-default-final/report.json`：completed=true、subset=true、errors=[]；采集前后输入指纹保持，source map 绑定当前形态/采样/实例化源码。未重写历史报告或将候选结果冒充默认产物。
- 真实 GFX：点为每实例 6 索引、体素为每实例 36 索引；示例 16,384 样本均只有一个 indexed instanced draw，不含逐样本子 Node。形态位置/颜色在 GPU 中插值，0/0.5/1 进度像素通过；线性红/蓝中点实际输出 [188,0,188]。进度变化期间 ARRAY_BUFFER 的 bufferData/bufferSubData 与两张形态纹理上传均为零，允许原生 uniform 上传。
- 4099 样本、多行 atlas 的末端寻址通过；源形态完全位于视锥外而目标可见的用例通过。父变换后 GPU 像素位置与 bounds 一致，零缩放不产生毒化画面。没有把静态几何 CPU raycast 暴露为 GPU 位置拾取。
- 文字先加载字体，确认同环境/seed 重复结果、2048 样本实际字形像素与临时 canvas 清零。图像/网格/atlas 5 项 CPU 合同全部通过；相关组合共 26 项 Jest 通过：`output/vibe-f03-related-cpu.log`。
- 资源回归追踪实际 createBuffer/createTexture 句柄并先确认存活，再验证所有自有句柄退役：正常/重复 dispose 删除 6 个缓冲和 2 张纹理，CPU/GPU 记账归零，scene 无残留 model；外部销毁节点与再次创建通过。第二张纹理分配注入失败后第一张真实纹理被删除，预算拒绝发生在分配前。
- FORM / MATTER 的四种形态、手动进度、自动往返、暂停/恢复、拖动旋转、点/体素重建与幂等退出通过。桌面/竖屏检查实际像素；相机为标题和控制栏保留区域。`output/playwright/vibe-f03-03/example-portrait.png` 保留了首个 resize 边界单帧黑图，最终按显式 resize 与两个受控帧稳定后验证 backing/post 尺寸 360×640，并检查几何像素，未把截图存在当作通过。
- `initialDataBytes` 表示资源 payload，`transitionDataBytes` 仅表示形态/实例数据；均不伪称完整 GPU 传输/完成耗时。示例 GPU 图元/实例/形态约 3 MiB，不等于浏览器总显存。没有通用 FPS、260K 实例或 compositor present 承诺。
- `typecheck`、示例类型、build:dts 与仅消费生成声明的示例检查、Web-only、file-map、doc-refs、193 个示例规格检查和格式/diff 检查通过。原有声明构建的 deprecation/TemplateLiteralType 提示保留，不视为新失败。F01/F02 默认 SDK 浏览器回归分别保留在 `output/playwright/vibe-f03-{instance,particle}-regression/`，均 completed=true、无错误。
- 新示例保持 draft；未执行完整 Gallery campaign、压缩/npm 发布队列或多浏览器矩阵，不宣称发布就绪。F03 无新增抽取引擎源码改动。保留并行 Skills P1 指针/记录、`.vscode/` 和其他既有差异；未提交、push 或改版本。下一项 F04 仍为 PENDING。

### 2026-10-25 / F03 光泽增强

- 用户反馈原效果无光泽；新增 opt-in `surface:'polished'`、roughness 与 `setSurface()`，默认 unlit 兼容。摄影棚环境反射、Fresnel/清漆亮带、点微珠/体素面法线共同形成高光，不冒称原生灯光或完整 PBR/IBL。
- AirPointShape 可携带法线，网格采样插值顶点法线或生成面法线；使用两张 atlas 的空闲 alpha 通道编码，无新增纹理。原始 RGB/unlit 输出仍有真实像素回归。
- 首候选 `output/playwright/vibe-f03-polish-01/` 已通过粗糙度实际像素差、零强度、恢复 unlit、无数据重传和资源释放。6 项采样/atlas CPU 合同通过；当前继续改善连贯高光并重采，旧 VERIFIED 报告不作为当前新增表面的最终验收。
- 最终默认 SDK：`output/playwright/vibe-f03-polish-default/report.json` completed=true、errors=[]；粗糙度 0.06/0.8 的真实高光像素差异通过，强度零为黑，切回 unlit 恢复线性颜色中点输出。示例默认抛光、暗色背景、金属基色和更连贯的清漆亮带；圆环倾斜展示，点径调整为 0.07。
- 当前仍为两张 atlas、16,384 样本单次 indexed instanced draw；样本数据不随表面/粗糙度/进度更新重传。验证了全部 6 个自有 buffer 和 2 张 texture 的实际删除，外部销毁、重复释放、失败清理和竖屏画面通过。保留原色/抛光与不同粗糙度的截图对照。
- 默认 JS 与声明已重建，typecheck、生成声明消费、示例类型、27 项相关 CPU、F01 浏览器回归、Web-only、doc-refs、193 个示例规格与格式/diff 检查通过。记录 `output/vibe-f03-polish-*`。程序化摄影棚并非真实环境图/原生灯光或完整 PBR；F06/F07 状态保持。无提交或 push。

### 2026-10-25 / 清理、完整编译与 Git 交付准备

- 按用户指令移除 57 个确认为空、非链接且位于 build 直接子目录的临时构建目录；没有递归删除验证数据。保留 decoder、缓存、失败/最终原始记录及并行工作。清理记录 `output/delivery-vibe-20261025/cleanup.json`。
- 提交前新增“初始关闭拖尾，运行中首次开启”复现：旧版实际 indexCount=0，直接诊断暴露未绑定 owner；初始化原本在模拟之后。将原有按需初始化移到 CPU 模拟前，并在绑定后同步拖尾材质。仅最小修改原生粒子文件，file-map modifiedCount 按事实 233→234，基线与版权保持。
- 失败记录全部保留在 `output/playwright/vibe-delivery-trail-before/`、`vibe-delivery-trail-after/` 与 diagnostic 系列。修复后默认/压缩 SDK 的真实回归均观察到延迟开启拖尾 indexCount=210；未用手动调用 update 代替正常帧驱动。
- 最终 `build:all` 与 `build:spark` 成功，包含开发/压缩 JS、map、声明、npm 副本、数学入口及独立 Spark；没有发布 npm、打 tag 或更改版本。日志 `output/delivery-vibe-20261025/{build-all-final,build-spark}.log`。构建计数自然递增。
- 最终产物浏览器报告：`output/playwright/vibe-delivery-{particles,particles-min,morph,morph-min,instances}/report.json` 均 completed=true、errors=[]。保留每份 SDK 指纹、画面和资源证据；不是完整 Gallery 或多浏览器发布验收。
- 本轮 27 项 CPU 回归及既有未推送父提交的 10 项 shader/layout 回归通过；完整 format:check、typecheck、Web-only、file-map、doc-refs、声明消费和 193 个示例规格检查通过。所有日志位于 `output/delivery-vibe-20261025/`。
- 本轮改动按路径/共享文件 hunk 隔离。另有本地父提交 `469a9e65`，其 Skills CI/B1 配套仍在并行工作区，范围单独确认；没有覆盖、清除或伪造这些记录。针对当前封存 B1 的完整 P1 checker 新跑 PASS；原有 Windows symlink 工具回归 BLOCKED 记录保持，不将其冒称通过。

### 2026-10-25 / Docs 与 Skills 同步、B1 和提交范围确认

- 用户明确授权核验并一并提交此前 Skills 配套，并授权独立冷读后完成提交推送。保留本机 `.vscode/`；不修改已有封存答案、payload 或失败结果。
- Docs 补齐三类 Code First 指南入口，纠正 README 的“3D 粒子未支持”旧结论；scope-decisions 保留历史分类并增加当前覆盖说明。指南使用公开包名 `cocosair.js`，补上延迟开启 CPU 拖尾的初始化边界。
- Skills 新增显式实例批次、3D ParticleSystem、GPU 点/体素形态场三份主题参考，补齐抛光/粗糙度、法线、两张 atlas、uniform 与数据上传的区别、资源归属及验收边界。既有 22 个技能、只读宿主声明、原有触发/用途和完整历史实例化正文保留；未启动第二阶段切片或共享内容迁移。
- 元数据预算、索引、路径、无损保留和双视图路由通过。首轮预算/触发词长度失败保留在新的 P1 archive 中，修正内容以适应原门禁，没有放宽规则。六份文档代码片段用当前生成声明进行类型检查，通过；脚本补齐上下文变量的失败也保留。
- 首次独立 B1 在快照 ad9d46f 得到 5/6，因未明确网格端 shadowCastingMode 而失败。保留该答案与真实回执，在 rendering 入口补充灯光/投影网格/接收面开关后冻结 e99d41033b9e2a8dcee26a8bb8d04e6708f338603514be4b905f86a2363a7fad；第二位无历史冷读者封存后 6/6 PASS。
- 事件适配首次使用 completed 而非门禁要求的 complete/outcome/answer_checks，P1 如实失败。保留原始 events-reader-original.jsonl 后只补充模式别名，未改变答案哈希、读次、文档字节或判定；首次试验保持 failure，第二次保持 success。
- 最终完整 P1 checker PASS，包括原始缺陷预期 FAIL、immutable restore、当前路由/元数据/无损校验、真实 B1 和完整 A-only 复制校验。新 B1 文档输入 C=40675，对照原始 85260；这是固定阅读协议的文档成本，不是计费 token 或运行时验收。CI 选择 reading-vibe-guides-refined-B1-20261025，旧记录保持各自历史身份。
- 两个新的干净目录重新生成索引，均与当前字节一致。当前 Skills 与最终冻结快照仍完全匹配。本次仅文档/Skills/CI 证据改动，不重复重编此前已验收的 SDK。
- 本地完整工具回归仍为 169 项、159 通过、10 项因 Windows 真实 symlink EPERM 失败，未跳过或改断言。manual-doc-consistency 的 10 项失败，与使用 HEAD 原索引、原检查器得到的失败清单完全一致；这是存量失败，未冒称通过。文档引用及格式检查通过。
- 新验收材料与完整失败留存在 `ai/plans/skills-token-evidence/vibe-guides-p1-20261025/` 及两份 reading-vibe-guides 记录；原 current-p1 / reading-current 记录一并保留。汇总 index 对本地权限限制维持 BLOCKED，区分 P1 checker PASS；不宣称完整发布就绪。
- 封存答案含原始末尾回车，Git 全文本 whitespace 检查提出警告；不能为消除警告改动答案哈希。读取 trial 通过 .gitattributes 禁止换行转换，按原字节保留。源码/说明文档单独做 diff 格式检查，另直接校验暂存区的答案 SHA 与完整 Skills 快照，避免“工作区验证通过、检出后失效”。没有添加格式忽略项或降低 P1 验证。
