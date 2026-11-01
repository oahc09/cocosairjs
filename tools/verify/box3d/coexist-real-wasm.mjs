// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// New output only. Separate Node process per case; no runtime/native build or socket.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import inputs from './coexist-real-wasm-inputs.cjs';
const { root, hash, qualifyThreeD, qualifyTwoD, sourceHashes, scenarios } = inputs;
assert(
    process.argv.length === 4 || process.argv.length === 5,
    'Usage: coexist-real-wasm.mjs <current-3d-artifacts> <new-output> [case]',
);
const directory = resolve(process.argv[2]),
    out = resolve(process.argv[3]);
const selected = process.argv[4] ? [process.argv[4]] : scenarios;
assert(selected.every((name) => scenarios.includes(name)));
assert(!existsSync(out), 'Prior evidence must not be overwritten');
mkdirSync(out, { recursive: true });
const report = {
    schema: 'box3d-coexist-real-wasm-v1',
    status: 'RUNNING',
    node: process.version,
    startedAt: new Date().toISOString(),
    scope: 'Actual AIR, PhysicsSystem and PhysicsSystem2D source plus real generated WASM in Node/JSDOM HEADLESS; not browser/GPU/CSP/full T09/components/package acceptance',
    sourceHashScope:
        'Named sources, hooks, native input manifests and artifacts; not all transitive engine/package files',
    cases: [],
};
let threeD, twoD;
try {
    threeD = qualifyThreeD(directory);
    twoD = qualifyTwoD();
    report.qualifications = { threeD, twoD };
    report.sourceHashesBefore = sourceHashes(threeD, twoD);
    for (const scenario of selected) {
        const caseOut = join(out, scenario);
        mkdirSync(caseOut);
        const argv = [
            '--import',
            pathToFileURL(join(root, 'tools/verify/box3d/coexist-real-wasm-preload.mjs')).href,
            join(root, 'node_modules/jest/bin/jest.js'),
            '--config',
            'tools/verify/box3d/coexist-real-wasm.jest.cjs',
            '--runInBand',
            '--no-cache',
        ];
        const child = spawnSync(process.execPath, argv, {
            cwd: root,
            encoding: 'utf8',
            timeout: 180000,
            maxBuffer: 16 * 1024 * 1024,
            env: { ...process.env, AIR_COEXIST_DIR: directory, AIR_COEXIST_OUT: caseOut, AIR_COEXIST_CASE: scenario },
        });
        writeFileSync(join(caseOut, 'jest.stdout.log'), child.stdout ?? '');
        writeFileSync(join(caseOut, 'jest.stderr.log'), child.stderr ?? '');
        const nativePath = join(caseOut, 'native-and-app.raw.json');
        const raw = existsSync(nativePath) ? JSON.parse(readFileSync(nativePath, 'utf8')) : null;
        const expected = scenario.endsWith('failure') ? 'EXPECTED_REJECTION' : 'PASS_LIMITED_NODE_COEXIST';
        const row = {
            scenario,
            expected,
            status: child.status === 0 && raw?.status === expected ? expected : 'FAIL',
            command: { executable: process.execPath, argv },
            child: { exitCode: child.status, signal: child.signal, error: child.error ? String(child.error) : null },
            rawSha256: raw ? hash(readFileSync(nativePath)) : null,
        };
        report.cases.push(row);
        writeFileSync(join(caseOut, 'receipt.json'), JSON.stringify(row, null, 2) + '\n');
        console.log(JSON.stringify({ scenario, status: row.status }));
        assert.deepEqual(sourceHashes(threeD, twoD), report.sourceHashesBefore, 'Source drift between cases');
    }
    assert.deepEqual(qualifyThreeD(directory), threeD);
    assert.deepEqual(qualifyTwoD(), twoD);
    report.status = report.cases.every((row) => row.status !== 'FAIL') ? 'PASS_LIMITED_NODE_COEXIST' : 'FAIL';
    if (report.status === 'FAIL') process.exitCode = 1;
} catch (error) {
    report.status = error.code === 'STALE_INPUT' ? 'STALE_INPUT' : 'FAIL';
    report.error = String(error.stack ?? error);
    process.exitCode = 1;
} finally {
    if (threeD && twoD) {
        report.sourceHashesAfter = sourceHashes(threeD, twoD);
        report.inputsUnchanged = JSON.stringify(report.sourceHashesBefore) === JSON.stringify(report.sourceHashesAfter);
        if (!report.inputsUnchanged) {
            report.status = 'STALE_INPUT';
            process.exitCode = 1;
        }
    }
    report.completedAt = new Date().toISOString();
    writeFileSync(join(out, 'receipt.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status: report.status, output: relative(root, out) }));
}
