/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Synthetic receipt/identity controls only. No SDK import or WASM instantiation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { freezeInputs } from './freeze.mjs';
import {
    validateProvenance,
    loadLock,
    validateProducerObjects,
    validateNativeIdentity,
    validateNativeLayout,
    validateStorageContracts,
    requireDiagnosticExports,
    SDK_FILES,
    ST_FILES,
    RECEIPT_KEYS,
    PROVENANCE_SCHEMA,
    IMPORTED_FILES,
    RUNNER_FILES,
    here,
    entry,
    sha,
} from './inputs.mjs';
import {
    SCHEMA_SHA256,
    NATIVE_IDENTITY,
    NATIVE_PRODUCER_COMMIT,
    NATIVE_RESULT_SHA256,
    NATIVE_RELATIVE_OUTPUT,
    HISTORICAL_REPLAY,
    DTS_DRIVER_SHA256,
} from './profile.mjs';
const H = 'a'.repeat(64),
    P = 'b'.repeat(40),
    N = NATIVE_PRODUCER_COMMIT;
const file = (path) => ({ path, bytes: 1, sha256: H });
function synthetic() {
    const nativeRoot = '/cpu/native-producer',
        stRoot = nativeRoot + '/' + NATIVE_RELATIVE_OUTPUT;
    const sdkRoot = '/cpu/sdk',
        dtsRoot = '/cpu/dts-source',
        driverRoot = '/cpu/dts-supervision';
    const provenance = {
        schema: PROVENANCE_SCHEMA,
        runtimeBuildNumber: 230,
        runtimeProducerCommit: P,
        nativeProducerCommit: N,
        fixtureCommit: 'd'.repeat(40),
        receipts: Object.fromEntries(RECEIPT_KEYS.map((name) => [name, file(name + '.json')])),
    };
    provenance.receipts.native.sha256 = NATIVE_RESULT_SHA256;
    provenance.receipts.dtsDriver.sha256 = DTS_DRIVER_SHA256;
    const sdk = SDK_FILES.map(file),
        st = ST_FILES.map(file);
    const closed = (sourceCommit) => ({
        sourceCommit,
        exitCode: 0,
        abort: null,
        postInputDrift: [],
        inputDrift: [],
        remainingDescendants: [],
        physicalClose: 'ECHILD_AND_NO_GROUP_MEMBERS',
    });
    const commands = ['build-dts', 'dts-inputs.test', 'dts-external-types.test', 'dts-symbols.test'].map(
        (name, index) =>
            index === 0
                ? ['/cpu/node', '--max-old-space-size=2048', 'tools/build/' + name + '.cjs']
                : ['/cpu/node', 'tools/build/' + name + '.cjs'],
    );
    for (const name of ['app', 'mesh', 'terrain'])
        commands.push([
            '/cpu/node',
            '/cpu/node_modules/typescript/bin/tsc',
            '-p',
            driverRoot + '/consumers/' + name + '.json',
        ]);
    const gates = commands.map((command, index) => ({ index: index + 1, command, cwd: dtsRoot, exitCode: 0 }));
    const nativeCommands = Array.from({ length: 41 }, () => ({
        command: '/cpu/node',
        args: ['explicit-synthetic-control'],
        exitCode: 0,
        error: null,
    }));
    nativeCommands[0].args = ['tools/physics/box3d/query-admission-contract.mjs'];
    nativeCommands[39].args = ['<repo>/' + NATIVE_RELATIVE_OUTPUT + '/air_box3d_world_storage_contract.cjs'];
    nativeCommands[40].args = ['tools/physics/box3d/wasm-storage-contract.mjs', '<repo>/' + NATIVE_RELATIVE_OUTPUT];
    const esmFiles = sdk.filter((item) => !item.path.endsWith('.d.ts'));
    const receipts = {
        esm: {
            ...closed(P),
            status: 'PASS_FRESH_ESM230_BUILD',
            buildNumber: 230,
            budget: {
                source: nativeRoot,
                out: sdkRoot,
                sourceCommit: P,
                nativeProducer: N,
                nativeResult: { ...file('/cpu/native.json'), sha256: NATIVE_RESULT_SHA256 },
                stRoot,
                stFiles: ['box3d-st.mjs', 'box3d-st.wasm', 'facade.mjs', 'facade.d.mts', 'manifest.json'].map((name) =>
                    file(stRoot + '/' + name),
                ),
            },
            files: esmFiles,
        },
        dts: {
            ...closed(P),
            status: 'PASS_FRESH_DTS230_SEVEN_GATES',
            buildNumber: 230,
            budget: {
                source: dtsRoot,
                producerSource: nativeRoot,
                evidence: '/cpu/dts-evidence',
                out: dtsRoot + '/build',
                sdk: sdkRoot,
                sourceCommit: P,
                esmResult: file('/cpu/esm.json'),
                esmFiles,
                command: ['/cpu/python', '-B', driverRoot + '/driver.py'],
                protectedRoots: [driverRoot + '/driver.json'],
            },
            sevenGatesSha256: H,
            sevenGates: gates,
            declarations: ['cocosair.module.d.ts', 'cocosair.legacy.d.ts'].map((name) => ({
                ...file(name),
                emittedSource: dtsRoot + '/build/' + name,
            })),
        },
        dtsGates: gates,
        dtsDriver: { commands, cwd: dtsRoot, evidence: '/cpu/dts-evidence' },
        native: {
            sourceProducer: N,
            status: 'PASS_LIMITED_ST_BUILD_AND_STORAGE_QUALIFICATION',
            exitCode: 0,
            abort: null,
            physicalClose: 'ECHILD',
            inputDrift: [],
            remainingDescendants: [],
            budget: {
                source: nativeRoot,
                out: stRoot,
                sourceCommit: N,
                command: [
                    '/bin/bash',
                    '-c',
                    'exec "/cpu/node" tools/physics/box3d/build-ready.mjs --out "' + stRoot + '"',
                ],
            },
            commands: nativeCommands,
            inputCount: 111,
            compiledSourceCount: 85,
            evidenceCount: 58,
            schemaSha256: SCHEMA_SHA256,
            storageQualification: {
                status: 'PASS_LIMITED_PRODUCTION_EMPTY_STORAGE_CONTRACT',
                appC20Acceptance: false,
                afterCloseAppObservation: 'UNAVAILABLE',
                sameWorldOnly: true,
            },
            completionFiles: [
                'build-receipt.json',
                'artifact-audit.raw.json',
                'manifest.json',
                'consumer-ready.json',
            ].map((name) => file(stRoot + '/' + name)),
            artifacts: ['box3d-st.mjs', 'box3d-st.wasm', 'facade.mjs', 'facade.d.mts'].map(file),
        },
    };
    return { provenance, receipts, sdk, st };
}

