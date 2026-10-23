/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Source/consumer controls only. Uses explicit synthetic consumer fixtures, never builds or executes WASM.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const candidate = path.resolve(__dirname, '../../..');
const root = process.env.BOX3D_CAPSULE_SOURCE_ROOT ?? candidate;
const file = (name) => (fs.existsSync(path.join(candidate, name)) ? path.join(candidate, name) : path.join(root, name));
const read = (name) => fs.readFileSync(file(name), 'utf8');
const json = (name) => JSON.parse(read(name));
const array = (text, pattern, context = {}) => {
    const found = text.match(pattern);
    assert(found, 'Expected source declaration is present');
    return JSON.parse(JSON.stringify(vm.runInNewContext(found[1], context)));
};
const sorted = (values) => [...values].sort();
const assets = read('tools/build/box3d-assets.cjs');
const expected = json('tools/build/box3d-command-expectations.json');
const { verifyCapsuleQualification } = require('../../build/box3d-capsule-qualification.cjs');
const { verifyCommandSchedule } = require('../../build/box3d-command-qualification.cjs');
const CHECKS = [
    'allThreeAxes',
    'analyticMassAndImpulse',
    'exactZeroSphere',
    'shortPositiveRejectNoWrite',
    'finiteDerivedAndAutomaticMassPreflight',
    'commandAndMotion',
    'trueCapsuleDebugSurface',
    'sensorMassLifecycle',
    'debugAllocationFailures',
    'lifecycle128',
    'coreAndBridgeBytesRestored',
];
const nativeFixture = () => ({
    status: 'PASS',
    pointerBytes: 4,
    negativeCases: 24,
    ...Object.fromEntries(CHECKS.map((name) => [name, true])),
});
function scheduleFixture() {
    const row = (name) => ({ command: 'node', args: ['<repo>/' + name], exitCode: 0, error: null });
    return {
        motionSourceControls: { status: 'PASS_SOURCE_CONTROLS_ONLY' },
        commandSourceControls: { status: 'PASS_SOURCE_CONTROLS_ONLY' },
        queryAdmission: { status: 'PASS_ADMISSION_NO_NATIVE_CALLS', nativeQueryCalls: 0 },
        commands: [
            ...['query-admission-contract.mjs', 'motion-source-controls.mjs', 'command-source-controls.mjs'].map(row),
            { command: 'emcc', args: ['--version'], exitCode: 0, error: null },
            { command: 'cmake', args: ['--version'], exitCode: 0, error: null },
            { command: 'emcmake', args: ['cmake'], exitCode: 0, error: null },
            { command: 'cmake', args: ['--build', '<output>', '--parallel', '1'], exitCode: 0, error: null },
            ...['geometry', 'world', 'body', 'filter', 'motion', 'command', 'query', 'capsule'].map((name) =>
                row(`air_box3d_${name}_contract.cjs`),
            ),
            ...[
                '',
                'ownership-',
                'snapshot-',
                'geometry-',
                'world-',
                'body-',
                'filter-',
                'motion-',
                'command-',
                'query-',
            ].map((name) => row(`wasm-${name}contract.mjs`)),
        ],
    };
}
test('exact source input inventories retain all prior inputs and add both Capsule sources', () => {
    const nativeInputs = array(read('tools/physics/box3d/build.mjs'), /const inputs = (\[[\s\S]*?\]);/);
    const assetInputs = array(assets, /const INPUTS = (\[[\s\S]*?\]);/);
    assert.equal(nativeInputs.length, 57);
    assert.equal(new Set(nativeInputs).size, 57);
    assert.deepEqual(sorted(assetInputs), sorted(nativeInputs));
    assert.deepEqual(sorted(expected.gate.inputs), sorted(nativeInputs));
    assert.match(assets, /assert\.equal\(INPUTS\.length, 57\)/);
    for (const name of [
        'tools/physics/box3d/capsule-bridge-contract.md',
        'tools/physics/box3d/native/capsule_contract.c',
    ])
        assert(nativeInputs.includes(name));
});
test('exact compile and evidence inventories match the current audit producer', () => {
    const audit = read('tools/physics/box3d/audit-artifacts.mjs');
    const nativeUnits = audit
        .match(/const expectedSources = \[[\s\S]*?\]\.sort\(\);/)[0]
        .match(/'tools\/physics\/box3d\/native\/[^']+'/g)
        .map((s) => s.slice(1, -1));
    const vendorUnits = json('vendor/box3d/source-manifest.json')
        .files.filter((entry) => /^vendor\/box3d\/core\/src\/[^/]+\.c$/.test(entry.path))
        .map((entry) => entry.path.replace('vendor/box3d/core/', 'staged-core/'));
    assert.equal(nativeUnits.length + vendorUnits.length, 70);
    assert.deepEqual(sorted(expected.gate.compileUnits), sorted([...nativeUnits, ...vendorUnits]));
    assert.match(assets, /assert\.equal\(audit\.compiledSourceCount, 70,/);
    const evidence = array(audit, /evidence: (\[[\s\S]*?\])\.map\(fileHash\)/, {
        linkPath: 'CMakeFiles/air_box3d.dir/link.txt',
    });
    const assetEvidence = array(assets, /sorted\((\[\s*'build-receipt\.json'[\s\S]*?\])\)/);
    assert.equal(evidence.length, 34);
    assert.equal(new Set(evidence).size, 34);
    assert.deepEqual(sorted(expected.gate.evidence), sorted(evidence));
    assert.deepEqual(sorted(assetEvidence), sorted(evidence));
    assert.match(
        assets,
        /verifyCapsuleQualification\(\{\s*native: json\(fileInside\(directory, 'native-capsule-contract\.raw\.json'\)\),\s*receipt,/,
    );
});
test('Capsule consumer accepts only its full WASM32 raw/receipt qualification', () => {
    const native = nativeFixture();
    verifyCapsuleQualification({ native, receipt: { capsuleContract: structuredClone(native) } });
    for (const key of CHECKS) {
        for (const value of [false, undefined]) {
            const altered = { ...native, [key]: value };
            assert.throws(
                () => verifyCapsuleQualification({ native: altered, receipt: { capsuleContract: altered } }),
                /Native Capsule:/,
            );
        }
    }
    for (const change of [{ status: 'FAIL' }, { pointerBytes: 8 }, { negativeCases: 23 }, { negativeCases: 25 }]) {
        const altered = { ...native, ...change };
        assert.throws(() => verifyCapsuleQualification({ native: altered, receipt: { capsuleContract: altered } }));
    }
    assert.throws(() => verifyCapsuleQualification({ native, receipt: {} }), /raw\/receipt mismatch/);
    assert.throws(
        () => verifyCapsuleQualification({ native, receipt: { capsuleContract: { ...native, lifecycle128: false } } }),
        /raw\/receipt mismatch/,
    );
});
test('strict 25-command schedule rejects missing, reordered, failed and legacy Capsule execution', () => {
    assert.equal(expected.gate.commands, 25);
    verifyCommandSchedule(scheduleFixture());
    const missing = scheduleFixture();
    missing.commands.splice(14, 1);
    assert.throws(() => verifyCommandSchedule(missing), /Exact successful WASM command inventory/);
    const reordered = scheduleFixture();
    [reordered.commands[13], reordered.commands[14]] = [reordered.commands[14], reordered.commands[13]];
    assert.throws(() => verifyCommandSchedule(reordered), /Command 14/);
    const failed = scheduleFixture();
    failed.commands[14].exitCode = 1;
    assert.throws(() => verifyCommandSchedule(failed));
    const skipped = scheduleFixture();
    skipped.commands[14].args[0] = '<output>/air_box3d_query_contract.cjs';
    assert.throws(() => verifyCommandSchedule(skipped), /Command 15/);
});
function loadFixtureInputs(gate) {
    const descriptor = { identity: { schemaSha256: 'synthetic-control-only' } };
    const qualified = { descriptor };
    const module = { exports: {} };
    const builtins = { 'node:assert/strict': assert, 'node:path': path, 'node:crypto': require('node:crypto') };
    const fakeFS = {
        readFileSync(name) {
            if (name.endsWith('build-receipt.json'))
                return Buffer.from(
                    JSON.stringify({
                        mode: 'Release',
                        inputHashes: [{ path: 'tools/physics/box3d/native/capsule_contract.c' }],
                    }),
                );
            assert(name.endsWith('artifact-audit.raw.json'));
            return Buffer.from(JSON.stringify({ status: 'PASS' }));
        },
    };
    vm.runInNewContext(read('tools/verify/box3d/capsule-real-wasm/inputs.cjs'), {
        module,
        __dirname: path.join(candidate, 'tools/verify/box3d/capsule-real-wasm'),
        process: { env: { CAPSULE56_QUALIFICATION: 'full' } },
        require(name) {
            if (name === 'node:fs') return fakeFS;
            if (builtins[name]) return builtins[name];
            if (name.endsWith('owner-dynamic-command-real-wasm-inputs.cjs')) return { qualify: () => qualified };
            assert(name.endsWith('tools/build/box3d-assets.cjs'));
            return { verifySTBuild: (directory) => gate(directory, descriptor) };
        },
    });
    return module.exports;
}
test('Capsule-only fixture awaits the full asset gate and propagates failure without a fallback', async () => {
    let resolveGate;
    let completed = false;
    const inputs = loadFixtureInputs((directory, descriptor) => {
        assert.equal(directory, '/synthetic-consumer-control');
        return new Promise((resolve) => {
            resolveGate = () => resolve({ descriptor });
        });
    });
    const pending = inputs.verifyArtifact('/synthetic-consumer-control').then((value) => {
        completed = true;
        return value;
    });
    await Promise.resolve();
    assert.equal(completed, false);
    resolveGate();
    await pending;
    assert.equal(completed, true);
    const rejected = loadFixtureInputs(async () => {
        throw new Error('Synthetic full gate refusal');
    });
    await assert.rejects(rejected.verifyArtifact('/synthetic-consumer-control'), /Synthetic full gate refusal/);
    const mismatch = loadFixtureInputs(async () => ({ descriptor: {} }));
    await assert.rejects(
        mismatch.verifyArtifact('/synthetic-consumer-control'),
        /Full gate\/receipt descriptor mismatch/,
    );
    const run = read('tools/verify/box3d/capsule-real-wasm/run.mjs');
    assert.equal((run.match(/await verifyArtifact\(directory\)/g) ?? []).length, 2);
    assert(
        run.indexOf('report.sourceHashesBefore = sourceHashes();') <
            run.indexOf('report.artifact = await verifyArtifact(directory);'),
        'A gate rejection must retain FAIL rather than compare source hashes with an undefined initial snapshot',
    );
    assert.match(
        read('tools/verify/box3d/capsule-real-wasm/preload.mjs'),
        /const artifact = await verifyArtifact\(directory\),/,
    );
});
test('a complete-gate rejection remains FAIL when source hashes are unchanged', async () => {
    const writes = new Map();
    const run = read('tools/verify/box3d/capsule-real-wasm/run.mjs')
        .replace(/^import .*;\n/gm, '')
        .replace('fileURLToPath(import.meta.url)', "'/synthetic/fixture/run.mjs'");
    const context = {
        assert,
        existsSync: () => false,
        mkdirSync: () => {},
        readFileSync: () => {
            throw new Error('A refused artifact must never start the Cocos attempt');
        },
        writeFileSync: (name, bytes) => writes.set(name, bytes),
        resolve: path.resolve,
        join: path.join,
        dirname: path.dirname,
        spawnSync: (command, args) => {
            assert.equal(command, 'git');
            assert.deepEqual(Array.from(args), ['rev-parse', 'HEAD']);
            return { stdout: 'synthetic-source-only\n' };
        },
        inputs: {
            root: '/synthetic/root',
            sourceHashes: () => ({ 'fixture:control': 'unchanged-source' }),
            verifyArtifact: async () => {
                throw new Error('Synthetic complete gate refusal');
            },
        },
        process: { argv: ['node', 'run.mjs', '/synthetic/artifact', '/synthetic/output', 'full'], env: {} },
        console: { log: () => {} },
    };
    // Execute only collector orchestration against in-memory IO and an explicitly rejecting gate.
    await vm.runInNewContext(`(async () => {${run}\n})()`, context);
    const report = JSON.parse(writes.get('/synthetic/output/receipt.json'));
    assert.equal(report.status, 'FAIL');
    assert.match(report.error, /Synthetic complete gate refusal/);
    assert.equal(report.drift, undefined);
    assert.equal(context.process.exitCode, 1);
});
