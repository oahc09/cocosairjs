/**
 * WASM 物理后端源码闭包与能力边界的只读门禁。
 *
 *   node tools/verify/verify-wasm-backends.cjs [--json] [--out=<path>]
 *
 * 只读。把此前住在仓库外 scratch 的一次性判据（`wasm-backend-closure` / `closure-unresolved-detail` /
 * `feature-units` / `physx-count-recon` / `lv12-16-attribution`）固化成可复跑门禁，钉住七条不变量：
 *   A1 闭包已落盘：三后端 + 3 个 exports 门面的**静态 import 传递闭包**里，每个非 `*.jsb.ts` 文件都必须存在于 `src/`。
 *   A2 范围未漂移：seed 数 / 闭包总数 / 闭包内 jsb 变体集合 / 默认 AIR_FEATURES 数 = 登记常量。
 *   A3 漂移只有在册的 3 个：闭包内与上游字节不同的文件集合必须 ⊆ 已登记偏差集（新增漂移先登记再放行）。
 *   A4 资产引进口未变：`external:emscripten/**` 说明符集合仍是登记的 9 个，且**只**出现在 `import(...)` 动态分支
 *      （静态引进口会把快照内不存在的资产变成构建期硬依赖）。
 *   A5 feature unit 声明面对账：Air / 上游 features 计数、missing 与 airOnly 集合、三个 wasm 后端定义与上游逐字段相同，
 *      且它们**不在**默认 AIR_FEATURES（在 ⇒ 默认产物字节货币变动 ⇒ 须走批复 + 全量重采）。
 *   A6 豁免必要性 = 解禁触发器：上游 `tsconfig.json` 的 `types[]` 若能解析到 `native/external/emscripten/{bullet,physx,box2d}`，
 *      Deviation-05 的 exclude 必须撤销并复跑 `npm run typecheck`（对应 owner #14 候选 (b)）。
 *   A7 子树不得缩小：直接比较五条物理后端子树，只允许 EXPECT.jsbInClosure 登记的具体平台文件缺失。
 *      其他缺件一律失败，不依赖旧版比较报告或自动生成的差集为缺件放行。
 *
 * 退出码非 0 = 不变量被破坏（不得进入验收）。上游快照路径可用 COCOS_UPSTREAM 覆盖。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const UPSTREAM = path.resolve(process.env.COCOS_UPSTREAM || 'E:/AIProMax/github/cocos4');

// ---- 登记常量（改动必须同步 UPSTREAM.md Deviation-05、docs/reference/owner-decisions.md §1、F-123/F-124）----
const SEED_DIRS = ['cocos/physics/bullet', 'cocos/physics/physx', 'cocos/physics-2d/box2d-wasm'];
const SEED_FILES = ['exports/physics-ammo.ts', 'exports/physics-physx.ts', 'exports/physics-2d-box2d-wasm.ts'];
const EXPECT = {
    seeds: 83,
    closureTotal: 764,
    jsbInClosure: ['cocos/physics/physx/instantiate.jsb.ts'],
    driftedAllowed: [
        'cocos/core/platform/debug.ts',
        'cocos/core/utils/path.ts',
        'cocos/rendering/global-descriptor-set-manager.ts',
        'cocos/gfx/device-manager.ts', // Owner-approved WebGL 2-only startup policy.
    ],
    emscriptenSpecs: [
        'external:emscripten/box2d/box2d.release.asm.js',
        'external:emscripten/box2d/box2d.release.wasm.js',
        'external:emscripten/box2d/box2d.release.wasm.wasm',
        'external:emscripten/bullet/bullet.release.asm.js',
        'external:emscripten/bullet/bullet.release.wasm.js',
        'external:emscripten/bullet/bullet.release.wasm.wasm',
        'external:emscripten/physx/physx.release.asm.js',
        'external:emscripten/physx/physx.release.wasm.js',
        'external:emscripten/physx/physx.release.wasm.wasm',
    ],
    featureUnitsAir: 33,
    featureUnitsUpstream: 55,
    featureUnitsMissing: 23,
    airOnlyFeatures: ['air'],
    wasmBackendFeatures: ['physics-ammo', 'physics-physx', 'physics-2d-box2d-wasm'],
    // r46（owner #8(a)）：physics-cannon 入默认集（交付期切换），26 → 27；三个 wasm 后端仍不入。
    defaultAirFeatures: 26, // Owner-approved retirement of gfx-webgl from the default runtime.
    // A7 核对的子树（三 wasm 后端 + 两个已在 Air 的对照后端）
    physicsSubtreeDirs: [...SEED_DIRS, 'cocos/physics/cannon', 'cocos/physics-2d/box2d'],
};
// A7：这三条子树本期已结项 ⇒ 非 jsb 上游文件缺失数必须为 0（jsb 变体按计划书 §1.3 平台排除，允许缺失但须在册）。

const errors = [];
const fail = (msg) => errors.push(msg);
const upAbs = (r) => path.join(UPSTREAM, r);
const airAbs = (r) => path.join(ROOT, 'src', r);
const toRel = (abs) => path.relative(UPSTREAM, abs).split(path.sep).join('/');
const sha16 = (abs) => crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex').slice(0, 16);

if (!fs.existsSync(UPSTREAM)) {
    console.error(`[wasm-backends] FAILED: 找不到上游快照 ${UPSTREAM}（用 COCOS_UPSTREAM 指定）`);
    process.exit(2);
}

function walkTs (dir, acc) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walkTs(p, acc);
        else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) acc.push(toRel(p));
    }
    return acc;
}

// ---- seeds + 静态 import 传递闭包 ----
const STATIC_FROM_RE = /(?:^|[\s;{}])(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g;
const SIDE_EFFECT_RE = /(?:^|[\s;{}])import\s*['"]([^'"]+)['"]/g;
const DYNAMIC_RE = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const seeds = [];
for (const d of SEED_DIRS) if (fs.existsSync(upAbs(d))) seeds.push(...walkTs(upAbs(d), []));
seeds.push(...SEED_FILES.filter((f) => fs.existsSync(upAbs(f))));

const closure = new Set(seeds);
const queue = [...seeds];
const seedSet = new Set(seeds);
const dynSpecs = new Set();
const unresolvedFromSeeds = [];
const unresolvedElsewhere = [];
while (queue.length) {
    const cur = queue.pop();
    const txt = fs.readFileSync(upAbs(cur), 'utf8');
    for (const m of txt.matchAll(DYNAMIC_RE)) if (seedSet.has(cur)) dynSpecs.add(m[1]);
    const stat = new Set();
    for (const m of txt.matchAll(STATIC_FROM_RE)) stat.add(m[1]);
    for (const m of txt.matchAll(SIDE_EFFECT_RE)) stat.add(m[1]);
    for (const s of stat) {
        if (!s.startsWith('.')) continue;
        const base = path.posix.join(path.posix.dirname(cur), s);
        const hit = [`${base}.ts`, `${base}/index.ts`, base].find((c) => fs.existsSync(upAbs(c)) && fs.statSync(upAbs(c)).isFile());
        const bucket = seedSet.has(cur) ? unresolvedFromSeeds : unresolvedElsewhere;
        if (!hit) bucket.push(`${cur} -> ${base}`);
        else if (!closure.has(hit)) { closure.add(hit); queue.push(hit); }
    }
}
const all = [...closure].sort();

// ---- A1 / A2 ----
if (seeds.length !== EXPECT.seeds) fail(`A2 seed 数漂移：实测 ${seeds.length}，登记 ${EXPECT.seeds}`);
if (all.length !== EXPECT.closureTotal) fail(`A2 闭包总数漂移：实测 ${all.length}，登记 ${EXPECT.closureTotal}`);
const jsb = all.filter((f) => f.endsWith('.jsb.ts')).sort();
if (JSON.stringify(jsb) !== JSON.stringify(EXPECT.jsbInClosure)) fail(`A2 闭包内 jsb 变体集合漂移：实测 ${JSON.stringify(jsb)}，登记 ${JSON.stringify(EXPECT.jsbInClosure)}`);
const missingInAir = all.filter((f) => !f.endsWith('.jsb.ts') && !fs.existsSync(airAbs(f)));
for (const m of missingInAir) fail(`A1 闭包文件未落盘：src/${m}`);
if (unresolvedFromSeeds.length) fail(`A2 seed 内出现解析不到上游文件的相对说明符 ${unresolvedFromSeeds.length} 条：${unresolvedFromSeeds.slice(0, 5).join(' ; ')}`);

// ---- A3 ----
const drifted = all.filter((f) => fs.existsSync(airAbs(f)) && sha16(upAbs(f)) !== sha16(airAbs(f))).sort();
for (const d of drifted) if (!EXPECT.driftedAllowed.includes(d)) fail(`A3 闭包内新增字节偏差（先登记 file-map / UPSTREAM.md 再更新常量）：${d}`);

// ---- A4 ----
const ems = [...dynSpecs].filter((s) => s.startsWith('external:emscripten/')).sort();
for (const s of EXPECT.emscriptenSpecs) if (!ems.includes(s)) fail(`A4 已登记的动态说明符消失：${s}`);
for (const s of ems) if (!EXPECT.emscriptenSpecs.includes(s)) fail(`A4 出现未登记的 external:emscripten 说明符：${s}`);
for (const f of seeds) {
    if (!fs.existsSync(airAbs(f))) continue;
    const txt = fs.readFileSync(airAbs(f), 'utf8').replace(DYNAMIC_RE, 'DYNAMIC_REMOVED');
    const m = txt.match(/['"]external:emscripten\/[^'"]+['"]/);
    if (m) fail(`A4 ${f} 以**静态**方式引用 wasm 资产（会变成构建期硬依赖）：${m[0]}`);
}
// 闭包内其它子图的 emscripten 说明符只登记不判红（同族资产缺口 R8：meshopt / spine / webgpu）。
const otherEms = [...new Set(all.filter((f) => fs.existsSync(airAbs(f))).flatMap((f) => {
    const txt = fs.readFileSync(airAbs(f), 'utf8');
    return [...txt.matchAll(/['"](external:emscripten\/[^'"]+)['"]/g)].map((m) => m[1]);
}).filter((s) => !EXPECT.emscriptenSpecs.includes(s)))].sort();

// ---- A5 ----
const airCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'cc.config.json'), 'utf8'));
const upCfg = JSON.parse(fs.readFileSync(upAbs('cc.config.json'), 'utf8'));
const airKeys = Object.keys(airCfg.features);
const upKeys = Object.keys(upCfg.features);
const missingFeatures = upKeys.filter((k) => !airKeys.includes(k));
const airOnly = airKeys.filter((k) => !upKeys.includes(k)).sort();
if (airKeys.length !== EXPECT.featureUnitsAir) fail(`A5 Air feature 数漂移：实测 ${airKeys.length}，登记 ${EXPECT.featureUnitsAir}`);
if (upKeys.length !== EXPECT.featureUnitsUpstream) fail(`A5 上游 feature 数漂移：实测 ${upKeys.length}，登记 ${EXPECT.featureUnitsUpstream}`);
if (missingFeatures.length !== EXPECT.featureUnitsMissing) fail(`A5 上游有而 Air 未声明的 feature 数漂移：实测 ${missingFeatures.length}，登记 ${EXPECT.featureUnitsMissing}`);
if (JSON.stringify(airOnly) !== JSON.stringify(EXPECT.airOnlyFeatures)) fail(`A5 airOnly feature 集合漂移：实测 ${JSON.stringify(airOnly)}，登记 ${JSON.stringify(EXPECT.airOnlyFeatures)}`);

const buildSrc = fs.readFileSync(path.join(ROOT, 'tools', 'build', 'build.cjs'), 'utf8');
const block = buildSrc.match(/const AIR_FEATURES\s*=\s*\[([\s\S]*?)\];/);
if (!block) { fail('A5 无法从 tools/build/build.cjs 解析 AIR_FEATURES（门禁失效，须修门禁而非删断言）'); }
const defaultFeatures = (block ? block[1] : '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .flatMap((l) => [...l.matchAll(/'([^']+)'/g)].map((m) => m[1]));
if (defaultFeatures.length !== EXPECT.defaultAirFeatures) fail(`A5 默认 AIR_FEATURES 数漂移：实测 ${defaultFeatures.length}，登记 ${EXPECT.defaultAirFeatures}`);
for (const f of EXPECT.wasmBackendFeatures) {
    if (!(f in airCfg.features)) fail(`A5 ${f} 未在 src/cc.config.json 声明（按上游原文保留声明是 Deviation-05 的前提）`);
    else if (JSON.stringify(airCfg.features[f]) !== JSON.stringify(upCfg.features[f])) fail(`A5 ${f} 定义与上游不一致（豁免只作用于类型核对，不改声明内容）`);
    if (defaultFeatures.includes(f)) fail(`A5 ${f} 进了默认 AIR_FEATURES ⇒ 默认产物字节将变，须先取得 owner 批复（#10/#14）并全量重采证据`);
}

// ---- A6 ----
// 上游 tsconfig.json 是 JSONC（带注释），故只按文本抠出 types[] 的字符串项。
const upTsText = fs.readFileSync(upAbs('tsconfig.json'), 'utf8');
const typesBlock = upTsText.match(/"types"\s*:\s*\[([\s\S]*?)\]/);
if (!typesBlock) { fail('A6 上游 tsconfig.json 解析不到 types[]（门禁失效，须修门禁而非删断言）'); }
const types = [...((typesBlock ? typesBlock[1] : '').matchAll(/["'`]([^"'`]+)["'`]/g))].map((m) => m[1]);
const gap = {};
for (const e of ['bullet/bullet', 'physx/physx', 'box2d/box2d']) {
    const entry = types.find((t) => String(t).includes(`emscripten/${e}`));
    if (!entry) { fail(`A6 上游 tsconfig types[] 不再引用 ${e} ⇒ Deviation-05 的根因描述需重新核对并同步 UPSTREAM.md`); continue; }
    const abs = path.join(UPSTREAM, `${String(entry).replace(/^\.\//, '')}.d.ts`);
    const resolved = fs.existsSync(abs);
    gap[e] = { tsconfigEntry: String(entry), resolvedInSnapshot: resolved };
    if (resolved) fail(`A6 快照内已出现 ${e} 的类型声明 ⇒ Deviation-05 exclude 必须撤销，复跑 npm run typecheck + 全量重采（owner #14 候选 (b) 的条件已具备）`);
}

// ---- A7 物理后端子树：现场比较，只豁免已经登记的具体 JSB 文件 ----
// A1 检查静态依赖闭包，A7 还覆盖没有被 seeds 引用的子树文件。
// 重新生成比较报告不会扩大允许缺失的集合。
const registered = new Set(EXPECT.jsbInClosure);
const subtrees = {};
for (const d of EXPECT.physicsSubtreeDirs) {
    if (!fs.existsSync(upAbs(d))) { subtrees[d] = { upstreamExists: false }; fail(`A7 上游子树不再存在：${d}（登记需同步删除）`); continue; }
    const upstreamTs = walkTs(upAbs(d), []);
    const missing = upstreamTs.filter((f) => !fs.existsSync(airAbs(f)));
    const unregistered = missing.filter((f) => !registered.has(f));
    const missingNonJsb = missing.filter((f) => !/\.jsb\.ts$/.test(f));
    subtrees[d] = { upstreamTs: upstreamTs.length, missing: missing.length, missingNonJsb: missingNonJsb.length, unregistered };
    for (const f of unregistered) fail(`A7 ${d} 有上游文件 Air 未落盘且不属于已登记的 JSB 排除项：${f}`);
}

const byteIdentical = all.filter((f) => fs.existsSync(airAbs(f)) && sha16(upAbs(f)) === sha16(airAbs(f))).length;
const report = {
    generatedAt: new Date().toISOString(),
    upstream: UPSTREAM,
    ok: errors.length === 0,
    seeds: seeds.length,
    closureTotal: all.length,
    airByteIdentical: byteIdentical,
    jsbInClosure: jsb,
    missingInAir,
    drifted,
    unresolvedFromSeeds,
    unresolvedElsewhereCount: unresolvedElsewhere.length,
    otherEscriptenSpecs: otherEms,
    emscriptenSpecs: ems,
    features: { air: airKeys.length, upstream: upKeys.length, missing: missingFeatures.length, airOnly, defaultAirFeatures: defaultFeatures.length },
    emscriptenTypeGap: gap,
    subtrees,
    registeredFace: registered.size,
    errors,
};

const outArg = process.argv.find((a) => a.startsWith('--out='));
if (outArg) fs.writeFileSync(path.resolve(outArg.slice(6)), `${JSON.stringify(report, null, 1)}\n`);
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 1));
else {
    console.log(JSON.stringify({
        ok: report.ok,
        seeds: report.seeds,
        closureTotal: report.closureTotal,
        airByteIdentical: report.airByteIdentical,
        drifted: report.drifted.length,
        specs: report.emscriptenSpecs.length,
        features: report.features,
        subtreeUnregistered: Object.values(report.subtrees).reduce((a, s) => a + ((s.unregistered || []).length), 0),
        registeredFace: report.registeredFace,
        errorCount: report.errors.length,
    }));
    for (const e of report.errors.slice(0, 20)) console.error(`  ! ${e}`);
}
process.exit(errors.length ? 1 : 0);
