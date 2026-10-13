# Wave5 同源生成工具：十三项交付

> 本文的 `output/` 路径是未随仓库分发的本地历史产物，保留为溯源记录；不作为可点击仓库链接或当期验收证明。

2026-10-12 更新。本子项为 NODE_CONTRACT 验证通过，Wave5 当前 SDK 总 Gate 仍 BLOCKED。历史证据：生成与类型消费者验证（本地历史产物：`../../output/shaders-absorption/lead-w5-docs-r1-validation.json`）。W1–W4 的浏览器 Gate 保持独立，不由本工具重新授予。

## 1. Goal

从十三份现有 EffectDefinition 生成 TypeScript 参数接口、参数表、API 参考、Agent 参考和验证元数据，并拒绝参数、来源、类型、API 与生成产物漂移。运行时源码保持冻结。

## 2. Upstream references

固定上游 `shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a` 不变。本工具读取本地已实现定义：十二份 `parameters.json`、[E01 参数源码](../../examples/shader-noise-dissolve/src/parameters.ts)的导出字面量。没有加载或执行上游 runtime。

每例元数据记录定义、参数 TS、main、example.json、SDK 声明和 API 库存的完整 SHA-256/bytes；另记生成器、合同与 API 检查工具、格式配置和工具链版本。生成器只读取 SDK 声明，不读取运行时 JS。运行时三产物的完整字节身份继续由 Engine collector 绑定；定义检查不是浏览器验证。

## 3. CocosAirJS APIs used

工具自身不调用引擎运行时 API。API 文档从各例的实际 `api.claims` 生成，源证据调用生产 `validateAPIEvidence` 核对可执行行和声明的 validator，再与绑定当前声明指纹的 API inventory 核对公开符号。类型消费者实际导入 SDK `createAirApp`。

## 4. Implementation details

[生成器](../../tools/examples/shaders-effect-docs.cjs) 使用 TypeScript AST 递归读取字面量，允许尾逗号、注释、字符串转义与负数；拒绝调用、变量引用、插值、spread、accessor、computed key、重复 key 和语法错误，不使用 eval 或 Function。

适配层复用现有 EffectDefinition/parameter 合同：明确兼容 E09 `effect-parameters/1`、`variant-or-uniform` 和 C04 `schema/default/values`。C04 route 进入结构键；条件 variant 保守作为 pipeline。结构键包含定义、实际结构参数值和提供的来源身份，uniform 值变化不改键。原定义与适配策略均可追溯，未修改源 schema。

源参数检查使用真实导出 Params/Parameters 类型的 AST 属性集合，精确拒绝 missing/extra。生成后的五产物采用仓库 Prettier 配置；`--check` 只读比较字节和源合同。测试通过可注入 root/outputRoot 在系统临时目录生成、损坏和清理夹具。

五个产物：

- [十三接口与 union](../../tools/generated/shaders-effect-params.d.ts)
- [参数表](generated/shaders-effect-parameters.md)
- [API 文档](generated/shaders-effect-api.md)
- [Agent 参考](generated/shaders-effect-agent-reference.md)
- [验证元数据](generated/shaders-effect-validation-metadata.json)

## 5. Tests performed

`npx jest --runInBand test/smoke/shaders-effect-docs-review.test.ts test/smoke/shaders-effect-docs.test.ts`：2026-10-12 两套件 **47/47 PASS，exit=0**。Lead review 16 条与自有合同 31 条包含孤立产物写入、字节幂等、missing/drift 不修复、纯解析拒执行、getter 不调用、cycle 拒、结构键、注释伪参数、额外参数、未知 API、源行号与 SDK 声明指纹漂移。新增回归实际拦截文件读取，证明生成过程中没有读取两个运行时 JS，仍绑定声明，并保持 engineVerified 为空。当前 CLI `--check` exit=0；历史报告中的 46 项结果保留，不改写为新结果。

CLI `--write → --check` 两轮，所有五产物 SHA/bytes 精确一致。TS 4.9.5 实际消费者编译十三个接口及 SDK import：`strict/noEmit/skipLibCheck/ES2022/commonjs` **exit=0**；追加非法 shape 枚举赋值 **exit=2 / TS2322**。`skipLibCheck` 保留现有 SDK 声明消费合同，消费者本身仍严格检查。临时消费者已清理，正式报告保留实际 OS 命令、stdout、exit/signal/error。

本批格式检查和本地引用检查在交付前执行；独立测试与正式证据还检查生成文档的相对链接，不能只依赖未涵盖所有子目录的通用 doc-refs。

## 6. Screenshots / Visual verification

NOT_RUN。本批无视觉改动、无浏览器窗口、无截图。类型与文档合同不能替代已有或后续 GPU/compositor 验收。

## 7. Performance measurements

NOT_RUN。工具在 Node 中运行，不进入主循环；格式化通过单次 Node 子进程适配 Prettier v3 异步 API。没有测量 Agent token、人工时间、GPU 或 Driver/Fusion 收益。

## 8. Resource lifecycle

无引擎资源创建。测试和类型消费者的全部写入限新建临时目录，删除前核对绝对路径、父目录和专用前缀。修复了首版测试改写/删除正式产物的问题。

## 9. API DX gaps

DOC_GAP：十三定义的 schema/alias/updateMode 尚未统一，本工具记录并适配，未为统一格式改冻结源。AGENT_FAILURE：首版结构键只记参数名、文档自授 engineVerified、TS 使用 Function、默认值与链接漏适配、错误 pass 表和不隔离测试，均已纠正。无新 ENGINE_BUG 主张。

## 10. Workarounds

Node 同步 renderer 用单次受控子进程执行异步 Prettier，配置从仓库解析；不安装依赖、不变更格式规则。C04 route 与 E09 variant 的映射为明示的工具适配策略。

## 11. Proposed engine changes

本批无引擎改动。[六项能力提案](wave5-capability-proposal.md)提供至少两个真实消费者、前后用法草案、归属、性能和 Agent DX 未测边界。仅同源工具已实施；SDF/颜色/RT/Driver/Fusion 的草案不等于 shipped API。

## 12. Validation status

同源生成与文档合同 PASS。元数据 `engineVerified/agentVerified/stable` 均为空，`engineGateStatus=NOT_EVALUATED_BY_THIS_TOOL`，仅链接独立前置 Gate。历史类型消费证据绑定 module `69127f39…`、dts `5b67a560…`、npm `b7771393…`；后续并行构建改变运行时字节，不能继续声明当前 SDK 与前置链一致。当前生成元数据绑定实际消费的声明和源码，消除未读取的运行时 build stamp 造成的文档失效；Engine Gate 的 SDK 检查未放宽。

执行渠道：Orca Worker 提供首版并尝试修复，因 `429 / 1308` 额度中断；Lead 接手最终实现、隔离测试、真实类型消费者与正式验证。历史 46 项及本轮 47 项均为 Lead 的实际执行结果，不冒称 Worker 完成。无 stage/commit/push。

## 13. Known limitations

生成类型不取代示例运行时校验；C04 只读 time 的限制仍由宿主执行。API 库存检查依赖其与当前 SDK 声明指纹一致，源行号只证明 API 用例位置，不证明运行成功。格式工具版本变化会造成生成字节漂移，需要重新生成。

Effect Driver 和两个 UV Remap/Pass Fusion Pilot 的真实证据见各自交付，本工具不重新授予其状态。Wave5 当前 SDK Gate 受字节漂移阻塞，独立 W2–W4 Gallery、Agent Gate/stable 未由本批验收。Pilot 使用独立路径和真实原生管线，保留母算法、存储与资源合同，按实际证据决定是否提炼公共能力。
