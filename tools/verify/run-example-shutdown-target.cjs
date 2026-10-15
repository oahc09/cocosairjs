'use strict';
// A separate diagnostic invocation. It never writes campaign attempts, segments or admission.
const INVOCATION_STARTED = Date.now();
const fs = require('node:fs');
const path = require('node:path');
const protocol = require('./example-evidence-campaign.cjs');
const {
    DEFAULT_LIMITS,
    TARGET_DIAGNOSTIC_LIMITS,
    createTargetDiagnosticProfile,
    validateTargetDiagnosticProfile,
    superviseAttempt,
    validateCustodyArtifacts,
} = require('./example-evidence-supervisor.cjs');
const REPO = path.resolve(__dirname, '../..');
const TOOL = 'tools/verify/run-example-shutdown-target.cjs';
const SCHEMA = 'example-shutdown-target/1';
const ID = 'collector-dodge';
const FILES = Object.freeze({
    raw: 'custodian-observations.json',
    nodeReceipt: 'pending-node-receipt.json',
    journal: 'custodian.events.jsonl',
    stdout: 'custodian.stdout.log',
    stderr: 'custodian.stderr.log',
});
const same = (a, b) => protocol.objectDigest(a) === protocol.objectDigest(b);
const invariant = (ok, message) => {
    if (!ok) throw Error(message);
};
const outside = (root, file) => {
    const relative = path.relative(root, file);
    return relative === '..' || relative.startsWith('../');
};
function regularBytes(file) {
    file = path.resolve(file);
    const ancestors = [];
    for (let directory = path.dirname(file); ; directory = path.dirname(directory)) {
        const stat = fs.lstatSync(directory);
        invariant(stat.isDirectory() && !stat.isSymbolicLink(), 'nonregular-target-file');
        ancestors.push({ directory, dev: stat.dev, ino: stat.ino });
        if (directory === path.dirname(directory)) break;
    }
    const before = fs.lstatSync(file);
    invariant(before.isFile() && !before.isSymbolicLink(), 'nonregular-target-file');
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
        const opened = fs.fstatSync(fd);
        const unchanged = (stat) =>
            stat.isFile() && ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].every((key) => stat[key] === before[key]);
        invariant(unchanged(opened), 'target-file-changed-during-open');
        const bytes = fs.readFileSync(fd);
        invariant(
            unchanged(fs.fstatSync(fd)) && unchanged(fs.lstatSync(file)) && bytes.length === before.size,
            'target-file-changed-during-read',
        );
        for (const ancestor of ancestors) {
            const stat = fs.lstatSync(ancestor.directory);
            invariant(
                stat.isDirectory() && !stat.isSymbolicLink() && stat.dev === ancestor.dev && stat.ino === ancestor.ino,
                'target-ancestor-changed-during-read',
            );
        }
        return bytes;
    } finally {
        fs.closeSync(fd);
    }
}
const reference = (name, bytes) => ({ file: name, bytes: bytes.length, sha256: protocol.sha256(bytes) });
const matchesReference = (actual, name, bytes) => same(actual, reference(name, bytes));

function targetFreeze(freeze, repo) {
    protocol.validateFreeze(freeze, { repo, checkInputs: false });
    invariant(same(freeze.limits, DEFAULT_LIMITS), 'ordinary-15s-freeze-required');
    invariant(freeze.runtimeIdentity.browserType === 'chromium', 'target-requires-chromium');
    const entries = freeze.scope.filter((row) => row.id === ID);
    invariant(entries.length === 1, 'exact-target-scope-required');
    const sources = freeze.inputs.filter((row) => row.path === TOOL);
    invariant(sources.length === 1, 'target-runner-not-frozen');
    return { entry: entries[0], source: sources[0] };
}

function planTargetDiagnostic({ repo = REPO, freezePath, out }) {
    invariant(freezePath && out, 'freeze-and-output-required');
    repo = fs.realpathSync(repo);
    const freezeFile = path.resolve(freezePath),
        output = path.resolve(out);
    invariant(outside(repo, freezeFile) && outside(repo, output), 'target-output-must-be-external');
    invariant(path.basename(output) === 'target-diagnostic', 'separate-target-directory-required');
    invariant(!fs.existsSync(output), 'immutable-target-directory-exists');
    let ancestor = path.dirname(output);
    while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
    invariant(fs.realpathSync(ancestor) === ancestor && outside(repo, ancestor), 'target-output-ancestor-invalid');
    const freeze = JSON.parse(regularBytes(freezeFile));
    const { entry, source } = targetFreeze(freeze, repo);
    const profile = createTargetDiagnosticProfile({ freezeId: freeze.freezeId, inputDigest: freeze.inputDigest });
    return { repo, freezeFile, freeze, entry, source, output, profile };
}

