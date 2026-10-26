/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Fresh-only bounded capture: no builds, installation, retries, browsers or detached processes.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { here, sha, PASS, validateResult } from './inputs.mjs';
import { PROFILE, CONFIG, QUALIFICATION } from './contract.mjs';
const [authorization, sourceArg, sdkArg, stArg, lockArg, outputArg] = process.argv.slice(2);
assert.equal(
    authorization,
    '--authorized-c20app-fresh-st',
    'Explicit execution flag required; not a substitute for user authorization',
);
assert(
    sourceArg && sdkArg && stArg && lockArg && outputArg,
    'Pass source-root sdk-dir ready-st-dir frozen-lock new-attempt',
);
const output = resolve(outputArg);
assert(!existsSync(output), 'An attempt directory may never be reused');
mkdirSync(output, { recursive: true });
const receipt = {
    schema: 'box3d-c20app-process-capture-v1',
    startedAt: new Date().toISOString(),
    node: process.version,
    status: 'RUNNING',
    fullGates: 'NOT_RUN',
    profile: PROFILE,
    configuration: CONFIG,
    qualification: QUALIFICATION,
    boundary:
        'Node child terminal status, not browser process-tree/ECHILD acceptance. SIGKILL deadline is a failure, never normal close.',
    processes: [],
};
writeFileSync(join(output, 'intent.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
function run(label, args, timeout) {
    const stdoutPath = join(output, label + '.stdout.txt'),
        stderrPath = join(output, label + '.stderr.txt');
    const stdout = openSync(stdoutPath, 'wx'),
        stderr = openSync(stderrPath, 'wx');
    let result;
    try {
        result = spawnSync(process.execPath, args, {
            cwd: here,
            stdio: ['ignore', stdout, stderr],
            timeout,
            killSignal: 'SIGKILL',
        });
    } finally {
        closeSync(stdout);
        closeSync(stderr);
    }
    const row = {
        label,
        executable: process.execPath,
        args,
        timeoutMs: timeout,
        status: result.status,
        signal: result.signal,
        error: result.error ? String(result.error.stack ?? result.error) : null,
        stdout: {
            path: label + '.stdout.txt',
            sha256: sha(readFileSync(stdoutPath)),
            bytes: readFileSync(stdoutPath).length,
        },
        stderr: {
            path: label + '.stderr.txt',
            sha256: sha(readFileSync(stderrPath)),
            bytes: readFileSync(stderrPath).length,
        },
    };
    receipt.processes.push(row);
    writeFileSync(join(output, label + '.process.json'), JSON.stringify(row, null, 2) + '\n', { flag: 'wx' });
    return row.status === 0 && row.signal === null && row.error === null;
}
let pass = false;
try {
    pass = run('cpu-controls', ['--test', join(here, 'contract.test.mjs')], 30000);
    if (pass)
        pass = run(
            'consumer',
            [
                join(here, 'consumer.mjs'),
                authorization,
                resolve(sourceArg),
                resolve(sdkArg),
                resolve(stArg),
                resolve(lockArg),
                join(output, 'result'),
            ],
            CONFIG.consumerTimeoutMs,
        );
    if (pass) {
        const bytes = readFileSync(join(output, 'result/consumer.raw.json')),
            report = JSON.parse(bytes);
        validateResult(report);
        assert.equal(sha(readFileSync(join(output, 'result/input-lock.json'))), report.lockSha256);
        assert.equal(sha(readFileSync(join(output, 'result/observations.raw.jsonl'))), report.journal.sha256);
        receipt.result = {
            path: 'result/consumer.raw.json',
            sha256: sha(bytes),
            bytes: bytes.length,
            status: report.status,
            completedAt: report.completedAt,
        };
    }
} catch (error) {
    pass = false;
    receipt.error = String(error.stack ?? error);
}
receipt.status = pass ? PASS : 'FAIL';
receipt.completedAt = new Date().toISOString();
writeFileSync(join(output, 'process.raw.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
if (!pass) process.exitCode = 1;
console.log(
    JSON.stringify({
        status: receipt.status,
        output,
        processes: receipt.processes.map(({ label, status, signal }) => ({ label, status, signal })),
    }),
);
