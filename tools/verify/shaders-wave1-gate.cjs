'use strict';
// Read-only Wave 1 gate: independently validates current captures, never rewrites leaf results.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../..');
const ENGINES = ['chromium', 'firefox', 'webkit'];
const GATES = ['Build', 'Runtime', 'Visual', 'Boundary', 'Resource', 'Performance'];
const IDS = [
    'e01-functional',
    'e02-functional',
    'e06-functional',
    'e01-performance',
    'e02-performance',
    'e06-performance',
    'gallery',
];
const VALIDATOR_INPUTS = [
    'shaders-wave1-gate.cjs',
    'shaders-noise-dissolve.cjs',
    'shaders-noise-dissolve-oracle.cjs',
    'shaders-thin-film-browser.cjs',
    'shaders-thin-film-evidence.cjs',
    'shaders-thin-film-oracle.cjs',
    'shaders-sparkle-browser.cjs',
    'shaders-sparkle-oracle.cjs',
    'shaders-noise-dissolve-environment-performance.cjs',
    'shaders-sparkle-environment-performance.cjs',
    'shaders-browser-environment.cjs',
    'shaders-browser-launch.cjs',
    'shaders-gallery-lifecycle.cjs',
    'shaders-effect-contract.cjs',
].map((name) => 'tools/verify/' + name);

function validateValidatorInputs(inputs) {
    if (
        !Array.isArray(inputs) ||
        inputs.length !== VALIDATOR_INPUTS.length ||
        new Set(inputs.map((v) => v?.path)).size !== VALIDATOR_INPUTS.length
    )
        return ['validator input closure'];
    const errors = [];
    for (const file of VALIDATOR_INPUTS) {
        try {
            const recorded = inputs.find((v) => v?.path === file),
                actual = identity(file);
            if (!recorded || recorded.sha256 !== actual.sha256 || recorded.bytes !== actual.bytes)
                errors.push('validator drift: ' + file);
        } catch (error) {
            errors.push(file + ': ' + error.message);
        }
    }
    return errors;
}

function identity(file) {
    const absolute = path.resolve(ROOT, file);
    const bytes = fs.readFileSync(absolute);
    return {
        path: path.relative(ROOT, absolute).replaceAll('\\', '/'),
        bytes: bytes.length,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    };
}

function validateBindings(bindings) {
    const errors = [],
        reports = {};
    if (
        !Array.isArray(bindings) ||
        bindings.length !== IDS.length ||
        new Set(bindings.map((b) => b?.id)).size !== IDS.length
    )
        return { errors: ['seven unique report bindings required'], reports };
    for (const id of IDS) {
        const binding = bindings.find((b) => b?.id === id);
        try {
            if (!binding || !binding.path || !Number.isSafeInteger(binding.bytes)) throw Error('missing binding');
            const actual = identity(binding.path);
            if (actual.sha256 !== binding.sha256 || actual.bytes !== binding.bytes) throw Error('SHA/bytes drift');
            reports[id] = JSON.parse(fs.readFileSync(path.resolve(ROOT, binding.path), 'utf8'));
        } catch (error) {
            errors.push(`${id}: ${error.message}`);
        }
    }
    return { errors, reports };
}

