/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/
// Context-reconstructed final atomic collector; original per-file hash is unavailable.
// Must be freshly executed after restoration; no historical result is reconstructed.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, renameSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import inputs from './owner-teleport-real-wasm-inputs.cjs';
const { root, sourceHashes, qualify, hash } = inputs;
assert(
    process.argv.length === 5 &&
        [
            'native-disabled-dynamic-clear',
            'native-disabled-kinematic-preserve',
            'disabled-dynamic-clear',
            'disabled-kinematic-preserve',
            'enabled-default-order',
            'enabled-preserve-forces',
            'enabled-wake-false',
            'invalid-quaternion',
            'invalid-options',
            'invalid-getter',
            'invalid-getter-cancel',
        ].includes(process.argv[4]),
    'Usage: node owner-teleport-real-wasm.mjs <current-artifact-directory> <new-evidence-directory> <case>',
);
const directory = resolve(process.argv[2]),
    out = resolve(process.argv[3]);
assert(!existsSync(out), 'Never overwrite a prior attempt');
mkdirSync(out, { recursive: true });
const lockPath = resolve(out, '..', '.owner-teleport-collector.lock');
let ownsLock = false;
const report = {
    schema: 'box3d-air-owner-teleport-real-wasm-v1',
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    scope: 'Finite internal teleport actual consumer only: actual AIR/PhysicsSystem/World/Scene/RigidBody/BoxCollider and unchanged qualified N4 WASM. Each named case has a fresh process and actual app. No mocks, rebuild, public activation, browser, target owner, full Gates or formal-cell qualification.',
    formalCells: { total: 2128, status: 'NOT_RUN' },
    node: process.version,
    sourceHashScope:
        'All src files and direct fixtures/contracts/config/build inputs frozen before collection; actual Jest resolver and Node CJS dependencies captured before load into content-addressed gzip objects. Native artifacts are hash-qualified and frozen unchanged.',
    artifactDirectory: relative(root, directory),
    expected: process.argv[4],
    hooks: [
        'Local-file transport for exact current manifest/mjs/wasm only; no network',
        'Real production createBinding with transparent method observation, no fabricated native results or injected native failure',
        'JSDOM imports actual AIR source and invokes original PhysicsSystem.step without replacing World or command-owner methods',
    ],
};
try {
    try {
        mkdirSync(lockPath);
    } catch (error) {
        if (error.code === 'EEXIST')
            throw Object.assign(
                new Error(
                    'Another collector owns the evidence-parent lock; concurrent collection is refused before native startup.',
                ),
                { code: 'COLLECTOR_BUSY' },
            );
        throw error;
    }
    ownsLock = true;
    report.exclusiveCollectorLock = { path: lockPath, acquired: true, released: false };
    writeFileSync(
        join(lockPath, 'owner.json'),
        JSON.stringify({ pid: process.pid, out, startedAt: report.startedAt }) + '\n',
    );
    report.sourceHashesBefore = sourceHashes();
    report.inspectedBuildReceiptSha256 = hash(readFileSync(join(directory, 'build-receipt.json')));
    report.inspectedManifestSha256 = hash(readFileSync(join(directory, 'manifest.json')));
    report.artifact = qualify(directory);
    mkdirSync(join(out, 'native-artifact-inputs'));
    for (const name of ['build-receipt.json', 'manifest.json'])
        writeFileSync(join(out, 'native-artifact-inputs', name), readFileSync(join(directory, name)));
    report.sourceHashesBefore = sourceHashes(report.artifact.buildInputHashes.map((entry) => entry.path));
    const frozenHash = hash(JSON.stringify(report.sourceHashesBefore));
    const frozenFile = resolve(out, '..', 'frozen-inputs-' + frozenHash + '.tar.gz');
    const candidateFile = join(out, 'frozen-inputs.candidate.tar.gz');
    const paths = [
        ...Object.keys(report.sourceHashesBefore),
        ...['manifest.json', 'build-receipt.json', 'box3d-st.mjs', 'box3d-st.wasm', 'facade.mjs'].map((name) =>
            relative(root, join(directory, name)),
        ),
    ];
    const archived = spawnSync('tar', ['-czf', candidateFile, '-C', root, '--null', '-T', '-'], {
        input: paths.join('\0') + '\0',
        encoding: 'utf8',
    });
    assert.equal(archived.status, 0, archived.stderr);
    const expectedArchiveSha256 = hash(readFileSync(candidateFile));
    if (existsSync(frozenFile)) {
        if (hash(readFileSync(frozenFile)) !== expectedArchiveSha256)
            throw Object.assign(
                new Error(
                    'Existing frozen archive does not match the newly completed exact input archive; both copies are retained.',
                ),
                { code: 'FROZEN_ARCHIVE_MISMATCH' },
            );
        rmSync(candidateFile);
    } else renameSync(candidateFile, frozenFile);
    const archiveBeforeSha256 = hash(readFileSync(frozenFile));
    assert.equal(archiveBeforeSha256, expectedArchiveSha256);
    report.frozenInputs = {
        path: frozenFile,
        sha256: archiveBeforeSha256,
        expectedSha256: expectedArchiveSha256,
        beforeSha256: archiveBeforeSha256,
        sourceManifestSha256: frozenHash,
        publication:
            'Exclusive evidence-parent lock; unique completed candidate; exact-hash comparison or atomic rename.',
    };
    const argv = [
        '--import',
        pathToFileURL(join(root, 'tools/verify/box3d/owner-teleport-real-wasm-preload.mjs')).href,
        join(root, 'node_modules/jest/bin/jest.js'),
        '--config',
        'tools/verify/box3d/owner-teleport-real-wasm.jest.cjs',
        '--runInBand',
        '--no-cache',
    ];
    report.command = { executable: process.execPath, argv };
    const child = spawnSync(process.execPath, argv, {
        cwd: root,
        encoding: 'utf8',
        timeout: 180000,
        maxBuffer: 16 * 1024 * 1024,
        env: {
            ...process.env,
            AIR_BOX3D_TELEPORT_DIR: directory,
            AIR_BOX3D_TELEPORT_OUT: out,
            AIR_BOX3D_TELEPORT_EXPECT: report.expected,
            AIR_BOX3D_TELEPORT_OBJECTS: resolve(out, '..', 'runtime-input-objects'),
        },
    });
    writeFileSync(join(out, 'jest.stdout.log'), child.stdout ?? '');
    writeFileSync(join(out, 'jest.stderr.log'), child.stderr ?? '');
    report.child = { exitCode: child.status, signal: child.signal, error: child.error ? String(child.error) : null };
    const nativePath = join(out, 'native-and-app.raw.json');
    report.nativeReportSha256 = existsSync(nativePath) ? hash(readFileSync(nativePath)) : null;
    const native = existsSync(nativePath) ? JSON.parse(readFileSync(nativePath, 'utf8')) : null;
    if (native?.status === 'PENDING_FIXTURE_SEAM')
        throw Object.assign(new Error(native.error), { code: 'PENDING_FIXTURE_SEAM' });
    assert.equal(child.status, 0, 'Real-WASM source fixture failed; retain raw logs');
    assert(native && native.status === 'PASS_LIMITED_TELEPORT', 'Missing completed fixture result');
    assert.deepEqual(qualify(directory), report.artifact, 'Native build inputs/artifacts changed during collection');
    report.status = native.status;
} catch (error) {
    report.status = ['STALE_INPUT', 'PENDING_FIXTURE_SEAM', 'COLLECTOR_BUSY', 'FROZEN_ARCHIVE_MISMATCH'].includes(
        error.code,
    )
        ? error.code
        : 'FAIL';
    report.error = { message: String(error.stack ?? error), paths: error.paths ?? [] };
    process.exitCode = 1;
} finally {
    try {
        report.sourceHashesAfter = sourceHashes(report.artifact?.buildInputHashes.map((entry) => entry.path) ?? []);
        report.inputsUnchanged = report.sourceHashesBefore
            ? JSON.stringify(report.sourceHashesBefore) === JSON.stringify(report.sourceHashesAfter)
            : null;
        if (report.inputsUnchanged === false) {
            report.status = 'STALE_INPUT';
            process.exitCode = 1;
        }
        const transitivePath = join(out, 'transitive-inputs.raw.jsonl');
        if (existsSync(transitivePath)) {
            const captured = new Map(),
                problems = [];
            for (const line of readFileSync(transitivePath, 'utf8').trim().split('\n')) {
                const item = JSON.parse(line),
                    previous = captured.get(item.path);
                if (previous && previous.sha256 !== item.sha256)
                    problems.push({ path: item.path, reason: 'changed between loads' });
                captured.set(item.path, item);
            }
            for (const item of captured.values()) {
                if (hash(readFileSync(item.path)) !== item.sha256)
                    problems.push({ path: item.path, reason: 'changed after load' });
                if (hash(gunzipSync(readFileSync(item.object))) !== item.sha256)
                    problems.push({ path: item.path, reason: 'frozen bytes mismatch' });
            }
            report.transitiveInputs = {
                count: captured.size,
                manifestSha256: hash(readFileSync(transitivePath)),
                problems,
            };
            if (problems.length) {
                report.status = 'STALE_INPUT';
                process.exitCode = 1;
            }
        }
        if (report.frozenInputs) {
            report.frozenInputs.afterSha256 = hash(readFileSync(report.frozenInputs.path));
            report.frozenInputs.unchanged =
                report.frozenInputs.afterSha256 === report.frozenInputs.beforeSha256 &&
                report.frozenInputs.afterSha256 === report.frozenInputs.expectedSha256;
            if (!report.frozenInputs.unchanged) {
                report.status = 'FROZEN_ARCHIVE_MISMATCH';
                process.exitCode = 1;
            }
        }
    } catch (error) {
        report.status = 'FAIL_EVIDENCE_VALIDATION';
        report.evidenceError = String(error.stack ?? error);
        process.exitCode = 1;
    } finally {
        rmSync(join(out, 'jest-cache'), { recursive: true, force: true });
        if (ownsLock) {
            rmSync(lockPath, { recursive: true, force: false });
            report.exclusiveCollectorLock.released = true;
        }
        report.completedAt = new Date().toISOString();
        writeFileSync(join(out, 'receipt.json'), JSON.stringify(report, null, 2) + '\n');
        console.log(
            JSON.stringify({ status: report.status, output: relative(root, out), error: report.error ?? null }),
        );
    }
}
