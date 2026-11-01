/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Hashes a ready same-product SDK/ST pair. Does not import the SDK or instantiate WASM.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
    SCHEMA,
    LOCK_SCHEMA,
    SDK_FILES,
    ST_FILES,
    FIXTURE_FILES,
    terrain,
    entry,
    sourceEntries,
    sha,
    verifyInputs,
    verifyReady,
} from './inputs.mjs';
const [sourceArg, sdkArg, stArg, buildArg, expectedJS, producerCommit, outputArg] = process.argv.slice(2);
assert(
    sourceArg && sdkArg && stArg && outputArg,
    'Pass source-root sdk-dir ready-st-dir build-number JS_SHA256 producer-commit fresh-lock',
);
assert(/^\d+$/.test(buildArg) && /^[a-f0-9]{64}$/.test(expectedJS) && /^[a-f0-9]{40}$/.test(producerCommit));
const sourceRoot = resolve(sourceArg),
    sdkDir = resolve(sdkArg),
    stDir = resolve(stArg),
    output = resolve(outputArg);
assert(!existsSync(output), 'A frozen lock may never be overwritten');
assert.equal(sha(readFileSync(join(sdkDir, 'cocosair.module.js'))), expectedJS);
const lock = {
    schema: LOCK_SCHEMA,
    schemaSha256: SCHEMA,
    scope: 'public-terrain-only; full gates NOT_RUN; C19 NOT_QUALIFIED',
    generatedAt: new Date().toISOString(),
    runtimeBuildNumber: Number(buildArg),
    declaredRuntimeProducerCommit: producerCommit,
    sourceSnapshotRole:
        'Actual source bytes at freeze. Producer commit is caller-declared, not inferred from ST identity; retain the independent ESM build receipt for source-to-binary provenance.',
    sdk: SDK_FILES.map((path) => entry(sdkDir, path)),
    st: ST_FILES.map((path) => entry(stDir, path)),
    source: sourceEntries(sourceRoot),
    fixture: FIXTURE_FILES.map((path) => entry(terrain, path)),
};
verifyInputs(sourceRoot, sdkDir, stDir, lock);
lock.readiness = await verifyReady(sourceRoot, stDir);
writeFileSync(output, JSON.stringify(lock, null, 2) + '\n', { flag: 'wx' });
console.log(
    JSON.stringify({
        output,
        sha256: sha(readFileSync(output)),
        runtimeBuildNumber: lock.runtimeBuildNumber,
        sourceCount: lock.source.length,
        physics: 'NOT_RUN',
    }),
);