// Envelope checks do not turn a rejected custody outcome into a successful receipt.
function validateTargetDiagnosticReport(
    report,
    { freeze, receipt, receiptBytes, collectorBytes, artifactBytes, runnerSha256 },
) {
    try {
        const { entry, source } = targetFreeze(freeze, REPO);
        const profile = createTargetDiagnosticProfile({ freezeId: freeze.freezeId, inputDigest: freeze.inputDigest });
        invariant(
            report.schemaVersion === SCHEMA &&
                report.canonicalEligible === false &&
                report.id === ID &&
                report.mode === 'target' &&
                report.status === 'DIAGNOSTIC_RECORDED' &&
                Array.isArray(report.errors) &&
                report.errors.length === 0,
            'target-report-header-invalid',
        );
        invariant(
            validateTargetDiagnosticProfile(report.diagnosticProfile) &&
                same(report.diagnosticProfile, profile) &&
                same(receipt.diagnosticProfile, profile) &&
                receipt.canonicalEligible === false,
            'target-report-profile-mismatch',
        );
        invariant(
            report.freezeId === freeze.freezeId &&
                report.inputDigest === freeze.inputDigest &&
                report.inputDigestBefore === freeze.inputDigest &&
                report.inputDigestAfter === freeze.inputDigest &&
                same(report.limits, TARGET_DIAGNOSTIC_LIMITS) &&
                same(receipt.limits, TARGET_DIAGNOSTIC_LIMITS),
            'target-report-freeze-or-limits-mismatch',
        );
        invariant(
            report.runnerSha256Before === source.sha256 &&
                report.runnerSha256After === source.sha256 &&
                runnerSha256 === source.sha256,
            'target-runner-source-mismatch',
        );
        invariant(
            same(report.runtimeIdentityBefore, freeze.runtimeIdentity) &&
                same(report.runtimeIdentityAfter, freeze.runtimeIdentity) &&
                same(receipt.runtimeIdentity, freeze.runtimeIdentity) &&
                receipt.id === ID &&
                receipt.cpuDummy === false &&
                same(
                    receipt.expectedModes,
                    entry.modes.map((mode) => mode.id),
                ),
            'target-runtime-or-scope-mismatch',
        );
        invariant(
            Array.isArray(receipt.runtimes) &&
                receipt.runtimes.every(
                    (row) =>
                        row.exampleId === ID &&
                        row.kind === (entry.shell ? 'ui-shell' : 'engine') &&
                        entry.modes.some((mode) => mode.id === row.mode && same(mode.viewport, row.viewport)),
                ),
            'target-runtime-kind-mismatch',
        );
        const times = [report.startedAt, receipt.startedAt, receipt.endedAt, report.finishedAt].map(Date.parse);
        invariant(
            times.every(Number.isFinite) && times[0] === times[1] && times[1] <= times[2] && times[2] <= times[3],
            'target-entry-time-mismatch',
        );
        // Origin paths are validated as one fixed layout, never opened. Downloads use only local fixed basenames.
        const originDirectory = path.dirname(receipt.output.receipt);
        invariant(
            path.isAbsolute(originDirectory) &&
                path.resolve(originDirectory) === originDirectory &&
                receipt.output.receipt === path.join(originDirectory, 'attempt-receipt.json') &&
                report.receiptOK === receipt.ok &&
                matchesReference(report.receipt, 'attempt-receipt.json', receiptBytes) &&
                receipt.output.report === path.join(originDirectory, 'collector.json'),
            'target-receipt-binding-mismatch',
        );
        const artifacts = {};
        for (const [role, name] of Object.entries(FILES)) {
            const bytes = artifactBytes[role],
                ref = receipt.custody.artifacts[role];
            invariant(
                Buffer.isBuffer(bytes) &&
                    matchesReference(report.originals?.[role], name, bytes) &&
                    ref.path === path.join(originDirectory, name) &&
                    ref.bytes === bytes.length &&
                    ref.sha256 === protocol.sha256(bytes),
                'target-original-binding-mismatch',
            );
            artifacts[role] = ['raw', 'nodeReceipt'].includes(role) ? JSON.parse(bytes) : bytes;
        }
        invariant(
            validateCustodyArtifacts(receipt, artifacts, { diagnosticProfile: profile }).ok,
            'target-originals-invalid',
        );
        if (collectorBytes === null) {
            invariant(
                report.collector === null && report.collectorResult === null && receipt.ok === false,
                'target-collector-missing',
            );
        } else {
            const collector = JSON.parse(collectorBytes);
            invariant(
                matchesReference(report.collector, 'collector.json', collectorBytes) &&
                    collector.completed === false &&
                    collector.partial === true &&
                    collector.results?.length === 1 &&
                    collector.results[0].id === ID &&
                    ['PASS', 'FAIL'].includes(collector.results[0].result) &&
                    report.collectorResult === collector.results[0].result &&
                    (!receipt.ok || collector.results[0].result === 'PASS'),
                'target-collector-binding-mismatch',
            );
        }
        return { ok: true, errors: [] };
    } catch (error) {
        return { ok: false, errors: [error.message] };
    }
}