function validate(value) {
    return validateProducerObjects(value.provenance, value.receipts, value.sdk, value.st);
}

test('explicit synthetic receipts satisfy only pure CPU parser, not a real input freeze', () => validate(synthetic()));
test('exact declared file sets are SDK25/ST10/runner12/imported10', () => {
    assert.equal(SDK_FILES.length, 25);
    assert.equal(ST_FILES.length, 10);
    assert.equal(RUNNER_FILES.length, 12);
    assert.equal(IMPORTED_FILES.length, 10);
});
for (const [label, change] of [
    [
        'missing real receipt declaration',
        (v) => {
            delete v.provenance.receipts.native;
        },
    ],
    [
        'SDK225 declaration',
        (v) => {
            v.provenance.runtimeBuildNumber = 225;
        },
    ],
    [
        'unbound fixture commit',
        (v) => {
            v.provenance.fixtureCommit = 'HEAD';
        },
    ],
    [
        'absolute receipt path',
        (v) => {
            v.provenance.receipts.esm.path = '/fake/receipt';
        },
    ],
    [
        'traversing receipt path',
        (v) => {
            v.provenance.receipts.esm.path = '../fake/receipt';
        },
    ],
    [
        'changed actual native receipt hash',
        (v) => {
            v.provenance.receipts.native.sha256 = H;
        },
    ],
    [
        'old ESM status',
        (v) => {
            v.receipts.esm.status = 'PASS_FRESH_ESM225_BUILD';
        },
    ],
    [
        'old ESM number',
        (v) => {
            v.receipts.esm.buildNumber = 225;
        },
    ],
    [
        'wrong runtime producer',
        (v) => {
            v.receipts.esm.sourceCommit = N;
        },
    ],
    [
        'runtime source drift',
        (v) => {
            v.receipts.esm.postInputDrift = ['changed'];
        },
    ],
    [
        'failed runtime close',
        (v) => {
            v.receipts.esm.physicalClose = 'SIGNALLED';
        },
    ],
    [
        'runtime nonzero exit',
        (v) => {
            v.receipts.esm.exitCode = 1;
        },
    ],
    [
        'runtime abort',
        (v) => {
            v.receipts.esm.abort = 'TIMEOUT';
        },
    ],
    [
        'old ST producer',
        (v) => {
            v.receipts.esm.budget.nativeProducer = P;
        },
    ],
    [
        'missing SDK file',
        (v) => {
            v.receipts.esm.files.pop();
        },
    ],
    [
        'unrecorded SDK substitute',
        (v) => {
            v.sdk = v.sdk.map((item) =>
                item.path === 'cocosair.module.js' ? { ...item, sha256: 'f'.repeat(64) } : item,
            );
        },
    ],
    [
        'wrong ST hash used by ESM',
        (v) => {
            v.receipts.esm.budget.stFiles[0].sha256 = 'f'.repeat(64);
        },
    ],
    [
        'wrong ESM native readiness receipt binding',
        (v) => {
            v.receipts.esm.budget.nativeResult.sha256 = 'f'.repeat(64);
        },
    ],
    [
        'old DTS status',
        (v) => {
            v.receipts.dts.status = 'PASS_FRESH_DTS225_SEVEN_GATES';
        },
    ],
    [
        'DTS different runtime receipt',
        (v) => {
            v.receipts.dts.budget.esmResult.sha256 = 'f'.repeat(64);
        },
    ],
    [
        'DTS gate hash mismatch',
        (v) => {
            v.receipts.dts.sevenGatesSha256 = 'f'.repeat(64);
        },
    ],
    [
        'missing DTS declaration',
        (v) => {
            v.receipts.dts.declarations.pop();
        },
    ],
    [
        'six DTS gates',
        (v) => {
            v.receipts.dtsGates.pop();
        },
    ],
    [
        'DTS gate skipped',
        (v) => {
            v.receipts.dtsGates[3].exitCode = null;
        },
    ],
    [
        'DTS gate failed',
        (v) => {
            v.receipts.dtsGates[4].exitCode = 1;
        },
    ],
    [
        'DTS changed gate command',
        (v) => {
            v.receipts.dtsGates[0] = { index: 1, command: ['true'], cwd: '/cpu/dts-source', exitCode: 0 };
        },
    ],
    [
        'DTS both declaration and gate replaced',
        (v) => {
            v.receipts.dtsGates[0].command = ['true'];
            v.receipts.dtsDriver.commands[0] = ['true'];
        },
    ],
    [
        'DTS terrain consumer replaced',
        (v) => {
            v.receipts.dtsGates[6].command = ['true'];
            v.receipts.dtsDriver.commands[6] = ['true'];
        },
    ],
    [
        'ST failed',
        (v) => {
            v.receipts.native.status = 'FAIL_OR_PARTIAL';
        },
    ],
    [
        'ST not ECHILD',
        (v) => {
            v.receipts.native.physicalClose = 'PGID_ONLY';
        },
    ],
    [
        'ST old schema',
        (v) => {
            v.receipts.native.schemaSha256 = H;
        },
    ],
    [
        'ST old79 gate',
        (v) => {
            v.receipts.native.inputCount = 92;
        },
    ],
    [
        'ST missing completion',
        (v) => {
            v.receipts.native.completionFiles.shift();
        },
    ],
    [
        'ST duplicate completion',
        (v) => {
            v.receipts.native.completionFiles.push(file('duplicate.json'));
        },
    ],
])
    test('admission negative: ' + label, () => {
        const value = synthetic();
        change(value);
        assert.throws(() => validate(value));
    });

