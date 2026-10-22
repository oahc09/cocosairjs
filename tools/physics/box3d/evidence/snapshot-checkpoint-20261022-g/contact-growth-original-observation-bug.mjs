// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Independent real-WASM contact/sensor heap-growth check. Never changes build inputs or prior raw.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { root, sha256 } from './verify-sources.mjs';

const [dir, out] = process.argv.slice(2).map((path) => resolve(path));
assert.ok(!existsSync(out), 'Select a fresh evidence directory');
mkdirSync(out, { recursive: true });
const report = {
    schemaVersion: 1,
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    scope: 'Real contact/body/sensor copied snapshots across heap growth; no anchor-epoch or full C21/C22 acceptance',
    heapGrowth: [],
};
const persist = () => writeFileSync(resolve(out, 'contact-growth.raw.json'), JSON.stringify(report, null, 2) + '\n');
try {
    const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json')));
    for (const artifact of manifest.artifacts)
        assert.equal(sha256(readFileSync(resolve(dir, artifact.path))), artifact.sha256);
    report.inputs = {
        fixture: sha256(readFileSync(fileURLToPath(import.meta.url))),
        manifest: sha256(readFileSync(resolve(dir, 'manifest.json'))),
        artifacts: manifest.artifacts,
    };
    report.identity = {
        coreSha: manifest.coreSha,
        schemaSha256: manifest.schemaSha256,
        patchChainSha256: manifest.patchChainSha256,
    };
    const { default: factory } = await import(pathToFileURL(resolve(dir, 'box3d-st.mjs')).href);
    const { createBox3DBinding } = await import(pathToFileURL(resolve(dir, 'facade.mjs')).href);
    const module = await factory({ wasmBinary: readFileSync(resolve(dir, 'box3d-st.wasm')) });
    const a = createBox3DBinding(module, manifest);
    const world = a.createWorld([0, 0, 0]);
    const ground = a.createBody(world, { type: 0, position: [0, -0.5, 0] });
    a.createBox(ground, [10, 0.5, 10]);
    const body = a.createBody(world, { position: [0, 0.49, 0], linearVelocity: [0, -2, 0], enableSleep: false });
    const shape = a.createSphere(body, 0.5);
    a.configureShapeEvents(shape, { contact: true, hit: true });
    const sensorBody = a.createBody(world, { type: 0, position: [4, 3, 0] });
    a.createOffsetSphere(sensorBody, [0, 0, 0], 1, 1, true);
    const visitor = a.createBody(world, { position: [4, 3, 0], enableSleep: false });
    const visitorShape = a.createSphere(visitor, 0.25);
    a.configureShapeEvents(visitorShape, { sensor: true });
    a.step(world);
    const snapshot = a.readStepSnapshot(world);
    assert.equal(snapshot.contactBegins.length, 1);
    assert.equal(snapshot.sensorBegins.length, 1);
    assert.ok(snapshot.bodyMoves.length >= 2);
    assert.equal(snapshot.contactsOfOwnedBodies.length, 1);
    const contact = snapshot.contactsOfOwnedBodies[0];
    const serialized = JSON.stringify(snapshot);
    const countsBefore = a.worldCounts(world);
    const posesBefore = a.bodyTransforms(world, [body, visitor]);
    for (let i = 0; i < 2; ++i) {
        const previous = module.HEAPU8.buffer;
        const allocated = module._malloc(previous.byteLength + 65536);
        assert.ok(allocated);
        assert.notEqual(module.HEAPU8.buffer, previous);
        const nextBytes = module.HEAPU8.buffer.byteLength;
        module._free(allocated);
        assert.equal(JSON.stringify(snapshot), serialized);
        assert.equal(a.readStepSnapshot(world), snapshot);
        assert.equal(a.readContactSnapshot(contact.handle), contact);
        assert.deepEqual(a.bodyTransforms(world, [body, visitor]), posesBefore);
        assert.deepEqual(a.worldCounts(world), countsBefore);
        report.heapGrowth.push({
            beforeBytes: previous.byteLength,
            afterBytes: nextBytes,
            snapshotUnchanged: true,
            nativeContactStillValid: true,
        });
        persist();
    }
    report.copiedSnapshot = snapshot;
    a.step(world);
    assert.throws(() => a.readContactSnapshot(contact.handle), { code: 'AIR_E_BOX3D_STALE_SNAPSHOT' });
    assert.equal(JSON.stringify(snapshot), serialized);
    a.destroyBody(body);
    a.destroyBody(visitor);
    a.step(world);
    const ended = a.readStepSnapshot(world);
    assert.equal(ended.contactEnds.length, 1);
    assert.equal(ended.sensorEnds.length, 1);
    assert.equal(JSON.stringify(snapshot), serialized);
    report.destructionSnapshot = ended;
    a.destroyWorld(world);
    assert.equal(JSON.stringify(snapshot), serialized);
    assert.equal(a.liveBytes(), 0n);
    a.dispose();
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.error = { message: error.message, stack: error.stack };
    process.exitCode = 1;
} finally {
    report.completedAt = new Date().toISOString();
    persist();
    console.log(JSON.stringify({ status: report.status, output: relative(root, out), error: report.error?.message }));
}
