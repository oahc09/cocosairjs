/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Synthetic retained-input/import tests. Never dispatch a valid physics consumer.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const runner = require('./runner.cjs');
const cohort = require('./cohort.cjs');
const input = require('./manifest-inputs.cjs');
const temp = (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'box3d-runner-boundary-unit-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
};
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
const identity = {
    producerCommit: '1'.repeat(40),
    runtimeBuildNumber: 223,
    productSha256: '2'.repeat(64),
    regressionFixtureCommit: '3'.repeat(40),
    acceptanceSha256: '4'.repeat(64),
};
function syntheticAttempt(t) {
    const dir = temp(t),
        out = path.join(dir, 'attempt');
    fs.mkdirSync(out);
    const snapshot = {
        schema: 'box3d-campaign-snapshot-v1',
        caseId: 'cohort-fixed-healthy',
        host: 'NODE_JSDOM_REAL_ST_WASM',
        scope: 'SUPPLEMENTAL_NO_FORMAL_CELL_CREDIT',
        executable: process.execPath,
        args: ['synthetic-not-executed-consumer', '$OUTPUT'],
        cohortIdentity: identity,
    };
    const raw = {
        schema: 'box3d-production-esm-public-fixed-consumer-v1',
        mode: 'healthy',
        completedAt: '2001-01-01T00:00:01.000Z',
        inputsUnchanged: true,
        status: 'PASS_LIMITED_PUBLIC_FIXED',
        healthyComplete: true,
        checks: Array.from({ length: 15 }, (_, i) => ({ name: 'synthetic assertion ' + i, pass: true })),
        hostErrors: [],
        close: { physicsPreparation: { status: 'closed', cleanupErrors: [] } },
        drift: Array.from({ length: 600 }, () => ({
            pairError: { linear: 0, angular: 0 },
            anchorError: { linear: 0, angular: 0 },
            pairNative: [0, 0],
            anchorNative: [0, 0],
        })),
        cohortIdentity: identity,
    };
    const snapshotFile = path.join(out, 'snapshot.json');
    write(snapshotFile, snapshot);
    const trusted = path.join(dir, 'independent-snapshot.json');
    fs.copyFileSync(snapshotFile, trusted);
    fs.writeFileSync(path.join(out, 'stdout.txt'), 'SYNTHETIC UNIT FIXTURE; NO PHYSICS EXECUTED\n');
    fs.writeFileSync(path.join(out, 'stderr.txt'), '');
    write(path.join(out, 'consumer.raw.json'), raw);
    const receipt = {
        schema: 'box3d-campaign-attempt-v1',
        snapshotSha256: runner.sha(fs.readFileSync(snapshotFile)),
        startedAt: '2001-01-01T00:00:00.000Z',
        completedAt: '2001-01-01T00:00:01.000Z',
        command: [process.execPath, 'synthetic-not-executed-consumer', out],
        exitCode: 0,
        signal: null,
        spawnError: null,
        inputError: null,
        outputs: ['stdout.txt', 'stderr.txt', 'consumer.raw.json'].map((name) => ({
            name,
            sha256: runner.sha(fs.readFileSync(path.join(out, name))),
        })),
    };
    const receiptFile = path.join(out, 'receipt.json');
    write(receiptFile, receipt);
    return {
        dir,
        out,
        snapshot,
        raw,
        receipt,
        receiptFile,
        trusted,
        import: (name = 'result.json') => runner.importAttempt(out, path.join(dir, name), trusted),
    };
}

test('v2 synthetic importer keeps independent snapshot, exclusive destination and no formal credit', (t) => {
    const attempt = syntheticAttempt(t);
    const result = attempt.import();
    assert.equal(result.status, 'PASS_LIMITED');
    assert.deepEqual(result.formalCellCredit, []);
    assert.equal(result.gateStatus, 'NOT_RUN');
    assert.deepEqual(result.cohortIdentity, identity);
    assert.throws(() => attempt.import(), /EEXIST/);
    assert.throws(
        () => runner.importAttempt(attempt.out, path.join(attempt.dir, 'no-independent.json')),
        /independently retained/,
    );
    write(attempt.trusted, { ...attempt.snapshot, cohortIdentity: { ...identity, acceptanceSha256: '0'.repeat(64) } });
    assert.throws(() => attempt.import('changed-trusted.json'), /independent snapshot/);
});

