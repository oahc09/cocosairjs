/**
 * G0 — 官方与 Air 源码全量比对，产出 V1.2 立项的三张清单：
 *   upstreamOnly（官方独有 = 回归候选集）/ common（共同文件）/ drifted（内容漂移）
 * 并对 upstreamOnly 逐条分类（platform.* / batch.* / needs-decision.*），
 * 作为计划书 §1.3「除平台性排除项外差集应为空」的可复核证据（决策点 D9）。
 * 用法：node tools/compare/baseline-compare.cjs [--upstream <dir>] [--out <file>]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function arg(name, def) {
    const i = process.argv.indexOf(`--${name}`);
    return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const UPSTREAM = path.resolve(arg('upstream', 'E:/AIProMax/github/cocos4'));
const OUT = path.resolve(arg('out', 'docs/v12-baseline-compare.json'));
const SCOPES = ['cocos', 'pal', 'exports'];

if (!fs.existsSync(path.join(UPSTREAM, 'cocos'))) {
    console.error(`[compare] upstream not usable: ${UPSTREAM}`);
    process.exit(2);
}

function walk(dir, base, out) {
    for (const name of fs.readdirSync(dir)) {
        const abs = path.join(dir, name);
        const st = fs.lstatSync(abs);
        if (st.isDirectory()) walk(abs, base, out);
        else if (name.endsWith('.ts') || name.endsWith('.js')) out.push(path.relative(base, abs).replace(/\\/g, '/'));
    }
    return out;
}

const upstream = new Map();
for (const scope of SCOPES) {
    const dir = path.join(UPSTREAM, scope);
    if (fs.existsSync(dir)) for (const rel of walk(dir, UPSTREAM, [])) upstream.set(rel, path.join(UPSTREAM, rel));
}

const air = new Map();
for (const scope of SCOPES) {
    const dir = path.join(ROOT, 'src', scope);
    if (fs.existsSync(dir)) for (const rel of walk(dir, path.join(ROOT, 'src'), [])) air.set(rel, path.join(ROOT, 'src', rel));
}

const readNormalized = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const upstreamOnly = [];
const common = [];
const drifted = [];
for (const rel of [...upstream.keys()].sort()) {
    if (!air.has(rel)) {
        upstreamOnly.push(rel);
        continue;
    }
    common.push(rel);
    const rawSame = fs.readFileSync(upstream.get(rel)).equals(fs.readFileSync(air.get(rel)));
    if (!rawSame) {
        const normSame = readNormalized(upstream.get(rel)) === readNormalized(air.get(rel));
        drifted.push({ path: rel, lineEndingsOnly: normSame });
    }
}
const airOnly = [...air.keys()].filter((rel) => !upstream.has(rel)).sort();

const isJsb = (p) => p.endsWith('.jsb.ts');
const byModule = {};
for (const rel of upstreamOnly) {
    const seg = rel.split('/');
    const key = seg[0] === 'cocos' ? `cocos/${seg[1]}` : seg[0];
    byModule[key] = (byModule[key] || 0) + 1;
}

/**
 * 残留差集分类（计划书 §1.3「差集应为空」的可复核口径；决策点 D9）。
 * 类别 id 前缀即结论：platform.* = 平台性排除；batch.* = V1.2 排期内尚未落地；
 * needs-decision.* = 16 组未列、需显式豁免或扩范围。
 */
