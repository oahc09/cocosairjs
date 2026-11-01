// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Independent empty-storage candidate; never rewrites production or identity locks.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const candidateRoot = resolve(here, '../../../../..');
export const IDENTITY_CHAIN = '2334e8948b294ec08c09cc5c7b0c0336bbd82d5eda0ae06acb481fcc85ef1932';
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function regular(path) {
    assert.ok(lstatSync(path).isFile(), `Not a regular source: ${path}`);
    return readFileSync(path);
}
export async function applyStorageProfile(sourceRoot, control = false) {
    assert.equal(typeof control, 'boolean');
    const source = resolve(sourceRoot);
    const identity = await import(
        pathToFileURL(resolve(source, 'tools/physics/box3d/empty-world-trim/identity/profile.mjs'))
    );
    const base = await identity.applyProfile(source);
    assert.equal(base.patchChainSha256, IDENTITY_CHAIN, 'Unreviewed identity foundation');
    const lockBytes = regular(resolve(here, 'patch-lock.json'));
    const lock = JSON.parse(lockBytes);
    assert.deepEqual(lock.patches.slice(0, -1), base.lock.patches, 'Keep exact ordered four-patch identity prefix');
    assert.equal(lock.patches.length, base.lock.patches.length + 1);
    const readPatch = (path) => regular(resolve(path === lock.patches.at(-1).path ? candidateRoot : source, path));
    const chain = base.intake.validatePatchLock(lock, base.coreCommit, readPatch);
    const files = new Map(base.files);
    if (!control) {
        const patch = lock.patches.at(-1);
        for (const [path, bytes] of base.intake.applyExactPatch(readPatch(patch.path), patch.files, (path) =>
            files.get(path),
        ))
            files.set(path, bytes);
    }
    return {
        files,
        control,
        lock,
        identityAdapter: base.adapter,
        coreCommit: base.coreCommit,
        patchChainSha256: control ? base.patchChainSha256 : chain,
        patchLockSha256: control ? base.patchLockSha256 : hash(lockBytes),
    };
}
