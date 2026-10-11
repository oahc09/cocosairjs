# AIR Agent Skills 套件 实现计划

> **For agentic workers：** 逐任务执行本计划。步骤用 `- [ ]` 勾选。执行建议用 superpowers:subagent-driven-development（每任务一个全新子代理 + 任务间复核）或 superpowers:executing-plans（本会话内分批 + 检查点复核）。
> **本仓硬约束（对所有子代理生效）：** 提交与推送需 owner 逐次授权，未获授权时不得执行 `git commit`；任何代理不得写入或回退 `docs/audits/**` 台账；不得写入 `docs/**`、`examples/**`、`src/**`、`ai/ledgers/**`——本计划的入库写入面只有 `skills/**` 与 `tools/verify/graphics-package.cjs` 的三行路径字符串（`:82-84`）。唯一的例外是临时工作面：Task 23 Step 4 的一次性抽样页面与截图只允许写在 `output/`（`.gitignore:16`，不入库）并在验证后删除，且必须用路由拦截而不是新增可被 dev server 静态命中的文件。

**Goal:** 在 `skills/` 交付 22 个 `cocosair-*` Agent Skill（1 个 router + 2 个既有技能改名 + 19 个新增），每个技能由 `SKILL.md` 与内联 `references/*.md` 组成，符号与硬数据逐个对当期源码与声明核对。

**Architecture:** 沿用 pixijs-skills 的承重结构——router 用「load when…」表把任务语言映射到子系统技能，子系统技能按引擎切分而非按任务重复切分；每技能正文只保留规则、Quick Start、变体表与分级 Common Mistakes，长料下沉 `references/`。内联内容来自 `docs/**` 契约与 `src/air/**`、各入口 `.d.ts`，文件头记录来源与日期作为唯一的人工同步锚点。

**Tech Stack:** Markdown + YAML frontmatter（Agent Skills 格式）；核对工具为 Node 单行脚本与 `grep`；无新增 npm 依赖、无新增仓库脚本。

---

## 前置事实（已现读，无需重查）

| 事实 | 出处 |
| --- | --- |
| npm 包名 `cocosair.js`，版本 1.0.0；`exports` 只有 `.`、`./html-source`、`./bootstrap` 三个入口，各自 types 条件里含 `types@<5.0` legacy 声明 | `package.json`（name/exports） |
| 主入口声明 `build/cocosair.module.d.ts`（现读 73,265 行）是主入口符号的唯一交付面权威，**例外**：`AirDiagnostics` 接口在其中（`build/cocosair.module.d.ts:55725`，源 `src/air/diagnostics.ts:14`），只有工厂 `createAirDiagnostics` 与 glTF 解析内部（`GLTFParserContext`、`gltfPhysicalEffect` 等）不在其中 | `build/cocosair.module.d.ts`、`src/air/diagnostics.ts:14-24` |
| 仓库工作树是共享的，本计划撰写期间已多次观察到并发回退（含本文件自身）：Edit/Write 回执不等于落盘，每任务复核必须现读 `wc -l` + `sha256sum` 关键文件；复核记录里标注「工作树非独占，本任务结论只对当时那份快照负责」 | 本会话实测；`ai/plans/agent-skills-suite.md` 风险与残余 |
| `output/` 是一次性 scratch 面（`.gitignore:16`，`git check-ignore -v` 已验证），门禁的 `--out` 与 Task 23 抽样的页面/截图都只能落这里；`build/` 是入库产物，一次性页面放那里会被 `git status` 命中。共享工作树内起新 dev server 会与他人 runner 抢端口与重建 `build/cocosair.module.js`，抽样优先复用已在跑的 7454 | `.gitignore:16`、`tools/dev/dev-server.cjs:355/:417-420` |
| 子路径面独立：`build/html-source.d.ts` 只出 `createAirHTMLSource`/`getAirHTMLSourceSupport`/`AirHTMLTextureTarget`/`AirHTMLSourceOptions`；`build/bootstrap.d.ts` 只出 `createAirApp`/`AirApp`/`AirAppOptions`（手写、故意窄） | `tools/build/html-source-entry.cjs`、`tools/build/bootstrap-entry.cjs` |
| 源码形态入口 `src/index.ts` 只导出 `air`、`exports/base`、`exports/3d`、`exports/2d`、`animation`、`skeletal-animation`、`primitive`、`tween`；**不含** `ui`、`graphics`、`mask`、`audio`、`physics-*`、`spine`、`dragon-bones`、`tiled-map`、`particle-2d` 等聚合单元，比 `src/exports/air.ts` 宽口径的 bundle 面明显窄 | `src/index.ts:11-18`、`src/exports/air.ts` |
| 默认构建选 26 个 feature，声明的 33 个里 `marionette`、`procedural-animation`、`physics-2d-builtin`、`audio`、`physics-ammo`、`physics-physx`、`physics-2d-box2d-wasm` 未选；`audio` 仍随 `exports/air.ts` 聚合进入默认 bundle | `tools/build/build.cjs:24-44`、`src/cc.config.json` |
| `custom-pipeline` 已打包但默认聚合面不可达（owner 决定 #6 / LV12-17），只有 `custom-pipeline-post-process` 的 `postProcess` 到得了用户 | `docs/reference/owner-decisions.md`、`src/exports/air.ts` |
| Agent session 的 `dispatch`：`requestId` 在执行中或保留窗口内重复 → 直接 `INVALID_ARGUMENT` 失败并提示不要盲目重试 create/addComponent，**不是**返回首次结果的幂等重放；保留窗口默认 FIFO 256 | `tools/debug/agent-session.ts:673-677`、`:145-146` |
| BMFont：`parseFnt`/`createBitmapFont`/`loadBitmapFont` 从主入口导出，`label.font = handle.font` 是受支持路径；原生 `BitmapFont` 只支持一个未打包单页 | `build/cocosair.module.d.ts:57114-57118`、`docs/manual/bitmap-font-loading.md:17-24` |
| `docs/manual/creating-text.md:39` 仍写「`Label` 使用系统字体渲染」且未提 BMFont——本套技能不照抄该口径，把它作为 Common Mistakes 素材 | `docs/manual/creating-text.md:39` |
| 打包门禁必须先给新输出路径：缺 `--out=` 或目标文件已存在都会在真正检查前退出 | `tools/verify/graphics-package.cjs:9-10` |

---

## 标准作业序（SOP）

每个技能任务都执行同一套动作。任务里只列该技能的**具体输入**，不重复动作描述。

### SOP-1 符号与硬数据核对（写之前）

- [ ] 对任务「待核清单」里的每个符号，现读到出处并记下 `file:line`：

```bash
grep -n "createAirApp" build/cocosair.module.d.ts | head -5
grep -rn "export function attachAirSpriteMask" src/air/
```

- [ ] 子路径与开发工具面**不得**用主入口声明代替，按技能入口选对文件：`build/html-source.d.ts`、`build/bootstrap.d.ts`、`tools/debug/**`。
- [ ] **生成物行号只作辅助锚**：`build/*.d.ts` 与 `build/*.js` 的行号会随下一次 `npm run build:dts` / `build` 静默漂移，而没有任何门禁会检查它。技能里引用这类文件时以符号名为锚、行号写成「currently :NNNN」或直接省略（Task 3 复核裁定）；手写源码（`src/air/**`、`src/cocos/**`、`tools/**`、`docs/**`）保留裸 `file:line`。
- [ ] 错误码字面量与数值上限逐个 `grep` 原文（例如 `AIR_E_SPRITE_MASK`、`8192`、`1024`），不确定的量要么删掉、要么按源码原文写死并附 `file:line`。
- [ ] 任一符号找不到出处 ⇒ 该技能不写它，并在任务复核记录里写明「主入口不可达」。

### SOP-2 写 `SKILL.md`

- [ ] **交付物一律英文**（owner 2026-10-08 定案，适用于 `skills/**` 全部 22 个技能与 `references/`）：正文、表头、Common Mistakes 说明、`Derived from` 行都用英文，括号用 ASCII 半角；引用的 `docs/**` 路径与 API 符号名原样保留，不翻译、不把中文文档标题抄进表。`description` 第三人称英文。
- [ ] frontmatter 只有 `name` 与 `description` 两键；`name` 等于目录名；`description` 第三人称、以 `Use when` 类触发句结尾段含触发词，字节数 ≤1024。
- [ ] 正文顺序固定：一句话定位 → `## Quick Start`（可运行代码，含 import 来源）→ `## Related skills` → `## When to use what`（问句 → 类/函数）→ `## Contracts`（硬上限、时序、所有权）→ `## Common Mistakes` → `## References` → `## Canonical docs`。
- [ ] 正文 ≤200 行（目标 150）。超出即把内容下沉到 `references/`，不保留在正文。
- [ ] 能力口径三层不可混：源码导出 / 默认 bundle 可达 / 浏览器已验证。docs 标 BLOCKED、N/A、实验的，写成明确不支持或明确实验条件，不给替代写法。

### SOP-3 写 `references/<facet>.md`

- [ ] 首行格式：`Derived from docs/<path>（as of 2026-10-07）`，多个来源用顿号列全。
- [ ] **首行必须覆盖正文里出现的每一个反引号路径**（`src/`、`tools/`、`docs/`、`build/`、`examples/`、`test/`、`vendor/` 开头）。Task 8 复核就是靠这条抓出五个文件全体欠覆盖；判据脚本写在 scratch（`output/prov-check.cjs`，比对首行与正文引用，只读），收尾要删。同类目录可折叠成目录路径；正文里的通配（`src/exports/*`）与「父目录已被更深头路径覆盖」的裸目录引用属判据假阳性，别往里塞伪路径。
- [ ] 只内联枚举型事实：构造选项表、错误码表、数值上限、支持矩阵、命令表、类清单。判定性叙述与长解释保留指针。
- [ ] 表格里的每个值来自 SOP-1 的 `file:line` 记录，不写「大约」「通常」。

### SOP-4 Common Mistakes 写法

- [ ] 每条一个小节：`### [HIGH] 标题`，随后 `Wrong:` 代码块、`Correct:` 代码块、一句 why（为什么 agent 会自然写错 + 后果）。
- [ ] `Wrong` 分支必须是真实会发生的误写：Cocos Creator 范式（Prefab、`cc.Class`、Editor `.scene`、`resources/` bundle 假设）、PixiJS 习惯、docs 旧口径、或本仓的时序陷阱。
- [ ] 每技能至少 2 条 `[HIGH]`、至少 1 条 `[MEDIUM]`；`[HIGH]` 的判据是「写错了会静默渲染不对或直接抛」。

### SOP-5 单技能自检（写完立刻跑）

- [ ] 规范与链接自检：

```bash
node -e '
const fs=require("fs"),path=require("path");
const dir=process.argv[1];
const md=fs.readFileSync(dir+"/SKILL.md","utf8");
const name=(md.match(/^name:\s*(.+)$/m)||[])[1];
const desc=(md.match(/^description:\s*(.+)$/m)||[])[1];
const body=md.split(/^---$/m)[2].split("\n").length;
console.log("dir==name",name===path.basename(dir));
console.log("descBytes",Buffer.byteLength(desc),"<=1024",Buffer.byteLength(desc)<=1024);
console.log("bodyLines",body,"<=200",body<=200);
let bad=[];
const files=[dir+"/SKILL.md",...fs.readdirSync(dir+"/references").map(f=>dir+"/references/"+f)];
for(const f of files){
  const t=fs.readFileSync(f,"utf8");
  for(const m of t.matchAll(/\]\(([^)#]+)\)/g)){
    const l=m[1].trim();
    if(!/^[a-zA-Z]+:/.test(l)) if(!fs.existsSync(path.resolve(path.dirname(f),l))) bad.push(f+" -> "+l);
  }
}
console.log("brokenLinks",bad.length,bad.join("\n"));
' "skills/cocosair-example"
```

期望输出四行断言全为 `true`、`brokenLinks 0`。
- [ ] ASCII 面自检（owner 2026-10-08 定案的机器判据，Task 1 router 就是靠它抓到 26 个残留非 ASCII）：

```bash
grep -rnP "[^\x00-\x7F]" skills/cocosair-example/ | head
```

期望零命中；命中就把 `—` 改 `-`、`→` 改 `->`、全角括号改半角，不做例外。
- [ ] 逐符号复核：任务「待核清单」里每个符号名在技能目录内出现次数 ≥1，且都有 SOP-1 记录的出处。

```bash
grep -rno "attachAirSpriteMask" skills/cocosair-example | head
```

- [ ] 文件写入复核（本仓有并发回退前例，不采信工具回执）：重读磁盘并核对 mtime。

```bash
stat -c '%n mtime=%y size=%s' skills/cocosair-example/SKILL.md
grep -c "<该任务新增的独有短语>" skills/cocosair-example/SKILL.md
```

