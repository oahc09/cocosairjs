/**
 * custom pipeline / post-process 导出面一致性的只读门禁。
 *
 *   node tools/verify/verify-custom-exports.cjs [--json] [--out=<path>]
 *
 * 上游快照路径可用 COCOS_UPSTREAM 覆盖。原判据住在仓库外 scratch（`pg-probe/h-export-face.cjs`，只 dump 不断言），
 * 本脚本把同一批事实固化成五条不变量：
 *   C1 门面逐字节同：`src/exports/custom-pipeline.ts` / `custom-pipeline-post-process.ts` 与上游 sha256 全同
 *      （这两个文件是「Air 的 custom pipeline 接线面 = 官方」的唯一直接证据）。
 *   C2 范围未漂移：两个渲染子图（`cocos/rendering/post-process` / `cocos/rendering/custom`）的 Air/上游文件数
 *      = 登记常量；差集只允许登记的 jsb 变体（Web 平台排除，同 §1.3 口径）。
 *   C3 逐字节 + 簿记双对账：默认与上游字节相同；仅允许固定 SHA 的 TAA 投影恢复补丁，且**每一张都登记在** `docs/upstream-file-map.json`
 *      （抽了不回填簿记 ⇒ 红；出现字节偏差 ⇒ 先在 UPSTREAM.md 登记再更新常量）。
 *   C4 feature unit 声明面：`custom-pipeline` / `custom-pipeline-post-process` 定义与上游逐字段相同，
 *      且上游那条 `custom-pipeline-builtin-scripts` **不得**被静默引入 Air 声明
 *      （`docs/reference/web-features.md` 已把它记为非目标；引入即改默认产物字节 ⇒ 须走 owner 批复）。
 *   C5 默认发行姿态：上述两个 feature unit **必须**在 `tools/build/build.cjs` 的默认 `AIR_FEATURES` 内
 *      —— 与 A5 对 wasm 后端的要求**极性相反**：后处理效果类是已发布 bundle 的一部分，把它移出默认集同样改产物字节。
 *
 * 退出码非 0 = 不变量被破坏（不得进入验收）。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const UPSTREAM = path.resolve(process.env.COCOS_UPSTREAM || 'E:/AIProMax/github/cocos4');

const EXPECT = {
    exportFaces: ['src/exports/custom-pipeline.ts', 'src/exports/custom-pipeline-post-process.ts'],
    subtrees: {
        'cocos/rendering/post-process': { air: 34, upstream: 34, upstreamOnlyAllowed: [] },
        'cocos/rendering/custom': {
            air: 25,
            upstream: 26,
            upstreamOnlyAllowed: ['cocos/rendering/custom/index.jsb.ts'],
        },
    },
    featureUnitsShared: ['custom-pipeline', 'custom-pipeline-post-process'],
    featureUnitsNotAir: ['custom-pipeline-builtin-scripts'],
    defaultAirFeatures: 27, // Explicit WebGPU registered; WebGL2 remains the default.
};

const INTENTIONAL_DEVIATIONS = {
    'src/cocos/rendering/post-process/post-process-builder.ts':
        'be08d00808d73a56fa2eaa95043e2502ad7764d46a4054b3074a9a914999942c',
};

const errors = [];
const fail = (msg) => errors.push(msg);
const upAbs = (r) => path.join(UPSTREAM, r);
const airAbs = (r) => path.join(ROOT, r);
const h16 = (abs) => crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex').slice(0, 16);
const toRel = (abs, base) => path.relative(base, abs).split(path.sep).join('/');

if (!fs.existsSync(UPSTREAM)) {
    console.error(`[custom-exports] FAILED: 找不到上游快照 ${UPSTREAM}（用 COCOS_UPSTREAM 指定）`);
    process.exit(2);
}

function walk(dirAbs, baseAbs, acc) {
    for (const e of fs.readdirSync(dirAbs, { withFileTypes: true })) {
        const p = path.join(dirAbs, e.name);
        if (e.isDirectory()) walk(p, baseAbs, acc);
        else acc.push(toRel(p, baseAbs));
    }
    return acc;
}

// ---- C1 门面逐字节 ----
const faces = [];
for (const rel of EXPECT.exportFaces) {
    const airFile = airAbs(rel);
    const upFile = upAbs(rel.replace(/^src\//, ''));
    const ok = fs.existsSync(airFile) && fs.existsSync(upFile) && h16(airFile) === h16(upFile);
    if (!fs.existsSync(airFile)) fail(`C1 门面缺失：${rel}`);
    else if (!fs.existsSync(upFile)) fail(`C1 上游门面缺失：${rel.replace(/^src\//, '')}（门禁失效，须核对快照）`);
    else if (!ok)
        fail(`C1 门面字节与上游不同：${rel}（Air ${h16(airFile)} / 上游 ${h16(upFile)}）⇒ 先登记偏差再更新常量`);
    faces.push({ file: rel, same: ok, bytes: fs.existsSync(airFile) ? fs.statSync(airFile).size : null });
}

// ---- C3 簿记登记集 ----
const mapJson = JSON.parse(fs.readFileSync(airAbs('docs/upstream-file-map.json'), 'utf8'));
const rows = mapJson.mapping;
const registeredAir = new Set(
    Array.isArray(rows) ? rows.map((r) => (typeof r === 'string' ? r : r.airPath)) : Object.keys(rows || {}),
);

// ---- C2 / C3 子图 ----
const dirs = [];
for (const sub of Object.keys(EXPECT.subtrees)) {
    const exp = EXPECT.subtrees[sub];
    const airDir = airAbs(path.join('src', sub));
    const upDir = upAbs(sub);
    if (!fs.existsSync(airDir) || !fs.existsSync(upDir)) {
        fail(`C2 子树不再存在：${sub}`);
        continue;
    }
    const airFiles = walk(airDir, airDir, []).sort();
    const upFiles = walk(upDir, upDir, []).sort();
    if (airFiles.length !== exp.air) fail(`C2 ${sub} Air 文件数漂移：实测 ${airFiles.length}，登记 ${exp.air}`);
    if (upFiles.length !== exp.upstream) fail(`C2 ${sub} 上游文件数漂移：实测 ${upFiles.length}，登记 ${exp.upstream}`);

    const airOnly = [];
    let byteSame = 0;
    for (const f of airFiles) {
        const upRel = `${sub}/${f}`;
        const airRel = `src/${sub}/${f}`;
        if (!fs.existsSync(upAbs(upRel))) {
            airOnly.push(airRel);
            continue;
        }
        if (h16(upAbs(upRel)) === h16(airAbs(airRel))) byteSame++;
        else {
            const row = rows.find((entry) => entry.airPath === airRel);
            const sha = crypto
                .createHash('sha256')
                .update(fs.readFileSync(airAbs(airRel)))
                .digest('hex');
            if (INTENTIONAL_DEVIATIONS[airRel] !== sha || !row?.modified || !row.reason?.includes('TAA')) {
                fail(`C3 ${airRel} unregistered upstream drift`);
            }
        }
        if (!registeredAir.has(airRel)) fail(`C3 ${airRel} 未登记在 docs/upstream-file-map.json（抽取必须回填簿记）`);
    }
    for (const a of airOnly) fail(`C3 Air 独有子图文件（上游无同名，须按原创登记）：${a}`);
    const upstreamOnly = upFiles
        .filter((f) => !fs.existsSync(airAbs(path.join('src', sub, f))))
        .map((f) => `${sub}/${f}`);
    for (const u of upstreamOnly)
        if (!exp.upstreamOnlyAllowed.includes(u)) fail(`C2 ${sub} 出现未登记的上游缺件：${u}`);
    for (const u of exp.upstreamOnlyAllowed)
        if (!upstreamOnly.includes(u)) fail(`C2 ${sub} 已登记的上游缺件已落地（请同步 file-map 与本常量）：${u}`);
    dirs.push({ sub, airCount: airFiles.length, upstreamCount: upFiles.length, byteSame, airOnly, upstreamOnly });
}

// ---- C4 feature unit 声明面 ----
const airCfg = JSON.parse(fs.readFileSync(airAbs('src/cc.config.json'), 'utf8'));
const upCfg = JSON.parse(fs.readFileSync(upAbs('cc.config.json'), 'utf8'));
for (const f of EXPECT.featureUnitsShared) {
    if (!(f in airCfg.features)) fail(`C4 ${f} 未在 src/cc.config.json 声明`);
    else if (JSON.stringify(airCfg.features[f]) !== JSON.stringify(upCfg.features[f]))
        fail(`C4 ${f} 定义与上游不一致（接线面须按原文保留）`);
}
for (const f of EXPECT.featureUnitsNotAir) {
    if (f in airCfg.features)
        fail(
            `C4 ${f} 进了 Air 声明 ⇒ 默认产物字节将变，须先取得 owner 批复（docs/reference/web-features.md 记录其为非目标）`,
        );
    else if (!(f in upCfg.features)) fail(`C4 上游已不再声明 ${f}，本断言需重新核对`);
}

// ---- C5 默认发行姿态 ----
const buildSrc = fs.readFileSync(airAbs('tools/build/build.cjs'), 'utf8');
const block = buildSrc.match(/const AIR_FEATURES\s*=\s*\[([\s\S]*?)\];/);
if (!block) fail('C5 无法从 tools/build/build.cjs 解析 AIR_FEATURES（门禁失效，须修门禁而非删断言）');
const defaultFeatures = (block ? block[1] : '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .flatMap((l) => [...l.matchAll(/'([^']+)'/g)].map((m) => m[1]));
if (defaultFeatures.length !== EXPECT.defaultAirFeatures)
    fail(`C5 默认 AIR_FEATURES 数漂移：实测 ${defaultFeatures.length}，登记 ${EXPECT.defaultAirFeatures}`);
for (const f of EXPECT.featureUnitsShared) {
    if (!defaultFeatures.includes(f))
        fail(
            `C5 ${f} 被移出默认 AIR_FEATURES ⇒ 发布 bundle 组成改变（后处理效果类属已发行面），须走批复 + 全量重采证据`,
        );
}

const report = {
    generatedAt: new Date().toISOString(),
    upstream: UPSTREAM,
    ok: errors.length === 0,
    exportFaces: faces,
    dirs,
    intentionalDeviations: INTENTIONAL_DEVIATIONS,
    registeredRowCount: registeredAir.size,
    features: EXPECT.featureUnitsShared.map((f) => ({
        id: f,
        definedInAir: f in airCfg.features,
        identicalToUpstream:
            f in airCfg.features && JSON.stringify(airCfg.features[f]) === JSON.stringify(upCfg.features[f]),
        inDefaultAirFeatures: defaultFeatures.includes(f),
    })),
    defaultAirFeatures: defaultFeatures.length,
    errors,
};

const outArg = process.argv.find((a) => a.startsWith('--out='));
if (outArg) fs.writeFileSync(path.resolve(outArg.slice(6)), `${JSON.stringify(report, null, 1)}\n`);
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 1));
else {
    console.log(
        JSON.stringify({
            ok: report.ok,
            faces: faces.filter((f) => f.same).length,
            dirs: dirs.map((d) => `${d.sub}:${d.byteSame}/${d.airCount}`).join(' '),
            featureUnits: report.features.filter((f) => f.identicalToUpstream && f.inDefaultAirFeatures).length,
            defaultAirFeatures: report.defaultAirFeatures,
            errorCount: errors.length,
        }),
    );
    for (const e of report.errors.slice(0, 20)) console.error(`  ! ${e}`);
}
process.exit(errors.length ? 1 : 0);
