// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import inputs from './inputs.cjs';
const { root, sourceHashes, verifyArtifact } = inputs,
    here = dirname(fileURLToPath(import.meta.url));
process.env.CAPSULE56_QUALIFICATION = process.argv[4] ?? 'full';
assert(['full'].includes(process.env.CAPSULE56_QUALIFICATION));
const directory = resolve(process.argv[2]),
    out = resolve(process.argv[3]);
assert(!existsSync(out));
mkdirSync(out, { recursive: true });
const report = {
    status: 'RUNNING',
    scope: 'Finite real Cocos public capsule integration; Node/JSDOM HEADLESS and exact receipt-bound WASM only, no renderer/browser/production qualification',
    startedAt: new Date().toISOString(),
    sourceHeadAtRun: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim(),
    qualificationMode: process.env.CAPSULE56_QUALIFICATION,
};
try {
    report.sourceHashesBefore = sourceHashes();
    report.artifact = await verifyArtifact(directory);
    const argv = [
        '--import',
        pathToFileURL(join(here, 'preload.mjs')).href,
        join(root, 'node_modules/jest/bin/jest.js'),
        '--config',
        join(here, 'jest.cjs'),
        '--runInBand',
        '--no-cache',
    ];
    report.command = { executable: process.execPath, argv };
    const child = spawnSync(process.execPath, argv, {
        cwd: root,
        encoding: 'utf8',
        timeout: 180000,
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, CAPSULE56_ARTIFACT: directory, CAPSULE56_OUT: out },
    });
    writeFileSync(join(out, 'jest.stdout.txt'), child.stdout ?? '');
    writeFileSync(join(out, 'jest.stderr.txt'), child.stderr ?? '');
    report.child = { exitCode: child.status, signal: child.signal, error: child.error ? String(child.error) : null };
    assert.equal(child.status, 0);
    const native = JSON.parse(readFileSync(join(out, 'native-and-cocos.raw.json')));
    assert.equal(native.status, 'PASS_LIMITED_COCOS_CAPSULE');
    assert.deepEqual(await verifyArtifact(directory), report.artifact);
    report.status = 'PASS_LIMITED_COCOS_CAPSULE';
} catch (error) {
    report.status = 'FAIL';
    report.error = String(error.stack ?? error);
    process.exitCode = 1;
} finally {
    try {
        report.sourceHashesAfter = sourceHashes();
        assert.deepEqual(report.sourceHashesAfter, report.sourceHashesBefore);
    } catch (error) {
        report.status = 'STALE_INPUT';
        report.drift = String(error);
        process.exitCode = 1;
    }
    report.completedAt = new Date().toISOString();
    writeFileSync(join(out, 'receipt.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status: report.status, out, error: report.error }));
}
