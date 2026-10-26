// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Independent source qualification only. Never changes the production patch lock.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const candidateRoot = resolve(here, '../../../../..');
export const BASE_PATCH_SHA = '4c9d057fe6d7403f6f2c7672c4a7abe38041d845942540a6b5c5abbc6f4bc45c';
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function regular(path) {
    assert.ok(lstatSync(path).isFile(), `Not a regular file: ${path}`);
    return readFileSync(path);
}
export async function applyProfile(sourceRoot, control = false) {
    assert.equal(typeof control, 'boolean');
    const source = resolve(sourceRoot);
    const intake = await import(pathToFileURL(resolve(source, 'tools/physics/box3d/patch-intake.mjs')));
    const base = intake.readPatchPlan();
    assert.equal(base.patchChainSha256, BASE_PATCH_SHA, 'Unreviewed production prefix');
    const lockBytes = regular(resolve(here, 'patch-lock.json'));
    const lock = JSON.parse(lockBytes);
    assert.deepEqual(lock.patches.slice(0, -1), base.lock.patches, 'Retain the full ordered production prefix');
    assert.equal(lock.patches.length, base.lock.patches.length + 1);
    const readPatch = (path) => regular(resolve(path === lock.patches.at(-1).path ? candidateRoot : source, path));
    const candidatePatchSha = intake.validatePatchLock(lock, base.lock.baseCoreCommit, readPatch);
    const manifest = JSON.parse(regular(resolve(source, 'vendor/box3d/source-manifest.json')));
    const files = new Map();
    for (const entry of manifest.files.filter((entry) => entry.path.startsWith('vendor/box3d/core/'))) {
        const bytes = regular(resolve(source, entry.path));
        assert.equal(bytes.length, entry.bytes);
        assert.equal(hash(bytes), entry.sha256);
        files.set(entry.path.slice('vendor/box3d/core/'.length), bytes);
    }
    assert.equal(files.size, 111, 'Pinned core closure changed');
    for (const patch of control ? lock.patches.slice(0, -1) : lock.patches) {
        for (const [path, bytes] of intake.applyExactPatch(readPatch(patch.path), patch.files, (path) =>
            files.get(path),
        )) {
            files.set(path, bytes);
        }
    }
    return {
        intake,
        lock,
        base,
        files,
        control,
        coreCommit: lock.baseCoreCommit,
        patchChainSha256: control ? base.patchChainSha256 : candidatePatchSha,
        patchLockSha256: control ? base.patchLockSha256 : hash(lockBytes),
    };
}