function evaluate(bindings) {
    const { errors, reports } = validateBindings(bindings),
        rows = [];
    if (errors.length) return { ok: false, errors, rows };
    const N = require('./shaders-noise-dissolve.cjs');
    const F = require('./shaders-thin-film-browser.cjs');
    const FE = require('./shaders-thin-film-evidence.cjs');
    const S = require('./shaders-sparkle-browser.cjs');
    const NP = require('./shaders-noise-dissolve-environment-performance.cjs');
    const SP = require('./shaders-sparkle-environment-performance.cjs');
    const GL = require('./shaders-gallery-lifecycle.cjs');
    const validators = {
        'e01-functional': N.validateReport,
        'e02-functional': F.validateFiles,
        'e06-functional': S.validateReport,
        'e01-performance': NP.validateFiles,
        'e02-performance': F.validateFiles,
        'e06-performance': SP.validateFiles,
        gallery: GL.validateFiles,
    };
    for (const id of IDS) {
        try {
            const checked = validators[id](reports[id]);
            if (!checked.ok) errors.push({ id, errors: checked.errors });
            if (id.startsWith('e02') && reports[id].phase !== id.slice(4)) errors.push(`${id}: wrong phase`);
        } catch (error) {
            errors.push(`${id}: validator error ${error.message}`);
        }
    }
    if (errors.length) return { ok: false, errors, rows };
    for (const effect of ['e01', 'e02', 'e06']) {
        const functional = reports[`${effect}-functional`],
            performance = reports[`${effect}-performance`];
        const actual =
            effect === 'e02' ? functional.requestedEngines : functional.engines.map((e) => e.engine || e.browser);
        if (JSON.stringify(actual) !== JSON.stringify(ENGINES)) errors.push(`${effect}: functional engine scope`);
        for (const engine of ENGINES) {
            const f = functional.engines.find((e) => (e.engine || e.browser) === engine);
            for (const gate of GATES) {
                let checked, cases;
                if (effect === 'e02') {
                    checked = FE.checkScoped(gate === 'Performance' ? performance : functional, gate, engine);
                    cases = FE.SCOPE[gate].length;
                } else if (gate === 'Performance') {
                    const p = performance.rows.filter((r) => r.browser === engine);
                    checked = { ok: p.length === 3 && p.every((r) => r.status === 'PASS'), errors: [] };
                    cases = p.length;
                } else {
                    const g = (f?.report || f)?.gates?.[gate];
                    checked = { ok: g?.status === 'PASS' && g.cases.every((c) => c.status === 'PASS'), errors: [] };
                    cases = g?.cases?.length || 0;
                }
                if (!checked.ok) errors.push({ effect, engine, gate, errors: checked.errors });
                rows.push({ effect, engine, gate, status: checked.ok ? 'PASS' : 'FAIL', cases });
            }
            const p =
                effect === 'e02'
                    ? performance.engines.find((r) => r.engine === engine)
                    : performance.rows.find((r) => r.browser === engine);
            if (!f?.browserVersion || p?.browserVersion !== f.browserVersion)
                errors.push(`${effect}/${engine}: browser version mismatch`);
        }
    }
    // All leaf identities are verified against current disk above, including source and SDK.
    return {
        ok: errors.length === 0,
        errors,
        rows,
        measuredCases: rows.reduce((sum, r) => sum + r.cases, 0),
        galleryRows: reports.gallery.rows.length,
    };
}

function validateExecution(bindings, executions) {
    const errors = [],
        observed = [];
    if (
        !Array.isArray(executions) ||
        executions.length !== IDS.length ||
        new Set(executions.map((e) => e?.id)).size !== IDS.length
    )
        return ['seven OS execution receipts required'];
    for (const id of IDS) {
        try {
            const record = executions.find((e) => e?.id === id);
            const actual = identity(record.path),
                log = identity(record.log.path);
            if (
                actual.sha256 !== record.sha256 ||
                actual.bytes !== record.bytes ||
                log.sha256 !== record.log.sha256 ||
                log.bytes !== record.log.bytes
            )
                throw Error('receipt/log drift');
            const receipt = JSON.parse(fs.readFileSync(path.resolve(ROOT, record.path), 'utf8'));
            const report = bindings.find((b) => b.id === id);
            if (
                receipt.id !== id ||
                receipt.exitCode !== 0 ||
                receipt.signal !== null ||
                receipt.error !== null ||
                path.resolve(ROOT, receipt.output) !== path.resolve(ROOT, report.path) ||
                !Array.isArray(receipt.command) ||
                !receipt.command.includes('--out=' + receipt.output) ||
                path.resolve(receipt.cwd) !== ROOT ||
                path.resolve(ROOT, receipt.log) !== path.resolve(ROOT, record.log.path)
            )
                throw Error('actual command/exit/output identity');
            const start = Date.parse(receipt.startedAt),
                end = Date.parse(receipt.endedAt);
            if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw Error('actual timing');
            observed.push({ start, end });
        } catch (error) {
            errors.push(`${id}: ${error.message}`);
        }
    }
    observed.sort((a, b) => a.start - b.start);
    if (observed.some((item, index) => index > 0 && item.start < observed[index - 1].end))
        errors.push('collector execution windows overlap');
    return errors;
}

