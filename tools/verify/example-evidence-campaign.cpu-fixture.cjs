/** CPU-only synthetic protocol fixtures. These are not browser evidence and are
 * confined to disposable directories. Real process lifecycle tests live beside
 * the supervisor; these fixtures exercise immutable composition and rejection.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const campaign = require('./example-evidence-campaign.cjs');
const common = require('./example-spec-common.cjs');
const supervisor = require('./example-evidence-supervisor.cjs');
const clone = (value) => JSON.parse(JSON.stringify(value));
const write = (file, value) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value));
};
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=',
    'base64',
);
const identity = {
    browserType: 'chromium',
    executablePath: '/synthetic-fixture/browser',
    executableVersion: 'synthetic fixture, not a browser run',
    executableSha256: 'a'.repeat(64),
    playwrightVersion: 'fixture-only',
    launchArgs: ['--synthetic-fixture'],
    traceOn: true,
    custody: {
        schemaVersion: 'example-evidence-custody-runtime/1',
        platform: 'linux',
        ipc: 'inherited-anonymous-pipes/v1',
        python: {
            executablePath: '/synthetic-fixture/python3',
            version: 'Python 3.11.0 synthetic CPU fixture',
            sha256: 'b'.repeat(64),
        },
        helper: {
            path: '/synthetic-fixture/example-evidence-custodian.py',
            sha256: campaign.sha256('fixture tools/verify/example-evidence-custodian.py\n'),
        },
    },
};

/** Explicit Jest-only admission for schema tests. It never installs itself and
 * still invokes the real validator with every CPU lifecycle/custody rule intact.
 * Production consumers never opt into this helper and reject these fixtures.
 */
function installSyntheticReceiptValidationSpy(jestApi) {
    if (typeof jestApi?.spyOn !== 'function' || typeof jestApi.isMockFunction !== 'function')
        throw Error('An explicit Jest spy API is required for synthetic schema tests');
    const validate = supervisor.validateAttemptReceipt;
    if (jestApi.isMockFunction(validate)) throw Error('Synthetic receipt validation spy is already installed');
    return jestApi.spyOn(supervisor, 'validateAttemptReceipt').mockImplementation((receipt, options = {}) => {
        const synthetic =
            receipt?.cpuDummy === true &&
            receipt.command?.cwd === '/synthetic-fixture' &&
            receipt.command.executable === '/synthetic-fixture/node' &&
            receipt.runtimeIdentity?.executableVersion === identity.executableVersion &&
            receipt.worker?.namespace === 'synthetic-pid-namespace';
        return validate(receipt, synthetic ? { ...options, allowCpuDummy: true } : options);
    });
}