function readTargetDiagnostic({ directory, freeze, runnerSha256 }) {
    directory = path.resolve(directory);
    const reportBytes = regularBytes(path.join(directory, 'diagnostic-target.json'));
    const report = JSON.parse(reportBytes);
    const receiptBytes = regularBytes(path.join(directory, 'attempt-receipt.json'));
    const receipt = JSON.parse(receiptBytes);
    const collectorFile = path.join(directory, 'collector.json');
    const collectorBytes = fs.existsSync(collectorFile) ? regularBytes(collectorFile) : null;
    const artifactBytes = Object.fromEntries(
        Object.entries(FILES).map(([role, name]) => [role, regularBytes(path.join(directory, name))]),
    );
    const checked = validateTargetDiagnosticReport(report, {
        freeze,
        receipt,
        receiptBytes,
        collectorBytes,
        artifactBytes,
        directory,
        runnerSha256,
    });
    invariant(checked.ok, checked.errors.join('; '));
    return { report, reportBytes, receipt, receiptBytes, artifactBytes };
}

async function runTargetDiagnostic(options, dependencies = {}) {
    invariant(
        Object.keys(options).every((key) => ['repo', 'freezePath', 'out', 'executeAuthorized'].includes(key)),
        'unsupported-target-option',
    );
    invariant(options.executeAuthorized === true, 'explicit-target-execution-required');
    // Dependencies are an explicit CPU-test seam; the CLI never accepts them or a replacement start time.
    const now = dependencies.now || Date.now;
    const startedAt = dependencies.invocationStarted ?? INVOCATION_STARTED;
    const frozenInputs = dependencies.assertFrozenInputs || protocol.assertFrozenInputs;
    const runtime = dependencies.collectRuntimeIdentity || protocol.collectRuntimeIdentity;
    const supervise = dependencies.superviseAttempt || superviseAttempt;
    const plan = planTargetDiagnostic(options);
    const { repo, freeze, entry, output, profile, source } = plan;
    const runnerSha256Before = protocol.sha256(regularBytes(__filename));
    invariant(runnerSha256Before === source.sha256, 'target-runner-source-not-frozen');
    const runtimeIdentityBefore = runtime(freeze.runtimeIdentity.browserType);
    const inputDigestBefore = frozenInputs(freeze, { repo, runtimeIdentity: runtimeIdentityBefore });
    invariant(
        Number.isFinite(startedAt) && startedAt <= now() && now() - startedAt < TARGET_DIAGNOSTIC_LIMITS.startupMs,
        'target-entry-startup-budget-exhausted',
    );
    fs.mkdirSync(output, { recursive: false, mode: 0o700 });
    const receipt = await supervise({
        repo,
        id: ID,
        out: path.join(output, 'collector.json'),
        artifactDir: path.join(output, 'images'),
        responseDir: path.join(output, 'responses'),
        runtimeIdentity: runtimeIdentityBefore,
        expectedModes: entry.modes.map((mode) => mode.id),
        expectedViewports: Object.fromEntries(entry.modes.map((mode) => [mode.id, mode.viewport])),
        limits: TARGET_DIAGNOSTIC_LIMITS,
        diagnosticProfile: profile,
        executeAuthorized: true,
        startedAt,
    });
    const errors = [];
    let inputDigestAfter = null,
        runtimeIdentityAfter = null,
        runnerSha256After = null;
    try {
        runtimeIdentityAfter = runtime(freeze.runtimeIdentity.browserType);
        inputDigestAfter = frozenInputs(freeze, { repo, runtimeIdentity: runtimeIdentityAfter });
    } catch {
        errors.push('target-postflight-input-or-runtime-changed');
    }
    try {
        runnerSha256After = protocol.sha256(regularBytes(__filename));
        invariant(runnerSha256After === source.sha256, 'changed');
    } catch {
        errors.push('target-runner-source-changed');
    }
    const report = {
        schemaVersion: SCHEMA,
        canonicalEligible: false,
        mode: 'target',
        id: ID,
        diagnosticProfile: profile,
        freezeId: freeze.freezeId,
        inputDigest: freeze.inputDigest,
        limits: TARGET_DIAGNOSTIC_LIMITS,
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date(now()).toISOString(),
        inputDigestBefore,
        inputDigestAfter,
        runtimeIdentityBefore,
        runtimeIdentityAfter,
        runnerSha256Before,
        runnerSha256After,
        receiptOK: receipt.ok,
        receipt: null,
        originals: {},
        collector: null,
        collectorResult: null,
        errors,
        status: 'FAIL',
    };
    try {
        const bytes = regularBytes(path.join(output, 'attempt-receipt.json'));
        invariant(same(JSON.parse(bytes), receipt), 'returned-receipt-mismatch');
        report.receipt = reference('attempt-receipt.json', bytes);
        for (const [role, name] of Object.entries(FILES))
            report.originals[role] = reference(name, regularBytes(path.join(output, name)));
        if (fs.existsSync(path.join(output, 'collector.json'))) {
            const bytes = regularBytes(path.join(output, 'collector.json'));
            report.collector = reference('collector.json', bytes);
            const collector = JSON.parse(bytes);
            invariant(collector.results?.length === 1 && collector.results[0].id === ID, 'collector-scope-mismatch');
            report.collectorResult = collector.results[0].result;
        }
    } catch {
        errors.push('target-original-artifact-unavailable-or-mismatched');
    }
    report.status = errors.length ? 'FAIL' : 'DIAGNOSTIC_RECORDED';
    fs.writeFileSync(path.join(output, 'diagnostic-target.json'), JSON.stringify(report, null, 2) + '\n', {
        flag: 'wx',
        mode: 0o600,
    });
    return report;
}

