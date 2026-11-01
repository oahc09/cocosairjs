/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
import assert from 'node:assert/strict';
import manifestInputs from '../../manifest-inputs.cjs';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
assert(process.env.BOX3D_COHORT_LOCK && process.env.BOX3D_COHORT_SOURCE_ROOT, 'Explicit frozen cohort required');
export const root = resolve(process.env.BOX3D_COHORT_SOURCE_ROOT);
export const lock = JSON.parse(readFileSync(process.env.BOX3D_COHORT_LOCK));
export const scope =
    'One frozen production build; bounded Node/JSDOM real ST WASM consumers only. No browser, MT, formal cells or Gate credit.';
export const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function verifyInputs(artifacts, lockPath = process.env.BOX3D_COHORT_LOCK) {
    assert.equal(resolve(lockPath), resolve(process.env.BOX3D_COHORT_LOCK));
    manifestInputs.verify(lock, artifacts, root, lock.fixtureRoot);
    return { lock, runtime: lock.runtime, source: lock.source, fixture: lock.fixture };
}