let receiptSerial = 0;
function makeReceipt(
    entry,
    freeze,
    output,
    failed = false,
    startAt = freeze.createdAt,
    beforeCustody,
    applicationResult,
) {
    const workerPID = 1000 + ++receiptSerial * 10;
    const events = [];
    const namespace = 'synthetic-pid-namespace';
    const worker = { pid: workerPID, startTicks: '1000', namespace, initial: { ppid: workerPID - 1 } };
    const event = (type, values = {}) => {
        const row = {
            type,
            ...values,
            source: type.startsWith('worker-') || type.startsWith('owned-') ? 'supervisor' : 'observer',
            sequence: events.filter((e) => e.source === 'observer').length + 1,
            eventId: events.length + 1,
            supervisorElapsedMs: events.length + 1,
            receivedUtc: new Date(Date.parse(startAt) + (events.length + 1)).toISOString(),
            workerPID: workerPID,
            namespace,
            cpuDummy: true,
        };
        events.push(row);
        return row;
    };
    worker.spawn = event('worker-spawn', { pid: workerPID, startTicks: '1000', namespace });
    event('observer-start', { esbuildWorkerThreads: '0' });
    const browsers = [];
    const servers = [];
    const runtimes = [];
    for (const [index, mode] of entry.modes.entries()) {
        const runtimeId = `synthetic-runtime-${index}`;
        const launchId = `launch-${index}`;
        const serverId = `server-${index}`;
        const runtime = {
            runtimeId,
            exampleId: entry.id,
            kind: entry.shell ? 'ui-shell' : 'engine',
            mode: mode.id,
            viewport: mode.viewport,
        };
        event('custody-barrier-ack', {
            runtimeId,
            phase: 'start',
            requestId: index * 3 + 1,
            custodianPID: workerPID - 2,
        });
        runtime.start = event('runtime-start', {
            runtimeId,
            exampleId: entry.id,
            mode: mode.id,
            kind: runtime.kind,
            viewport: mode.viewport,
        });
        const server = { runtimeId, serverId, ownerPID: workerPID, physicalProcess: 'collector-worker' };
        server.listenRequest = event('server-listen-request', { serverId, runtimeId, ownerPID: workerPID });
        server.listening = event('server-listening', {
            serverId,
            runtimeId,
            ownerPID: workerPID,
            address: { port: 41000 + index },
        });
        runtime.launch = event('launch-begin', {
            runtimeId,
            launchId,
            executablePath: identity.executablePath,
            launchArgs: identity.launchArgs,
        });
        const browser = {
            runtimeId,
            launchId,
            pid: workerPID + 1 + index,
            startTicks: String(2000 + index),
            namespace,
            command: identity.executablePath,
        };
        browser.spawn = event('browser-spawn', { row: clone(browser) });
        runtime.ready = event('runtime-ready', {
            runtimeId,
            launchId,
            kind: runtime.kind,
            frames: 2,
            launchElapsedMs: 20,
            clock: 'CPU_DUMMY_NOT_RENDERING',
            ...(entry.shell ? { domReady: true, selectorCount: 1, nativeEngineFrames: null } : {}),
        });
        runtime.stopBegin = event('stop-begin', { runtimeId });
        event('custody-barrier-ack', {
            runtimeId,
            phase: 'closing',
            requestId: index * 3 + 2,
            custodianPID: workerPID - 2,
        });
        const application = applicationResult?.modeEvidence?.[index] ||
            applicationResult || { id: entry.id, result: 'PASS', apiProof: [], validatorResults: [], errors: [] };
        const functionalPath = path.join(output.artifactDir, `functional-${index}.json`);
        const functionalOutput = clone(application);
        functionalOutput.validatorResults = functionalOutput.validatorResults.filter(
            (check) => check.validatorId !== 'post-close-no-runtime-error',
        );
        write(functionalPath, {
            schemaVersion: 'example-functional-result/2',
            id: entry.id,
            mode: mode.id,
            completed: true,
            result: application.result,
            output: functionalOutput,
        });
        const functionalResult = {
            path: functionalPath,
            ...campaign.fileDigest(functionalPath),
            completed: true,
            result: application.result,
        };
        application.functionalResult = functionalResult;
        application.closure = { schemaVersion: 'example-close-result/2', result: 'CLOSED' };
        runtime.closeAuthorized = event('close-authorized', { runtimeId, launchId, healthy: true, functionalResult });
        browser.exit = event('browser-exit', { pid: browser.pid, launchId, code: 0, signal: null });
        browser.close = event('browser-close', { pid: browser.pid, launchId, code: 0, signal: null });
        server.close = event('server-close', { serverId, runtimeId, ownerPID: workerPID });
        event('custody-barrier-ack', {
            runtimeId,
            phase: 'stop',
            requestId: index * 3 + 3,
            custodianPID: workerPID - 2,
        });
        runtime.stopComplete = event('stop-complete', { runtimeId, durationMs: 40, browserCount: 1, serverCount: 1 });
        runtimes.push(runtime);
        browsers.push(browser);
        servers.push(server);
    }
    event('observer-complete', { runtimeCount: runtimes.length });
    worker.exit = event('worker-exit', { code: failed ? 1 : 0, signal: null });
    worker.close = event('worker-stdio-close', { code: failed ? 1 : 0, signal: null });
    const ownedProcesses = [worker, ...browsers].map((process) => ({
        pid: process.pid,
        startTicks: process.startTicks,
        namespace,
        firstObserved: event('owned-process-observed', {
            pid: process.pid,
            startTicks: process.startTicks,
            pgrp: process.pid,
            namespace,
        }),
        disappearance: event('owned-process-absent', {
            pid: process.pid,
            startTicks: process.startTicks,
            pgrp: process.pid,
            namespace,
        }),
    }));
    const ownedGroups = [worker, ...browsers].map((process) => ({
        leaderPID: process.pid,
        leaderStartTicks: process.startTicks,
        namespace,
        firstObserved: event('owned-group-observed', {
            leaderPID: process.pid,
            leaderStartTicks: process.startTicks,
            namespace,
        }),
        empty: event('owned-group-empty', { leaderPID: process.pid, leaderStartTicks: process.startTicks, namespace }),
    }));
    const receipt = {
        schemaVersion: supervisor.SCHEMA_VERSION,
        id: entry.id,
        attemptId: `synthetic-test-fixture-${workerPID}`,
        cpuDummy: true,
        startedAt: startAt,
        endedAt: new Date(Date.parse(startAt) + (events.length + 1)).toISOString(),
        expectedModes: entry.modes.map((m) => m.id),
        runtimeIdentity: clone(freeze.runtimeIdentity),
        executableSha256: identity.executableSha256,
        limits: clone(freeze.limits),
        command: {
            cwd: '/synthetic-fixture',
            executable: '/synthetic-fixture/node',
            args: [
                '--require',
                '/synthetic-fixture/example-evidence-observer.cjs',
                '/synthetic-fixture/example-evidence-supervisor.cpu-fixture.cjs',
                `--ids=${entry.id}`,
                `--out=${output.report}`,
                `--artifact-dir=${output.artifactDir}`,
            ],
        },
        ownedProcesses,
        ownedGroups,
        worker,
        runtimes,
        browsers,
        servers,
        events,
        output,
        forced: false,
        timedOut: false,
        noOwnedProcesses: true,
        lifecycleErrors: [],
        errors: failed ? ['assertion failed'] : [],
        collector: { scopePassed: !failed, partial: true, completed: false, ids: [entry.id] },
        ok: !failed,
    };
    beforeCustody?.(receipt);
    return addSyntheticCustody(receipt);
}

