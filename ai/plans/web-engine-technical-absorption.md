# Web 引擎技术借鉴与可靠性补全任务书

记录日期：2026-11-15。状态：实施中。对应[执行台账](../ledgers/web-engine-technical-absorption.md)。

## 目标与边界

把 2026-11-11 Web 引擎监控报告中适用于 AIR 的技术落到原生 GFX、Code First helper、诊断工具和回归场景。先复现相似风险，再做最小修复；上游存在缺陷不等于 AIR 存在同样缺陷。

- 默认 WebGL2，WebGPU 保持显式实验后端；不新增静默回退或透明设备恢复承诺。
- 复用现有 Cocos Scene/Texture/Material/GFX 接口，不引入其它引擎运行时。
- 保留已有内容 hash、Shader 结构化错误、描述符底层资源身份比较、渲染目标 generation、GPU timer 和 Skills 路由。
- 不纳入完整 Shader 编译器重写、Meshlet、NanoVDB、草案 SPZ、默认时域降噪或 Skills 全树重组。
- 保留并行 glTF sheen、Android 互操作、harmony 示例和本机配置改动。本任务不提交、推送或发布，不修改版本号。
- 新增 CPU 用例只覆盖真实行为边界；GPU 正确性以真实后端、读回、画面及 validation error 为依据，不能仅检查字段。

## 基线与已知事实

- `src/air/context-health.ts` 已实现 lost/restoring/failed 与受控重载，两个后端均不承诺原地重建。
- `WebGPUDescriptorSet` 已比较 GPU buffer/texture/sampler 身份；不重复增加仅比较 JS 对象的缓存。
- `WebGPUCmdFuncResizeTexture` 当前立即销毁旧 native texture 再创建，待验证编码中 resize 的提交边界。
- `AirRenderTarget` 当前为 WebGL2 单颜色附件 helper；原生 GFX 已有 MRT 和整数附件清屏。
- `tools/verify/performance-axes.cjs` 已有 WebGL2 disjoint timer 与 CPU/GPU/present 分轴。
- `effect-json-contract.ts`、`shader-diagnostics.ts`、ProgramLib 已有默认数组、内容 hash、冲突拒绝及带源码行号错误。
- `html-source.ts` 当前仍强依赖实验性 capture API，应按能力适配新版上传接口。
- `skills/README.md` 已规定单路由、按需引用和真实评测；不因上游合并技能数量而撤销现有触发合同。

## 任务与验收

| ID | 优先级 | 工作 | 依赖 | 状态 |
| --- | --- | --- | --- | --- |
| WA-01 | P0 核查 | GPU 资源身份、编码中替换与安全回收 | 无 | VERIFIED（定向，见台账） |
| WA-02 | P0 核查 | 设备丢失与异步任务终态隔离 | WA-01 | VERIFIED（定向，见台账） |
| WA-03 | P1 | 混合格式 MRT 与共享 MSAA 合同 | WA-01 | VERIFIED（定向，见台账） |
| WA-04 | P1 | GPU 区域/Pass 计时与指标语义 | WA-01 | VERIFIED（工具定向，见台账） |
| WA-05 | P1 | 独立 Shader 预检与结构化诊断 | 无 | VERIFIED（定向，见台账） |
| WA-06 | P1 | HTML-in-Canvas 能力适配 | 无 | VERIFIED（定向，见台账） |
| WA-07 | P1 | 首帧、多帧与资源变化视觉回归 | WA-01～06 中相关能力 | IMPLEMENTED（场景已验证；硬件 HDR 精确门禁仍 FAIL） |
| WA-08 | P2 | API/Skills 版本绑定与任务指引 | 已验证实现 | VERIFIED（文档/真实 B1；基线依赖完整 P1 通过，当前依赖兼容性开放） |

### WA-01：GPU 资源身份与安全回收

先复现：绑定蓝色 64² 纹理，编码 draw/copy 后、submit 前 resize 到 128² 并上传红色，再提交旧命令、使用新资源绘制；另覆盖共享描述符、不同 sampler、重复 resize、destroy 和设备关闭。

若旧命令引用提前销毁的纹理，按实际命令编码与提交生命周期保留旧 native resource，在最后一个合法未提交使用结束后回收；已提交命令遵循 WebGPU 自身完成语义。不为每次更新同步等待整条 GPU queue。失败、放弃编码和设备销毁也必须收敛。保持可读回 resolve 纹理和资源统计一致。

验收：保留修复前失败；修复后旧提交有效，新绘制为新颜色；0 GPU validation error；共享绑定正确失效；回收恰好一次且不依赖下一帧永久滞留。WebGL2 相同应用行为不回归。若风险不适用，保留真实反证而不修改核心。

### WA-02：丢失与异步终态

核查初始化、Shader 依赖、纹理加载、读回在 context/device loss、close、取消期间的完成路径。仅让仍属于当前设备/会话的任务发布结果；晚到资源必须释放，完成/失败通知不能串到新一轮。保留原始 sampler 声明与错误 cause，不在失效上下文上永久裁剪声明。

验收：丢失前/中/后注入；没有继续提交、重复完成、未结束等待或旧资源重新挂载；符合 failed + requestReload 合同，不假造恢复成功。

### WA-03：MRT 与 MSAA

在现有 GFX 上补齐每附件 format/load/store/clear/write-mask/resolve 语义与 Code First 使用入口。先做单采样 RGBA16F + RG16F + R32UI（能力允许时），后做设备合法 MSAA 组合；整数与 MSAA 不支持的组合明确拒绝。Shader 未写入的附件保持原值，整数附件不启用 blending。共享纹理 A→B→A、resize、destroy 的所有者唯一明确。

