/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Read-only admission. Missing/failed artifacts are NOT_READY; never synthesize a producer receipt.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { entry, json, sha, safePath, sourceEntries, validateRecords } from '../../c20-app-scene-cycles/v2/inputs.mjs';
import {
    CONFIG,
    PROFILE as STRICT_PROFILE,
    HOST_SHA256,
    PASS,
    validateResult,
} from '../../c20-app-scene-cycles/v2/contract.mjs';
import { PROFILE, SCHEMA_SHA256, NATIVE_IDENTITY, EXPECTED_RUNTIME_BUILD_NUMBER } from './profile.mjs';
export { entry, json, sha, safePath, sourceEntries, validateRecords, PASS, validateResult };
export const here = dirname(fileURLToPath(import.meta.url));
export const PROFILE_PATH = 'tools/physics/box3d/c20-app-memory-diagnostics/v2';
export const LOCK_SCHEMA = 'box3d-c20app-memory-input-lock-v2';
export const PROVENANCE_SCHEMA = 'box3d-c20app-memory-producer-inputs-v2';
export const SCOPE = 'Original C20APP v2 strict subset plus live-world diagnostics; full C20/I05/I06 NOT_QUALIFIED';
export const RUNNER_FILES = [
    'inputs.mjs',
    'freeze.mjs',
    'consumer.mjs',
    'run.mjs',
    'inputs.test.mjs',
    'execute-once.py',
    'RUNNER.md',
];
export const RECEIPT_KEYS = ['esm', 'dts', 'dtsGates', 'native', 'historicalV2Journal'];
export const ST_FILES = [
    'manifest.json',
    'box3d-st.mjs',
    'box3d-st.wasm',
    'facade.mjs',
    'facade.d.mts',
    'build-receipt.json',
    'artifact-audit.raw.json',
    'consumer-ready.json',
];
export const SDK_FILES = [
    'box2d3/LICENSE.Box2D.txt',
    'box2d3/air-box2d.mjs',
    'box2d3/air-box2d.wasm',
    'box2d3/receipt.json',
    'cocosair.legacy.d.ts',
    'cocosair.module.d.ts',
    'cocosair.module.js',
    'cocosair.module.js.map',
    'package.json',
    'physics/box3d/st/LICENSE.Box3D.txt',
    'physics/box3d/st/box3d-st.mjs',
    'physics/box3d/st/box3d-st.wasm',
    'physics/box3d/st/distribution-receipt.json',
    'physics/box3d/st/facade.d.mts',
    'physics/box3d/st/facade.mjs',
    'physics/box3d/st/manifest.json',
    'webgpu/LICENSE-apache.txt',
    'webgpu/LICENSE-dawn.txt',
    'webgpu/LICENSE-glslang.txt',
    'webgpu/NOTICE-babylon.md',
    'webgpu/glslang.js',
    'webgpu/glslang.wasm',
    'webgpu/manifest.json',
    'webgpu/twgsl.js',
    'webgpu/twgsl.wasm',
];
export const SUPERVISOR = Object.freeze({
    path: 'tools/physics/box3d/lifecycle-contract/lowlevel/supervise.py',
    sha256: 'd721d69135c4ab4fc8c09585fe835ff31555f6529525611dfcc29955fd7a021e',
});
export const IMPORTED_FILES = Object.freeze(
    [
        {
            path: 'tools/physics/box3d/c20-app-memory-diagnostics/v2/README.md',
            bytes: 10034,
            sha256: '4691933e5c2f69a369a2a51c1242ea57ba91aad7d2a148d59ec8ae53baf5c103',
        },
        {
            path: 'tools/physics/box3d/c20-app-memory-diagnostics/v2/consumer-adapter.mjs',
            bytes: 2476,
            sha256: 'ebf181c4724e5cd4b7f5f6964bcf0ede22fcd7299ca4847a8ada66cd63c99b25',
        },
        {
            path: 'tools/physics/box3d/c20-app-memory-diagnostics/v2/observer.mjs',
            bytes: 11025,
            sha256: '1c8c0d8b4df5bc6198a1579020828a13d455ec1ba2ddba657c4fae2354f6e219',
        },
        {
            path: 'tools/physics/box3d/c20-app-memory-diagnostics/v2/observer.test.mjs',
            bytes: 21634,
            sha256: 'cc5b6b9da55a33b5bf620c854021fb2d70a564fe16e41ec09f225e28fad7fd13',
        },
        {
            path: 'tools/physics/box3d/c20-app-memory-diagnostics/v2/profile.mjs',
            bytes: 3103,
            sha256: '95a11070223874e214de9646673a6f1b1f74ce520ffb9939381797aad2d3bd3c',
        },
        {
            path: 'tools/physics/box3d/c20-app-scene-cycles/v2/README.md',
            bytes: 11329,
            sha256: '9139a4046f0dc755037637ddc299257dd2b171dd91cdf13690867b76978df660',
        },
        {
            path: 'tools/physics/box3d/c20-app-scene-cycles/v2/constraint-source.test.mjs',
            bytes: 10180,
            sha256: '8003dbf712d77fe435a8a2d6c616172e25e8272f8f337cf3548f0fb550a12c14',
        },
        {
            path: 'tools/physics/box3d/c20-app-scene-cycles/v2/consumer.mjs',
            bytes: 8449,
            sha256: 'f2e9ad7cbb18c088c2bc861f3b9d06ba4c66b14be4074199ec03201a891798c5',
        },
        {
            path: 'tools/physics/box3d/c20-app-scene-cycles/v2/contract.mjs',
            bytes: 10894,
            sha256: '191b7081f438200ba0c8f1a2be2d9a033f0c21ecfe96390b23a8b6605909f210',
        },
        {
            path: 'tools/physics/box3d/c20-app-scene-cycles/v2/contract.test.mjs',
            bytes: 12530,
            sha256: 'dd3ab424cc79d0861837388446e7948364676090aeaf910a29a47608cce72cb2',
        },
        {
            path: 'tools/physics/box3d/c20-app-scene-cycles/v2/fixture.mjs',
            bytes: 14977,
            sha256: 'b3be1f22bd37fc712a133039525c59b50b032ccc7ac42af0c21160fdcf4ea51a',
        },
        {
            path: 'tools/physics/box3d/c20-app-scene-cycles/v2/freeze.mjs',
            bytes: 2446,
            sha256: '70184f147e2cade39fd5996df33acc59837e6f22d6a8494638c3854185a4d4ad',
        },
        {
            path: 'tools/physics/box3d/c20-app-scene-cycles/v2/host.mjs',
            bytes: 4543,
            sha256: '10205d33d67ca3002eb5860aef9047688873423d910964eebf5269b0ef5d367b',
        },
        {
            path: 'tools/physics/box3d/c20-app-scene-cycles/v2/inputs.mjs',
            bytes: 7907,
            sha256: 'abc6ea1d468112a245ff871ef05defa4a1e9518b56fc000efb2aadc2d424d3f3',
        },
        {
            path: 'tools/physics/box3d/c20-app-scene-cycles/v2/run.mjs',
            bytes: 4659,
            sha256: '5d8c205b2b14aae9abb40e6255db47651c1f035292a5a43600bf14938bb1dc27',
        },
    ].map(Object.freeze),
);

