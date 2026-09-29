/**
 * Phase 1-3 — Web dependency graph 分析器。
 *
 * 用法: AIR_FEATURES=air,base,3d,... OUT_DIR=<目录> node tools/analyze/dep-graph.cjs
 *       （feature 集走 AIR_FEATURES 环境变量；必须与 tools/build/build.cjs 的 AIR_FEATURES 一致，
 *        否则会产生假阳性 UNREACHABLE——如缺 gfx-webgl 时会把整个 webgl 后端误标为不可达）
 *
 * 职责:
 *  1. 扫描 cocos/ pal/ exports/ extensions/ vendor/ predefine.ts 的全部 import/export 动态导入
 *  2. 应用 cc.config.json 中对 HTML5+BUILD 生效的 moduleOverrides（含 pal 平台虚拟模块）
 *  3. 从 Air feature 集对应的 exports/*.ts 入口计算可达闭包
 *  4. 文件分类: WEB_REQUIRED / COMMON_REQUIRED / TYPE_ONLY / NATIVE_ONLY / EDITOR_ONLY /
 *     MINIGAME_ONLY / PLATFORM_OTHER_ONLY / UNUSED_IN_AIR_V01
 *  5. 登记数据写 docs/；依赖图写 build/reports/。显式 OUT_DIR 将三份输出全部重定向。
 *
 * 分类判据是 Dependency Reachability，不是 grep "NATIVE"（计划书 §15）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------- feature set
// 分析 feature 集：默认 'air'（仅 DX 分析）；裁剪判定必须用与 build.cjs 相同的完整 feature 集
const AIR_FEATURES = process.env.AIR_FEATURES
    ? process.env.AIR_FEATURES.split(',')
    : ['air'];

const AIR_CONFIG = path.join(ROOT, 'src', 'cc.config.json');
const CONFIG_PATH = fs.existsSync(AIR_CONFIG) ? AIR_CONFIG : path.join(ROOT, 'cc.config.json');
const CFG = require(CONFIG_PATH);

// ---------------------------------------------------------------- overrides
// cc.config.json moduleOverrides 中对 Air(HTML5+BUILD) 生效的规则，
// 与 StatsQuery.evaluateModuleOverrides 相同的 test 表达式语义，此处手工求值:
//   mode=BUILD, platform=HTML5 => HTML5=true, NATIVE=false, MARIONETTE=false,
//   PROCEDURAL_ANIMATION=false, USE_VENDOR_GOOGLE=false, SPINE_* 不涉及
function activeOverrides () {
    const rules = [];
    for (const rule of CFG.moduleOverrides) {
        const t = rule.test;
        let active = false;
        if (t === 'true') active = true;
        else if (t === "context.mode === 'BUILD'") active = true;
        else if (t === '!context.buildTimeConstants.NATIVE') active = true;
        else if (t === '!context.buildTimeConstants.MARIONETTE') active = true;
        else if (t === '!context.buildTimeConstants.PROCEDURAL_ANIMATION') active = true;
        else if (t === 'context.buildTimeConstants && context.buildTimeConstants.HTML5') active = true;
        // NATIVE / MINIGAME / RUNTIME_BASED / NODEJS / SPINE / VENDOR / NOT_PACK_PHYSX: Air 全为 false
        if (active) rules.push(rule);
    }
    return rules;
}

const OVERRIDES = activeOverrides();
// virtual 源(pal/*): import specifier 直接命中 key；真实文件: 解析后命中 key
const VIRTUAL_MAP = new Map(); // 'pal/audio' -> 'pal/audio/web/player.js'
const FILE_SWAP = new Map(); // 'cocos/2d/renderer/native-2d.ts' -> '.../native-2d-empty.ts'
for (const rule of OVERRIDES) {
    if (rule.isVirtualModule) {
        for (const [k, v] of Object.entries(rule.overrides)) {
            if (!k.includes('{{')) VIRTUAL_MAP.set(k, v);
        }
    } else {
        for (const [k, v] of Object.entries(rule.overrides)) FILE_SWAP.set(norm(k), norm(v));
    }
}

function norm (p) { return p.replace(/\\/g, '/'); }

// ---------------------------------------------------------------- scan
// 分析基准目录：默认 Air 独立源码树 src/；ANALYZE_BASE=root 时回退上游树（用于补充提取）
const BASE = process.env.ANALYZE_BASE === 'root' ? '.'
    : (fs.existsSync(path.join(ROOT, 'src', 'cc.config.json')) ? 'src' : '.');
const SCAN_DIRS = ['cocos', 'pal', 'exports', 'extensions', 'vendor', 'external', 'air'];
const EXTS = ['.ts', '.js', '.mjs', '.cjs', '.json'];
const scannedFiles = new Set(); // repo-relative

function listFiles (dirRel) {
    const abs = path.join(ROOT, BASE, dirRel);
    if (!fs.existsSync(abs)) return [];
    const out = [];
    (function walk (d) {
        for (const name of fs.readdirSync(d)) {
            if (name === '.git' || name === 'node_modules') continue;
            const p = path.join(d, name);
            const st = fs.statSync(p);
            if (st.isDirectory()) walk(p);
            else if (EXTS.includes(path.extname(name))) out.push(norm(path.relative(path.join(ROOT, BASE), p)));
        }
    })(abs);
    return out;
}
for (const d of SCAN_DIRS) listFiles(d).forEach((f) => scannedFiles.add(f));
scannedFiles.add('predefine.ts');
scannedFiles.add('index.ts');

// ---------------------------------------------------------------- import extraction
const IMPORT_RES = [
    /\bimport\s+[^;'"]*?\bfrom\s+['"]([^'"]+)['"]/g,          // import ... from '...'
    /\bexport\s+[^;'"]*?\bfrom\s+['"]([^'"]+)['"]/g,          // export ... from '...'
    /\bimport\s+['"]([^'"]+)['"]/g,                            // side-effect import
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,                  // dynamic import
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,                 // require
    /\/\/\/\s*<reference\s+(?:types|path)="([^"]+)"/g,         // triple-slash
];

function extractSpecifiers (content) {
    const specs = [];
    const seen = new Set();
    for (const re of IMPORT_RES) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(content))) {
            const spec = m[1];
            if (spec && !seen.has(spec)) { seen.add(spec); specs.push(spec); }
        }
    }
    return specs;
}

// ---------------------------------------------------------------- resolution
function resolveRelative (fromFile, spec) {
    const baseAbs = path.resolve(ROOT, path.dirname(fromFile), spec);
    const base = norm(path.relative(ROOT, baseAbs));
    const cands = [base];
    for (const ext of EXTS) cands.push(base + ext);
    cands.push(base + '/index.ts', base + '/index.js', base + '.d.ts');
    for (const c of cands) {
        if (scannedFiles.has(c)) return c;
    }
    return null;
}

function resolveEnginePath (rest) { // '@cocos/engine/cocos/core' -> 'cocos/core(/index.ts)'
    const base = norm(rest).replace(/^\/+/, '');
    const cands = [base];
    for (const ext of EXTS) cands.push(base + ext);
    cands.push(base + '/index.ts', base + '/index.js');
    for (const c of cands) if (scannedFiles.has(c)) return c;
    return null;
}

const graph = new Map(); // file -> { deps: [], specDeps: [] }
const unresolved = []; // {from, spec}

function resolveSpec (fromFile, spec) {
    // 1. virtual pal modules (HTML5 override)
    if (VIRTUAL_MAP.has(spec)) return { target: VIRTUAL_MAP.get(spec), kind: 'override' };
    // 2. internal virtuals
    if (spec === 'internal:constants') return { target: 'virtual:internal-constants', kind: 'virtual' };
    if (spec === 'internal:native') return { target: VIRTUAL_MAP.get('internal:native') || 'cocos/native-binding/impl.ts', kind: 'override' };
    // 3. tsconfig paths
    if (spec === 'cc.decorator') return { target: resolveEnginePath('cocos/core/data/decorators/index.ts') || 'cocos/core/data/decorators/index.ts', kind: 'path' };
    if (spec.startsWith('@cocos/engine/')) {
        const r = resolveEnginePath(spec.slice('@cocos/engine/'.length));
        if (r) return { target: r, kind: 'path' };
        unresolved.push({ from: fromFile, spec }); return { target: null, kind: 'unresolved' };
    }
    // 4. external wasm / npm / url
    if (spec.startsWith('external:')) return { target: null, kind: 'external-wasm' };
    if (!spec.startsWith('.') && !spec.startsWith('/')) {
        // npm 包或 http
        if (/^https?:/.test(spec)) return { target: null, kind: 'url' };
        return { target: null, kind: 'npm', name: spec.split('/')[0].startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0] };
    }
    // 5. relative
    const r = resolveRelative(fromFile, spec);
    if (r) return { target: r, kind: 'relative' };
    // 6. 生成的 DebugInfos.json（build:debug-infos 产物）
    if (/^(\.\.\/)+DebugInfos$/.test(spec) || spec === 'DebugInfos') {
        return { target: 'DebugInfos.json', kind: 'generated' };
    }
    unresolved.push({ from: fromFile, spec });
    return { target: null, kind: 'unresolved' };
}

for (const file of [...scannedFiles]) {
    const abs = path.join(ROOT, BASE, file);
    if (!fs.existsSync(abs)) { scannedFiles.delete(file); continue; }
    const content = fs.readFileSync(abs, 'utf8');
    const deps = [];
    for (const spec of extractSpecifiers(content)) {
        const res = resolveSpec(file, spec);
        if (res.target) deps.push(res.target);
    }
    // apply real-file swap overrides: 若本文件被解析出的依赖命中 FILE_SWAP，则边指向 swap 目标
    graph.set(file, { deps: [...new Set(deps)], specDeps: extractSpecifiers(content) });
}

function effectiveTarget (file) {
    return FILE_SWAP.get(file) || file;
}

// ---------------------------------------------------------------- reachability
const entries = AIR_FEATURES
    .map((f) => {
        const feature = CFG.features[f];
        if (!feature) throw new Error(`Unknown feature: ${f}`);
        return feature.modules;
    })
    .flat()
    .map((m) => `exports/${m}.ts`);

const reachable = new Set(); // effective targets
const parents = new Map();
const queue = [...entries];
while (queue.length) {
    const cur = queue.shift();
    if (reachable.has(cur)) continue;
    reachable.add(cur);
    const node = graph.get(cur);
    if (!node) { continue; }
    for (const d of node.deps) {
        const eff = effectiveTarget(d);
        if (fs.existsSync(path.join(ROOT, BASE, eff)) || eff.startsWith('virtual:')) {
            if (!reachable.has(eff)) { parents.set(eff, cur); queue.push(eff); }
        } else {
            // swap 目标本身
            if (scannedFiles.has(eff)) { parents.set(eff, cur); queue.push(eff); }
        }
    }
}

// entry 本身是否被 swap（无此情况，防御）
for (const e of entries) {
    const eff = effectiveTarget(e);
    if (eff !== e && !reachable.has(eff)) queue.push(eff);
}

// ---------------------------------------------------------------- classification
// override 锚点：文件重定向 (k→v) 若任一端可达，则两端都必须物理存在于 src/，
// 否则 ccbuild 的 module-overrides 插件无法完成重定向解析。
const overrideAnchors = [];
for (const [k, v] of FILE_SWAP.entries()) {
    if (reachable.has(k) || reachable.has(v)) {
        overrideAnchors.push(k, v);
    }
}
for (const f of overrideAnchors) {
    if (scannedFiles.has(f)) reachable.add(f);
}

const CATEGORY = {
    WEB_REQUIRED: [],
    COMMON_REQUIRED: [],
    TYPE_ONLY: [],
    NATIVE_ONLY: [],
    EDITOR_ONLY: [],
    MINIGAME_ONLY: [],
    PLATFORM_OTHER_ONLY: [],
    UNUSED_IN_AIR_V01: [],
};

function classify (file) {
    if (reachable.has(file)) {
        if (file.startsWith('pal/') && /\/web\/|pacer-web|wasm-web|non-minigame/.test(file)) return 'WEB_REQUIRED';
        if (file.endsWith('.d.ts')) return 'TYPE_ONLY';
        return 'COMMON_REQUIRED';
    }
    if (file.endsWith('.jsb.ts')) return 'NATIVE_ONLY';
    if (file.startsWith('native/') || file.startsWith('editor/')) return file.startsWith('native/') ? 'NATIVE_ONLY' : 'EDITOR_ONLY';
    if (/pal\/(audio|system-info|screen-adapter|input|env)\/native\//.test(file)) return 'NATIVE_ONLY';
    if (/pal\/(audio|system-info|screen-adapter|input|env)\/minigame\//.test(file) || file.startsWith('pal/minigame/') || file === 'pal/pacer/pacer-minigame.js' || file === 'pal/wasm/wasm-minigame.js') return 'MINIGAME_ONLY';
    if (/pal\/(audio|system-info|screen-adapter|input|env)\/nodejs\//.test(file) || file === 'pal/pacer/pacer-nodejs.js' || file === 'pal/wasm/wasm-nodejs.js') return 'PLATFORM_OTHER_ONLY';
    return 'UNUSED_IN_AIR_V01';
}

for (const file of scannedFiles) {
    CATEGORY[classify(file)].push(file);
}

// virtual constants 节点
reachable.add('virtual:internal-constants');
// 生成产物节点（build:debug-infos 由 EngineErrorMap.md 生成）
if (reachable.has('DebugInfos.json')) {
    CATEGORY.GENERATED = ['DebugInfos.json', 'EngineErrorMap.md'];
}

// ---------------------------------------------------------------- output
const outDir = process.env.OUT_DIR
    ? path.resolve(process.env.OUT_DIR)
    : path.join(ROOT, 'docs');
fs.mkdirSync(outDir, { recursive: true });

const nodes = [];
for (const [file, { deps }] of graph) {
    const eff = effectiveTarget(file);
    const isReachable = reachable.has(file) || reachable.has(eff);
    nodes.push({
        path: file,
        type: isReachable ? 'REACHABLE' : 'UNREACHABLE',
        category: classify(file),
        overriddenTo: FILE_SWAP.has(file) ? FILE_SWAP.get(file) : undefined,
        dependencies: deps,
    });
}
// virtual + swap targets as nodes
for (const t of reachable) {
    if (t.startsWith('virtual:')) {
        nodes.push({ path: t, type: 'REACHABLE', category: 'COMMON_REQUIRED', dependencies: [], virtual: true });
    }
}

// 基线标签的权威来源是 docs/upstream-file-map.json 的 meta.baseline；读不到才回落到上游 package.json version。
function currentBaseline () {
    const mapPath = path.join(ROOT, 'docs', 'upstream-file-map.json');
    try {
        const m = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
        if (m.meta && m.meta.baseline) { return m.meta.baseline; }
    } catch (e) { /* 首次生成或文件缺失 */ }
    const upstream = path.resolve(process.env.COCOS_UPSTREAM || 'E:/AIProMax/github/cocos4');
    try {
        const v = JSON.parse(fs.readFileSync(path.join(upstream, 'package.json'), 'utf8')).version;
        return `cocos4 @ ${v}`;
    } catch (e) {
        return 'cocos4 @ unknown（COCOS_UPSTREAM 未指向可用上游）';
    }
}

