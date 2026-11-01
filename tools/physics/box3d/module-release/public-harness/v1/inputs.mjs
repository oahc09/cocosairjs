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
import { LIMITS, validatePublicModuleRelease } from '../../public-contract.mjs';
import { verifyModuleReleaseQualification } from '../../qualification.mjs';
export { entry, json, sha, safePath, sourceEntries, validateRecords };
export const here = dirname(fileURLToPath(import.meta.url));
export const executionRoot = resolve(here, '../../../../../..');
export const PROFILE = 'air-box3d-public-module-release-v1';
export const PASS = 'PASS_PUBLIC_MODULE_RELEASE_SUBSET';
export const LOCK_SCHEMA = 'air-box3d-public-module-release-lock-v1';
export const PROVENANCE_SCHEMA = 'air-box3d-public-module-release-producers-v1';
export const SCHEMA_SHA256 = '8af84ffb85ce311e9693d378c70ca3c788896b8aeee228700bbddd61c0ca8a04';
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
export const PUBLIC_FIXTURE_COMMIT = 'a00306f391c595e292bbcaedd0f757bc99ca4ead';
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
export const EXPECTED_MODULE_QUALIFICATION = Object.freeze({
    status: 'PASS_LIMITED_SAME_MODULE_REGISTERED_NATIVE_RELEASE',
    nativeChecks: 120,
    wasmChecks: 8,
    factoryCalls: 1,
    originalFactoryBaselinePreserved: true,
    appCloseExecuted: false,
    fullC20Acceptance: false,
    allHandlesOrMallocOrGC: false,
});
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
    'native-module-release-contract.raw.json',
    'wasm-module-release-contract.raw.json',
];
export const SUPERVISOR = Object.freeze({
    path: 'tools/physics/box3d/lifecycle-contract/lowlevel/supervise.py',
    sha256: 'd721d69135c4ab4fc8c09585fe835ff31555f6529525611dfcc29955fd7a021e',
});
export const QUALIFICATION = Object.freeze({
    host: 'NODE_HEADLESS_JSDOM_ORIGINAL_LOADER_FACTORY',
    moduleRelease: 'ONE_SCENE_SAME_MODULE_REGISTERED_GLOBAL_TERMINAL_RECEIPT',
    browser: 'NOT_RUN',
    fullT15: 'NOT_QUALIFIED',
    fullC20: 'NOT_QUALIFIED',
    I05: 'NOT_QUALIFIED',
    I06: 'NOT_QUALIFIED',
    allNativeHandles: 'NOT_QUALIFIED',
    mallocOrHeapOrGC: 'NOT_QUALIFIED',
    afterCloseNativeProbe: 'NOT_CALLED',
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
            path: 'src/air/physics/box3d/loader/st-loader.mjs',
            bytes: 18073,
            sha256: '088f375e5426c07d9cb7d971259875f11bc628f50484f71e826fce44eea29c31',
        },
        {
            path: 'src/air/physics/box3d/loader/st-loader.d.mts',
            bytes: 4378,
            sha256: '3b61e31938935c2c83dd4f03a4d8689a2a7e33764617112146684bc903eaa351',
        },
        {
            path: 'src/air/physics/box3d/prepare.ts',
            bytes: 5485,
            sha256: '60ff23f46afaf6854434fc07029f5c92cc86196d156235350ebec64f045d43c0',
        },
        {
            path: 'src/air/physics/preparation.ts',
            bytes: 15282,
            sha256: 'ca679cf59ccf69d5d6228ce52727f4f2de9796fb462d3626d2d1d27094d2bdb7',
        },
        {
            path: 'src/air/physics/box3d/binding/module-release.mjs',
            bytes: 8439,
            sha256: '53cfc80a3bb9a2ef10b685139cf3840aa50ada8511b1323276c6139f5008ba11',
        },
        {
            path: 'src/air/physics/box3d/binding/module-release.d.mts',
            bytes: 1845,
            sha256: 'e29462a21e30993370afba33227b5391d124d6f24511a7fe911bcd8a7c88b773',
        },
        {
            path: 'tools/physics/box3d/module-release/public-contract.mjs',
            bytes: 10813,
            sha256: 'e527ac0f19ebf2d29933add6d2842f66bdd868e40ea418a146aeaa5fbb5c5d5e',
        },
        {
            path: 'tools/physics/box3d/module-release/loader-contract.test.mjs',
            bytes: 36272,
            sha256: 'f047d5b80874924f8a586de1b21189dff686f5563982a15a2093817830cd7179',
        },
        {
            path: 'tools/physics/box3d/module-release/contract.test.mjs',
            bytes: 10296,
            sha256: 'cd4ddc418a2443c0bf7d80520731098b0546038ce26adb56ad570afd1a4a6d39',
        },
        {
            path: 'tools/physics/box3d/module-release/qualification.mjs',
            bytes: 10000,
            sha256: '7cf502de80da0c8b523b575b3e968b999d2d9f66813846fc51d4070332314b1e',
        },
        {
            path: 'tools/physics/box3d/wasm-module-release-contract.mjs',
            bytes: 6418,
            sha256: 'cf9253b136dcaf3e76986ceca59c81f21423643a9cc4d0897db6a2b7fd712244',
        },
        {
            path: 'tools/verify/box3d/loader-lifecycle.test.mjs',
            bytes: 15342,
            sha256: '57d9863926eb6cac8d868ea2464e22b56e73fd6ca3d10e704b0fa6c01286d531',
        },
        {
            path: 'tools/verify/box3d/app-preparation.test.cjs',
            bytes: 36333,
            sha256: 'c41c2380709c7441c4aeeb087ef31a8df717ba3591dd0694c291631732be812d',
        },
        {
            path: 'src/air/physics/box3d/world.ts',
            bytes: 84814,
            sha256: 'e7dfa2fb9ad562aa4e4d74146dc82cbf1a918a2cb2dff85881f5fdd71cb6778b',
        },
        {
            path: 'src/air/app.ts',
            bytes: 17617,
            sha256: '85e735fddb6d81f49be4876b23fe50808ab304a31f32aa0bd4c7bb25b2a81b0a',
        },
        {
            path: 'src/air/session-scope.ts',
            bytes: 6580,
            sha256: '28fdf0d1f7a75f06d80e74dde72a9209b6c40a216cccfca9f0101983097d1ea8',
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
        Number.isSafeInteger(value.runtimeBuildNumber) && value.runtimeBuildNumber > 234,
        'New actual SDK build, never old SDK234',
    );
    for (const key of ['fixtureCommit', 'runtimeProducerCommit', 'nativeProducerCommit'])
        assert(/^[a-f0-9]{40}$/.test(value[key]), key);
    assert.equal(
        value.runtimeProducerCommit,
        value.nativeProducerCommit,
        'This profile requires the same actual production source',
    );
    if (PUBLIC_FIXTURE_COMMIT !== null)
        assert.equal(value.runtimeProducerCommit, PUBLIC_FIXTURE_COMMIT, 'Exact published production/fixture source');
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
        [47, 136, 87, 63],
    );
    assert.equal(native.schemaSha256, SCHEMA_SHA256);
    assert.deepEqual(native.moduleReleaseQualification, EXPECTED_MODULE_QUALIFICATION);
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
    assert.equal(hashes.length, 136);
    assert.equal(new Set(hashes.map((r) => r.path)).size, 136);
    const extra = hashes.map((record) => {
        const actual = entry(sourceRoot, record.path);
        assert.equal(actual.sha256, record.sha256);
        return actual;
    });
    return [...new Map([...sourceEntries(sourceRoot), ...extra].map((row) => [row.path, row])).values()].sort((a, b) =>
        a.path.localeCompare(b.path),
    );
}
export function qualifyModuleArtifacts({ native, wasm, manifest, fixtureSha256, receipt }) {
    // Full manifest, never descriptor.identity's abbreviated identity.
    return verifyModuleReleaseQualification({ native, wasm, identity: manifest, fixtureSha256, receipt });
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
    const qualification = qualifyModuleArtifacts({
        native: json(stDir, 'native-module-release-contract.raw.json'),
        wasm: json(stDir, 'wasm-module-release-contract.raw.json'),
        manifest: json(stDir, 'manifest.json'),
        fixtureSha256: entry(sourceRoot, 'tools/physics/box3d/wasm-module-release-contract.mjs').sha256,
        receipt: json(stDir, 'build-receipt.json'),
    });
    assert.deepEqual(
        receipts.native.moduleReleaseQualification,
        qualification,
        'Native outer module qualification must match independent recalculation',
    );
    assert.deepEqual(json(stDir, 'artifact-audit.raw.json').moduleReleaseQualification, qualification);

    return {
        descriptor: verified.descriptor,
        readinessSha256: entry(stDir, 'consumer-ready.json').sha256,
        nativeProducerLayout: layout,
        moduleRelease: qualification,
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
    assert.match(PUBLIC_FIXTURE_COMMIT ?? '', /^[a-f0-9]{40}$/, 'NOT_READY: unpublished public fixture');
    assert.equal(lock.publicFixtureCommit, PUBLIC_FIXTURE_COMMIT);
    assert.equal(lock.hostSha256, HOST_SHA256);
    assert.deepEqual(lock.configuration, { limits: LIMITS });
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
        'src/air/physics/box3d/loader/st-loader.mjs',
        'src/air/physics/box3d/binding/module-release.mjs',
        'src/air/physics/box3d/prepare.ts',
        'src/air/physics/preparation.ts',
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
    assert.match(PUBLIC_FIXTURE_COMMIT ?? '', /^[a-f0-9]{40}$/, 'NOT_READY: unpublished public fixture');
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
        configuration: { limits: LIMITS },
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
    assert.deepEqual(report.harnessQualification, QUALIFICATION);
    assert.equal(report.moduleFactoryReplaced, false);
    assert.equal(report.appCreateCalls, 1);
    assert.equal(report.fixtureOwnCloseObserved, true);
    assert.equal(report.fallbackCloseCalls, 0);
    validatePublicModuleRelease(report);
    assert(report.inputsUnchanged && report.hostClosed);
    assert.deepEqual(report.hostErrors, []);
    assert.deepEqual(report.journalErrors, []);
    assert.equal(report.hostSha256, HOST_SHA256);
    assert.deepEqual(
        report.transport.map((row) => row.path),
        ['manifest.json', 'box3d-st.wasm', 'box3d-st.mjs'],
    );
    assert.equal(report.moduleResolution.length, 1);
    assert.equal(report.frames.length, LIMITS.steps);
    assert.equal(report.completedFrames, report.frames.length);
    assert.equal(report.moduleRelease.verified, true);
    assert.equal(report.qualification.afterCloseNativeProbe, 'NOT_CALLED');
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
