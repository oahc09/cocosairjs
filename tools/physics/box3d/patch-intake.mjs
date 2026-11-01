// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Strict, byte-hash-bound patch staging. Never writes the imported vendor tree.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, lstatSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const hex = /^[a-f0-9]{64}$/;
function safePath(path) {
    assert.ok(typeof path === 'string' && /^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(path), 'Unsafe patch path');
    assert.ok(!path.split('/').some((part) => part === '.' || part === '..'), 'Unsafe patch traversal');
}
function regular(path) {
    assert.ok(lstatSync(path).isFile(), `Not a regular file: ${path}`);
    return readFileSync(path);
}
export function canonicalPatchChain(lock) {
    return {
        schemaVersion: lock.schemaVersion,
        baseCoreCommit: lock.baseCoreCommit,
        patches: lock.patches.map(({ id, sha256, files }) => ({
            id,
            sha256,
            files: files.map(({ path, beforeSha256, afterSha256 }) => ({ path, beforeSha256, afterSha256 })),
        })),
    };
}
export function validatePatchLock(lock, baseCoreCommit, readPatch) {
    assert.equal(lock.schemaVersion, 1, 'Patch lock schema mismatch');
    assert.equal(lock.baseCoreCommit, baseCoreCommit, 'Patch base commit mismatch');
    assert.ok(Array.isArray(lock.patches) && lock.patches.length > 0, 'Missing explicit patch chain');
    const ids = new Set();
    for (const patch of lock.patches) {
        assert.ok(
            typeof patch.id === 'string' && /^[a-z0-9-]+$/.test(patch.id) && !ids.has(patch.id),
            'Patch ID invalid/duplicate',
        );
        ids.add(patch.id);
        safePath(patch.path);
        assert.ok(patch.path.startsWith('tools/physics/box3d/patches/'), 'Patch outside reviewed directory');
        assert.ok(hex.test(patch.sha256), 'Patch SHA invalid');
        assert.equal(hash(readPatch(patch.path)), patch.sha256, 'Patch bytes hash mismatch');
        assert.ok(Array.isArray(patch.files) && patch.files.length > 0, 'Missing patched files');
        const paths = new Set();
        for (const file of patch.files) {
            safePath(file.path);
            assert.ok(!paths.has(file.path), 'Duplicate patched file');
            paths.add(file.path);
            assert.ok(hex.test(file.beforeSha256) && hex.test(file.afterSha256), 'File SHA invalid');
            assert.notEqual(file.beforeSha256, file.afterSha256, 'Patch must change bytes');
        }
    }
    return hash(JSON.stringify(canonicalPatchChain(lock)));
}
export function readPatchPlan() {
    const versions = readJson(resolve(root, 'tools/physics/box3d/versions.lock.json'));
    safePath(versions.patchLock.path);
    assert.equal(versions.patchLock.path, 'tools/physics/box3d/patches/lock.json');
    const bytes = regular(resolve(root, versions.patchLock.path));
    assert.equal(hash(bytes), versions.patchLock.sha256, 'Patch lock bytes mismatch');
    const lock = JSON.parse(bytes);
    const patchChainSha256 = validatePatchLock(lock, versions.core.commit, (path) => regular(resolve(root, path)));
    assert.equal(patchChainSha256, versions.patchLock.patchChainSha256, 'Version lock patch-chain identity mismatch');
    assert.deepEqual(versions.corePatches, lock.patches, 'Version lock patch list mismatch');
    const facade = regular(resolve(root, 'src/air/physics/box3d/binding/facade.mjs')).toString();
    assert.ok(
        facade.includes(`const PATCH_CHAIN_SHA256 = '${patchChainSha256}';`),
        'Facade patch-chain identity stale',
    );
    return { lock, patchChainSha256, patchLockSha256: hash(bytes) };
}
// A deliberately restricted unified-diff grammar: exact line positions/context,
// complete LF-terminated UTF-8 files, no offsets, no fuzz, no binary/rename/delete.
export function applyExactPatch(patchBytes, files, readBefore) {
    const patch = patchBytes.toString('utf8');
    assert.deepEqual(Buffer.from(patch), patchBytes, 'Patch must be UTF-8');
    assert.ok(patch.endsWith('\n') && !patch.includes('\r'), 'Patch must use final LF');
    const lines = patch.slice(0, -1).split('\n');
    const changed = new Map();
    let i = 0;
    while (i < lines.length) {
        assert.ok(lines[i].startsWith('--- a/'), 'Unsupported diff header');
        const path = lines[i++].slice(6);
        safePath(path);
        assert.equal(lines[i++], `+++ b/${path}`, 'Rename/new/delete patch forbidden');
        const spec = files.find((file) => file.path === path);
        assert.ok(spec && !changed.has(path), 'Unlisted/duplicate diff file');
        const before = readBefore(path);
        assert.equal(hash(before), spec.beforeSha256, `Before hash mismatch: ${path}`);
        const text = before.toString('utf8');
        assert.deepEqual(Buffer.from(text), before, 'Source must be UTF-8');
        assert.ok(text.endsWith('\n') && !text.includes('\r'), 'Source must use final LF');
        const source = text.slice(0, -1).split('\n');
        const output = [];
        let cursor = 0;
        let hunks = 0;
        while (i < lines.length && lines[i].startsWith('@@ ')) {
            const hunk = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@$/.exec(lines[i++]);
            assert.ok(hunk, 'Unsupported hunk header');
            const [oldStart, oldCount, newStart, newCount] = hunk.slice(1).map(Number);
            assert.ok(
                oldStart > 0 && oldStart - 1 >= cursor && oldStart - 1 <= source.length,
                'Invalid/overlapping hunk',
            );
            output.push(...source.slice(cursor, oldStart - 1));
            cursor = oldStart - 1;
            assert.equal(output.length, newStart - 1, 'Hunk offset forbidden');
            let removed = 0;
            let added = 0;
            while (i < lines.length && !lines[i].startsWith('@@ ') && !lines[i].startsWith('--- a/')) {
                const line = lines[i++];
                assert.ok([' ', '+', '-'].includes(line[0]), 'Unsupported hunk line');
                if (line[0] !== '+') {
                    assert.equal(source[cursor++], line.slice(1), `Exact context mismatch: ${path}`);
                    ++removed;
                }
                if (line[0] !== '-') {
                    output.push(line.slice(1));
                    ++added;
                }
            }
            assert.equal(removed, oldCount, 'Old hunk count mismatch');
            assert.equal(added, newCount, 'New hunk count mismatch');
            ++hunks;
        }
        assert.ok(hunks > 0, 'Missing hunk');
        output.push(...source.slice(cursor));
        const after = Buffer.from(output.join('\n') + '\n');
        assert.equal(hash(after), spec.afterSha256, `After hash mismatch: ${path}`);
        changed.set(path, after);
    }
    assert.deepEqual([...changed.keys()].sort(), files.map((file) => file.path).sort(), 'Missing patch file');
    return changed;
}
function expectedStagedFiles(plan) {
    const manifest = readJson(resolve(root, 'vendor/box3d/source-manifest.json'));
    const files = manifest.files
        .filter((entry) => entry.path.startsWith('vendor/box3d/core/'))
        .map((entry) => ({
            path: entry.path.slice('vendor/box3d/core/'.length),
            bytes: entry.bytes,
            sha256: entry.sha256,
        }));
    for (const patch of plan.lock.patches) {
        for (const file of patch.files) {
            const entry = files.find((entry) => entry.path === file.path);
            assert.ok(entry, 'Patch file outside original closure');
            assert.equal(entry.sha256, file.beforeSha256, 'Patch order/before hash mismatch');
            entry.sha256 = file.afterSha256;
            delete entry.bytes; // Post-patch bytes checked by receipt plus exact reapplication.
        }
    }
    return files;
}
export function stageCore(destination, plan = readPatchPlan()) {
    assert.ok(!existsSync(destination), 'Staging exists; preserve earlier output');
    const originals = readJson(resolve(root, 'vendor/box3d/source-manifest.json')).files.filter((entry) =>
        entry.path.startsWith('vendor/box3d/core/'),
    );
    const staged = new Map();
    for (const entry of originals) {
        const data = regular(resolve(root, entry.path));
        assert.equal(data.length, entry.bytes, 'Original source size drift');
        assert.equal(hash(data), entry.sha256, 'Original source hash drift');
        staged.set(entry.path.slice('vendor/box3d/core/'.length), data);
    }
    for (const patch of plan.lock.patches) {
        const bytes = regular(resolve(root, patch.path));
        assert.equal(hash(bytes), patch.sha256, 'Patch changed before staging');
        for (const [path, data] of applyExactPatch(bytes, patch.files, (path) => staged.get(path)))
            staged.set(path, data);
    }
    mkdirSync(destination, { recursive: true });
    for (const [path, data] of staged) {
        mkdirSync(dirname(resolve(destination, path)), { recursive: true });
        writeFileSync(resolve(destination, path), data, { flag: 'wx' });
    }
    const receipt = {
        schemaVersion: 1,
        baseCoreCommit: plan.lock.baseCoreCommit,
        patchChainSha256: plan.patchChainSha256,
        patchLockSha256: plan.patchLockSha256,
        appliedPatches: plan.lock.patches,
        files: [...staged]
            .map(([path, data]) => ({ path, bytes: data.length, sha256: hash(data) }))
            .sort((a, b) => a.path.localeCompare(b.path)),
    };
    writeFileSync(destination + '.receipt.json', JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
    return verifyStagedCore(destination, plan);
}
export function verifyStagedCore(destination, plan = readPatchPlan()) {
    const receipt = readJson(destination + '.receipt.json');
    assert.equal(receipt.schemaVersion, 1);
    assert.equal(receipt.baseCoreCommit, plan.lock.baseCoreCommit, 'Staged base mismatch');
    assert.equal(receipt.patchChainSha256, plan.patchChainSha256, 'Staged patch identity mismatch');
    assert.equal(receipt.patchLockSha256, plan.patchLockSha256, 'Staged patch lock mismatch');
    assert.deepEqual(receipt.appliedPatches, plan.lock.patches, 'Staged patch list mismatch');
    const expected = expectedStagedFiles(plan);
    const actual = [];
    function walk(dir) {
        assert.ok(lstatSync(dir).isDirectory(), 'Staged directory is not regular');
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const path = resolve(dir, entry.name);
            if (entry.isDirectory()) walk(path);
            else {
                const bytes = regular(path);
                actual.push({
                    path: relative(destination, path).replaceAll('\\', '/'),
                    bytes: bytes.length,
                    sha256: hash(bytes),
                });
            }
        }
    }
    walk(destination);
    actual.sort((a, b) => a.path.localeCompare(b.path));
    assert.deepEqual(actual, receipt.files, 'Staged source/receipt drift');
    assert.equal(actual.length, expected.length, 'Staged closure count mismatch');
    for (const entry of expected) {
        const match = actual.find((file) => file.path === entry.path);
        assert.ok(match && match.sha256 === entry.sha256, `Staged source mismatch: ${entry.path}`);
        if (entry.bytes !== undefined) assert.equal(match.bytes, entry.bytes, 'Staged source size mismatch');
    }
    return receipt;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    assert.equal(process.argv[2], '--verify', 'Only --verify <staged-core> CLI is supported');
    const receipt = verifyStagedCore(resolve(process.argv[3]));
    console.log(
        JSON.stringify({ status: 'PASS', patchChainSha256: receipt.patchChainSha256, files: receipt.files.length }),
    );
}