test('new reviewed schema required even with otherwise correct manifest', () => {
    const source = process.env.BOX3D_DIAGNOSTIC_SOURCE_ROOT;
    assert(source, 'Read-only schema source required for CPU check');
    const schema = readFileSync(join(source, 'tools/physics/box3d/abi-schema.json'));
    validateNativeIdentity({ ...NATIVE_IDENTITY, schemaVersion: 1 }, { apiSchemaSha256: SCHEMA_SHA256 }, schema);
    assert.throws(() =>
        validateNativeIdentity(
            { ...NATIVE_IDENTITY, schemaVersion: 1, schemaSha256: H },
            { apiSchemaSha256: SCHEMA_SHA256 },
            schema,
        ),
    );
    assert.throws(() =>
        validateNativeIdentity(
            { ...NATIVE_IDENTITY, schemaVersion: 1 },
            { apiSchemaSha256: SCHEMA_SHA256 },
            Buffer.concat([schema, Buffer.from(' ')]),
        ),
    );
});
function wasmWithExports(names) {
    // Minimal function export module constructed only for WebAssembly.Module export inspection, not instantiated.
    const section = (id, body) => [id, ...leb(body.length), ...body];
    const string = (name) => [...leb(name.length), ...Buffer.from(name)];
    function leb(n) {
        const out = [];
        do {
            let b = n & 127;
            n >>>= 7;
            if (n) b |= 128;
            out.push(b);
        } while (n);
        return out;
    }
    return Uint8Array.from([
        0,
        97,
        115,
        109,
        1,
        0,
        0,
        0,
        ...section(1, [1, 96, 0, 0]),
        ...section(3, [1, 0]),
        ...section(7, [...leb(names.length), ...names.flatMap((name) => [...string(name), 0, 0])]),
        ...section(10, [1, 2, 0, 11]),
    ]);
}
test('compile-only exports reject old ST and accept only new required names (not native execution)', () => {
    assert.throws(
        () => requireDiagnosticExports(wasmWithExports(['air_b3_mesh_lifetime_counters'])),
        /diagnostic ST export/,
    );
    assert.throws(() => requireDiagnosticExports(wasmWithExports([])), /export/);
    assert.equal(
        requireDiagnosticExports(
            wasmWithExports([
                'air_b3_mesh_lifetime_counters',
                'air_b3_world_memory_diagnostics_v2',
                'air_b3_world_trim_empty',
            ]),
        ),
        true,
    );
});
test('missing actual producer evidence cannot create a frozen lock', async () => {
    const root = mkdtempSync(join(tmpdir(), 'c20-memory-not-ready-'));
    try {
        const output = join(root, 'never-created-lock.json');
        await assert.rejects(
            freezeInputs({
                sourceRoot: root,
                sdkDir: root,
                stDir: root,
                evidenceRoot: root,
                provenancePath: 'missing.json',
                output,
            }),
            /ENOENT/,
        );
        assert.equal(existsSync(output), false);
        const result = spawnSync(
            process.execPath,
            [join(here, 'freeze.mjs'), root, root, root, root, 'missing.json', output],
            { encoding: 'utf8', timeout: 5000 },
        );
        assert.equal(result.status, 2);
        assert.equal(JSON.parse(result.stderr).status, 'NOT_READY');
        assert.equal(existsSync(output), false);
    } finally {
        rmSync(root, { recursive: true });
    }
});
test('published imports match original bytes; no core fixture or host was forked', () => {
    const root = join(here, '../../../../..');
    for (const item of IMPORTED_FILES) assert.deepEqual(entry(root, item.path), item);
});
test('consumer retains public lifecycle/strict validation and seals side data separately', () => {
    const source = readFileSync(join(here, 'consumer.mjs'), 'utf8');
    assert.equal((source.match(/sdk\.createAirApp\(/g) ?? []).length, 1);
    assert.equal((source.match(/await app\.close\(/g) ?? []).length, 1);
    assert.equal((source.match(/await runObservedSceneCycles\(/g) ?? []).length, 1);
    assert(source.includes('validateResult(report)'));
    assert(source.includes('report.strictStatus = report.status'));
    assert(source.includes('memory-diagnostics.raw.jsonl'));
    assert(source.includes('verifyAfterClose?.()'));
    assert(!/getNativeMemoryDiagnostics\(|physicsWorld\.step|director\.tick|createStepClock\(/.test(source));
    assert(source.indexOf('report.strictStatus = report.status') > source.indexOf('validateResult(report)'));
});
test('existing audited all-descendant closure core is unchanged; PGID alone cannot qualify', () => {
    const script = join(here, 'execute-once.py');
    const program = `import sys,importlib.util\nsys.dont_write_bytecode=True\nspec=importlib.util.spec_from_file_location('cpu_only_wrapper',${JSON.stringify(script)})\nm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\na={'subreaper':True,'waitpidECHILD':True,'waitpidScope':'ALL_CHILDREN_-1','remainingDescendants':[],'remainingProcessGroup':[]}\nassert m.all_descendants_closed(a)\nfor key,value in [('subreaper',False),('waitpidECHILD',False),('waitpidScope','PGID'),('remainingDescendants',[{}]),('remainingProcessGroup',[{}])]:\n b=dict(a);b[key]=value;assert not m.all_descendants_closed(b)\nassert m.BUDGET=={'wallSeconds':334,'rssBytes':2147483648,'outputBytes':58720256}\nassert m.PREPARATION_LIMIT==8388608 and m.TOTAL_LIMIT==67108864\n`;
    const result = spawnSync('python3', ['-c', program], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
    const root = process.env.BOX3D_ORIGINAL_APP_SOURCE_ROOT;
    assert.equal(
        sha(readFileSync(join(root, 'tools/physics/box3d/lifecycle-contract/lowlevel/supervise.py'))),
        'd721d69135c4ab4fc8c09585fe835ff31555f6529525611dfcc29955fd7a021e',
    );
});

// Execute only the actual consumer's finalization block with explicit CPU IO stubs.
// No consumer import, SDK startup, physics, or broad lifecycle replacement occurs.
for (const [label, failures] of [
    ['diagnostic read failure', ['read']],
    ['diagnostic hash failure', ['hash']],
    ['diagnostic close plus read failure', ['close', 'read']],
    ['diagnostic close plus hash failure after strict success', ['close', 'hash']],
])
    test('primary report survives ' + label, () => {
        const source = readFileSync(join(here, 'consumer.mjs'), 'utf8');
        const start = source.indexOf('    try {\n        closeSync(diagnosticJournal);');
        const end = source.indexOf("    record('terminal', {", start);
        assert(start >= 0 && end > start, 'Exact consumer finalization block required');
        const primaryError = 'ORIGINAL_STRICT_BASELINE_FAILURE_36040_112980';
        const strictStatus = label.endsWith('after strict success') ? 'PASS_LIMITED_C20APP_OBSERVABLE_SUBSET' : 'FAIL';
        const report = {
            error: primaryError,
            strictStatus,
            status: strictStatus,
            memoryDiagnosticStatus: 'COMPLETE_REACHED_SCENE_SNAPSHOT_SETS',
        };
        const calls = [];
        vm.runInNewContext(
            source.slice(start, end),
            {
                report,
                diagnosticJournal: 17,
                out: '/cpu-only',
                join,
                closeSync() {
                    calls.push('close');
                    if (failures.includes('close')) throw new Error('CPU_CLOSE_FAILURE');
                },
                readFileSync() {
                    calls.push('read');
                    if (failures.includes('read')) throw new Error('CPU_READ_FAILURE');
                    return Buffer.from('cpu journal');
                },
                sha() {
                    calls.push('hash');
                    if (failures.includes('hash')) throw new Error('CPU_HASH_FAILURE');
                    return H;
                },
            },
            { timeout: 1000 },
        );
        assert.equal(report.error, primaryError);
        assert.equal(report.strictStatus, strictStatus);
        assert.equal(report.status, 'FAIL');
        assert.equal(report.memoryDiagnosticStatus, 'DIAGNOSTIC_FAILURE');
        assert.equal(report.memoryDiagnosticJournal.sha256, null);
        assert.equal(report.memoryDiagnosticJournal.status, 'UNAVAILABLE_READ_OR_HASH_FAILURE');
        assert.match(
            report.diagnosticJournalReadOrHashError,
            failures.includes('read') ? /CPU_READ_FAILURE/ : /CPU_HASH_FAILURE/,
        );
        if (failures.includes('close')) assert.match(report.diagnosticJournalCloseError, /CPU_CLOSE_FAILURE/);
        assert.deepEqual(calls, failures.includes('read') ? ['close', 'read'] : ['close', 'read', 'hash']);
    });

function nativeLayoutCase() {
    return {
        source: '/cpu/execution-source',
        st: '/cpu/execution-source/' + NATIVE_RELATIVE_OUTPUT,
        native: synthetic().receipts.native,
    };
}
test('copied ST retains exact producer relative OUT; actual receipt budget supplies compiler provenance root', () => {
    const v = nativeLayoutCase();
    assert.deepEqual(validateNativeLayout(v.source, v.st, v.native), {
        provenanceRoot: '/cpu/native-producer',
        relativeOutput: NATIVE_RELATIVE_OUTPUT,
    });
});
for (const [label, change] of [
    [
        'external original ST instead of source-contained copy',
        (v) => {
            v.st = v.native.budget.out;
        },
    ],
    [
        'different copied relative output',
        (v) => {
            v.st += '-other';
        },
    ],
    [
        'foreign producer identity',
        (v) => {
            v.native.sourceProducer = P;
        },
    ],
    [
        'unqualified status',
        (v) => {
            v.native.status = 'PASS_LIMITED_ST_BUILD';
        },
    ],
    [
        'foreign output suffix',
        (v) => {
            v.native.budget.out = '/foreign/st';
        },
    ],
    [
        'relative producer root',
        (v) => {
            v.native.budget.out = 'producer/' + NATIVE_RELATIVE_OUTPUT;
        },
    ],
    [
        'noncanonical original output',
        (v) => {
            v.native.budget.out = '/cpu/a/../native-producer/' + NATIVE_RELATIVE_OUTPUT;
        },
    ],
    [
        'unknown command',
        (v) => {
            v.native.commands[0].args[0] = 'fake.mjs';
        },
    ],
    [
        'failed native command',
        (v) => {
            v.native.commands[0].exitCode = 1;
        },
    ],
    [
        'missing storage qualification',
        (v) => {
            v.native.storageQualification.status = 'FAIL';
        },
    ],
])
    test('native producer layout negative: ' + label, () => {
        const v = nativeLayoutCase();
        change(v);
        assert.throws(() => validateNativeLayout(v.source, v.st, v.native));
    });
test('original native-root layout remains supported without rewriting producer paths', () => {
    const v = nativeLayoutCase();
    assert.equal(
        validateNativeLayout('/cpu/native-producer', v.native.budget.out, v.native).provenanceRoot,
        '/cpu/native-producer',
    );
});

for (const [label, change] of [
    [
        'old SDK226 build number',
        (v) => {
            v.provenance.runtimeBuildNumber = 226;
        },
    ],
    [
        'old ESM226 receipt',
        (v) => {
            v.receipts.esm.status = 'PASS_FRESH_ESM226_BUILD';
        },
    ],
    [
        'old DTS226 receipt',
        (v) => {
            v.receipts.dts.status = 'PASS_FRESH_DTS226_SEVEN_GATES';
        },
    ],
    [
        'old v1 provenance schema',
        (v) => {
            v.provenance.schema = 'box3d-c20app-memory-producer-inputs-v1';
        },
    ],
])
    test('SDK230 cohort negative: ' + label, () => {
        const value = synthetic();
        change(value);
        assert.throws(() => validate(value));
    });
test('a frozen SDK226/v1 lock cannot be loaded by this new profile', () => {
    const root = mkdtempSync(join(tmpdir(), 'c20-memory-v1-lock-reject-'));
    try {
        const lock = join(root, 'invalid-old-lock.json');
        writeFileSync(lock, JSON.stringify({ schema: 'box3d-c20app-memory-input-lock-v1' }));
        assert.throws(() => loadLock(lock));
    } finally {
        rmSync(root, { recursive: true });
    }
});

test('historical original raw unavailability is explicit and cannot become a current producer receipt', () => {
    assert.equal(HISTORICAL_REPLAY.status, 'UNAVAILABLE_ORIGINAL_RAW_NOT_RECOVERED');
    assert.equal(
        HISTORICAL_REPLAY.originalJournalSha256,
        '64ca22991a9945df10dcb6d879ce9797cc27c375d267d40ed24fa075830827bf',
    );
    assert.equal(RECEIPT_KEYS.includes('historicalV2Journal'), false);
    const v = synthetic();
    v.provenance.receipts.historicalV2Journal = file('fake-old-raw');
    assert.throws(() => validate(v));
    for (const name of ['consumer.mjs', 'run.mjs', 'freeze.mjs', 'execute-once.py'])
        assert(readFileSync(join(here, name), 'utf8').includes('historicalReplay'), name);
});
for (const [key, value] of [
    ['inputCount', 92],
    ['compiledSourceCount', 84],
    ['evidenceCount', 55],
])
    test('current ST exact gate rejects legacy/partial ' + key, () => {
        const v = synthetic();
        v.receipts.native[key] = value;
        assert.throws(() => validate(v));
    });
for (const old of [225, 226, 227, 228, 229])
    test('prior SDK ' + old + ' remains outside current receipt cohort', () => {
        const v = synthetic();
        v.provenance.runtimeBuildNumber = old;
        assert.throws(() => validate(v));
    });

// Synthetic previous-cohort controls; not replays or reconstructions of lost original artifacts.
for (const old of [228, 229]) {
    for (const [label, change] of [
        [
            'ESM status',
            (v) => {
                v.receipts.esm.status = `PASS_FRESH_ESM${old}_BUILD`;
            },
        ],
        [
            'DTS status',
            (v) => {
                v.receipts.dts.status = `PASS_FRESH_DTS${old}_SEVEN_GATES`;
            },
        ],
    ])
        test(`previous SDK${old} ${label} cannot be relabelled`, () => {
            const v = synthetic();
            change(v);
            assert.throws(() => validate(v));
        });
}
for (const old of [3, 4]) {
    test(`previous v${old} provenance cannot be relabelled`, () => {
        const v = synthetic();
        v.provenance.schema = `box3d-c20app-memory-producer-inputs-v${old}`;
        assert.throws(() => validate(v));
    });
    test(`previous v${old} lock cannot be reused by SDK230 v5`, () => {
        const root = mkdtempSync(join(tmpdir(), `c20-memory-v${old}-lock-reject-`));
        try {
            const lock = join(root, 'invalid-old-lock.json');
            writeFileSync(lock, JSON.stringify({ schema: `box3d-c20app-memory-input-lock-v${old}` }));
            assert.throws(() => loadLock(lock));
        } finally {
            rmSync(root, { recursive: true });
        }
    });
}
test('later original artifact loss stays explicit and is not replaced by synthetic controls', () => {
    assert.match(HISTORICAL_REPLAY.laterArtifacts, /SDK228 APP raw/);
    assert.match(HISTORICAL_REPLAY.laterArtifacts, /SDK229 ST\/ESM\/DTS raw/);
    assert.match(HISTORICAL_REPLAY.laterArtifacts, /unpublished SDK229 v4 candidate/);
    assert.match(HISTORICAL_REPLAY.laterArtifacts, /not replayed or current producer inputs/);
});

function syntheticStorageContracts() {
    return [
        { schema: 'air-box3d-storage-native-contract-v1', status: 'PASS', checks: 51, schemaSha256: SCHEMA_SHA256 },
        {
            schema: 'air-box3d-storage-wasm-contract-v1',
            status: 'PASS',
            identity: { schemaSha256: SCHEMA_SHA256 },
            checks: Object.fromEntries(Array.from({ length: 12 }, (_, i) => ['synthetic-only-' + i, true])),
        },
    ];
}
test('explicit synthetic storage counts only; production gate still owns all named qualification', () =>
    validateStorageContracts(...syntheticStorageContracts()));
for (const [label, change] of [
    [
        'native50',
        ([n]) => {
            n.checks = 50;
        },
    ],
    [
        'wasm11',
        ([n, w]) => {
            delete w.checks['synthetic-only-11'];
        },
    ],
    [
        'wasmfalse',
        ([n, w]) => {
            w.checks['synthetic-only-11'] = false;
        },
    ],
    [
        'wasm old schema',
        ([n, w]) => {
            w.identity.schemaSha256 = H;
        },
    ],
])
    test('real storage record format refuses ' + label, () => {
        const v = syntheticStorageContracts();
        change(v);
        assert.throws(() => validateStorageContracts(...v));
    });
for (const [label, change] of [
    [
        'native40commands',
        (v) => {
            v.receipts.native.commands.pop();
        },
    ],
    [
        'absolute ST sibling substitution',
        (v) => {
            v.receipts.esm.budget.stFiles[0].path = '/foreign/box3d-st.mjs';
        },
    ],
    [
        'absolute completion sibling substitution',
        (v) => {
            v.receipts.native.completionFiles[0].path = '/foreign/build-receipt.json';
        },
    ],
    [
        'DTS emitted-source substitution',
        (v) => {
            v.receipts.dts.declarations[0].emittedSource = '/foreign/cocosair.module.d.ts';
        },
    ],
    [
        'DTS index duplicate',
        (v) => {
            v.receipts.dtsGates[6].index = 6;
        },
    ],
    [
        'DTS foreign cwd',
        (v) => {
            v.receipts.dtsGates[6].cwd = '/foreign';
        },
    ],
    [
        'DTS driver detached from protection',
        (v) => {
            v.receipts.dts.budget.protectedRoots = [];
        },
    ],
    [
        'DTS driver hash substitution',
        (v) => {
            v.provenance.receipts.dtsDriver.sha256 = H;
        },
    ],
    [
        'DTS unknown extra consumer args',
        (v) => {
            v.receipts.dtsDriver.commands[6].push('--skipLibCheck');
        },
    ],
    [
        'native reports APP acceptance',
        (v) => {
            v.receipts.native.storageQualification.appC20Acceptance = true;
        },
    ],
])
    test('actual230 receipt schema negative: ' + label, () => {
        const v = synthetic();
        change(v);
        assert.throws(() => validate(v));
    });