function classify (rel) {
    if (isJsb(rel)) return 'platform.jsb-variant';
    if (/^cocos\/physics-2d\/box2d-jsb\//.test(rel) || rel === 'exports/physics-2d-box2d-jsb.ts') {
        return 'platform.box2d-jsb';           // 计划书 §1.1 组 4 指名跳过
    }
    if (rel.startsWith('cocos/native-binding/')) return 'platform.native-binding'; // 仅 *.jsb.ts 引用
    if (/\.editor\.ts$/.test(rel) || rel === 'cocos/rendering/lod-group-editor-utility.ts') {
        return 'platform.editor-only';         // 仅 editor/exports/** 引用（§1.3 排除 editor）
    }
    if (/^pal\/(native|minigame|nodejs|universal|editor)\//.test(rel)) return 'platform.pal-variant';
    if (rel === 'cocos/gfx/index.ems.ts') return 'platform.emscripten-entry';      // native emscripten 构建入口
    if (/^cocos\/gfx\/webgpu\//.test(rel) || rel === 'exports/gfx-webgpu.ts' || rel === 'cocos/webgpu/instantiated.ts') {
        return 'batch.E-gfx-webgpu';
    }
    if (/^cocos\/physics-2d\/box2d-wasm\//.test(rel) || rel === 'exports/physics-2d-box2d-wasm.ts') {
        return 'batch.D4-physics-2d-box2d-wasm';
    }
    if (/^cocos\/physics\/(bullet|physx)\//.test(rel) || rel === 'exports/physics-ammo.ts' || rel === 'exports/physics-physx.ts') {
        return 'batch.G3-physics-bullet-physx';
    }
    if (/^cocos\/terrain\//.test(rel) || rel === 'exports/terrain.ts') return 'needs-decision.terrain';
    if (rel === 'cocos/xr/deprecated.ts' || rel === 'cocos/xr/index.ts' || rel === 'exports/xr.ts') return 'needs-decision.xr';
    if (/^cocos\/gi\//.test(rel) || rel === 'exports/light-probe.ts') return 'needs-decision.light-probe';
    if (/^cocos\/particle\//.test(rel) || rel === 'exports/particle.ts') return 'needs-decision.particle-3d';
    if (['exports/rich-text.ts', 'exports/ui-skew.ts', 'exports/affine-transform.ts', 'exports/vendor-google.ts'].includes(rel)) {
        return 'needs-decision.convenience-export';  // 模块文件已在 Air，仅缺官方入口/unit 注册
    }
    if (rel === 'cocos/serialization/deserialize-dynamic-empty.ts') return 'needs-decision.unreferenced-upstream-file';
    return 'needs-decision.unclassified';
}

const byCategory = {};
for (const rel of upstreamOnly) {
    const c = classify(rel);
    (byCategory[c] = byCategory[c] || []).push(rel);
}

const report = {
    meta: {
        generatedAt: new Date().toISOString(),
        upstreamDir: UPSTREAM.replace(/\\/g, '/'),
        upstreamSha: (() => { try { return require('child_process').execFileSync('git', ['rev-parse', 'HEAD'], { cwd: UPSTREAM }).toString().trim(); } catch { return 'unknown'; } })(),
        scopes: SCOPES.map((s) => `${s}/**`),
        note: 'lineEndingsOnly=true 的漂移为换行符差异（非语义漂移）',
    },
    counts: {
        upstreamTotal: upstream.size,
        airTotal: air.size,
        upstreamOnly: upstreamOnly.length,
        upstreamOnlyExcludingJsb: upstreamOnly.filter((p) => !isJsb(p)).length,
        common: common.length,
        drifted: drifted.length,
        driftedSemantic: drifted.filter((d) => !d.lineEndingsOnly).length,
        airOnly: airOnly.length,
    },
    upstreamOnly,
    common,
    drifted,
    airOnly,
    upstreamOnlyByModule: byModule,
    upstreamOnlyByCategory: Object.fromEntries(
        Object.entries(byCategory).sort().map(([k, v]) => [k, { count: v.length, files: v }])),
    residualCounts: {
        platformExcluded: Object.keys(byCategory).filter((k) => k.startsWith('platform.'))
            .reduce((s, k) => s + byCategory[k].length, 0),
        inPlanPending: Object.keys(byCategory).filter((k) => k.startsWith('batch.'))
            .reduce((s, k) => s + byCategory[k].length, 0),
        needsDecision: Object.keys(byCategory).filter((k) => k.startsWith('needs-decision.'))
            .reduce((s, k) => s + byCategory[k].length, 0),
    },
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`[compare] ${JSON.stringify(report.counts)}`);
console.log(`[compare] upstream sha ${report.meta.upstreamSha} -> ${path.relative(ROOT, OUT).replace(/\\/g, '/')}`);
const top = Object.entries(byModule).sort((a, b) => b[1] - a[1]).slice(0, 25);
for (const [k, v] of top) console.log(`  ${String(v).padStart(5)}  ${k}`);
console.log('[compare] upstreamOnly 残留分类（§1.3 / 决策点 D9）：');
for (const [k, files] of Object.entries(byCategory).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${String(files.length).padStart(5)}  ${k}`);
    if (k.startsWith('needs-decision.')) files.forEach((f) => console.log(`           ${f}`));
}
console.log(`[compare] residual ${JSON.stringify(report.residualCounts)}`);