export function inventory(root, prefix = '') {
    return readdirSync(join(root, prefix), { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name))
        .flatMap((item) => {
            const path = prefix ? prefix + '/' + item.name : item.name;
            assert(!item.isSymbolicLink(), 'Inventory symlink forbidden: ' + path);
            return item.isDirectory() ? inventory(root, path) : [entry(root, path)];
        });
}
export function validateProvenance(value) {
    assert.equal(value.schema, PROVENANCE_SCHEMA);
    assert.equal(value.runtimeBuildNumber, EXPECTED_RUNTIME_BUILD_NUMBER);
    for (const key of ['runtimeProducerCommit', 'nativeProducerCommit', 'fixtureCommit'])
        assert(/^[a-f0-9]{40}$/.test(value[key]), 'Explicit actual producer/fixture identity: ' + key);
    assert.deepEqual(Object.keys(value.receipts).sort(), [...RECEIPT_KEYS].sort());
    validateRecords(Object.values(value.receipts));
    assert.equal(
        value.receipts.historicalV2Journal.sha256,
        '64ca22991a9945df10dcb6d879ce9797cc27c375d267d40ed24fa075830827bf',
        'Original failed APP v2 raw must remain original',
    );
    return value;
}
function closedProducer(value, sourceCommit) {
    assert.equal(value.sourceCommit, sourceCommit);
    assert.equal(value.exitCode, 0);
    assert.equal(value.abort, null);
    assert.deepEqual(value.postInputDrift, []);
    assert.equal(value.physicalClose, 'ECHILD_AND_NO_GROUP_MEMBERS');
}
export function validateProducerObjects(provenance, receipts, sdk, st) {
    validateProvenance(provenance);
    const { esm, dts, dtsGates, native } = receipts;
    closedProducer(esm, provenance.runtimeProducerCommit);
    closedProducer(dts, provenance.runtimeProducerCommit);
    closedProducer(native, provenance.nativeProducerCommit);
    assert.equal(esm.status, 'PASS_FRESH_ESM227_BUILD');
    assert.equal(esm.buildNumber, EXPECTED_RUNTIME_BUILD_NUMBER);
    assert.equal(esm.budget.nativeProducer, provenance.nativeProducerCommit);
    assert.equal(dts.status, 'PASS_FRESH_DTS227_SEVEN_GATES');
    assert.equal(dts.budget.esmResultSha256, provenance.receipts.esm.sha256);
    assert.equal(dts.sevenGatesSha256, provenance.receipts.dtsGates.sha256);
    assert.equal(dtsGates.status, 'PASS');
    assert.equal(dtsGates.gates.length, 7);
    assert(dtsGates.gates.every((gate) => gate.exitCode === 0));
    assert.deepEqual(
        dtsGates.gates.map((gate) => gate.argv),
        dts.budget.commands,
    );
    const argv = dtsGates.gates.map((gate) => gate.argv.join(' '));
    for (const [index, suffix] of [
        'tools/build/build-dts.cjs',
        'tools/build/dts-inputs.test.cjs',
        'tools/build/dts-external-types.test.cjs',
        'tools/build/dts-symbols.test.cjs',
    ].entries())
        assert(argv[index].endsWith(suffix), 'Original DTS gate order');
    for (const [index, name] of ['app', 'mesh', 'terrain'].entries())
        assert(
            argv[index + 4].includes('/typescript/bin/tsc -p ') &&
                argv[index + 4].endsWith('/consumers/' + name + '.json'),
            'Original declaration consumer gate',
        );
    validateRecords(
        esm.files,
        SDK_FILES.filter((path) => !path.endsWith('.d.ts')),
    );
    validateRecords(dts.declarations, ['cocosair.module.d.ts', 'cocosair.legacy.d.ts']);
    for (const record of [...esm.files, ...dts.declarations])
        assert.deepEqual(
            record,
            sdk.find((entry) => entry.path === record.path),
            'SDK bytes not from successful ESM/DTS producer',
        );
    const transport = ['box3d-st.mjs', 'box3d-st.wasm', 'facade.mjs', 'facade.d.mts', 'manifest.json'];
    validateRecords(esm.budget.stFiles, transport);
    for (const item of esm.budget.stFiles) {
        assert.deepEqual(
            item,
            st.find((record) => record.path === item.path),
        );
        assert.deepEqual(
            { ...item, path: 'physics/box3d/st/' + item.path },
            sdk.find((record) => record.path === 'physics/box3d/st/' + item.path),
        );
    }
    assert.equal(esm.budget.stReadySha256, st.find((record) => record.path === 'consumer-ready.json').sha256);
    assert.equal(native.status, 'PASS_LIMITED_ST_BUILD');
    assert.equal(native.budget.schemaSha256, SCHEMA_SHA256);
    assert.deepEqual(native.budget.exactGates, { commands: 37, inputs: 92, compileUnits: 84, evidenceFiles: 55 });
    const completionNames = ['build-receipt.json', 'artifact-audit.raw.json', 'manifest.json', 'consumer-ready.json'];
    assert.deepEqual(Object.keys(native.completionFiles).sort(), [...completionNames].sort());
    for (const path of completionNames) {
        assert(/^[a-f0-9]{64}$/.test(native.completionFiles[path]));
        assert.equal(native.completionFiles[path], st.find((record) => record.path === path).sha256);
    }
}
export function verifyProducers(evidenceRoot, provenance, sdk, st) {
    const receipts = {};
    for (const key of RECEIPT_KEYS) {
        const expected = provenance.receipts[key];
        assert.deepEqual(entry(evidenceRoot, expected.path), expected, 'Producer/raw evidence drift: ' + key);
        if (key !== 'historicalV2Journal') receipts[key] = json(evidenceRoot, expected.path);
    }
    validateProducerObjects(provenance, receipts, sdk, st);
    return true;
}
export function requireDiagnosticExports(wasmBytes) {
    // Compile for export names only. No WebAssembly.Instance or native execution.
    const module = new WebAssembly.Module(wasmBytes),
        names = WebAssembly.Module.exports(module)
            .filter((item) => item.kind === 'function')
            .map((item) => item.name);
    for (const name of ['air_b3_mesh_lifetime_counters', 'air_b3_world_memory_diagnostics_v1'])
        assert(names.includes(name), 'New diagnostic ST export required: ' + name);
    return true;
}
export function validateNativeIdentity(manifest, versions, schemaBytes) {
    assert.equal(sha(schemaBytes), SCHEMA_SHA256);
    assert.equal(versions.apiSchemaSha256, SCHEMA_SHA256);
    for (const [key, value] of Object.entries(NATIVE_IDENTITY))
        assert.equal(manifest[key], value, 'New same-product identity: ' + key);
    assert.equal(manifest.schemaVersion, 1);
}
// The product gate has two intentional roots: copied inputs under ROOT, original absolute compiler provenance.
// Derive the latter from the hash-bound actual native supervisor receipt, never from fixture source/HEAD.
export function validateNativeLayout(sourceRoot, stDir, native) {
    const producerRoot = native.cwd;
    for (const path of [sourceRoot, stDir, producerRoot, native.budget.cwd, native.budget.out]) {
        assert(
            typeof path === 'string' && isAbsolute(path) && resolve(path) === path,
            'Canonical absolute product/layout path required',
        );
        assert(!/[\x00-\x1f\\]/.test(path), 'Unsafe product/layout path');
    }
    assert.equal(native.budget.cwd, producerRoot, 'Native receipt roots disagree');
    assert.equal(native.budget.sourceCommit, native.sourceCommit, 'Native receipt producer identities disagree');
    const relativeOutput = relative(producerRoot, native.budget.out).split('\\').join('/');
    safePath(relativeOutput);
    assert.equal(
        resolve(sourceRoot, relativeOutput),
        stDir,
        'Ready ST must retain the native producer relative output under execution source',
    );
    return { provenanceRoot: producerRoot, relativeOutput };
}
export async function verifyReady(sourceRoot, stDir, evidenceRoot, provenance) {
    validateProvenance(provenance);
    const nativeFile = provenance.receipts.native;
    assert.deepEqual(
        entry(evidenceRoot, nativeFile.path),
        nativeFile,
        'Native producer receipt drift before readiness',
    );
    const native = json(evidenceRoot, nativeFile.path);
    closedProducer(native, provenance.nativeProducerCommit);
    assert.equal(native.status, 'PASS_LIMITED_ST_BUILD');
    const layout = validateNativeLayout(sourceRoot, stDir, native);
    const ready = json(stDir, 'consumer-ready.json');
    assert.equal(ready.status, 'READY_FOR_LIMITED_CONSUMER_VERIFICATION');
    assert.equal(ready.acceptancePassed, false);
    validateRecords(ready.files, ['build-receipt.json', 'artifact-audit.raw.json', 'manifest.json']);
    for (const item of ready.files) assert.deepEqual(entry(stDir, item.path), item);
    const require = createRequire(join(sourceRoot, 'package.json'));
    const verified = await require(join(sourceRoot, 'tools/build/box3d-assets.cjs')).verifySTBuild(stDir, {
        provenanceRoot: layout.provenanceRoot,
    });
    assert.deepEqual(verified.descriptor, ready.descriptor);
    assert.deepEqual(verified.descriptor.identity, NATIVE_IDENTITY);
    requireDiagnosticExports(readFileSync(join(stDir, 'box3d-st.wasm')));
    return {
        descriptor: verified.descriptor,
        readinessSha256: entry(stDir, 'consumer-ready.json').sha256,
        nativeProducerLayout: layout,
    };
}
export function loadLock(path) {
    const bytes = readFileSync(path),
        lock = JSON.parse(bytes);
    assert.equal(lock.schema, LOCK_SCHEMA);
    assert.equal(lock.schemaSha256, SCHEMA_SHA256);
    assert.equal(lock.profile, PROFILE);
    assert.equal(lock.strictProfile, STRICT_PROFILE);
    assert.equal(lock.scope, SCOPE);
    assert.equal(lock.runtimeBuildNumber, EXPECTED_RUNTIME_BUILD_NUMBER);
    assert.equal(lock.hostSha256, HOST_SHA256);
    assert.equal(lock.moduleFactoryReplaced, false);
    assert.deepEqual(lock.configuration, CONFIG);
    validateProvenance(lock.provenance);
    validateRecords([lock.provenanceFile]);
    validateRecords(lock.source);
    validateRecords(lock.sdk, SDK_FILES);
    validateRecords(lock.st, ST_FILES);
    validateRecords(lock.runner, RUNNER_FILES);
    assert.deepEqual(lock.imported, IMPORTED_FILES);
    assert.equal(lock.supervisor.sha256, SUPERVISOR.sha256);
    assert.equal(lock.supervisor.path, SUPERVISOR.path);
    return { lock, lockSha256: sha(bytes) };
}
export function verifyInputs(sourceRoot, sdkDir, stDir, evidenceRoot, lock) {
    assert.deepEqual(
        entry(evidenceRoot, lock.provenanceFile.path),
        lock.provenanceFile,
        'Provenance declaration drift',
    );
    assert.deepEqual(json(evidenceRoot, lock.provenanceFile.path), lock.provenance);
    for (const [root, records] of [
        [sourceRoot, lock.source],
        [sdkDir, lock.sdk],
        [stDir, lock.st],
        [here, lock.runner],
        [sourceRoot, lock.imported],
        [sourceRoot, [lock.supervisor]],
    ])
        for (const item of records) assert.deepEqual(entry(root, item.path), item, 'Input drift: ' + item.path);
    // Static imports must be exactly the same pinned originals as the source-root copies.
    const executionRoot = resolve(here, '../../../../..');
    for (const item of lock.imported) assert.deepEqual(entry(executionRoot, item.path), item, 'Static import drift');
    assert.deepEqual(sourceEntries(sourceRoot), lock.source, 'Source inventory drift');
    assert.deepEqual(
        inventory(sdkDir),
        [...lock.sdk].sort((a, b) => a.path.localeCompare(b.path)),
        'Exact SDK25 file inventory',
    );
    validateNativeIdentity(
        json(stDir, 'manifest.json'),
        json(sourceRoot, 'tools/physics/box3d/versions.lock.json'),
        readFileSync(join(sourceRoot, 'tools/physics/box3d/abi-schema.json')),
    );
    const js = readFileSync(join(sdkDir, 'cocosair.module.js'), 'utf8');
    assert(
        js.includes(SCHEMA_SHA256) && js.includes('getNativeMemoryDiagnostics'),
        'New ESM diagnostic implementation required',
    );
    assert.equal(json(sdkDir, 'package.json').type, 'module');
    verifyProducers(evidenceRoot, lock.provenance, lock.sdk, lock.st);
    return true;
}
