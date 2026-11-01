/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const here = dirname(fileURLToPath(import.meta.url));
export const root = resolve(here, '../../../..');
export const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function loadLock(path) {
    const bytes = readFileSync(path);
    const lock = JSON.parse(bytes);
    assert.equal(lock.schema, 'box3d-public-static-mesh-input-lock-v1');
    return { lock, lockSha256: sha(bytes) };
}
export function verifyInputs(artifacts, lock) {
    for (const path of lock.runtimeAbsentPaths ?? [])
        assert(!existsSync(join(artifacts, path)), `Previously absent runtime input appeared: ${path}`);
    for (const [base, entries] of [
        [root, lock.source],
        [root, lock.fixture],
        [artifacts, lock.runtime],
    ])
        for (const entry of entries) {
            const bytes = readFileSync(join(base, entry.path));
            assert.equal(sha(bytes), entry.sha256, `Changed input: ${entry.path}`);
            assert.equal(bytes.length, entry.bytes, `Changed size: ${entry.path}`);
        }
    return true;
}
