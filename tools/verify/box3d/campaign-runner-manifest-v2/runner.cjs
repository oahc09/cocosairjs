/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Local bounded dispatch only. This does not publish or mutate the frozen inventory.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { capture, dependencyFiles, families } = require('./capture.cjs');
const { freezeCohort, prepareCohort, assertOneCohort } = require('./cohort.cjs');
const { classifyQuery } = require('./query-oracle.cjs');
const { classifyTrigger } = require('./trigger-oracle.cjs');
const { classifySku } = require('./sku-oracle.cjs');
const ROOT = path.resolve(__dirname, '../../../..');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const read = (file) => JSON.parse(fs.readFileSync(file));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const registry = Object.freeze({
    'cohort-ex09-sku-A': { host: 'NODE_JSDOM_REAL_ST_WASM', family: 'sku', mode: 'A', cohort: true },
    'cohort-ex09-sku-B': { host: 'NODE_JSDOM_REAL_ST_WASM', family: 'sku', mode: 'B', cohort: true },
    'cohort-ex09-sku-C': { host: 'NODE_JSDOM_REAL_ST_WASM', family: 'sku', mode: 'C', cohort: true },
    'cohort-trigger-lifecycle': { host: 'NODE_JSDOM_REAL_ST_WASM', family: 'trigger', mode: 'lifecycle', cohort: true },
    'cohort-trigger-once-only': { host: 'NODE_JSDOM_REAL_ST_WASM', family: 'trigger', mode: 'once-only', cohort: true },
    'cohort-trigger-callback-destroy': {
        host: 'NODE_JSDOM_REAL_ST_WASM',
        family: 'trigger',
        mode: 'callback-destroy',
        cohort: true,
    },
    'cohort-trigger-dual-sensor': {
        host: 'NODE_JSDOM_REAL_ST_WASM',
        family: 'trigger',
        mode: 'dual-sensor',
        cohort: true,
    },
    'cohort-trigger-compound': { host: 'NODE_JSDOM_REAL_ST_WASM', family: 'trigger', mode: 'compound', cohort: true },
    'cohort-trigger-callback-fault': {
        host: 'NODE_JSDOM_REAL_ST_WASM',
        family: 'trigger',
        mode: 'callback-fault',
        cohort: true,
    },
    'cohort-query-target-support': { host: 'NODE_JSDOM_REAL_ST_WASM', family: 'query', mode: 'healthy', cohort: true },
    'cohort-collision-healthy': { host: 'NODE_JSDOM_REAL_ST_WASM', family: 'collision', mode: 'healthy', cohort: true },
    'cohort-fixed-healthy': { host: 'NODE_JSDOM_REAL_ST_WASM', family: 'fixed', mode: 'healthy', cohort: true },
    'cohort-fixed-intentional-fault': {
        host: 'NODE_JSDOM_REAL_ST_WASM',
        family: 'fixed',
        mode: 'intentional-fault',
        cohort: true,
    },
    'cohort-fixed-idle-enabled-reentry': {
        host: 'NODE_JSDOM_REAL_ST_WASM',
        family: 'fixed',
        mode: 'idle-enabled-reentry',
        cohort: true,
    },
    'cohort-hinge-healthy': { host: 'NODE_JSDOM_REAL_ST_WASM', family: 'hinge', mode: 'healthy', cohort: true },
    'cohort-hinge-intentional-fault': {
        host: 'NODE_JSDOM_REAL_ST_WASM',
        family: 'hinge',
        mode: 'intentional-fault',
        cohort: true,
    },
    'cohort-hinge-idle-enabled-reentry': {
        host: 'NODE_JSDOM_REAL_ST_WASM',
        family: 'hinge',
        mode: 'idle-enabled-reentry',
        cohort: true,
    },
    'cohort-p2p-healthy': { host: 'NODE_JSDOM_REAL_ST_WASM', family: 'p2p', mode: 'healthy', cohort: true },
    'cohort-p2p-intentional-fault': {
        host: 'NODE_JSDOM_REAL_ST_WASM',
        family: 'p2p',
        mode: 'intentional-fault',
        cohort: true,
    },
    'cohort-contact-box-box': {
        host: 'NODE_JSDOM_REAL_ST_WASM',
        family: 'contact',
        mode: 'healthy',
        contactFamily: 'box-box',
        cohort: true,
    },
    'cohort-contact-capsule-box': {
        host: 'NODE_JSDOM_REAL_ST_WASM',
        family: 'contact',
        mode: 'healthy',
        contactFamily: 'capsule-box',
        cohort: true,
    },
    'cohort-contact-capsule-capsule': {
        host: 'NODE_JSDOM_REAL_ST_WASM',
        family: 'contact',
        mode: 'healthy',
        contactFamily: 'capsule-capsule',
        cohort: true,
    },
    'resource-budget-contract': {
        host: 'NODE_CONTRACT_ONLY',
        test: 'resource-budget-contract.test.cjs',
        count: 4,
        inputs: [
            'docs/physics/box3d/contracts/acceptance-resources.json',
            'docs/physics/box3d/contracts/performance-budget-initial.json',
        ],
    },
    'collision-healthy': { host: 'NODE_JSDOM_REAL_ST_WASM', mode: 'healthy', family: 'collision' },
    'hinge-idle-reentry-fault': { host: 'NODE_JSDOM_REAL_ST_WASM', mode: 'idle-enabled-reentry', family: 'hinge' },
    'fixed-idle-reentry-fault': { host: 'NODE_JSDOM_REAL_ST_WASM', mode: 'idle-enabled-reentry', family: 'fixed' },
    'hinge-healthy': { host: 'NODE_JSDOM_REAL_ST_WASM', mode: 'healthy', family: 'hinge' },
    'hinge-expected-fault': { host: 'NODE_JSDOM_REAL_ST_WASM', mode: 'intentional-fault', family: 'hinge' },
    'fixed-healthy': { host: 'NODE_JSDOM_REAL_ST_WASM', mode: 'healthy', family: 'fixed' },
    'fixed-expected-fault': { host: 'NODE_JSDOM_REAL_ST_WASM', mode: 'intentional-fault', family: 'fixed' },
});
function hashFiles(files) {
    const sorted = [...new Set(files.map((file) => path.resolve(file)))].sort();
    return sorted.map((file) => ({
        file,
        sha256: sha(fs.readFileSync(file)),
        ...(fs.lstatSync(file).isSymbolicLink() ? { symlinkTarget: fs.readlinkSync(file) } : {}),
    }));
}
function verifyRows(rows) {
    assert.deepEqual(hashFiles(rows.map((row) => row.file)), rows, 'Input/output bytes changed');
}
async function prepare(id, options = {}) {
    const entry = registry[id];
    assert(entry?.cohort, 'Manifest-v2 runner accepts only the original cohort cases');
    const sourceRoot = path.resolve(options.sourceRoot ?? ROOT);
    let files = [
            __filename,
            require.resolve('./capture.cjs'),
            require.resolve('./cohort.cjs'),
            require.resolve('./query-oracle.cjs'),
            require.resolve('./trigger-oracle.cjs'),
            require.resolve('./sku-oracle.cjs'),
            process.execPath,
        ],
        args;
    let cohortData;
    if (entry.cohort) {
        cohortData = prepareCohort(entry, options);
        files.push(...cohortData.files);
        args = cohortData.args;
    } else if (entry.test) {
        const fixture = path.join(ROOT, 'tools/verify/box3d', entry.test);
        files.push(fixture, ...entry.inputs.map((file) => path.join(ROOT, file)));
        args = ['--test', '--test-reporter=tap', fixture];
    } else {
        assert(options.artifacts && options.lock, 'Fixed cases require artifacts and an existing frozen input lock');
        const dir = path.join(sourceRoot, 'tools/verify/box3d', families[entry.family]);
        if (sourceRoot !== ROOT) {
            const captured = read(path.join(sourceRoot, 'capture.json'));
            assert.equal(captured.family, entry.family);
            assert.equal(captured.lockSha256, sha(fs.readFileSync(options.lock)));
            for (const row of captured.files)
                assert.equal(
                    sha(fs.readFileSync(path.join(sourceRoot, row.path))),
                    row.sha256,
                    'Captured source changed',
                );
            files.push(path.join(sourceRoot, 'capture.json'));
        }
        if (entry.family === 'collision')
            assert.deepEqual(
                fs.readFileSync(options.lock),
                fs.readFileSync(path.join(dir, 'inputs.lock.json')),
                'Collision lock must match the captured fixture',
            );
        const { verifyInputs } = await import(pathToFileURL(path.join(dir, 'inputs.mjs')).href);
        const verified = verifyInputs(path.resolve(options.artifacts), path.resolve(options.lock));
        files.push(
            path.resolve(options.lock),
            ...verified.runtime.map((r) => path.resolve(options.artifacts, r.path)),
            ...verified.source.map((r) => path.join(sourceRoot, r.path)),
            ...verified.fixture.map((r) => path.join(sourceRoot, r.path)),
            ...dependencyFiles(sourceRoot),
        );
        args =
            entry.family === 'collision'
                ? [path.join(dir, 'consumer.mjs'), path.resolve(options.artifacts), '$OUTPUT']
                : [
                      path.join(dir, 'consumer.mjs'),
                      path.resolve(options.artifacts),
                      path.resolve(options.lock),
                      '$OUTPUT',
                      entry.mode,
                  ];
    }
    return {
        schema: 'box3d-campaign-snapshot-v1',
        caseId: id,
        host: entry.host,
        scope: 'SUPPLEMENTAL_NO_FORMAL_CELL_CREDIT',
        node: process.version,
        executable: process.execPath,
        cwd: sourceRoot,
        options: entry.test
            ? {}
            : { artifacts: path.resolve(options.artifacts), lock: path.resolve(options.lock), sourceRoot },
        args,
        timeoutMs: 180000,
        expected: entry.mode && entry.mode !== 'healthy' ? 'EXPECTED_FAULT' : 'POSITIVE',
        ...(cohortData
            ? {
                  environment: cohortData.env,
                  cohortIdentity: cohortData.cohortIdentity,
                  cohortFixtureVersion: cohortData.fixtureVersion,
              }
            : {}),
        inputs: hashFiles(files),
    };
}
async function freeze(id, options, file) {
    const snapshot = await prepare(id, options);
    write(file, snapshot);
    return snapshot;
}
function validateSnapshot(snapshot) {
    assert.equal(snapshot.schema, 'box3d-campaign-snapshot-v1');
    assert(registry[snapshot.caseId]);
    assert.equal(snapshot.node, process.version);
    assert.equal(snapshot.executable, process.execPath);
    assert(path.isAbsolute(snapshot.cwd));
    assert.equal(snapshot.host, registry[snapshot.caseId].host);
    assert.equal(snapshot.scope, 'SUPPLEMENTAL_NO_FORMAL_CELL_CREDIT');
    assert.equal(snapshot.timeoutMs, 180000);
    verifyRows(snapshot.inputs);
}
async function dispatch(snapshotFile, out) {
    const snapshot = read(snapshotFile);
    validateSnapshot(snapshot);
    // Reconstruct the allowlisted command and complete dependency list, not a supplied command.
    const fresh = await prepare(snapshot.caseId, snapshot.options);
    assert.deepEqual(snapshot, fresh, 'Snapshot no longer matches registered command/inputs');
    fs.mkdirSync(out); // exclusive: never merge into or overwrite an earlier attempt
    const snapshotBytes = fs.readFileSync(snapshotFile);
    fs.writeFileSync(path.join(out, 'snapshot.json'), snapshotBytes, { flag: 'wx' });
    const startedAt = new Date().toISOString();
    const args = snapshot.args.map((arg) => (arg === '$OUTPUT' ? path.resolve(out) : arg));
    const stdout = fs.openSync(path.join(out, 'stdout.txt'), 'wx');
    const stderr = fs.openSync(path.join(out, 'stderr.txt'), 'wx');
    let child;
    try {
        child = spawnSync(snapshot.executable, args, {
            cwd: snapshot.cwd,
            stdio: ['ignore', stdout, stderr],
            timeout: snapshot.timeoutMs,
            killSignal: 'SIGKILL',
            env: { ...process.env, NODE_OPTIONS: '', NODE_TEST_CONTEXT: undefined, ...(snapshot.environment ?? {}) },
        });
    } finally {
        fs.closeSync(stdout);
        fs.closeSync(stderr);
    }
    let inputError = null;
    try {
        verifyRows(snapshot.inputs);
        prepareCohort(registry[snapshot.caseId], snapshot.options);
    } catch (error) {
        inputError = String(error);
    }
    const outputs = ['stdout.txt', 'stderr.txt', 'consumer.raw.json']
        .filter((name) => fs.existsSync(path.join(out, name)))
        .map((name) => ({ name, sha256: sha(fs.readFileSync(path.join(out, name))) }));
    const receipt = {
        schema: 'box3d-campaign-attempt-v1',
        snapshotSha256: sha(snapshotBytes),
        startedAt,
        completedAt: new Date().toISOString(),
        command: [snapshot.executable, ...args],
        exitCode: child.status,
        signal: child.signal,
        spawnError: child.error ? String(child.error) : null,
        inputError,
        outputs,
    };
    write(path.join(out, 'receipt.json'), receipt);
    return receipt;
}
function classify(snapshot, receipt, stdout, raw) {
    if (receipt.inputError) return 'STALE_INPUT';
    if (receipt.spawnError || receipt.signal || receipt.exitCode === null) return 'FAIL_INFRA';
    const entry = registry[snapshot.caseId];
    if (entry.cohort && JSON.stringify(raw?.cohortIdentity) !== JSON.stringify(snapshot.cohortIdentity))
        return 'INVALID_RESULT';
    if (entry.family === 'sku') return classifySku(receipt, raw, entry.mode, snapshot.cohortFixtureVersion);
    if (entry.family === 'trigger') return classifyTrigger(receipt, raw, entry.mode);
    if (entry.family === 'query')
        return classifyQuery(receipt, raw, { requirePositiveGap: snapshot.cohortFixtureVersion >= 3 });
    if (entry.test) {
        if (receipt.exitCode !== 0) return 'FAIL_TEST'; // Contract failure, not automatically a product defect.
        for (const [key, count] of Object.entries({
            tests: entry.count,
            pass: entry.count,
            fail: 0,
            cancelled: 0,
            skipped: 0,
            todo: 0,
        })) {
            if (!new RegExp(`^# ${key} ${count}$`, 'm').test(stdout)) return 'INVALID_RESULT';
        }
        return 'PASS_LIMITED';
    }
    if (entry.family === 'collision' || entry.family === 'contact') {
        if (!raw || raw.schema !== 'box3d-production-esm-public-collision-consumer-v1' || !raw.completedAt)
            return 'INVALID_RESULT';
        if (raw.hostErrors?.length) return 'FAIL_INFRA';
        if (receipt.exitCode !== 0)
            return raw.checks?.some((c) => c.pass === false) ? 'FAIL_PRODUCT' : 'FAIL_UNCLASSIFIED';
        if (
            raw.status !== 'PASS_LIMITED_PRODUCTION_ESM_COLLISION' ||
            !raw.inputsUnchanged ||
            raw.checks?.length !== (entry.family === 'contact' ? 22 : 21) ||
            !raw.checks.every((c) => c.pass === true)
        )
            return 'INVALID_RESULT';
        if (raw.close?.status !== 'released' || raw.close?.physicsPreparation?.status !== 'closed')
            return 'INVALID_RESULT';
        if (!Array.isArray(raw.events) || !raw.events.length) return 'INVALID_RESULT';
        if (entry.family === 'contact' && raw.contactFamily !== entry.contactFamily) return 'INVALID_RESULT';
        for (const self of entry.family === 'contact'
            ? ['static-support', 'falling-item']
            : ['static-box', 'falling-sphere']) {
            const events = raw.events.filter((e) => e.self === self);
            for (const kind of ['onCollisionEnter', 'onCollisionStay', 'onCollisionExit'])
                if (!events.some((e) => e.type === kind)) return 'INVALID_RESULT';
            if (events.filter((e) => e.type === 'onCollisionEnter').length < 2) return 'INVALID_RESULT';
        }
        const rest = raw.checks.find(
            (c) =>
                c.name ===
                (entry.family === 'contact' ? 'Actual family item rests on peer' : 'Real sphere rests on the box'),
        )?.detail;
        if (!Array.isArray(rest) || rest.length !== 3 || !rest.every(Number.isFinite)) return 'INVALID_RESULT';
        const expectedHeight = entry.family === 'contact' && entry.contactFamily !== 'box-box' ? 0.8 : 0.5;
        if (Math.abs(rest[1] - expectedHeight) >= 0.08) return 'FAIL_PRODUCT';
        const getters = [
            'getLocalPointOnA',
            'getLocalPointOnB',
            'getWorldPointOnA',
            'getWorldPointOnB',
            'getLocalNormalOnA',
            'getLocalNormalOnB',
            'getWorldNormalOnA',
            'getWorldNormalOnB',
        ];
        for (const event of raw.events) {
            if (!Array.isArray(event.contacts) || (event.type !== 'onCollisionExit' && !event.contacts.length))
                return 'INVALID_RESULT';
            for (const contact of event.contacts) {
                if (typeof contact.isBodyA !== 'boolean') return 'INVALID_RESULT';
                for (const key of getters)
                    if (
                        !Array.isArray(contact[key]) ||
                        contact[key].length !== 3 ||
                        !contact[key].every(Number.isFinite)
                    )
                        return 'INVALID_RESULT';
                for (const key of ['getWorldNormalOnA', 'getWorldNormalOnB'])
                    if (Math.abs(Math.hypot(...contact[key]) - 1) >= 0.0003) return 'FAIL_PRODUCT';
                if (entry.family === 'contact')
                    for (let axis = 0; axis < 3; axis++)
                        if (
                            Math.abs(
                                contact.getWorldNormalOnA[axis] -
                                    (contact.isBodyA ? 1 : -1) * contact.getWorldNormalOnB[axis],
                            ) >= 0.00002
                        )
                            return 'FAIL_PRODUCT';
            }
        }
        return 'PASS_LIMITED';
    }
    if (
        !raw ||
        raw.schema !==
            `box3d-production-esm-public-${entry.family === 'p2p' ? 'point-to-point' : entry.family}-consumer-v1` ||
        raw.mode !== entry.mode ||
        !raw.completedAt
    )
        return 'INVALID_RESULT';
    if (raw.hostErrors?.length) return 'FAIL_INFRA';
    if (receipt.exitCode !== 0) return raw.checks?.some((c) => c.pass === false) ? 'FAIL_PRODUCT' : 'FAIL_UNCLASSIFIED';
    if (
        !raw.inputsUnchanged ||
        !Array.isArray(raw.checks) ||
        raw.checks.length < 15 ||
        !raw.checks.every((c) => c.pass === true)
    )
        return 'INVALID_RESULT';
    if (raw.close?.physicsPreparation?.status !== 'closed' || raw.close.physicsPreparation.cleanupErrors.length)
        return 'INVALID_RESULT';
    if (entry.mode !== 'healthy') {
        return raw.status ===
            `PASS_EXPECTED_PUBLIC_${entry.family === 'p2p' ? 'POINT_TO_POINT' : entry.family.toUpperCase()}_FAULT` &&
            raw.checks.some(
                (c) =>
                    c.name ===
                    (entry.mode === 'idle-enabled-reentry'
                        ? entry.family === 'hinge'
                            ? 'Caught recursive enabled setter poisons the exact original idle activity operation'
                            : 'Caught recursive enabled request poisons the exact original idle activity operation'
                        : entry.family === 'p2p'
                          ? 'Real collision callback preserves the deliberate exact Error identity'
                          : entry.family === 'hinge'
                            ? 'Actual collision callback preserves exact thrown Error identity'
                            : 'Isolated deliberate fault preserves original thrown callback identity'),
            )
            ? 'EXPECTED_FAULT_OBSERVED'
            : 'INVALID_RESULT';
    }
    if (entry.family === 'p2p') {
        if (
            raw.status !== 'PASS_LIMITED_PUBLIC_POINT_TO_POINT' ||
            raw.healthyComplete !== true ||
            raw.drift?.length !== 1200
        )
            return 'INVALID_RESULT';
        for (const sample of raw.drift)
            if (
                ![sample.independentSeparation, sample.nativeSeparation].every(
                    (v) => Number.isFinite(v) && v >= 0 && v <= 0.02,
                )
            )
                return 'FAIL_PRODUCT';
        return 'PASS_LIMITED';
    }
    if (entry.family === 'hinge') {
        if (raw.status !== 'PASS_LIMITED_PUBLIC_HINGE' || raw.healthyComplete !== true || raw.drift?.length !== 1200)
            return 'INVALID_RESULT';
        for (const sample of raw.drift) {
            const values = [
                sample.independentSeparation,
                sample.independentAlignment,
                sample.nativeSeparation,
                sample.nativeAlignment,
            ];
            if (!values.every((v) => Number.isFinite(v) && v >= 0 && v <= 0.02)) return 'FAIL_PRODUCT';
        }
        return 'PASS_LIMITED';
    }
    if (raw.status !== 'PASS_LIMITED_PUBLIC_FIXED' || raw.healthyComplete !== true || raw.drift?.length !== 600)
        return 'INVALID_RESULT';
    for (const sample of raw.drift) {
        const values = [
            sample.pairError?.linear,
            sample.pairError?.angular,
            sample.anchorError?.linear,
            sample.anchorError?.angular,
            ...(sample.pairNative ?? []),
            ...(sample.anchorNative ?? []),
        ];
        if (values.length !== 8 || !values.every((v) => Number.isFinite(v) && v >= 0 && v <= 0.02))
            return 'FAIL_PRODUCT';
    }
    return 'PASS_LIMITED';
}
function importAttempt(out, destination, trustedSnapshotFile) {
    assert(trustedSnapshotFile, 'Import requires the independently retained input snapshot');
    const snapshotBytes = fs.readFileSync(path.join(out, 'snapshot.json'));
    assert.deepEqual(
        snapshotBytes,
        fs.readFileSync(trustedSnapshotFile),
        'Attempt input identity differs from independent snapshot',
    );
    const snapshot = JSON.parse(snapshotBytes),
        receipt = read(path.join(out, 'receipt.json'));
    assert.equal(receipt.schema, 'box3d-campaign-attempt-v1');
    assert.equal(snapshot.schema, 'box3d-campaign-snapshot-v1');
    assert.equal(snapshot.scope, 'SUPPLEMENTAL_NO_FORMAL_CELL_CREDIT');
    assert.deepEqual(receipt.command, [
        snapshot.executable,
        ...snapshot.args.map((a) => (a === '$OUTPUT' ? path.resolve(out) : a)),
    ]);
    assert(
        Number.isFinite(Date.parse(receipt.startedAt)) &&
            Date.parse(receipt.completedAt) >= Date.parse(receipt.startedAt),
    );
    assert.equal(receipt.snapshotSha256, sha(snapshotBytes));
    assert(registry[snapshot.caseId]);
    assert.equal(snapshot.host, registry[snapshot.caseId].host);
    assert.equal(new Set(receipt.outputs.map((r) => r.name)).size, receipt.outputs.length);
    for (const row of receipt.outputs) {
        assert(['stdout.txt', 'stderr.txt', 'consumer.raw.json'].includes(row.name));
        assert.equal(sha(fs.readFileSync(path.join(out, row.name))), row.sha256, 'Retained output changed');
    }
    assert(
        receipt.outputs.some((r) => r.name === 'stdout.txt') && receipt.outputs.some((r) => r.name === 'stderr.txt'),
    );
    const raw = receipt.outputs.some((r) => r.name === 'consumer.raw.json')
        ? read(path.join(out, 'consumer.raw.json'))
        : null;
    const result = {
        schema: 'box3d-campaign-import-v1',
        caseId: snapshot.caseId,
        host: snapshot.host,
        status: classify(snapshot, receipt, fs.readFileSync(path.join(out, 'stdout.txt'), 'utf8'), raw),
        attemptSha256: sha(fs.readFileSync(path.join(out, 'receipt.json'))),
        snapshotSha256: sha(snapshotBytes),
        ...(snapshot.cohortIdentity ? { cohortIdentity: snapshot.cohortIdentity } : {}),
        formalCellCredit: [],
        gateStatus: 'NOT_RUN',
        scope: 'SUPPLEMENTAL_NO_FORMAL_CELL_CREDIT',
    };
    write(destination, result);
    return result;
}
async function batch(planFile, out) {
    const bytes = fs.readFileSync(planFile),
        plan = JSON.parse(bytes);
    assert.equal(plan.schema, 'box3d-campaign-batch-v1');
    assert.equal(plan.requireSameBuild, true, 'Manifest-v2 requires exact same runtime and fixture identity');
    assert.deepEqual(
        plan.cases.map((c) => c.caseId).sort(),
        Object.keys(registry)
            .filter((id) => registry[id].cohort)
            .sort(),
        'Require the complete original 22-case set',
    );
    assert(Array.isArray(plan.cases) && plan.cases.length > 0 && plan.cases.length <= Object.keys(registry).length);
    assert.equal(new Set(plan.cases.map((c) => c.caseId)).size, plan.cases.length, 'Duplicate case identity');
    for (const item of plan.cases) assert(registry[item.caseId], 'Unknown registered case');
    if (plan.requireSameBuild === true)
        assertOneCohort(
            plan.cases.map((c) =>
                registry[c.caseId].cohort ? prepareCohort(registry[c.caseId], c.options).cohortIdentity : null,
            ),
            true,
        );
    fs.mkdirSync(out);
    fs.writeFileSync(path.join(out, 'plan.json'), bytes, { flag: 'wx' });
    const results = [];
    for (const item of plan.cases) {
        const caseDir = path.join(out, item.caseId);
        fs.mkdirSync(caseDir);
        const snapshot = path.join(caseDir, 'snapshot.json'),
            attempt = path.join(caseDir, 'attempt'),
            resultFile = path.join(caseDir, 'result.json');
        let stage = 'PREFLIGHT';
        try {
            await freeze(item.caseId, item.options ?? {}, snapshot);
            stage = 'DISPATCH';
            await dispatch(snapshot, attempt);
            stage = 'IMPORT';
            results.push(importAttempt(attempt, resultFile, snapshot));
        } catch (error) {
            const result = {
                caseId: item.caseId,
                status: stage === 'IMPORT' ? 'INVALID_RESULT' : 'BLOCKED',
                stage,
                reason: String(error.stack ?? error),
                formalCellCredit: [],
                gateStatus: 'NOT_RUN',
            };
            write(resultFile, result);
            results.push(result);
        }
    }
    const counts = {};
    for (const result of results) counts[result.status] = (counts[result.status] ?? 0) + 1;
    const summary = {
        schema: 'box3d-campaign-batch-summary-v1',
        planSha256: sha(bytes),
        status: results.every((r) => ['PASS_LIMITED', 'EXPECTED_FAULT_OBSERVED'].includes(r.status))
            ? 'COMPLETED_LIMITED'
            : 'COMPLETED_WITH_BLOCKERS_OR_FAILURES',
        counts,
        requireSameBuild: plan.requireSameBuild === true,
        ...(plan.requireSameBuild ? { cohortIdentity: results.find((r) => r.cohortIdentity)?.cohortIdentity } : {}),
        cases: results,
        formalPassCount: 0,
        gateStatus: 'NOT_RUN',
        scope: 'SUPPLEMENTAL_NO_FORMAL_CELL_CREDIT',
        completedAt: new Date().toISOString(),
    };
    write(path.join(out, 'summary.json'), summary);
    return summary;
}
function inventory(root = ROOT) {
    try {
        const resolved = require('../inventory-freeze-v1.cjs').resolveFrozenV1(root);
        return {
            status: 'RESOLVED_NOT_ACCEPTANCE',
            cells: resolved.requiredCells.map((c) => ({
                cellId: c.cellId,
                executionStatus: 'NOT_RUN',
                blockedResourceIds: c.blockedResourceIds,
                readinessStatus: c.blockedResourceIds.length ? 'BLOCKED' : 'NOT_RUN',
            })),
            gateStatus: 'NOT_RUN',
            formalPassCount: 0,
        };
    } catch (error) {
        return { status: 'BLOCKED', reason: String(error), gateStatus: 'BLOCKED', formalPassCount: 0 };
    }
}
if (require.main === module)
    (async () => {
        const [action, ...args] = process.argv.slice(2);
        let result;
        if (action === 'freeze' && (args.length === 2 || args.length === 4 || args.length === 5))
            result = await freeze(args[0], { artifacts: args[2], lock: args[3], sourceRoot: args[4] }, args[1]);
        else if (action === 'freeze-manifest' && args.length === 2) result = freezeCohort(...args);
        else if (action === 'batch' && args.length === 2) result = await batch(...args);
        else if (action === 'run' && args.length === 2) result = await dispatch(args[0], args[1]);
        else if (action === 'import' && args.length === 3) result = importAttempt(args[0], args[1], args[2]);
        else
            throw Error(
                'Use freeze-manifest config newLock | batch complete22Plan newDirectory | freeze cohortCase newSnapshot artifacts lock sourceRoot | run snapshot newDirectory | import attempt newResult independentSnapshot',
            );
        console.log(JSON.stringify(result, null, 2));
    })().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
module.exports = {
    freezeCohort,
    batch,
    capture,
    ROOT,
    registry,
    sha,
    freeze,
    dispatch,
    importAttempt,
    classify,
    inventory,
};
