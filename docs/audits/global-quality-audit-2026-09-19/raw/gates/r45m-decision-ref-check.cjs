'use strict';
/**
 * r45m：发布面「待批编号引用完整性」现读判据（一次性诊断，非门禁）。
 *
 * 起因：F-136 —— 待批 **#21** 自 r45h4 起被发布面多处引用，但 `docs/v12-owner-decisions.md` §2 只有 #1–#18
 * 实体行 ⇒ 悬空编号。`verify:doc-refs` 只管**文件路径**引用，对决策编号结构性失明（同 #17 对仓库外绝对路径的失明）。
 *
 * 判据：在发布面语料里，凡 `#N` 且其上下文含「待批 / 批复 / owner 签 / §2 表」语义者，N 必须在 §2 表有实体行。
 * 故意保守：宁可漏报也不误报（误报会让门禁失去信用），所以只看带明确「待批/批复」字样的引用，
 * 且排除 `F-NNN`（台账发现号）与 `#334` 这类上游 issue 号（三位数即排除）。
 *
 * 负控：R45M_DECISIONS 指向一份**删掉 #21 行**的副本 ⇒ 必须翻红并报出 #21。
 */
const fs = require('fs');
const path = require('path');
const REPO = 'E:/AIProMax/github/cocosair.js/';
const DEC = process.env.R45M_DECISIONS || 'docs/v12-owner-decisions.md';

const DEC_ABS = path.isAbsolute(DEC) ? DEC : REPO + DEC;
const rows = new Set();
for (const line of fs.readFileSync(DEC_ABS, 'utf8').split('\n')) {
  const m = /^\|\s*(\d{1,2})\s*\|/.exec(line);
  if (m) rows.add(Number(m[1]));
}
if (rows.size < 5) throw new Error(`§2 表只解析出 ${rows.size} 行 ⇒ 解析式失效，判据不可信（反空转）`);

const files = []
  .concat(fs.readdirSync(REPO + 'docs').filter((f) => f.endsWith('.md')).map((f) => 'docs/' + f))
  .concat(fs.readdirSync(REPO + 'docs/evidence/v12')
    .filter((d) => fs.statSync(REPO + 'docs/evidence/v12/' + d).isDirectory())
    .map((d) => `docs/evidence/v12/${d}/README.md`)
    .filter((f) => fs.existsSync(REPO + f)));

const CTX = /(待批|批复|owner\s*(?:批|签|决定)|§2\s*表)/;
const hits = [];
for (const f of files) {
  const lines = fs.readFileSync(REPO + f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/#(\d{1,2})(?!\d)/g)) {
      const n = Number(m[1]);
      const around = line.slice(Math.max(0, m.index - 40), m.index + 40);
      if (!CTX.test(around)) continue;
      hits.push({ file: f, line: i + 1, n, cited: rows.has(n), snippet: around.replace(/\s+/g, ' ') });
    }
  });
}
const dangling = hits.filter((h) => !h.cited);
const perRow = {};
for (const h of hits) perRow[h.n] = (perRow[h.n] || 0) + 1;
const out = {
  ok: dangling.length === 0,
  decisionsFile: path.resolve(DEC_ABS),
  rowsParsed: [...rows].sort((a, b) => a - b),
  corpusFiles: files.length,
  citationsChecked: hits.length,
  citationsPerRow: perRow,
  rowsNeverCited: [...rows].filter((r) => !perRow[r]).sort((a, b) => a - b),
  dangling,
};
console.log(JSON.stringify(out, null, 1));
process.exit(dangling.length ? 1 : 0);
