#!/usr/bin/env node
'use strict';
/**
 * IER-00 基线身份与历史去重（S0 审查修订版）。
 *
 * 与首版的区别（本轮纠正）：
 * - 默认生成绝不出现 tested-passed；测试文件只标 testAvailable + testExecution:'NOT_RUN'。
 *   只有通过 applyExecutionReport() 传入与当前身份绑定、且 exitCode/用例状态可校验的执行报告才升级。
 * - 导出核对解析 bundle 末尾 export 语句（别名感知）与 dts 声明，不再对整个 bundle 做 includes。
 * - 补齐 1.2 清单遗漏项：validateAirPrefilteredEnvironment、bindAirPrefilteredEnvironment、
 *   releaseScene、createSessionScope（sessionScope）；修正 createSessionGate 的测试映射。
 * - 身份复用 tools/verify/port-gap-candidate-snapshot.cjs 的 collectSnapshot（branch/HEAD/完整 dirty/
 *   AIR/source/config/runner/contracts/artifacts），并补充 min/map/bootstrap/npm/html-source 产物身份。
 * - 源码与 bundle 对应：对 dev/min 两个 source map 做抽样 sourcesContent 比对；无法证明的记 UNKNOWN，
 *   不再用 HEAD 臒测 builtFrom。
 * - 历史任务书 SHA 修正为精确 64 位值。
 * - 去重表逐项给出 IER-00..11 → 原 10 建议 → 现有复用物 → 动作，不再是一句话。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const snapshotTool = require('./port-gap-candidate-snapshot.cjs');

const REPO = path.resolve(__dirname, '../..');

// 任务书 1.2 只读核对的 Oct6 模块 SHA256（精确 64 位，勿再抄错）。
const TASK_DOC_MODULE_SHA256 = 'f6836f6060ed00e4bd67f71056e1d15a9c9522fcfdd5ed67292387fad4085372';

const SCHEMA_VERSION = 'ier-baseline/2';

// ── 能力状态词汇（默认生成只允许前四档；tested-passed 仅由执行报告升级产生）──
const CAPABILITY_STATUS = {
    EXPORTED: 'exported-verified',   // bundle 顶层 export 语句（别名感知）+ dts 声明均命中
    MEMBER: 'member-declared',       // dts 成员声明 + bundle 实现体命中（非顶层导出）
    DECLARED: 'declared-only',       // 仅 dts 声明，bundle 实现未定位
    UNCHECKED: 'unchecked',          // 两侧均未定位
    TESTED: 'tested-passed',         // 仅 applyExecutionReport 升级产生
};

const TEST_EXECUTION = { NOT_RUN: 'NOT_RUN' };

// ── 1.2 API 清单（冻结；探测方式逐项声明）──
// kind: 'top-level'  → 解析 bundle 末尾 export 列表（含 "orig as alias"），dts 需有声明
// kind: 'member'     → dts 成员声明（\bname\s*\??\s*[<(:]）+ bundle 实现体（\bname\s*[(<:]）
const INVENTORY_APIS = [
    { name: 'createAirRenderTarget', kind: 'top-level', tests: ['test/smoke/render-dx-target-options.test.ts'] },
    { name: 'AirRenderTarget', kind: 'top-level', tests: ['test/smoke/render-dx-target-options.test.ts'] },
    { name: 'resolveAirTextureFormat', kind: 'top-level', tests: ['test/smoke/render-dx-color-contract.test.ts'] },
    { name: 'validateAirTextureColorContract', kind: 'top-level', tests: ['test/smoke/render-dx-color-contract.test.ts'] },
    { name: 'validateAirPrefilteredEnvironment', kind: 'top-level', tests: [] },
    { name: 'bindAirPrefilteredEnvironment', kind: 'top-level', tests: [] },
    { name: 'inspectAirMaterial', kind: 'top-level', tests: ['test/smoke/render-dx-material-diagnostics.test.ts'] },
    { name: 'inspectAirMeshMaterial', kind: 'top-level', tests: ['test/smoke/engine-contract-inspection.test.ts'] },
    { name: 'inspectAirGeometry', kind: 'top-level', tests: ['test/smoke/engine-contract-inspection.test.ts'] },
    { name: 'createActionState', kind: 'top-level', tests: ['test/smoke/port-gap-action-state.test.ts'] },
    { name: 'createActionInput', kind: 'top-level', tests: ['test/smoke/port-gap-action-input-dom.test.ts', 'test/smoke/port-gap-action-input-native.test.ts'] },
    { name: 'createSessionGate', kind: 'top-level', tests: ['test/smoke/port-gap-action-input-dom.test.ts', 'test/smoke/port-gap-action-input-native.test.ts'] },
    { name: 'createSessionScope (sessionScope)', kind: 'top-level', surface: 'createSessionScope', tests: ['test/smoke/port-gap-session-scope.test.ts', 'test/smoke/port-gap-action-scope-integration.test.ts'] },
    { name: 'releaseScene', kind: 'member', tests: ['test/smoke/port-gap-scene-release.test.ts', 'test/smoke/port-gap-initial-session-ownership.test.ts'] },
    { name: 'createStepClock', kind: 'top-level', tests: [] }, // 无 Jest 套件；fixtures 使用不属于测试执行证据
    { name: 'utils.MeshUtils.createDynamicMesh', kind: 'member', surface: 'createDynamicMesh', tests: ['test/smoke/engine-contract-mesh.test.ts', 'test/smoke/k0-r2-native-contracts.test.ts'] },
    { name: 'mesh.updateSubMesh', kind: 'member', surface: 'updateSubMesh', tests: ['test/smoke/engine-contract-mesh.test.ts', 'test/smoke/k0-r2-native-contracts.test.ts'] },
    { name: 'Camera.calculateObliqueMat', kind: 'member', surface: 'calculateObliqueMat', tests: [] },
    { name: 'screenMode / container', kind: 'member', surface: 'screenMode', tests: ['test/smoke/responsive-host-layout.test.ts'] },
    { name: 'pixelRatioCap', kind: 'member', tests: ['test/smoke/responsive-host-layout.test.ts'] },
];

// ── 去重表：IER-00..11 → 原任务书建议 → 本仓现有复用物 → 动作 ──
// action ∈ reuse（直接复用，不再建任务）/ add-tests（实现已有，仅补用例或示例）
//        / needs-rerun（历史证据身份不符当前构建，需在新 SHA 重跑）/ missing-materials（原工程材料缺失）
const DEDUP_TABLE = [
    { ier: 'IER-00', original: 'ENG-00', recommendation: 'E3+历史去重', action: 'reuse',
      reuse: ['tools/verify/port-gap-candidate-snapshot.cjs', 'tools/verify/port-gap-evidence-schema.cjs', 'docs/example-api-inventory.json', 'docs/api-coverage-report.json'],
      note: '身份/能力清单由本工具承担；不再新建证据平台' },
    { ier: 'IER-01', original: 'ENG-01', recommendation: 'E3', action: 'reuse',
      reuse: ['tools/verify/port-gap-evidence-schema.cjs', 'tools/verify/k0-r2-examples.cjs', 'docs/reference/port-gap-evidence-schema.md'],
      note: '本批已补输入→画面最小合同；真实浏览器采集由 Lead 后续执行' },
    { ier: 'IER-02', original: 'ENG-02', recommendation: 'A1', action: 'add-tests',
      reuse: ['test/smoke/render-dx-target-options.test.ts', 'docs/manual/examples/manual-render-targets', 'src/air/rendering'],
      note: '复用 AirRenderTarget 与 HDR capture→sample 路径；补独立低层 gfx/mip、绑定负控和生命周期验收' },
    { ier: 'IER-03', original: 'ENG-03', recommendation: 'A2', action: 'needs-rerun',
      reuse: ['test/smoke/render-dx-color-contract.test.ts', 'examples/hdr-color-pipeline'],
      note: '旧 HDR 报告 72f37ee6… 身份不符当前 3a448f02…，不可继承 PASS，需当前 SHA 重跑' },
    { ier: 'IER-04', original: 'ENG-04', recommendation: 'B1', action: 'add-tests',
      reuse: ['test/smoke/k0-r2-native-contracts.test.ts', 'test/smoke/engine-contract-mesh.test.ts', 'test/smoke/responsive-host-layout.test.ts', 'examples/k0-r2-porting-contracts'],
      note: '动态网格合同已有；calculateObliqueMat 无专测，仅补用例' },
    { ier: 'IER-05', original: 'ENG-05', recommendation: 'C1', action: 'add-tests',
      reuse: ['test/smoke/port-gap-action-input-dom.test.ts', 'test/smoke/port-gap-action-input-native.test.ts', 'tools/debug/input-inspector.ts'],
      note: '输入栈已有 DOM/native 测试；缺 Canvas/HTML 混合页回归示例' },
    { ier: 'IER-06', original: 'ENG-06', recommendation: 'C2', action: 'missing-materials',
      reuse: ['test/smoke/responsive-host-layout.test.ts', 'examples/responsive-board-recipes'],
      note: '通用容器路径可验；Puzzle50 Oct5 反例材料未取得，只能做通用回归' },
    { ier: 'IER-07', original: 'ENG-07', recommendation: 'D1', action: 'add-tests',
      reuse: ['src/air/session-scope.ts', 'examples/tween-basic', 'test/smoke/port-gap-session-scope.test.ts'],
      note: '单时钟暂停/恢复模式已有；缺形变/相机/滚动时间轴取消专测' },
    { ier: 'IER-08', original: 'ENG-08', recommendation: 'D1', action: 'add-tests',
      reuse: ['test/smoke/port-gap-audio-service.test.ts', 'src/air/audio-service.ts'],
      note: 'AudioService 已有实现与单测；缺 12 落点/Seek/Mute 音画观测组合' },
    { ier: 'IER-09', original: 'ENG-09', recommendation: 'D2', action: 'needs-rerun',
      reuse: ['tools/benchmark', 'test/smoke/smoke-24-benchmark-harness.test.ts'],
      note: 'benchmark 工具已有；设备/质量预算未冻结，实体设备缺失保持待验' },
    { ier: 'IER-10', original: 'ENG-10', recommendation: 'E1', action: 'add-tests',
      reuse: ['tools/debug/input-inspector.ts', 'src/air/action-input.ts', 'docs/reference/k0-r2-native-contracts.md'],
      note: '错误码/inspector 已有；缺五类误用正反例归集' },
    { ier: 'IER-11', original: 'ENG-11', recommendation: 'E2', action: 'needs-rerun',
      reuse: ['npm run verify:consumer', 'npm run verify:tarball-consumer', 'examples/files.json'],
      note: '消费级验证工具已有；随 IER-02+ 示例完成后成批验收' },
];

// ── 产物身份清单 ──
const ARTIFACT_IDENTITY_FILES = [
    'build/cocosair.module.js', 'build/cocosair.module.js.map',
    'build/cocosair.module.min.js', 'build/cocosair.module.min.js.map',
    'build/cocosair.module.d.ts',
    'build/bootstrap.js', 'build/bootstrap.js.map', 'build/bootstrap.d.ts',
    'build/html-source.js', 'build/html-source.d.ts',
    'build/npm/cocosair.module.js', 'build/npm/cocosair.module.min.js',
    'build/npm/bootstrap.js', 'build/npm/html-source.js',
];
// Newly created tools may not yet be tracked by Git. Pin their actual bytes explicitly.
const HARNESS_IDENTITY_FILES = [
    'tools/verify/interactive-improvement-baseline.cjs',
    'tools/verify/interactive-improvement-evidence.cjs',
    'tools/verify/interactive-improvement-browser.cjs',
    'tools/verify/interactive-improvement-evidence-audit.cjs',
];

// source map 抽样比对源文件（覆盖 air 关键面 + 一处 cocos 源）。
const BUILT_FROM_SAMPLE_SOURCES = [
    'src/air/app.ts', 'src/air/bootstrap.ts', 'src/air/action-input.ts',
    'src/air/step-clock.ts', 'src/air/assets/asset-bank.ts',
    'src/cocos/gfx/webgl2/webgl2-pipeline-state.ts',
];

// ── 工具函数 ──
function sha256File (abs) {
    return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
}

/** Read fresh identity even when a long-running consumer calls verify again. */
function candidateSnapshot () {
    return snapshotTool.collectSnapshot({ root: REPO });
}

