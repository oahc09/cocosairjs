// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Requires the real newly built fixed-core WASM. No mocks or historical artifact fallback.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256 } from './verify-sources.mjs';
import { inspectWasmMemory } from './verify-wasm.mjs';

const dir = resolve(process.argv[2]);
const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8'));
for (const entry of manifest.artifacts) {
    const data = readFileSync(resolve(dir, entry.path));
    assert.equal(data.length, entry.bytes);
    assert.equal(sha256(data), entry.sha256);
}
const wasm = readFileSync(resolve(dir, 'box3d-st.wasm'));
const memoryDeclaration = inspectWasmMemory(wasm);
const { default: createModule } = await import(pathToFileURL(resolve(dir, 'box3d-st.mjs')).href);
const { createBox3DBinding } = await import(pathToFileURL(resolve(dir, 'facade.mjs')).href);
const module = await createModule({ wasmBinary: wasm });
assert.throws(() => createBox3DBinding(module, { ...manifest, schemaSha256: '0'.repeat(64) }), /identity mismatch/);
const identityRejections = [];
for (const [name, change] of [
    ['missing-patch-chain', { patchChainSha256: undefined }],
    ['forged-patch-chain', { patchChainSha256: '0'.repeat(64) }],
    [
        'stale-candidate-patch-sha-not-chain',
        { patchChainSha256: 'e5c4e5f2ae7f015cf62dfc2de5a36af73cc15d9b0ca0118fc0259c7d1f0b1403' },
    ],
    ['wrong-binding-reference', { bindingBaseSha: '0'.repeat(40) }],
]) {
    assert.throws(() => createBox3DBinding(module, { ...manifest, ...change }), /identity mismatch/);
    identityRejections.push(name);
}
const binding = createBox3DBinding(module, manifest);
const before = binding.liveBytes();
const world = binding.createWorld();
const body = binding.createBody(world, { position: [0, 20, 0], enableSleep: false });
binding.createSphere(body, 0.5, 12 / Math.PI);
binding.applyCenterImpulse(body, [2, 0, 0]);
const first = binding.bodySnapshot(body);
assert.ok(Math.abs(first[7] - 1) <= 1e-4);
assert.throws(() => binding.setLinearVelocity(body, [NaN, 0, 0]));
assert.throws(() => binding.step(world, 1 / 60, 0));
const ticks = [];
for (let tick = 1; tick <= 60; ++tick) {
    binding.step(world);
    const s = binding.bodySnapshot(body);
    ticks.push([tick, s[0], s[1], s[8]]);
}
const last = binding.bodySnapshot(body);
assert.ok(Math.abs(last[1] - 15) <= 0.05);
assert.ok(Math.abs(last[8] + 10) <= 0.01);
assert.equal(first[1], 20, 'Snapshots must not alias overwritten scratch');
const oldBuffer = module.HEAPU8.buffer;
const large = module._malloc(oldBuffer.byteLength + 65536);
assert.ok(large);
assert.notEqual(module.HEAPU8.buffer, oldBuffer, 'Fixture must force real memory growth');
assert.deepEqual(binding.bodySnapshot(body), last);
module._free(large);
const ray = binding.rayClosest(world, [last[0], last[1] + 2, last[2]], [0, -4, 0]);
assert.equal(ray.data[0], 1);
assert.ok(Math.abs(ray.data[7] - 0.375) <= 1e-4);
binding.destroyBody(body);
assert.throws(() => binding.bodySnapshot(body), /disposed/);
binding.destroyWorld(world);
assert.throws(() => binding.step(world), /disposed/);
assert.equal(binding.liveBytes(), before);
binding.dispose();
binding.dispose();
assert.throws(() => binding.createWorld(), /disposed/);
const report = {
    schemaVersion: 1,
    status: 'PASS',
    scope: 'Node real-WASM foundation only; browser and full G1 remain NOT_RUN',
    identity: {
        coreSha: manifest.coreSha,
        schemaSha256: manifest.schemaSha256,
        patchChainSha256: manifest.patchChainSha256,
    },
    identityRejections,
    memoryDeclaration,
    memoryGrowth: true,
    freefallTicks: ticks,
    liveNativeBytesBefore: String(before),
    staleHandlesRejected: true,
    snapshotsCopied: true,
};
writeFileSync(resolve(dir, 'wasm-contract.raw.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
