/**
 * V1.2 文档互引完整性门禁（LV12-21 簿记面；F-120 那类自伤的仓库侧兜底）
 *
 *   node tools/verify/verify-doc-refs.cjs [--json] [--out=<path>] [<相对路径>.md ...]
 *
 * 只读。不传文件参数时扫默认面：根 `README.md` + `docs/{gltf,guides,reference,manual,notes}/*.md` + `docs/*.md`。
 * 判据：文档里以 **反引号** 或 **`](…)`** 形式写出的仓库内路径必须真实存在。
 * 三类引用**只登记不判红**（写进报告 `skipped`，便于人工抽查而不是把门禁天然弄红）：
 *   S1 通配/brace/占位：含 `* ? { } < >`（如 `docs/evidence/v12/**`、`matrix-{chromium,firefox,webkit}.png`、`matrix-<engine>.png`）
 *   S2 外链与锚点：`http(s)://`、`#…`、`mailto:`
 *   S3 仓库外绝对路径：盘符 `X:/…`、`/…`、`~`（台账里指向 scratch/上游快照的路径属这类）。
 * 已按清理要求移除的 `docs/evidence/` 非保留组和 `docs/audits/` 历史材料单独登记，不作为当前证据通过。
 * 行号后缀（`docs/x.md:123`、`docs/x.md#L123`）会先剥掉再查存在性。
 * 反引号内**跨行**的片段不参与匹配（不做跨行拼接，避免把一句话里的两个 token 粘成假路径）。
 *
 * **棘轮基线**（`tools/verify/doc-refs-baseline.json`）：首次落地时仓库里已有数十条历史断链（V0.x 期证据路径、
 * 手册未移植的兄弟页链接、生成物路径、D9 待决项的「将来文件」），本期不扩范围去修它们，
 * 而是逐条登记 `doc` + `ref` + `class`，判据变成两条：
 *   R1 出现**基线外**的新断链 ⇒ 红（新写入的引用必须可解析）；
 *   R2 基线条目**不再命中**（链接已被修好或整篇文档已删） ⇒ 红，必须把该条从基线删掉（防基线本身腐烂）。
 *
 * 退出码非 0 = 有新断链或基线待清理（不得进入验收）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const EXTS = ['md', 'json', 'ts', 'js', 'cjs', 'mjs', 'wasm', 'png', 'jpg', 'log', 'txt', 'yaml', 'yml', 'html', 'tgz', 'mp4', 'wav', 'zip', 'd.ts'];
const ROOT_DIRS = ['docs', 'tools', 'src', 'examples', 'build', 'test', 'ai', 'manual', 'scripts'];

function defaultFiles () {
    const acc = [];
    for (const f of ['README.md']) if (fs.existsSync(path.join(ROOT, f))) acc.push(f);
    for (const d of ['docs', 'docs/gltf', 'docs/guides', 'docs/reference', 'docs/manual', 'docs/notes']) {
        const abs = path.join(ROOT, d);
        if (!fs.existsSync(abs)) continue;
        for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
            if (e.isFile() && e.name.endsWith('.md')) acc.push(`${d}/${e.name}`);
        }
    }
    return acc.sort();
}

const BACKTICK_RE = new RegExp('`((?:' + ROOT_DIRS.join('|') + ')/[^`\\n]*?\\.(?:' + EXTS.map((e) => e.replace('.', '\\.')).join('|') + '))`', 'g');
const LINK_RE = /\]\(([^)\s]+?)\)/g;
const isGlob = (r) => /[*?{}<>]|\*\*/.test(r);
const isExternal = (r) => /^https?:|^#|^mailto:/i.test(r);
const isOutOfRepo = (r) => /^[A-Za-z]:[\\/]|^[/~]/.test(r);

