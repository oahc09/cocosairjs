/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// CPU and consumer children share one externally supervised 334-second main window.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { here, sha, PASS, PROFILE, validateResult, loadLock } from './inputs.mjs';
const [authorization, sourceArg, sdkArg, stArg, evidenceArg, lockArg, outputArg] = process.argv.slice(2);
assert.equal(authorization, '--authorized-module-release-fresh-st');
assert(sourceArg && sdkArg && stArg && evidenceArg && lockArg && outputArg);
const output = resolve(outputArg);
assert(!existsSync(output), 'Fresh-only attempt');
mkdirSync(output, { recursive: true });
const receipt = {
    schema: 'air-box3d-public-module-release-process-v1',
    profile: PROFILE,
    startedAt: new Date().toISOString(),
    status: 'RUNNING',
    processes: [],
    boundary: 'Child exits are not physical closure; external ALL_CHILDREN/ECHILD supervisor remains mandatory',
};
writeFileSync(join(output, 'intent.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
function run(label, args, timeoutMs) {
    const stdoutPath = join(output, label + '.stdout.txt'),
        stderrPath = join(output, label + '.stderr.txt');
    const stdout = openSync(stdoutPath, 'wx'),
        stderr = openSync(stderrPath, 'wx');
    let result;
    try {
        result = spawnSync(process.execPath, args, {
            cwd: here,
            stdio: ['ignore', stdout, stderr],
            timeout: timeoutMs,
            killSignal: 'SIGKILL',
        });
    } finally {
        closeSync(stdout);
        closeSync(stderr);
    }
    const row = {
        label,
        args,
        executable: process.execPath,
        timeoutMs,
        status: result.status,
        signal: result.signal,
        error: result.error ? String(result.error.stack ?? result.error) : null,
        stdout: {
            path: label + '.stdout.txt',
            bytes: readFileSync(stdoutPath).length,
            sha256: sha(readFileSync(stdoutPath)),
        },
        stderr: {
            path: label + '.stderr.txt',
            bytes: readFileSync(stderrPath).length,
            sha256: sha(readFileSync(stderrPath)),
        },
    };
    receipt.processes.push(row);
    writeFileSync(join(output, label + '.process.json'), JSON.stringify(row, null, 2) + '\n', { flag: 'wx' });
    return row.status === 0 && row.signal === null && row.error === null;
}
let pass = false;
try {
    loadLock(resolve(lockArg));

    pass = run(
        'cpu-controls',
        [
            '--test',
            join(here, '../../loader-contract.test.mjs'),
            join(here, '../../../../../../tools/verify/box3d/loader-lifecycle.test.mjs'),
            join(here, '../../../../../../tools/verify/box3d/app-preparation.test.cjs'),
            join(here, '../../contract.test.mjs'),
            join(here, 'inputs.test.mjs'),
        ],
        30000,
    );
    if (pass)
        pass = run(
            'consumer',
            [
                join(here, 'consumer.mjs'),
                authorization,
                ...[sourceArg, sdkArg, stArg, evidenceArg, lockArg].map((value) => resolve(value)),
                join(output, 'result'),
            ],
            300000,
        );
    if (pass) {
        const bytes = readFileSync(join(output, 'result/consumer.raw.json')),
            report = JSON.parse(bytes);
        validateResult(report);
        assert.equal(sha(readFileSync(join(output, 'result/input-lock.json'))), report.lockSha256);
        assert.equal(sha(readFileSync(join(output, 'result/observations.raw.jsonl'))), report.journal.sha256);
        receipt.result = { path: 'result/consumer.raw.json', bytes: bytes.length, sha256: sha(bytes) };
    }
} catch (error) {
    pass = false;
    receipt.error = String(error.stack ?? error);
}
try {
    if (existsSync(join(output, 'result/consumer.raw.json'))) {
        const report = JSON.parse(readFileSync(join(output, 'result/consumer.raw.json')));
        receipt.consumerStatus = report.status;
        receipt.fixtureStatus = report.fixtureStatus;
        receipt.completedFrames = report.frames?.length ?? 0;
        receipt.moduleReleaseStatus = report.moduleRelease?.status ?? null;
        receipt.primaryError = report.error ?? null;
        receipt.closeError = report.closeError ?? null;
    }
} catch (error) {
    pass = false;
    receipt.reportReadError = String(error.stack ?? error);
}
receipt.status = pass ? PASS : 'FAIL';
receipt.completedAt = new Date().toISOString();
writeFileSync(join(output, 'process.raw.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(
    JSON.stringify({
        status: receipt.status,
        output,
        processes: receipt.processes.map(({ label, status, signal }) => ({ label, status, signal })),
    }),
);
if (!pass) process.exitCode = 1;
