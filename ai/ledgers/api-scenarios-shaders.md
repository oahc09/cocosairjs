# 计划书实施台账（接口场景覆盖、开发范式与 Shader 示例）

> 计划书：`ai/plans/api-scenarios-shaders.md`
> **状态：正典集成完成（r52）**。owner 指令「执行（平移目录 → 再生成 manifest → v11 全链采证 →
> 晋级冻结 → coverage 增量核对）」五步全部落地：
>
> 1. **平移**：11+2 目录 → examples/（后裁定：shader-probe/light-contribution-probe 回驻 staging，
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
> 2026-09-26 清退（owner 指令「整个目录清掉」，owner-decisions §10）：原 `ai/g1-staging/` 工作区整目录移除——
> 探针与标定页先驻 ai/probes、同日按 owner 反馈落定 `tools/debug/probes/`（清退审计零丢失，见 §10 审计行），
> 13+1 个已晋级示例不留在制品存档，examples/ 为唯一正典；
> 本文所引 staging 路径均为清退前历史布局，读法以本注为准。

## r52 历史批次状态总览（当前收口见文末）

| 批次            | 状态                                                                                                        | 关键产物                                                                                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G0 诊断         | ✅ 完成                                                                                                     | `docs/reference/api-scenario-gap-matrix.md`（基线/Top20/盘点/§0.2 并发/§7 缺口）                                                                                                       |
| G4 Shader 探针  | ✅ 完成（判「路径可用」→ G4.2 分支）                                                                        | `tools/verify/shader-probe.cjs`、`docs/evidence/g4-shader-probe.json`（双后端 28/28 PASS）、截图 ×2、探针页 `ai/g1-staging/shader-probe/`                                 |
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
product-viewer 11。G4 探针双后端 28/28。GAP-L1 光照诊断页（light-contribution-probe）13 相位可复跑。

规格质量：11 份 example.json（G1×5 + G2×6 + G4×2 中除探针外全部）经隔离副本
`spec-validate --examples-dir --out` 全部 **0 issues（draft）**；行号/出处经
`tools/examples/spec-fixlines.cjs --check` 零漂移。

## 工具链（本计划线新增，均不写正典）

- `tools/verify/trial-probes.cjs`：staging 试验运行器（--root/--ids/--click；browser-runtime 同源
  tsc 类型合同；pageerror 捕获含堆栈；证据写 OS 临时目录 `%TEMP%/cocosair-g1-trial/`）。
