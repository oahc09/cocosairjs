# 计划书实施台账（接口场景覆盖、开发范式与 Shader 示例）

> 计划书：`ai/Cocos Air — 接口场景覆盖、开发范式与 Shader 示例任务计划书.md`
> **状态：正典集成完成（r52）**。owner 指令「执行（平移目录 → 再生成 manifest → v11 全链采证 →
> 晋级冻结 → coverage 增量核对）」五步全部落地：
>
> 1. **平移**：11+2 目录 → examples/（后裁定：shader-probe/tmp-light-probe 回驻 staging，
>    Gallery 工件合同不容未登记目录的绝对路径 importmap）；shader-blocks.js → examples/shared/。
> 2. **manifest**：145 例（144 stable + gltf-catalog draft 既有）。
> 3. **v11 全链采证**：4 轮 chromium 整批（#1 131/140 诊断 9 败 → 修复 → #3/#4 **140/140，partial=false**）；
>    DevTools 5/5（candidate 45df203a 刷新）；gallery artifact **209/209**；firefox 补充 **13/13**。
> 4. **晋级冻结**：13 例 status=stable（证据驱动）+ specStatus=frozen（owner 指令落章，owner-decisions §8）。
> 5. **coverage 增量核对**：verified 420→**439（+19/-0）**；important 20→33（EffectAsset 族×6、Tween×3、
>    Animation×3、SpriteFrame.createWithImage）；core +1（Scene.destroy）；advanced 披露 +5；门禁 PASS、stale=0。
>
> 全部门禁当期复采：spec-evidence 3470 条 0 漂移 · spec-validate 145 frozen/0 draft ·
> compliance 0 fail/1 warn（draco 既有）· jest 32/263 · typecheck 0 · file-map PASS。
> 修复沉淀（正典批次实测教训）：GAP-I1 renderer.material 实例化脱钩→liveMat 模式；音频释放走
> assetManager.releaseAsset；asset paths 全 author；UICamera z=1000 引擎合同值；动画时钟轮询起步；
> lifecycle 必须销毁「引用被毁资产的存活渲染器」节点；Gallery 发布面故意失败路径改零 HTTP
> （注册表未命中/损坏 fixture）。
> 本 staging 目录 = 探针与诊断页常驻所 + 历史工作区存档；示例正典位置在 examples/。

## 批次状态总览

| 批次            | 状态                                                                                                        | 关键产物                                                                                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G0 诊断         | ✅ 完成                                                                                                     | `docs/api-scenario-gap-matrix.md`（基线/Top20/盘点/§0.2 并发/§7 缺口）                                                                                                       |
| G4 Shader 探针  | ✅ 完成（判「路径可用」→ G4.2 分支）                                                                        | `tools/verify/g4-shader-probe.cjs`、`docs/evidence/g4-shader-probe.json`（双后端 28/28 PASS）、截图 ×2、探针页 `ai/g1-staging/shader-probe/`                                 |
| G1 组合场景 ×5  | 🟢 试验级完成（5/5 试验绿 + 5/5 spec-validate 0 issues）                                                    | `ai/g1-staging/{scene-switch-reentry,ui-asset-loading,model-character-interaction,physics-interaction,render-composite}/`                                                    |
| G2 游戏/应用 ×6 | 🟢 试验级完成（6/6 试验绿 + 6/6 spec-validate 0 issues）                                                    | `ai/g1-staging/{tetris-classic,match3-classic,tank-battle,contra-action,collector-dodge,product-viewer}/`                                                                    |
| G4 正式交付     | 🟢 试验级完成（两级示例 + 共享 GLSL 样板 + 手册页）                                                         | `ai/g1-staging/{shader-custom-gradient,shader-dissolve}/`、`ai/g1-staging/shared/shader-blocks.js`、`docs/manual/custom-shaders.md`、shadertoy.md/debugging-glsl.md 状态升级 |
| G3 范式/格式    | 🟡 主体完成（范式文档 + prettier 固定版 + scoped 脚本 + 自有文件格式化；样板迁移/批量格式化/CI 按计划延后） | `docs/manual/script-component-workflow.md`、`.prettierrc.json`、`.prettierignore`、package.json `format`/`format:check`（prettier 3.9.9 精确锁定）                           |
| 正典集成        | ⬜ 待并行线落定                                                                                             | 见「集成待办」                                                                                                                                                               |

## 全量试验回归（2026-09-25 20:0x，chromium headless，staging）

`13/13 PASS`（g1-trial-run --root=ai/g1-staging --click=2）：
scene-switch-reentry 19 断言 / ui-asset-loading 7 / model-character-interaction 8 /
physics-interaction 7 / render-composite 11 / shader-custom-gradient 6 / shader-dissolve 6 /
tetris-classic 9 / match3-classic 16 / tank-battle 12 / contra-action 13 / collector-dodge 9 /
product-viewer 11。G4 探针双后端 28/28。GAP-L1 光照诊断页（tmp-light-probe）13 相位可复跑。

规格质量：11 份 example.json（G1×5 + G2×6 + G4×2 中除探针外全部）经隔离副本
`spec-validate --examples-dir --out` 全部 **0 issues（draft）**；行号/出处经
`tools/debug/g1-spec-fixlines.cjs --check` 零漂移。

## 工具链（本计划线新增，均不写正典）

- `tools/verify/g1-trial-run.cjs`：staging 试验运行器（--root/--ids/--click；browser-runtime 同源
  tsc 类型合同；pageerror 捕获含堆栈；证据写 OS 临时目录 `%TEMP%/cocosair-g1-trial/`）。
