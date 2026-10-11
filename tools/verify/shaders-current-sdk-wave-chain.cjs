'use strict';
// Current-SDK wave chain adapter: validates NEW leaf gates (recomputed from real artifact
// bytes against production collectors/validators) and wave gates (recursive previous-wave
// chain). The Lead drives every browser/performance execution; this module never launches.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const fp = (file) => {
    const data = fs.readFileSync(path.resolve(ROOT, file));
    return {
        path: path.relative(ROOT, path.resolve(ROOT, file)).replace(/\\/g, '/'),
        bytes: data.length,
        sha256: crypto.createHash('sha256').update(data).digest('hex'),
    };
};
const sdkFingerprints = () =>
    ['build/cocosair.module.js', 'build/cocosair.module.d.ts', 'build/npm/cocosair.module.js'].map(fp);
const readJSON = (file) => JSON.parse(fs.readFileSync(path.resolve(ROOT, file), 'utf8'));

// ── Leaf inventory: schemas from HISTORICAL valid gates; production leaf gate validators ──
const WAVE2_LEAVES = Object.freeze([
    {
        id: 'E03',
        example: 'shader-holographic',
        browser: 'shaders-holographic-browser.cjs',
        identityExport: 'currentIdentity',
        validator: 'validateFiles',
        gateSchema: 'e03-holographic-current-gate/1',
        newGate: 'docs/evidence/shaders-absorption/e03-holographic-current-sdk-r2-gate.json',
        leafGateValidator: 'shaders-wave2-gate.cjs',
    },
    {
        id: 'E04',
        example: 'shader-neon',
        browser: 'shaders-neon-browser.cjs',
        identityExport: 'currentIdentity',
        validator: 'validateFiles',
        gateSchema: 'e04-neon-current-gate/1',
        newGate: 'docs/evidence/shaders-absorption/e04-neon-current-sdk-r2-gate.json',
        leafGateValidator: 'shaders-wave2-gate.cjs',
    },
    {
        id: 'E05',
        example: 'shader-emboss',
        browser: 'shaders-emboss-browser.cjs',
        identityExport: 'currentIdentity',
        validator: 'validateFiles',
        gateSchema: 'e05-emboss-current-gate/1',
        newGate: 'docs/evidence/shaders-absorption/e05-emboss-current-sdk-r2-gate.json',
        leafGateValidator: 'shaders-wave2-gate.cjs',
    },
]);
const WAVE3_LEAVES = Object.freeze([
    {
        id: 'E07',
        example: 'shader-liquid-metal',
        browser: 'shaders-liquid-metal-browser.cjs',
        identityExport: 'currentIdentity',
        validator: 'validateFiles',
        gateSchema: 'e07-liquid-metal-current-gate/1',
        newGate: 'docs/evidence/shaders-absorption/e07-liquid-metal-current-sdk-r2-gate.json',
        leafGateValidator: 'shaders-wave3-gate.cjs',
    },
    {
        id: 'E08',
        example: 'shader-cursor-trail',
        browser: 'shaders-cursor-trail-browser.cjs',
        identityExport: 'currentIdentity',
        validator: 'validateFiles',
        gateSchema: 'e08-cursor-trail-current-gate/1',
        newGate: 'docs/evidence/shaders-absorption/e08-cursor-trail-current-sdk-r2-gate.json',
        leafGateValidator: 'shaders-cursor-trail-gate.cjs',
    },
    {
        id: 'E09',
        example: 'shader-glass',
        browser: 'shaders-glass-browser.cjs',
        identityExport: 'currentIdentity',
        validator: 'validateFiles',
        gateSchema: 'e09-glass-current-gate/1',
        newGate: 'docs/evidence/shaders-absorption/e09-glass-current-sdk-r2-gate.json',
        leafGateValidator: 'shaders-glass-gate.cjs',
    },
]);
const WAVES = Object.freeze({
    wave2: { schema: 'shaders-wave2/1', leaves: WAVE2_LEAVES },
    wave3: { schema: 'shaders-wave3/1', leaves: WAVE3_LEAVES },
});

