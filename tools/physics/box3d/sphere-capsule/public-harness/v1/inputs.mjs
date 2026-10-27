/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Present-only freeze/verification. Never import an SDK or instantiate WASM here.
import assert from 'node:assert/strict';
import {
    readFileSync,
    writeFileSync,
    readdirSync,
    lstatSync,
    realpathSync,
    readlinkSync,
    openSync,
    closeSync,
    fstatSync,
    constants,
    existsSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    entry,
    json,
    sha,
    safePath,
    sourceEntries,
    validateRecords,
} from '../../../terrain-contract/public-harness/inputs.mjs';
import { PUBLIC_CASES, LIMITS, validateCase } from '../../public-contract.mjs';
import { verifySphereCapsuleQualification } from '../../qualification.mjs';
export { entry, json, sha, safePath, sourceEntries, validateRecords };
export const here = dirname(fileURLToPath(import.meta.url));
export const executionRoot = resolve(here, '../../../../../..');
export const PROFILE = 'air-box3d-public-sphere-capsule-headless-v1';
export const PASS = 'PASS_PUBLIC_SPHERE_CAPSULE_SUBSET';
export const LOCK_SCHEMA = 'air-box3d-public-sphere-capsule-lock-v1';
export const PROVENANCE_SCHEMA = 'air-box3d-public-sphere-capsule-producers-v1';
export const SCHEMA_SHA256 = 'd23be6157ee158ade877202b5e38d40978682cbd4794089c763e3ac8a79242a8';
export const FEATURES = Object.freeze([
    'air',
    'base',
    'gfx-webgl2',
    'gfx-webgpu',
    'gfx-empty',
    '3d',
    'animation',
    'skeletal-animation',
    'primitive',
    'tween',
    'custom-pipeline',
    'legacy-pipeline',
    'profiler',
    'video',
    'webview',
    '2d',
    'physics-2d-framework',
    'particle-2d',
    'tiled-map',
    'ui',
    'spine-3.8',
    'spine-4.2',
    'dragon-bones',
    'physics-2d-box2d',
    'physics-builtin',
    'physics-cannon',
    'custom-pipeline-post-process',
    'physics-box3d',
]);
export const PUBLIC_FIXTURE_COMMIT = 'fe69c0e366f663ba4aeae7be390eb3065b7805c5';
export const HOST_PATH = 'tools/physics/box3d/terrain-contract/public-harness/host.mjs';
export const HOST_SHA256 = '10205d33d67ca3002eb5860aef9047688873423d910964eebf5269b0ef5d367b';
export const RUNNER_FILES = [
    'inputs.mjs',
    'consumer.mjs',
    'run.mjs',
    'execute-once.py',
    'inputs.test.mjs',
    'README.md',
];
export const RECEIPT_KEYS = ['esm', 'dts', 'dtsGates', 'dtsDriver', 'native'];
export const ST_FILES = [
    'manifest.json',
    'box3d-st.mjs',
    'box3d-st.wasm',
    'facade.mjs',
    'facade.d.mts',
    'build-receipt.json',
    'artifact-audit.raw.json',
    'consumer-ready.json',
    'native-world-storage-contract.raw.json',
    'wasm-storage-contract.raw.json',
    'wasm-sphere-capsule-contract.raw.json',
    'sphere-capsule-samples.raw.jsonl',
];
export const SUPERVISOR = Object.freeze({
    path: 'tools/physics/box3d/lifecycle-contract/lowlevel/supervise.py',
    sha256: 'd721d69135c4ab4fc8c09585fe835ff31555f6529525611dfcc29955fd7a021e',
});
export const QUALIFICATION = Object.freeze({
    host: 'NODE_HEADLESS_JSDOM_ORIGINAL_LOADER_FACTORY',
    sphereCapsule: 'FOUR_DECLARED_PUBLIC_CASES_ONLY',
    browser: 'NOT_RUN',
    fullT15: 'NOT_QUALIFIED',
    fullC20: 'NOT_QUALIFIED',
    I05: 'NOT_QUALIFIED',
    I06: 'NOT_QUALIFIED',
    afterCloseNativeMemory: 'UNAVAILABLE',
    historicalRuns: 'UNCHANGED; no historical replay or repaired old failures',
    preMountCleanup: 'NOT_QUALIFIED',
});
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
export const IMPORTED_FILES = Object.freeze(
    [
        {
            path: 'tools/physics/box3d/terrain-contract/public-harness/host.mjs',
            bytes: 4543,
            sha256: '10205d33d67ca3002eb5860aef9047688873423d910964eebf5269b0ef5d367b',
        },
        {
            path: 'tools/physics/box3d/terrain-contract/public-harness/inputs.mjs',
            bytes: 10039,
            sha256: '5c8890b901970b771abe01a446e00805ed42410f6ce9077ac4c95c75e244a916',
        },
        {
            path: 'tools/physics/box3d/terrain-contract/drop-oracle.mjs',
            bytes: 2128,
            sha256: '6fd921d1324957dcd7b3d3ba2f163ad403b416c660e750b413055c1b40e99637',
        },
        {
            path: 'tools/physics/box3d/terrain-contract/oracle.mjs',
            bytes: 3983,
            sha256: '12008663252a04476b22039f10484846fb6b412e292112d794ddd594408f00b4',
        },
        {
            path: 'src/air/physics/box3d/contact-equation.ts',
            bytes: 9838,
            sha256: 'aea1e3bc19bf9aafcd18316f04ba04ef4d0c8b96bd51c5a7b3d9ea081eb80c8d',
        },
        {
            path: 'src/air/physics/box3d/world-binding.ts',
            bytes: 8206,
            sha256: 'b66c4224928e157dc3b6453107fe115b824aedfe1eb1c23227efa5ea955ac420',
        },
        {
            path: 'src/air/physics/box3d/collision-events.ts',
            bytes: 7958,
            sha256: '1ee9cc8872bd65ad4b6308a88bf83795f36c383632562214e5ef3e02f805224b',
        },
        {
            path: 'src/air/physics/box3d/world.ts',
            bytes: 84814,
            sha256: 'e7dfa2fb9ad562aa4e4d74146dc82cbf1a918a2cb2dff85881f5fdd71cb6778b',
        },
        {
            path: 'tools/physics/box3d/sphere-capsule/public-contract.mjs',
            bytes: 18467,
            sha256: '208fb87eb055dc27d5a64b49bb124d63d805c66639735311ba4bb088b527241e',
        },
        {
            path: 'tools/physics/box3d/sphere-capsule/public-contract.test.mjs',
            bytes: 37650,
            sha256: 'db2ae337008ef9a0fd78c6ff525aeadbaef20d80ec0c9dc95f1a6a5dd7f1f66f',
        },
        {
            path: 'tools/physics/box3d/sphere-capsule/oracle.mjs',
            bytes: 7364,
            sha256: '01cc58398aad1b01cc9e5bd2af91d72baa3abc333dca9129c59317541027b48e',
        },
        {
            path: 'tools/physics/box3d/sphere-capsule/qualification.mjs',
            bytes: 3808,
            sha256: 'f0e9031a8e850161bfcb9afa2dc8100397d1ad60635181df393f898888e9768b',
        },
        {
            path: 'tools/physics/box3d/sphere-capsule/contract.test.mjs',
            bytes: 8842,
            sha256: 'd178b20106deeb1c1fe02d99a1991fddce816fd02f3629dd09803eb4437dafee',
        },
        {
            path: 'src/air/physics/box3d/world-writeback.ts',
            bytes: 12638,
            sha256: '8ac29bca08de0b8a76085d081d59d41a6530ef5a0eb5c76989d2ffc117362552',
        },
        {
            path: 'src/air/physics/box3d/rigid-body.ts',
            bytes: 14671,
            sha256: 'eee50fe56cfa3c7cd698b1f682428cc8de4494e1cc216f30ae63a36014ed897b',
        },
        {
            path: 'src/air/physics/box3d/shared-body.ts',
            bytes: 70405,
            sha256: '716f07eb2cab288a0283ca0e7ae2808b78518093d474065f60cf5f162cbc61b2',
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
    assert.equal(value.schemaSha256, SCHEMA_SHA256);
    assert(
        Number.isSafeInteger(value.runtimeBuildNumber) && value.runtimeBuildNumber > 230,
        'New actual SDK build, never old SDK230',
    );
    for (const key of ['fixtureCommit', 'runtimeProducerCommit', 'nativeProducerCommit'])
        assert(/^[a-f0-9]{40}$/.test(value[key]), key);
    assert.equal(
        value.runtimeProducerCommit,
        value.nativeProducerCommit,
        'This profile requires the same actual production source',
    );
    safePath(value.nativeRelativeOutput);
    assert(value.nativeRelativeOutput.startsWith('tools/physics/box3d/output/'));
    absolutePath(value.dependenciesRoot);
    assert.deepEqual(Object.keys(value.receipts).sort(), [...RECEIPT_KEYS].sort());
    validateRecords(Object.values(value.receipts));
    return value;
}
function closedProducer(value, sourceCommit) {
    assert.equal(value.sourceCommit, sourceCommit);
    assert.equal(value.exitCode, 0);
    assert.equal(value.abort, null);
    assert.deepEqual(value.postInputDrift, []);
    assert.equal(value.physicalClose, 'ECHILD_AND_NO_GROUP_MEMBERS');
    assert.deepEqual(value.inputDrift, []);
    assert.deepEqual(value.remainingDescendants, []);
}
function absolutePath(path) {
    assert(typeof path === 'string' && isAbsolute(path) && resolve(path) === path, 'Canonical absolute producer path');
    assert(!/[\x00-\x1f\\]/.test(path), 'Unsafe producer path');
    return path;
}
function exactAbsoluteRecords(records, root, names, expected) {
    absolutePath(root);
    assert.equal(records.length, names.length);
    for (const [index, name] of names.entries()) {
        const item = records[index];
        assert.deepEqual(Object.keys(item).sort(), ['bytes', 'path', 'sha256']);
        assert.equal(item.path, join(root, name), 'Exact producer path; no basename normalization');
        const target = expected.find((r) => r.path === name);
        assert(target);
        assert.equal(item.bytes, target.bytes);
        assert.equal(item.sha256, target.sha256);
    }
}
export function validateProducerObjects(provenance, receipts, sdk, st) {
    validateProvenance(provenance);
    const { esm, dts, dtsGates, dtsDriver, native } = receipts;
    closedProducer(esm, provenance.runtimeProducerCommit);
    closedProducer(dts, provenance.runtimeProducerCommit);
    validateNativeProducer(native, provenance);
    assert.equal(esm.status, `PASS_FRESH_ESM${provenance.runtimeBuildNumber}_BUILD`);
    assert.equal(esm.buildNumber, provenance.runtimeBuildNumber);
    assert.equal(esm.budget.nativeProducer, provenance.nativeProducerCommit);
    assert.equal(esm.budget.nativeResult.sha256, provenance.receipts.native.sha256);
    assert.equal(esm.budget.nativeResult.bytes, provenance.receipts.native.bytes);
    absolutePath(esm.budget.nativeResult.path);
    assert.equal(esm.budget.stRoot, native.budget.out);
    assert.equal(esm.budget.source, native.budget.source);
    assert.equal(esm.budget.sourceCommit, provenance.runtimeProducerCommit);
    assert.equal(dts.status, `PASS_FRESH_DTS${provenance.runtimeBuildNumber}_SEVEN_GATES`);
    assert.equal(dts.buildNumber, provenance.runtimeBuildNumber);
    assert.equal(dts.budget.esmResult.sha256, provenance.receipts.esm.sha256);
    assert.equal(dts.budget.esmResult.bytes, provenance.receipts.esm.bytes);
    absolutePath(dts.budget.esmResult.path);
    assert.equal(dts.budget.producerSource, esm.budget.source);
    assert.equal(dts.budget.sdk, esm.budget.out);
    assert.equal(dts.budget.sourceCommit, provenance.runtimeProducerCommit);
    assert.equal(dts.sevenGatesSha256, provenance.receipts.dtsGates.sha256);
    assert(Array.isArray(dtsGates) && dtsGates.length === 7);
    assert.deepEqual(dts.sevenGates, dtsGates);
    assert.deepEqual(Object.keys(dtsDriver).sort(), ['commands', 'cwd', 'evidence']);
    assert.equal(dtsDriver.cwd, absolutePath(dts.budget.source));
    assert.equal(dtsDriver.evidence, absolutePath(dts.budget.evidence));
    assert.equal(dtsDriver.commands.length, 7);
    assert.equal(dts.budget.command.length, 3);
    assert.equal(dts.budget.command[1], '-B');
    const driver = absolutePath(dts.budget.command[2]);
    assert(driver.endsWith('/driver.py'));
    assert(dts.budget.protectedRoots.includes(join(dirname(driver), 'driver.json')));
    for (const [index, gate] of dtsGates.entries()) {
        assert.deepEqual(Object.keys(gate).sort(), ['command', 'cwd', 'exitCode', 'index']);
        assert.equal(gate.index, index + 1);
        assert.equal(gate.exitCode, 0);
        assert.equal(gate.cwd, dtsDriver.cwd);
        assert.deepEqual(gate.command, dtsDriver.commands[index]);
    }
    const node = absolutePath(dtsDriver.commands[0][0]);
    assert.deepEqual(esm.commands, [], 'Actual ESM command is in budget.command, not invented command rows');
    assert.deepEqual(esm.budget.features, FEATURES);
    assert.equal(esm.budget.counterBefore, provenance.runtimeBuildNumber - 1);
    assert.equal(esm.budget.buildNumber, provenance.runtimeBuildNumber);
    assert.deepEqual(esm.budget.command, [
        '/bin/bash',
        '-c',
        `export AIR_FEATURES="${FEATURES.join(',')}" AIR_OUT_DIR="${esm.budget.out}" AIR_BOX3D_ST_BUILD_DIR="${native.budget.out}" AIR_BOX3D_PROVENANCE_ROOT="${native.budget.source}"; exec "${node}" --max-old-space-size=4096 tools/build/build.cjs --format esm`,
    ]);

    for (const [index, suffix] of [
        'tools/build/build-dts.cjs',
        'tools/build/dts-inputs.test.cjs',
        'tools/build/dts-external-types.test.cjs',
        'tools/build/dts-symbols.test.cjs',
    ].entries())
        assert.deepEqual(
            dtsDriver.commands[index],
            index === 0 ? [node, '--max-old-space-size=2048', suffix] : [node, suffix],
        );
    for (const [index, name] of ['app', 'mesh', 'terrain'].entries()) {
        const command = dtsDriver.commands[index + 4];
        assert.equal(command.length, 4);
        assert.equal(command[0], node);
        assert(absolutePath(command[1]).endsWith('/node_modules/typescript/bin/tsc'));
        assert.equal(command[2], '-p');
        assert.equal(command[3], join(dirname(driver), 'consumers/' + name + '.json'));
    }
    validateRecords(
        esm.files,
        SDK_FILES.filter((path) => !path.endsWith('.d.ts')),
    );
    assert.deepEqual(dts.budget.esmFiles, esm.files);
    assert.equal(dts.declarations.length, 2);
    for (const [index, name] of ['cocosair.module.d.ts', 'cocosair.legacy.d.ts'].entries()) {
        const item = dts.declarations[index];
        assert.deepEqual(Object.keys(item).sort(), ['bytes', 'emittedSource', 'path', 'sha256']);
        assert.equal(item.path, name);
        assert.equal(item.emittedSource, join(absolutePath(dts.budget.out), name));
        const target = sdk.find((r) => r.path === name);
        assert.equal(item.bytes, target.bytes);
        assert.equal(item.sha256, target.sha256);
    }
    for (const record of esm.files)
        assert.deepEqual(
            record,
            sdk.find((item) => item.path === record.path),
        );
    const transport = ['box3d-st.mjs', 'box3d-st.wasm', 'facade.mjs', 'facade.d.mts', 'manifest.json'];
    exactAbsoluteRecords(esm.budget.stFiles, native.budget.out, transport, st);
    for (const name of transport) {
        const item = st.find((r) => r.path === name);
        assert.deepEqual(
            { ...item, path: 'physics/box3d/st/' + name },
            sdk.find((r) => r.path === 'physics/box3d/st/' + name),
        );
    }
    exactAbsoluteRecords(
        native.completionFiles,
        native.budget.out,
        ['build-receipt.json', 'artifact-audit.raw.json', 'manifest.json', 'consumer-ready.json'],
        st,
    );
    validateRecords(native.artifacts, transport.slice(0, 4));
    for (const item of native.artifacts)
        assert.deepEqual(
            item,
            st.find((r) => r.path === item.path),
        );
}

export function validateNativeProducer(native, provenance) {
    assert.equal(native.sourceProducer, provenance.nativeProducerCommit);
    assert.equal(native.budget.sourceCommit, provenance.nativeProducerCommit);
    assert.equal(native.status, 'PASS_LIMITED_ST_BUILD_AND_STORAGE_QUALIFICATION');
    assert.equal(native.exitCode, 0);
    assert.equal(native.abort, null);
    assert.equal(native.physicalClose, 'ECHILD');
    assert.deepEqual(native.inputDrift, []);
    assert.deepEqual(native.remainingDescendants, []);
    assert.deepEqual(
        [native.commands.length, native.inputCount, native.compiledSourceCount, native.evidenceCount],
        [43, 120, 85, 60],
    );
    assert.equal(native.schemaSha256, SCHEMA_SHA256);
    for (const command of native.commands) {
        assert(typeof command.command === 'string' && command.command.length);
        assert(Array.isArray(command.args));
        assert.equal(command.exitCode, 0);
        assert.equal(command.error, null);
    }
    assert.equal(
        absolutePath(native.budget.out),
        join(absolutePath(native.budget.source), provenance.nativeRelativeOutput),
    );
    assert.equal(native.budget.command.length, 3);
    assert.deepEqual(native.budget.command.slice(0, 2), ['/bin/bash', '-c']);
    assert(native.budget.command[2].endsWith(' tools/physics/box3d/build-ready.mjs --out "' + native.budget.out + '"'));
}
export function validateNativeLayout(sourceRoot, stDir, native, provenance) {
    validateNativeProducer(native, provenance);
    absolutePath(sourceRoot);
    absolutePath(stDir);
    assert.equal(stDir, join(sourceRoot, provenance.nativeRelativeOutput), 'Copy ST to the original relative OUT');
    return {
        provenanceRoot: absolutePath(native.budget.source),
        relativeOutput: provenance.nativeRelativeOutput,
        originalOutput: absolutePath(native.budget.out),
    };
}
export function verifyProducers(evidenceRoot, provenance, sdk, st) {
    const receipts = Object.fromEntries(
        RECEIPT_KEYS.map((key) => {
            const expected = provenance.receipts[key];
            assert.deepEqual(entry(evidenceRoot, expected.path), expected, 'Producer receipt drift: ' + key);
            return [key, json(evidenceRoot, expected.path)];
        }),
    );
    validateProducerObjects(provenance, receipts, sdk, st);
    for (const declaration of receipts.dts.declarations) {
        const bytes = readFileSync(absolutePath(declaration.emittedSource));
        assert.equal(bytes.length, declaration.bytes);
        assert.equal(sha(bytes), declaration.sha256, 'Actual fresh emitted declaration');
    }
    return receipts;
}
export function validateNativeIdentity(manifest, versions, schemaBytes) {
    assert.equal(sha(schemaBytes), SCHEMA_SHA256);
    assert.equal(versions.apiSchemaSha256, SCHEMA_SHA256);
    for (const [key, value] of Object.entries({
        schemaVersion: 1,
        schemaSha256: SCHEMA_SHA256,
        coreSha: versions.core.commit,
        bindingBaseSha: versions.bindingBase.commit,
        patchChainSha256: versions.patchLock.patchChainSha256,
        abiVersion: 1,
        variant: 'st-simd',
    }))
        assert.equal(manifest[key], value, key);
}
function dependencyMount(sourceRoot) {
    const path = join(sourceRoot, 'node_modules'),
        stat = lstatSync(path);
    assert(stat.isSymbolicLink() || stat.isDirectory());
    return {
        kind: stat.isSymbolicLink() ? 'symlink' : 'directory',
        mode: stat.mode & 0o7777,
        target: stat.isSymbolicLink() ? readlinkSync(path) : null,
        resolved: realpathSync(path),
    };
}
export function dependencyInventory(root) {
    root = realpathSync(root);
    const rows = [];
    const scan = (path, rel) => {
        const stat = lstatSync(path, { bigint: true }),
            mode = Number(stat.mode & 0o7777n);
        if (stat.isSymbolicLink()) {
            const target = readlinkSync(path),
                resolved = realpathSync(path),
                r = relative(root, resolved);
            assert(r && !r.startsWith('..') && !isAbsolute(r), 'Escaping dependency link');
            assert.equal(readlinkSync(path), target);
            rows.push({ path: rel, kind: 'symlink', mode, target, resolved: r });
        } else if (stat.isDirectory()) {
            rows.push({ path: rel, kind: 'directory', mode });
            for (const name of readdirSync(path).sort()) scan(join(path, name), rel === '.' ? name : rel + '/' + name);
        } else {
            assert(stat.isFile(), 'Unsupported dependency entity');
            const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
            let before, after, bytes;
            try {
                before = fstatSync(fd, { bigint: true });
                bytes = readFileSync(fd);
                after = fstatSync(fd, { bigint: true });
            } finally {
                closeSync(fd);
            }
            const end = lstatSync(path, { bigint: true });
            for (const key of ['dev', 'ino', 'mode', 'size', 'mtimeNs'])
                assert(
                    stat[key] === before[key] && before[key] === after[key] && after[key] === end[key],
                    'Dependency changed while hashing',
                );
            rows.push({ path: rel, kind: 'file', mode, bytes: bytes.length, sha256: sha(bytes) });
        }
    };
    scan(root, '.');
    rows.sort((a, b) => a.path.localeCompare(b.path));
    return {
        root,
        rows,
        sha256: sha(JSON.stringify(rows)),
        files: rows.filter((r) => r.kind === 'file').length,
        links: rows.filter((r) => r.kind === 'symlink').length,
        directories: rows.filter((r) => r.kind === 'directory').length,
    };
}
function sourceInventory(sourceRoot, stDir) {
    const hashes = json(stDir, 'build-receipt.json').inputHashes;
    assert.equal(hashes.length, 120);
    assert.equal(new Set(hashes.map((r) => r.path)).size, 120);
    const extra = hashes.map((record) => {
        const actual = entry(sourceRoot, record.path);
        assert.equal(actual.sha256, record.sha256);
        return actual;
    });
    return [...new Map([...sourceEntries(sourceRoot), ...extra].map((row) => [row.path, row])).values()].sort((a, b) =>
        a.path.localeCompare(b.path),
    );
}
export function qualifySphereArtifacts({ report, samplesText, manifest, fixtureSha256, oracleSha256 }) {
    // Native report carries the COMPLETE manifest, not descriptor.identity's shorter identity subset.
    return verifySphereCapsuleQualification({ report, samplesText, identity: manifest, fixtureSha256, oracleSha256 });
}
export async function verifyReady(sourceRoot, stDir, evidenceRoot, provenance) {
    const receipts = verifyProducers(
        evidenceRoot,
        provenance,
        SDK_FILES.map((path) => entry(provenanceSDKRoot(evidenceRoot, provenance), path)),
        ST_FILES.map((path) => entry(stDir, path)),
    );
    const layout = validateNativeLayout(sourceRoot, stDir, receipts.native, provenance);
    assert.deepEqual(inventory(stDir), inventory(layout.originalOutput), 'Entire ST copy must match producer');
    assert.deepEqual(receipts.native.commands, json(stDir, 'build-receipt.json').commands);
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
    const identity = verified.descriptor.identity;
    assert.equal(identity.schemaSha256, SCHEMA_SHA256);
    const qualification = qualifySphereArtifacts({
        report: json(stDir, 'wasm-sphere-capsule-contract.raw.json'),
        samplesText: readFileSync(join(stDir, 'sphere-capsule-samples.raw.jsonl'), 'utf8'),
        manifest: json(stDir, 'manifest.json'),
        fixtureSha256: entry(sourceRoot, 'tools/physics/box3d/wasm-sphere-capsule-contract.mjs').sha256,
        oracleSha256: entry(sourceRoot, 'tools/physics/box3d/sphere-capsule/oracle.mjs').sha256,
    });
    assert.deepEqual(
        receipts.native.sphereCapsuleQualification,
        qualification,
        'Native outer qualification must match independent recalculation',
    );
    return {
        descriptor: verified.descriptor,
        readinessSha256: entry(stDir, 'consumer-ready.json').sha256,
        nativeProducerLayout: layout,
        sphereCapsule: qualification,
    };
}
function provenanceSDKRoot(evidenceRoot, provenance) {
    const expected = provenance.receipts.esm;
    assert.deepEqual(entry(evidenceRoot, expected.path), expected);
    return absolutePath(json(evidenceRoot, expected.path).budget.out);
}
export function loadLock(path) {
    const bytes = readFileSync(path),
        lock = JSON.parse(bytes);
    assert.equal(lock.schema, LOCK_SCHEMA);
    assert.equal(lock.profile, PROFILE);
    assert.equal(lock.schemaSha256, SCHEMA_SHA256);
    assert.equal(lock.moduleFactoryReplaced, false);
    assert.equal(lock.hostSha256, HOST_SHA256);
    assert.deepEqual(lock.configuration, { cases: PUBLIC_CASES, limits: LIMITS });
    assert.deepEqual(lock.qualification, QUALIFICATION);
    validateProvenance(lock.provenance);
    validateRecords([lock.provenanceFile]);
    for (const key of ['source', 'stTree', 'producerInputs']) validateRecords(lock[key]);
    validateRecords(lock.sdk, SDK_FILES);
    validateRecords(lock.st, ST_FILES);
    validateRecords(lock.runner, RUNNER_FILES);
    assert.deepEqual(lock.imported, IMPORTED_FILES);
    assert.equal(lock.supervisor.path, SUPERVISOR.path);
    assert.equal(lock.supervisor.sha256, SUPERVISOR.sha256);
    assert.equal(lock.dependencies.sha256, sha(JSON.stringify(lock.dependencies.rows)));
    return { lock, lockSha256: sha(bytes) };
}
export function verifyInputs(sourceRoot, sdkDir, stDir, evidenceRoot, lock) {
    assert.deepEqual(entry(evidenceRoot, lock.provenanceFile.path), lock.provenanceFile);
    assert.deepEqual(json(evidenceRoot, lock.provenanceFile.path), lock.provenance);
    assert.equal(
        sdkDir,
        provenanceSDKRoot(evidenceRoot, lock.provenance),
        'Use the exact SDK output named in actual producer receipt',
    );
    for (const [base, records] of [
        [sourceRoot, lock.source],
        [sdkDir, lock.sdk],
        [stDir, lock.st],
        [here, lock.runner],
        [sourceRoot, lock.imported],
        [executionRoot, lock.imported],
        [sourceRoot, [lock.supervisor]],
    ])
        for (const item of records) assert.deepEqual(entry(base, item.path), item, 'Input drift: ' + item.path);
    assert.deepEqual(sourceInventory(sourceRoot, stDir), lock.source);
    assert.deepEqual(
        inventory(sdkDir),
        [...lock.sdk].sort((a, b) => a.path.localeCompare(b.path)),
    );
    assert.deepEqual(inventory(stDir), lock.stTree);
    const receipts = verifyProducers(evidenceRoot, lock.provenance, lock.sdk, lock.st),
        layout = validateNativeLayout(sourceRoot, stDir, receipts.native, lock.provenance);
    assert.deepEqual(inventory(layout.originalOutput), lock.stTree);
    for (const record of lock.producerInputs) assert.deepEqual(entry(layout.provenanceRoot, record.path), record);
    validateNativeIdentity(
        json(stDir, 'manifest.json'),
        json(sourceRoot, 'tools/physics/box3d/versions.lock.json'),
        readFileSync(join(sourceRoot, 'tools/physics/box3d/abi-schema.json')),
    );
    assert.deepEqual(dependencyMount(sourceRoot), lock.dependencyMount);
    assert.equal(realpathSync(join(sourceRoot, 'node_modules')), lock.provenance.dependenciesRoot);
    assert.deepEqual(
        dependencyInventory(lock.provenance.dependenciesRoot),
        lock.dependencies,
        'Dependency entities/links/hash drift',
    );
    assert.equal(json(sdkDir, 'package.json').type, 'module');
    const js = readFileSync(join(sdkDir, 'cocosair.module.js'), 'utf8');
    assert(js.includes(SCHEMA_SHA256), 'Exact new schema in production ESM');
    const map = json(sdkDir, 'cocosair.module.js.map');
    for (const path of [
        'src/air/physics/box3d/collision-events.ts',
        'src/air/physics/box3d/contact-equation.ts',
        'src/air/physics/box3d/world.ts',
    ]) {
        const matches = map.sources
            .map((source, index) => ({ source, index }))
            .filter((row) => row.source.endsWith('/' + path));
        assert.equal(matches.length, 1);
        assert.equal(
            map.sourcesContent[matches[0].index],
            readFileSync(join(sourceRoot, path), 'utf8'),
            'Compiled runtime/source mismatch ' + path,
        );
    }
    return true;
}
export async function freezeInputs({ sourceRoot, sdkDir, stDir, evidenceRoot, provenancePath, output }) {
    assert(!existsSync(output), 'Never overwrite a lock');
    const provenance = validateProvenance(json(evidenceRoot, provenancePath));
    const sdk = SDK_FILES.map((path) => entry(sdkDir, path)),
        st = ST_FILES.map((path) => entry(stDir, path));
    const receipts = verifyProducers(evidenceRoot, provenance, sdk, st),
        layout = validateNativeLayout(sourceRoot, stDir, receipts.native, provenance);
    const producerInputs = json(stDir, 'build-receipt.json').inputHashes.map((row) =>
        entry(layout.provenanceRoot, row.path),
    );
    const lock = {
        schema: LOCK_SCHEMA,
        profile: PROFILE,
        schemaSha256: SCHEMA_SHA256,
        generatedAt: new Date().toISOString(),
        configuration: { cases: PUBLIC_CASES, limits: LIMITS },
        qualification: QUALIFICATION,
        hostSha256: HOST_SHA256,
        moduleFactoryReplaced: false,
        publicFixtureCommit: PUBLIC_FIXTURE_COMMIT,
        provenanceFile: entry(evidenceRoot, provenancePath),
        provenance,
        sdk,
        st,
        stTree: inventory(stDir),
        source: sourceInventory(sourceRoot, stDir),
        producerInputs,
        runner: RUNNER_FILES.map((path) => entry(here, path)),
        imported: IMPORTED_FILES,
        supervisor: entry(sourceRoot, SUPERVISOR.path),
        dependencies: dependencyInventory(provenance.dependenciesRoot),
        dependencyMount: dependencyMount(sourceRoot),
    };
    verifyInputs(sourceRoot, sdkDir, stDir, evidenceRoot, lock);
    lock.readiness = await verifyReady(sourceRoot, stDir, evidenceRoot, provenance);
    writeFileSync(output, JSON.stringify(lock) + '\n', { flag: 'wx' });
    return {
        status: 'READY_INPUT_LOCK_ONLY_NOT_ACCEPTANCE',
        path: output,
        sha256: sha(readFileSync(output)),
        runtime: 'NOT_RUN',
    };
}
export function validateResult(report) {
    assert.equal(report.status, PASS);
    assert.equal(report.fixtureStatus, PASS);
    assert.equal(report.profile, PROFILE);
    assert.equal(report.moduleFactoryReplaced, false);
    assert.equal(report.appCreateCalls, 1);
    assert.equal(report.fixtureOwnCloseObserved, true);
    assert.equal(report.fallbackCloseCalls, 0);
    assert.equal(report.cases.length, PUBLIC_CASES.length);
    for (const [i, row] of report.cases.entries()) {
        for (const [key, value] of Object.entries(PUBLIC_CASES[i])) assert.equal(row[key], value);
        assert.equal(row.status, 'PASS');
        validateCase(row);
        assert.equal(row.rawEvents.length, row.events.length);
    }
    assert.equal(report.close.status, 'released');
    assert.deepEqual(report.close.failures, []);
    assert.deepEqual(report.close.pending, []);
    assert.equal(report.close.physicsPreparation.status, 'closed');
    assert.deepEqual(report.close.physicsPreparation.cleanupErrors, []);
    assert(report.retainedCopiesAfterClose);
    assert(report.inputsUnchanged && report.hostClosed);
    assert.deepEqual(report.hostErrors, []);
    assert.deepEqual(report.journalErrors, []);
    assert.equal(report.hostSha256, HOST_SHA256);
    assert.deepEqual(
        report.transport.map((row) => row.path),
        ['manifest.json', 'box3d-st.wasm', 'box3d-st.mjs'],
    );
    assert.equal(report.moduleResolution.length, 1);
    assert(report.totalSteps > 0 && report.totalSteps <= PUBLIC_CASES.length * LIMITS.stepsPerCase);
    assert.equal(report.frames.length, report.totalSteps);
    report.frames.forEach((frame, i) => assert.deepEqual(frame, { step: i + 1, dt: LIMITS.dt, afterDraw: true }));
    for (const key of ['error', 'closeError', 'inputError', 'journalError', 'hostCloseError', 'validationError'])
        assert.equal(report[key], undefined, key);
    return true;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const [mode, source, sdk, st, evidence, extra, output] = process.argv.slice(2);
        assert(source && sdk && st && evidence && extra);
        const args = [source, sdk, st, evidence].map((value) => resolve(value));
        if (mode === '--freeze') {
            assert(output);
            console.log(
                JSON.stringify(
                    await freezeInputs({
                        sourceRoot: args[0],
                        sdkDir: args[1],
                        stDir: args[2],
                        evidenceRoot: args[3],
                        provenancePath: extra,
                        output: resolve(output),
                    }),
                ),
            );
        } else {
            assert.equal(mode, '--verify');
            const { lock } = loadLock(resolve(extra));
            verifyInputs(...args, lock);
            console.log(JSON.stringify({ status: 'INPUTS_UNCHANGED', runtime: 'NOT_RUN_BY_VERIFIER' }));
        }
    } catch (error) {
        console.error(
            JSON.stringify({
                status: 'NOT_READY',
                runtime: 'NOT_RUN_BY_ADMISSION',
                error: String(error.stack ?? error),
            }),
        );
        process.exitCode = 2;
    }
}