function validateReport(report) {
    try {
        if (!report || report.schemaVersion !== 'shaders-wave1-current-gate/1' || report.wave !== 1)
            return { ok: false, errors: ['wave schema'] };
        const checked = evaluate(report.bindings);
        checked.errors.push(...validateExecution(report.bindings, report.executions));
        checked.errors.push(...validateValidatorInputs(report.validatorInputs));
        checked.ok = checked.errors.length === 0;
        if (report.agentGate !== 'NOT_RUN' || report.projectCompleted !== false)
            checked.errors.push('project/Agent scope');
        if (
            report.status !== (checked.ok ? 'PASS' : 'FAIL') ||
            report.waveCompleted !== checked.ok ||
            report.nextWaveEligible !== checked.ok
        )
            checked.errors.push('derived Wave status mismatch');
        if (
            JSON.stringify(report.rows) !== JSON.stringify(checked.rows) ||
            report.measuredCases !== checked.measuredCases ||
            report.galleryRows !== checked.galleryRows
        )
            checked.errors.push('derived coverage mismatch');
        if (report.verifier?.sha256 !== identity(__filename).sha256) checked.errors.push('verifier drift');
        return { ...checked, ok: checked.errors.length === 0 };
    } catch (error) {
        return { ok: false, errors: [`invalid report: ${error.message}`] };
    }
}

function main(argv = process.argv.slice(2)) {
    const argument = (key) => argv.find((v) => v.startsWith(`--${key}=`))?.slice(key.length + 3);
    const verify = argument('verify');
    if (verify) {
        const result = validateReport(JSON.parse(fs.readFileSync(path.resolve(ROOT, verify), 'utf8')));
        console.log(JSON.stringify(result));
        return result.ok ? 0 : 1;
    }
    const input = argument('bindings'),
        output = argument('out');
    if (!input || !output || fs.existsSync(output)) throw Error('Use --bindings=<paths.json> --out=<new.json>');
    const paths = JSON.parse(fs.readFileSync(input, 'utf8'));
    const bindings = IDS.map((id) => ({ id, ...identity(paths[id]) }));
    const executions = IDS.map((id) => {
        const file = paths[id].replace(/\.json$/, '-os.json');
        const receipt = JSON.parse(fs.readFileSync(path.resolve(ROOT, file), 'utf8'));
        return { id, ...identity(file), log: identity(receipt.log) };
    });
    const checked = evaluate(bindings);
    checked.errors.push(...validateExecution(bindings, executions));
    checked.ok = checked.errors.length === 0;
    const report = {
        schemaVersion: 'shaders-wave1-current-gate/1',
        wave: 1,
        executionChannel: 'Lead',
        observedAt: new Date().toISOString(),
        command: [process.execPath, ...process.argv.slice(1)],
        cwd: ROOT,
        verifier: identity(__filename),
        validatorInputs: VALIDATOR_INPUTS.map(identity),
        bindings,
        executions,
        ...checked,
        status: checked.ok ? 'PASS' : 'FAIL',
        waveCompleted: checked.ok,
        nextWaveEligible: checked.ok,
        projectCompleted: false,
        agentGate: 'NOT_RUN',
    };
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(
        JSON.stringify({
            status: report.status,
            measuredCases: report.measuredCases,
            galleryRows: report.galleryRows,
            errors: report.errors,
        }),
    );
    return checked.ok ? 0 : 1;
}
module.exports = {
    identity,
    evaluate,
    validateBindings,
    validateExecution,
    validateValidatorInputs,
    validateReport,
    main,
    IDS,
    VALIDATOR_INPUTS,
};
if (require.main === module)
    try {
        process.exitCode = main();
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
