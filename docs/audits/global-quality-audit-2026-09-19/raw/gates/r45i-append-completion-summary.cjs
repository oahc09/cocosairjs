'use strict';
// r45i: 追加 §27.11.12 到仓库外活文档 completion-summary.md（纯尾部追加，写前抛、判据三段全等）
const fs = require('fs');
const crypto = require('crypto');
const P = 'E:/AIProMax/cocosair-scratch/completion-summary.md';
const EXPECT_PRE = { bytes: 127523, sha16: 'df0e90a96cfcde39' };
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

const before = fs.readFileSync(P);
if (before.length !== EXPECT_PRE.bytes || sha16(before) !== EXPECT_PRE.sha16) {
    throw new Error(`前像锁不符：actual ${before.length} ${sha16(before)}，expected ${EXPECT_PRE.bytes} ${EXPECT_PRE.sha16}`);
}
const text = before.toString('utf8');
if (!text.endsWith('\n')) throw new Error('文件尾不以换行结束，追加会粘连上一段');
if (text.includes('27.11.12')) throw new Error('§27.11.12 已存在，拒绝重复追加');

const ADD = `
### 27.11.12  r45i（2026-09-23 04:05–04:39Z）：三引擎「逐字段对账」的完整配方 + 注入式覆盖必须自证生效

**背景**：LV12-01 的「example + 三浏览器 + 截图」格长期只有 chromium 单引擎覆盖 V1.1 规格链。r45f2 已把工具侧铺开能力做完（\`--browser/--out/--artifact-dir\`、共享引擎表、非 chromium 不给 \`--out=\` 就 EXIT=2），但没跑正式批次，因为「存量 12」在现仓库不对应任何现存集合 ⇒ 升为 owner 待批 #15。本轮取 **#15 选项 (a) 的字面含义**（Pilot-12 那 11 个可跑例）做**非正典**两腿捕获，只补齐对账能力，不改任何判定阈值、不翻任何格。

1. **命令（逐字可复跑）**：\`node tools/verify/v11-examples-verify.cjs --ids=camera,gltf-catalog,gltf-viewer,hello-cube,input,material-basic,skinned-animation,starter,static-model,transform,tween-basic --browser=firefox --out=docs/evidence/v12/pilot12-r45i/v11-pilot12-firefox.json --artifact-dir=docs/evidence/v12/pilot12-r45i/firefox\`（webkit 同形）。两腿 \`EXIT=0\`、各 11/11 PASS。护栏实效：runner 对非 chromium 未显式 \`--out=\` 拒绝启动，且写非当期证据路径一律打 \`[skip-promote]\` ⇒ \`examples/example.json\`、\`examples/files.json\`、正典 \`docs/evidence/v11-examples-verified.json\` **零回写**（本轮三处逐字节复核未变）。
2. **对账判据（\`raw/gates/r45i-cross-engine-reconcile.cjs\`，33 条）**：不要只比「总 PASS 数」。正解是**逐 record 逐字段**比 chromium 正典 / firefox / webkit：\`specFingerprint\`、\`sourceFingerprint\`、\`candidateFingerprint\`、\`instrumentation\`、\`apiProof[]\` 的三元组求和（verified/attested/unproven/other）、\`expectationGaps\`、\`specDimensions\`、\`validatorResults\`、\`nodeCount\`、\`errors\`，再加 \`artifact.bytes\` + \`artifact.hash\`。关键一点：截图**允许**跨引擎不等（camera 5141/2227/2047 B），所以判据分两堆——语义字段必须逐字相同，字节类字段只**在册回读**（对每个 PNG 现读磁盘字节 + sha256-16，与 JSON 里记的 \`artifact\` 对账），绝不断言跨引擎等值。
3. **「证据货币」的取法（沿用陷阱 37）**：每 record 的 \`candidateFingerprint\` 全部 = \`9fa85f88b968d5f1\`，与当期发布 bundle 一致 ⇒ 新捕获与 chromium 正典是**同一套货币**，跨引擎比较才有意义。产物三件套本轮逐字节未变（dev \`35496aebda066ab5\` / min \`8795c8685ace28a1\` / d.ts \`6d01c030d85bf86c\`）。注意这是「离线复算证据货币」，采集本身是本轮现做的，判定语写「当期」不写「复用」。
4. **陷阱 40（本轮新学，最贵的一条）**：注入式覆盖（env / \`--files=\` / 副本路径）**必须有一臂自证注入生效**。负控脚本 \`R45I_FILES\` 按**引擎名**写键（\`{firefox: ...}\`），判据脚本按**仓库相对路径**取键 ⇒ 7 条篡改臂**静默读回正典**，输出 \`EXIT=1\` 却 \`failCount 0\`、8 臂里 7 臂报 \`ok true\`。若不查就会把「篡改后仍判通过」当成负控成功。修法三条：① 键空间统一为仓库相对路径（引入 \`REL\` 映射）；② 判据自报实际打开了什么（\`fileLevel[*].readFrom\`）；③ **判据取「命中预期那一层」而非 \`EXIT != 0\`** —— 退出码非 0 可能来自完全无关的那一层。并且**阳性臂（未篡改副本，应仍 PASS）与篡改臂缺一不可**：阳性臂证「注入本身不改变结论」，篡改臂证「被注入的字段确实在判决路径上」。终局 8/8 命中。
5. **F-131 的孤儿捕获门禁第一次真的咬了作者**：新增 \`docs/evidence/v12/pilot12-r45i/\` 让 \`smoke-30\` 的证据目录对账**先变红**（\`Received [ "pilot12-r45i" ]\`），随后才在 \`ACCOUNTED\` 加「登记 + 理由」条目（理由指向该目录自带 README）。这是正确顺序：**先红后登记**，不是放松阈值。落地后该套件 38/38 PASS。
6. **共享树 \`npm test\` 现读 2 红，且**不是本轮的**：并行会话在 \`examples/mesh-sphere/example.json\` 留了未提交的负控注入（\`not-a-real-validator\` ×2、\`promotion.candidate\` 5612c4c2746f395b → 9fa85f88b968d5f1），使 F-132 的 spec-validate 红跑**在共享工作树上对所有会话成立** ⇒ 任何「jest 绿」的说法**必须现读**，引用上一轮数字即失真。按「红门禁先归因再认领」不擅动他人 in-flight NC。本轮**自己的面**（\`smoke-30\` 38/38、typecheck、chain-face、doc-refs）逐条现读为绿。
7. **成本口径的修正（改的是决策成本，不是范围）**：11 例 × 两腿实测 ≈7 min ⇒ **≈19 s/例/引擎**；r45f2 的 ≈63 s/例/引擎是「2 例摊不开一次性开销」的上限，不是稳态。据此 #15 选项 (b)（存量 52 例铺开）从「≈1.9 h」降为 **≈17–18 min**。已在 \`docs/v12-owner-decisions.md\` #15 行追加 \`UPDATE-r45i\`，并明确写「#15 依旧待批」。
8. **覆盖账的开口写法**：LV12-01 第三格现在可说「52 例中 **23** 例有三引擎证据」= 12（矩阵链）+ 11（本批次**非正典**两腿）+ 余 29 例仅 chromium。非正典证据**不等于**晋升，也**不翻绿**该格 —— 验收报告里两处措辞都显式带上「非正典」「本格不因此翻绿」。发布面账：\`verify:doc-refs\` EXIT=0（refsChecked 1084）、\`verify:consumer\` EXIT=1 且 \`failures\` 恰 1 条＝ F-85、tarball 10,356,166 B。
9. **可跑面缺口顺带看清（未开新 F）**：V1.1 规格链 runner 没有「失败请求」维度（\`[bench-404] /gltf-viewer/\` 两腿都出现但 record 仍 PASS），V1.2 矩阵 runner 有 \`failedRequests\`。加维度＝改判定面 ⇒ 归 #15/#21 待批面，只记观察不开号。另 \`gltf-catalog\` 的 \`apiProof\` 为空，正是 \`verify:api-coverage\`（owner #18）报的「evidence without apiProof: 1」同一行。
`;

const after = Buffer.from(text + ADD, 'utf8');
fs.writeFileSync(P, after);

const check = fs.readFileSync(P);
const s = check.toString('utf8');
// 陷阱 36 复发订正：字节账两侧必须同为字节。原判据拿 Buffer.length（字节）去比 text.length
// （UTF-16 code unit），中文文档下必不等 ⇒ 写盘已正确仍抛错（throw-after-write）。
const ok = s.startsWith(text)
    && check.length === before.length + Buffer.byteLength(ADD, 'utf8')
    && sha16(check.subarray(0, before.length)) === EXPECT_PRE.sha16;
console.log(JSON.stringify({
    ok,
    before: { bytes: before.length, sha16: EXPECT_PRE.sha16 },
    after: { bytes: check.length, sha16: sha16(check) },
    delta: check.length - before.length,
    expectedDelta: Buffer.byteLength(ADD, 'utf8'),
    stringLengthVsBytes: { textStringLen: text.length, textBytes: before.length },
    lines: s.split('\n').length,
}, null, 2));
if (!ok) throw new Error('纯追加不变量不成立');
