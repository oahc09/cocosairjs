'use strict';
// r45h4：verification-summary.md 文末纯追加 §10。
// 判据：锁 + 计划条数常量 + Buffer.byteLength 字节账 + 原文必须是结果的前缀（EOF 追加的最强形式）。
const fs = require('fs');
const crypto = require('crypto');

const FILE = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19/verification-summary.md';
const LOCK_BYTES = 187750;
const LOCK_SHA16 = '5d4e890eaba8c515';
const EXPECTED_PLAN_COUNT = 1;
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

const before = fs.readFileSync(FILE);
if (before.length !== LOCK_BYTES || sha16(before) !== LOCK_SHA16) {
    throw new Error(`ASSERT 锁：现读 ${before.length} / ${sha16(before)} != ${LOCK_BYTES} / ${LOCK_SHA16}`);
}
const t = before.toString('utf8');
if (!t.endsWith('\n')) throw new Error('ASSERT 原文不以换行结尾（EOF 追加需先补分隔）');
if (t.includes('### 10 r45h4')) throw new Error('ASSERT 防重复追加：§10 已在文');

const SEC = `### 10 r45h4 追加：把「V1.1 证据链被引用却无人守档」变成第 17 条只读护栏，并顺手钉死一条自己的方法学错误

**① 动机（先证伪，再建轮子）**：§2.1 的离线复算读数里发现一条**不对称**——三引擎矩阵证据的字节货币性**已经有** jest 门禁（\`test/smoke/smoke-30-v12-regression.test.ts\` 内 5 条断言：completed / bundle 哈希 / 契约指纹 / 逐张 PNG 在盘且逐字节 / 覆盖率不许静默漏跑），而 V1.1 证据链 \`docs/evidence/v11-examples-verified.json\` 在 \`test/\` 下 **0 命中**（\`grep -rln "v11-examples-verified" test/\` → 空），却被发布面文档引用 **11 篇 / 25 处**（\`grep -rl "v11-examples-verified" docs/ README.md UPSTREAM.md | grep -v "docs/audits/"\`；含 \`docs/audits/**\` 台账则 43 篇 / 102 处，台账自己占 77 处 ⇒ 这种数**只能按快照引用**，它会因"引用它"这句话而涨），并被 \`tools/examples/coverage-report.cjs\` + \`tools/examples/spec-compliance-audit.cjs\` 当输入消费 ⇒ 缺口是真的，不是没看见。

**② 门禁本体（\`tools/v12/verify-v11-chain-face.cjs\`，8,795 B / \`d405520568b21224\`，npm script \`verify:v11-chain-face\`）**：七条**只读内部自洽**不变量 V1–V7（completed/partial 标记、计数自洽、逐条 PASS 且 id 唯一、三个 16 位十六进制指纹且全表 \`candidateFingerprint\` 恰一个不同值、文件级 \`apiProofTotals\` == 逐条聚合且 \`unproven === 0\`、\`runner\` 指向的采集脚本仍在盘、\`measuredAt\` 可解析且不晚于当前时刻）。首跑与落表后复跑读数逐字一致：\`{"ok":true,"records":52,"runPass":"52/52","fps":"9fa85f88b968d5f1","apiProof":"verified:1004 attested:129 unproven:0","live":"9fa85f88b968d5f1==evidence","errorCount":0}\`（\`raw/gates/r45h4-chain-face-run.log\`）。**边界是设计的一部分**：不断言 \`candidateFingerprint == 当前树现算值\`——那条等式会把「改任何 \`src/\` 就要重采 52 例 × 三引擎 ≈1.9 h」变成既成事实，那是 owner 的预算决策（#15 / #21 / F-132 (c) 同一张桌子）；现算值只作 \`live\` 段信息打印、不进退出码 ⇒ 本门禁只主张「在册证据不被静默改坏」，**F-82 类「绑定当期交付物」缺口在 V1.1 链侧仍未闭合，本轮不主张闭合**。

**③ 反空转与十臂负控（\`passCount 10 / 10\`，\`raw/gates/r45h4-chain-negctl.{cjs,log}\`）**：V2 内含「记录数 > 0 才可能绿」——0 条的"全过"判 NOT 绿。首跑 **9/10**：N4（清空 \`results\`）同响 V2 与 V5。归因后改的是**臂**不是门禁（清空逐条记录却留着文件级聚合，等于制造第二种病），于是 N4 同步把四个计数与 \`apiProofTotals\` 一并归零 ⇒ 只剩反空转守卫可红 ⇒ 10/10。**每个臂只报自己那一层**，这才证明七条断言没有一条恒真。变异副本全部写仓库外，门禁只读 ⇒ 零覆写 \`docs/evidence/**\`。

**④ r45h4b：本轮真正的收获是抓到自家落表脚本的漏项，而它原本该被"看起来最硬"的守卫抓到**。\`apply-accept-r45h4.cjs\` 声明 4 处插入、跑完 \`EXIT=0\`、字节账通过、纯追加还原通过，结果只落了 **3** 处——第 4 处被 \`EDITS.pop()\` 摘出去做「整行锚点」特殊处理后**没放回被迭代的数组** ⇒ 锚点断言、字节账、还原校验与实际循环**共用同一个 \`plan\` 来源**，「插入后字节 == 插入前 + sum(实际插入)」是恒等式，对漏项零判别力。发现路径不是差值而是**脚本文本自己打印的计划条数（3）≠ 本轮声明的计划条数（4）**，随即 \`grep -c\` 复测该 bullet = 0 命中。⇒ 通则：**批量落表的"独立性"来自判据与执行路径不同源**，计划条数要用循环外的字面量常量钉死；这是 §7.12 第 2 条「锚点不存在会静默空转」的同族变体，区别在于这次锚点断言真的跑过了（漏在数据流，不在匹配）。单条更正脚本 \`apply-accept-r45h4b.cjs\` 落地后四处齐。

**④b 同轮抓到的第二处自己的错（口径错，不是机制错）**：本门禁的动机段初写「V1.1 链被 \`docs/*.md\` **42 处**引用」——那是个没有 grep 命令、没有分母口径的裸数字，现读发布面是 **11 篇 / 25 处**、含台账才是 43 篇 / 102 处。已在 §7.13 与本节按同轮自写文本就地订正，并把可复算命令写进正文。⇒ 通则两条：**凡引用计数必须带命令与口径**（否则下一轮无法判断它是"当时读到的"还是"顺手写的"）；**计数若包含本仓库自己的记录文件，就会因描述它这句话而增长**（§7.12 第 3 条同族），这类数只作快照、不作货币。

**⑤ 字节链与发布面（编辑完成后现读）**：报告 \`docs/acceptance-report-v12.md\` 120,607 \`110ad66928bc2b89\` → 123,231 \`32ad69c1af9e21c3\`（+2,624，三处）→ 123,613 \`84674600b552777e\`（+382，补第 4 处），305 → 307 行；\`docs/v12-upstream-regression.md\` §7.13（含 r45h4b 自我更正段 + 引用计数口径订正）现读 123,315 B / 1,027 行 \`14ce7e2bcedc9a64\`；\`evidence-index.json\` 79 → 80 行 63,117 \`7d2cc1f7a44d1b80\` → 68,528 \`6e8f5ab96a621c3e\` → 68,930 \`0b028d6ccb5145d1\`（末次＝④b 的就地订正，反向替换可还原 + 其余 79 行逐条 \`JSON.stringify\` 等值）；台账本文件与 evidence-index 在 \`files[]\` 外、不进出货面。三产物逐字节未变：dev 6,081,668 \`35496aebda066ab5\` / min 3,499,182 \`8795c8685ace28a1\` / d.ts 3,082,360 \`6d01c030d85bf86c\` ⇒ 「零改 src、零改产物」兑现。门禁复跑（**在下面两处台账写入之前**现读）：\`verify:doc-refs\` \`EXIT=0\`（\`refsChecked 1078\` / \`unresolvedCount 0\` / 棘轮 31 条全命中 / \`skippedCounts {glob:54, external:0, outOfRepo:0}\`——outOfRepo 恒 0 仍是 F-130 记的门禁缺陷，不是债务为零）；\`verify:consumer\` \`EXIT=1\` 且 \`failures\` 仍只有 F-85 一条、\`exportCount 574\`、tarball 10,347,496 → **10,352,297 B**（\`docs/*.md\` 在 \`files[]\` ⇒ 每次文档改动必重跑）。⇒ 又一条自指后果：**本节文字含被计数的字符串两次**，写完本节后台账侧那个「43 篇 / 102 处」快照即失效，只有发布面口径（排除 \`docs/audits/**\`）不受本文件影响。

**状态**：本子轮 **PASS**（一条新护栏落地且十臂证明非恒真；一次自家落表漏项当场发现、当场以独立判据补齐；零重采、零覆写正典证据、零改产物）。整体 **V1.2 仍未达验收通过**：LV12-20 **PARTIAL**（护栏当期读法＝**16 绿 / 1 红**，唯一红项仍是 \`verify:api-coverage\` ＝ 待批 **#18**），开口清单**未缩短**：#9 / #12 / #13 / #14 / #15 / #16 / #17 / #18 / #21 + F-85 + F-132 修法选择 + 「V1.1 链是否绑当期交付物」这条本轮新暴露的 owner 决策 + 三个 emscripten 资产缺口（D3/R8、D10、spine）。
`;