- [ ] **复核/子代理报的行号不是证据。** 每一处它建议改成的数字，先自己回源读那一行，确认承载的正是文档在说的那件事；Task 6 就有一条复核意见（把 `node.ts:1820` 改成 `:1819`）本身是错的，1820 才是那条转发调用。同理，主代理下发给子代理的「更正」也要现读两种数法复核——Task 7 我曾把错误的「14 个 effect」当更正发下去，被子代理用源码推翻。

### SOP-6 提交（仅在 owner 授权后）

- [ ] 只逐路径 `git add`，禁止 `git add -A`（工作树常有并行会话产物）。
- [ ] 提交信息用 `docs(skills): ...` 前缀；不含 `docs/**`、`examples/**`、`src/**` 路径。

---

## 任务

### Task 0: 既有三技能改名与门禁接线

**Files:**
- Modify: `tools/verify/graphics-package.cjs:83-84`（`:82` 已在本计划撰写期间落工作树，未提交）
- Rename: `skills/air-graphics-and-dom/` → `skills/cocosair-graphics-and-dom/`
- Rename: `skills/air-verification/` → `skills/cocosair-verification/`
- Delete: `skills/air-code-first/`（内容在 Task 1 并入 router）

- [ ] **Step 1: 核对改名波及面**

```bash
git status --short
grep -rn "air-graphics-and-dom\|air-verification\|air-code-first" tools docs package.json AGENTS.md | grep -v "schemaVersion"
```
预期：仅 `tools/verify/graphics-package.cjs:83-84` 两条路径字符串需要随改名变化。`tools/verify/graphics-and-dom.cjs:135` 的 `schemaVersion: 'air-graphics-and-dom/1'` 是证据 schema 标识符，**保持不动**。

- [ ] **Step 2: 用 git mv 改名（保留历史）**

```bash
git mv skills/air-graphics-and-dom skills/cocosair-graphics-and-dom
git mv skills/air-verification skills/cocosair-verification
```
预期：`git status --short -- skills` 出现两行 `R`。工作树若已有他人对这两个目录的未提交改动，先停下报告 owner，不要强行搬。

- [ ] **Step 3: 改 frontmatter name**

把 `skills/cocosair-graphics-and-dom/SKILL.md` 第 2 行改为 `name: cocosair-graphics-and-dom`，`skills/cocosair-verification/SKILL.md` 改为 `name: cocosair-verification`。正文本任务不动。

- [ ] **Step 4: 门禁路径字符串接线**

`tools/verify/graphics-package.cjs`：
- 第 82 行应为 `'skills/cocosair/SKILL.md',`（撰写期间已改，本任务只核对现读值，不重复改）—— 该文件在 Task 1 才存在，因此本任务**不要**跑门禁，Step 5 只做静态核对。
- 第 83 行（原 `skills/air-graphics-and-dom/SKILL.md`）改为 `'skills/cocosair-graphics-and-dom/SKILL.md',`
- 第 84 行（原 `skills/air-verification/SKILL.md`）改为 `'skills/cocosair-verification/SKILL.md',`

- [ ] **Step 5: 验证接线可解析（不启浏览器、不打包）**

```bash
node -e '
const fs=require("fs"),src=fs.readFileSync("tools/verify/graphics-package.cjs","utf8");
const list=[...src.matchAll(/'"'"'((?:skills|docs)\/[^'"'"']+\.md)'"'"'/g)].map(m=>m[1]);
for(const f of list)console.log(fs.existsSync(f)?"OK   ":"MISS ",f);
'
```
预期：除 `skills/cocosair/SKILL.md` 显示 `MISS`（Task 1 落地）外其余全 `OK`；若出现 `skills/air-*` 说明改名接线没做完。

- [ ] **Step 6: 提交（需 owner 授权，未授权则跳过并在复核记录标注）**

```bash
git add skills/cocosair-graphics-and-dom/SKILL.md skills/cocosair-verification/SKILL.md tools/verify/graphics-package.cjs
git commit -m "docs(skills): rename AIR skills to cocosair prefix"
```

### Task 1: `cocosair` router（吸收 air-code-first）

**Files:**
- Create: `skills/cocosair/SKILL.md`
- Create: `skills/cocosair/references/skill-index.md`
- Delete: `skills/air-code-first/`

**内容输入（照此写，不自由发挥）：**
- Code First 纪律六条来自 `skills/air-code-first/SKILL.md` 现文本（原样搬迁并扩写：原始 `Scene`/`Node`/`Camera`/`Component`/`Material`/`Texture2D`/`Sprite` 优先、WebGL2 唯一、bootstrap 入口时序、材质属性声明与 `USE_TEXTURE`、所有权与释放、骨骼 joints 全路径）。
- 分组路由表：Foundations（project-setup / application / scene-graph / camera / math）、Rendering（materials-effects / rendering / primitives-mesh / performance）、Assets（assets / gltf）、Animation（animation-tween / skinning-morph）、Content（ui-2d / graphics-and-dom / 2d-subsystems / input-action / physics / audio-video）、Operations（agent-session / verification）。每行 = 链接 + 「load when」触发句，指向 `../<skill>/SKILL.md`。
- 兜底段：无命中时读当期 `build/cocosair.module.d.ts` 与 `docs/manual/index.md` 状态表；**不引入仓库外 URL**。
- canonical 最小代码模式（Quick Start）：

```ts
import { createAirApp, Scene } from 'cocosair.js';

const app = await createAirApp({ canvas: '#GameCanvas' });
app.run(new Scene('Main'));
app.getScene();
```
并注明 `#GameCanvas` 必须在 import 引擎之前存在（`docs/` 与 `README.md` 的启动契约）。

**References:** `references/skill-index.md` 内联每技能一行「覆盖 + 主要类/函数 + canonical doc 路径」，与 spec 表格一致（来源：`ai/plans/agent-skills-suite.md` 技能清单）。

- [ ] Step 1：SOP-1 核对 router 里出现的每个符号名（`createAirApp`、`Scene`、`Camera`、`Material`、`Texture2D`、`Sprite`、`buildSkeletonTree`、`restoreBindPose`、`frameObject`、`loadAssetAsync`）。
- [ ] Step 2：SOP-2 写 `SKILL.md`，SOP-3 写 `references/skill-index.md`。
- [ ] Step 3：`git rm -r skills/air-code-first`（内容已并入，无信息丢失；删除前 `diff` 比对原文件每条规则都能在新文件里找到）。
- [ ] Step 4：只跑 SOP-5 的规范项（`dir==name` / `descBytes` / `bodyLines`）与逐符号复核。**本任务不跑 SOP-5 的链接自检**：router 指向的 21 个子技能目录要到 Task 2–22 才存在，此刻必然报 `brokenLinks`，那不是缺陷。跨技能链接与路由覆盖统一在 Task 23 Step 2 复扫。此处的 `MISS` 判据与 Task 0 Step 5 相反：`tools/verify/graphics-package.cjs` 断言的 `skills/cocosair/SKILL.md` 现在应变 `OK`（本任务落地），另两条 `cocosair-*` 路径维持 Task 0 结果。
- [ ] Step 5：提交（需授权）。

**现读更正（Task 8 收口时顺带复扫 router，重跑本任务时以本节为准）：**
- router 是当时唯一残留非 ASCII 的技能：22 个 `—` 与 4 个 `→`，已在本轮就地换成 `-` 与 `->`（其余 10 个技能目录 `grep -oP "[^\x00-\x7F]"` 现读全为 0）。判据命令进 SOP-2 的自检。
- router 的 `## Related skills` 用相对链接指向**尚未生成**的技能，本轮实测 `BROKEN LINK` = 11（performance/assets/gltf/animation-tween/skinning-morph/ui-2d/2d-subsystems/input-action/physics/audio-video/agent-session）。这是派发顺序造成的暂态，**Task 23 收尾必须复跑 `node output/skillcheck.cjs skills/cocosair` 并把 brokenLinks 打到 0**；在那之前不要把这条当缺陷修（删链接会让 router 与 22 技能设计面不符）。
- 顺带确证：`from 'cocosair'` 与 `from 'cocosair.js'` 两套写法**都成立且不冲突**——`cocosair` 是仓库页面与 manual 示例的 importmap 别名（现读 278 处），`cocosair.js` 是包名。已交付技能的 Quick Start 要么在 import 上方直接给出 importmap（camera/math/rendering/primitives-mesh/scene-graph），要么在行尾注 `// page alias, not the package name`，命名契约由 project-setup 独占（`skills/cocosair-project-setup/SKILL.md:26`、`:78-92`）。子系统技能沿用此形态即可，勿各自重述。

### Task 2: `cocosair-project-setup`

**Files:** Create `skills/cocosair-project-setup/SKILL.md` + `references/{entries.md,feature-flags.md,html-shell.md}`

**待核符号/事实清单：** `package.json` 的 `exports` 三入口与 types 条件；`build/cocosair.module.js`、`build/bootstrap.js`、`build/html-source.js` 产物归属（`tools/build/build.cjs`、`bootstrap-entry.cjs`、`html-source-entry.cjs`）；默认 26 feature 与未选 7 项（`tools/build/build.cjs:24-44`、`src/cc.config.json`）；`AIR_FEATURES`、`AIR_OUT_DIR`；`src/index.ts:11-18` 面窄事实；`build/package.json` 的 `type: module` 与 `build/gltf-decoders/package.json` 的 `type: commonjs`。

**Common Mistakes 种子：** `[HIGH]` 直接 `import 'cocosair'`（真实包名是 `cocosair.js`）；`[HIGH]` 从 `src/index.ts` 取 UI/物理/Spine 面（源码入口不含）；`[MEDIUM]` 把 `./bootstrap` 当主入口的加法使用（是二选一替代）。

**Canonical docs：** `docs/manual/installation.md`、`build/README.md`、`docs/reference/web-features.md`、`docs/manual/typescript-dom-compatibility.md`。

### Task 3: `cocosair-application`

**Files:** Create `SKILL.md` + `references/{app-options.md,startup-errors.md,context-health.md,session-scope.md}`

**待核清单：** `createAirApp`、`AirAppOptions`（`canvas`/`renderMode` 0-3/`physics`/`contextLoss`/`diagnostics`/`pixelRatioCap` 默认 2/`screenMode`/`container`/`designResolution` policy 0..4）、`app.run`/`getScene`/`close`、错误码 `WEBGL2_REQUIRED`、`AIR_E_APP_CLOSED`、`AIR_E_APP_RELOAD_REQUIRED`、`AIR_E_APP_CONFLICT`、`AIR_E_CANVAS_IMPORT_ORDER`、`AIR_E_PIXEL_RATIO_IMPORT_ORDER`、`AIR_E_SCENE_RELEASE_REQUIRED`、`globalThis.__CC_CANVAS__`、`__CCDPR_CAP__`、`attachContextHealth` 状态机 `healthy|lost|restoring|failed`、`createSessionScope` 的 `timeoutMs ∈ (0,5000]` 与 `own()` 只注销不清理。

**Common Mistakes 种子：** `[HIGH]` 先 import 引擎再插入 canvas；`[HIGH]` 以为 `close()` 后能在同文档再建一个 app（需整页重载）；`[HIGH]` 用 `renderMode: 3` HEADLESS 断言像素；`[MEDIUM]` `attachContextHealth` 当成自动重建 device。

**Canonical docs：** `docs/manual/safe-startup-and-release.md`、`docs/webgl2-only.md`。

### Task 4: `cocosair-scene-graph`

**Files:** Create `SKILL.md` + `references/{node-ops.md,layers.md,node-events.md,scene-globals.md}`

**待核清单：** `Scene`、`Node`（`addChild`/`insertChild`/`removeChild`/`getChildByUuid`/`active`/`setScale` 局部与父级乘算）、`Component` 生命周期回调、`director`/`game` 事件枚举、`Layers` 与 `UI_2D`、`find`、`NodePool`、`NodeEventType`、scene 只读 globals（ambient/fog/skybox/probe）、`updateWorldTransform`、`autoReleaseAssets`、`SceneAsset` 槽位与 `addRef/decRef`。

**现读更正（Task 4 执行期核对，重跑本任务时以本节为准）：**
- `Component` 在 `src/cocos/scene-graph/component.ts`，不是 `src/cocos/core/components/component.ts`。
- `NodePool` 在 `src/extensions/ccpool/node-pool.ts`，不是 `src/cocos/scene-graph/node-pool.ts`。
- globals **不是只读**：`scene.globals` 返回可写 `SceneGlobals`；`scene.renderScene` 根本不暴露 ambient/fog/skybox（只见 root/name/cameras/lights/models/batches/lodGroups，`src/cocos/render-scene/core/render-scene.ts:73-158`），真正的同步目标是 `director.root.pipeline.pipelineSceneData`，经 `SceneGlobals.activate`（`src/cocos/scene-graph/scene-globals.ts:1704-1716`）绑定；`Scene._activate` 的这次调用在 `if (!TEST)` 内（`src/cocos/scene-graph/scene.ts:203-204`）。
- 事件枚举名：director 事件用 `DirectorEvent`、game 事件用 `Game.EVENT_*` 字符串常量（18 个，含 8 个 init 期）；`DirectorEventType`/`GameEventType` 不是当前声明面可解析的符号名。
- 延后销毁语义的锚点是 `object.ts:257-278` docblock，不是 `:287-291`。
- 默认 `camera.visibility` **不是** "matches nothing"：`CameraComponent._visibility`（`src/cocos/misc/camera-component.ts:178`）与 render-scene `Camera._visibility`（`src/cocos/render-scene/scene/camera.ts:875`）初始化为 `CAMERA_DEFAULT_MASK`（`src/cocos/rendering/define.ts:1052-1053`），它包含 `DEFAULT`。`docs/manual/creating-a-scene.md:99,105,211,251` 与 `examples/hello-cube/src/main.ts:44` 的相反说法是 stale，技能内已登记但**未回写** `docs/**`、`examples/**`。
- `IGNORE_RAYCAST` 只被 reflection probe 消费（`src/cocos/3d/reflection-probe/reflection-probe-manager.ts:39`）；物理射线按 `PhysicsGroup` 过滤（`src/cocos/physics/framework/physics-system.ts:511-518,534-539,414`），与 `node.layer` 无关。

