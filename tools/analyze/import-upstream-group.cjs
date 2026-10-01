/**
 * 上游分组导入与 feature 接线工具（保留既有抽取登记与校验合同）
 *
 *   node tools/analyze/import-upstream-group.cjs --group <id> --features <f1,f2> [--prefix <p1,p2>]
 *        [--exports <e1,e2>] [--air-export <name>] [--upstream <dir>] [--dry]
 *
 * ① 抽取登记：向 docs/extraction-manifest.json 追加缺失条目（文本插入，不重排全文件）
 * ② feature 注册：把上游 cc.config.json 的 feature 定义原样并入 src/cc.config.json
 * ③ 入口接线：按上游同名文件原样复制 src/exports/*.ts，并按需并入 src/exports/air.ts
 * ④ 校验：逐文件 cmp 上游，报告 byte-identical / DIFF / MISSING
 *
 * 安全约束：只处理本次 --prefix/--exports 指定的 source，绝不遍历全量 manifest
 * （裸跑 tools/analyze/extract-upstream.cjs 会以上游原文覆盖 src/ 下全部条目，抹掉已登记的 Air 修改）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
const arg = (name, def) => {
    const i = argv.indexOf(`--${name}`);
    return i > -1 && argv[i + 1] ? argv[i + 1] : def;
};
const list = (name) => (arg(name, '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const DRY = argv.includes('--dry');
const GROUP = arg('group', 'unnamed');
const UPSTREAM = path.resolve(arg('upstream', 'E:/AIProMax/github/cocos4'));
const prefixes = list('prefix');
    const exportFiles = list('exports').map((p) => {
        const rel = p.startsWith('exports/') ? p : `exports/${p}`;
        // 入口名可不带 .ts 后缀（与 cc.config feature unit 同名）
        return rel.endsWith('.ts') || fs.existsSync(path.join(UPSTREAM, rel)) ? rel : `${rel}.ts`;
    });
const featureNames = list('features');
const airExports = list('air-export');
const CATEGORY = `V12_REGRESSION_${GROUP.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`;
const BASELINE = 'cocos4 @ 4.0.0-alpha.34 (commit 557b06f7e636572a15a426eb8c2387f40b92798a)';

if (!fs.existsSync(path.join(UPSTREAM, 'cc.config.json'))) {
    console.error(`[regress] upstream not usable: ${UPSTREAM}`);
    process.exit(2);
}
const upstreamConfig = require(path.join(UPSTREAM, 'cc.config.json'));

// V1.2 A2：`pal/*` 的官方物理来源不是上游仓库树，而是 npm 包 @cocos/engine-pal
// （上游 package.json 依赖 ^1.0.4，postinstall 的 scripts/spread-pal.cjs 把
// dist/* 复制进 <engineRoot>/pal/*，且注释明确说明必须是「复制」而非软链）。
// Air 不跑 postinstall，故这里把已安装包的 dist 目录当作 pal 的上游根：
// 复制的仍是发布包原始字节，provenance 与 cocos4 树等同。
const PAL_DIST = path.join(ROOT, 'node_modules', '@cocos', 'engine-pal', 'dist');
const PAL_PKG = path.join(ROOT, 'node_modules', '@cocos', 'engine-pal', 'package.json');
const PAL_VERSION = fs.existsSync(PAL_PKG) ? JSON.parse(fs.readFileSync(PAL_PKG, 'utf8')).version : null;
const upstreamFileOf = (rel) => (rel.startsWith('pal/') ? path.join(PAL_DIST, rel.slice('pal/'.length)) : path.join(UPSTREAM, rel));
if (prefixes.some((p) => p === 'pal' || p.startsWith('pal/'))) {
    console.error('[regress] PAL is pinned to public MIT source. Use node tools/build/pal-source.cjs --write; do not import engine-pal npm bytes.');
    process.exit(2);
}

function walk (dir, base, out) {
    out = out || [];
    for (const name of fs.readdirSync(dir)) {
        const abs = path.join(dir, name);
        if (fs.statSync(abs).isDirectory()) walk(abs, base, out);
        else out.push(path.relative(base, abs).replace(/\\/g, '/'));
    }
    return out;
}

// --- 收集本组待抽取的上游文件 -------------------------------------------------
const targets = [];
for (const p of prefixes) {
    const abs = upstreamFileOf(p);
    if (!fs.existsSync(abs)) { console.error(`[regress] MISSING upstream source: ${p}`); continue; }
    if (fs.statSync(abs).isDirectory()) walk(abs, p.startsWith('pal/') ? PAL_DIST : UPSTREAM).forEach((rel) => targets.push(p.startsWith('pal/') ? `pal/${rel}` : rel));
    else targets.push(p);
}
for (const e of exportFiles) {
    if (!fs.existsSync(upstreamFileOf(e))) console.error(`[regress] MISSING upstream export: ${e}`);
    else targets.push(e);
}
const unique = [...new Set(targets)]
    // 计划书 §1.3 / 护栏 5：*.jsb.ts native 平台变体零进入
    .filter((rel) => {
        if (rel.endsWith('.jsb.ts')) { console.log(`[regress] skip jsb variant: ${rel}`); return false; }
        return true;
    })
    .sort();
console.log(`[regress] group=${GROUP} files=${unique.length} features=[${featureNames.join(',')}]`);

// --- ① manifest 追加（只追加尚不存在的条目） -----------------------------------
const manifestPath = path.join(ROOT, 'docs', 'extraction-manifest.json');
const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(manifestRaw);
const known = new Set(manifest.entries.map((e) => e.source));
const toAdd = unique.filter((rel) => !known.has(rel));
if (toAdd.length) {
    const rows = toAdd.map((rel) => '    {\n      "source": ' + JSON.stringify(rel)
        + ',\n      "destination": ' + JSON.stringify(`src/${rel}`)
        + `,\n      "category": "${CATEGORY}"\n    }`);
    const i = manifestRaw.lastIndexOf('\n  ]');
    const next = manifestRaw.slice(0, i) + ',\n' + rows.join(',\n') + manifestRaw.slice(i);
    if (!DRY) fs.writeFileSync(manifestPath, next);
    console.log(`[regress] manifest += ${toAdd.length} entries`);
}

// --- 落盘（等价 extract 的单条复制，逐条显式） ---------------------------------
let copied = 0;
for (const rel of unique) {
    const src = upstreamFileOf(rel);
    const dst = path.join(ROOT, 'src', rel);
    if (!fs.existsSync(src)) continue;
    if (DRY) { console.log(`  [dry] ${rel} -> src/${rel}`); copied++; continue; }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    copied++;
}

// --- ② feature 注册（上游定义原样并入；src/cc.config.json 已验证 JSON 往返稳定）---
if (featureNames.length) {
    const configPath = path.join(ROOT, 'src', 'cc.config.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    const cfg = JSON.parse(raw);
    const added = [];
    for (const f of featureNames) {
        if (!upstreamConfig.features[f]) { console.error(`[regress] UNKNOWN upstream feature: ${f}`); continue; }
        if (cfg.features[f]) continue;
        cfg.features[f] = upstreamConfig.features[f];
        added.push(f);
    }
    if (added.length && !DRY) {
        fs.writeFileSync(configPath, JSON.stringify(cfg, null, 4) + '\n');
        console.log(`[regress] cc.config features += ${added.join(',')}`);
    } else if (added.length) {
        console.log(`[dry] cc.config features += ${added.join(',')}`);
    }
}

// --- ③ air.ts 聚合并入 (D5) ---------------------------------------------------
if (airExports.length) {
    const airPath = path.join(ROOT, 'src', 'exports', 'air.ts');
    let t = fs.readFileSync(airPath, 'utf8');
    const add = airExports.filter((n) => !t.includes(`'./${n}'`));
    if (add.length) {
        const lines = add.map((n) => `export * from './${n}';`).join('\n');
        if (!DRY) fs.writeFileSync(airPath, t.replace(/(\n)(\nexport \* from '\.\.\/air';)/, `\n${lines}$1$2`));
        console.log(`[regress] air.ts += ${add.join(',')}`);
    }
}

// --- ④ 校验 -------------------------------------------------------------------
let identical = 0; const diff = []; const missing = [];
for (const rel of unique) {
    const a = path.join(ROOT, 'src', rel);
    const b = upstreamFileOf(rel);
    if (!fs.existsSync(a) || !fs.existsSync(b)) { missing.push(rel); continue; }
    if (fs.readFileSync(a).equals(fs.readFileSync(b))) identical++;
    else diff.push(rel);
}
console.log(`[regress] wrote ${copied}/${unique.length}; byte-identical ${identical}; DIFF ${diff.length}; MISSING ${missing.length}`);
diff.forEach((d) => console.log('  DIFF ' + d));
missing.forEach((d) => console.log('  MISSING ' + d));

// --- 登记条目（upstream-file-map） --------------------------------------------
if (!DRY) {
    const mapPath = path.join(ROOT, 'docs', 'upstream-file-map.json');
    const raw = fs.readFileSync(mapPath, 'utf8');
    const map = JSON.parse(raw);
    const have = new Set(map.mapping.map((e) => e.airPath));
    const baselineOf = (rel) => (rel.startsWith('pal/')
        ? `@cocos/engine-pal@${PAL_VERSION} (npm，上游 pin ^1.0.4；<engineRoot>/pal 由 postinstall spread-pal.cjs 复制 dist/*)`
        : BASELINE);
    const rows = unique.filter((rel) => !have.has(`src/${rel}`)).map((rel) => '    {\n      "airPath": '
        + JSON.stringify(`src/${rel}`) + ',\n      "upstreamPath": ' + JSON.stringify(rel)
        + ',\n      "baseline": ' + JSON.stringify(baselineOf(rel))
        + ',\n      "modified": false,\n      "reason": ' + JSON.stringify(`V1.2 批次 ${GROUP} 回归抽取，官方原文`)
        + '\n    }');
    if (rows.length) {
        const i = raw.lastIndexOf('\n  ]');
        fs.writeFileSync(mapPath, raw.slice(0, i) + ',\n' + rows.join(',\n') + raw.slice(i));
    }
    console.log(`[regress] upstream-file-map += ${rows.length}`);
}
