/**
 * V1.2 簿记完整性门禁（计划书 §11 F-3 / LV12-21）
 *
 *   node tools/verify/verify-file-map.cjs
 *
 * 核验 docs/upstream-file-map.json 与 docs/extraction-manifest.json 是否与磁盘事实一致：
 *   1) 每条 map 行的 airPath 必须存在；
 *   2) upstreamPath=null 的行必须 modified:true 且 reason 非空（Air 原创 / 上游产物）；
 *   3) upstreamPath 非空的行必须能在上游解析到文件（cocos4 / @cocos/engine-pal dist / 仓库根 npm 包）：
 *        字节一致 -> modified 必须为 false；字节不同 -> modified 必须为 true 且 reason 非空；
 *   4) src/cocos/**、src/exports/**、src/pal/**、src/node_modules/** 下每个文件都要有 map 行；
 *      上游同名抽取件（upstreamPath == airPath 去 src/ 前缀）还须有 manifest 条目
 *      （Air 新增/顶替文件豁免，如 air-spine-instantiate-js.ts）；
 *   5) meta.modifiedCount 与实际 modified 行数一致；
 *   6) manifest 条目的 destination 必须存在且与 source 同路径（src/ 前缀）；
 *   7) `cc.config.json` 的 `moduleOverrides[].overrides` 替换对：Air 不得丢掉任何官方对；
 *      Air 自有对必须在 file-map 里登记为偏差（modified:true + reason）；
 *      两侧都在的替换件必须逐字节一致（jsb / vendor / pal 非 web 实现等单侧缺失只计数不判红）。
 *      —— 上游的 `-empty` 替换是**显式路径对**、无按名自动替换（r43 实测，F-118），故这些替换件属于护栏 ② 覆盖面。
 *
 * 退出码非 0 = 簿记不可信（不得进入验收）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const UPSTREAM = path.resolve(process.env.COCOS_UPSTREAM || 'E:/AIProMax/github/cocos4');
const PAL_DIST = path.join(ROOT, 'node_modules', '@cocos', 'engine-pal', 'dist');
const MAP_PATH = path.join(ROOT, 'docs', 'upstream-file-map.json');
const MAN_PATH = path.join(ROOT, 'docs', 'extraction-manifest.json');

const errors = [];
const fail = (msg) => errors.push(msg);

function walk(dir, base, out) {
    out = out || [];
    if (!fs.existsSync(dir)) return out;
    for (const name of fs.readdirSync(dir)) {
        if (name === '__dts_before_bundle' || name === 'node_modules') continue;
        const abs = path.join(dir, name);
        if (fs.statSync(abs).isDirectory()) walk(abs, base, out);
        else out.push(path.relative(base, abs).split(path.sep).join('/'));
    }
    return out;
}

function upstreamOf(row) {
    const u = row.upstreamPath;
    if (!u) return null;
    if (u.startsWith('public-pal/')) return path.join(ROOT, 'vendor/pal-source', u.slice('public-pal/'.length));
    if (u.startsWith('pal/')) return path.join(PAL_DIST, u.slice(4));
    // npm 行：形如 "@cocos/box2d@1.0.2/build/box2d/box2d.umd.js" → 仓库根已安装包内路径
    const npm = u.match(/^(@cocos\/[^/]+)@[^/]+\/(.+)$/);
    if (npm) return path.join(ROOT, 'node_modules', npm[1], npm[2]);
    if (u.startsWith('@cocos/')) return path.join(ROOT, 'node_modules', u);
    return path.join(UPSTREAM, u);
}

const sameBytes = (a, b) => fs.readFileSync(a).equals(fs.readFileSync(b));

if (!fs.existsSync(path.join(UPSTREAM, 'cc.config.json'))) {
    console.error(`[file-map] upstream not usable: ${UPSTREAM}（可用 COCOS_UPSTREAM 覆盖）`);
    process.exit(2);
}

const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
const man = JSON.parse(fs.readFileSync(MAN_PATH, 'utf8'));
const rows = map.mapping || [];
const dupCheck = new Set();

for (const row of rows) {
    if (dupCheck.has(row.airPath)) fail(`重复行: ${row.airPath}`);
    dupCheck.add(row.airPath);
    const air = path.join(ROOT, row.airPath);
    if (!fs.existsSync(air)) {
        fail(`AIR 文件不存在: ${row.airPath}`);
        continue;
    }
    const reason = (row.reason || '').trim();
    if (!row.upstreamPath) {
        if (!row.modified) fail(`upstreamPath=null 的行必须 modified:true: ${row.airPath}`);
        if (!reason) fail(`Air 原创行缺 reason: ${row.airPath}`);
        continue;
    }
    const up = upstreamOf(row);
    if (!up || !fs.existsSync(up) || !fs.statSync(up).isFile()) {
        fail(`上游文件解析不到: ${row.airPath} <- ${row.upstreamPath}`);
        continue;
    }
    const identical = sameBytes(air, up);
    if (identical && row.modified) {
        // 允许：Air 修改后又被回归为上游原文（应撤销标记），视为簿记陈旧
        fail(`标 modified 但与上游逐字节一致（标记已陈旧，请撤销）: ${row.airPath}`);
    }
    if (!identical && !row.modified) fail(`与上游不同却未标 modified: ${row.airPath}`);
    if (!identical && row.modified && !reason) fail(`modified 行缺 reason: ${row.airPath}`);
}

const actualModified = rows.filter((r) => r.modified).length;
if (map.meta.modifiedCount !== actualModified) {
    fail(`meta.modifiedCount=${map.meta.modifiedCount} 与实际 ${actualModified} 不符`);
}

// 两份持久登记必须使用同一基线；依赖图由 verify:web-only 现场重新分析，不再读取旧快照。
if ((man.meta || {}).baseline !== map.meta.baseline) {
    fail(`extraction-manifest meta.baseline 与 file-map 不一致: ${(man.meta || {}).baseline}`);
}

const manSources = new Set(man.entries.map((e) => e.source));
const byAir = new Map(rows.map((r) => [r.airPath, r]));
let covered = 0;
for (const scope of ['cocos', 'exports', 'pal']) {
    for (const rel of walk(path.join(ROOT, 'src', scope), path.join(ROOT, 'src'))) {
        const air = `src/${rel}`;
        const row = byAir.get(air);
        if (!row) fail(`缺 map 行: ${air}`);
        // manifest 只登记「上游同名抽取件」；Air 新增/顶替文件（upstreamPath 与自身路径不同或为 null）豁免
        else if (row.upstreamPath === rel && manSources.has(rel) === false) fail(`缺 manifest 条目: ${rel}`);
        covered++;
    }
}
// vendored 运行库清点：src/node_modules 下每个实际文件都要在 map 内有行
for (const rel of walk(path.join(ROOT, 'src', 'node_modules'), path.join(ROOT, 'src'))) {
    const air = `src/${rel}`;
    if (!byAir.has(air)) fail(`vendored 文件缺 map 行: ${air}`);
    covered++;
}

for (const e of man.entries) {
    if (e.destination !== `src/${e.source}`)
        fail(`manifest destination 与 source 不一致: ${e.source} -> ${e.destination}`);
    if (!fs.existsSync(path.join(ROOT, e.destination))) fail(`manifest destination 不存在: ${e.destination}`);
}

/*
 * 7) moduleOverrides 替换对清点（r43，护栏 ② 覆盖面扩展；F-118）
 *    官方构建的模块替换**只由 cc.config.json 的显式路径对驱动**（无按名自动替换），
 *    所以「Air 与官方逐字节」必须覆盖到这些替换件——它们参与真实构建，不是可选文件。
 */
