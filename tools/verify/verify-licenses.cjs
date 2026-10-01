/* V1.2 许可审计门禁：产物/变体里内嵌的每一个第三方运行时都必须有
 *   1) licenses/（或 build/gltf-decoders/）下的许可原文，且与来源逐字节一致（不许手写许可）；
 *   2) docs/license-decisions.json 里的处置登记（obligation/owner 决定或 pending 状态）；
 *   3) package.json files[] 真的把许可文本随包发布（Spine 明文要求再分发必须附许可）。
 *
 * 执行：node tools/verify/verify-licenses.cjs [--json]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const UPSTREAM = path.resolve(process.env.COCOS_UPSTREAM || 'E:/AIProMax/github/cocos4');
const BUNDLE = path.join(ROOT, 'build', 'cocosair.module.js');
const DECISIONS_PATH = path.join(ROOT, 'docs', 'license-decisions.json');

/**
 * ships: default = 进默认发行 bundle；variant = 只在 AIR_FEATURES 变体构建里进；source = 只在仓库源码里。
 * probes: 产物中必须出现的指纹串（default 项全部命中，variant/source 项不得命中默认产物）。
 */
const REGISTRY = [
    {
        component: 'spine runtime (spine-core.js)',
        licenseFile: 'licenses/LICENSE_spine.txt',
        sourceOfTruth: { kind: 'upstream', path: 'licenses/LICENSE_spine.txt' },
        licenseId: 'Spine Runtimes License Agreement (2019-05-01, Esoteric Software LLC)',
        ships: 'default',
        probes: ['spine.TimelineType'],
        decisionRequired: true,
        note: '明文要求：再分发必须附带本许可与版权声明，且产品的每个用户须自备 Spine Editor 许可。',
    },
    {
        component: 'DragonBonesJS (@cocos/dragonbones-js)',
        licenseFile: 'licenses/LICENSE_DragonBones.txt',
        sourceOfTruth: { kind: 'upstream', path: 'licenses/LICENSE_DragonBones.txt' },
        licenseId: 'MIT (c) 2012-2016 DragonBones team and other contributors',
        ships: 'default',
        probes: ['DragonBones'],
        note: 'npm 包内不含 LICENSE 文本（package.json 亦无 license 字段），许可原文取自上游 cocos4 licenses/。',
    },
    {
        component: 'Box2D (@cocos/box2d)',
        licenseFile: 'licenses/LICENSE_box2d.txt',
        sourceOfTruth: { kind: 'vendored', path: 'src/node_modules/@cocos/box2d/LICENSE' },
        licenseId: 'MIT (c) 2019 Erin Catto',
        ships: 'default',
        probes: ['b2World'],
    },
    {
        component: 'cannon.js (@cocos/cannon)',
        licenseFile: 'licenses/LICENSE_cannon.txt',
        sourceOfTruth: { kind: 'vendored', path: 'src/node_modules/@cocos/cannon/LICENSE' },
        licenseId: 'MIT (c) 2015 cannon.js Authors',
        ships: 'default', // r46（#8(a)）：cannon 入默认 bundle（交付期 builtin+cannon 双编入，默认仍 builtin）
        probes: ['CannonWorld'],
        note: 'r46 起默认产物内嵌（原仅变体）；许可仍随仓库文本发布。',
    },
    {
        component: 'zlib.js (src/external/compression/zlib.min.js)',
        licenseFile: 'licenses/LICENSE_zlibjs.txt',
        sourceOfTruth: { kind: 'upstream', path: 'licenses/LICENSE_zlibjs.txt' },
        licenseId: 'MIT (zlib.js, imaya)',
        ships: 'default',
        probes: ['adler', 'inflate'],
    },
    {
        component: 'notepack.io (src/external/deserialize)',
        licenseFile: 'licenses/LICENSE_notepack.io.txt',
        sourceOfTruth: { kind: 'upstream', path: 'licenses/LICENSE_notepack.io.txt' },
        licenseId: 'MIT (c) 2014 Ion Drive Software Ltd.',
        ships: 'default',
        probes: ['notepack'],
    },
    {
        component: 'Cocos PAL (public MIT source)',
        licenseFile: 'licenses/LICENSE_pal.txt',
        sourceOfTruth: { kind: 'vendored', path: 'vendor/pal-source/LICENSE' },
        licenseId: 'MIT (cocos4 public source @ 9f0e30ac)',
        ships: 'default',
        probes: ['AudioContext'],
        decisionRequired: true,
        note: 'Derived exclusively from the frozen public MIT PAL tree; engine-pal npm bytes are retired.',
    },
    {
        component: 'meshoptimizer (glTF 解码器)',
        licenseFile: 'build/gltf-decoders/meshopt/LICENSE.md',
        sourceOfTruth: { kind: 'self', path: 'build/gltf-decoders/meshopt/LICENSE.md' },
        licenseId: 'MIT (zeux/meshoptimizer 1.2.0)',
        ships: 'source',
        probes: [],
    },
    {
        component: 'draco3d (glTF 解码器)',
        licenseFile: 'build/gltf-decoders/draco/LICENSE.md',
        sourceOfTruth: { kind: 'self', path: 'build/gltf-decoders/draco/LICENSE.md' },
        licenseId: 'Apache-2.0 (google/draco 1.5.7)',
        ships: 'source',
        probes: [],
    },
    {
        component: 'Basis Universal (glTF 解码器)',
        licenseFile: 'build/gltf-decoders/basis/LICENSE.md',
        sourceOfTruth: { kind: 'self', path: 'build/gltf-decoders/basis/LICENSE.md' },
        licenseId: 'Apache-2.0 (Binomial LLC, three r168 构建)',
        ships: 'source',
        probes: [],
    },
];