**Common Mistakes 种子：** `[HIGH]` 用 Creator 的 `@ccclass` 装饰器注册或从 `.scene` 反序列化 Prefab（AIR 无 Editor 资产管线）；`[HIGH]` 把外部订阅当作会随 `node.destroy()` 自动解除——`destroy()` 只延后销毁节点自身，节点自己的监听器在帧内延后执行的 `_destroyImmediate` 里由 `this._eventProcessor.destroy()` 收走（`src/cocos/scene-graph/node.ts:1531`；延后语义见 `src/cocos/core/data/object.ts:257-278`，见上方现读更正），而 `input.on`、DOM `addEventListener`、`director`/`game` 事件、挂在别的节点上的回调都不在范围内，必须显式退订（`scene-switch-reentry` 契约要显式 `off`）；`[MEDIUM]` 直接改 `Layers` 位而不走 `makeMaskExclude` 类注册。

**Canonical docs：** `docs/manual/scenegraph.md`、`docs/manual/creating-a-scene.md`、`docs/manual/api-behavior-contracts.md`。参考示例：`examples/node-hierarchy`、`examples/scene-switch-reentry`。

### Task 5: `cocosair-camera`

**Files:** Create `SKILL.md` + `references/{camera-projection.md,multi-camera.md,screen-world.md}`

**待核清单：** `Camera`、projection 切换、`orthoHeight`、viewport rect 与 `priority`、`worldToScreen`/`screenToWorld`/`screenPointToRay`、`frameObject(camera,target,fallbackDistance=6)`（`src/air/utils/frame-object.ts`，走 `MeshRenderer.model.worldBounds`，尊重 `fovAxis`/aspect/父变换）、clip-space minZ 与斜近裁剪面。

**Common Mistakes 种子：** `[HIGH]` 用固定像素除 `devicePixelRatio` 混算屏幕坐标；`[MEDIUM]` 多相机不设 `priority` 期待稳定绘制次序。

**Canonical docs：** `docs/manual/cameras.md`、`docs/manual/design-viewport-and-controls.md`。参考示例：`examples/camera-*`。

**现读更正（Task 5 执行期两轮复核核对，重跑本任务时以本节为准）：**
- `priority` 的**权威排序每帧重算**：`root._frameMoveEnd` 在把列表交给 `pipeline.render` 前 `cameraList.sort((a,b)=>a.priority-b.priority)`（`src/cocos/root.ts:795`、`:801`；抽取路径 `:761` 清空 + `:769-771` → `render-window.ts:309-316`）。render-scene 的 setter 只是存值（`src/cocos/render-scene/scene/camera.ts:501-503`），所以运行期写 `priority` **下一帧生效**，不需要重挂。`RenderWindow.sortCameras`（`render-window.ts:365-367`）只有 `attachCamera`（`:331`）一个调用点，它决定的是抽取顺序＝同优先级之间的 tie-break（`Array.prototype.sort` 稳定 ⇒ 等于节点激活顺序，不是契约）。重新 enable 节点对顺序无效（`camera-component.ts:609-614`→`:749-758`→`render-scene.ts:268-272` 动的是 render-SCENE 列表，渲染不走它）。
- 透视投影的两个转换**深度口径不同**、`z` 不可往返：`worldToScreen` 的 `z` 是投影量（`camera.ts:1355`），`screenToWorld` 把 `screenPos.z` 当 near→far 的**线性**比例读（`:1310`）。`near=0.1/far=1000` 下深度 5 → `z≈0.98` → 回代得 ~980（同一条射线上 XY 同比放大 ~196 倍），只有 near/far 两个端点自洽；配方见 `examples/render-composite/src/main.ts:232-239`。
- `clip-space minZ` 在本仓**没有 shader 侧消费者**：只进投影矩阵（`Mat4.perspective` 的 `minClipZ` 形参 `src/cocos/core/math/mat4.ts:1175`，`Mat4.ortho` `:1221`；相机侧 `camera.ts:1073`/`:1089`）。不存在 `src/cocos/gfx/webgl2/extensions/material.ts`，`projInfo` 全仓 0 命中。`getClipSpaceMinz()` 的读者只有两个 UBO 打包处（`rendering/custom/web-pipeline-types.ts:151`、`rendering/pipeline-ubo.ts:198`）。
- WebGPU 设备只覆盖 `clipSpaceMinZ=0` 与 `screenSpaceSignY=-1`（`src/cocos/gfx/webgpu/webgpu-device.ts:544-545`），从不赋 `clipSpaceSignY`，它保持基类默认 `1`（`src/cocos/gfx/base/define.ts:774-776`）；且 WebGPU 不是 AIR 的发布目标。
- `frameObject(camera,target,fallbackDistance=6)` 走的轴是 `节点世界位置 - bounds 中心`（`src/air/utils/frame-object.ts:63`）并自行 `lookAt(boundsCenter)`（`:73`），**不是**相机自身朝向；`camera.camera` 未激活时用 `aspect = 1`（`:44-45`），`halfFov` 被夹到 `min(fov/2, PI/2-1e-3)`（`:46`）。`fovAxis` 切换是**对角度做线性 ×/÷ aspect**（`camera-component.ts:341`），不是 tan 空间，不保证覆盖范围不变。
- 斜裁剪面改写的是投影矩阵的**第三行**（`m02/m06/m10/m14`，`camera.ts:1411-1414`；`m02`＝column 0 row 2 见 `mat4.ts:107,:109`，`Vec3.transformMat4` 的 `out.z` 由这四个元素算出 `vec3.ts:481`）。
- `examples/camera-screen-world/src/main.ts:77-84` 的往返探针是**退化**的：它把 scene-camera 的 out-first 顺序用在组件上，`screen` 恒为 `0,0`；抄它之前先按 `SKILL.md` 的顺序契约改写。该例也未读 `camera.camera.width/height`，读它们的是 `examples/render-composite/src/main.ts:216-220` 与 `examples/interactive-container/src/main.ts:38`（`docs/manual/cameras.md:302` 亦如此指引）。

### Task 6: `cocosair-math`

**Files:** Create `SKILL.md` + `references/{value-types.md,transforms.md,easing-random.md}`

**待核清单：** `math` 命名空间、`Vec2/3/4`、`Mat3/4`、`Quat`、`Rect`、`Size`、`Color`、`bits`、easing 函数、随机工具；矩阵变换语义（TRS 次序、镜像矩阵分解）；静态常量与可变性边界（`freezeVec3` / `Object.freeze` / `Readonly<Vec3>`，`src/cocos/core/math/vec3.ts:48-65`）、静态运算的 `out` 参数约定（`Vec3.add(out, a, b)`，同文件 `:112`）。

**Common Mistakes 种子：** `[HIGH]` 改写 `Vec3` 静态常量（`Vec3.UP`/`RIGHT`/`FORWARD`/`ZERO`/`ONE`/`NEG_ONE`/`UNIT_*` 全部经 `freezeVec3` → `Object.freeze`，声明类型 `Readonly<Vec3>`；ESM 恒为严格模式，`Vec3.UP.x = 5` 与 `Vec3.UP.set(...)` 都会抛 TypeError）；`[HIGH]` 把同一个 `Vec3` 实例交给多个节点/组件后继续就地 `set`（共享别名互相覆盖——实例本身可变、跨帧复用自有私有实例是合理写法，风险只在别名外泄给多个持有者）；`[MEDIUM]` 以为 `Vec3.add(a, b)` 返回新向量（实为 `out` 参数风格，且 `out` 传入冻结常量同样抛）；`[MEDIUM]` 用 `Color` 十六进制与 CSS 字符串混用不核对 premultiply 口径。

**Canonical docs：** `docs/manual/matrix-transformations.md`、`docs/reference/api-stability.md`。参考示例：`examples/math-*`（40 个，逐个钉一个确定性侧面）。

**现读更正（Task 6 执行期两轮复核核对，重跑本任务时以本节为准）：**
- `[MEDIUM]` 种子里的「`Color` 十六进制与 CSS 字符串混用不核对 **premultiply** 口径」不可用：本运行时 `Color` 没有 `premultiply` 成员（`grep -c premultiply src/cocos/core/math/color.ts` = 0），docs 旧口径不得照抄。可写的等价失误是**字节 vs 分数通道**：`_data` 是 `Uint8ClampedArray`（`src/cocos/core/math/color.ts:340`），`r/g/b/a` 是字节访问器（`:346-387`），`x/y/z/w` 才是 `*toFloat` 的 0-1 视图（`:390-397`），写 `0.5` 是字节取整不是半透明。
- `Vec4.fromColor(out, color)` 复制的是**字节**（`src/cocos/core/math/vec4.ts:102-105` 赋 `color.r/g/b/a`），不是分数；要 0-1 视图用 `Color.toVec4`（`color.ts:113`）。
- `Mat4.getScaling(out, mat)` **不忽略符号**：三条列长（`src/cocos/core/math/mat4.ts:809-811`）之后 `if (Mat3.determinant(m3_1) < 0) { out.x *= -1; }`（`:813`），镜像只体现在 `out.x`；`y/z` 仍是正长度。
- 「镜像矩阵分解」的往返**不会还原作者写的 `(q, v, s)`**：`toSRT` 把负行列式一律挪到 `s.x *= -1`（`mat4.ts:914-917`）并在 `Quat.fromMat3` 前取反第一列（`:920-927`）。node 复算（`fromSRT`→`toSRT`，`q` 为单位、`v=(5,6,7)`）：`s=(1,-1,1)` → `s=(-1,1,1)`、`q=(0,0,1,0)`；`s=(1,1,-1)` → `s=(-1,1,1)`、`q=(0,1,0,0)`；`s=(-2,-3,4)` → `s=(2,3,4)`、`q=(0,0,1,0)`；只有 `x` 轴镜像（`s=(-1,1,1)`）原样还原。还原的是同一个矩阵，不是同一组三元值。
- `pseudoRandom(seed)`（`src/cocos/core/math/utils.ts:227-229`）的结果**符号随入参变化**：JS `%` 取被除数符号，`pseudoRandom(-1)` = `0.1714506172839506`（正）、`pseudoRandom(-8)` = `-0.1076431755829904`、`pseudoRandom(-100000)` = `-0.8428626543209876`。非负入参给 `[0,1)`，任意入参给 `(-1,1)`；不得写成「负种子返回 `(-1,0]`」。
- `Mat4.toEuler(m, v)` 返回 **`boolean`**（`mat4.ts:936`、`:943` 转发 `Mat3.toEuler`，其 `false` 见 `src/cocos/core/math/mat3.ts:668`、`:675`），`docs/manual/matrix-transformations.md:21`、`:95` 记录了非零世界旋转下返回 `false` 且 `v` 留零向量；可读回路径是 `Mat4.getRotation` + `Quat.toEuler` 或 `node.eulerAngles`（同文档 `:96`、`:104`）。
- **没有 `Vec2.signedAngle`**（`grep -c signedAngle src/cocos/core/math/vec2.ts` = 0），有符号角只有 `Vec3.signedAngle`（`src/cocos/core/math/vec3.ts:791`）。`freezeVec3` 是模块内私有（`vec3.ts:48-50`，未导出），其它类型各自有等价的内联冻结：`vec2.ts:50-51`、`vec4.ts:46-47`、`color.ts:45-46`；`Rect` 无冻结静态量。`mat4.ts:43-48` 是四条四元数组（按表面朝向索引的扁平 2x2，`Mat4.perspective` `:1182`、`Mat4.ortho` `:1231` 消费），不是「2x4」。`halfToFloat(0x0001)` = `0.000030547380447387695` 走的是指数调整路径（`utils.ts:395`、`:399`），`em === 0` 的尾数移位分支（`:401-402`）只对 `0x0000`/`0x8000` 生效。
- 首轮成文超出两处硬门禁（description 1158 B > 1024、body 202 行 > 200），收尾口径：`descBytes` 按 **`Buffer.byteLength`** 计、正文超长内容下沉 `references/`。`output/skillcheck.cjs` 有两个已知误报：扩展名交替把 `.json` 截成 `.js`（`docs/evidence/examples-verified.js`）与把 `pseudoRandom(seed)` 的 `seed` 当过程叙述——按字面路径复核后忽略。`docs/evidence/examples-verified.json` 的 `measuredAt` 与 `candidateFingerprint` 是**文件级**字段，`results[]` 条目自带 `candidateFingerprint` 而没有 `measuredAt`。

