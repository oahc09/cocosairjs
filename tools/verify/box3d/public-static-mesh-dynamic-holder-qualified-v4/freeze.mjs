/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Explicitly frozen ready-runtime identity is required. Never infer that a present bundle is ready.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { root, here, sha } from './inputs.mjs';
const [runtimeArgument, buildArgument, jsSha256, sourceCommit, outputArgument, identityLabel] = process.argv.slice(2);
assert(runtimeArgument && outputArgument && identityLabel, 'Pass runtime build JS_SHA source_commit new_lock label');
assert(/^\d+$/.test(buildArgument));
assert(/^[a-f0-9]{64}$/.test(jsSha256));
assert(/^[a-f0-9]{40}$/.test(sourceCommit));
const runtime = resolve(runtimeArgument),
    output = resolve(outputArgument);
assert(!existsSync(output), 'A frozen input lock may never be overwritten');
assert.equal(sha(readFileSync(join(runtime, 'cocosair.module.js'))), jsSha256);
const entry = (base, path) => {
    const bytes = readFileSync(join(base, path));
    return { path, bytes: bytes.length, sha256: sha(bytes) };
};
function walk(base, path) {
    return readdirSync(join(base, path), { withFileTypes: true }).flatMap((item) => {
        const name = join(path, item.name);
        return item.isDirectory() ? walk(base, name) : item.isFile() ? [entry(base, name)] : [];
    });
}
const lock = {
    schema: 'box3d-public-static-mesh-input-lock-v1',
    scope: 'Node HEADLESS production ESM static MeshCollider public API subset; Full Gates and C16–C19 NOT_RUN',
    identityLabel,
    generatedAt: new Date().toISOString(),
    declaredRuntimeProducerCommit: sourceCommit,
    checkoutAtFreeze: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    sourceSnapshotRole:
        'Current checkout verification context. Historical runtime controls retain separate producer identity; these source hashes do not assert that historical binary was built from current source.',
    runtimeBuildNumber: Number(buildArgument),
    runtime: [
        'cocosair.module.js',
        'cocosair.module.js.map',
        'cocosair.module.d.ts',
        'physics/box3d/st/manifest.json',
        'physics/box3d/st/box3d-st.mjs',
        'physics/box3d/st/box3d-st.wasm',
    ]
        .concat(existsSync(join(runtime, 'package.json')) ? ['package.json'] : [])
        .map((name) => entry(runtime, name)),
    runtimeAbsentPaths: existsSync(join(runtime, 'package.json')) ? [] : ['package.json'],
    source: ['src', 'tools/physics/box3d/native', 'tools/physics/box3d/patches']
        .flatMap((name) => walk(root, name))
        .concat(
            [
                'package.json',
                'package-lock.json',
                'tools/physics/box3d/versions.lock.json',
                'tools/physics/box3d/abi-schema.json',
                'tools/physics/box3d/exports.json',
            ].map((name) => entry(root, name)),
        ),
    fixture: readdirSync(here, { withFileTypes: true })
        .filter((item) => item.isFile() && /\.(mjs|cjs|md)$/.test(item.name))
        .map((item) => entry(root, relative(root, join(here, item.name)))),
};
writeFileSync(output, JSON.stringify(lock, null, 2) + '\n', { flag: 'wx' });
console.log(
    JSON.stringify({
        output,
        sha256: sha(readFileSync(output)),
        runtimeBuildNumber: lock.runtimeBuildNumber,
        sourceCount: lock.source.length,
        fixtureCount: lock.fixture.length,
    }),
);
