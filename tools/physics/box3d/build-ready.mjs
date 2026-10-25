// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Native build -> official audit -> existing full consumer gate -> readiness receipt.
// This does not claim public, browser, or formal acceptance.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { root, sha256 } from './verify-sources.mjs';

const args = process.argv.slice(2);
const existing = args.includes('--qualify-existing');
const index = args.indexOf('--out');
assert.ok(index >= 0 && args[index + 1], 'An explicit --out directory is required');
assert.ok(!args.includes('--native') && !args.includes('--sanitize'), 'This entry qualifies ST WASM only');
const directory = resolve(root, args[index + 1]);
const readyPath = resolve(directory, 'consumer-ready.json');
assert.ok(!existsSync(readyPath), 'Preserve earlier readiness evidence; do not overwrite');
function run(script, childArgs) {
    const result = spawnSync(process.execPath, [script, ...childArgs], { cwd: root, stdio: 'inherit' });
    if (result.error || result.status !== 0)
        throw new Error(`${script} failed: ${result.error?.message ?? result.signal ?? result.status}`);
}
if (!existing) run('tools/physics/box3d/build.mjs', args);
if (!existsSync(resolve(directory, 'artifact-audit.raw.json')))
    run('tools/physics/box3d/audit-artifacts.mjs', [directory]);
const verified = await createRequire(import.meta.url)('../../build/box3d-assets.cjs').verifySTBuild(directory);
const files = ['build-receipt.json', 'artifact-audit.raw.json', 'manifest.json'].map((path) => {
    const bytes = readFileSync(resolve(directory, path));
    return { path, bytes: bytes.length, sha256: sha256(bytes) };
});
const receipt = {
    schemaVersion: 1,
    status: 'READY_FOR_LIMITED_CONSUMER_VERIFICATION',
    checkedAt: new Date().toISOString(),
    existingBuild: existing,
    descriptor: verified.descriptor,
    files,
    qualificationGateSources: verified.qualificationGateSources,
    acceptancePassed: false,
};
writeFileSync(readyPath, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: receipt.status, directory, receipt: readyPath }));
