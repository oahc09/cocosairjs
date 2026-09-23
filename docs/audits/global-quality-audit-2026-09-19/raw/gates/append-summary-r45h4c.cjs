'use strict';
// r45h4c 收尾：verification-summary.md §10 末尾**纯追加** ⑤c（同轮第三处更正的终读）。
// 判据：锁 + 纯追加不变量（after 以 before 原文起头）+ Buffer.byteLength 差值账 + 标记唯一 + 落盘回读。
const fs = require('fs');
const crypto = require('crypto');
const FILE = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19/verification-summary.md';
const LOCK_BYTES = 195527;
const LOCK_SHA16 = '50dbf2a98968d308';
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

const before = fs.readFileSync(FILE);
if (before.length !== LOCK_BYTES || sha16(before) !== LOCK_SHA16) throw new Error(`ASSERT 锁：${before.length} / ${sha16(before)}`);
const t = before.toString('utf8');

const ADD = '\n**⑤c r45h4c 追加（03:46–04:00Z，同轮第三处自我更正＝口径更正，零重采、零改 `src/`、零改产物、零 stage）**：§1 LV12-20 的 r45h4 追加句里「**对前 16 条仍成立**」会被读成"本轮把 16 条护栏又跑了一遍"。实情是本轮只**抽测** 4 条（`verify:v12-backends` / `verify:v12-feature-face` / `verify:doc-refs` / 新第 17 条 `verify:v11-chain-face`，四条全 `EXIT=0`），其余 12 条沿用 **r45h 01:44–02:05Z 全量复跑**的当期值 ⇒ 报告原句后已补「读数出处澄清」，「16 绿 / 1 红」显式标成「最近一轮全量 + 本轮抽测」的**合成口径**。⇒ 通则：**"当期绿"必须能答出是哪一轮跑的**，否则就是替别的轮次宣据（同 §7.10「读数以何为准」、覆盖率数字须声明口径/分母/日期）。**两处发布面改动的还原判据逐处分别报告，不合并成一句"可逆"**：报告侧 `124,026 B 732066178e348203`（307 行，净 +413 B）删澄清段并还原连接号 ⇒ **逐字节命中** r45h4b 快照 `123,613 84674600b552777e`；notes 侧 `124,175 B c11245416974ce7e`（1,029 行，追加段 770 B + 行内快照标注 89 B）反向还原只到 `123,316`、距 `123,315` **差 1 B 未凑平** ⇒ 如实记为**部分还原**，判据改用现读字节+sha16 与门禁终读，不拿未成立的还原等式充数（脚本 `raw/gates/verify-r45h4c-revert.cjs`，其 `EXIT=0` 只表"跑完并如实打印"，不代表两处都命中）。**发布面两门禁重跑（两份日志逐字入 `raw/gates/r45h4c-*.log`）**：`verify:doc-refs` **EXIT=0**（`refsChecked 1079` / `unresolvedCount 0` / `staleBaselineCount 0` / 棘轮 31 条全命中，与 r45h4 终读逐字同值）；`verify:consumer` **EXIT=1** 且 `failures` 恰 1 条＝ F-85、`exportCount 574`、`published-artifacts` 4 markers × 2 bundles **0 fail**、tarball 10,352,450 → **10,353,123 B**（+673 B 全由 `docs/*.md` 文字造成，未新增失败项）。**台账链**：`evidence-index.json` 71,159 `4283d4b5a46a3629` → **74,825 `e193644ce2cb2961`**（仍 80 行；r45h4 行 `raw[]` 12 → 15、`commands[]` 9 → 12、7 处字段扩充由循环外字面量 `EXPECTED_PLAN_COUNT = 7` 与 `applied` 计数器双向钉死，反向变换逐字节回到原行）。三产物哈希与 ⑤ 段逐字一致（dev `35496aebda066ab5` / min `8795c8685ace28a1` / d.ts `6d01c030d85bf86c`）⇒ 「零改产物」在 r45h4c 之后仍然成立。`findings.jsonl` 未动（132 行 `d8c865ff1d6381ac`）。**状态**：本子轮（r45h4 + r45h4b + r45h4c）**PASS**；任务 #27 收口；LV12-20 仍 **PARTIAL**，十七条护栏 **16 绿 / 1 红**，唯一红项仍是 `verify:api-coverage`（#18）。\n';

const after = t + ADD;
if (!after.startsWith(t)) throw new Error('ASSERT 纯追加不变量');
const marker = '**⑤c r45h4c 追加';
if (t.includes(marker)) throw new Error('ASSERT 防重复追加');
if (after.split(marker).length - 1 !== 1) throw new Error('ASSERT 标记唯一');
const expected = Buffer.byteLength(t, 'utf8') + Buffer.byteLength(ADD, 'utf8');
const buf = Buffer.from(after, 'utf8');
if (buf.length !== expected) throw new Error(`ASSERT 字节账（UTF-8）：${buf.length} != ${expected}`);

fs.writeFileSync(FILE, buf);
const disk = fs.readFileSync(FILE);
if (disk.length !== buf.length || sha16(disk) !== sha16(buf)) throw new Error('ASSERT 落盘回读不一致');
const reAdd = disk.toString('utf8');
if (!reAdd.startsWith(t)) throw new Error('ASSERT 回读仍满足纯追加');
console.log(JSON.stringify({ bytes: disk.length, sha16: sha16(disk), lines: disk.toString('utf8').split('\n').length, delta: disk.length - before.length, beforeLines: t.split('\n').length }, null, 2));
