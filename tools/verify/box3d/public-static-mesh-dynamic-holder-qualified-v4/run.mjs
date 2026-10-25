/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Bounded, fresh-only process capture. No builds, adapters, native patches, or retries.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { here, sha } from './inputs.mjs';
const [runtimeArgument, lockArgument, outputArgument] = process.argv.slice(2);
assert(runtimeArgument && lockArgument && outputArgument, 'Pass ready runtime, frozen lock, and new attempt directory');
const output = resolve(outputArgument);
assert(!existsSync(output), 'An attempt directory may never be reused');
mkdirSync(output, { recursive: true });
const receipt = {
    schema: 'box3d-public-static-mesh-process-capture-v1',
    startedAt: new Date().toISOString(),
    node: process.version,
    status: 'RUNNING',
    processes: [],
};
const flush = () => writeFileSync(join(output, 'process.raw.json'), JSON.stringify(receipt, null, 2) + '\n');
flush();
function run(label, args) {
    const stdoutPath = join(output, label + '.stdout.txt'),
        stderrPath = join(output, label + '.stderr.txt');
    const stdout = openSync(stdoutPath, 'wx'),
        stderr = openSync(stderrPath, 'wx');
    let result;
    try {
        result = spawnSync(process.execPath, args, { cwd: here, stdio: ['ignore', stdout, stderr], timeout: 240000 });
    } finally {
        closeSync(stdout);
        closeSync(stderr);
    }
    const row = {
        label,
        executable: process.execPath,
        args,
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
    flush();
    return row.status === 0 && row.signal === null && row.error === null;
}
let pass = run('oracle', ['--test', join(here, 'geometry.test.mjs')]);
if (pass)
    pass = run('consumer', [
        join(here, 'consumer.mjs'),
        resolve(runtimeArgument),
        resolve(lockArgument),
        join(output, 'result'),
    ]);
if (pass) {
    try {
        const resultPath = join(output, 'result', 'consumer.raw.json');
        const bytes = readFileSync(resultPath),
            result = JSON.parse(bytes);
        assert.equal(result.status, 'PASS_LIMITED_NODE_HEADLESS_PUBLIC_STATIC_MESH');
        assert.equal(result.inputsUnchanged, true);
        assert.equal(result.close.status, 'released');
        assert.equal(result.close.failures.length, 0);
        assert(result.completedAt && result.checks.length > 0 && result.checks.every((row) => row.pass === true));
        receipt.result = {
            path: 'result/consumer.raw.json',
            sha256: sha(bytes),
            bytes: bytes.length,
            status: result.status,
            completedAt: result.completedAt,
        };
    } catch (error) {
        pass = false;
        receipt.resultValidationError = String(error.stack ?? error);
    }
}
receipt.status = pass ? 'PASS_LIMITED_NODE_HEADLESS_PUBLIC_STATIC_MESH' : 'FAIL';
receipt.completedAt = new Date().toISOString();
if (!pass) process.exitCode = 1;
flush();
console.log(
    JSON.stringify({
        status: receipt.status,
        output,
        processes: receipt.processes.map(({ label, status, signal }) => ({ label, status, signal })),
    }),
);
