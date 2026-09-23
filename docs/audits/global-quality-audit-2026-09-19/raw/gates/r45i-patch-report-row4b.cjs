'use strict';
// r45i 第二处发布面落表：§2 行 4b 追加「本轮 jest 2 红的归因 + r45i 自身面当期绿」。
const fs = require('fs');
const crypto = require('crypto');
const REPO = 'E:/AIProMax/github/cocosair.js/';
const FILE = 'docs/acceptance-report-v12.md';
const LOCK = { bytes: 126842, sha16: '879b57dd8b1906a7' };
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const before = fs.readFileSync(REPO + FILE);
if (before.length !== LOCK.bytes || sha16(before) !== LOCK.sha16) throw new Error(`ASSERT 锁：${before.length}/${sha16(before)}`);

const ANCHOR = '**UPDATE-r45h（01:49Z）**：本行 `build` / `build:min` 两格**本轮已自跑**（`EXIT=0`），重建前后两份 bundle 的 `sha256₁₆` 与上述登记值逐一相同 ⇒ 当前树可复现交付字节，见 §2.1 行 4b/7。 |';
const s0 = before.toString('utf8');
const hits = s0.split(ANCHOR).length - 1;
if (hits !== 1) throw new Error(`ASSERT 锚点 hits=${hits} != 1（写前抛错，零污染）`);

const ADD = ' **UPDATE-r45i（04:31Z 复跑归因，本轮新增 11 例 × 两引擎非正典证据 ⇒ 见 §1 LV12-01）**：`npx jest` 现读 **32 套件 / 262 用例 / 260 passed / 2 failed**（`docs/audits/global-quality-audit-2026-09-19/raw/gates/r45i-jest.log`，`jest_EXIT=1`）。两条红**同源于并行会话**、与本轮零交集：① `smoke-29` §15 = `spec-validate --strict` 的 `result.status` 由 0 变 1；② `smoke-29` §11/§12 逐字 `[FAIL] mesh-sphere S11-STALE-EVIDENCE: 证据 specFingerprint c0d64a28c555 ≠ 当前 example.json 6a2bfacb3483`。现读 `git diff examples/mesh-sphere/example.json` ⇒ 工作树被注入 `"not-a-real-validator"` ×2（`validation.functional`）且 `promotion.candidate` 由 `5612c4c2746f395b` 改为 `9fa85f88b968d5f1`，`docs/evidence/v11-spec-validate.json:167` 亦带着同一条 issue ⇒ 判定＝**负控捕获未撤**（F-132 在写树面的继续发作），本会话不改并行会话的在写文件、不擅自撤 NC、不据此改 `verify:api-coverage` 或晋升口径。同轮 `verify:test-inventory` `EXIT=1` 只是它内嵌重跑 jest 撞上同一 2 红（`totals {32,262,260,2}`、`failures` 三条逐字指向同两条用例）⇒ **F-132 后果升级**：并行 NC 不再只覆写磁盘证据，而是让**共享工作树的 `npm test` 对所有会话转红**，任何会话报「jest 全绿」都必须现读而不是引用上一轮。**r45i 自身面当期绿**：`smoke-30` **38/38 PASS**（含新目录 `docs/evidence/v12/pilot12-r45i/` 的在册豁免生效，见下）、`typecheck EXIT=0`、`verify:v11-chain-face EXIT=0`（52 记录 / 52 PASS / 指纹单值 `9fa85f88b968d5f1`）、`verify:doc-refs EXIT=0`（`unresolvedCount 0` / `staleBaselineCount 0` / `baseline 31/31`；`refsChecked` 与 `skippedCounts.glob` 只作轮次快照）、`verify:consumer` 失败项恰为 F-85 一条（`README links to missing packaged file: docs/manual/index.md`）、`exportCount 574` 不变。本轮为登记该证据新增的两处**在册豁免**：`test/smoke/smoke-30-v12-regression.test.ts` 的目录对账映射 +1 条（`pilot12-r45i`＝非矩阵捕获，理由指向该目录自带 README），属**登记新孤儿捕获**而非放松阈值——改前该用例先因本目录**精确转红**（`Received ["pilot12-r45i"]`）再修，方向与 F-131 一致。三交付产物 `sha256₁₆` 现读 `35496aebda066ab5` / `8795c8685ace28a1` / `6d01c030d85bf86c`（字节 6,081,668 / 3,499,182 / 3,082,360）与登记值逐一相同 ⇒ 本轮零改 `src/`、零重建、证据货币未动。';

if (!ANCHOR.endsWith('。 |')) throw new Error('ASSERT 锚点结尾形态');
const s1 = s0.replace(ANCHOR, ANCHOR.slice(0, -2) + ADD + ' |');
if (s1 === s0) throw new Error('ASSERT 替换无效');
fs.writeFileSync(REPO + FILE, Buffer.from(s1, 'utf8'));
const after = fs.readFileSync(REPO + FILE);
console.log(JSON.stringify({ bytes: after.length, sha16: sha16(after), delta: after.length - before.length, lines: after.toString('utf8').split('\n').length }, null, 2));