### Task 7: `cocosair-materials-effects`

**Files:** Create `SKILL.md` + `references/{builtin-effects.md,property-types.md,custom-glsl.md,defines.md}`

**待核清单：** `Material`、`EffectAsset`、`Pass`/`PassInstance`、`MaterialInstance.setProperty`、`overridePipelineStates`、`builtin-standard`/`builtin-unlit`/`builtin-sprite`/`builtin-graphics` 等 21 个内置 effect 与 15 个内置 material 名单（`src/air/builtin/builtin-effects.ts`、`builtin-material.ts`）、`registerBuiltinAirAssets` 与 `glsl4→glsl3` 转换规则、`CCSkinning` → binding 3、`USE_TEXTURE` define 一致性、`createAirUnlitFogEffect`、`inspectAirMaterial`。

**Common Mistakes 种子：** `[HIGH]` `setProperty` 类型与声明不匹配（数值/数组/纹理）导致静默失效；`[HIGH]` 未注册 builtin 资产就调用 `attachAirSpriteMask`/`createAirRenderTarget`；`[MEDIUM]` 手写 effect 时保留 `cc_debug_view_composite_pack_*` 或 `u32vec` 触发 uniform buffer 尺寸报错。

**Canonical docs：** `docs/manual/materials.md`、`docs/manual/custom-shaders.md`、`docs/manual/uniform-types.md`。参考示例：`examples/shader-custom-gradient`、`examples/material-*`。

**现读更正（Task 7 执行期复核核对，重跑本任务时以本节为准）：**
- 「21 个内置 effect」成立，但**不要**用 `grep -oE '^    "name": "[a-z0-9-]+"'` 数：字符类缺 `/` 会静默丢掉 7 个斜杠命名条目（`pipeline/bloom`、`pipeline/deferred-lighting`、`pipeline/planar-shadow`、`pipeline/post-process`、`pipeline/skybox`、`util/profiler`、`util/splash-screen`），只得到 14 个 `builtin-*`。正确写法 `'^    "name": "[a-zA-Z0-9/_-]+"'`；`src/air/builtin/builtin-glsl4.ts` 与之按位置配对，也是 21 组。（本任务主代理一度把「14」当作对计划的更正下发给子代理，子代理现读推翻——计数类结论必须用两种独立方式复核。）
- 内置 material = **17**：`builtin-material.ts` 里 15 个不同 `_uuid`，加 `register.ts:123-131` 的 `builtin-standard-material` / `builtin-unlit-material`。
- `Material.setProperty(name, val, passIdx)` 传**越界 passIdx 会抛**，不是「warn 后跳过」：`src/cocos/asset/assets/material.ts:330-333` 只 `warnID(16372)` 不 return，随后 `_uploadProperty(undefined,…)` 在 `:524` 取 `pass.getHandle(name)` 抛 `TypeError`；准备循环的 `if (!pass) { continue; }`（`:308`）管不到上传分支。真正 warn 并返回 `null` 的是 `getProperty`（`:366-369`）。
- `builtin-sprite` **没有** `mainTexture`：它唯一的 pass property 是 `alphaThreshold`（`src/air/builtin/builtin-effects.ts:559`），material `samplerTextures` 为空，被 `USE_TEXTURE` 门控的是 LOCAL builtin `cc_spriteTexture`（`:568`，frag 里 `layout(set = 2, binding = 11)`）；`:576` 只是 `defines[]` 条目。sprite 上 `setProperty('mainTexture', tex)` 只会走到 `warnID(16373)`。
- material 集采样器 binding 的**有效值不等于 fixture 值**：`assignEffectBindings`（`src/air/builtin/register.ts:88-97`）把所有 `set === undefined` 的 material sampler 按声明序从 0 重排，因此 unlit `mainTexture` = set 1 / binding 0，standard `albedoMap` 0…`emissiveMap` 5。写技能时要给重排后的值。
- **未声明的宏根本不会被写入**（不是「写了个没人读的 `#define`」）：`prepareDefines` 只遍历 effect 声明的 `tmpl.defines`（`src/cocos/render-scene/core/program-utils.ts:49-60`，调用于 `core/program-lib.ts:561-563`），`USE_COLOR` 在 unlit 声明表与 `builtin-glsl4.ts` 里均 0 命中 ⇒ 手写 effect 若忘了声明宏，该宏直接丢失。
- 采样器类型属性传错资产类（`ImageAsset`/`SpriteFrame`）是**静默 no-op、不 warn**：采样器分支绕过 `validateUniformValue`，`_uploadProperty` 仍返回 `true`（`material.ts:544`），`_bindTexture`（`:551-563`）只匹配 `Texture` 与 `TextureBase`。
- 主入口可达性（按 `build/cocosair.module.js` 的单个 `export { ... }` 块程序化解析，626 名）：`Material`/`EffectAsset`/`builtinResMgr`/`createAirUnlitFogEffect`/`inspectAirMaterial`/`inspectAirMeshMaterial`/`attachAirSpriteMask`/`createAirRenderTarget` 在册；`registerBuiltinAirAssets`/`Pass`/`PassInstance`/`MaterialInstance` 连别名导出都没有。
- 其它核对更正：`gfx.Type` 表要引 `src/cocos/gfx/base/define.ts:294-329`（`SAMPLER` 在 `:329`）；「重复注册同名＝覆盖不抛」在 `docs/manual/custom-shaders.md:109`（不是 `:108`）；shared-material 隐患在 `docs/manual/uniform-types.md:65`（`materials.md:65` 是代码围栏）；`CCSkinning`→binding 3 的引擎侧依据是 `src/cocos/3d/models/skinning-model.ts:258-265`；`setSharedMaterial` 与 `setProperty` 都声明为 `: void`（`src/cocos/3d/renderer.ts:175`、`material.ts:302`），不存在「返回真值」。

### Task 8: `cocosair-rendering`

**Files:** Create `SKILL.md` + `references/{lighting-units.md,shadow-matrix.md,render-target.md,color-contract.md,pipeline-reachability.md}`

**待核清单：** `DirectionalLight`/`Light` 与照度单位、legacy forward 单 `mainLight` 限制（`inspectAirDirectionalLights`）、阴影支持矩阵状态、`AirRenderTarget`/`createAirRenderTarget`（`rgba8|rgba16f|rgba32f|srgb8-alpha8`、`samples 1|2|4|8` 与 `sampleFallback`、`info` 的 requested vs effective）、`AirTransmissionCapture` 每场景唯一、`resolveAirTextureFormat`/`validateAirTextureColorContract`（`decode ∈ none|shader-srgb|hardware-srgb`，硬件 sRGB 与线性编码环境对原生 shader 被拒）、`postProcess` 面与 `custom-pipeline` 默认不可达。

**Common Mistakes 种子：** `[HIGH]` 期待阴影开箱可用（按矩阵写不支持与替代）；`[HIGH]` 拿 `custom-pipeline` 的 pipeline 对象写代码（默认交付面不可达）；`[MEDIUM]` 以为 RT 请求 `samples: 8` 就生效（读 `info` 对比）。

**Canonical docs：** `docs/manual/lighting-units.md`、`docs/manual/shadow-support-matrix.md`、`docs/manual/rendering-contracts.md`、`docs/reference/rendering-color-diagnostics.md`、`docs/reference/texture-uv-verification.md`。参考示例：`examples/render-composite`、`examples/water-multipass`、`examples/hdr-color-pipeline`。

**现读更正（Task 8 执行期三段派发 + 复核核对，重跑本任务时以本节为准）：**
- 「`custom-pipeline` 默认不可达」这句话必须拆成三层写，否则是假话：`custom-pipeline` **是**默认 `AIR_FEATURES` 第 10 项（`tools/build/build.cjs:27`）；产物 export 块里**确有** `rendering` 这个名字，绑定值是含 `createCustomPipeline`/`enableEffectImport` 的 frozen custom-pipeline namespace（`build/cocosair.module.js` 单个 `export { ... }` 块程序化解析＝626 项、92 个 `X as Y` 别名，`var rendering` currently `:132791`）；不可达只对**聚合源码面**成立——`src/exports/air.ts` 全文只有 `:39` 一处 `custom-pipeline` 字样，即 `./custom-pipeline-post-process`。所以 Common Mistakes 要写成「名字拿得到、默认路径拿不到可用 pipeline」，不是「不在导出面上」。
- 计数钉死：默认 `AIR_FEATURES` = **26** 个单元（两种独立数法都得 26），`src/cc.config.json` 声明 **33** 个，未选 7 个＝`marionette`、`procedural-animation`、`physics-2d-builtin`、`audio`、`physics-ammo`、`physics-physx`、`physics-2d-box2d-wasm`。
- 阴影侧更正：PointLight 的「当前不支持产生阴影」注释在 `src/cocos/render-scene/scene/point-light.ts:32`（作者代抄成 `:31`，`shadow-matrix.md` 两处已改）。
- 复核结论 **0 HIGH / 2 MEDIUM / 2 NIT**，四处全是机械项，均已改并磁盘复读：(1) 五个 reference 首行 `Derived from` 欠覆盖正文引用路径（判据见 SOP-3 新增条）；(2) format→GFX 映射在 `src/air/rendering/render-target.ts:41`，`:40` 只是 `const formats ... = {` 声明行——`render-target.md:11`、`color-contract.md:188` 两处改 `:41`；(3) `src/cocos/render-scene/scene/shadows.ts:367` 才是 `this._enabled = shadowsInfo.enabled`（`:366` 是 `initialize` 签名）；(4) `src/air/rendering/engine-contracts.ts` 的 `scope` 在 `:107`、`ordinaryDirectionalCapacity`/`selection` 在 `:108` ⇒ 引 `:107-108`。
- 派发粒度教训：六文件一次派发做不完（此前三个子代理都耗在 150 轮上限、零交付），实作按「references 两批 + SKILL.md」三段子代理，各段自带范围与轮次预算才跑通。
- 交付面口径：本技能引用产物行号一律写「currently :NNNN」（无门禁守护，下次 build 必漂移），手写源码才保留裸 `file:line` 且该行必须真的承载该结论。

### Task 9: `cocosair-primitives-mesh`

**Files:** Create `SKILL.md` + `references/{primitive-shapes.md,mesh-attributes.md,create-primitive-geometry.md}`

**待核清单：** `Mesh` 构造与资产存储/读取、`primitives` 上游工具、`createPrimitiveGeometry(descriptor)` 的 `box|sphere|cylinder|cone` + `includeNormal/includeUV` 与返回 `IGeometry`（**不是** `Mesh`）、`AirPrimitiveDescriptor` 参数白名单与上限（segments ≤1024、verts ≤1,000,000、`arc ≤ 2π`）、`MeshRenderer` hooks（`bakeSettings`、蒙皮权重、instance 写入）、`mesh-attributes-indices` 的格式与拷贝。

**Common Mistakes 种子：** `[HIGH]` 把 `createPrimitiveGeometry` 返回值直接赋给 `MeshRenderer.mesh`（需 `new Mesh()` + `struct` 包装）；`[MEDIUM]` 超出 descriptor 白名单期待静默修正（抛 `RangeError AIR_E_PRIMITIVE_DESCRIPTOR`）。

**Canonical docs：** `docs/manual/primitives.md`、`docs/manual/custom-buffergeometry.md`、`docs/manual/primitive-descriptors.md`。

