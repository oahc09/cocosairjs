/* 手册一致性检查：docs/manual/*.md 的代码块必须与 docs/manual/examples/manual-<slug>/ 的真实文件一致。
 *
 * 规则：
 *  FAIL — index.md 声明了 ▶ manual-<slug> 的篇目，其文章里找不到 main.ts / index.html 的**逐字节完整拷贝**
 *         （计划书的"代码块原样拷贝，不手打"纪律由此背书）
 *  FAIL — 示例目录存在但 index.md 没有对应条目
 *  TODO — 文章尚未写（进度，不算失败）；加 --strict 时 TODO 也会让退出码变 1（收尾全量门禁用）
 *  WARN — 文章中的 ts/js/html 片段不是示例文件的连续子串（教学片段可接受，但要人工确认不是臆造 API）
 *
 * 执行：node tools/verify/manual-doc-consistency.cjs [--strict]
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const MANUAL = path.join(REPO, 'docs', 'manual');
const EXAMPLES = path.join(MANUAL, 'examples');

const index = fs.readFileSync(path.join(MANUAL, 'index.md'), 'utf8');
// 引擎 d.ts 也是合法的片段出处（文章引用 API 声明时原样拷贝，不算臆造 API）
const DTS_PATH = path.join(REPO, 'build', 'cocosair.module.d.ts');
const DTS = fs.existsSync(DTS_PATH) ? fs.readFileSync(DTS_PATH, 'utf8') : null;
// Tips 组 5 个条目是 tips.md 的锚点行（./tips.md#...），归并到同一篇文章
const declared = new Map();
for (const m of index.matchAll(/\[([^\]]+)\]\(\.\/([a-z0-9-]+\.md)(#[^)]*)?\)[^|]*\|[^|]*\|\s*(▶\s*`(manual-[a-z0-9-]+)`|–)\s*\|/g)) {
    const doc = m[2];
    const prior = declared.get(doc);
    const example = m[5] ? m[5] : (prior ? prior.example : null);
    declared.set(doc, { title: prior ? prior.title : m[1], example, anchors: (prior ? prior.anchors : 0) + (m[3] ? 1 : 0) });
}

const fails = [];
const missing = [];
const warns = [];
let checked = 0;

for (const [doc, meta] of declared) {
    const docPath = path.join(MANUAL, doc);
    if (!fs.existsSync(docPath)) { missing.push(doc); continue; }
    if (!meta.example) { continue; }
    const dir = path.join(EXAMPLES, meta.example);
    if (!fs.existsSync(path.join(dir, 'index.html')) || !fs.existsSync(path.join(dir, 'main.ts'))) {
        fails.push(`${doc}: 声明示例 ${meta.example} 但目录缺 index.html/main.ts`);
        continue;
    }
    ++checked;
    const md = fs.readFileSync(docPath, 'utf8');
    const sources = ['main.ts', 'index.html'].map((f) => ({ f, code: fs.readFileSync(path.join(dir, f), 'utf8') }));
    for (const src of sources) {
        if (!md.includes(src.code)) {
            fails.push(`${doc}: 未找到 ${meta.example}/${src.f} 的逐字节完整拷贝`);
        }
    }
    const blocks = [...md.matchAll(/```(html|js|ts)\n([\s\S]*?)```/g)].map((m) => ({ lang: m[1], code: m[2] }));
    for (const b of blocks) {
        const t = b.code.replace(/\n+$/, '');
        if (sources.some((s) => s.code.includes(t)) || (DTS && DTS.includes(t))) { continue; }
        warns.push(`${doc}: ${b.lang} 片段不是示例文件的连续子串（前 60 字：${JSON.stringify(t.slice(0, 60))}）`);
    }
    // 反向：文章必须给出运行示例的相对链接
    if (!md.includes(`../examples/${meta.example}/`) && !md.includes(`examples/${meta.example}/`)) {
        warns.push(`${doc}: 未见指向 ../examples/${meta.example}/ 的链接`);
    }
}

// 示例目录里有没有孤儿（没有文章声明它）
const declaredEx = new Set([...declared.values()].map((v) => v.example).filter(Boolean));
if (fs.existsSync(EXAMPLES)) {
    for (const entry of fs.readdirSync(EXAMPLES, { withFileTypes: true })) {
        if (entry.isDirectory() && !declaredEx.has(entry.name)) {
            fails.push(`examples/${entry.name}: 存在示例目录但 index.md 未声明`);
        }
    }
}

console.log(`[manual-doc] index.md 条目 ${declared.size} 篇（Tips 锚点已归并），已写 ${declared.size - missing.length}，带示例并已核对 ${checked}`);
if (missing.length) { console.log(`  TODO 未写文章 ${missing.length}: ${missing.join(', ')}`); }
for (const w of warns) { console.log(`  WARN ${w}`); }
for (const f of fails) { console.log(`  FAIL ${f}`); }
const strict = process.argv.includes('--strict');
const blocked = fails.length > 0 || (strict && missing.length > 0);
console.log(`[manual-doc] ${blocked ? 'FAIL' : 'PASS'} (fail=${fails.length}, warn=${warns.length}, missing=${missing.length}${strict ? ', strict' : ''})`);
process.exit(blocked ? 1 : 0);