function parseArguments(args) {
    invariant(
        args.every((arg) => arg === '--execute-authorized' || /^--(?:freeze|out)=.+$/.test(arg)),
        'unsupported-target-argument',
    );
    invariant(
        args.filter((arg) => arg.startsWith('--freeze=')).length === 1 &&
            args.filter((arg) => arg.startsWith('--out=')).length === 1 &&
            args.filter((arg) => arg === '--execute-authorized').length === 1,
        'target-arguments-required-once',
    );
    return {
        freezePath: args.find((arg) => arg.startsWith('--freeze=')).slice(9),
        out: args.find((arg) => arg.startsWith('--out=')).slice(6),
        executeAuthorized: true,
    };
}
module.exports = {
    SCHEMA,
    TOOL,
    FILES,
    planTargetDiagnostic,
    validateTargetDiagnosticReport,
    readTargetDiagnostic,
    runTargetDiagnostic,
    parseArguments,
};
if (require.main === module)
    runTargetDiagnostic(parseArguments(process.argv.slice(2)))
        .then((report) => {
            console.log(
                JSON.stringify({ status: report.status, canonicalEligible: false, receiptOK: report.receiptOK }),
            );
            process.exitCode =
                report.status === 'DIAGNOSTIC_RECORDED' && report.receiptOK && report.collectorResult === 'PASS'
                    ? 0
                    : 1;
        })
        .catch(() => {
            console.error('Independent shutdown target failed; no campaign evidence was admitted.');
            process.exitCode = 1;
        });
