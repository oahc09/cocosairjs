// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Second-patch hash intake and stale real runtime negatives. Never edits original sources/artifacts.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { root, verifySources, sha256 } from './verify-sources.mjs';
import { readPatchPlan, validatePatchLock, applyExactPatch, stageCore } from './patch-intake.mjs';
import { createBox3DBinding } from '../../../src/air/physics/box3d/binding/facade.mjs';
const out = resolve(process.argv[2]);
assert.ok(!existsSync(out));
mkdirSync(out, { recursive: true });
const report = { status: 'RUNNING', startedAt: new Date().toISOString(), checks: [] };
const persist = () => writeFileSync(resolve(out, 'geometry-intake.raw.json'), JSON.stringify(report, null, 2) + '\n');
const check = (name, fn, reject = false) => {
    if (reject) assert.throws(fn);
    else fn();
    report.checks.push({ name, result: 'PASS', expectedRejection: reject });
    persist();
};
try {
    report.before = verifySources();
    const plan = readPatchPlan();
    const patch = plan.lock.patches[1];
    assert.deepEqual(
        plan.lock.patches.map((item) => item.id),
        ['sse2-loadv-float-alignment-v1', 'contact-generation-geometry-v2', 'checked-hull-cooking-v1'],
    );
    const read = (path) => readFileSync(resolve(root, path));
    const source = (path) => read('vendor/box3d/core/' + path);
    check('exact-second-patch-five-file-intake', () =>
        assert.equal(applyExactPatch(read(patch.path), patch.files, source).size, 5),
    );
    check('complete-three-patch-staging', () => stageCore(resolve(out, 'staged-core')));
    for (const kind of ['patch', 'before', 'after', 'base', 'order'])
        check(
            `reject-${kind}`,
            () => {
                const lock = structuredClone(plan.lock);
                if (kind === 'patch') lock.patches[1].sha256 = '0'.repeat(64);
                if (kind === 'before') lock.patches[1].files[0].beforeSha256 = '0'.repeat(64);
                if (kind === 'after') lock.patches[1].files[0].afterSha256 = '0'.repeat(64);
                if (kind === 'base') lock.baseCoreCommit = '0'.repeat(40);
                if (kind === 'order') lock.patches[1].files[0].beforeSha256 = lock.patches[1].files[0].afterSha256;
                validatePatchLock(lock, plan.lock.baseCoreCommit, read);
                applyExactPatch(read(patch.path), lock.patches[1].files, source);
            },
            true,
        );
    const dir = resolve(root, 'tools/physics/box3d/output/wasm-snapshot-release-20261022-g');
    const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json')));
    for (const file of manifest.artifacts) assert.equal(sha256(readFileSync(resolve(dir, file.path))), file.sha256);
    const { default: createModule } = await import(pathToFileURL(resolve(dir, 'box3d-st.mjs')).href);
    const module = await createModule({ wasmBinary: readFileSync(resolve(dir, 'box3d-st.wasm')) });
    for (const [name, expected] of [
        ['old-g-manifest', manifest],
        [
            'forged-current-g-manifest',
            { ...manifest, schemaSha256: report.before.schemaSha256, patchChainSha256: plan.patchChainSha256 },
        ],
        ['missing-chain', { ...manifest, patchChainSha256: undefined }],
    ])
        check(name, () => createBox3DBinding(module, expected), true);
    report.after = verifySources();
    assert.deepEqual(report.before, report.after);
    report.fixtureSha256 = sha256(readFileSync(fileURLToPath(import.meta.url)));
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.error = error.stack;
    process.exitCode = 1;
} finally {
    report.completedAt = new Date().toISOString();
    persist();
    console.log(JSON.stringify({ status: report.status, checks: report.checks.length, error: report.error }));
}