/** Deterministic schema-only kernel records, never actual process evidence. */
function addSyntheticCustody(receipt) {
    const directory = path.dirname(receipt.output.report);
    const nodePID = receipt.worker.pid - 1;
    const wrapperPID = receipt.worker.pid - 2;
    const namespace = receipt.worker.namespace;
    const origin = Date.parse(receipt.startedAt);
    const utc = (elapsed) => new Date(origin + elapsed).toISOString();
    const raw = {
        schemaVersion: 'example-evidence-custody-observation/2',
        runtimeIdentity: clone(receipt.runtimeIdentity.custody),
        custodian: { pid: wrapperPID, startTicks: '7000', namespace },
        startedAt: receipt.startedAt,
        endedAt: null,
        events: [],
        errors: [],
        forced: false,
        barriers: [],
        adopted: [],
    };
    const event = (type, elapsedMs, values = {}) => {
        const row = { type, eventId: raw.events.length + 1, elapsedMs, utc: utc(elapsedMs), ...values };
        raw.events.push(row);
        return row;
    };
    raw.parentDeath = event('parent-death-signal', 0.1, { parentPID: 999, signal: 'SIGTERM', observed: 15 });
    raw.initial = event('kernel-initial-echild', 0.2, { result: 'ECHILD', priorSubreaper: 0 });
    raw.enabled = event('kernel-subreaper-enabled', 0.3, { observed: 1 });
    const node = { pid: nodePID, ppid: wrapperPID, startTicks: '7100', namespace };
    node.spawn = event('inner-supervisor-spawn', 0.4, { identity: clone(node) });
    raw.innerSupervisor = node;
    const image = {
        device: 1,
        inode: 100,
        bytes: 1234,
        mtimeNs: '1234',
        sha256: receipt.runtimeIdentity.executableSha256,
    };
    raw.browserImage = event('frozen-browser-image', 0.5, { image, cpuDummy: true });
    for (const ack of receipt.events.filter((entry) => entry.type === 'custody-barrier-ack')) {
        const proof = event('runtime-custody-barrier', ack.supervisorElapsedMs - 0.1, {
            requestId: ack.requestId,
            runtimeId: ack.runtimeId,
            phase: ack.phase,
            workerPID: receipt.worker.pid,
            workerStartTicks: receipt.worker.startTicks,
            directChildren: [nodePID],
            observedSubreaper: 1,
            ok: true,
            transport: 'inherited-anonymous-pipes/v1',
            policy: 'browser-shutdown/2',
            closeBudget:
                ack.phase === 'start'
                    ? null
                    : {
                          originEventId: receipt.runtimes.find((row) => row.runtimeId === ack.runtimeId).stopBegin
                              .eventId,
                          originElapsedMs: receipt.runtimes.find((row) => row.runtimeId === ack.runtimeId).stopBegin
                              .supervisorElapsedMs,
                          deadlineMs:
                              receipt.runtimes.find((row) => row.runtimeId === ack.runtimeId).stopBegin
                                  .supervisorElapsedMs + receipt.limits.closeMs,
                      },
            deadlineMs:
                receipt.runtimes.find((row) => row.runtimeId === ack.runtimeId).stopBegin.supervisorElapsedMs +
                receipt.limits.closeMs,
            snapshot:
                ack.phase === 'closing'
                    ? {
                          browser: {
                              ...receipt.browsers.find((row) => row.runtimeId === ack.runtimeId),
                              state: 'S',
                              ppid: receipt.worker.pid,
                              pgrp: receipt.browsers.find((row) => row.runtimeId === ack.runtimeId).pid,
                          },
                          image,
                          candidates: [],
                          issues: [],
                          cpuDummy: true,
                          healthy: true,
                          completed: true,
                          result: receipt.runtimes.find((row) => row.runtimeId === ack.runtimeId).closeAuthorized
                              .functionalResult.result,
                          functionalResult: receipt.runtimes.find((row) => row.runtimeId === ack.runtimeId)
                              .closeAuthorized.functionalResult,
                      }
                    : null,
            closure:
                ack.phase === 'stop'
                    ? {
                          browsers: receipt.browsers
                              .filter((row) => row.runtimeId === ack.runtimeId)
                              .map((row) => ({
                                  pid: row.pid,
                                  startTicks: row.startTicks,
                                  namespace: row.namespace,
                                  exit: row.exit,
                                  close: row.close,
                              })),
                          servers: receipt.servers
                              .filter((row) => row.runtimeId === ack.runtimeId)
                              .map((row) => ({ serverId: row.serverId, close: row.close })),
                      }
                    : null,
        });
        ack.custodyEventId = proof.eventId;
        raw.barriers.push(proof);
    }
    const last = receipt.events[receipt.events.length - 1].supervisorElapsedMs;
    node.exit = event('inner-supervisor-waitpid', last + 1, { code: 0, signal: null });
    node.stdoutEOF = event('inner-supervisor-stdout-eof', last + 2);
    node.stderrEOF = event('inner-supervisor-stderr-eof', last + 3);
    raw.final = event('kernel-final-echild', last + 4, { result: 'ECHILD' });
    raw.restored = event('kernel-subreaper-restored', last + 5, { expected: 0, observed: 0 });
    raw.endedAt = utc(last + 5);
    const wrapper = {
        pid: wrapperPID,
        startTicks: '7000',
        namespace,
        initial: { ppid: 999 },
        spawn: { type: 'custodian-spawn', pid: wrapperPID, startTicks: '7000', namespace, elapsedMs: 0, utc: utc(0) },
        exit: { type: 'custodian-exit', code: 0, signal: null, elapsedMs: last + 6, utc: utc(last + 6) },
        close: { type: 'custodian-stdio-close', code: 0, signal: null, elapsedMs: last + 7, utc: utc(last + 7) },
    };
    const files = {
        raw: path.join(directory, 'custodian-observations.json'),
        nodeReceipt: path.join(directory, 'pending-node-receipt.json'),
        journal: path.join(directory, 'custodian.events.jsonl'),
        stdout: path.join(directory, 'custodian.stdout.log'),
        stderr: path.join(directory, 'custodian.stderr.log'),
    };
    const inner = clone(receipt);
    inner.pending = true;
    inner.coreOk = inner.ok;
    inner.ok = false;
    inner.output.receipt = files.nodeReceipt;
    write(files.nodeReceipt, inner);
    write(files.raw, raw);
    write(files.journal, raw.events.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
    write(files.stdout, '');
    write(files.stderr, '');
    receipt.pending = false;
    receipt.endedAt = utc(last + 8);
    receipt.custody = {
        schemaVersion: 'example-evidence-custody/2',
        runtimeIdentity: clone(receipt.runtimeIdentity.custody),
        wrapper,
        observation: raw,
        artifacts: Object.fromEntries(
            Object.entries(files).map(([role, file]) => [role, { path: file, ...campaign.fileDigest(file) }]),
        ),
    };
    return receipt;
}

function specOf(id, shell = false, variants = false) {
    return {
        id,
        requiresDevTools: false,
        status: id === 'alpha' ? 'stable' : 'draft',
        ...(id === 'alpha' || id === 'spark-splats' ? { promotion: { fixture: 'old-' + id } } : {}),
        api: {
            claims: shell ? [] : ['Node'],
            evidence: shell
                ? []
                : [{ api: 'Node', source: 'src/main.ts', sourceLocation: 'L1', validator: 'visible-frame' }],
        },
        scene: { expectedGraph: { nodes: ['node'] } },
        interaction: { steps: [] },
        ready: { validators: ['scene-ready'] },
        validation: {
            functional: ['no-runtime-error'],
            visual: shell ? [] : ['visible-frame'],
            interaction: [],
            lifecycle: [],
            capability: [],
        },
        bench: shell
            ? { mode: 'ui-shell', uiSelector: '#content' }
            : variants
              ? { apiVariants: [{ query: 'mode=other', nodes: ['node'], steps: [] }] }
              : {},
        assets: [],
    };
}

function fixture() {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'example-campaign-unit-'));
    const repo = path.join(temp, 'repo');
    const artifacts = path.join(temp, 'campaign');
    for (const dir of campaign.INPUT_TREES) write(path.join(repo, dir, 'fixture.txt'), 'synthetic input\n');
    for (const rel of campaign.REQUIRED_FILES)
        write(path.join(repo, rel), rel.endsWith('.json') ? '{}' : `fixture ${rel}\n`);
    write(path.join(repo, 'tools/verify/example-evidence-limits.json'), campaign.DEFAULT_LIMITS);
    const specs = [specOf('alpha', false, true), specOf('spark-splats'), specOf('shell', true)];
    for (const spec of specs) {
        write(path.join(repo, 'examples', spec.id, 'example.json'), spec);
        write(path.join(repo, 'examples', spec.id, 'index.html'), '<html>synthetic fixture</html>');
        write(path.join(repo, 'examples', spec.id, 'src/main.ts'), 'new Node();\n');
    }
    write(path.join(repo, 'examples/files.json'), {
        generatedAt: 'fixture',
        revision: 'fixture',
        examples: specs.map((s) => ({ ...s, dir: s.id })),
    });
    const freeze = campaign.freezeCampaign({
        repo,
        runtimeIdentity: identity,
        out: path.join(artifacts, 'freeze.json'),
    });
    const state = { temp, repo, artifacts, freeze, segmentFiles: [], serial: 0 };
    return state;
}
function response(state, dir, sourcePath) {
    const sourceFile = path.join(state.repo, sourcePath);
    const digest = campaign.fileDigest(sourceFile);
    const body = path.join(dir, digest.sha256 + '.body');
    write(body, fs.readFileSync(sourceFile));
    return {
        path: '/' + sourcePath,
        status: 200,
        bytes: digest.bytes,
        sha256: digest.sha256,
        source: {
            path: sourcePath,
            sha256: digest.sha256,
            kind: sourcePath.startsWith('build/') ? 'repository-build' : 'isolated-workspace',
        },
        bodyArtifact: { path: body, ...digest },
    };
}
function makeResult(state, entry, dir) {
    const spec = read(path.join(state.repo, 'examples', entry.dir, 'example.json'));
    const rows = entry.modes.map((mode, index) => {
        const shot = path.join(dir, `${mode.id.replace(':', '-')}.png`);
        write(shot, png);
        const validators = mode.validators.map((validatorId) => ({
            validatorId,
            state: 'PASS',
            detail: 'synthetic CPU fixture',
        }));
        const proofs = common.apiProofOf(
            spec,
            path.join(state.repo, 'examples', entry.dir),
            entry.shell
                ? {}
                : {
                      Node: { state: 'executed', calls: 1, reads: 0, via: 'call', mechanism: 'export-wrapper' },
                  },
            validators.map((v) => v.validatorId),
        );
        const row = {
            id: entry.id,
            result: 'PASS',
            errors: [],
            specFingerprint: mode.specFingerprint,
            sourceFingerprint: entry.sourceFingerprint,
            candidateFingerprint: state.freeze.candidateFingerprint,
            apiProof: proofs,
            validatorResults: validators,
            query: mode.query,
            artifact: { path: shot, bytes: png.length, hash: campaign.sha256(png).slice(0, 16) },
            instrumentation: entry.shell ? null : { name: 'synthetic.trace.js', bytes: 12, hash: '1'.repeat(16) },
            networkAssetsScope: 'recorded-server-responses',
            networkAssets: [
                response(state, dir, `examples/${entry.dir}/index.html`),
                ...(!entry.shell ? [response(state, dir, 'build/cocosair.module.js')] : []),
                ...(entry.id === 'spark-splats' ? [response(state, dir, 'build/spark.module.js')] : []),
            ],
        };
        return row;
    });
    if (rows.length === 1) return rows[0];
    return {
        ...clone(rows[0]),
        modeEvidence: rows,
        validatorResults: [
            ...rows.flatMap((r, mode) => r.validatorResults.map((v) => ({ ...v, mode }))),
            { validatorId: 'api-executed', state: 'PASS', detail: 'synthetic union fixture' },
        ],
    };
}
function attempt(state, id, options = {}) {
    const entry = state.freeze.scope.find((e) => e.id === id);
    const number = options.attempt || 1;
    const dir = path.join(state.artifacts, `${id}-${number}-${++state.serial}`);
    const result = makeResult(state, entry, dir);
    if (options.failed) {
        result.result = 'FAIL';
        result.errors = ['synthetic failed assertion'];
    }
    options.result?.(result);
    const output = {
        report: path.join(dir, 'collector.json'),
        receipt: path.join(dir, 'receipt.json'),
        stdout: path.join(dir, 'stdout.log'),
        stderr: path.join(dir, 'stderr.log'),
        artifactDir: dir,
    };
    const receipt = makeReceipt(
        entry,
        state.freeze,
        output,
        options.failed,
        state.nextStart || state.freeze.createdAt,
        options.beforeCustody,
        result,
    );
    state.nextStart = new Date(Date.parse(receipt.endedAt) + 1).toISOString();
    options.receipt?.(receipt);
    write(output.report, { completed: false, partial: true, scopePassed: result.result === 'PASS', results: [result] });
    write(output.receipt, receipt);
    write(output.stdout, '');
    write(output.stderr, '');
    const report = {
        id,
        attempt: number,
        startedAt: receipt.startedAt,
        finishedAt: receipt.endedAt,
        inputDigestBefore: state.freeze.inputDigest,
        inputDigestAfter: state.freeze.inputDigest,
        result,
        receipt,
    };
    options.report?.(report);
    return campaign.writeAttempt({
        repo: state.repo,
        freeze: state.freeze,
        report,
        out: path.join(dir, 'attempt.json'),
    });
}
function segment(state, attempts) {
    const out = path.join(state.artifacts, `segment-${++state.serial}.json`);
    campaign.createSegment({ freeze: state.freeze, attempts, out });
    state.segmentFiles.push(out);
    return out;
}
function complete(state, modify = {}) {
    for (const entry of state.freeze.scope) segment(state, [attempt(state, entry.id, modify[entry.id])]);
    return merge(state);
}
function merge(state, extra = {}) {
    return campaign.mergeCampaign({
        repo: state.repo,
        freeze: state.freeze,
        segments: state.segmentFiles,
        out: path.join(state.artifacts, 'completed.json'),
        ...extra,
    });
}
function check(state, data) {
    return campaign.validateCampaign(data, {
        repo: state.repo,
        evidencePath: path.join(state.artifacts, 'completed.json'),
    });
}

module.exports = {
    fixture,
    attempt,
    segment,
    complete,
    merge,
    check,
    read,
    write,
    clone,
    makeReceipt,
    specOf,
    makeResult,
    identity,
    installSyntheticReceiptValidationSpy,
};
