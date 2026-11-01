// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import inputs from './inputs.cjs';
const { root, sourceHashes, verifyArtifact, captureInputs } = inputs;
const here = dirname(fileURLToPath(import.meta.url));
const directory = resolve(process.argv[2]),
    out = resolve(process.argv[3]);
const variant = process.argv[4] ?? 'Release';
assert(['Release', 'Debug'].includes(variant));
process.env.HULL70_QUALIFICATION = 'full';
process.env.HULL70_VARIANT = variant;
assert(!existsSync(out), 'Never overwrite an earlier attempt');
mkdirSync(out, { recursive: true });
const report = {
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    scope: 'Actual Cocos Mesh buffers/MeshCollider, owned Game clock, real receipt-bound WASM; N1-N6 physics separate from N7 fault injection. Node/JSDOM HEADLESS only.',
    variants: { Release: 'NOT_RUN', Debug: 'NOT_RUN' },
    formal2128And9Gates: 'NOT_RUN',
    cases: [],
};
try {
    report.sourceHashesBefore = sourceHashes();
    report.declaredSourceCommit = JSON.parse(readFileSync(join(here, 'source-lock.json'))).declaredSourceCommit;
    report.artifact = await verifyArtifact(directory);
    report.inputClosure = captureInputs(out, directory);
    for (const name of ['physics', 'committed-readback', 'unknown-after-native', 'destroy-committed-readback']) {
        const caseOut = join(out, name);
        mkdirSync(caseOut);
        const argv = [
            '--import',
            pathToFileURL(join(here, 'preload.mjs')).href,
            join(root, 'node_modules/jest/bin/jest.js'),
            '--config',
            join(here, 'jest.cjs'),
            '--runInBand',
            '--no-cache',
        ];
        const child = spawnSync(process.execPath, argv, {
            cwd: root,
            encoding: 'utf8',
            timeout: 180000,
            maxBuffer: 16 * 1024 * 1024,
            env: { ...process.env, HULL70_ARTIFACT: directory, HULL70_OUT: caseOut, HULL70_CASE: name },
        });
        writeFileSync(join(caseOut, 'jest.stdout.txt'), child.stdout ?? '');
        writeFileSync(join(caseOut, 'jest.stderr.txt'), child.stderr ?? '');
        const row = {
            name,
            category: name === 'physics' ? 'REAL_PHYSICS' : 'REAL_NATIVE_PLUS_BOUNDARY_FAULT',
            command: { executable: process.execPath, argv },
            exitCode: child.status,
            signal: child.signal,
            error: child.error ? String(child.error) : null,
        };
        report.cases.push(row);
        assert.equal(child.status, 0, `${name} failed; retained raw attempt`);
        const raw = JSON.parse(readFileSync(join(caseOut, 'native-and-cocos.raw.json')));
        assert.equal(
            raw.status,
            name === 'physics' ? 'PASS_LIMITED_COCOS_HULL_PHYSICS' : 'PASS_LIMITED_COCOS_HULL_FAULT_BOUNDARY',
        );
        assert.equal(raw.fallbackCleanup, undefined, 'Actual app close must own cleanup');
        row.status = raw.status;
        assert.deepEqual(sourceHashes(), report.sourceHashesBefore);
    }
    assert.deepEqual(await verifyArtifact(directory), report.artifact);
    report.variants[variant] = 'PASS_LIMITED_COCOS_HULL';
    report.status = 'PASS_LIMITED_COCOS_HULL';
} catch (error) {
    report.status = 'FAIL';
    report.variants[variant] = 'FAIL';
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
    console.log(
        JSON.stringify({ status: report.status, variant, out, cases: report.cases.length, error: report.error }),
    );
}