**现读更正（Task 9 复核 1 HIGH / 4 MEDIUM / 5 NIT 全部就地核实后修正，重跑本任务时以本节为准）：**
- **`utils.createDynamicMesh(...)` 不存在**（本任务唯一 HIGH）：`utils` 是 `import * as utils from './misc'`（`src/cocos/3d/index.ts:25`），barrel 只 `export { createMesh, MeshUtils } from './create-mesh'`（`src/cocos/3d/misc/index.ts:28`），模块级 `function createDynamicMesh`（`src/cocos/3d/misc/create-mesh.ts:262`）没被导出 ⇒ 调它抛 `TypeError`。活路径是静态 **`utils.MeshUtils.createDynamicMesh`**（`:419`，转发给 `:262`），与在仓示例 `examples/interactive-geometry/src/main.ts:155`、消费者门禁 `tools/verify/consumer-acceptance.cjs:180`（断言 `mod.utils?.MeshUtils?.createDynamicMesh` 是函数）一致。
- 顺带把 6 处调用点从 **已 `@deprecated`** 的自由函数 `utils.createMesh`（`:44-46`、`:46`）换成等价且未废弃的静态 `utils.MeshUtils.createMesh`（`:406`，同样转发）；机制描述里裸写 `createMesh` 的地方保持不动，因为二者是同一段代码。
- 顶点数据是**一个** `ArrayBuffer(vertCount * stride)`（`create-mesh.ts:158`），`:160-162` 把每个 channel 按记录 offset 写进同一块缓冲 ⇒ 「每通道一个新 ArrayBuffer」是错的（交错的本义）。push 侧行号 `:71,88,105,122,139,149`、stride 侧 `:72,89,106,123,140,150` 要分开引。
- `includeNormal`/`includeUV` 只有 **`plane`（`plane.ts:120,145,156`）与 `quad`（`quad.ts:55,63`）**真正分支使用；`circle.ts` 全文 0 次读这两个字段，它只在 `:45` 走 `applyDefaultGeometryOptions`（`primitive/define.ts:57-67` 把缺省填 `true`），返回体 `:85-92` 永远没有 normals/uvs ⇒ 原文「plane/quad/circle 都认这俩开关」在三处（SKILL.md 两处 + `create-primitive-geometry.md`）已改。
- `toWavefrontOBJ` 的空串条件是 `(primitiveMode !== undefined && primitiveMode !== TRIANGLE_LIST)`（`primitive/utils.ts:71`）⇒ `primitiveMode` 为 `undefined`（如 `box`）**照样导出**，别写成「拓扑不是 TRIANGLE_LIST 就返回空」。
- `IGeometry` 字段表漏 `customAttributes?: { attr: Attribute, values: number[] }[]`（`primitive/define.ts:125-128`，被 `create-mesh.ts:143-145` 采纳）。
- 补齐计划要求的 MeshRenderer hooks：`bakeSettings`＝组件自建的 `new ModelBakeSettings()`（`mesh-renderer.ts:333`，装饰器 `:330-332`；`class ModelBakeSettings extends EventTarget` 在 `:125`，**不是**产物 export 面上的名字，只能走 `renderer.bakeSettings`）；`setWeight(weight, subMeshIndex, shapeIndex)`（`:720`）两级越界都是**静默 return**（`:722-724`、`:726-727`），活路径写槽并 `_uploadSubMeshShapesWeights`（`:729-730`），而 `mesh` setter 的 `_initSubMeshShapesWeights()`（`:491`）会重置权重表；`setInstancedAttribute`（`:733`）在 `this.model` 还没建时**静默 no-op**（`:734-736`），JSB 分支 `:738-740` 原生专用。
- 顺序更正：`mesh` setter 先 `const mesh = this._mesh = val;`（`:489`）再 `mesh?.initialize()`（`:490`），不是「先 initialize 再一切」。
- 证据字段口径（再次触发，必须守住）：`docs/evidence/examples-verified.json` 的 `measuredAt` 是**文件级**，每个 `results[]` 自带 `candidateFingerprint` 且无 `measuredAt`（本轮实测 154 条结果、0 条带 `measuredAt`、指纹全为 `2f089f6ce25eaccd`）；`createPrimitiveGeometry` 在该文件出现 0 次 ⇒ 「浏览器无该 API 证据」这句是现读结论，可写。
- 复核意见本轮**九条全部独立回源成立**（含行号），因此主代理的「复核数字必须自己回源」规则仍要跑，但这次没有反例。

### Task 10: `cocosair-performance`

**Files:** Create `SKILL.md` + `references/{batching-routes.md,dynamic-atlas.md,instancing.md,profiles.md}`

**待核清单：** 三条批处理路线与 `batchStaticModel`/`unbatchStaticModel`、`batcher2D` 与 `_releaseDescriptorSetCache`（纹理身份变化）、dynamic atlas 与 `AirUIMesh` 领用、原生 instancing、`Profiler`、按需渲染、`pixelRatioCap` 与分辨率取舍、`starfield-galaxy` 的 50k POINT_LIST 口径披露。

**Common Mistakes 种子：** `[HIGH]` 用「减少 draw call」的通用说法写 AIR 不存在的 API（必须落在三条已验路线之一）；`[MEDIUM]` 动态合批后仍期待原节点独立材质（`unbatchStaticModel` 才可恢复）。

**Canonical docs：** `docs/manual/batching-recipes.md`、`docs/manual/optimize-lots-of-objects.md`、`docs/manual/rendering-on-demand.md`。

**现读更正（Task 10 收口，重跑本任务时以本节为准）：**
- **派发教训（本任务两次失败）**：`task10-implementer` 在 150 轮上限处停在 3/5 文件；补位切片 `task10a-profiles` 烧掉 70 次工具调用零产出。有效解法是**主代理用定向读自己写最重的 `profiles.md`，再把「事实已内联、只做综合」的简报发给下一个子代理**——后者一次成功。后续凡 ≥5 文件的任务，派发前先切片（references 分批，SKILL.md 单独一轮），并把已抽好的判据产物（bundle 名字表、`output/skillcheck.cjs`、`output/prov-check.cjs`）写进简报，别让代理重建工具。
- **Profiling API 被我本人写窄了**：初稿声称面板只有 `showStats`/`hideStats`/`isShowingStats`。回源 `src/cocos/profiler/profiler.ts` 补上 `setBackgroundColor`（`:141`）/`setFontColor`（`:152`，两者在面板可见时**销毁并重建**：`:146-149`、`:157-160`）、`init()` 读 settings（`:132-139`）、12 个计数器 `_profileInfo`（`:74-87`）与 500 ms 墙钟门（`:584-:586`）。触发点是 `examples/profiler-overlay/example.json` 的 apiClaims 与 `docs/evidence/examples-verified.json` 里该 id 实际执行的 4 个方法——**示例 spec 是 API 面的第三道核对源**。
- 复核就地修正 10 处：`ui-static-batch.ts:53`→`:57` 且改述为「方法体被注释掉」而非「空实现」；profiler 行号 `:143-144`→`:126`；`hideStats` 区间 `:186-229`→`:186-:229`；`batchStaticModel` 短路由 `:68`→`:68-:69`（含 return 行）；产物面锚点 `(currently :161574)` 从一串无关名字上摘掉（生成物行号只能挂在一个符号上），改为逐个写明 `device` 不在导出面、`Batcher2D` 以 `Batcher2D as UI` 出现；`batching-recipes.md:58-65`→`:56-65`；`director._paused` 措辞换成公开 `director.isPaused()`（`src/cocos/game/director.ts:693`），并注明它只报逻辑门不报渲染；Quick Start 里未定义的 `pointerHandler` 换成 `document.querySelector('#GameCanvas')`；公开入口由私有实现 `create-mesh.ts:262` 换成 `:419`；`profiler.showStats()` 排到 `app.run(scene)` 之后以匹配浏览器已验示例的顺序（`examples/profiler-overlay/main.js:63`, `:65-:67`）。
- **`batching-utility` 这个「已验 id」是空跑**（本任务最重要的口径修正）：`docs/evidence/examples-verified.json` 里 `BatchingUtility.batchStaticModel`/`unbatchStaticModel` 各 1 次调用，绑定的 validator 只有 `no-runtime-error`。示例把两个方法都**只传一个参数**（`examples/batching-utility/src/main.ts:85`、`:93`），而 `cube` 只有一个 `MeshRenderer`（`:46`、`:50`）⇒ 守卫 `src/cocos/3d/misc/batch-utils.ts:67-69` 打 `the number of static models to batch is less than 2,it needn't batch.` 并 `return false`，探针记的是非 true 分支，合并路径从未执行。所以该 id 只证明「符号可解析、调用不抛」；两参数合并契约是**从源码 + `docs/manual/optimize-lots-of-objects.md:72`、`:75`（实测 `:98`、`:100` 两处 `→ true`，但那是手册探针记录，不是 `results[]` 条目）**来的。SKILL.md 能力分层条与 `references/batching-routes.md`「Browser verification status」已就地写清这个缺口。
- **判据假阳性一处，按规矩用改写消掉而不是塞伪路径**：`profiles.md` 正文两处裸目录引用（`examples/profiler-overlay`、`examples/starfield-galaxy`）比首行的更深文件路径更浅，`output/prov-check.cjs` 报 MISSING；把正文改成直接引更深文件（`examples/profiler-overlay/main.js`、`examples/starfield-galaxy/src/main.ts`）即闭合，首行未加伪条目。
- 收口门禁现读：`output/skillcheck.cjs skills/cocosair-performance` ⇒ fmKeys `[name,description]`、descBytes 1006、bodyLines 175、sectionOrder true、mistakes `HIGH,HIGH,HIGH,MEDIUM`、narration 0；issues 13 条唯一形状全是 `.json`→`.js` 截断假阳性（6 条去重后逐条核过目标文件真实存在）。`output/prov-check.cjs` 四个 reference 全 OK。`grep -cP "[^\x00-\x7F]"` 五文件全 0。行数 SKILL 177 / batching-routes 101 / dynamic-atlas 72 / instancing 59 / profiles 71。

### Task 11: `cocosair-assets`

**Files:** Create `SKILL.md` + `references/{asset-bank.md,texture2d.md,atlas.md,bmfont.md}`

**待核清单：** `assetManager`/`load`/`loadRemote`、`loadAssetAsync` 三段回落、`AssetBank`（`load`/`release`/`refCount`/`inFlightCount`/`underlyingCancelSupported=false`、`ext` 必填且参与缓存键、`signal` 只取消订阅、cache 命中走微任务）、`AirAssetErrorCode`（`AIR_E_EXT_REQUIRED|INVALID_EXT|ABORTED|REVOKED|LOAD_FAILED|PROGRESS_ERROR`）、`Texture2D`/`ImageAsset` 创建与 mipmap、`parseAtlasText` 的 `rect.y` 顶原点语义、`createAtlasHandle` 在仍有额外持有者时拒绝 `dispose`、`parseFnt`/`createBitmapFont`/`loadBitmapFont` 与单页限制。

**Common Mistakes 种子：** `[HIGH]` 假设有 `resources` bundle 或 Creator 打包好的 bundle（无 Editor 管线，回落走 HTTP + `deserialize`）；`[HIGH]` `signal` 当成网络取消；`[HIGH]` 抄 `creating-text.md:39` 旧口径写「Label 只能系统字体」（见前置事实 BMFont 行）；`[MEDIUM]` 无后缀 URL 不给 `ext`。

**Canonical docs：** `docs/guides/asset-loading.md`、`docs/manual/asset-loading-and-lifetime.md`、`docs/manual/atlas-loading.md`、`docs/manual/bitmap-font-loading.md`、`docs/manual/textures.md`。

