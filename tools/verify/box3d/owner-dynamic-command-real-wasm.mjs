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
// Writes only a NEW evidence directory and runs official Node/Jest. No runtime build or socket.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import inputs from './owner-dynamic-command-real-wasm-inputs.cjs';
const { root, sourceHashes, qualify, hash } = inputs;
assert(
    process.argv.length === 5 &&
        [
            'two-tick-dynamic',
            'adapter-mixed-order',
            'disable-retains-pending',
            'type-retains-pending',
            'pause-explicit-resume',
            'caught-rejection-abort',
            'thenable-abort',
            'falsy-throw-abort',
            'cross-generation-adapter',
        ].includes(process.argv[4]),
    'Usage: node owner-dynamic-command-real-wasm.mjs <current-artifact-directory> <new-evidence-directory> <case>',
);
const directory = resolve(process.argv[2]),
    out = resolve(process.argv[3]);
assert(!existsSync(out), 'Never overwrite a prior attempt');
mkdirSync(out, { recursive: true });
const report = {
    schema: 'box3d-air-owner-dynamic-command-real-wasm-v1',
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    scope: 'Explicit test-adapter internal candidate using actual AIR/PhysicsSystem/World, real RigidBody and BoxCollider, and existing unchanged N4 WASM in Node/Jest/JSDOM HEADLESS. Finite dynamic command, adapter order, disabled/type-retained pending, pause/explicit resume, synchronous collection-abort, cross-generation fixture-admission and teardown cases only; each fresh process runs the named case. Not a public feature installation. No browser, rebuild, SDK, target/teleport, torque/clear coverage, broad transaction, full Gate or formal-cell claim.',
    formalCells: { total: 2128, status: 'NOT_RUN' },
    node: process.version,
    sourceHashScope:
        'Named direct sources, hooks, test configuration and package lock; not every transitive engine file',
    artifactDirectory: relative(root, directory),
    expected: process.argv[4] ?? 'baseline',
    hooks: [
        'Local-file transport for exact current manifest/mjs/wasm only; no network',
        'Real production createBinding with transparent method observation, no fabricated native results or injected native failure',
        'JSDOM imports actual AIR source and invokes original PhysicsSystem.step without replacing World or command-owner methods',
    ],
};
try {
    report.sourceHashesBefore = sourceHashes();
    report.inspectedBuildReceiptSha256 = hash(readFileSync(join(directory, 'build-receipt.json')));
    report.inspectedManifestSha256 = hash(readFileSync(join(directory, 'manifest.json')));
    report.artifact = qualify(directory);
    mkdirSync(join(out, 'native-artifact-inputs'));
    for (const name of ['build-receipt.json', 'manifest.json'])
        writeFileSync(join(out, 'native-artifact-inputs', name), readFileSync(join(directory, name)));
    report.sourceHashesBefore = sourceHashes(report.artifact.buildInputHashes.map((entry) => entry.path));
    for (const name of Object.keys(report.sourceHashesBefore)) {
        const file = join(out, 'inputs', name);
        mkdirSync(resolve(file, '..'), { recursive: true });
        writeFileSync(file, readFileSync(join(root, name)));
    }
    const argv = [
        '--import',
        pathToFileURL(join(root, 'tools/verify/box3d/owner-dynamic-command-real-wasm-preload.mjs')).href,
        join(root, 'node_modules/jest/bin/jest.js'),
        '--config',
        'tools/verify/box3d/owner-dynamic-command-real-wasm.jest.cjs',
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
            AIR_BOX3D_DYNAMIC_COMMAND_DIR: directory,
            AIR_BOX3D_DYNAMIC_COMMAND_OUT: out,
            AIR_BOX3D_DYNAMIC_COMMAND_EXPECT: report.expected,
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
    assert(
        native && ['PASS_LIMITED_DYNAMIC_COMMAND', 'BLOCKED_CROSS_GENERATION_FIXTURE'].includes(native.status),
        'Missing completed fixture result',
    );
    if (native.status === 'BLOCKED_CROSS_GENERATION_FIXTURE') {
        assert.equal(report.expected, 'cross-generation-adapter');
        report.blocker = native.blocker;
        process.exitCode = 2;
    }
    assert.deepEqual(qualify(directory), report.artifact, 'Native build inputs/artifacts changed during collection');
    report.status = native.status;
} catch (error) {
    report.status = ['STALE_INPUT', 'PENDING_FIXTURE_SEAM'].includes(error.code) ? error.code : 'FAIL';
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
