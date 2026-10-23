// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Lightweight byte-intake checks plus rejection of two real stale WASM modules.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, unlinkSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { root, sha256, verifySources } from './verify-sources.mjs';
import { readPatchPlan, validatePatchLock, applyExactPatch, stageCore, verifyStagedCore } from './patch-intake.mjs';
import { createBox3DBinding } from '../../../src/air/physics/box3d/binding/facade.mjs';

const out = resolve(process.argv[2]);
assert.ok(!existsSync(out), 'Preserve earlier evidence; select a new output');
mkdirSync(out, { recursive: true });
const report = {
    schemaVersion: 1,
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    scope: 'Strict source intake and real stale-WASM rejection only; no new physics or sanitizer qualification',
    checks: [],
};
const persist = () => writeFileSync(resolve(out, 'patch-intake.raw.json'), JSON.stringify(report, null, 2) + '\n');
function reject(name, action, pattern) {
    let error;
    try {
        action();
    } catch (caught) {
        error = caught;
    }
    assert.ok(
        error && pattern.test(error.message),
        `${name}: expected rejection matching ${pattern}, got ${error?.message}`,
    );
    report.checks.push({ name, expected: 'REJECT', observed: 'REJECT', error: error.message });
    persist();
}
try {
    report.sourcesBefore = verifySources();
    const plan = readPatchPlan();
    const accumulated = new Map();
    for (const item of plan.lock.patches) {
        const changedFiles = applyExactPatch(
            readFileSync(resolve(root, item.path)),
            item.files,
            (path) => accumulated.get(path) ?? readFileSync(resolve(root, 'vendor/box3d/core', path)),
        );
        for (const [path, bytes] of changedFiles) accumulated.set(path, bytes);
        report.checks.push({
            name: `all-chain-exact-application:${item.id}`,
            expected: 'PASS',
            observed: 'PASS',
            patchSha256: item.sha256,
            files: item.files.map(({ path, afterSha256 }) => ({ path, afterSha256 })),
        });
    }
    const patch = plan.lock.patches[0];
    const read = (path) => readFileSync(resolve(root, path));
    const source = read(`vendor/box3d/core/${patch.files[0].path}`);
    const patchBytes = read(patch.path);
    const mutate = (fn) => {
        const lock = structuredClone(plan.lock);
        fn(lock);
        return lock;
    };
    const validate = (lock) => validatePatchLock(lock, plan.lock.baseCoreCommit, read);
    assert.equal(validate(plan.lock), plan.patchChainSha256);
    const changed = applyExactPatch(patchBytes, patch.files, () => source);
    assert.equal(sha256(changed.get(patch.files[0].path)), patch.files[0].afterSha256);
    report.checks.push({
        name: 'locked-patch-exact-byte-application',
        expected: 'PASS',
        observed: 'PASS',
        beforeSha256: sha256(source),
        afterSha256: sha256(changed.get(patch.files[0].path)),
    });
    reject(
        'wrong-base',
        () =>
            validate(
                mutate((x) => {
                    x.baseCoreCommit = '0'.repeat(40);
                }),
            ),
        /base commit mismatch/,
    );
    reject(
        'patch-hash',
        () =>
            validate(
                mutate((x) => {
                    x.patches[0].sha256 = '0'.repeat(64);
                }),
            ),
        /bytes hash mismatch/,
    );
    reject(
        'patch-bytes',
        () =>
            validatePatchLock(plan.lock, plan.lock.baseCoreCommit, () =>
                Buffer.concat([patchBytes, Buffer.from('\n')]),
            ),
        /bytes hash mismatch/,
    );
    reject(
        'missing-patches',
        () =>
            validate(
                mutate((x) => {
                    x.patches = [];
                }),
            ),
        /Missing explicit/,
    );
    reject(
        'duplicate-patch',
        () =>
            validate(
                mutate((x) => {
                    x.patches.push(x.patches[0]);
                }),
            ),
        /ID invalid\/duplicate/,
    );
    reject(
        'patch-traversal',
        () =>
            validate(
                mutate((x) => {
                    x.patches[0].path = '../patch';
                }),
            ),
        /Unsafe patch/,
    );
    reject(
        'file-traversal',
        () =>
            validate(
                mutate((x) => {
                    x.patches[0].files[0].path = '../header';
                }),
            ),
        /Unsafe patch/,
    );
    reject(
        'before-hash',
        () => applyExactPatch(patchBytes, [{ ...patch.files[0], beforeSha256: '0'.repeat(64) }], () => source),
        /Before hash mismatch/,
    );
    reject(
        'after-hash',
        () => applyExactPatch(patchBytes, [{ ...patch.files[0], afterSha256: '0'.repeat(64) }], () => source),
        /After hash mismatch/,
    );
    reject(
        'source-drift',
        () => applyExactPatch(patchBytes, patch.files, () => Buffer.concat([source, Buffer.from('\n')])),
        /Before hash mismatch/,
    );
    reject(
        'hunk-offset-no-fuzz',
        () =>
            applyExactPatch(
                Buffer.from(patchBytes.toString().replace('-256,11', '-255,11')),
                patch.files,
                () => source,
            ),
        /Hunk offset|Exact context mismatch/,
    );
    reject(
        'hunk-context-no-fuzz',
        () =>
            applyExactPatch(
                Buffer.from(
                    patchBytes.toString().replace('static inline b3V32 b3LoadV', 'static inline b3V32 b3Different'),
                ),
                patch.files,
                () => source,
            ),
        /Exact context mismatch/,
    );
    reject(
        'hunk-count',
        () =>
            applyExactPatch(
                Buffer.from(patchBytes.toString().replace('-256,11', '-256,12')),
                patch.files,
                () => source,
            ),
        /hunk count mismatch/,
    );
    reject('unlisted-file', () => applyExactPatch(patchBytes, [], () => source), /Unlisted/);
    const stage = resolve(out, 'valid-staged-core');
    const receipt = stageCore(stage);
    assert.equal(receipt.files.length, 111);
    report.checks.push({
        name: 'complete-staged-closure',
        expected: 'PASS',
        observed: 'PASS',
        files: receipt.files.length,
        patchChainSha256: receipt.patchChainSha256,
    });
    reject('existing-staging', () => stageCore(stage), /Staging exists/);
    function changedStage(name, action, pattern) {
        const dir = resolve(out, name);
        cpSync(stage, dir, { recursive: true });
        cpSync(stage + '.receipt.json', dir + '.receipt.json');
        action(dir);
        reject(name, () => verifyStagedCore(dir), pattern);
    }
    changedStage(
        'changed-staged-header',
        (dir) => writeFileSync(resolve(dir, patch.files[0].path), source),
        /Staged source\/receipt drift/,
    );
    changedStage('missing-staged-file', (dir) => unlinkSync(resolve(dir, 'LICENSE')), /Staged source\/receipt drift/);
    changedStage(
        'extra-staged-file',
        (dir) => writeFileSync(resolve(dir, 'unexpected.c'), '// unexpected\n'),
        /Staged source\/receipt drift/,
    );
    changedStage(
        'stale-staged-identity',
        (dir) => {
            const r = structuredClone(receipt);
            r.patchChainSha256 = '0'.repeat(64);
            writeFileSync(dir + '.receipt.json', JSON.stringify(r));
        },
        /Staged patch identity mismatch/,
    );
    changedStage(
        'forged-staged-receipt',
        (dir) => {
            writeFileSync(resolve(dir, patch.files[0].path), source);
            const r = structuredClone(receipt);
            Object.assign(
                r.files.find((f) => f.path === patch.files[0].path),
                { sha256: sha256(source), bytes: source.length },
            );
            writeFileSync(dir + '.receipt.json', JSON.stringify(r));
        },
        /Staged source mismatch/,
    );
    report.staleArtifacts = [];
    for (const path of [
        'tools/physics/box3d/output/wasm-release-20261022-c',
        'tools/physics/box3d/output/sse2-qualification-20261022-d/wasm-candidate',
    ]) {
        const dir = resolve(root, path);
        const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json')));
        const wasm = readFileSync(resolve(dir, 'box3d-st.wasm'));
        const loader = readFileSync(resolve(dir, 'box3d-st.mjs'));
        for (const name of ['box3d-st.wasm', 'box3d-st.mjs'])
            assert.equal(
                sha256(readFileSync(resolve(dir, name))),
                manifest.artifacts.find((x) => x.path === name).sha256,
            );
        const { default: createModule } = await import(pathToFileURL(resolve(dir, 'box3d-st.mjs')).href);
        const module = await createModule({ wasmBinary: wasm });
        const expected = { ...manifest, patchChainSha256: plan.patchChainSha256 };
        reject(
            `stale-runtime-with-forged-current-manifest:${path}`,
            () => createBox3DBinding(module, expected),
            /patch-chain identity mismatch/,
        );
        reject(`stale-manifest:${path}`, () => createBox3DBinding(module, manifest), /patch-chain identity mismatch/);
        report.staleArtifacts.push({
            path,
            wasmSha256: sha256(wasm),
            loaderSha256: sha256(loader),
            hasFormalPatchExport: typeof module._air_b3_patch_chain_sha === 'function',
            hasQualificationOnlyExport: typeof module._air_b3_qualification_patch_sha === 'function',
        });
    }
    report.sourcesAfter = verifySources();
    assert.deepEqual(report.sourcesAfter, report.sourcesBefore);
    report.patchChainSha256 = plan.patchChainSha256;
    report.inputHashes = [
        'tools/physics/box3d/versions.lock.json',
        'tools/physics/box3d/patches/lock.json',
        ...plan.lock.patches.map((item) => item.path),
        'tools/physics/box3d/patch-intake.mjs',
        'tools/physics/box3d/verify-sources.mjs',
        'src/air/physics/box3d/binding/facade.mjs',
        relative(root, fileURLToPath(import.meta.url)),
    ].map((path) => ({ path, sha256: sha256(read(path)) }));
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.error = error.stack;
    process.exitCode = 1;
} finally {
    report.completedAt = new Date().toISOString();
    persist();
    console.log(
        JSON.stringify({
            status: report.status,
            checks: report.checks.length,
            output: relative(root, out),
            error: report.error,
        }),
    );
}