**现读更正（Task 11 收口，重跑本任务时以本节为准）：**
- **派发形状**：四个 reference 各派一个子代理写（事实已内联，只做综合），`SKILL.md` 由主代理自己写；三段并行复核各派一个子代理逐符号回源（atlas 159/159、asset-bank 102/102 全对，texture2d 同样通过），只有 bmfont 那一臂死在 `You've reached your daily usage limit for Chat.`，改由主代理手工全量核。**教训同 Task 10：≥5 文件的任务先切片再派发，且复核臂要能被主代理接管。**
- **复核就地修正 3 处引用缺陷**（都是「裸行号回落到错误的上一个文件」这一类）：`SKILL.md` 的 `public bundles` 只写 `:162` ⇒ 落到 `shared.ts`（全文 140 行），补成 `asset-manager.ts:162`；同处吞异常回落只写 `:49-57` ⇒ 落到 `url-transformer.ts`，补成 `load-asset.ts:49-57`；`texture2d.md` 的 `updateImage()` 标 `texture-2d.ts:119`（那行是 TODO 注释）⇒ 实为 `simple-texture.ts:119`。
- **两处引用 gitignored 产物已删**：`asset-bank.md`、`texture2d.md` 的「Default bundle face」原文写「对照 `output/task10-bundle-names.txt`」，`.gitignore:16` 排除 `output/` 且 npm `files` 不含 ⇒ 改成「按符号名解析 `build/cocosair.module.js` 的单个 `export { ... }` 块」。`atlas.md`/`bmfont.md` 里保留的 `output/playwright/*.json` 提及**不是当证据引**，而是明写「该文件是 gitignored 可再生产物、不是耐久证据、重跑命令才能重得」——这个写法可以留。
- **能力分层现读钉死（引用前一律复算）**：`build/cocosair.module.js` 的单个 `export { ... }` 块在 **:161574**，当前 sha256 前缀 `3a448f029369ac02`；`parseFnt`/`createBitmapFont`/`loadBitmapFont`/`BitmapFont`/`Font`/`Label`/`CacheMode`/`SpriteFrame`/`Texture2D`/`parseAtlasText`/`createAtlasHandle`/`createAtlasSpriteFrame`/`loadAtlas`/`SpriteAtlas`/`AssetBank` 逐个在该块命中（`Label` 命中 2 次＝`Label` + `Label as LabelComponent`）。`docs/evidence/examples-verified.json` 文件级 `measuredAt` = 2026-10-04T05:52:32.537Z、顶层 `candidateFingerprint` = `2f089f6ce25eaccd`，每条 `results[]` 自带同值 fingerprint 且**无** measuredAt。
- **证据面缺口（这是本任务最重要的口径）**：atlas 只有 **1 条**在册 port-gap 记录 `docs/evidence/port-gap/eg3-installed-atlas-s11.json`（`schemaVersion: port-gap-evidence/1`、gate `EG3`、`execution.status: PASS`、`scope.subset: true`/`completed: false`、3/3 measured、0 skipped、limitation `GPU allocation measurements unavailable`）；BMFont **零条在册**（四次采集只活在 gitignored `output/playwright/`，重跑 `node tools/verify/air-bmfont-browser.cjs --out=<new.json>` 才能重得）；`AssetBank`/`AirAssetError`/`loadRemote` 在 `examples-verified.json` 里**一次都没被绑定**（`bankHits` 为空）。已逐条复算并对上：四次 bmfont 采集（17:50:19Z / 17:51:22Z 三引擎 FAIL、`scopePassed: false`；17:53:03Z / 18:01:40Z 三引擎 PASS、chromium 149.0.7827.55 / firefox 155.0 / webkit 26.6）与两次 atlas 采集（`air-atlas-s11-order-fixed` 05:05:51.395Z、`air-atlas-s6-top-origin` 02:45:16.454Z，后者多一条 `Review source bridge; public exports and installed-consumer atlas API not covered`）的 `subset: true`/`completed: false` 全部属实，记录的 bundle 前缀 `d27ed817`/`0252e4d1`/`9eb2db1d`/`de4e0472e8a9cf86`/`88766acbd11e9230` **均不等于当前** `3a448f029369ac02`，而源码前缀 `7320f06f0fd10759`（bmfont.ts）、`b0f9285b53d72624`（parser）、`1c99fc08fdfaca75`（factory）、`86c3d2d813a75f3b`（loader）**仍与今天一致** ⇒ 结论只能写「采集 NOT_RUN、记录早于当前 bundle」。
- **validator 强度必须写在正文里**：`texture2d-ops` 把 `Texture2D.constructor/.reset/.image/.mipmaps/.updateMipmaps/.validate/.description/.toString/.releaseTexture/.initDefault/.getHtmlElementObj` 共 11 个成员**只**绑到 `no-runtime-error`（全部 `reads: 0`），只有 `Texture2D.create` 绑 `visible-frame` ⇒ 证明不抛，不证明像素。真正的强证据是 `texture-basic`：`ImageAsset` 与 `Texture2D` 绑 `material-property`、`Texture2D.destroy` 绑 `resource-released`。`texture2d-serialization` 的 `_mipmaps` 是 `proof: attested` / `state: unresolved` 绑 `visible-frame`。`uploadData`/`setWrapMode`/`setFilters`/`setMipFilter`/`setAnisotropy` **无任何示例绑定**，只能标「源码结论」。
- **手册漂移两处，一处被我初稿写错又改回**：`docs/manual/textures.md:33` 说默认 wrap 是 `CLAMP_TO_EDGE`，源码默认字段是 `REPEAT`（`texture-base.ts:122,128,134`）⇒ 真漂移；`docs/manual/creating-text.md:38-39` 说「AIR 无字体资产管线、`Label` 用系统字体」只对 Creator 字体资产工作流成立，运行时 BMFont 路径已发货且可达（`bmfont.ts:36/:104/:132`、`air/index.ts:32`、assembler 分派 `label/index.ts:37-38`）⇒ 真漂移。但 `docs/manual/atlas-loading.md:65`「公共导出与入口接线由统一集成流程完成」**不是**漂移，初稿误判成「future step」，已改述为「接线已在 `src/air/index.ts:33-35`」；真漂移只有 `atlas-loader.ts:38` 的 JSDoc 仍承诺 `pageExt` 默认 `'png'` 而守卫 `:52-54` 要求显式。
- **Quick Start 初稿不可运行已重写**：初稿在 `new Node()` 未入父节点时就 `addComponent(MeshRenderer)`、用未 `initialize` 的 `new Material()`、还往 3D renderer 上挂 `SpriteFrame` ⇒ 换成 `texture-basic` 已验形状（`createAirApp` → `ImageAsset({_data,format})` → `texture.image` → `assetManager.assets.add` → `loadAssetAsync` 回读同一对象 → `AssetBank.load` 带后缀 URL → `Material.initialize` + `setProperty('mainTexture')` → 末尾按守卫顺序 `assets.remove` / `releaseAsset` / `destroy` / `bank.release`）。
- **判据假阳性两类，一律改写不塞伪路径**：`skillcheck.cjs` 把 `.json` 引用目标截成 `.js`（6 条去重后逐个确认目标真实存在）；`prov-check.cjs` 对裸目录引用报 MISSING（`bmfont.md` 的 `` `docs/evidence/port-gap/` `` 改成「the tracked port-gap evidence tree」即闭合）。另：`texture2d.md` 表格里 `HTMLCanvasElement | HTMLImageElement | IMemoryImageSource | ImageBitmap` 的竖线必须转义成 `\|`，否则表格列数判据报 8 != 5。
- 收口门禁现读：`output/skillcheck.cjs skills/cocosair-assets` ⇒ fmKeys `[name,description]`、dir==name true、**descBytes 934**（初稿正好 1024 零余量，已重写并顺带修掉一处措辞错「a SpriteFont or font handle」→「an atlas or font handle」）、**bodyLines 200**（正卡上限，靠合并列表项而不是删内容压下来的）、sectionOrder true、mistakes `HIGH,HIGH,HIGH,MEDIUM`、narration 0；issues 14（去重 8）＝2 条前向链接（`../cocosair-gltf/SKILL.md`、`../cocosair-ui-2d/SKILL.md`，Task 12/16 才建，属套件级既有状态，router 已带 9 条同类）+ 6 条 `.json`→`.js` 截断假阳性。`output/prov-check.cjs skills/cocosair-assets/references` ⇒ 四个 reference 全 OK、EXIT=0。

### Task 12: `cocosair-gltf`

**Files:** Create `SKILL.md` + `references/{extensions-matrix.md,decoders.md,loader-api.md,diagnostics.md}`

**待核清单：** `GLTFLoader`（`setDRACODecoder`/`setMeshoptDecoder`/`setKTX2Transcoder`/`register`/`unregister`/`getExtensionSupport()`/`loadAsync`/`parseAsync`）、`GLTFAsset`（9 个只读集合、`instantiate(sceneIndex)`）、`GLTFInstance.setAnimationLoop`/`dispose`、`GLTFExtensionStatus` 五档语义（`supported` / `decoder-required` / `device-dependent` / `fallback` / `unsupported`，`src/air/assets/gltf/support.ts:2`；声明 `build/cocosair.module.d.ts:56973`，经 `src/air/assets/gltf/index.ts:7` 与 `loader.ts:213` 导出。**不存在 `GLTF_SUPPORT_STATUS` 这个符号**）与 `GLTFExtensionSupport`（同文件 `:6` 的 `{ name, status }`）、`GLTFError` 码（`GLTF_EXTENSION_UNSUPPORTED|GLTF_DECODER_MISSING|GLTF_DEVICE_UNSUPPORTED|GLTF_EXTENSION_INVALID|GLTF_DECODE_FAILED`）、`GLTFLoadProgress` 五阶段、21 个扩展工厂名单、`MAX_KTX2_DIMENSION=16384`、注册顺序即钩子执行顺序、内部符号（`GLTFParserContext`/`gltfPhysicalEffect` 等）不在公共声明里。

**Common Mistakes 种子：** `[HIGH]` 把解码器当内置（不随 bundle，必须注入，缺失报 `GLTF_DECODER_MISSING`）；`[HIGH]` `getExtensionSupport()` 的 `decoder-required` 读成 `supported`；`MEDIUM` 引用 glTF 内部符号（不在 d.ts，属未发布面）。

**Canonical docs：** `docs/gltf/gltf-runtime.md`、`docs/gltf/gltf-extension-reference.md`、`docs/gltf/gltf-decoder-deployment.md`、`build/gltf-decoders/MANIFEST.md`。