- `tools/examples/spec-fixlines.cjs`：scoped 行号/出处回填（spec-evidence.cjs 同款定位规则，--root/--check）。
- `tools/verify/shader-probe.cjs`：Shader 探针双后端运行器（--root；正典证据 g4-shader-probe.json）。
- prettier 3.9.9（devDependency 精确锁定）+ `.prettierrc.json`（4 空格/单引号/120 列，JSON/MD 2 空格）
  - `.prettierignore`（src/** 上游逐字节区、生成物、证据、既有 tools 全排除）
  - `npm run format` / `format:check`（首批范围：examples、docs/manual/examples、自有新工具、staging）。
    **Dry-run 基线：首批范围 410 文件不合新格式**（绝大多数为存量示例/手册示例——按计划只做审查，
    批量机械重写延后到集成后分批，避免纯格式改动淹没行为改动 + 冻结规格行号漂移）。
    本计划线全部新文件已 --write 并复验（fixlines 零漂移 + 试验全绿）。

## 缺口登记（详见矩阵 §7 + g1-light-contribution-gap.json）

- ~~**GAP-L1（P0）**：主光/点光视觉贡献为零~~ **r53 已修复（owner 批准 Deviation 流程）**：拆为两根因——
  (a) 主光＝HDR 单位语义陷阱（isHDR 默认 true，exposure=1/38400，LDR 量级 illuminance 视觉归零），非缺陷，
  HDR 量级（≈65000）下颜色/开关/渐变全实测生效；(b) 点/球光＝fixture 版本失配（builtin-glsl4.ts 为 3.8 代
  `w>0.0 即 spot` 判别，与 4.0 同源队列写入 `w=LightType` 冲突 → POINT/SPHERE att≡0），已在 AIR 原创 fixture
  9 处对齐上游 4.0 语义修复（无上游跟踪文件改动）。验证：探针点光 delta=472；render-composite P2 全正向断言；
  g4-probe 双后端回归 PASS。详见 docs/evidence/g1-light-contribution-gap.json resolution + 矩阵 §7。
- **GAP-C1**：Camera.worldToScreen 运行期输出零向量（执行计数正常）。
- **GAP-C2（扩展）**：框架 Camera 组件无 resize/width/height/aspect 导出面（inventory Camera.resize 为内部面单元）。
- **GAP-M1**：builtin-unlit 纹理宏为 USE_TEXTURE；USE_ALBEDO_MAP 静默忽略（manual-render-targets 潜在白 quad，待手册线复核）。
- **GAP-B1**：引擎引导前 EffectAsset.onLoaded / Material.initialize 抛空 device TypeError（时机纪律，范式文档已纳入）。
- **GAP-V1**：isValid 帧末语义 → 异步取消必须显式 token + isValid 双守卫（范式文档已纳入）。
- **GLTFAsset getter 防御缺口**：dispose 连带销毁资产后 `asset.meshes` 抛 null 异常（使用侧 isValid 守卫已入范式文档）。
- **loadRemote 回调式**（await Promise 形态静默 undefined）——范式文档待补一行。

## r52 历史集成待办（当前状态见文末）

1. 与并行线核对 examples/ 目录与 files.json 归属；确认其覆盖战役收口（smoke-29 EXAMPLE_COUNT、
   其新目录的规格冻结）。**注意：并行线曾清理 examples/ 未跟踪目录（17:50 事件）——迁移前先确认其验证批次结束。**
2. `ai/g1-staging/<11 例>` → `examples/<11 例>` 平移（shared 导入路径已是正典形态；
   `shader-blocks.js` 复制到 `examples/shared/`；shader-probe 与 light-contribution-probe 迁回但**保持不登记**——
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
9. ~~矩阵 §7 缺口提交 owner 决策：GAP-L1 修复批次（上游 Deviation 流程）或披露性保留~~ **r53 已执行**：
   owner 批复「批准 GAP-L1 修复，按 Deviation 流程执行」→ 修复落点为 AIR 原创 fixture
   src/air/builtin/builtin-glsl4.ts（file-map upstreamPath=null，**无上游跟踪文件改动、无新增 Deviation 行**），
   9 处判别对齐上游 4.0 shading-standard-additive.chunk 语义（IS_SPOT=|w-2|<0.5 ×3、spot-shadow 同判别 ×3、
   POINT/RANGED illum=1.0 ×3）；主光侧定性为单位语义陷阱（isHDR 默认 true、exposure=1/38400 → HDR 量级纪律），
   非引擎缺陷。验证：探针点光 delta=472（[255,255,255] vs [154,160,165]）；render-composite P2 全部升级
   正向视觉断言（点光 35.0→255.0→35.0、主光 30000→65000：35.0→48.1→35.0）；g4-shader-probe 新 bundle
   双后端 28/28 PASS。矩阵 §7 GAP-L1 与 g1-light-contribution-gap.json 已附修复记录；bundle 重建
   （6,600,855B）→ 正典全链重采证进行中（candidateFingerprint 变更使全部旧证据过期）。
   余项：GAP-C1/C2 导出面决策仍待 owner；
   GAP-C1/C2 导出面决策（补导出 or 从 required 分母重分类——均需单列证据与评审记录，不得静默改分母）。
10. G2 手册联动：manual-mini-game ↔ collector-dodge 的「升级重构」互链（game.md 引用更新）。

## 交付纪律备忘

- 全部页内行为断言失败即 throw → pageerror → no-runtime-error 红（证据不得静默）。
- 演示脚本特权（夹具注入/冻结敌人/清走廊）一律在源码注释与 effect 契约中如实标注。
- 404/编译错误等故意失败路径均被 catch，不污染 no-runtime-error；console 网络日志不在计数通道。
- 负控与试验证据写仓库外临时路径（%TEMP%/cocosair-g1-trial、/tmp/g1-spec-*）；
  正典新增仅限三个新文件：g4-shader-probe.json、g1-light-contribution-gap.json、api-scenario-gap-matrix.md。

## 2026-09-26 验收修复轮（统一验收完成）

- G3：统一自有示例格式，保留第三方 assets 和根目录 src 原文；修正 ignore 中 src/ 误排除所有示例 src 的范围问题。新增格式 CI。
- 样板：starter 迁到 src/main.ts；hello-cube 的 Rotator、scene-switch-reentry 的 Ticker 拆为独立 TypeScript 组件。开发服务器支持标准 .js 导入解析到 .ts 源。
- 验证器：递归绑定 src/** 指纹，新增模块修改负控；场景探针超时、空断言或 ok=false 均阻断，成功证据保存完整 probe。
- 文档：手册索引收录脚本组件与 Shader 工作流，game 与 collector-dodge 建立导航，格式化源码与全文示例同步。
- 接口：GAP-C1 参数顺序修正、GAP-C2 公开 camera getter 路径说明、GAP-M1 RT 纹理宏和像素断言修复；详见差距矩阵修复轮。
- 浏览器环境：本轮采用外部 Playwright 1.61.0，与已装 WebKit 2311 配套；三个引擎启动探针通过。后续逐例运行结果单独记录，不以旧版本阻断记录代替当前状态。

### 最终验收

- G0–G4 本轮计划交付收口，详见 历史记录（interface-scenarios-repair-report.md，已清理）。上方 r52 历史表中的“试验级/待集成/延后”不再代表当前状态。
- Chromium 140/140、DevTools 5/5、Gallery 209/209、手册 44/44；新增 13 例 Firefox/WebKit 各 13/13；Shader 双后端 28/28。
- `format:check` / `typecheck` / `verify:file-map` / `verify:g3-tooling` / `verify:g3-dev` 全部通过；Jest 31 套全量通过，加修复后的规格套件 6/6，合计 32 套/263 用例已核验。
- 145 例规格冻结、3470 API 引用零漂移；verified 439，stale=0，schema gap=0；分母与既有覆盖门槛未改。
- 另修复四个棋盘游戏整图倒置和 WebKit 媒体请求证据漏报；组件导入在 dev server 与独立部署包都已实跑。
- 本轮未达到也未宣称达到 Core 100% / Important 90% 的全量覆盖目标。

历史收尾变更：并发任务曾继续修改灯光、相机与 shared，使上一轮证据过期；已在下述统一复验中重新采证。

### 合并后的统一复验

候选 `8746fc59b6aa0408` 全程稳定。Chromium 140/140、DevTools 5/5、Gallery 209/209、手册 44/44、Shader 双后端 28/28、Firefox/WebKit 扩展矩阵各 21/21；单次 Jest 32 套/263 用例全绿。format/typecheck/file-map/证据链均通过。verified 439、stale 0、schema gap 0，API 分母和门槛未变。详见 `docs/evidence/g3-unified-summary.json` 与验收修复报告。
