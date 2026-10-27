/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Read-only native Hull/core and independent pre-Hull legacy evidence consumer.
 * Retained evidence is not public Cocos, browser, C14, EX01 or complete Gate acceptance.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHash } = require('node:crypto');
const EXPECTED = require('./box3d-command-expectations.json');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sorted = (values) => [...values].sort();
// The legacy oracle remains the original TWO-patch pre-Hull core, even after
// identity/storage patches are appended. Never infer that prefix from the tail.
function preHullPrefix(plan) {
    assert.equal(plan.patchChainSha256, 'fce7869b3888ff9bfd417095e70ce72591893b2c3add1802e1a5bc32ca918bfe');
    assert.deepEqual(
        plan.lock.patches.map((patch) => patch.id),
        [
            'sse2-loadv-float-alignment-v1',
            'contact-generation-geometry-v2',
            'checked-hull-cooking-v1',
            'same-world-identity-v1-candidate',
            'same-world-empty-storage-v1',
        ],
        'Exact reviewed five-patch order',
    );
    return { ...plan.lock, patches: plan.lock.patches.slice(0, 2) };
}
const NATIVE_CHECKS = [
    'pureGeometryValidation',
    'trueTetraMassInertia',
    'nonBoxRayAndDebug',
    'ordinaryFailureNoWrite',
    'finiteAndDegenerateInputs',
    'copiedInputLifetime',
    'commandMotionCompatibility',
    'raw256Points',
    'exact128EdgeBoundary',
    'derivedCapacityBoundary',
    'sensor128Lifetimes',
    'coreCleanup',
];
const CORE_CHECKS = [
    'realHullEquivalence',
    'budgetSpikeRejected',
    'strictMinOutsideBoundary',
    'exactWorkspaceBoundary',
];
const LEGACY_CASES = ['tetra', 'prism', 'duplicates256'];
const LEGACY_FIXTURE = 'tools/physics/box3d/native/hull_legacy_fingerprint.c';
function requireChecks(actual, names, label) {
    assert(actual && typeof actual === 'object', `${label} checks missing`);
    assert.deepEqual(sorted(Object.keys(actual)), sorted(names), `${label} exact check inventory`);
    for (const name of names) assert.equal(actual[name], true, `${label}: ${name}`);
}
// Original audit bytes remain immutable. Only their explicitly declared build root is mapped.
function legacyCompilePaths({ root, directory, provenanceRoot = root }) {
    for (const value of [root, directory, provenanceRoot]) {
        assert(
            typeof value === 'string' && !/[\x00-\x1f\\]/.test(value) && path.isAbsolute(value),
            'Absolute audit root required',
        );
        assert.equal(path.resolve(value), value, 'Canonical audit root required');
        assert.notEqual(value, path.parse(value).root, 'Filesystem root is not a provenance root');
    }
    const relative = path.relative(root, directory);
    assert(
        relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative),
        'Build directory outside candidate root',
    );
    const originalDirectory = path.join(provenanceRoot, relative);
    const originalBaseline = path.join(originalDirectory, 'hull-legacy-baseline');
    const units = EXPECTED.gate.compileUnits.filter((name) => name.startsWith('staged-core/'));
    assert.equal(units.length, 52, 'Exact pre-Hull fixed-core translation-unit inventory');
    const files = [
        ...units.map((name) => path.join(originalBaseline, name)),
        path.join(provenanceRoot, LEGACY_FIXTURE),
    ];
    const normalize = (value) => {
        assert.equal(typeof value, 'string');
        assert(!/[\x00-\x1f\\]/.test(value), 'Unsafe compiler argument');
        const prefix = value.startsWith('-I') ? '-I' : '';
        const name = prefix ? value.slice(2) : value;
        if (!path.isAbsolute(name)) return value;
        assert.equal(path.resolve(name), name, 'Noncanonical compiler path');
        assert(
            name === provenanceRoot || name.startsWith(provenanceRoot + path.sep),
            'Compiler path outside provenance root',
        );
        const normalized =
            name === originalBaseline || name.startsWith(originalBaseline + path.sep)
                ? '<baseline>' + name.slice(originalBaseline.length)
                : '<repo>' + name.slice(provenanceRoot.length);
        return prefix + normalized.split(path.sep).join('/');
    };
    const verifyCompile = (compile) => {
        assert(Array.isArray(compile), 'Legacy compile database must be an array');
        assert.deepEqual(
            compile.map((row) => row.file),
            files,
            'Exact legacy compile inventory',
        );
        for (const row of compile) assert.equal(row.directory, provenanceRoot, 'Legacy compiler working directory');
    };
    return { files, normalize, provenanceRoot, originalDirectory, verifyCompile };
}
function verifyHullQualification({
    directory,
    root,
    provenanceRoot = root,
    receipt,
    identity,
    sources,
    patch,
    readArtifact,
    readSource,
    validatePatchLock,
    verifyStagedCore,
}) {
    const json = (name) => JSON.parse(readArtifact(name));
    const native = json('native-hull-contract.raw.json');
    assert.equal(native.status, 'PASS', 'Native Hull qualification did not pass');
    assert.equal(native.pointerBytes, 4, 'Hull qualification must execute WASM32');
    assert.equal(native.error, undefined);
    assert.deepEqual(native, receipt.hullContract, 'Hull native raw/receipt mismatch');
    requireChecks(native.checks, NATIVE_CHECKS, 'Native Hull');
    const core = json('native-hull-core-contract.raw.json');
    assert.equal(core.status, 'PASS', 'Native Hull core qualification did not pass');
    assert.equal(core.pointerBytes, 4, 'Hull core qualification must execute WASM32');
    assert.equal(core.error, undefined);
    assert.deepEqual(core, receipt.hullCoreContract, 'Hull core native raw/receipt mismatch');
    requireChecks(core.checks, CORE_CHECKS, 'Native Hull core');
    assert.deepEqual(sorted(Object.keys(core.layout)), sorted(['vertex', 'halfEdge', 'face', 'frame']));
    for (const bytes of Object.values(core.layout)) assert(Number.isSafeInteger(bytes) && bytes > 0);
    assert(Number.isSafeInteger(core.maximumPointCount) && core.maximumPointCount > 128);
    assert(Number.isSafeInteger(core.workBytes) && core.workBytes > 0 && core.workBytes <= 2147483647);

    const legacy = json('hull-legacy-baseline/comparison.raw.json');
    assert.equal(legacy.schemaVersion, 1);
    assert.equal(legacy.status, 'PASS', 'Independent pre-Hull legacy comparison did not pass');
    assert.equal(legacy.error, undefined);
    assert.equal(legacy.kind, 'st-simd-wasm');
    assert.equal(legacy.mode, receipt.mode, 'Legacy comparison build mode mismatch');
    assert.deepEqual(legacy.sources, sources, 'Legacy comparison source identity mismatch');
    assert.deepEqual(
        receipt.hullLegacyComparison,
        {
            status: 'PASS',
            output: path.relative(root, path.join(directory, 'hull-legacy-baseline')).split(path.sep).join('/'),
        },
        'Hull legacy summary/retained-directory mismatch',
    );
    assert.equal(legacy.fixtureSha256, hash(readSource(LEGACY_FIXTURE)), 'Legacy fixture input drift');
    assert.equal(legacy.patchedIdentity.patchChainSha256, identity.patchChainSha256);
    assert.equal(legacy.patchedIdentity.schemaSha256, identity.schemaSha256);
    const prefix = preHullPrefix(patch);
    assert.equal(legacy.baselineIdentity.coreSha, identity.coreSha, 'Legacy comparison fixed-core identity');
    assert.deepEqual(legacy.baselineIdentity.appliedPatches, prefix.patches);
    const prefixBytes = readArtifact('hull-legacy-baseline/prefix-lock.json');
    const legacyPlan = {
        lock: JSON.parse(prefixBytes),
        patchChainSha256: legacy.baselineIdentity.patchChainSha256,
        patchLockSha256: legacy.baselineIdentity.patchLockSha256,
    };
    assert.deepEqual(legacyPlan.lock, prefix, 'Exact independent pre-Hull prefix lock');
    assert.equal(hash(prefixBytes), legacyPlan.patchLockSha256, 'Legacy prefix lock bytes');
    assert.equal(
        validatePatchLock(legacyPlan.lock, identity.coreSha, readSource),
        legacyPlan.patchChainSha256,
        'Legacy prefix patch-chain identity',
    );
    const legacyCore = path.join(directory, 'hull-legacy-baseline/staged-core');
    // Verify the directory/receipt closure by the same read-only patch verifier as the build audit.
    readArtifact('hull-legacy-baseline/staged-core.receipt.json');
    assert.deepEqual(verifyStagedCore(legacyCore, legacyPlan), legacy.baselineStage, 'Legacy staged source drift');
    const baselineRaw = readArtifact('hull-legacy-baseline/baseline.raw.txt');
    const patchedRaw = readArtifact('hull-legacy-baseline/patched.raw.txt');
    assert.equal(legacy.outputs.byteEqual, true);
    assert.deepEqual(legacy.outputs.cases, LEGACY_CASES);
    assert.equal(hash(baselineRaw), legacy.outputs.baselineSha256, 'Legacy baseline raw hash');
    assert.equal(hash(patchedRaw), legacy.outputs.patchedSha256, 'Legacy patched raw hash');
    assert.equal(legacy.outputs.baselineSha256, legacy.outputs.patchedSha256);
    assert(baselineRaw.equals(patchedRaw), 'Legacy comparison raw bytes differ');
    assert.deepEqual(
        baselineRaw
            .toString('utf8')
            .trim()
            .split('\n')
            .map((line) => line.split(' ')[0]),
        LEGACY_CASES,
        'Exact retained legacy fingerprint cases',
    );
    assert.equal(
        hash(readArtifact('air_box3d_hull_legacy_fingerprint.cjs')),
        legacy.outputs.patchedExecutableSha256,
        'Patched legacy executable hash',
    );
    assert.equal(
        hash(readArtifact('hull-legacy-baseline/legacy-fingerprint.cjs')),
        legacy.outputs.baselineExecutableSha256,
        'Independent baseline executable hash',
    );

    const compile = json('hull-legacy-baseline/compile_commands.json');
    const { files, normalize, originalDirectory, verifyCompile } = legacyCompilePaths({
        root,
        directory,
        provenanceRoot,
    });
    verifyCompile(compile);
    const required = [
        '-msimd128',
        '-msse2',
        '-fno-fast-math',
        '-ffp-contract=off',
        '-DBOX3D_DISABLE_AVX2',
        '-DBOX3D_VALIDATE',
    ];
    const forbidden = /pthread|SHARED_MEMORY|USE_PTHREADS|-ffast-math|-Ofast|BOX3D_DISABLE_SIMD|BOX3D_DOUBLE_PRECISION/;
    assert.equal(legacy.commands.length, files.length + 4, 'Exact independent baseline command inventory');
    for (const row of legacy.commands) {
        assert.equal(row.exitCode, 0, 'Legacy command failed');
        assert.equal(row.error, null, 'Legacy command spawn error');
        assert.equal(row.signal, null, 'Legacy command terminated by signal');
        assert(Array.isArray(row.args) && row.args.every((arg) => typeof arg === 'string'));
    }
    assert.equal(legacy.commands[0].command, 'emcc');
    assert.deepEqual(legacy.commands[0].args, ['--version']);
    compile.forEach((row, index) => {
        assert.equal(row.directory, provenanceRoot, 'Legacy compiler working directory');
        assert(Array.isArray(row.arguments) && row.arguments.every((arg) => typeof arg === 'string'));
        assert.equal(row.arguments[0], 'emcc');
        const flags = row.arguments.slice(1);
        for (const flag of required) assert(flags.includes(flag), `Legacy baseline missing ${flag}`);
        assert(!forbidden.test(flags.join(' ')), `Legacy forbidden flags: ${row.file}`);
        assert.equal(flags.includes('-DNDEBUG'), receipt.mode === 'Release', 'Legacy assertion mode');
        assert.equal(flags.includes('-O3'), receipt.mode === 'Release', 'Legacy Release optimization mode');
        assert.equal(flags.includes('-O0'), receipt.mode === 'Debug', 'Legacy Debug optimization mode');
        assert.equal(flags[flags.indexOf('-c') + 1], row.file, 'Legacy compiled source argument');
        const command = legacy.commands[index + 1];
        assert.equal(command.command, 'emcc');
        assert.deepEqual(command.args, flags.map(normalize), 'Legacy compile log/compilation database mismatch');
    });
    const link = legacy.commands[files.length + 1];
    assert.equal(link.command, 'emcc');
    for (const flag of [
        ...required,
        '-sENVIRONMENT=node',
        '-sSINGLE_FILE=1',
        '-sEXIT_RUNTIME=1',
        '-sFILESYSTEM=0',
        '-sASSERTIONS=2',
        '-sALLOW_MEMORY_GROWTH=1',
    ])
        assert(link.args.includes(flag), `Legacy link missing ${flag}`);
    assert(!forbidden.test(link.args.join(' ')), 'Legacy forbidden link flags');
    assert.deepEqual(link.args.slice(-2), ['-o', '<baseline>/legacy-fingerprint.cjs']);
    assert.deepEqual(legacy.commands.at(-2).args, ['<baseline>/legacy-fingerprint.cjs']);
    assert.deepEqual(legacy.commands.at(-1).args, [
        normalize(path.join(originalDirectory, 'air_box3d_hull_legacy_fingerprint.cjs')),
    ]);
    assert.equal(legacy.commands.at(-2).command, legacy.commands.at(-1).command, 'Same legacy execution runtime');
    assert.equal(typeof legacy.commands.at(-1).command, 'string');
    assert(
        baselineRaw.equals(readArtifact(`hull-legacy-baseline/command-${legacy.commands.length - 1}.stdout.txt`)),
        'Legacy baseline raw/stdout linkage',
    );
    assert(
        patchedRaw.equals(readArtifact(`hull-legacy-baseline/command-${legacy.commands.length}.stdout.txt`)),
        'Legacy patched raw/stdout linkage',
    );
    return {
        nativeChecks: NATIVE_CHECKS.length,
        coreChecks: CORE_CHECKS.length,
        legacyCases: LEGACY_CASES.length,
        legacyCompileUnits: files.length,
        legacyCommands: legacy.commands.length,
    };
}
module.exports = { verifyHullQualification, legacyCompilePaths, preHullPrefix };
