// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Source-only staging/verification; no compiler or physics executable is invoked.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, lstatSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyProfile, hash } from './profile.mjs';

export async function stageIdentity(mode, sourceRoot, destination) {
    assert.ok(['--stage', '--verify', '--stage-control', '--verify-control'].includes(mode));
    assert.ok(sourceRoot && destination, 'sourceRoot and a fresh staging destination are required');
    const profile = await applyProfile(sourceRoot, mode.endsWith('-control'));
    const target = resolve(destination);
    const files = [...profile.files]
        .map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: hash(bytes) }))
        .sort((a, b) => a.path.localeCompare(b.path));
    const receipt = {
        profile: 'air-box3d-identity-source-rebuild-v1',
        productionCompatible: false,
        trimEnabled: false,
        control: profile.control,
        coreCommit: profile.coreCommit,
        patchChainSha256: profile.patchChainSha256,
        patchLockSha256: profile.patchLockSha256,
        files,
    };
    if (mode.startsWith('--stage')) {
        assert.ok(!existsSync(target) && !existsSync(target + '.receipt.json'), 'Preserve earlier staging');
        for (const [path, bytes] of profile.files) {
            mkdirSync(dirname(resolve(target, path)), { recursive: true });
            writeFileSync(resolve(target, path), bytes, { flag: 'wx' });
        }
        writeFileSync(target + '.receipt.json', JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
    }
    assert.ok(lstatSync(target + '.receipt.json').isFile());
    assert.deepEqual(JSON.parse(readFileSync(target + '.receipt.json')), receipt);
    const actual = [];
    function walk(path) {
        assert.ok(lstatSync(path).isDirectory());
        for (const entry of readdirSync(path, { withFileTypes: true })) {
            const file = resolve(path, entry.name);
            if (entry.isDirectory()) walk(file);
            else {
                assert.ok(lstatSync(file).isFile(), 'Reject links or special files');
                const bytes = readFileSync(file);
                actual.push({ path: relative(target, file), bytes: bytes.length, sha256: hash(bytes) });
            }
        }
    }
    walk(target);
    assert.deepEqual(
        actual.sort((a, b) => a.path.localeCompare(b.path)),
        files,
    );
    return { status: 'PASS_SOURCE_ONLY', ...receipt, files: files.length };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    assert.equal(process.argv.length, 5, 'Usage: stage.mjs MODE SOURCE_ROOT DESTINATION');
    console.log(JSON.stringify(await stageIdentity(...process.argv.slice(2))));
}