function expectedArtifacts(prefix, leafId, phase) {
    const base = `${prefix}-${leafId.toLowerCase()}-${phase}`;
    return { report: `${base}.json`, log: `${base}.log`, os: `${base}-os.json`, frozen: `${base}-driver-frozen.json` };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
function verifyFingerprint(record) {
    if (!object(record) || typeof record.path !== 'string') throw Error('artifact fingerprint required');
    if (!same(record, fp(record.path))) throw Error('artifact drift: ' + record.path);
}
function validateOSReceipt(osPath, rawReportPath) {
    try {
        const os = readJSON(osPath),
            errors = [];
        if (!object(os)) return ['OS receipt object required'];
        if (os.exitCode !== 0 || os.signal !== null || os.error !== null || os.inputsUnchanged !== true)
            errors.push('OS natural exit/input identity');
        if (
            !Array.isArray(os.command) ||
            os.command.length < 4 ||
            !os.command.every((s) => typeof s === 'string') ||
            !os.command.includes('--out=' + rawReportPath) ||
            !os.command.includes('--browser=all')
        )
            errors.push('OS command/report identity');
        if (os.output !== rawReportPath || path.resolve(os.cwd || '.') !== ROOT || typeof os.log !== 'string')
            errors.push('OS output/cwd/log identity');
        const start = Date.parse(os.startedAt),
            end = Date.parse(os.endedAt);
        if (!Number.isFinite(start) || !Number.isFinite(end) || !(end > start)) errors.push('OS time interval');
        return errors;
    } catch (error) {
        return ['OS receipt: ' + error.message];
    }
}
function screenshotsOf(leaf, functional) {
    return functional.engines.flatMap((e) => [
        ...e.captures.map((c) => c.png),
        ...(leaf.id === 'E08' ? [e.normal.pointerPNG, e.touch.png] : []),
        e.resize.png,
        ...(['E03', 'E07'].includes(leaf.id) ? [e.temporal.a.png, e.temporal.b.png] : []),
    ]);
}
function leafScope(leaf, functional, performance) {
    const rows = functional.engines;
    return {
        engines: rows.length,
        dimensionRows: rows.length * 6,
        visualCases: rows.reduce((n, e) => n + e.captures.length, 0),
        boundaryCases: rows.reduce((n, e) => n + e.boundaries.length, 0),
        malformedAtomicRejections: rows.reduce((n, e) => n + e.invalids.length, 0),
        resourceCycles: rows.reduce((n, e) => n + e.resources.rows.length, 0),
        liveResize: rows.filter((e) => e.resize).length,
        ...(leaf.id === 'E08'
            ? { trustedPointerCases: rows.length, trustedTouchCases: rows.filter((e) => e.touch).length }
            : {}),
        screenshots: screenshotsOf(leaf, functional).length,
        performanceProfiles: performance.engines.reduce((n, e) => n + e.performance.length, 0),
    };
}
function validateLeafMetadata(leaf, gate, actual) {
    const errors = [];
    if (!object(gate) || !object(actual)) return { ok: false, errors: ['leaf metadata object required'] };
    for (const key of ['counts', 'sdk', 'validatorInputs', 'verifier', 'audit'])
        if (!same(gate[key], actual[key])) errors.push(key + ': measured mismatch');
    if (!same(gate.gates?.Visual?.screenshots, actual.screenshots)) errors.push('exact PNG scope');
    if (
        gate.schemaVersion !== leaf.gateSchema ||
        gate.task !== (WAVE2_LEAVES.some((l) => l.id === leaf.id) ? 'Wave2/' : 'Wave3/') + leaf.id ||
        gate.status !== 'PASS' ||
        gate.agentGate !== 'NOT_RUN' ||
        gate.subset !== true ||
        gate.completed !== false
    )
        errors.push('leaf schema/status/isolation');
    for (const name of ['Build', 'Runtime', 'Visual', 'Boundary', 'Resource', 'Performance'])
        if (gate.gates?.[name]?.status !== 'PASS') errors.push(name + ': not measured');
    if (actual.validation?.ok !== true) errors.push('production leaf validation failed');
    return { ok: errors.length === 0, errors };
}
function validateLeafGate(leaf, gate) {
    const errors = [];
    try {
        if (!object(gate) || !Array.isArray(gate.bindings) || gate.bindings.length !== 2)
            return { ok: false, errors: ['two leaf bindings required'] };
        const C = require(path.resolve(__dirname, leaf.browser));
        const G = require(path.resolve(__dirname, leaf.leafGateValidator));
        const result = G.validateGate(gate);
        if (result?.ok !== true) errors.push(...(result?.errors || ['production validator unavailable']));
        const reports = {};
        for (const binding of gate.bindings) {
            for (const key of ['report', 'osReceipt', 'log', 'frozen']) verifyFingerprint(binding[key]);
            const raw = readJSON(binding.report.path),
                os = readJSON(binding.osReceipt.path),
                frozen = readJSON(binding.frozen.path);
            errors.push(...validateOSReceipt(binding.osReceipt.path, binding.report.path));
            if (!['functional', 'performance'].includes(raw.phase) || reports[raw.phase])
                errors.push('exact two distinct phases required');
            if (binding.phase !== undefined && binding.phase !== raw.phase) errors.push('phase label mismatch');
            if (
                !os.command.includes('--phase=' + raw.phase) ||
                os.command[1] !== 'tools/verify/' + leaf.browser ||
                os.log !== binding.log.path
            )
                errors.push('collector/phase/log mismatch');
            if (
                !same(frozen, C.currentIdentity()) ||
                !same(frozen, raw.identity || { inputs: raw.inputs, reference: raw.reference })
            )
                errors.push('pre-collection closure/reference drift');
            reports[raw.phase] = raw;
        }
        if (!reports.functional || !reports.performance) throw Error('both phases required');
        const audit = readJSON(gate.audit.path);
        verifyFingerprint(gate.audit);
        if (
            audit.baselinesAccepted?.functional !== true ||
            audit.baselinesAccepted?.performance !== true ||
            audit.browserRunsAdded !== 0 ||
            !Array.isArray(audit.rows) ||
            audit.rows.length < 20 ||
            audit.rejected !== audit.rows.length ||
            audit.rows.some((r) => r?.rejected !== true || !Array.isArray(r.errors) || !r.errors.length) ||
            new Set(audit.rows.map((r) => r.name)).size !== audit.rows.length ||
            !same(
                audit.inputs,
                gate.bindings.map((b) => b.report),
            )
        )
            errors.push('accepted-baseline actual mutation audit');
        const actual = {
            counts: leafScope(leaf, reports.functional, reports.performance),
            sdk: sdkFingerprints(),
            validatorInputs: C.currentIdentity(),
            verifier: fp('tools/verify/' + leaf.leafGateValidator),
            audit: fp(gate.audit.path),
            screenshots: screenshotsOf(leaf, reports.functional),
            validation: result,
        };
        errors.push(...validateLeafMetadata(leaf, gate, actual).errors);
    } catch (error) {
        errors.push('leaf closure: ' + error.message);
    }
    return { ok: errors.length === 0, errors };
}
function previousPath(waveId) {
    return (
        'docs/evidence/shaders-absorption/' +
        (waveId === 'wave2' ? 'wave1-current-sdk-r2-gate.json' : 'wave2-current-sdk-r3-gate.json')
    );
}
function closureInputs(waveId) {
    return [
        ...new Set([
            'tools/verify/shaders-current-sdk-wave-chain.cjs',
            'tools/verify/shaders-wave1-gate.cjs',
            'tools/verify/shaders-wave2-gate.cjs',
            ...(waveId === 'wave3'
                ? [
                      'tools/verify/shaders-wave3-gate.cjs',
                      'tools/verify/shaders-cursor-trail-gate.cjs',
                      'tools/verify/shaders-glass-gate.cjs',
                  ]
                : []),
        ]),
    ].map(fp);
}
function validateWaveMetadata(waveId, report, actual) {
    const errors = [],
        wave = WAVES[waveId];
    if (!wave || !object(report) || !object(actual)) return { ok: false, errors: ['wave metadata object required'] };
    for (const key of [
        'effects',
        'previousWave',
        'verifier',
        'scope',
        'sdk',
        'screenshots',
        'screenshotCount',
        'actualAuditBindings',
        'closureInputs',
    ])
        if (!same(report[key], actual[key])) errors.push(key + ': measured mismatch');
    if (
        report.schemaVersion !== wave.schema ||
        report.task !== (waveId === 'wave2' ? 'Wave2' : 'Wave3') ||
        report.status !== 'PASS' ||
        report.waveCompleted !== true ||
        report.nextWaveEligible !== true ||
        report.projectCompleted !== false ||
        report.agentGate !== 'NOT_RUN' ||
        report.independentGalleryGate !== 'NOT_RUN' ||
        report.subset !== true ||
        report.completed !== false ||
        !Number.isFinite(Date.parse(report.evaluatedAt))
    )
        errors.push('wave/project/Agent/Gallery isolation');
    if (
        !same(
            report.effects?.map((e) => e?.path),
            wave.leaves.map((l) => l.newGate),
        )
    )
        errors.push('exact ordered leaf set');
    if (report.previousWave?.path !== previousPath(waveId)) errors.push('exact current-SDK predecessor required');
    if (
        actual.validation?.ok !== true ||
        actual.previousValidation?.ok !== true ||
        actual.leafResults?.some((r) => r.ok !== true)
    )
        errors.push('production predecessor/leaf validation failed');
    if (!Array.isArray(actual.intervals) || actual.intervals.length !== 6) errors.push('six OS intervals required');
    else {
        const intervals = [...actual.intervals].sort((a, b) => a.start - b.start);
        if (
            intervals.some(
                (v, i) =>
                    !Number.isFinite(v.start) ||
                    !Number.isFinite(v.end) ||
                    v.end <= v.start ||
                    (i > 0 && v.start < intervals[i - 1].end),
            )
        )
            errors.push('invalid or overlapping OS intervals');
    }
    return { ok: errors.length === 0, errors };
}
function assessWave(waveId, report) {
    const wave = WAVES[waveId];
    if (!wave || !object(report)) throw Error('wave object required');
    const B = require(waveId === 'wave2' ? './shaders-wave2-gate.cjs' : './shaders-wave3-gate.cjs');
    const gates = wave.leaves.map((l) => readJSON(l.newGate));
    const effects = wave.leaves.map((l) => fp(l.newGate));
    const previousWave = fp(previousPath(waveId)),
        previous = readJSON(previousWave.path);
    const previousValidation =
        waveId === 'wave2'
            ? require('./shaders-wave1-gate.cjs').validateReport(previous)
            : validateWaveGate('wave2', previous);
    const leafResults = gates.map((g, i) => validateLeafGate(wave.leaves[i], g));
    const validation = B.validateWaveReport(report);
    const shots = gates.flatMap((g) => g.gates.Visual.screenshots);
    const intervals = gates.flatMap((g) =>
        g.bindings.map((b) => {
            const o = readJSON(b.osReceipt.path);
            return { start: Date.parse(o.startedAt), end: Date.parse(o.endedAt) };
        }),
    );
    return {
        effects,
        previousWave,
        verifier: fp('tools/verify/' + (waveId === 'wave2' ? 'shaders-wave2-gate.cjs' : 'shaders-wave3-gate.cjs')),
        scope: B.waveScope(gates),
        sdk: sdkFingerprints(),
        screenshots: waveId === 'wave2' ? shots.length : shots,
        screenshotCount: shots.length,
        actualAuditBindings: gates.map((g) => g.audit),
        closureInputs: closureInputs(waveId),
        leafResults,
        validation,
        previousValidation,
        intervals,
    };
}
function validateWaveGate(waveId, report) {
    try {
        const actual = assessWave(waveId, report);
        const checked = validateWaveMetadata(waveId, report, actual);
        const errors = [
            ...checked.errors,
            ...(actual.validation.errors || []),
            ...(actual.previousValidation.errors || []),
            ...actual.leafResults.flatMap((r) => r.errors),
        ];
        return { ok: errors.length === 0, errors };
    } catch (error) {
        return { ok: false, errors: ['current-SDK wave closure: ' + error.message] };
    }
}
module.exports = {
    WAVE2_LEAVES,
    WAVE3_LEAVES,
    WAVES,
    expectedArtifacts,
    validateOSReceipt,
    screenshotsOf,
    leafScope,
    validateLeafMetadata,
    validateLeafGate,
    validateWaveMetadata,
    validateWaveGate,
    assessWave,
    closureInputs,
    previousPath,
    sdkFingerprints,
    fp,
};
if (require.main === module) {
    try {
        const waveId = process.argv.find((a) => a.startsWith('--wave='))?.slice(7);
        const file = process.argv.find((a) => a.startsWith('--verify='))?.slice(9);
        const result = validateWaveGate(waveId, readJSON(file));
        console.log(JSON.stringify(result));
        process.exitCode = result.ok ? 0 : 1;
    } catch (error) {
        console.log(JSON.stringify({ ok: false, errors: [error.message] }));
        process.exitCode = 1;
    }
}