**现读更正（Task 12 收口，重跑本任务时以本节为准）：**
- **派发形状**：四个 reference 分两批各派两个子代理写（事实全部内联进 brief，子代理只做综合＋回源核对），`SKILL.md` 由主代理自己写；写完再派一个**只读**引用审计臂（明写「不许改/建/删任何文件、不许提交」）逐条回源，主代理并行自抽六条引用。**教训同 Task 10/11：≥5 文件先切片再派发，且复核臂必须可被主代理接管。** 两批子代理都回了我 brief 里的错，这正是该形状的预期失效模式。
- **待核清单里的「9 个只读集合」是错的**：`GLTFAsset` 公共只读集合只有**五个**（`meshes`/`materials`/`textures`/`skeletons`/`animations`，`src/air/assets/gltf/asset.ts:54-58`，都是 `@internal` 可变 builder `owned` 的 getter），另有 `sceneNames`/`document`/`warnings` 三个独立成员（`:59-62`）与 `images`/`meshMaterials` 两个 `@internal`（`:63-64`）。正文已按「five read-only collections, not nine」写死。
- **子代理回正的其余 brief 缺陷（全部已核实并写进文件）**：`device-dependent` 并非「无发货 handler 发出」，运行时可达（webp/avif 探测失败、transmission/volume/dispersion 的 `transmissionPipelineAvailable()` 为 false）；meshopt barrel 是**五行** `export *` 不是三行；`tools/dev/dev-server.cjs` 的 MIME 表**没有** `.cjs` 键（manifest 却把三个脚本扩展名都记给它）；`GLTFMeshoptDecoder` 在 `decoder/types.ts:44-53` 不是 `:44-50`；`basis_transcoder` 在 `examples/` 下有 **1** 处命中（`examples/gltf-catalog/capabilities.json:275` 的元数据串）不是 0；`GLTFInstantiationContext` 在 d.ts `:56944` 不是 `:56945`，registry `register`/`unregister` 声明在 `:56961-56962`；18 个 gltf 相关 PASS 例里只有 **17** 个带 `GLTF*` apiProof 绑定（`gltf-catalog` 一个都没有）；distinct gltf apiProof 名 **31** 个不是 43；`meshes` 是 asset-loaded ×2、`animations` 另有 animation-playing ×1、`setMeshoptDecoder` 有 scene-ready ×1；`throwIfAborted` 抛的是与入口同一形状的 `DOMException('glTF load aborted','AbortError')`；`schema.ts` 的 `check`/`item`/`integer` 抛**裸 `Error`**（前缀 `[glTF] `、无 `code`）；`decode` 阶段有**两个**发射点（`loader.ts:139` 汇总 + `parser-context.ts:210` 逐 primitive）；`GLTFExtensionReportEntry` 是**纯声明**，`src/` 内无任何运行时构造点。我 brief 里「抛异常的 `onProgress` 能逃出 teardown」是**假**的——每个发射点都在 `parseAsync` 的 try 内，会经 teardown catch 传播并让整次加载失败。
- **引用审计臂在成品里查出 7 处缺陷，主代理逐条回源确认后修（不是照单全收）**：① `device-dependent`「reachable from four handlers」与本文件表格自相矛盾 ⇒ 改「four `support()` implementations behind five extension names」（`SKILL.md`、`extensions-matrix.md` 各一处）；② `decoders.md` 说 manifest 那句里「第二个名字」不存在 ⇒ 反了，`MANIFEST.md:25` 先名的才是幽灵文件，改「the first name」；③ 「三个解码器 handler 都 live 读 `context.options`」对 draco 不成立 ⇒ draco 在 `extensions/geometry/draco.ts:61` 快照 `const decoder = context.options.dracoDecoder` 后从常量报告（`:64`），meshopt（`:107`）与 basisu（`:34`）才是 live；并补一句「handler 在每次 `getExtensionSupport()`/`parseAsync` 都重建（`loader.ts:99`、`:127-128`），故三者对调用方行为一致」；④ `.glb` 回落引用 `loader.ts:111` ⇒ 实为 `:112`；⑤ `loader-api.md` 第 11 步把 bufferView 替换挂到 `parser-context.ts:196-213`（那是 Draco 的 `resolvePrimitives`）⇒ 改 `:170` 调用 + `:178-194` 实现，`:196-213` 留给 Draco 分句；⑥ `decoders.md` 说 `decoder-audit.cjs`「只查字节/哈希/许可/bundle 排除」与本文件另一处自相矛盾 ⇒ 实有第四查（`:12-15` 声明、`:114` 实现：`npm pack` → 解包 → `require` meshopt 入口），barrel 盲点结论仍成立，因为它 `require` 的是 `meshopt_decoder.cjs` 本身、从不导入 `index.js`；⑦ `SKILL.md` 说 `examples/gltf-meshopt/src/main.ts:94-97`「直接断言」前后翻转 ⇒ 那里只断言注入后的 **handler 级** `support?.().status === 'supported'`，不经 `loader.getExtensionSupport()`，已改述对齐 `extensions-matrix.md` 的准确措辞。
- **两句 meta 指令漏进正文已改写**：三个 reference 的收尾原本写「Never cite anything under output/ as durable evidence」——这是给我的执行约束、不是文档内容 ⇒ 改成文档形状的陈述：原始采集落在 `output/`，它被 `.gitignore:16` 排除且不在 npm `files` 里，所以一条 glTF 结论只有指向 `docs/evidence/examples-verified.json` 或源码时才耐久。
- **行数预算**：`SKILL.md` 初稿正文 212 行（上限 200），靠六处压缩降到正好 200：Quick Start −7（删 `camera.visibility` 与随之无用的 `Layers` 导入、三行 support 循环并成一行 `for`、`addChild`+`frameObject` 合并、删 3 空行）、Related skills −2（5 条并 3 条，删 `cocosair-application`/`cocosair-rendering`，renderer 说明折进 scene-graph 条）、When to use what −2、Canonical docs −1（删我自加的 `docs/gltf/gltf-catalog.md`，计划只列四个）、Contracts −1（「导入即注册」并进「两个入口一条管线」，并就地补出 factory 的 base-URL 规则以免留下悬空指代）、Quick Start −1 空行。**全程合并条目而非删内容。**
- **provenance 头两条陷阱**：`decoders.md` 的头一度列了**不存在**的 `tools/verify/generate-gltf-fixtures.cjs`（`skillcheck.cjs` 的 MISSING FILE 臂会连第 1 行一起查）⇒ 从头部删除，正文也不再反引号它，只说「manifest 那句里第一个名字落不到文件」；`diagnostics.md` 的一致性改动引入了一个反引号裸目录 `` `src/air/assets/gltf/` `` 而头部未覆盖 ⇒ 去反引号改散文。**判据只查引用目标是否存在与行号是否越界，不查那行是否真说了那句话**，所以读源审计臂是必需的、不可省。
- **判据假阳性两类（一律不塞伪路径去凑绿）**：`skillcheck.cjs` 的引用正则把 `.json` 目标截成 `.js`（本技能 30 处 `.json` 引用全部命中此类，去重后 9 条 MISSING FILE）；两条前向链接 `../cocosair-animation-tween/SKILL.md`、`../cocosair-skinning-morph/SKILL.md` 属套件级既有状态（Task 13/14 才建，router 已带同类）。`issues` 是**原始计数**，打印的是去重后前 30 条，故计数可大于可见行数。
- **能力分层现读钉死（引用前一律复算）**：`build/cocosair.module.js` 单个 `export { ... }` 块在 **:161574**、sha256 前缀 `3a448f029369ac02`；`GLTFLoader`/`GLTFAsset`/`GLTFError`/`GLTFExtensionRegistry`/`registerGLTFLoader`/`configureGLTFLoaderDefaults`/三个 `create*Decoder`/`isMeshoptAvailable`/`isKTX2Available`/`detectImageMime`/`SUPPORTED_IMAGE_MIMES`/`KTX2_RAW_MIME`/三个 factory/四个扩展名常量逐个命中；`MAX_KTX2_DIMENSION`、`GLTFParserContext`、`gltfPhysicalEffect` **不命中**（`GLTFParserContext` 在 d.ts 里只以 `__private._air_assets_gltf_parser_context__GLTFParserContext` 出现，`export class` 在 `:72760` 的 `__private` 命名空间内 ⇒ TS 消费方写自定义 factory 时无法命名 context 形参，只能 `Parameters<GLTFExtensionFactory>[0]` 或 `any`）。`GLTFInstance`/`GLTFLoaderOptions` 是纯类型。
- **证据面缺口（本任务最重要口径）**：`GLTFError` 类**零** apiProof 绑定，`GLTF_DECODER_MISSING` 只由 `gltf-draco` 走**拒绝路径**证明（validators 止于 capability-status，**无** visible-frame，即 GLB 里的东西从没渲染过）；另外四个码 `GLTF_EXTENSION_UNSUPPORTED`/`GLTF_DEVICE_UNSUPPORTED`/`GLTF_EXTENSION_INVALID`/`GLTF_DECODE_FAILED` **无任何浏览器证据**。`device-dependent`/`fallback`/`unsupported` 三档在 catalog 21 条里**一条都没有**，后两档更无任何发货 handler 发出。真解码只有 meshopt 一例（`assets/meshopt-khr.glb=1728B` 已证取到、`visible-frame litRatio=0.1606`、`resource-released held=3 leaked=0`）；Draco 浏览器正向解码与 KTX2 transcode **全仓未证**，meshopt 例里的 draco/KTX2 探针按其自述注释就是 mock。`GLTFInstance.setAnimationLoop`/`dispose` 是 `instantiate()` 返回对象字面量上的**闭包属性**，任何 apiProof 机制都挂不上 ⇒ 结构性不可绑定，其证明只能靠「调用点在被验示例源码里且该例 validators 全绿」。
- 收口门禁现读：`output/skillcheck.cjs skills/cocosair-gltf` ⇒ fmKeys `[name,description]`、dir==name true、**descBytes 732**、**bodyLines 200**（正卡上限）、sectionOrder true、mistakes `HIGH,HIGH,HIGH,MEDIUM,MEDIUM`、narration 0、**EXIT=0**；issues 32（去重 11）＝2 条前向链接 + 30 处 `.json`→`.js` 截断假阳性。`output/prov-check.cjs skills/cocosair-gltf/references` ⇒ 四个 reference 全 **OK - all cited paths covered**。非 ASCII：五个文件全 0；行数 `SKILL.md` 202（含 frontmatter）/ decoders 79 / diagnostics 77 / extensions-matrix 79 / loader-api 83。**未提交，全部只留工作树。**

### Task 13: `cocosair-animation-tween`

**Files:** Create `SKILL.md` + `references/{animation-clip.md,tween-ops.md,step-clock.md}`

**待核清单：** `AnimationClip`/`Animation`、`SkeletalAnimation`（属 skinning 技能，交叉引用）、`tween`/`Tween`（pause/compose/clone/repeat/yoyo/remove）、`Component.update(dt)`、`createStepClock`（`begin()` 即 `game.pause()`、`step(dt)`、`end()` 恢复、双时钟守卫抛错、`stepTimeoutMs` 默认 2000）、pose graph 未发布（`marionette`/`procedural-animation` 不在默认 feature）。

**Common Mistakes 种子：** `[HIGH]` 在取证动作/断言时同时跑真实 pacer 与 step clock；`[MEDIUM]` 引用 marionette state machine（未发布）。

**Canonical docs：** `docs/manual/animation-system.md`、`docs/manual/how-to-update-things.md`、`docs/notes/pose-graph-notes.md`。

### Task 14: `cocosair-skinning-morph`

**Files:** Create `SKILL.md` + `references/{joint-paths.md,bind-pose.md,morph.md}`

**待核清单：** `SkinnedMeshRenderer`、`setUseBakedAnimation`、`Skeleton.joints` 全路径规则与 `AIR_E_SKINNING_JOINT_PATH`、`buildSkeletonTree(root, jointPaths)`（bindpose = 世界矩阵逆）、`restoreBindPose`（祖先优先、不改 joints 索引次序）、`Mesh.morphRendering`/`getBoneSpaceBounds`、`SkinningModelComponent` 别名存在性。

**Common Mistakes 种子：** `[HIGH]` joints 写节点短名而非相对蒙皮根的全路径；`[HIGH]` `setUseBakedAnimation(true)` 后又改骨骼节点期待结果变化；`MEDIUM` 以为 `restoreBindPose` 会重排 joints。

**Canonical docs：** `docs/manual/skinning-code-first.md`、`docs/guides/skinned-model.md`。

### Task 15: `cocosair-2d-subsystems`

**Files:** Create `SKILL.md` + `references/{spine.md,dragonbones.md,tiledmap.md,particle-2d.md,billboard.md}`

**待核清单：** `sp`/`Spine`/`loadWasmModuleSpine`（`src/exports/spine.ts:5` 现读为该名）、Spine 资产来源缺口状态、`dragonBones` 与 REALTIME 蒙皮、`TiledMap`/`TiledLayer` 与对象层查询/裁剪脏标记、`ParticleSystem2D` 与 plist 构造链（`MotionStreak2D` 不在导出面）、`Billboard`。

**Common Mistakes 种子：** `[HIGH]` 假设 Spine 开箱可跑（缺后端资产来源，写清 BLOCKED 条件）；`[MEDIUM]` 用 Creator 导出的图集与 plist 路径约定。

**Canonical docs：** `docs/notes/spine-asset-sourcing.md`、`docs/notes/dragonbones-notes.md`、`docs/notes/tiled-map-notes.md`、`docs/notes/particle-2d-notes.md`、`docs/manual/billboards.md`。

### Task 16: `cocosair-ui-2d`

**Files:** Create `SKILL.md` + `references/{canvas-widget-layout.md,widgets.md,label-and-text.md,sorting.md}`

**待核清单：** `createUICanvas(scene,name,{designWidth=1280,designHeight=720,layer})`（相机 clearColor 与 near/far 实读）、`spriteNode`/`labelNode`（fontSize 28、lineHeight ×1.25、`AIR_E_LABEL_WRAP`）、`Canvas`/`Widget`/`Layout`/`Button`/`ScrollView`/`ProgressBar`/`Slider`/`Toggle`/`EditBox`/`PageView`/`SafeArea`/`BlockInputEvents`、`Label` 系统字体 + BMFont 绑定、`RichText`/`LabelAtlas` 可用性、`SortingLayers`/`Sorting2D`/`Intersection2D`。

**Common Mistakes 种子：** `[HIGH]` 期待 Label 走字体资产管线（仅系统字体 + 受支持 BMFont）；`[HIGH]` UI 节点没设 `Layers.UI_2D`/相机没绑 `canvas.cameraComponent`；`[MEDIUM]` 抄 `creating-text.md:39` 的旧口径。

**Canonical docs：** `docs/manual/2d-ui.md`、`docs/manual/ui-layout-and-interaction.md`、`docs/manual/creating-text.md`、`docs/manual/bitmap-font-loading.md`。

### Task 17: `cocosair-graphics-and-dom`（改名后扩写）

**Files:** Modify `skills/cocosair-graphics-and-dom/SKILL.md`；Create `references/{commands.md,raster.md,sprite-mask.md,ui-blend.md,texture-sprite.md,ui-mesh.md,dom-overlay.md,html-source.md}`

**待核清单：** 保留现正文全部规则并补：`AirGraphicsCommand` 命令名全集与 `#rrggbb` + opacity 校验、`drawAirGraphics` 仅 solid/nonzero 且对 gradient/pattern/evenodd 抛错、`airGraphicsCommandsToSvg` 对 `textureSpace:'global'` 与缺 `sourceURL` 的拒绝、`rasterizeAirGraphics` ≤8192 每边与 `worldTransform` 必填条件、`attachAirSpriteMask` 的 `channel`/`mode`/`threshold`/`inverted` 与只作用单个 Sprite、`createAirUIBlendScope` 的 `normal|add|multiply` 与私有 blend 因子改写、`createAirTextureSprite` 纹理借用、`AirUIMesh` 3..1024 顶点 / ≤1365 三角形、`createAirDOMOverlay` 仅平面正交、`createAirHTMLSource` 实验子路径（元素须为 canvas 直接子节点并独占租约）。

**Common Mistakes 种子：** `[HIGH]` 给栅格化结果再加一次上下翻转；`[HIGH]` 对任意 `Graphics.impl` 调 `airGraphicsCommandsToSvg` 期待还原曲线；`[MEDIUM]` 把 sprite mask 当子树遮罩。

**Canonical docs：** `docs/manual/graphics-and-dom.md`（唯一契约）。

### Task 18: `cocosair-input-action`

**Files:** Create `SKILL.md` + `references/{native-input.md,action-state.md,action-input.md,scene-stack.md}`

**待核清单：** `input`/`systemEvent`、`EventTouch`/`EventKeyboard`/`KeyCode`、`createActionState`（按 `(action, source)` 幂等按下、`reset(reason)` 七种原因且不摘监听器）、`createActionInput`（`backend: 'native'|'dom'|'manual'`，`dom` 必须显式给 `canvas`、不抢焦点、跳过 INPUT/TEXTAREA/SELECT/contenteditable）、`createSessionGate`、`SceneStack`（`maxCachedPages=4`、转场期双页渲染、`#GameCanvas` 捕获阶段 `stopImmediatePropagation`、LRU 驱逐先摘 handle 再销毁）、`AudioService` 的手势解锁联动（交叉引用 audio-video）。

**Common Mistakes 种子：** `[HIGH]` `dom` 后端不传 `canvas` 期待自动发现；`[HIGH]` 以为 `reset()` 会移除监听器；`[MEDIUM]` 焦点期按键期待仍然触发。

**Canonical docs：** `docs/manual/input-and-events.md`、`docs/manual/input-action-state.md`、`docs/manual/test-input-injection.md`。

### Task 19: `cocosair-physics`

