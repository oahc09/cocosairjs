/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Read-only source admission. No compilation, physics, WASM instantiation, writes or downloads.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const own = dirname(fileURLToPath(import.meta.url));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function verifyMemoryDiagnosticSources(root, stagedCore) {
    assert(stagedCore, 'Explicit staged-core required; no original vendor staging or writes');
    const read = (path) => readFileSync(resolve(root, path));
    const parse = (path) => JSON.parse(read(path));
    const prefix = 'tools/physics/box3d/';
    const profile = parse(prefix + 'memory-diagnostics/v1/schema.json');
    const lock = parse(prefix + 'memory-diagnostics/v1/source-lock.json');
    const schemaBytes = read(prefix + 'abi-schema.json');
    const schema = JSON.parse(schemaBytes);
    const versions = parse(prefix + 'versions.lock.json');
    assert.equal(profile.profile, 'air-box3d-memory-diagnostics-v1');
    assert.equal(profile.version, 1);
    assert.equal(lock.profile, profile.profile);
    assert.equal(lock.coreSha, versions.core.commit);
    assert.equal(lock.patchChainSha256, versions.patchLock.patchChainSha256);
    assert.deepEqual(schema.memoryDiagnosticsV1, profile, 'Main schema/diagnostic profile drift');
    assert.equal(sha(schemaBytes), versions.apiSchemaSha256);
    for (const file of lock.files) {
        assert(/^(src|include\/box3d)\/[a-zA-Z0-9_.-]+$/.test(file.path), 'Unsafe core source-lock path');
        const bytes = readFileSync(resolve(stagedCore, file.path));
        assert.equal(bytes.length, file.bytes, file.path);
        assert.equal(sha(bytes), file.sha256, 'Pinned diagnostic core/header drift: ' + file.path);
    }
    assert.equal(new Set(lock.files.map((entry) => entry.path)).size, lock.files.length);
    for (const required of [
        'src/physics_world.c',
        'src/physics_world.h',
        'src/dynamic_tree.c',
        'src/table.c',
        'src/hull.c',
        'src/verstable.h',
        'src/container.h',
        'src/bitset.h',
        'src/id_pool.h',
        'src/core.c',
    ])
        assert(
            lock.files.some((entry) => entry.path === required),
            'Missing formula/helper hash ' + required,
        );
    const native = read(prefix + 'native/memory_diagnostics.c').toString();
    const header = read(prefix + 'native/memory_diagnostics.h').toString();
    const facade = read('src/air/physics/box3d/binding/facade.mjs').toString();
    const backend = read('src/air/physics/box3d/world.ts').toString();
    assert.equal(profile.rowCount, profile.rows.length);
    assert.equal(profile.wireWords, profile.headerWords + profile.rowWords * profile.rowCount);
    assert.equal(profile.headerWords, 44);
    assert.equal(profile.rowWords, 8);
    assert.equal(profile.rowCount, 87);
    assert(header.includes(`AIR_B3_MEMORY_ROW_COUNT = ${profile.rowCount}`));
    assert(header.includes(`AIR_B3_MEMORY_WORDS = ${profile.wireWords}`));
    assert(facade.includes(`const SCHEMA_SHA256 = '${sha(schemaBytes)}';`));
    assert(facade.includes(`const MEMORY_DIAGNOSTIC_WORDS = ${profile.wireWords};`));
    for (const [index, row] of profile.rows.entries()) {
        assert.equal(row.id, index + 1);
        assert(native.includes(`M_${row.name.toUpperCase().replaceAll('.', '_')} = ${index}`));
        assert(facade.includes(`'${row.name}'`), 'Missing facade row: ' + row.name);
        assert(row.countUnit && row.capacityUnit && row.countMeaning && row.capacityMeaning);
    }
    // The pinned core accounts for both heuristic branches but allocates only heuristic 0 scratch.
    const treeSource = readFileSync(resolve(stagedCore, 'src/dynamic_tree.c'), 'utf8');
    assert.match(treeSource, /^#define B3_TREE_HEURISTIC 0$/m);
    const inactiveNames = ['static', 'kinematic', 'dynamic'].flatMap((kind) =>
        ['leafBoxes', 'binIndices'].map((field) => `tree.${kind}.${field}`),
    );
    const inactiveMeaning =
        'Shared rebuildCapacity ledger estimate; backing is unallocated in pinned B3_TREE_HEURISTIC=0';
    for (const name of inactiveNames) {
        const row = profile.rows.find((entry) => entry.name === name);
        assert.equal(row.countUnit, 'unavailable');
        assert.equal(row.capacityMeaning, inactiveMeaning);
    }
    const inactiveCalls = [...native.matchAll(/CHECK\(inactive_rebuild_row\(&rows\[(M_TREE_[A-Z]+_[A-Z]+)\]/g)]
        .map((match) => match[1])
        .sort();
    assert.deepEqual(inactiveCalls, inactiveNames.map((name) => `M_${name.toUpperCase().replaceAll('.', '_')}`).sort());
    assert.equal((native.match(/\binactive_rebuild_row\(/g) ?? []).length, 7, 'Only six pinned inactive rows');
    const activeStorage = native.slice(
        native.indexOf('static int storage_row('),
        native.indexOf('static int inactive_rebuild_row('),
    );
    assert(activeStorage.includes('capacity < 0 || (capacity && !pointer)'), 'Active backing remains mandatory');
    const inactiveStorage = native.slice(
        native.indexOf('static int inactive_rebuild_row('),
        native.indexOf('static int int_group('),
    );
    assert(inactiveStorage.includes('capacity < 0 || pointer != NULL'), 'Pinned inactive backing must stay NULL');
    const nativeBody = native.slice(native.indexOf('int air_b3_world_memory_diagnostics_v1('));
    assert(nativeBody.indexOf('CHECK(air_b3_world_unlocked(world))') < nativeBody.indexOf('b3World_GetCounters('));
    assert(!nativeBody.includes('b3GetUnlockedWorldFromId('));
    assert.equal((nativeBody.match(/memcpy\(out,/g) ?? []).length, 1);
    assert(nativeBody.includes('CHECK(air_b3_bridge_memory(0, wire + 30))'));
    assert(nativeBody.includes('total != (uint64_t)counters.byteCount'));
    for (const forbidden of [
        /\b(?:malloc|calloc|realloc|free|b3Alloc|b3Free|b3GrowAlloc)\s*\(/,
        /\bb3World_(?:Step|Draw|Set\w+|Rebuild\w+)\s*\(/,
        /\bb3(?:Create|Destroy|Grow|ArenaSync)\w*\s*\(/,
    ])
        assert(!forbidden.test(native), 'Diagnostic source contains mutation/allocation path');
    const method = backend.slice(
        backend.indexOf('    getNativeMemoryDiagnostics() {'),
        backend.indexOf('    getNativeCounts() {'),
    );
    assert(method.includes("this.state !== 'ready'"));
    assert(method.includes("this.assertCommittedRead('getNativeMemoryDiagnostics')"));
    assert(!/\b(?:step|flush|materialize|assertReady|getStepSnapshot)\s*\(/.test(method));
    assert(method.includes('this.#binding.memoryDiagnostics(this.#token)'));
    assert.deepEqual(schema.statuses['13'], 'MEMORY_DIAGNOSTIC_INCONSISTENT');
    return Object.freeze({
        status: 'PASS_SOURCE_CONTROLS_ONLY',
        profile: profile.profile,
        coreSha: lock.coreSha,
        patchChainSha256: lock.patchChainSha256,
        schemaSha256: sha(schemaBytes),
        sourceLockSha256: sha(read(prefix + 'memory-diagnostics/v1/source-lock.json')),
        coreFilesChecked: lock.files.length,
        rowCount: profile.rowCount,
        wireWords: profile.wireWords,
        nativeRuntimeExecuted: false,
        acceptancePassed: false,
    });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    const value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
    const root = resolve(value('--root') ?? resolve(own, '../../../../..'));
    const core = value('--core');
    assert(core, 'Usage: source-gate.mjs --core <already-staged-core> [--root <repo>]');
    console.log(JSON.stringify(verifyMemoryDiagnosticSources(root, resolve(core)), null, 2));
}
