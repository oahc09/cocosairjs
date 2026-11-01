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
// --prepare is source-only. Native qualification requires separately round-tripped inputs and lead authorization.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import inputs from './lifecycle-failure-real-wasm-inputs.cjs';
const { root, sourceHashes, qualify, hash } = inputs;
const roster = JSON.parse(readFileSync(new URL('./lifecycle-failure-real-wasm-roster.json', import.meta.url), 'utf8'));
const prepare = process.argv[4] === '--prepare';
assert(
    (prepare && process.argv.length === 5) || (process.argv.length === 6 && roster.cases.includes(process.argv[4])),
    'Usage: node lifecycle-failure-real-wasm.mjs <N4-dir> <new-output-dir> --prepare | <case> <input-roundtrip.json>',
);
const directory = resolve(process.argv[2]),
    out = resolve(process.argv[3]);
assert(!existsSync(out), 'Never overwrite a prior attempt');
mkdirSync(out, { recursive: true });
const lockPath = resolve(out, '..', '.lifecycle-failure-collector.lock');
let ownsLock = false;
const report = {
    schema: 'box3d-air-lifecycle-failure-real-wasm-v1',
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    scope: 'Four finite lifecycle delivery controls through original AIR/PhysicsSystem/World/Scene/RigidBody/BoxCollider and unchanged N4 WASM. One fresh process/app per named case. No mock physics, native numerical failure claim, rebuild, public activation, browser, Gates or formal-cell credit.',
    formalCells: roster.formalCells,
    gates: roster.gates,
    notCovered: roster.notCovered,
    rosterSha256: hash(readFileSync(new URL('./lifecycle-failure-real-wasm-roster.json', import.meta.url))),
    node: process.version,
    artifactDirectory: relative(root, directory),
    expected: prepare ? null : process.argv[4],
    sourceHashScope:
        'All src files, target fixture files, contracts/config and frozen native build inputs; runtime resolver/CJS bytes captured before load into content-addressed gzip objects.',
    hooks: [
        'Exact current local native artifacts via production loader and facade; no network or fabricated results.',
        'One exact body-bound JavaScript delivery fault before or after the real binding delegate; actual states read separately.',
        'Original public Component.enabled or RigidBody.type exactly once. No setter retry or guessed rollback.',
        'Original exception identity and immutable mutationOutcome descriptor retained. No fabricated native failure.',
    ],
};
try {
    try {
        mkdirSync(lockPath);
    } catch (error) {
        if (error.code === 'EEXIST')
            throw Object.assign(new Error('Another collector owns the parent lock; native startup refused.'), {
                code: 'COLLECTOR_BUSY',
            });
        throw error;
    }
    ownsLock = true;
    report.exclusiveCollectorLock = { path: lockPath, acquired: true, released: false };
    writeFileSync(
        join(lockPath, 'owner.json'),
        JSON.stringify({ pid: process.pid, out, startedAt: report.startedAt }) + '\n',
    );
    report.artifact = qualify(directory);
    report.sourceHashesBefore = sourceHashes(report.artifact.buildInputHashes.map((entry) => entry.path));
    const manifestSha256 = hash(JSON.stringify(report.sourceHashesBefore));
    mkdirSync(join(out, 'native-artifact-inputs'));
    for (const name of ['build-receipt.json', 'manifest.json'])
        writeFileSync(join(out, 'native-artifact-inputs', name), readFileSync(join(directory, name)));
    if (prepare) {
        const paths = [
            ...new Set([
                ...Object.keys(report.sourceHashesBefore),
                ...['manifest.json', 'build-receipt.json', 'box3d-st.mjs', 'box3d-st.wasm', 'facade.mjs'].map((name) =>
                    relative(root, join(directory, name)),
                ),
            ]),
        ].sort();
        const frozenFile = join(out, 'frozen-inputs.tar.gz');
        const archived = spawnSync(
            'tar',
            [
                '--sort=name',
                '--mtime=@0',
                '--owner=0',
                '--group=0',
                '--numeric-owner',
                '-czf',
                frozenFile,
                '-C',
                root,
                '--null',
                '-T',
                '-',
            ],
            { input: paths.join('\0') + '\0', encoding: 'utf8' },
        );
        writeFileSync(join(out, 'archive.stdout.log'), archived.stdout ?? '');
        writeFileSync(join(out, 'archive.stderr.log'), archived.stderr ?? '');
        assert.equal(archived.status, 0, 'Exact source/native input archive creation failed');
        report.frozenInputs = {
            path: frozenFile,
            sha256: hash(readFileSync(frozenFile)),
            sourceManifestSha256: manifestSha256,
            pathCount: paths.length,
        };
        report.status = 'PREPARED_INPUTS_NOT_RUN';
    } else {
        const proofFile = resolve(process.argv[5]);
        const proof = JSON.parse(readFileSync(proofFile, 'utf8'));
        assert.equal(
            proof.actual_download_verified,
            true,
            'Actual Library download/hash verification required before native startup',
        );
        assert(typeof proof.library_file_id === 'string' && proof.library_file_id.startsWith('libfile_'));
        assert(typeof proof.prepared_receipt === 'string' && typeof proof.downloaded_path === 'string');
        const prepared = JSON.parse(readFileSync(resolve(proof.prepared_receipt), 'utf8'));
        assert.equal(prepared.status, 'PREPARED_INPUTS_NOT_RUN');
        assert.equal(prepared.inputsUnchanged, true);
        assert.deepEqual(prepared.sourceHashesBefore, report.sourceHashesBefore, 'Prepared exact inputs are stale');
        assert.deepEqual(prepared.artifact, report.artifact, 'Prepared native artifact is stale');
        assert.equal(prepared.rosterSha256, report.rosterSha256, 'Frozen named roster changed');
        assert.equal(prepared.frozenInputs.sourceManifestSha256, manifestSha256);
        assert.equal(
            proof.sha256,
            prepared.frozenInputs.sha256,
            'Library object does not represent the exact input archive',
        );
        assert.equal(
            hash(readFileSync(resolve(proof.downloaded_path))),
            proof.sha256,
            'Downloaded input bytes changed',
        );
        assert.equal(hash(readFileSync(prepared.frozenInputs.path)), proof.sha256, 'Prepared input bytes changed');
        assert(
            typeof proof.authorized_source_head === 'string' && /^[0-9a-f]{40}$/.test(proof.authorized_source_head),
            'Lead-authorized committed source HEAD required',
        );
        const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
        assert.equal(git.status, 0);
        assert.equal(git.stdout.trim(), proof.authorized_source_head, 'Committed source HEAD changed');
        report.sourceHead = git.stdout.trim();
        report.externalInputs = {
            proofFile,
            proofSha256: hash(readFileSync(proofFile)),
            libraryFileId: proof.library_file_id,
            actualDownloadSha256: proof.sha256,
        };
        report.frozenInputs = {
            ...prepared.frozenInputs,
            beforeSha256: hash(readFileSync(prepared.frozenInputs.path)),
        };
        const argv = [
            '--import',
            pathToFileURL(join(root, 'tools/verify/box3d/lifecycle-failure-real-wasm-preload.mjs')).href,
            join(root, 'node_modules/jest/bin/jest.js'),
            '--config',
            'tools/verify/box3d/lifecycle-failure-real-wasm.jest.cjs',
            '--runInBand',
            '--no-cache',
        ];
        report.command = { executable: process.execPath, argv };
        const child = spawnSync(process.execPath, argv, {
            cwd: root,
            encoding: 'utf8',
            timeout: 180000,
            maxBuffer: 32 * 1024 * 1024,
            env: {
                ...process.env,
                AIR_BOX3D_LIFECYCLE_FAILURE_DIR: directory,
                AIR_BOX3D_LIFECYCLE_FAILURE_OUT: out,
                AIR_BOX3D_LIFECYCLE_FAILURE_EXPECT: report.expected,
                AIR_BOX3D_LIFECYCLE_FAILURE_OBJECTS: resolve(out, '..', 'runtime-input-objects'),
            },
        });
        // Direct subprocess streams, never reconstructed from a subsequent tool response.
        writeFileSync(join(out, 'jest.stdout.log'), child.stdout ?? '');
        writeFileSync(join(out, 'jest.stderr.log'), child.stderr ?? '');
        report.child = {
            exitCode: child.status,
            signal: child.signal,
            error: child.error ? String(child.error) : null,
        };
        const nativePath = join(out, 'native-and-app.raw.json');
        report.nativeReportSha256 = existsSync(nativePath) ? hash(readFileSync(nativePath)) : null;
        const native = existsSync(nativePath) ? JSON.parse(readFileSync(nativePath, 'utf8')) : null;
        assert.equal(
            child.status,
            0,
            'Actual lifecycle assertion failed; preserve the first raw RED and all original streams',
        );
        assert.equal(
            native?.status,
            'PASS_LIMITED_LIFECYCLE_FAILURE',
            'Missing completed lifecycle delivery-control result',
        );
        assert.deepEqual(qualify(directory), report.artifact, 'Native inputs/artifacts changed during qualification');
        report.status = native.status;
    }
} catch (error) {
    report.status = ['STALE_INPUT', 'COLLECTOR_BUSY'].includes(error.code) ? error.code : 'FAIL';
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
            report.frozenInputs.unchanged = report.frozenInputs.afterSha256 === report.frozenInputs.sha256;
            if (!report.frozenInputs.unchanged) {
                report.status = 'STALE_INPUT';
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