const pairKey = (p) => `${p.key}=>${p.value}`;
function overridePairs(cfgPath) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const out = [];
    for (const block of cfg.moduleOverrides || []) {
        for (const [key, value] of Object.entries(block.overrides || {})) out.push({ key, value, test: block.test });
    }
    return out;
}
// 虚拟模块与模板路径不可按文件比对；pal/* 走上游 npm 产物解析（与 upstreamOf 同口径）
function resolveSide(rel) {
    if (rel.startsWith('internal:') || rel.includes('{{')) return null;
    if (rel.startsWith('pal/')) {
        const row = byAir.get(`src/${rel}`);
        return { air: path.join(ROOT, 'src', rel), up: row ? upstreamOf(row) : path.join(ROOT, 'vendor/pal-source', rel.replace(/\.js$/, '.ts')) };
    }
    return { air: path.join(ROOT, 'src', rel), up: path.join(UPSTREAM, rel) };
}

const AIR_CFG = path.join(ROOT, 'src', 'cc.config.json');
let ovSummary = 'moduleOverrides: skipped (no Air cc.config.json)';
if (!fs.existsSync(AIR_CFG)) {
    fail('Air 侧 cc.config.json 缺失: src/cc.config.json');
} else {
    const upPairs = overridePairs(path.join(UPSTREAM, 'cc.config.json'));
    const airPairs = overridePairs(AIR_CFG);
    const airKeys = new Set(airPairs.map(pairKey));
    const upKeys = new Set(upPairs.map(pairKey));
    for (const p of upPairs) {
        if (!airKeys.has(pairKey(p))) fail(`Air 丢了官方替换对: ${pairKey(p)} [test: ${p.test}]`);
    }
    let airOnly = 0;
    for (const p of airPairs) {
        if (upKeys.has(pairKey(p))) continue;
        const row = byAir.get(`src/${p.value}`);
        if (!row || !row.modified || !(row.reason || '').trim()) {
            fail(`Air 自有替换对未登记为偏差: ${pairKey(p)}（需 upstream-file-map 行 modified:true + reason）`);
        } else airOnly++;
    }
    const byteChecked = new Set();
    const skipped = { platform: [], missingBoth: [] };
    for (const p of airPairs) {
        if (!upKeys.has(pairKey(p))) continue; // Air 自有替换对：value 是 Air 原创件，已在上一条断言里要求登记为偏差
        for (const rel of [p.key, p.value]) {
            const s = resolveSide(rel);
            if (!s || byteChecked.has(rel)) continue;
            byteChecked.add(rel);
            const airOk = fs.existsSync(s.air) && fs.statSync(s.air).isFile();
            const upOk = fs.existsSync(s.up) && fs.statSync(s.up).isFile();
            if (airOk && upOk) {
                if (!sameBytes(s.air, s.up)) {
                    const row = byAir.get(`src/${rel}`);
                    if (!row || !row.modified || !(row.reason || '').trim()) {
                        fail(`替换对文件与上游不同却未标 modified: ${rel}（${pairKey(p)}）`);
                    }
                }
            } else if (!airOk && !upOk) {
                skipped.missingBoth.push(rel); // 两侧都无：官方该条件分支在本快照里本就悬空
            } else if (!airOk) {
                // Air 无、上游有 = 发行姿态排除（jsb / vendor / pal 非 web 实现 / 整个未纳入目录）
                skipped.platform.push(rel);
            } else {
                fail(`替换对引用了「Air 有、上游 npm 产物无」的文件: ${rel}（${pairKey(p)}）`);
            }
        }
    }
    ovSummary =
        `moduleOverrides pairs upstream=${upPairs.length} air=${airPairs.length} airOnlyRegistered=${airOnly} ` +
        `byteChecked=${byteChecked.size - skipped.platform.length - skipped.missingBoth.length} ` +
        `excludedOneSide=${skipped.platform.length} missingBoth=${skipped.missingBoth.length}`;
}

console.log(
    `[file-map] rows=${rows.length} modified=${actualModified} scanned(src/cocos|exports|pal)=${covered} ` +
        `manifest=${man.entries.length} upstream=${UPSTREAM}`,
);
console.log(`[file-map] ${ovSummary}`);
if (errors.length) {
    console.error(`[file-map] FAIL ${errors.length} 项：`);
    // moduleOverrides 类错误条数少且是新增断言，单独前置，避免被上千条 map 行错误挤出 60 行窗口
    const ov = errors.filter((e) => e.includes('替换对'));
    if (ov.length) {
        console.error('  [moduleOverrides]');
        ov.forEach((e) => console.error('    ' + e));
    }
    errors.slice(0, 60).forEach((e) => console.error('  ' + e));
    if (errors.length > 60) console.error(`  ...另有 ${errors.length - 60} 项`);
    process.exit(1);
}
const palFailures = require('../build/pal-source.cjs').check();
if (palFailures.length) {
    console.error(palFailures.join('\n'));
    process.exit(1);
}
console.log('[file-map] PASS');