/** 解析 bundle 末尾 export 语句，得到别名感知的导出名集合。 */
function bundleTopLevelExports (bundlePath) {
    const bundle = fs.readFileSync(bundlePath, 'utf8');
    const m = bundle.match(/export\s*\{([\s\S]*?)\}\s*;\s*(?:\/\/# sourceMappingURL|$)/);
    if (!m) return { names: new Set(), matched: false };
    const names = new Set();
    for (const raw of m[1].split(',')) {
        const entry = raw.trim();
        if (!entry) continue;
        const asMatch = entry.match(/^([\w$]+)\s+as\s+([\w$]+)$/);
        if (asMatch) { names.add(asMatch[1]); names.add(asMatch[2]); } else { names.add(entry); }
    }
    return { names, matched: true };
}

/** dts 声明探测：导出名/成员名以词边界出现（顶层名允许直接声明，成员名要求声明形参/括号）。 */
function declaredInDts (dts, name, requireSignature) {
    const re = requireSignature
        ? new RegExp(`\\b${name}\\s*\\??\\s*[<(:]`, 'm')
        : new RegExp(`\\b${name}\\b`, 'm');
    return re.test(dts);
}

function bundleImplPresent (bundlePath, name) {
    const bundle = fs.readFileSync(bundlePath, 'utf8');
    const re = new RegExp(`\\b${name}\\s*[(<:]`, 'm');
    return re.test(bundle);
}

/** 单个 API 的探测（不涉及测试执行状态）。 */
function detectCapability (api, exportNames, exportMatched, dts, bundlePath) {
    const probe = api.surface || api.name.replace(/^[\w.]*\./, ''); // utils.MeshUtils.createDynamicMesh → createDynamicMesh
    const exportProbe = api.surface || api.name;                    // 顶层导出检查用精确导出名（display 名含括号时用 surface）
    const inExports = exportMatched && exportNames.has(exportProbe);
    const inDts = declaredInDts(dts, probe, api.kind === 'member');
    const implPresent = bundleImplPresent(bundlePath, probe);
    let status;
    if (api.kind === 'top-level') {
        status = inExports && inDts ? CAPABILITY_STATUS.EXPORTED : (inDts ? CAPABILITY_STATUS.DECLARED : CAPABILITY_STATUS.UNCHECKED);
    } else {
        status = inDts && implPresent ? CAPABILITY_STATUS.MEMBER : (inDts ? CAPABILITY_STATUS.DECLARED : CAPABILITY_STATUS.UNCHECKED);
    }
    return { status, detection: { kind: api.kind, inTopLevelExports: inExports, inDts, bundleImpl: implPresent } };
}

/** source map 抽样核对：map.sources 定位 + sourcesContent 与盘面（CRLF 归一）逐字节比较。 */
function checkBuiltFromSampling () {
    const results = [];
    for (const bundleRel of ['build/cocosair.module.js', 'build/cocosair.module.min.js']) {
        const mapRel = bundleRel + '.map';
        const mapAbs = path.join(REPO, mapRel);
        if (!fs.existsSync(mapAbs)) { results.push({ bundle: bundleRel, status: 'UNKNOWN', reason: `map missing: ${mapRel}` }); continue; }
        let map;
        try { map = JSON.parse(fs.readFileSync(mapAbs, 'utf8')); } catch (e) { results.push({ bundle: bundleRel, status: 'UNKNOWN', reason: `map unreadable: ${String(e.message).split('\n')[0]}` }); continue; }
        const stale = [];
        const missing = [];
        for (const file of BUILT_FROM_SAMPLE_SOURCES) {
            const idx = map.sources.findIndex((s) => path.resolve(path.dirname(path.join(REPO, bundleRel)), s) === path.join(REPO, file));
            if (idx < 0) { missing.push(file); continue; }
            const disk = fs.readFileSync(path.join(REPO, file), 'utf8').replace(/\r\n/g, '\n');
            const inMap = String(map.sourcesContent[idx]).replace(/\r\n/g, '\n');
            if (disk !== inMap) stale.push(file);
        }
        const status = stale.length === 0 && missing.length === 0 ? 'verified-sampled' : 'stale';
        results.push({ bundle: bundleRel, status, sampled: BUILT_FROM_SAMPLE_SOURCES.length, stale, missingFromMap: missing });
    }
    return results;
}

/** 轻量当前身份（CLI --verify 用；不依赖完整 snapshot）。 */
function currentIdentity () {
    const snap = candidateSnapshot();
    const read = (rel) => {
        const abs = path.join(REPO, rel);
        if (!fs.existsSync(abs)) return { present: false };
        const buf = fs.readFileSync(abs);
        return { present: true, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
    };
    return {
        appCommit: snap.git.head,
        sdkModule: read('build/cocosair.module.js'),
        sdkTypes: read('build/cocosair.module.d.ts'),
        npmModule: read('build/npm/cocosair.module.js'),
        minModule: read('build/cocosair.module.min.js'),
        bootstrap: read('build/bootstrap.js'),
    };
}

// ── 主体 ──
function buildBaseline () {
    const snap = candidateSnapshot();
    const bundlePath = path.join(REPO, 'build/cocosair.module.js');
    const dtsPath = path.join(REPO, 'build/cocosair.module.d.ts');
    const dts = fs.readFileSync(dtsPath, 'utf8');
    const { names: exportNames, matched: exportMatched } = bundleTopLevelExports(bundlePath);

    const sdkModuleSha256 = sha256File(bundlePath);
    const sdkTypesSha256 = sha256File(dtsPath);

    const capabilities = INVENTORY_APIS.map((api) => {
        const detected = detectCapability(api, exportNames, exportMatched, dts, bundlePath);
        const testFiles = api.tests.filter((t) => fs.existsSync(path.join(REPO, t)));
        return {
            name: api.name,
            status: detected.status,                    // 永不为 tested-passed（默认）
            detection: detected.detection,
            testAvailable: testFiles.length > 0,        // 仅表示测试文件存在
            testFiles,
            testExecution: TEST_EXECUTION.NOT_RUN,      // 未绑定执行报告，一律 NOT_RUN
            evidenceSource: `bundle SHA ${sdkModuleSha256.slice(0, 12)} export 语句 + dts 声明`,
        };
    });

    const artifacts = {};
    for (const rel of ARTIFACT_IDENTITY_FILES) {
        const abs = path.join(REPO, rel);
        if (fs.existsSync(abs)) {
            const buf = fs.readFileSync(abs);
            artifacts[rel] = { present: true, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
        } else {
            artifacts[rel] = { present: false, status: 'MISSING' };
        }
    }

    return {
        schemaVersion: SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        appCommit: snap.git.head,
        git: { head: snap.git.head, branch: snap.git.branch, dirty: snap.git.dirty, dirtyDigest: snap.git.dirtyDigest },
        airIdentityInputs: { digest: snap.airIdentityInputs.identityInputsDigest, airFeatures: snap.airIdentityInputs.airFeatures, airOutDir: snap.airIdentityInputs.airOutDir || null },
        groupDigests: Object.fromEntries(Object.entries(snap.groups).map(([k, g]) => [k, g.digest])),
        candidateSnapshotId: snap.snapshotId,
        sdkModuleSha256,
        sdkTypesSha256,
        npmModuleSha256: artifacts['build/npm/cocosair.module.js'].present ? artifacts['build/npm/cocosair.module.js'].sha256 : null,
        artifactIdentity: artifacts,
        harnessIdentity: Object.fromEntries(HARNESS_IDENTITY_FILES.map(file => {
            const bytes = fs.readFileSync(path.join(REPO, file));
            return [file, { bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }];
        })),
        builtFrom: checkBuiltFromSampling(),
        capabilities,
        dedupTable: DEDUP_TABLE.map((row) => ({ ...row, reusePathsExist: row.reuse.every((p) => p.startsWith('npm run ') || fs.existsSync(path.join(REPO, p))) })),
        historicalDedup: {
            taskDocModuleSha256: TASK_DOC_MODULE_SHA256,
            currentModuleDiffers: sdkModuleSha256 !== TASK_DOC_MODULE_SHA256,
            note: '任务书 Oct6 模块 f6836f60… 与当前模块不同→任务书存在性确认不可继承为当前 PASS；若未来相同，仅说明字节一致，仍不等于行为验收',
        },
        missingEvidence: [
            { item: '原 21 项原始 JSON（含 17 evidence/dom-repro-report.json）', status: 'MISSING', reason: '云端目录在只读评估时不可读' },
            { item: 'Puzzle50 Oct6 resize 原反例回归', status: 'NOT_RUN', reason: '原始反例材料未取得' },
            { item: '两个私有 Site 入口 HTTP 状态', status: 'UNKNOWN', reason: '只读评估时无法由工具读取' },
            { item: '原任务 1.4 节历史事实', status: 'TASK_DOC_REFERENCE', reason: '标注任务书引用，未独立核验' },
        ],
    };
}

/** 用与当前身份绑定的执行报告升级能力状态（唯一的 tested-passed 来源）。 */
function applyExecutionReport (baseline, execReport) {
    if (!baseline || baseline.schemaVersion !== SCHEMA_VERSION) return { upgraded: false, reason: 'baseline schema mismatch' };
    if (!execReport || typeof execReport !== 'object') return { upgraded: false, reason: 'execution report missing' };
    const identity = execReport.identity || {};
    if (identity.sdkModuleSha256 !== baseline.sdkModuleSha256) {
        return { upgraded: false, reason: `identity mismatch: exec=${String(identity.sdkModuleSha256).slice(0, 8)} baseline=${baseline.sdkModuleSha256.slice(0, 8)}` };
    }
    if (identity.appCommit && baseline.appCommit && identity.appCommit !== baseline.appCommit) {
        return { upgraded: false, reason: `app commit mismatch: exec=${String(identity.appCommit).slice(0, 8)} baseline=${baseline.appCommit.slice(0, 8)}` };
    }
    const suites = Array.isArray(execReport.suites) ? execReport.suites : [];
    const passing = new Set(suites.filter((s) => s && s.exitCode === 0 && (s.testsTotal ?? 0) > 0 && s.testsTotal === s.testsPassed).map((s) => s.file));
    let count = 0;
    for (const cap of baseline.capabilities) {
        if (cap.testFiles.some((f) => passing.has(f)) && cap.testAvailable) {
            cap.status = CAPABILITY_STATUS.TESTED;
            cap.testExecution = { status: 'PASS', suites: cap.testFiles.filter((f) => passing.has(f)) };
            count += 1;
        } else {
            cap.testExecution = { status: 'NOT_COVERED_OR_FAILED', suites: cap.testFiles.filter((f) => suites.some((s) => s.file === f)) };
        }
    }
    return { upgraded: count, reason: null };
}

/** 校验报告：格式完整 + 与当前盘面身份一致（HEAD/AIR/组摘要/产物）。 */
function verifyBaseline (report, options = {}) {
    const failures = [];
    try {
        if (!report || typeof report !== 'object') return { ok: false, failures: ['report missing'] };
        if (report.schemaVersion !== SCHEMA_VERSION) return { ok: false, failures: [`schema mismatch: ${String(report.schemaVersion)} != ${SCHEMA_VERSION}`] };
        const current = buildBaseline();
        if (options.executionReport) applyExecutionReport(current, options.executionReport);
        for (const field of ['sdkModuleSha256', 'sdkTypesSha256', 'npmModuleSha256']) {
            if (report[field] !== current[field]) failures.push(`flat identity drift: ${field}`);
        }
        for (const file of HARNESS_IDENTITY_FILES) {
            const expected = current.harnessIdentity[file], recorded = report.harnessIdentity?.[file];
            if (!recorded || recorded.bytes !== expected.bytes || recorded.sha256 !== expected.sha256) failures.push(`harness identity drift: ${file}`);
        }
        if (report.appCommit !== current.appCommit) failures.push(`HEAD drift: report=${String(report.appCommit).slice(0, 8)} current=${current.appCommit.slice(0, 8)}`);
        if (report.git?.dirtyDigest !== current.git.dirtyDigest) failures.push('working tree dirtyDigest drift');
        if (report.airIdentityInputs?.digest !== current.airIdentityInputs.digest) failures.push('AIR identity inputs digest drift');
        for (const group of ['source', 'config', 'runner', 'contracts', 'artifacts']) {
            if (report.groupDigests?.[group] !== current.groupDigests[group]) failures.push(`group digest drift: ${group}`);
        }
        for (const rel of Object.keys(current.artifactIdentity)) {
            const cur = current.artifactIdentity[rel];
            const old = report.artifactIdentity?.[rel];
            if (!old) { failures.push(`artifact identity missing: ${rel}`); continue; }
            if (cur.present !== true) { if (old.present !== false) failures.push(`artifact presence drift: ${rel}`); continue; }
            if (old.sha256 !== cur.sha256 || old.bytes !== cur.bytes) failures.push(`artifact drift: ${rel}`);
        }
        // 默认能力状态不得出现 tested-passed（除非升级路径显式调用过；verify 按当前身份重算）
        if (!Array.isArray(report.capabilities) || report.capabilities.length !== INVENTORY_APIS.length) {
            failures.push(`capabilities incomplete: ${Array.isArray(report.capabilities) ? report.capabilities.length : 'missing'} != ${INVENTORY_APIS.length}`);
        } else {
            for (const expected of current.capabilities) {
                const recorded = report.capabilities.filter(c => c?.name === expected.name);
                if (recorded.length !== 1 || recorded[0].status !== expected.status) failures.push(`unattested capability state: ${expected.name}`);
            }
        }
        if (report.historicalDedup?.taskDocModuleSha256 !== TASK_DOC_MODULE_SHA256) failures.push('historical taskDoc SHA mismatch');
        // 未知历史状态诚实即可：currentModuleDiffers 只要是布尔就接受（不要求永远为 true）
        if (typeof report.historicalDedup?.currentModuleDiffers !== 'boolean') failures.push('currentModuleDiffers not boolean');
        return { ok: failures.length === 0, failures };
    } catch (e) {
        return { ok: false, failures: [`verify crashed: ${String(e.message).split('\n')[0]}`] };
    }
}

module.exports = {
    buildBaseline, verifyBaseline, applyExecutionReport, currentIdentity,
    INVENTORY_APIS, CAPABILITY_STATUS, DEDUP_TABLE, TASK_DOC_MODULE_SHA256, SCHEMA_VERSION,
};

if (require.main === module) {
    const outArg = process.argv.find((a) => a.startsWith('--out='));
    const verifyArg = process.argv.find((a) => a.startsWith('--verify='));
    if (verifyArg) {
        let report;
        try { report = JSON.parse(fs.readFileSync(verifyArg.slice(9), 'utf8')); } catch (e) {
            console.error(JSON.stringify({ ok: false, failures: [`report unreadable: ${String(e.message).split('\n')[0]}`] }));
            process.exit(1);
        }
        const result = verifyBaseline(report);
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.ok ? 0 : 1);
    } else if (outArg) {
        const out = path.resolve(REPO, outArg.slice(6));
        if (fs.existsSync(out)) { console.error(`refusing to overwrite: ${out}`); process.exit(2); }
        const baseline = buildBaseline();
        fs.writeFileSync(out, JSON.stringify(baseline, null, 2), { flag: 'wx' });
        console.log(JSON.stringify({ written: out, capabilities: baseline.capabilities.length, testedPassedByDefault: baseline.capabilities.filter((c) => c.status === 'tested-passed').length }));
    } else {
        console.error('usage: --out=<new.json> | --verify=<report.json>');
        process.exit(2);
    }
}
