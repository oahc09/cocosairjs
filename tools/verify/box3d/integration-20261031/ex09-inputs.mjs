/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Independent 20261031 fixture. Does not confer historical campaign or browser credit.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
assert(
    process.env.BOX3D_INTEGRATION_LOCK && process.env.BOX3D_INTEGRATION_SOURCE_ROOT,
    'Explicit integration lock required',
);
export const root = resolve(process.env.BOX3D_INTEGRATION_SOURCE_ROOT);
export const lock = JSON.parse(readFileSync(process.env.BOX3D_INTEGRATION_LOCK));
export const scope =
    'Integration 20261031: bounded Node/JSDOM production ST WASM query, ray, target, support and Fixed only. No browser, full EX09, MT or original Gate credit.';
export const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function verifyInputs(artifacts, lockPath = process.env.BOX3D_INTEGRATION_LOCK) {
    assert.equal(resolve(lockPath), resolve(process.env.BOX3D_INTEGRATION_LOCK));
    assert.equal(lock.schema, 'box3d-ex09-integration-20261031-inputs-v1');
    assert.equal(lock.scope, scope);
    for (const [group, base] of [
        ['runtime', artifacts],
        ['source', root],
        ['fixture', lock.fixtureRoot],
    ]) {
        assert(lock[group].length > 0, `Missing ${group} roster`);
        for (const item of lock[group]) {
            assert(!item.path.includes('..') && !item.path.startsWith('/'));
            const bytes = readFileSync(join(base, item.path));
            assert.equal(bytes.length, item.bytes, `${group}/${item.path}: byte count`);
            assert.equal(sha(bytes), item.sha256, `${group}/${item.path}: hash`);
        }
    }
    return { lock, runtime: lock.runtime, source: lock.source, fixture: lock.fixture };
}
