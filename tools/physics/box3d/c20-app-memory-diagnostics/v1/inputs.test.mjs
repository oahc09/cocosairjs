/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Synthetic receipt/identity controls only. No SDK import or WASM instantiation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { freezeInputs } from './freeze.mjs';
import {
    validateProvenance,
    validateProducerObjects,
    validateNativeIdentity,
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
import { SCHEMA_SHA256, NATIVE_IDENTITY } from './profile.mjs';
const H = 'a'.repeat(64),
    P = 'b'.repeat(40),
    N = 'c'.repeat(40);
const file = (path) => ({ path, bytes: 1, sha256: H });
function synthetic() {
    const provenance = {
        schema: PROVENANCE_SCHEMA,
        runtimeBuildNumber: 226,
        runtimeProducerCommit: P,
        nativeProducerCommit: N,
        fixtureCommit: 'd'.repeat(40),
        receipts: Object.fromEntries(RECEIPT_KEYS.map((name) => [name, file(name + '.json')])),
    };
    provenance.receipts.historicalV2Journal.sha256 = '64ca22991a9945df10dcb6d879ce9797cc27c375d267d40ed24fa075830827bf';
    const sdk = SDK_FILES.map(file),
        st = ST_FILES.map(file);
    const closed = (sourceCommit) => ({
        sourceCommit,
        exitCode: 0,
        abort: null,
        postInputDrift: [],
        physicalClose: 'ECHILD_AND_NO_GROUP_MEMBERS',
    });
    const commands = ['build-dts', 'dts-inputs.test', 'dts-external-types.test', 'dts-symbols.test'].map((name) => [
        'node',
        'tools/build/' + name + '.cjs',
    ]);
    for (const name of ['app', 'mesh', 'terrain'])
        commands.push(['node', '/cpu/node_modules/typescript/bin/tsc', '-p', '/cpu/consumers/' + name + '.json']);
    const receipts = {
        esm: {
            ...closed(P),
            status: 'PASS_FRESH_ESM226_BUILD',
            buildNumber: 226,
            budget: {
                nativeProducer: N,
                stFiles: ['box3d-st.mjs', 'box3d-st.wasm', 'facade.mjs', 'facade.d.mts', 'manifest.json'].map(file),
                stReadySha256: H,
            },
            files: sdk.filter((item) => !item.path.endsWith('.d.ts')),
        },
        dts: {
            ...closed(P),
            status: 'PASS_FRESH_DTS226_SEVEN_GATES',
            budget: { esmResultSha256: H, commands },
            sevenGatesSha256: H,
            declarations: sdk.filter((item) => item.path.endsWith('.d.ts')),
        },
        dtsGates: { status: 'PASS', gates: commands.map((argv) => ({ argv, exitCode: 0 })) },
        native: {
            ...closed(N),
            status: 'PASS_LIMITED_ST_BUILD',
            budget: {
                schemaSha256: SCHEMA_SHA256,
                exactGates: { commands: 37, inputs: 92, compileUnits: 84, evidenceFiles: 55 },
            },
            completionFiles: Object.fromEntries(
                ['build-receipt.json', 'artifact-audit.raw.json', 'manifest.json', 'consumer-ready.json'].map(
                    (name) => [name, H],
                ),
            ),
        },
    };
    return { provenance, receipts, sdk, st };
}
function validate(value) {
    return validateProducerObjects(value.provenance, value.receipts, value.sdk, value.st);
}

test('explicit synthetic receipts satisfy only pure CPU parser, not a real input freeze', () => validate(synthetic()));
test('exact declared file sets are SDK25/ST8/runner7/imported15', () => {
    assert.equal(SDK_FILES.length, 25);
    assert.equal(ST_FILES.length, 8);
    assert.equal(RUNNER_FILES.length, 7);
    assert.equal(IMPORTED_FILES.length, 15);
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
        'rewritten historical failure',
        (v) => {
            v.provenance.receipts.historicalV2Journal.sha256 = H;
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
        'wrong ST readiness',
        (v) => {
            v.receipts.esm.budget.stReadySha256 = 'f'.repeat(64);
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
            v.receipts.dts.budget.esmResultSha256 = 'f'.repeat(64);
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
            v.receipts.dtsGates.gates.pop();
        },
    ],
    [
        'DTS gate skipped',
        (v) => {
            v.receipts.dtsGates.gates[3].exitCode = null;
        },
    ],
    [
        'DTS gate failed',
        (v) => {
            v.receipts.dtsGates.gates[4].exitCode = 1;
        },
    ],
    [
        'DTS changed gate command',
        (v) => {
            v.receipts.dtsGates.gates[0] = { argv: ['true'], exitCode: 0 };
        },
    ],
    [
        'DTS both declaration and gate replaced',
        (v) => {
            v.receipts.dtsGates.gates[0].argv = ['true'];
            v.receipts.dts.budget.commands[0] = ['true'];
        },
    ],
    [
        'DTS terrain consumer replaced',
        (v) => {
            v.receipts.dtsGates.gates[6].argv = ['true'];
            v.receipts.dts.budget.commands[6] = ['true'];
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
            v.receipts.native.budget.schemaSha256 = H;
        },
    ],
    [
        'ST old79 gate',
        (v) => {
            v.receipts.native.budget.exactGates.inputs = 79;
        },
    ],
    [
        'ST missing completion',
        (v) => {
            delete v.receipts.native.completionFiles['build-receipt.json'];
        },
    ],
    [
        'ST duplicate completion',
        (v) => {
            v.receipts.native.completionFiles['duplicate.json'] = H;
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
            wasmWithExports(['air_b3_mesh_lifetime_counters', 'air_b3_world_memory_diagnostics_v1']),
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
test('published imports match original bytes; no core fixture or observer was forked', () => {
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
