# B2：postProcess 名称出现不等于后处理可直接运行

不能。默认 bundle 的导出块中存在 postProcess，只能证明这个命名空间在该 bundle 的导出面可达，不能证明当前应用启用了后处理管线，更不能证明某个后处理效果已在当前候选版本的浏览器中运行通过。原始文档的 owner decision #6（D11 / LV12-17）仍将当前 shipping posture 的后处理判为不可达，采用 variant-build-level evidence 的口径。

## 必须分清的层次

- source-export / 声明：src/exports/custom-pipeline-post-process.ts 导出 postProcess 命名空间；声明中出现 PostProcessSetting、PostProcess、FSR 等成员，只证明符号或类型存在。
- bundled / 默认 bundle 导出：src/exports/air.ts 第 39 行 re-export custom-pipeline-post-process，默认 ESM 导出面存在 index as postProcess。默认 26 个 AIR_FEATURES 中也同时有 custom-pipeline 和 custom-pipeline-post-process，但 feature membership 只是编译/资产注册条件，不会自动选择实际管线。
- configured / 实际配置：要看初始化设置、运行中的管线及 builder；检查 director.root.usesCustomPipeline。默认 AIR bootstrap 只有 rendering.renderMode，没有 rendering.customPipeline，所以默认走 legacy forward。legacy forward 不读取 camera.postProcess；legacy 模块 re-export PostProcessStage 也不意味着后处理正在执行。
- verified / 浏览器验证：需要在匹配当前候选代码、实际 bundle 和配置的真实 WebGL 2 浏览器中，验证后处理 pass 和实际效果。符号解析、类型检查、CPU stub、摄像机属性读回以及历史 PASS 都不能代替这项验证。

## 导出名称与初始化门槛

rendering 是另一个 custom-pipeline 命名空间。其源入口 src/exports/custom-pipeline.ts 导出 rendering，并设置 legacyCC.rendering；air aggregate 没有直接 re-export ./custom-pipeline，然而文档解析的默认 bundle 导出块确实有 rendering，包含 createCustomPipeline、setCustomPipeline、getCustomPipeline 等。这些事实须分别报告，不能凭源 aggregate 中没看到 re-export 就断定 bundle 无名称，也不能凭 bundle 有名称就断定它保持可用。

初始化时，rendering.customPipeline 为假会把 cclegacy.rendering 清成 undefined。为真但命名空间缺失会报 errorID(12109)。game._setupRenderPipeline 读取该设置并把布尔值传给 root.setRenderPipeline；只有真值才进入 custom branch，legacy branch 会设置 usesCustomPipeline = false。director 还要求 macro.CUSTOM_PIPELINE_NAME 非空、cclegacy.rendering 存在、root 存在且 root.usesCustomPipeline 为真，才会接入 custom builder。

post-process 模块通过副作用注册 Forward 和 Custom 两个 PostProcessBuilder。macro.CUSTOM_PIPELINE_NAME 默认是 Builtin；未知名称的查找有 Forward fallback，但应明确让名称指向已注册 builder，而不是把名称存在当作完整配置。camera.postProcess、camera.usePostProcess 是组件接口并映射到 render-scene camera；后者默认 postProcess = null、usePostProcess = false，只有实际消费这些字段的管线才能发挥作用。仅给摄像机设置这些属性不足以越过上述初始化门槛。

## 若要尝试后处理，应满足与验证什么

按该快照的约定，应使用独立构建并交付的 AIR_FEATURES / AIR_OUT_DIR variant，提供 rendering.customPipeline 为真的 settings 对象，确保 custom-pipeline 命名空间不会在初始化中被清除，并选择已注册的 builder。AIR_FEATURES 环境变量替换默认列表，不是追加；variant 与默认构建是不同候选，variant 不会自动刷新默认产物或默认验证证据。

AirAppOptions 没有 pipeline 键，renderMode 也不是选择后处理管线的开关。因此不能编造 createAirApp({ pipeline: ... }) 作为可运行方案；文档列出的 variant、settings 和 builder 条件也只是必要门槛，不能自行升级为浏览器通过结论。

验证时记录实际 usesCustomPipeline、builder 选择、摄像机和后处理配置，证明目标效果的 pass 实际执行及渲染像素发生预期变化，再把报告与当前候选指纹和实际 bundle 绑定。默认包和 variant 的验证结果分别归属各自候选。

现有 camera-viewport-props / camera-geometry-extras 的 postProcess 证据仅是摄像机属性的字符串读回，没有断言后处理 pass；rendering 在默认 bundle 上没有记录到相应浏览器验证。CPU competitive-early-effect 测试通过重赋值或 stub cclegacy.rendering 驱动分支，也不能证明默认 bootstrap 可用。该引用文件记载的旧 examples-verified.json 指纹是 2f089f6ce25eaccd，而文档当时重算的树指纹为 8f3e573cebbb315f，不能把旧 PASS 当成当前字节的证据；此处没有实际运行浏览器或重新测量指纹。

依据：skills/cocosair/SKILL.md；skills/cocosair-rendering/SKILL.md；skills/cocosair-rendering/references/pipeline-reachability.md。所有结论仅限固定原始快照的文档信息。