验收：数值读回未写附件、整数精确 ID、透明颜色混合及逐附件 resolve；复用纹理不会用空采样覆盖旧结果。两个后端各自报告支持/拒绝范围，不交叉代替验收。保留单附件现有行为。

### WA-04：计时

复用 WebGL collector，增加区域/Pass/帧/提交身份与异步结果；WebGPU timestamp-query 按功能支持协商，缺失返回 unavailable。WebGL2 不重叠 TIME_ELAPSED，disjoint/loss/销毁时清除相关结果。明确 CPU 提交、GPU Pass sum、GPU elapsed span、GPU 完成等待和 compositor present 不同。

验收：固定 render/copy（WebGPU 另含 compute）序列无错配；嵌套逻辑区域不产生非法 WebGL query；无特性与失效状态不输出 0ms；不把 readback 等待当 GPU 渲染耗时。工具保留在可选开发层。

### WA-05：Shader 预检

提供独立离线入口，复用 Effect JSON 归一化和身份规则，检查阶段、资源与输出接口并产生稳定 code/stage/shader/path/line。首先覆盖可确定错误；宏或跨过程语义无法证明时返回 unknown/诊断范围，不能伪装通过。重分析器不并入默认 runtime。

验收：缺资源数组、同 hash 不同源码、同名不同代码、无效显式引用、片元输出及 MRT 位置等实际输入；已接受的内建 Shader 不误报。安装包声明和命令入口可运行；静态通过不等于 GPU 编译/画面通过。

### WA-06：HTML-in-Canvas

按 requestPaint、texElementSubImage2D 等实际能力适配，区别动态 element 上传与可选 snapshot；缺 snapshot 能力不应阻断可用的动态路径。管理 drawable/content/layout 属性、异步 paint、几何更新与释放，错误说明缺少的能力。仅在实测成立时扩大公开支持。

验收：旧/新能力组合、缺能力、DPR1/2、首次 paint、尺寸变化、嵌套元素、dispose/恢复属性；实际浏览器支持时验证图片及点击位置。不用 DOM mock 证明浏览器实现支持；不可用环境明确 NOT_RUN/UNSUPPORTED。

### WA-07：视觉与生命周期场景

沿用现有 Gallery/定向探针，覆盖首次渲染、冻结稳定帧、材质重建、纹理替换、resize 与销毁后重入。资源创建不得隐藏在 Shader 编译副作用中。水面反射、MRT、HTML 场景各自有可操作控件与实际像素断言。

验收：固定相机、种子和时间，保留首次帧与 N 帧；鬼影、漏反射、暗部条带人工核查与数值断言配合。上游参考锁 commit，新参考或失败重试不改写旧 Golden。局部通过不冒称完整 example campaign。

### WA-08：文档与 Agent 使用

更新已验证能力的 docs 与最近主题 references，保持现有技能名称、触发条件、宿主字段和路由。提供带 SDK/产物身份的 API 索引与常见静默画面错误指引。若修改 Skills，执行现有完整 P1 与不可变归档检查；真实 A/B 需冻结模型、资产与任务，不引用上游问答分数作为 AIR 成功率。

验收：链接、示例代码、安装包类型、版本/后端边界一致；unknown/unsupported 和性能指标能被正确理解。未授权的 Skills 第二阶段拆分/共享迁移不启动。

## 验证与交付策略

1. 记录工作区和定向基线，先收失败再修复；不盲跑会覆盖 canonical evidence 的脚本。
2. 源码变更执行相关 CPU 回归、typecheck；引擎抽取文件登记 `docs/upstream-file-map.json` 和 `docs/UPSTREAM.md`。
3. 格式化完成后构建当前候选；浏览器证据绑定源码、bundle/map、浏览器、backend 和实际 feature。测试所需构建写隔离输出或在确认无并行构建时刷新默认产物。
4. 每项状态分为 PENDING、IN_PROGRESS、IMPLEMENTED、VERIFIED、NOT_APPLICABLE；受环境限制的验收保留待办，不靠缩范围宣布完成。
5. 局部 GPU 回归不自动重采全量 campaign、不宣称发布就绪。最终交付列出新增与存量失败、未运行项、准确路径及复跑命令。

## 官方技术依据

- [Babylon：context loss 与 sampler](https://github.com/BabylonJS/Babylon.js/pull/19033)、[GPU 清理](https://github.com/BabylonJS/Babylon.js/pull/19121)、[纹理身份与延迟回收](https://github.com/BabylonJS/Babylon.js/pull/19123)。
- [Pixi：混合格式 MRT](https://github.com/pixijs/pixijs/pull/12357)、[共享 MSAA](https://github.com/pixijs/pixijs/pull/12372)、[HTML-in-Canvas](https://github.com/pixijs/pixijs/pull/12341)。
- [three：GPUTimer](https://github.com/mrdoob/three.js/pull/35412)、[首帧水面](https://github.com/mrdoob/three.js/pull/35368)、[SSR 降噪回退](https://github.com/mrdoob/three.js/pull/35461)。
- [Galacean：中立 IR 与独立预检](https://github.com/galacean/engine/pull/3054)、[精确 Shader 引用](https://github.com/galacean/engine/pull/3159)。
- [Pixi：路由与主题 references](https://github.com/pixijs/pixijs/pull/12384)。

监控材料混合包含 11-04 和 11-11 两期；PR 已合并不等于已发布。以上链接说明设计来源，不作为 AIR 实测证据。