function readText (p) { return fs.readFileSync(p, 'utf8'); }

function truthPath (t) {
    if (t.kind === 'upstream') { return path.join(UPSTREAM, t.path); }
    if (t.kind === 'npm') { return path.join(ROOT, t.path); }
    return path.join(ROOT, t.path);
}

function check () {
    const failures = [];
    const attention = [];
    const records = [];
    const bundleText = fs.existsSync(BUNDLE) ? readText(BUNDLE) : '';
    const decisions = fs.existsSync(DECISIONS_PATH)
        ? JSON.parse(readText(DECISIONS_PATH)).decisions || {}
        : {};
    const pkg = JSON.parse(readText(path.join(ROOT, 'package.json')));
    const shipsLicensesDir = (pkg.files || []).some((f) => /^licenses\/?$/.test(f));

    if (!fs.existsSync(BUNDLE)) { failures.push('build/cocosair.module.js 缺失（先 npm run build）'); }

    for (const entry of REGISTRY) {
        const problems = [];
        const gaps = [];
        // 1) 许可原文
        let licenseBytes = null;
        if (entry.licenseFile) {
            const abs = path.join(ROOT, entry.licenseFile);
            if (!fs.existsSync(abs)) {
                problems.push(`许可原文缺失：${entry.licenseFile}`);
            } else {
                licenseBytes = fs.statSync(abs).size;
                if (licenseBytes === 0) { problems.push(`许可原文为空：${entry.licenseFile}`); }
                if (entry.sourceOfTruth.kind === 'upstream' || entry.sourceOfTruth.kind === 'vendored') {
                    const truth = truthPath(entry.sourceOfTruth);
                    if (!fs.existsSync(truth)) {
                        problems.push(`许可来源不可达：${entry.sourceOfTruth.path}（可用 COCOS_UPSTREAM 覆盖上游路径）`);
                    } else if (!fs.readFileSync(truth).equals(fs.readFileSync(abs))) {
                        problems.push(`许可原文与来源不逐字节一致：${entry.licenseFile} != ${entry.sourceOfTruth.path}`);
                    }
                }
            }
        } else {
            gaps.push('来源包未附许可文本，无可录原文');
        }
        // 2) 产物指纹
        const probeState = entry.probes.map((p) => ({ probe: p, inBundle: bundleText.includes(p) }));
        for (const s of probeState) {
            const want = entry.ships === 'default';
            if (s.inBundle !== want) {
                problems.push(`指纹 ${s.probe} 期望 inBundle=${want}（ships=${entry.ships}），实测 ${s.inBundle}`);
            }
        }
        // 3) 处置登记
        const decision = decisions[entry.component];
        const needsDecision = Boolean(entry.decisionRequired || gaps.length);
        if (needsDecision && (!decision || !decision.disposition)) {
            problems.push('需要许可处置登记（docs/license-decisions.json）但缺失');
        }
        const pending = Boolean(decision && decision.disposition && decision.disposition !== 'accepted');
        // Preserve the historical decision in diagnostics; it never waives missing grants.
        const riskAccepted = Boolean(decision && decision.disposition === 'accepted' && decision.riskAccepted);
        // A local risk decision cannot grant redistribution rights for third-party code.
        problems.push(...gaps);
        if (pending && entry.ships === 'default') {
            problems.push(`默认产物许可处置未完成：${decision.disposition}`);
        }
        if (problems.length) {
            failures.push(`${entry.component}: ${problems.join('; ')}`);
        }
        if (pending) {
            attention.push(`${entry.component}: disposition=${decision.disposition}${gaps.length ? ` — ${gaps.join('; ')}` : ''}${decision.owner ? ` (owner: ${decision.owner})` : ''}`);
        } else if (riskAccepted && gaps.length) {
            attention.push(`RISK-ACCEPTED ${entry.component}: ${gaps.join('; ')}（owner 批复的风险接受处置，见 docs/license-decisions.json；不冒充许可清晰）`);
        }
        records.push({
            component: entry.component,
            licenseId: entry.licenseId,
            licenseFile: entry.licenseFile,
            licenseBytes,
            ships: entry.ships,
            probes: probeState,
            decision: decision ? decision.disposition : null,
            gaps,
            problems,
        });
    }
    // 4) 发布面
    if (shipsLicensesDir && !fs.existsSync(path.join(ROOT, 'licenses'))) { failures.push('files[] 声明 licenses/ 但目录不存在'); }
    const needsShipped = REGISTRY.some((r) => r.licenseFile && r.licenseFile.startsWith('licenses/') && r.ships === 'default');
    if (needsShipped && !shipsLicensesDir) { failures.push('licenses/ 未列入 package.json files[]：默认产物内嵌的第三方许可未随包发布'); }

    failures.push(...require('../build/pal-source.cjs').check());
    for (const file of ['build/cocosair.module.js', 'build/cocosair.module.min.js']) {
        const target = path.join(ROOT, file);
        if (!fs.existsSync(target)) { failures.push(`PAL published bundle missing: ${file}`); continue; }
        const text = fs.readFileSync(target, 'utf8');
        if (['_ccprivate$_gameCanvas', '_ccprivate$_battery'].some(marker => text.includes(marker))) {
            failures.push(`${file}: retired engine-pal binary fingerprints remain; rebuild from public MIT PAL`);
        }
    }
    return { records, failures, attention, shipsLicensesDir };
}

if (require.main === module) {
    const result = check();
    const json = process.argv.includes('--json');
    if (json) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        for (const r of result.records) {
            const tag = r.problems.length ? 'FAIL' : r.gaps.length ? 'WARN' : 'ok  ';
            console.log(`[licenses] ${tag} ${r.component} | ${r.licenseId} | ships=${r.ships} | text=${r.licenseFile || '—'} | decision=${r.decision || 'n/a'}`);
        }
        for (const f of result.failures) { console.log(`[licenses] FAIL ${f}`); }
        for (const a of result.attention) { console.log(`[licenses] ATTENTION ${a}`); }
        console.log(`[licenses] ${result.records.length} 项登记：${result.failures.length} FAIL / ${result.attention.length} ATTENTION`
            + `；files[] licenses/= ${result.shipsLicensesDir}`);
    }
    process.exitCode = result.failures.length ? 1 : 0;
}

module.exports = { check, REGISTRY };