const depGraph = {
    meta: {
        generatedAt: new Date().toISOString(),
        baseline: currentBaseline(),
        platform: 'HTML5',
        mode: 'BUILD',
        airFeatures: AIR_FEATURES,
        entries,
        activeOverrideTests: OVERRIDES.map((r) => r.test),
        counts: {
            scanned: scannedFiles.size,
            reachable: [...reachable].filter((t) => !t.startsWith('virtual:')).length,
            byCategory: Object.fromEntries(Object.entries(CATEGORY).map(([k, v]) => [k, v.length])),
        },
    },
    nodes: nodes.sort((a, b) => a.path.localeCompare(b.path)),
};
const graphOutDir = process.env.OUT_DIR ? outDir : path.join(ROOT, 'build', 'reports');
fs.mkdirSync(graphOutDir, { recursive: true });
fs.writeFileSync(path.join(graphOutDir, 'web-dependency-graph.json'), JSON.stringify(depGraph, null, 2));

// manifest: 提取集合 = COMMON_REQUIRED + WEB_REQUIRED + TYPE_ONLY + virtual 目标真实文件
const extractSet = [...CATEGORY.COMMON_REQUIRED, ...CATEGORY.WEB_REQUIRED, ...CATEGORY.TYPE_ONLY].sort();
const manifest = {
    meta: {
        generatedAt: depGraph.meta.generatedAt,
        baseline: depGraph.meta.baseline,
        sourceOfTruth: 'tools/analyze/dep-graph.cjs',
        note: 'destination = src/<source relative path>; engine root = src/',
    },
    entries: [
        ...extractSet.map((source) => ({
            source,
            destination: `src/${source}`,
            category: CATEGORY.COMMON_REQUIRED.includes(source) ? 'COMMON_REQUIRED'
                : CATEGORY.WEB_REQUIRED.includes(source) ? 'WEB_REQUIRED' : 'TYPE_ONLY',
        })),
    ],
};
fs.writeFileSync(path.join(outDir, 'extraction-manifest.json'), JSON.stringify(manifest, null, 2));