function refsFrom (txt) {
    const refs = new Set();
    for (const m of txt.matchAll(BACKTICK_RE)) refs.add(m[1]);
    for (const m of txt.matchAll(LINK_RE)) {
        const t = m[1];
        if (isExternal(t) || isOutOfRepo(t)) continue;
        refs.add(t);
    }
    return [...refs].sort();
}

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const targetList = files.length ? files : defaultFiles();
const BASELINE_ARG = process.argv.find((a) => a.startsWith('--baseline='));
const BASELINE_PATH = BASELINE_ARG ? path.resolve(BASELINE_ARG.slice(11)) : path.join(ROOT, 'tools', 'verify', 'doc-refs-baseline.json');
const baselineEntries = fs.existsSync(BASELINE_PATH) ? (JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')).entries || []) : [];
if (!fs.existsSync(BASELINE_PATH)) console.error(`[doc-refs] 找不到棘轮基线 ${BASELINE_PATH}（缺失时门禁视为全红，防止基线被顺手删掉）`);
const keyOf = (b) => `${b.doc} -> ${b.ref}`;
const baselineMap = new Map(baselineEntries.map((e) => [keyOf(e), e]));

const bad = [];
const exempted = [];
const hitKeys = new Set();
const skipped = { glob: [], external: [], outOfRepo: [], removedEvidence: [], removedAudit: [] };
const perDoc = {};

for (const rel of targetList) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) { bad.push({ doc: rel, ref: '(doc itself missing)', kind: 'missing-doc' }); continue; }
    const refs = refsFrom(fs.readFileSync(abs, 'utf8'));
    let resolved = 0;
    for (const r of refs) {
        if (isGlob(r)) { skipped.glob.push({ doc: rel, ref: r }); continue; }
        const bare = r.replace(/[#?].*$/, '').replace(/:\d+(-\d+)?$/, '');
        if (!bare) continue;
        if (isOutOfRepo(bare)) { skipped.outOfRepo.push({ doc: rel, ref: r }); continue; }
        const cand = [path.join(ROOT, bare), path.join(ROOT, path.posix.dirname(rel), bare)];
        if (cand.some((c) => fs.existsSync(c))) { resolved++; continue; }
        if (/^https?:/i.test(bare)) { skipped.external.push({ doc: rel, ref: r }); continue; }
        const evidenceRoot = path.join(ROOT, 'docs', 'evidence') + path.sep;
        const removedEvidence = cand.some((c) => {
            const full = path.resolve(c);
            if (!full.startsWith(evidenceRoot)) return false;
            const group = path.relative(evidenceRoot, full).split(path.sep)[0];
            return !['examples', 'manual', 'recipes'].includes(group);
        });
        if (removedEvidence) { skipped.removedEvidence.push({ doc: rel, ref: r }); continue; }
        const auditRoot = path.join(ROOT, 'docs', 'audits') + path.sep;
        if (cand.some((c) => path.resolve(c).startsWith(auditRoot))) {
            skipped.removedAudit.push({ doc: rel, ref: r });
            continue;
        }
        const item = { doc: rel, ref: r };
        if (baselineMap.has(keyOf(item))) { hitKeys.add(keyOf(item)); exempted.push(Object.assign({}, item, { class: baselineMap.get(keyOf(item)).class })); }
        else bad.push(item);
    }
    perDoc[rel] = { refs: refs.length, resolved };
}
// R2：基线里已经不再命中的条目必须删掉（否则修好的链接会以「历史欠账」名义永久挂在基线上）。
const staleBaseline = baselineEntries.filter((e) => !hitKeys.has(keyOf(e)));
const errors = [
    ...bad.map((b) => `R1 新断链（不在棘轮基线内）：${b.doc} -> ${b.ref}`),
    ...staleBaseline.map((e) => `R2 基线条目已不再命中，须从 tools/verify/doc-refs-baseline.json 删除：${e.doc} -> ${e.ref}`),
];

const report = {
    generatedAt: new Date().toISOString(),
    ok: errors.length === 0,
    docs: targetList.length,
    refsChecked: Object.values(perDoc).reduce((a, s) => a + s.resolved, 0),
    skippedCounts: { glob: skipped.glob.length, external: skipped.external.length, outOfRepo: skipped.outOfRepo.length, removedEvidence: skipped.removedEvidence.length, removedAudit: skipped.removedAudit.length },
    baselineEntries: baselineEntries.length,
    baselineHits: exempted.length,
    unresolved: bad,
    staleBaseline,
    errors,
    perDoc,
    exempted,
    skipped,
};

const outArg = process.argv.find((a) => a.startsWith('--out='));
if (outArg) fs.writeFileSync(path.resolve(outArg.slice(6)), `${JSON.stringify(report, null, 1)}\n`);
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 1));
else {
    console.log(JSON.stringify({
        ok: report.ok,
        docs: report.docs,
        refsChecked: report.refsChecked,
        skippedCounts: report.skippedCounts,
        baseline: { entries: report.baselineEntries, hits: report.baselineHits },
        unresolvedCount: bad.length,
        staleBaselineCount: staleBaseline.length,
    }));
    for (const e of errors.slice(0, 30)) console.error(`  ! ${e}`);
}
process.exit(errors.length ? 1 : 0);