**Files:** Create `SKILL.md` + `references/{backend-selection.md,3d-contracts.md,2d-box2d.md}`

**待核清单：** `physics: 'builtin'|'cannon'` 与 `selectPhysicsBackend`（官方「后注册者胜」，零后端时**只告警不抛**，真为 `PHYSICS_NONE`）、`default-physics-material` 播种（错误码 9642 对 cannon 致命、对 builtin 良性）、`PhysicsSystem`/`RigidBody`/`Collider` 与 `physics` 命名空间、2D Box2D 纯 JS 后端与 `testPoint`/`testAABB`/`raycast`、3D builtin 查询有但不做积分的边界、ammo/physx/box2d-wasm 缺席（需 Emscripten 产物）。

**Common Mistakes 种子：** `[HIGH]` 默认 `createAirApp({})` 期待 cannon 重力/堆叠行为；`[MEDIUM]` 引用 WASM 后端。

**Canonical docs：** `docs/manual/physics-2d-and-3d.md`、`docs/notes/physics-3d-notes.md`、`docs/reference/api-stability.md`。

### Task 20: `cocosair-audio-video`

**Files:** Create `SKILL.md` + `references/{audio-service.md,videoplayer.md,webview.md}`

**待核清单：** `AudioService`（`load`/`playBgm`/`pauseBgm`/`stopBgm`/`resumeBgm`/`setBgmVolume`/`bgmState`/`playSfx` 与 `maxSfxVoices=5` 溢出记 `sfxDropped`/`setMusicEnabled`/`setSfxEnabled`/`dispose`）、以实测 `currentTime` 推进作为播放证据、`AudioSource`/`AudioClip` 与手势解锁、`VideoPlayer` 事件面与透明视频、`WebView` 限制与 `evaluateJS`。

**Common Mistakes 种子：** `[HIGH]` 用 `playing` 标志断言音频在播；`[MEDIUM]` 无用户手势即自动播放期待成功。

**Canonical docs：** `docs/manual/audio-video-webview.md`、`docs/notes/audio-notes.md`、`docs/notes/video-notes.md`、`docs/notes/webview-notes.md`。

### Task 21: `cocosair-agent-session`

**Files:** Create `SKILL.md` + `references/{agent-session.md,runtime-control.md,visual-probes.md}`

**待核清单：** `__airApp` 绑定、`tools/debug/agent-session.ts` 的请求契约（`requestId/action/targetId/params` → `{requestId, ok, result|error}`；重复 `requestId` 在执行中与保留窗口内**拒绝**为 `INVALID_ARGUMENT`，FIFO 256）、`inspectScene`/`inspectNode` 快照、AFTER_DRAW 帧捕获、`getRuntimeErrors` 环形缓冲、可视化探针像素区域约定。**会话协议、快照与探针面全部来自开发工具源码（`tools/debug/**`），不得用主入口 `.d.ts` 验收。** 诊断上限属 runtime 而非 devtools：`AirDiagnostics` 接口在主入口声明里（`build/cocosair.module.d.ts:55725`，`src/air/diagnostics.ts:14`），600 字符截断与 80 条淘汰在 `src/air/diagnostics.ts:33`/`:42`，按 runtime 面核；只有工厂 `createAirDiagnostics` 是 `@engineInternal` 且不在 SDK 声明（`src/air/diagnostics.ts:23-24`）。

**Common Mistakes 种子：** `[HIGH]` 对写操作盲目重试同 `requestId`（会得到拒绝而非首次结果）；`[MEDIUM]` 把 devtools 面当默认 runtime 能力写进应用代码。

**Canonical docs：** `docs/guides/agent-development.md`、`docs/guides/runtime-inspection.md`、`docs/guides/visual-probe-contracts.md`、`examples/automation`。

### Task 22: `cocosair-verification`（改名后扩写）

**Files:** Modify `skills/cocosair-verification/SKILL.md`；Create `references/{report-layers.md,gate-catalog.md,playwright-prereqs.md}`

**待核清单：** 三层报告口径（源码导出 / 默认 bundle 可达 / 浏览器行为）、写门禁与只读门禁区分（`verify:api-coverage`、`verify:v06-gate`、各类 evidence collector 会写仓库内容）、证据指纹绑定与子集语义、`verify:release` 需干净工作树、Playwright 前置（非项目依赖时需 `NODE_PATH` 或 `PWCLI`）与浏览器二进制可用性、HEADLESS 不产出像素、能力缺失仅在能力发现后才记 `UNSUPPORTED`（启动/着色器/超时/黑屏是 FAIL）。

**Common Mistakes 种子：** `[HIGH]` 把子集 PASS 写成 release ready；`[HIGH]` 拿旧轮证据当当期结论；`[MEDIUM]` 为了解释命令用途而触发写证据的门禁。

**Canonical docs：** `docs/reference/verification.md`、`AGENTS.md` 命令表、`docs/reference/example-specification.md`。

### Task 23: 套件收尾与交付报告

**Files:** 无新增（只跑检查与写交付说明）

- [ ] **Step 1: 全 22 目录规范复扫**

```bash
node -e '
const fs=require("fs");
const dirs=fs.readdirSync("skills",{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name);
console.log("skillDirs",dirs.length);
for(const d of dirs){
  const md=fs.readFileSync("skills/"+d+"/SKILL.md","utf8");
  const name=(md.match(/^name:\s*(.+)$/m)||[])[1];
  const desc=(md.match(/^description:\s*(.+)$/m)||[])[1]||"";
  const body=md.split(/^---$/m)[2].split("\n").length;
  const ok=(name===d)&&(Buffer.byteLength(desc)<=1024)&&(body<=200);
  if(!ok)console.log("FAIL",d,"name="+name,"descBytes="+Buffer.byteLength(desc),"body="+body);
}
console.log("routerRows",fs.readFileSync("skills/cocosair/references/skill-index.md","utf8").split("\n").length);
'
```
预期：`skillDirs 22` 且无 `FAIL` 行。

- [ ] **Step 2: router 覆盖完整性**

```bash
node -e '
const fs=require("fs"),path=require("path");
const t=fs.readFileSync("skills/cocosair/SKILL.md","utf8");
for(const d of fs.readdirSync("skills")){
  if(d==="cocosair"||!fs.existsSync("skills/"+d+"/SKILL.md"))continue;
  if(!t.includes("../"+d+"/SKILL.md"))console.log("NOT ROUTED",d);
}
let bad=[];
for(const f of ["skills/cocosair/SKILL.md","skills/cocosair/references/skill-index.md"]){
  for(const m of fs.readFileSync(f,"utf8").matchAll(/\]\(([^)#]+)\)/g)){
    const l=m[1].trim();
    if(/^[a-zA-Z]+:/.test(l))continue;
    if(!fs.existsSync(path.resolve(path.dirname(f),l)))bad.push(f+" -> "+l);
  }
}
console.log("routerBrokenLinks",bad.length,bad.join("\n"));
console.log("done");
'
```
预期：无 `NOT ROUTED` 行且 `routerBrokenLinks 0`。Task 1 Step 4 刻意跳过的 router 跨技能链接检查在此闭合——此时 21 个子技能目录都已存在，缺任何一条就是真缺陷。

- [ ] **Step 3: 打包门禁（写行为，先确认输出路径不存在）**

```bash
node tools/verify/graphics-package.cjs --out=output/skills-suite/package-$(date +%Y%m%d-%H%M%S).json
```
预期：skill 路径三项通过；其余项按当期实际输出报告。失败先归因（并行会话 / bundle 陈旧 / npm CLI 推导），不把他人 FAIL 记成本套件回归，也不手改期望值凑绿。

- [ ] **Step 4: 运行时抽样（2 个渲染类技能）**

从 `cocosair-rendering` 与 `cocosair-graphics-and-dom` 各取一段 Quick Start 调用序列做真实浏览器执行并截图。**落盘位置只在 `output/skills-sample/`（`output/` 已在 `.gitignore`），验证后删除；不新增也不修改 `examples/` 与 `build/` 下任何文件**——本计划的写入面不含 `examples/**`，把调用序列合入现有同主题示例属于需要 owner 单独批准的范围变更。

同源托管方式（已核对 `tools/dev/dev-server.cjs`：`:355` 只放行 `/build/` 前缀，`:417-420` 要求静态文件解析后仍落在 `EXAMPLES_DIR` 内，因此 `output/` 下的页面直接访问必然 404）：

1. 起 `npm run dev`（默认 7454；记录自己启动的 PID，收尾只按该 PID 关）。
2. 一次性 Playwright 脚本放在 `output/skills-sample/`，先 `context.route('http://127.0.0.1:7454/__skills-sample/', route => route.fulfill({ contentType: 'text/html', body: <内存中的 HTML> }))` 拦截一个同源假 URL，不产生任何仓库文件。
3. 该 HTML 满足启动契约：`#GameCanvas` 元素先于任何 `import`；importmap 必须先于 module script，指向同源的 `/build/cocosair.module.js`（当期 `npm run build` 产物）。
4. 断言按技能判据写（像素非空 / 关键实体可见），截图存 `output/skills-sample/`；报告里标注「抽样运行，非 Gallery 正典证据」。
5. 关闭自己启动的 dev server 与浏览器，删除 `output/skills-sample/`。

其余技能代码片段仍只声明「已对源码核对，未运行时验证」。

- [ ] **Step 5: 交付报告口径**

逐技能列：SOP-1 的 `file:line` 出处数、Common Mistakes 条数、references 文件数、验收状态（PASS / 未运行时验证 / BLOCKED + 原因）。明确写出「本套件无自动漂移门禁，内联内容靠人工同步」，不把静态核对说成运行时验证。

- [ ] **Step 6: 提交（仅在 owner 授权后）**

逐路径 `git add skills/... tools/verify/graphics-package.cjs`，禁止 `git add -A`。

---

## 自检（计划 ↔ spec）

| spec 要求 | 对应任务 |
| --- | --- |
| 22 个目录、`cocosair-*` 命名、router 分组路由 | Task 0、1、2–22 |
| Code First 纪律并入 router、删除 `air-code-first` | Task 1 |
| 门禁三行接线且不改语义 | Task 0 Step 4、Task 23 Step 3 |
| `schemaVersion` 等稳定标识不动 | Task 0 Step 1 |
| SKILL.md 骨架、行数、description 规范 | SOP-2、SOP-5 |
| references 全量内联 + 来源与日期头 | SOP-3 与各任务 references 清单 |
| 逐符号对源码/d.ts，按实际入口验收 | SOP-1 与各任务待核清单 |
| docs 三层口径与 BLOCKED/N-A 处理 | SOP-2、Task 8、15、22 |
| 运行时抽样且不留新 example | Task 23 Step 4 |
| 不新增脚本/plugin/README 总表/AGENTS 改写 | 全计划无此类文件写入 |

缺口说明：spec 的「每技能 Common Mistakes ≥2 条 [HIGH]」在计划里由 SOP-4 + 各任务种子承载，未逐技能穷举——实现者须按 SOP-4 判据补齐，不得留空。

## 分批与检查点

按 spec 的实施顺序波次推进，每波结束做一次检查点复核（SOP-5 全项 + 该波技能的符号复核汇总），不要在波内连续堆叠未复核的技能：

| 波次 | 任务 | 出口判据 |
| --- | --- | --- |
| W1 | Task 0（改名 + 门禁接线）、1（router）、2（project-setup）、3（application）、17（graphics-and-dom 扩写）、22（verification 扩写） | router 与两个改名技能通过 SOP-5；门禁静态核对除 `skills/cocosair/SKILL.md` 转 `OK` 外无新增 `MISS` |
| W2 | Task 4（scene-graph）、5（camera）、6（math）、7（materials-effects）、8（rendering） | 逐技能 `file:line` 出处于复核记录；Common Mistakes 达到 SOP-4 下限 |
| W3 | Task 9（primitives-mesh）、11（assets）、12（gltf）、13（animation-tween）、14（skinning-morph） | 同上；跨入口面（子路径与 devtools）按 SOP-1 的入口选择核对，不用主入口声明代替 |
| W4 | Task 10（performance）、15（2d-subsystems）、16（ui-2d）、18（input-action）、19（physics）、20（audio-video）、21（agent-session）+ Task 23 | Task 23 Step 1/2 全绿：`skillDirs 22`、无 `FAIL`、无 `NOT ROUTED`、`routerBrokenLinks 0` |

时间口径（诚实版，替代早期草稿里「每技能 15 分钟」的乐观估算）：

- SOP-1 的 grep 核对与 SOP-5 的单技能自检脚本本身是秒级到分钟级（单文件、无浏览器）。
- 全量内联 `references/` 的撰写不设时间上限：一个技能的 references 超过一次复核可承受的量，就按 references 文件拆到下一批，宁可批次多也不省内容。
- 波内任一任务出现浏览器证据（Task 23 Step 4）或门禁 `--out` 运行，其耗时由当期环境决定，不并入静态批次的预算。
- 交付报告（Task 23 Step 5）必须按实际耗时与批次如实汇报，不引用本节数字作为承诺。