test('v2 importer rejects raw/stdout tamper and partial or malformed terminal evidence', (t) => {
    const attempt = syntheticAttempt(t);
    fs.appendFileSync(path.join(attempt.out, 'stdout.txt'), 'tampered');
    assert.throws(() => attempt.import(), /Retained output changed/);
    const missing = syntheticAttempt(t);
    fs.unlinkSync(missing.receiptFile);
    assert.throws(() => missing.import(), /ENOENT/);
    const absentRaw = syntheticAttempt(t);
    absentRaw.receipt.outputs = absentRaw.receipt.outputs.filter((r) => r.name !== 'consumer.raw.json');
    write(absentRaw.receiptFile, absentRaw.receipt);
    assert.equal(absentRaw.import().status, 'INVALID_RESULT');
    const wrongCommand = syntheticAttempt(t);
    wrongCommand.receipt.command[1] = 'arbitrary-command';
    write(wrongCommand.receiptFile, wrongCommand.receipt);
    assert.throws(() => wrongCommand.import());
    const duplicate = syntheticAttempt(t);
    duplicate.receipt.outputs.push(duplicate.receipt.outputs[0]);
    write(duplicate.receiptFile, duplicate.receipt);
    assert.throws(() => duplicate.import());
    const noStderr = syntheticAttempt(t);
    noStderr.receipt.outputs = noStderr.receipt.outputs.filter((r) => r.name !== 'stderr.txt');
    write(noStderr.receiptFile, noStderr.receipt);
    assert.throws(() => noStderr.import());
});

test('v2 importer rechecks copied identity and numeric samples rather than accepting a PASS label', (t) => {
    for (const [name, mutate, expected] of [
        [
            'wrong-fixture',
            (r) => {
                r.cohortIdentity = { ...identity, regressionFixtureCommit: '9'.repeat(40) };
            },
            'INVALID_RESULT',
        ],
        [
            'wrong-producer',
            (r) => {
                r.cohortIdentity = { ...identity, producerCommit: '9'.repeat(40) };
            },
            'INVALID_RESULT',
        ],
        [
            'numeric-drift',
            (r) => {
                r.drift[0].pairError.linear = 0.5;
            },
            'FAIL_PRODUCT',
        ],
        [
            'missing-sample',
            (r) => {
                r.drift.pop();
            },
            'INVALID_RESULT',
        ],
    ]) {
        const a = syntheticAttempt(t);
        mutate(a.raw);
        write(path.join(a.out, 'consumer.raw.json'), a.raw);
        a.receipt.outputs.find((r) => r.name === 'consumer.raw.json').sha256 = runner.sha(
            fs.readFileSync(path.join(a.out, 'consumer.raw.json')),
        );
        write(a.receiptFile, a.receipt);
        assert.equal(a.import(name + '.json').status, expected, name);
    }
});

test('v2 missing lock, legacy schema, noncohort and unknown IDs block before snapshot/output creation', async (t) => {
    const dir = temp(t),
        missing = path.join(dir, 'missing-lock.json'),
        snapshot = path.join(dir, 'snapshot.json');
    const options = { artifacts: dir, sourceRoot: dir, lock: missing };
    for (const id of ['resource-budget-contract', 'fixed-healthy', 'invented-case']) {
        await assert.rejects(runner.freeze(id, options, snapshot), /only the original cohort/);
        assert(!fs.existsSync(snapshot));
    }
    await assert.rejects(runner.freeze('cohort-fixed-healthy', options, snapshot), /ENOENT/);
    write(missing, { schema: 'box3d-same-build-cohort-v1' });
    await assert.rejects(
        runner.freeze('cohort-fixed-healthy', options, snapshot),
        /Unsupported profile; no legacy downgrade/,
    );
    assert(!fs.existsSync(snapshot));
});

