'use strict';
// One bounded attempt per invocation. A campaign is resumed with immutable independent invocations.
const INVOCATION_STARTED = Date.now();
const fs = require('fs');
const path = require('path');
const protocol = require('./example-evidence-campaign.cjs');
const { superviseAttempt } = require('./example-evidence-supervisor.cjs');
const REPO = path.resolve(__dirname, '../..');

function planAttempt({ repo = REPO, freezePath, id, attempt = 1, out }) {
    if (!freezePath || !out) throw Error('--freeze and --out are required');
    const freezeFile = path.resolve(freezePath);
    const root = path.dirname(freezeFile);
    const freeze = JSON.parse(fs.readFileSync(freezeFile, 'utf8'));
    const entry = freeze.scope?.find((item) => item.id === id);
    if (!entry || typeof id !== 'string' || !/^[\w-]+$/.test(id))
        throw Error('Exactly one known frozen ID is required');
    if (!Number.isInteger(attempt) || attempt < 1 || attempt > 2)
        throw Error('Only an explicit first attempt or one retained retry is supported');
    const output = path.resolve(out);
    if (output !== path.join(root, 'attempts', id, String(attempt)))
        throw Error('Attempt --out must be <freeze-directory>/attempts/<id>/<attempt>');
    if (fs.existsSync(output)) throw Error('Attempt directory already exists; never overwrite original results');
    if (attempt > 1 && !fs.existsSync(path.join(root, 'segments', `${id}-${attempt - 1}.json`))) {
        throw Error('Retry requires its retained preceding attempt segment');
    }
    const segment = path.join(root, 'segments', `${id}-${attempt}.json`);
    if (fs.existsSync(segment)) throw Error('Segment already exists');
    return { repo: path.resolve(repo), freeze, entry, root, output, attempt, segment };
}

function inspectAttemptAdmission({ repo, freeze, segments, id, attempt }) {
    try {
        const inspection = protocol.inspectSegments(freeze, segments, { repo });
        if (inspection.entries.some((entry) => entry.report.id !== id)) throw Error('Unexpected ID in attempt history');
        const selected = inspection.selected.find(
            (entry) => entry.report.id === id && entry.report.attempt === attempt,
        );
        if (!selected) throw Error('Current attempt is not a strictly validated PASS');
        return { ok: true, partial: true, completed: false, errors: [] };
    } catch (error) {
        return { ok: false, partial: true, completed: false, errors: [String(error.message || error)] };
    }
}

async function runAttempt(options) {
    if (options.executeAuthorized !== true) throw Error('Explicit authorized execution required');
    const startedAt = options.startedAt || INVOCATION_STARTED;
    const plan = planAttempt(options);
    const { repo, freeze, entry, root, output, attempt, segment } = plan;
    const inputDigestBefore = protocol.assertFrozenInputs(freeze, { repo });
    const runtimeIdentity = protocol.collectRuntimeIdentity(freeze.runtimeIdentity.browserType);
    if (protocol.objectDigest(runtimeIdentity) !== protocol.objectDigest(freeze.runtimeIdentity)) {
        throw Error('Browser/tooling runtime differs from the frozen identity');
    }
    if (Date.now() - startedAt >= freeze.limits.startupMs)
        throw Error('Preflight exhausted original exec-to-ready startup budget');
    const receipt = await superviseAttempt({
        repo,
        id: entry.id,
        out: path.join(output, 'collector.json'),
        artifactDir: path.join(output, 'images'),
        responseDir: path.join(root, 'responses'),
        runtimeIdentity,
        expectedModes: entry.modes.map((mode) => mode.id),
        expectedViewports: Object.fromEntries(entry.modes.map((mode) => [mode.id, mode.viewport])),
        limits: freeze.limits,
        executeAuthorized: true,
        startedAt,
    });
    let result;
    try {
        const raw = JSON.parse(fs.readFileSync(receipt.output.report, 'utf8'));
        if (raw.results?.length !== 1 || raw.results[0].id !== entry.id)
            throw Error('Collector did not return the exact one-ID scope');
        result = raw.results[0];
    } catch (error) {
        result = {
            id: entry.id,
            result: 'FAIL',
            errors: [String(error.message || error)],
            reason: 'missing or invalid collector result',
        };
    }
    let inputDigestAfter;
    try {
        inputDigestAfter = protocol.assertFrozenInputs(freeze, { repo });
    } catch (error) {
        inputDigestAfter = protocol.collectInputDigest(repo);
        result = { ...result, result: 'FAIL', errors: [...(result.errors || []), String(error)] };
    }
    const report = {
        id: entry.id,
        attempt,
        captureRoot: root,
        startedAt: receipt.startedAt,
        finishedAt: receipt.endedAt,
        sealedAt: new Date().toISOString(),
        inputDigestBefore,
        inputDigestAfter,
        result,
        receipt,
    };
    const sealed = protocol.writeAttempt({ repo, freeze, report, out: path.join(output, 'attempt.json') });
    protocol.createSegment({ freeze, attempts: [sealed], out: segment, segmentId: `${entry.id}-${attempt}` });
    // Validate this ID immediately, including retained retry history. A collector
    // PASS cannot postpone missing proof/custody detection until the full merge.
    const admission = inspectAttemptAdmission({
        repo,
        freeze,
        segments: Array.from({ length: attempt }, (_, index) =>
            path.join(root, 'segments', `${entry.id}-${index + 1}.json`),
        ),
        id: entry.id,
        attempt,
    });
    fs.writeFileSync(path.join(output, 'admission.json'), JSON.stringify(admission, null, 2) + '\n', { flag: 'wx' });
    const summary = {
        id: entry.id,
        attempt,
        result: result.result,
        receiptOK: receipt.ok,
        admitted: admission.ok,
        admissionErrors: admission.errors,
        noOwnedProcesses: receipt.noOwnedProcesses,
        partial: true,
        completed: false,
        segment,
    };
    console.log(JSON.stringify(summary));
    return summary;
}

async function main(args) {
    const arg = (name) => args.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
    console.log(
        JSON.stringify({
            actualStart: new Date(INVOCATION_STARTED).toISOString(),
            pid: process.pid,
            namespace: fs.readlinkSync('/proc/self/ns/pid'),
            scope: arg('id'),
            kind: 'single bounded evidence attempt',
        }),
    );
    const result = await runAttempt({
        repo: REPO,
        freezePath: arg('freeze'),
        id: arg('id'),
        attempt: Number(arg('attempt') || 1),
        out: arg('out'),
        executeAuthorized: args.includes('--execute-authorized'),
        startedAt: INVOCATION_STARTED,
    });
    process.exitCode = result.receiptOK && result.admitted && result.result === 'PASS' ? 0 : 1;
}
module.exports = { planAttempt, inspectAttemptAdmission, runAttempt };
if (require.main === module)
    main(process.argv.slice(2)).catch((error) => {
        console.error(error.stack || String(error));
        process.exitCode = 1;
    });
