/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Read-only identity gates. Never instantiate WASM or substitute a physics implementation.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILE, CONFIG, HOST_SHA256 } from './contract.mjs';
export { PASS, validateResult } from './contract.mjs';
export const here = dirname(fileURLToPath(import.meta.url));
export const fixtureRoot = here;
export const SCHEMA = 'ce98aca1a40c4999df838c1eaab2b08b0533c85adca9866eb48180c6190575d6';
export const LOCK_SCHEMA = 'box3d-c20app-scene-input-lock-v2';
export const SDK_FILES = ['cocosair.module.js', 'cocosair.module.js.map', 'cocosair.module.d.ts', 'package.json'];
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
export const FIXTURE_FILES = [
    'contract.mjs',
    'fixture.mjs',
    'inputs.mjs',
    'freeze.mjs',
    'host.mjs',
    'consumer.mjs',
    'run.mjs',
    'contract.test.mjs',
    'constraint-source.test.mjs',
    'README.md',
];
export const SOURCE_TREES = [
    'src',
    'vendor/box3d',
    'tools/build',
    'tools/physics/box3d/native',
    'tools/physics/box3d/patches',
];
export const SOURCE_FILES = [
    'tools/physics/box3d/c20-app-scene-cycles/v1/fixture.mjs',
    'package.json',
    'package-lock.json',
    'tools/physics/box3d/abi-schema.json',
    'tools/physics/box3d/versions.lock.json',
    'tools/physics/box3d/exports.json',
    'tools/physics/box3d/CMakeLists.txt',
    'tools/physics/box3d/build.mjs',
    'tools/physics/box3d/build-ready.mjs',
    'tools/physics/box3d/audit-artifacts.mjs',
];
export const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const json = (base, path) => JSON.parse(readFileSync(join(base, safePath(path)), 'utf8'));
export function safePath(path) {
    assert.equal(typeof path, 'string');
    assert(
        path && !isAbsolute(path) && !path.includes('\\') && path.split('/').every((p) => p && p !== '.' && p !== '..'),
        'Only canonical relative input paths are allowed',
    );
    return path;
}
export function entry(base, path) {
    safePath(path);
    assert(lstatSync(join(base, path)).isFile(), 'Input must be a regular file: ' + path);
    const bytes = readFileSync(join(base, path));
    return { path, bytes: bytes.length, sha256: sha(bytes) };
}
export function walk(base, path) {
    return readdirSync(join(base, path), { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name))
        .flatMap((item) => {
            const child = path + '/' + item.name;
            assert(!item.isSymbolicLink(), 'Source symlinks must not escape the locked tree: ' + child);
            return item.isDirectory() ? walk(base, child) : [entry(base, child)];
        });
}
export function sourceEntries(root) {
    return [...SOURCE_TREES.flatMap((path) => walk(root, path)), ...SOURCE_FILES.map((path) => entry(root, path))].sort(
        (a, b) => a.path.localeCompare(b.path),
    );
}
export function validateRecords(entries, required) {
    assert(Array.isArray(entries) && entries.length > 0, 'Nonempty input inventory required');
    const paths = entries.map((e) => {
        safePath(e.path);
        assert(Number.isSafeInteger(e.bytes) && e.bytes >= 0);
        assert(/^[a-f0-9]{64}$/.test(e.sha256));
        return e.path;
    });
    assert.equal(new Set(paths).size, paths.length, 'Duplicate input path');
    if (required) assert.deepEqual([...paths].sort(), [...required].sort(), 'Exact input inventory required');
}
export function validateIdentity(manifest, versions, schemaBytes) {
    assert.equal(sha(schemaBytes), SCHEMA, 'Source schema is not the reviewed Terrain schema');
    assert.equal(versions.apiSchemaSha256, SCHEMA);
    for (const [key, expected] of Object.entries({
        schemaVersion: 1,
        schemaSha256: SCHEMA,
        coreSha: versions.core.commit,
        bindingBaseSha: versions.bindingBase.commit,
        patchChainSha256: versions.patchLock.patchChainSha256,
        abiVersion: 1,
        variant: 'st-simd',
    }))
        assert.equal(manifest[key], expected, 'Fresh same-product ST identity required: ' + key);
}
export function requireCounterExport(wasmBytes) {
    // Compiles only for export inspection; no WASM instantiation or native call occurs here.
    const module = new WebAssembly.Module(wasmBytes);
    assert(
        WebAssembly.Module.exports(module).some(
            (e) => e.kind === 'function' && e.name === 'air_b3_mesh_lifetime_counters',
        ),
        'ST module must export the new native mesh lifetime counter',
    );
    return 'air_b3_mesh_lifetime_counters';
}
export function loadLock(path) {
    const bytes = readFileSync(path),
        lock = JSON.parse(bytes);
    assert.equal(lock.schema, LOCK_SCHEMA);
    assert.equal(lock.schemaSha256, SCHEMA);
    assert.equal(lock.scope, 'C20APP observable subset only; C20/I05/I06 NOT_QUALIFIED');
    assert.equal(lock.profile, PROFILE);
    assert.deepEqual(lock.configuration, CONFIG);
    assert.equal(lock.hostSha256, HOST_SHA256);
    assert.equal(lock.moduleFactoryReplaced, false);
    assert(Number.isSafeInteger(lock.runtimeBuildNumber) && lock.runtimeBuildNumber > 0);
    assert(/^[a-f0-9]{40}$/.test(lock.declaredRuntimeProducerCommit));
    validateRecords(lock.sdk, SDK_FILES);
    validateRecords(lock.st, ST_FILES);
    validateRecords(lock.fixture, FIXTURE_FILES);
    validateRecords(lock.source);
    return { lock, lockSha256: sha(bytes) };
}
export function verifyInputs(sourceRoot, sdkDir, stDir, lock) {
    for (const [base, entries] of [
        [sourceRoot, lock.source],
        [sdkDir, lock.sdk],
        [stDir, lock.st],
        [fixtureRoot, lock.fixture],
    ])
        for (const expected of entries)
            assert.deepEqual(entry(base, expected.path), expected, 'Input drift: ' + expected.path);
    assert.equal(entry(fixtureRoot, 'host.mjs').sha256, HOST_SHA256, 'Original uninstrumented host identity required');
    assert.deepEqual(sourceEntries(sourceRoot), lock.source, 'Added, removed or changed source input');
    assert.equal(json(sdkDir, 'package.json').type, 'module');
    validateIdentity(
        json(stDir, 'manifest.json'),
        json(sourceRoot, 'tools/physics/box3d/versions.lock.json'),
        readFileSync(join(sourceRoot, 'tools/physics/box3d/abi-schema.json')),
    );
    assert(
        readFileSync(join(sdkDir, 'cocosair.module.js'), 'utf8').includes(SCHEMA),
        'ESM lacks the reviewed Terrain schema',
    );
    return true;
}
export async function verifyReady(sourceRoot, stDir) {
    const ready = json(stDir, 'consumer-ready.json');
    assert.equal(ready.status, 'READY_FOR_LIMITED_CONSUMER_VERIFICATION');
    assert.equal(ready.acceptancePassed, false, 'Readiness is not public acceptance');
    validateRecords(ready.files, ['build-receipt.json', 'artifact-audit.raw.json', 'manifest.json']);
    for (const record of ready.files) assert.deepEqual(entry(stDir, record.path), record);
    // Reuse the real read-only product gate rather than treating a readiness label as evidence.
    const require = createRequire(join(sourceRoot, 'package.json'));
    const verified = await require(join(sourceRoot, 'tools/build/box3d-assets.cjs')).verifySTBuild(stDir);
    assert.deepEqual(verified.descriptor, ready.descriptor);
    requireCounterExport(readFileSync(join(stDir, 'box3d-st.wasm')));
    return { descriptor: verified.descriptor, readinessSha256: entry(stDir, 'consumer-ready.json').sha256 };
}