test('v2 dispatch rejects changed input and untrusted arbitrary command before any child/output', async (t) => {
    const dir = temp(t),
        file = path.join(dir, 'input.txt'),
        snapshotFile = path.join(dir, 'snapshot.json');
    fs.writeFileSync(file, 'original');
    const sentinel = path.join(dir, 'MUST-NOT-EXIST');
    const snap = {
        schema: 'box3d-campaign-snapshot-v1',
        caseId: 'cohort-fixed-healthy',
        node: process.version,
        executable: process.execPath,
        cwd: dir,
        host: 'NODE_JSDOM_REAL_ST_WASM',
        scope: 'SUPPLEMENTAL_NO_FORMAL_CELL_CREDIT',
        timeoutMs: 180000,
        inputs: [{ file, sha256: runner.sha(fs.readFileSync(file)) }],
        args: ['-e', `require('fs').writeFileSync(${JSON.stringify(sentinel)}, 'forbidden')`],
        options: { artifacts: dir, sourceRoot: dir, lock: path.join(dir, 'missing-lock.json') },
    };
    write(snapshotFile, snap);
    fs.appendFileSync(file, 'drift');
    await assert.rejects(
        runner.dispatch(snapshotFile, path.join(dir, 'changed-attempt')),
        /Input\/output bytes changed/,
    );
    fs.writeFileSync(file, 'original');
    await assert.rejects(runner.dispatch(snapshotFile, path.join(dir, 'arbitrary-attempt')), /ENOENT/);
    assert(!fs.existsSync(sentinel));
    assert(!fs.existsSync(path.join(dir, 'changed-attempt')));
    assert(!fs.existsSync(path.join(dir, 'arbitrary-attempt')));
});

test('v2 batch requires exact original 22 cases and same-build policy before output', async (t) => {
    const dir = temp(t),
        planFile = path.join(dir, 'plan.json');
    const cases = Object.keys(runner.registry)
        .filter((id) => runner.registry[id].cohort)
        .map((caseId) => ({ caseId }));
    assert.equal(cases.length, 22);
    for (const [name, items, same] of [
        ['missing', cases.slice(1), true],
        ['duplicate', [cases[0], ...cases.slice(0, -1)], true],
        ['unknown', [{ caseId: 'invented-case' }, ...cases.slice(1)], true],
        ['noncohort', [{ caseId: 'resource-budget-contract' }, ...cases.slice(1)], true],
        ['no-same-build', cases, false],
    ]) {
        write(planFile, { schema: 'box3d-campaign-batch-v1', requireSameBuild: same, cases: items });
        const out = path.join(dir, name);
        await assert.rejects(runner.batch(planFile, out), /complete original 22-case set|exact same runtime/);
        assert(!fs.existsSync(out));
    }
});

test('v2 same-build gate rejects mixed runtime or fixture identities and manifest changes identity', () => {
    const lock = {
        runtimeProducer: '1'.repeat(40),
        runtimeTree: '2'.repeat(40),
        runtimeBuildNumber: 223,
        runtime: [],
        fullManifestSha256: '3'.repeat(64),
        regressionFixtureCommit: '4'.repeat(40),
        fixtureTree: '5'.repeat(40),
        fixture: [],
        auxiliary: [],
        provenance: [],
        evidence: [],
        policy: {},
    };
    const base = input.identity(lock);
    assert.doesNotThrow(() => cohort.assertOneCohort([base, { ...base }], true));
    assert.throws(() => cohort.assertOneCohort([base, null], true), /every case/);
    assert.throws(
        () => cohort.assertOneCohort([base, input.identity({ ...lock, runtimeProducer: '6'.repeat(40) })], true),
        /Mixed/,
    );
    assert.throws(
        () =>
            cohort.assertOneCohort([base, input.identity({ ...lock, regressionFixtureCommit: '7'.repeat(40) })], true),
        /Mixed/,
    );
    assert.notEqual(base.productSha256, input.identity({ ...lock, fullManifestSha256: '8'.repeat(64) }).productSha256);
});
