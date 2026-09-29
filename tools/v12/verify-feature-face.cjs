/**
 * V1.2「能力边界三个面」的只读门禁（r45g，计划书 F-3 簿记项「README 特性矩阵 / docs/01 feature 表」的判据落点）
 *
 *   npm run verify:v12-feature-face        （人读输出）
 *   node tools/v12/verify-feature-face.cjs --json [--out=<path>]
 *
 * 存在理由：README「能力边界」与 `docs/reference/web-features.md` §4/§5 各用一种口径描述「Air 有什么」，
 * 三者（**能力名** / **feature unit 声明名** / **默认构建集**）不是一回事，历史上已因此写出互相矛盾的陈述（F-129、F-130）。
 * 本门禁把三面的现读关系钉成五条不变量，任一侧漂移即红。上游快照路径可用 COCOS_UPSTREAM 覆盖；ROOT 可用 AIR_ROOT 覆盖（负向对照副本用）。
 *
 *   D1 声明面计数：Air 声明 unit 数 / 上游声明数 / 上游有而 Air 无 / airOnly / 默认 `AIR_FEATURES` 数 = 登记常量，
 *      且默认集里**不得**出现未声明名（`@cocos/ccbuild` 对未声明名是静默忽略，产物逐字节不变 ⇒ 只能靠断言防）。
 *      （同一对面 `verify:v12-backends` A4/A5 也查一遍 —— 故意两路独立实现，写错任一侧都会对不上。）
 *   D2 入口名与单元名对账：`src/exports/*.ts` 里「文件名不是已声明 unit」的集合 = 登记集合（增删都算发行面变化）。
 *   D3 聚合面：`src/exports/air.ts` 的静态 `export *` 目标全部有对应文件；且 D2 那批未声明入口里被 air 入口聚合的 = 登记集合
 *      （`gfx-webgpu` 必须**不**在 —— 它未声明、未聚合、未进默认产物）。
 *   D4 产物组成锁（仅当 `build/cocosair.module.js` 在盘；否则记 `skipped` 不判红）：
 *      默认集带来的能力符号整词命中 ≥1，非默认后端的世界类整词命中 == 0。
 *      ⇒ 把「默认 feature 集」与「发布 bundle 实际内容」钉在一起：改默认集而忘重采 = 红；后端悄悄进默认 bundle = 红。
 *   D5 能力名白名单对账：README/§7 用来描述「发行产物含某能力」的那批能力名，逐个必须满足
 *      「在默认集」**或**「其符号在默认产物里命中 ≥1」⇒ 不许再出现「文档写 No、产物里有」（F-129 同类）的陈述。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.env.AIR_ROOT || path.resolve(__dirname, '..', '..'));
const UPSTREAM = path.resolve(process.env.COCOS_UPSTREAM || 'E:/AIProMax/github/cocos4');

const EXPECT = {
    declared: { air: 33, upstream: 55, missing: 23, airOnly: ['air'], defaultAirFeatures: 26 }, // WebGL 2-only: gfx-webgl retired by owner.
    undeclaredExportNames: [
        'geometry-renderer', 'gfx-webgl', 'gfx-webgpu', 'graphics', 'intersection-2d', 'mask',
        'physics-framework', 'sorting', 'sorting-2d', 'spine',
    ],
    aggregatedByAirEntry: [
        'geometry-renderer', 'graphics', 'intersection-2d', 'mask',
        'physics-framework', 'sorting', 'sorting-2d', 'spine',
    ],
    notAggregatedByAirEntry: ['gfx-webgl', 'gfx-webgpu'],
    bundleSymbolsPresent: [
        'PhysicsSystem', 'PhysicsSystem2D', 'b2PhysicsWorld', 'WebGL2Device', 'AudioSource',
        'TiledMap', 'Graphics', 'Mask', 'Sorting2D', 'GeometryRenderer', 'UIRenderer',
    ],
    bundleSymbolsAbsent: ['BuiltinPhysicsWorld', 'B2PhysicsWorld', 'WebGLDevice'],
    // D5：README「能力边界」括号里出现过的能力名 → 允许的归属（default | declaredOnly | symbol）
    capabilityNames: {
        '2d': ['default'], ui: ['default'], 'tiled-map': ['default'], 'particle-2d': ['default'],
        video: ['default'], webview: ['default'], profiler: ['default'], 'custom-pipeline': ['default'],
        'physics-builtin': ['default'], 'physics-2d-box2d': ['default'], 'physics-2d-framework': ['default'],
        'dragon-bones': ['default'], 'spine-3.8': ['default'], 'spine-4.2': ['default'],
        'custom-pipeline-post-process': ['default'],
        audio: ['symbol'], 'physics-2d-builtin': ['declared'],
        mask: ['symbol'], graphics: ['symbol'], sorting: ['symbol'], 'intersection-2d': ['symbol'],
        'geometry-renderer': ['symbol'], spine: ['symbol'], 'physics-framework': ['symbol'],
    },
    capabilitySymbols: {
        audio: 'AudioSource', mask: 'Mask', graphics: 'Graphics', sorting: 'Sorting2D',
        'intersection-2d': 'intersects', 'geometry-renderer': 'GeometryRenderer',
        spine: 'sp.Skeleton', 'physics-framework': 'PhysicsSystem',
    },
};

const errors = [];
const fail = (m) => errors.push(m);
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const airFeatures = readJson(path.join(ROOT, 'src/cc.config.json')).features;
const upFeatures = readJson(path.join(UPSTREAM, 'cc.config.json')).features;
const airNames = Object.keys(airFeatures);
const upNames = Object.keys(upFeatures);
const buildSrc = fs.readFileSync(path.join(ROOT, 'tools/build/build.cjs'), 'utf8');
const defaultSet = buildSrc.match(/const AIR_FEATURES = \[([\s\S]*?)\];/)[1]
    .split('\n').map((l) => (l.match(/'([^']+)'/g) || [])).flat().map((s) => s.replace(/'/g, ''));

// --- D1 ---
const missing = upNames.filter((n) => !airNames.includes(n));
const airOnly = airNames.filter((n) => !upNames.includes(n));
if (airNames.length !== EXPECT.declared.air) fail(`D1 Air 声明 unit 数漂移：实测 ${airNames.length}，登记 ${EXPECT.declared.air}`);
if (upNames.length !== EXPECT.declared.upstream) fail(`D1 上游声明 unit 数漂移：实测 ${upNames.length}，登记 ${EXPECT.declared.upstream}`);
if (missing.length !== EXPECT.declared.missing) fail(`D1 上游有而 Air 无 数漂移：实测 ${missing.length}，登记 ${EXPECT.declared.missing}`);
if (JSON.stringify(airOnly) !== JSON.stringify(EXPECT.declared.airOnly)) fail(`D1 airOnly 漂移：实测 ${JSON.stringify(airOnly)}`);
if (defaultSet.length !== EXPECT.declared.defaultAirFeatures) fail(`D1 默认 AIR_FEATURES 数漂移：实测 ${defaultSet.length}，登记 ${EXPECT.declared.defaultAirFeatures}`);
const undeclaredDefault = defaultSet.filter((n) => !airNames.includes(n));
if (undeclaredDefault.length) fail(`D1 默认集出现未声明 feature（ccbuild 会静默忽略 ⇒ 产物与登记不符）：${undeclaredDefault.join(', ')}`);

// --- D2 ---
const exportNames = fs.readdirSync(path.join(ROOT, 'src/exports')).filter((f) => f.endsWith('.ts'))
    .map((f) => f.replace(/\.ts$/, '')).sort();
const undeclaredExports = exportNames.filter((n) => n !== 'air' && !airNames.includes(n)).sort();
if (JSON.stringify(undeclaredExports) !== JSON.stringify([...EXPECT.undeclaredExportNames].sort())) {
    fail(`D2 「入口文件名不是已声明 unit」集合漂移：实测 ${JSON.stringify(undeclaredExports)}，登记 ${JSON.stringify(EXPECT.undeclaredExportNames)}`);
}

// --- D3 ---
const airEntry = fs.readFileSync(path.join(ROOT, 'src/exports/air.ts'), 'utf8');
const reExported = [...airEntry.matchAll(/export \* from '\.\/([^']+)'/g)].map((m) => m[1]).sort();
const absentTargets = reExported.filter((n) => !fs.existsSync(path.join(ROOT, `src/exports/${n}.ts`)));
if (absentTargets.length) fail(`D3 air 入口再导出指向不存在的入口文件：${absentTargets.join(', ')}`);
const aggUndeclared = undeclaredExports.filter((n) => reExported.includes(n)).sort();
if (JSON.stringify(aggUndeclared) !== JSON.stringify([...EXPECT.aggregatedByAirEntry].sort())) {
    fail(`D3 未声明却被 air 入口聚合的集合漂移：实测 ${JSON.stringify(aggUndeclared)}，登记 ${JSON.stringify(EXPECT.aggregatedByAirEntry)}`);
}
for (const n of EXPECT.notAggregatedByAirEntry) {
    if (reExported.includes(n)) fail(`D3 ${n} 不得被 air 入口聚合（未声明 + 默认产物不含其能力 ⇒ 会变成「文档不含、产物含」的偏差，同 F-129 同类）`);
}

// --- D4 / D5 需要默认 bundle ---
const bundlePath = path.join(ROOT, 'build/cocosair.module.js');
let bundleStatus = 'skipped';
const wordCount = (hay, needle) => {
    let c = 0;
    let i = hay.indexOf(needle);
    while (i !== -1) {
        const before = i === 0 ? '' : hay[i - 1];
        const end = i + needle.length;
        const after = end >= hay.length ? '' : hay[end];
        if (!/[A-Za-z0-9_$]/.test(before) && !/[A-Za-z0-9_$]/.test(after)) c++;
        i = hay.indexOf(needle, end);
    }
    return c;
};
if (fs.existsSync(bundlePath)) {
    bundleStatus = 'checked';
    const bundle = fs.readFileSync(bundlePath, 'utf8');
    for (const s of EXPECT.bundleSymbolsPresent) {
        if (wordCount(bundle, s) < 1) fail(`D4 默认集能力符号未出现在默认产物：${s}（默认 feature 集与 bundle 组成脱钩 ⇒ 需重构建或改登记）`);
    }
    for (const s of EXPECT.bundleSymbolsAbsent) {
        const c = wordCount(bundle, s);
        if (c !== 0) fail(`D4 非默认后端类出现在默认产物：${s} 命中 ${c}（后端被悄悄带进默认 bundle ⇒ 与决策 D-3/G-1「一个图只装一个后端」冲突）`);
    }
    for (const [name, allowed] of Object.entries(EXPECT.capabilityNames)) {
        const isDefault = defaultSet.includes(name);
        const isDeclared = airNames.includes(name);
        const sym = EXPECT.capabilitySymbols[name];
        const hasSymbol = sym ? wordCount(bundle, sym) > 0 : false;
        const ok =
            (allowed.includes('default') && isDefault) ||
            (allowed.includes('declared') && isDeclared && !isDefault) ||
            (allowed.includes('symbol') && hasSymbol);
        if (!ok) {
            fail(`D5 能力名陈述失去依据：${name}（default:${isDefault} declared:${isDeclared} symbol:${sym || '-'}=${hasSymbol}）⇒ 文档口径需现读修正，勿反向放宽断言`);
        }
    }
}

const out = {
    ok: errors.length === 0,
    root: ROOT,
    upstream: UPSTREAM,
    declared: { air: airNames.length, upstream: upNames.length, missing: missing.length, airOnly },
    defaultAirFeatures: defaultSet.length,
    undeclaredExportNames: undeclaredExports,
    aggregatedByAirEntry: aggUndeclared,
    airEntryReExports: reExported.length,
    bundle: { path: 'build/cocosair.module.js', status: bundleStatus },
    errorCount: errors.length,
    errors,
};
if (process.argv.includes('--out')) {
    const target = process.argv[process.argv.indexOf('--out') + 1];
    if (target) fs.writeFileSync(path.resolve(target), JSON.stringify(out, null, 1) + '\n');
}
console.log(JSON.stringify(out, null, process.argv.includes('--json') ? 1 : 0));
process.exit(errors.length ? 1 : 0);
