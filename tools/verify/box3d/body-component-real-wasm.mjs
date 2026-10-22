// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Writes only a NEW evidence directory and runs official Node/Jest. No runtime build or socket.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import inputs from './body-component-real-wasm-inputs.cjs';
const { root, sourceHashes, qualify, hash } = inputs;
assert(
    process.argv.length === 4 ||
        (process.argv.length === 5 &&
            [
                'lifecycle',
                'material-listener',
                'body-pure',
                'body-natural-rejection',
                'invalid-initialization',
                'body-committed',
                'body-unknown',
                'body-lost-token',
                'shape-lost-token',
                'filter-committed',
            ].includes(process.argv[4])),
    'Usage: node body-component-real-wasm.mjs <current-artifact-directory> <new-evidence-directory> [case]',
);
const directory = resolve(process.argv[2]),
    out = resolve(process.argv[3]);
assert(!existsSync(out), 'Never overwrite a prior attempt');
mkdirSync(out, { recursive: true });
const report = {
    schema: 'box3d-air-body-component-real-wasm-v1',
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    scope: 'Actual AIR, Cocos components/Node/Scene and PhysicsSystem source with current real WASM in official Node/Jest/JSDOM HEADLESS; not browser/GPU/full T10/T11/C36 or B3U01',
    node: process.version,
    sourceHashScope:
        'Named direct sources, hooks, test configuration and package lock; not every transitive engine file',
    artifactDirectory: relative(root, directory),
    expected: process.argv[4] ?? 'lifecycle',
    hooks: [
        'Local-file transport for exactly manifest/mjs/wasm; no network',
        'Real production createBinding with transparent method observation; fault cases explicitly inject one stage failure, never fake successful native state',
        'JSDOM environment injects only the real loader, observed native capabilities and recorder',
        'Adapter registration and observed native world token remain fixture-internal',
    ],
};
try {
    report.sourceHashesBefore = sourceHashes();
    report.inspectedBuildReceiptSha256 = hash(readFileSync(join(directory, 'build-receipt.json')));
    report.inspectedManifestSha256 = hash(readFileSync(join(directory, 'manifest.json')));
    report.artifact = qualify(directory);
    report.sourceHashesBefore = sourceHashes(report.artifact.buildInputHashes.map((entry) => entry.path));
    for (const name of Object.keys(report.sourceHashesBefore)) {
        const file = join(out, 'inputs', name);
        mkdirSync(resolve(file, '..'), { recursive: true });
        writeFileSync(file, readFileSync(join(root, name)));
    }
    const argv = [
        '--import',
        pathToFileURL(join(root, 'tools/verify/box3d/body-component-real-wasm-preload.mjs')).href,
        join(root, 'node_modules/jest/bin/jest.js'),
        '--config',
        'tools/verify/box3d/body-component-real-wasm.jest.cjs',
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
            AIR_BOX3D_REAL_DIR: directory,
            AIR_BOX3D_REAL_OUT: out,
            AIR_BOX3D_REAL_EXPECT: report.expected,
        },
    });
    writeFileSync(join(out, 'jest.stdout.log'), child.stdout ?? '');
    writeFileSync(join(out, 'jest.stderr.log'), child.stderr ?? '');
    report.child = { exitCode: child.status, signal: child.signal, error: child.error ? String(child.error) : null };
    const nativePath = join(out, 'native-and-app.raw.json');
    report.nativeReportSha256 = existsSync(nativePath) ? hash(readFileSync(nativePath)) : null;
    const native = existsSync(nativePath) ? JSON.parse(readFileSync(nativePath, 'utf8')) : null;
    assert.equal(child.status, 0, 'Real-WASM source fixture failed; retain raw logs');
    assert(
        native && ['EXPECTED_REJECTION', 'PASS_LIMITED_NODE_COMPONENTS'].includes(native.status),
        'Missing completed fixture result',
    );
    assert.equal(native.status, 'PASS_LIMITED_NODE_COMPONENTS');
    assert.deepEqual(qualify(directory), report.artifact, 'Native build inputs/artifacts changed during collection');
    report.status = native.status;
} catch (error) {
    report.status = error.code === 'STALE_INPUT' ? 'STALE_INPUT' : 'FAIL';
    report.error = { message: String(error.stack ?? error), paths: error.paths ?? [] };
    process.exitCode = 1;
} finally {
    report.sourceHashesAfter = sourceHashes(report.artifact?.buildInputHashes.map((entry) => entry.path) ?? []);
    report.inputsUnchanged = JSON.stringify(report.sourceHashesBefore) === JSON.stringify(report.sourceHashesAfter);
    if (!report.inputsUnchanged) {
        report.status = 'STALE_INPUT';
        process.exitCode = 1;
    }
    report.completedAt = new Date().toISOString();
    writeFileSync(join(out, 'receipt.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status: report.status, output: relative(root, out), error: report.error ?? null }));
}
