/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Present-only readiness freeze. Compile-only WASM export inspection; never import a production SDK.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG, PROFILE as STRICT_PROFILE, HOST_SHA256 } from '../../c20-app-scene-cycles/v2/contract.mjs';
import { PROFILE, SCHEMA_SHA256, EXPECTED_RUNTIME_BUILD_NUMBER } from './profile.mjs';
import {
    LOCK_SCHEMA,
    SCOPE,
    SDK_FILES,
    ST_FILES,
    RUNNER_FILES,
    IMPORTED_FILES,
    SUPERVISOR,
    here,
    entry,
    sourceEntries,
    sha,
    json,
    validateProvenance,
    verifyInputs,
    verifyReady,
} from './inputs.mjs';
export async function freezeInputs({ sourceRoot, sdkDir, stDir, evidenceRoot, provenancePath, output }) {
    assert(!existsSync(output), 'A frozen lock may never be overwritten');
    const provenance = validateProvenance(json(evidenceRoot, provenancePath));
    const lock = {
        schema: LOCK_SCHEMA,
        schemaSha256: SCHEMA_SHA256,
        scope: SCOPE,
        profile: PROFILE,
        strictProfile: STRICT_PROFILE,
        generatedAt: new Date().toISOString(),
        runtimeBuildNumber: EXPECTED_RUNTIME_BUILD_NUMBER,
        configuration: CONFIG,
        hostSha256: HOST_SHA256,
        moduleFactoryReplaced: false,
        sourceSnapshotRole:
            'Actual source at freeze, distinct from runtime/native producer commits. Exact retained producer receipts bind SDK226/new ST, not current branch HEAD.',
        provenanceFile: entry(evidenceRoot, provenancePath),
        provenance,
        sdk: SDK_FILES.map((path) => entry(sdkDir, path)),
        st: ST_FILES.map((path) => entry(stDir, path)),
        source: sourceEntries(sourceRoot),
        runner: RUNNER_FILES.map((path) => entry(here, path)),
        imported: IMPORTED_FILES,
        supervisor: entry(sourceRoot, SUPERVISOR.path),
    };
    assert.equal(lock.supervisor.sha256, SUPERVISOR.sha256);
    verifyInputs(sourceRoot, sdkDir, stDir, evidenceRoot, lock);
    lock.readiness = await verifyReady(sourceRoot, stDir, evidenceRoot, provenance);
    writeFileSync(output, JSON.stringify(lock, null, 2) + '\n', { flag: 'wx' });
    return {
        status: 'READY_INPUT_LOCK_ONLY_NOT_ACCEPTANCE',
        path: output,
        sha256: sha(readFileSync(output)),
        sourceCount: lock.source.length,
        physics: 'NOT_RUN',
    };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const [sourceArg, sdkArg, stArg, evidenceArg, provenancePath, outputArg] = process.argv.slice(2);
        assert(
            sourceArg && sdkArg && stArg && evidenceArg && provenancePath && outputArg,
            'Pass source-root sdk-dir new-st-dir evidence-root provenance-relative-path fresh-lock',
        );
        console.log(
            JSON.stringify(
                await freezeInputs({
                    sourceRoot: resolve(sourceArg),
                    sdkDir: resolve(sdkArg),
                    stDir: resolve(stArg),
                    evidenceRoot: resolve(evidenceArg),
                    provenancePath,
                    output: resolve(outputArg),
                }),
            ),
        );
    } catch (error) {
        console.error(JSON.stringify({ status: 'NOT_READY', physics: 'NOT_RUN', error: String(error.stack ?? error) }));
        process.exitCode = 2;
    }
}