- `tools/debug/g1-spec-fixlines.cjs`：scoped 行号/出处回填（spec-evidence.cjs 同款定位规则，--root/--check）。
- `tools/verify/g4-shader-probe.cjs`：Shader 探针双后端运行器（--root；正典证据 g4-shader-probe.json）。
- prettier 3.9.9（devDependency 精确锁定）+ `.prettierrc.json`（4 空格/单引号/120 列，JSON/MD 2 空格）
  - `.prettierignore`（src/** 上游逐字节区、生成物、证据、既有 tools 全排除）
  - `npm run format` / `format:check`（首批范围：examples、docs/manual/examples、自有新工具、staging）。
    **Dry-run 基线：首批范围 410 文件不合新格式**（绝大多数为存量示例/手册示例——按计划只做审查，
    批量机械重写延后到集成后分批，避免纯格式改动淹没行为改动 + 冻结规格行号漂移）。
    本计划线全部新文件已 --write 并复验（fixlines 零漂移 + 试验全绿）。

## 缺口登记（详见矩阵 §7 + g1-light-contribution-gap.json）

- **GAP-L1（P0）**：主光/点光视觉贡献为零（静态+动态均不可观察；ambient 原位变更有效、材质 uniform 有效）。
  收敛：UBOCamera MAIN_LIT_* 写入-上传一致性或 builtin-standard 降写变体消费路径。修复涉上游抽取文件 → Deviation 流程。
- **GAP-C1**：Camera.worldToScreen 运行期输出零向量（执行计数正常）。
- **GAP-C2（扩展）**：框架 Camera 组件无 resize/width/height/aspect 导出面（inventory Camera.resize 为内部面单元）。
- **GAP-M1**：builtin-unlit 纹理宏为 USE_TEXTURE；USE_ALBEDO_MAP 静默忽略（manual-render-targets 潜在白 quad，待手册线复核）。
- **GAP-B1**：引擎引导前 EffectAsset.onLoaded / Material.initialize 抛空 device TypeError（时机纪律，范式文档已纳入）。
- **GAP-V1**：isValid 帧末语义 → 异步取消必须显式 token + isValid 双守卫（范式文档已纳入）。
- **GLTFAsset getter 防御缺口**：dispose 连带销毁资产后 `asset.meshes` 抛 null 异常（使用侧 isValid 守卫已入范式文档）。
- **loadRemote 回调式**（await Promise 形态静默 undefined）——范式文档待补一行。

## 集成待办（并行线落定后执行，顺序敏感）

1. 与并行线核对 examples/ 目录与 files.json 归属；确认其覆盖战役收口（smoke-29 EXAMPLE_COUNT、
   其新目录的规格冻结）。**注意：并行线曾清理 examples/ 未跟踪目录（17:50 事件）——迁移前先确认其验证批次结束。**
2. `ai/g1-staging/<11 例>` → `examples/<11 例>` 平移（shared 导入路径已是正典形态；
   `shader-blocks.js` 复制到 `examples/shared/`；shader-probe 与 tmp-light-probe 迁回但**保持不登记**——
   spec-validate/generate-manifest 对无 example.json 目录零感知，已验证安全）。
3. `npm run gallery:manifest` 再生成 files.json；`node tools/examples/spec-evidence.cjs --check` 全仓核对。
4. v11 正典链：chromium 整批 `v11-examples-verify`（含 --ids 分批）→ 晋级 draft→stable →
   owner 复核 specStatus frozen → `verify:api-coverage` 再生成（verified 增量逐项核对：
   预期新增 verified 含 EffectAsset 面 14、Camera.screenPointToRay、Scene.destroy、Node 树操作族、
   Texture2D.reset、SpriteFrame.createWithImage、Animation 控制面、Tween.to/delay/start、
   physics 面增量、GLTFAsset 属性面 attested 等）。
5. 浏览器矩阵（firefox/webkit --out= 非正典）按适用例铺开；G4 探针 WebGL1 强制模式已单证。
6. `npm run typecheck` + jest 全量 + `verify:file-map`（staging/新工具不触上游映射，预期无扰动）。
7. 手册侧：`docs/manual/index.md` 收录 custom-shaders.md 与 script-component-workflow.md；
   cocos4-coverage-matrix.md 相关行回填新证据；manual-render-targets 的 USE_ALBEDO_MAP 复核（GAP-M1）。
8. 格式批量：按 `format:check` 410 文件基线分批机械重写（每批后跑 spec-evidence --check 修漂移 +
   相关 jest/verify），先 examples/ 非冻结新增，后存量。
9. 矩阵 §7 缺口提交 owner 决策：GAP-L1 修复批次（上游 Deviation 流程）或披露性保留；
   GAP-C1/C2 导出面决策（补导出 or 从 required 分母重分类——均需单列证据与评审记录，不得静默改分母）。
10. G2 手册联动：manual-mini-game ↔ collector-dodge 的「升级重构」互链（game.md 引用更新）。

## 交付纪律备忘

- 全部页内行为断言失败即 throw → pageerror → no-runtime-error 红（证据不得静默）。
- 演示脚本特权（夹具注入/冻结敌人/清走廊）一律在源码注释与 effect 契约中如实标注。
- 404/编译错误等故意失败路径均被 catch，不污染 no-runtime-error；console 网络日志不在计数通道。
- 负控与试验证据写仓库外临时路径（%TEMP%/cocosair-g1-trial、/tmp/g1-spec-*）；
  正典新增仅限三个新文件：g4-shader-probe.json、g1-light-contribution-gap.json、api-scenario-gap-matrix.md。
