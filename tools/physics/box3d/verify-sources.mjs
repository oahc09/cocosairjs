// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPatchPlan } from './patch-intake.mjs';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function verifySources() {
    const manifest = JSON.parse(readFileSync(resolve(root, 'vendor/box3d/source-manifest.json'), 'utf8'));
    const expected = new Set();
    for (const entry of manifest.files) {
        if (!entry.path.startsWith('vendor/box3d/') || entry.path.includes('..'))
            throw new Error('Unsafe manifest path');
        const data = readFileSync(resolve(root, entry.path));
        const blob = createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
        if (data.length !== entry.bytes || sha256(data) !== entry.sha256 || blob !== entry.gitBlobSha1) {
            throw new Error(`Upstream source drift: ${entry.path}`);
        }
        expected.add(entry.path);
    }
    function walk(directory) {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const path = resolve(directory, entry.name);
            if (entry.isDirectory()) walk(path);
            else if (!expected.has(relative(root, path).replaceAll('\\', '/')))
                throw new Error(`Unmanifested upstream file: ${path}`);
        }
    }
    for (const name of ['core', 'binding-base', 'old-core-review']) walk(resolve(root, 'vendor/box3d', name));
    const lock = JSON.parse(readFileSync(resolve(root, 'tools/physics/box3d/versions.lock.json'), 'utf8'));
    const schema = readFileSync(resolve(root, 'tools/physics/box3d/abi-schema.json'));
    if (lock.apiSchemaSha256 !== sha256(schema)) throw new Error('Schema bytes differ from version lock');
    const core = JSON.parse(readFileSync(resolve(root, 'vendor/box3d/upstream-trees.json'), 'utf8')).core;
    const actual = manifest.files.filter((e) => e.path.startsWith('vendor/box3d/core/'));
    const required = core.tree.filter(
        (e) =>
            e.type === 'blob' &&
            (/^(src|include)\//.test(e.path) || ['LICENSE', 'CMakeLists.txt', 'README.md'].includes(e.path)),
    );
    if (
        required.length !== actual.length ||
        required.some((e) => !actual.some((a) => a.upstreamPath === e.path && a.gitBlobSha1 === e.sha))
    ) {
        throw new Error('Fixed-core source closure is incomplete');
    }
    const facade = readFileSync(resolve(root, 'src/air/physics/box3d/binding/facade.mjs'), 'utf8');
    if (!facade.includes(`const SCHEMA_SHA256 = '${sha256(schema)}';`)) throw new Error('Facade schema identity stale');
    const patch = readPatchPlan();
    return {
        patchChainSha256: patch.patchChainSha256,
        patchLockSha256: patch.patchLockSha256,
        verifiedFiles: manifest.files.length,
        fixedCoreFiles: actual.length,
        schemaSha256: sha256(schema),
    };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    console.log(JSON.stringify(verifySources(), null, 2));
}