const ins = '\n' + SEC;
const after = t + ins;
const toInsert = [ins];
if (toInsert.length !== EXPECTED_PLAN_COUNT) throw new Error(`ASSERT 计划条数：${toInsert.length} != ${EXPECTED_PLAN_COUNT}`);
if (Buffer.byteLength(after, 'utf8') !== before.length + Buffer.byteLength(ins, 'utf8')) {
    throw new Error(`ASSERT 字节账（UTF-8）：${Buffer.byteLength(after, 'utf8')} != ${before.length} + ${Buffer.byteLength(ins, 'utf8')}`);
}
if (!after.startsWith(t)) throw new Error('ASSERT 纯追加：原文不是结果的前缀');
if (after.slice(0, t.length) !== t) throw new Error('ASSERT 纯追加：前缀逐字不等');

fs.writeFileSync(FILE, Buffer.from(after, 'utf8'));
const disk = fs.readFileSync(FILE);
if (disk.length !== Buffer.byteLength(after, 'utf8') || sha16(disk) !== sha16(Buffer.from(after, 'utf8'))) throw new Error('ASSERT 落盘回读不一致');
console.log(JSON.stringify({
    before: { bytes: before.length, sha16: sha16(before), lines: t.split('\n').length },
    after: { bytes: disk.length, sha16: sha16(disk), lines: disk.toString('utf8').split('\n').length },
    insertedBytes: Buffer.byteLength(ins, 'utf8'),
    planCount: toInsert.length,
}, null, 2));