// 人工维护的 modified 标注是 License 审计的权威记录（Phase 19），
// 再生成时必须从既有文件继承，禁止静默抹除。
let priorModified = {};
const priorMapPath = path.join(outDir, 'upstream-file-map.json');
if (fs.existsSync(priorMapPath)) {
    try {
        const prior = JSON.parse(fs.readFileSync(priorMapPath, 'utf8'));
        for (const m of prior.mapping || []) {
            if (m.modified) priorModified[m.airPath] = { modified: true, reason: m.reason };
        }
    } catch (e) { console.warn('[dep-graph] 读取既有 upstream-file-map.json 失败，modified 标注将丢失:', e.message); }
}
const fileMap = {
    meta: {
        baseline: depGraph.meta.baseline,
        note: 'Air Path 与 Upstream Path 一致(前缀 src/)；modified 文件另行标注 reason',
        modifiedCount: Object.keys(priorModified).length,
    },
    mapping: extractSet.map((source) => ({
        airPath: `src/${source}`,
        upstreamPath: source,
        baseline: depGraph.meta.baseline,
        ...(priorModified[`src/${source}`] || { modified: false, reason: 'extraction copy' }),
    })),
};
// 既有 modified 条目若不在本次抽取集（如 module-override 锚点、override 替换文件），
// 追加保留——审计记录不允许因再生成而丢失。
const mapped = new Set(fileMap.mapping.map((m) => m.airPath));
for (const [airPath, ann] of Object.entries(priorModified)) {
    if (!mapped.has(airPath)) {
        fileMap.mapping.push({
            airPath,
            upstreamPath: airPath.replace(/^src\//, ''),
            baseline: depGraph.meta.baseline,
            ...ann,
            reason: ann.reason + '（注：非抽取映射文件，module-override/特殊锚点）',
        });
    }
}
fs.writeFileSync(priorMapPath, JSON.stringify(fileMap, null, 2));
console.log('upstream-file-map: modified annotations preserved =', Object.keys(priorModified).length);

// console report
console.log('=== Air V0.1 Web Dependency Analysis ===');
console.log('features:', AIR_FEATURES.join(', '));
console.log('entries:', entries.join(', '));
console.log('scanned files:', scannedFiles.size);
console.log('reachable (excl virtual):', [...reachable].filter((t) => !t.startsWith('virtual:')).length);
for (const [k, v] of Object.entries(CATEGORY)) console.log(`  ${k}: ${v.length}`);
console.log('unresolved imports:', unresolved.length);
unresolved.slice(0, 30).forEach((u) => console.log('  UNRESOLVED:', u.from, '->', u.spec));
const missingEntries = entries.filter((e) => !scannedFiles.has(e));
if (missingEntries.length) console.log('MISSING ENTRIES:', missingEntries);
