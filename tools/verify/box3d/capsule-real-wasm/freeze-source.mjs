// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Explicit one-time source freeze, not a test or evidence-result producer. Refuses to overwrite a lock.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import inputs from './inputs.cjs';
const here = dirname(fileURLToPath(import.meta.url));
const { root, hash } = inputs;
const output = join(here, 'source-lock.json');
assert(
    !existsSync(output),
    'Source lock already exists; preserve the old attempt and prepare a new frozen fixture directory',
);
const sources = [];
const sourceKeys = new Set();
function add(scope, base, path) {
    const key = `${scope}:${path}`;
    if (sourceKeys.has(key)) return;
    sourceKeys.add(key);
    sources.push({ scope, path, sha256: hash(readFileSync(join(base, path))) });
}
function walk(scope, base, path) {
    for (const entry of readdirSync(join(base, path), { withFileTypes: true })) {
        const name = join(path, entry.name);
        if (entry.isDirectory()) walk(scope, base, name);
        else if (entry.isFile()) add(scope, base, name);
    }
}
walk('product', root, 'src');
walk('product', root, 'tools/physics/box3d/native');
for (const name of [
    'babel.config.js',
    'jest.config.js',
    'package-lock.json',
    'package.json',
    'tsconfig.json',
    'test/setup-dom.js',
    'test/setup-engine.js',
    'test/stubs/internal-constants.ts',
    'test/stubs/pal-wasm.ts',
    'test/tsconfig.jest.json',
    'tools/physics/box3d/CMakeLists.txt',
    'tools/physics/box3d/build.mjs',
    'tools/physics/box3d/abi-schema.json',
    'tools/physics/box3d/versions.lock.json',
    'tools/verify/box3d/owner-dynamic-command-real-wasm-inputs.cjs',
    // Explicit complete asset-gate code closure, including dynamically imported source verification.
    'tools/build/box3d-assets.cjs',
    'tools/build/box3d-command-qualification.cjs',
    'tools/build/box3d-command-expectations.json',
    'tools/build/box3d-query-qualification.cjs',
    'tools/build/box3d-capsule-qualification.cjs',
    'tools/physics/box3d/audit-artifacts.mjs',
    'vendor/box3d/upstream-trees.json',
    ...JSON.parse(readFileSync(join(root, 'tools/build/box3d-command-expectations.json'))).gate.inputs,
    ...JSON.parse(readFileSync(join(root, 'vendor/box3d/source-manifest.json'))).files.map((entry) => entry.path),
])
    add('product', root, name);
for (const entry of readdirSync(here, { withFileTypes: true }))
    if (entry.isFile() && entry.name !== 'source-lock.json')
        add('fixture', here, relative(here, join(here, entry.name)));
sources.sort((a, b) => `${a.scope}:${a.path}`.localeCompare(`${b.scope}:${b.path}`));
const lock = {
    status: 'FROZEN_CAPSULE_SOURCE_ONLY_NOT_TEST_RESULT',
    generatedAt: new Date().toISOString(),
    head: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim(),
    sources,
};
writeFileSync(output, JSON.stringify(lock, null, 2) + '\n', { flag: 'wx' });
console.log(
    JSON.stringify({ output, entries: sources.length, sha256: hash(readFileSync(output)), status: lock.status }),
);
