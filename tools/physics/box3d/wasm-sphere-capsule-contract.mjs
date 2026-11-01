/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Actual product WASM and facade. This is not a public Cocos/browser or complete T15 claim.
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sha256 } from './verify-sources.mjs';
import { CASES, CHECKS, TOLERANCE, rotate, transform, verifySphereCapsuleSample } from './sphere-capsule/oracle.mjs';

const dir = resolve(process.argv[2]);
const raw = resolve(dir, 'wasm-sphere-capsule-contract.raw.json');
const samplesPath = resolve(dir, 'sphere-capsule-samples.raw.jsonl');
assert.ok(!existsSync(raw) && !existsSync(samplesPath), 'Never overwrite an attempt');
writeFileSync(samplesPath, '', { flag: 'wx' });
const report = {
    profile: 'air-box3d-sphere-capsule-native-generation-v1',
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    fixtureSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    oracleSha256: sha256(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'sphere-capsule/oracle.mjs'))),
    tolerance: TOLERANCE,
    scope: '18 nondegenerate finite sphere/capsule generation cases; native WASM, not Cocos events or full T15/C21',
    checks: [],
    observations: {},
    cleanupErrors: [],
};
const save = () => writeFileSync(raw, JSON.stringify(report, null, 2) + '\n');
const pass = (name) => {
    report.checks.push({ name, result: 'PASS' });
    save();
};
const key = (id) => `${id.low}:${id.high}`;
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const scale = (a, n) => a.map((v) => v * n);
const axisAngle = (axis, angle) => [...scale(axis, Math.sin(angle / 2)), Math.cos(angle / 2)];
const deepFrozen = (value) => {
    if (value === null || typeof value !== 'object') return;
    assert.ok(Object.isFrozen(value));
    for (const child of Object.values(value)) deepFrozen(child);
};
let api,
    module,
    samples = 0,
    validatedSamples = 0;
const worlds = new Set();
function globalBridge() {
    const p = module._malloc(24);
    assert.ok(p);
    try {
        assert.equal(module._air_b3_bridge_memory(0, p), 0, 'Actual native GLOBAL linked-list query');
        return Array.from(module.HEAPU32.slice(p >>> 2, (p >>> 2) + 6));
    } finally {
        module._free(p);
    }
}
function noPartialGeometry(world, foreign, contact) {
    const p = module._malloc(128);
    assert.ok(p);
    try {
        module.HEAPU32.set(contact.contactId, p >>> 2);
        module.HEAPU32.fill(0x91ab32cd, (p + 16) >>> 2, (p + 116) >>> 2);
        const before = Array.from(module.HEAPU32.slice((p + 16) >>> 2, (p + 116) >>> 2));
        assert.equal(module._air_b3_contact_geometry(foreign.id, p, p + 16, 25), 1);
        assert.deepEqual(Array.from(module.HEAPU32.slice((p + 16) >>> 2, (p + 116) >>> 2)), before);
        assert.equal(module._air_b3_contact_geometry(world.id, p, p + 16, 24), 4);
        assert.deepEqual(Array.from(module.HEAPU32.slice((p + 16) >>> 2, (p + 116) >>> 2)), before);
        module.HEAPU32.fill(0, p >>> 2, (p >>> 2) + 3);
        assert.equal(module._air_b3_contact_geometry(world.id, p, p + 16, 25), 1);
        assert.deepEqual(Array.from(module.HEAPU32.slice((p + 16) >>> 2, (p + 116) >>> 2)), before);
    } finally {
        module._free(p);
    }
}

save();
try {
    const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json')));
    report.identity = manifest;
    for (const entry of manifest.artifacts) assert.equal(sha256(readFileSync(resolve(dir, entry.path))), entry.sha256);
    const { default: factory } = await import(pathToFileURL(resolve(dir, 'box3d-st.mjs')));
    const { createBox3DBinding } = await import(pathToFileURL(resolve(dir, 'facade.mjs')));
    module = await factory({ wasmBinary: readFileSync(resolve(dir, 'box3d-st.wasm')) });
    api = createBox3DBinding(module, manifest);
    const baseline = api.liveBytes(),
        bridgeBaseline = globalBridge();
    assert.deepEqual(bridgeBaseline, [0, 0, 0, 0, 0, 0]);
    for (const fixture of CASES) {
        report.lastCase = fixture;
        const world = api.createWorld([0, 0, 0]);
        worlds.add(world);
        const capsule = {
            kind: 'capsule',
            center: [0.13, -0.21, 0.17].map(Math.fround),
            radius: Math.fround(0.4),
            halfSegment: 0.75,
            direction: fixture.axis,
        };
        const sphere = { kind: 'sphere', center: [-0.08, 0.11, 0.06].map(Math.fround), radius: 0.25 };
        const cq = axisAngle([0, 0, 1], 0.37),
            sq = axisAngle([1, 0, 0], -0.29);
        const cp = [0.3, -0.2, 0.4, ...cq, 0, 0, 0];
        const axis = [0, 0, 0];
        axis[fixture.axis] = 1;
        const perpendicular = [0, 0, 0];
        perpendicular[(fixture.axis + 1) % 3] = 1;
        const location =
            fixture.region === 'side' ? 0.2 : (fixture.region === 'cap-minus' ? -1 : 1) * capsule.halfSegment;
        const outward =
            fixture.region === 'side' ? perpendicular : scale(axis, fixture.region === 'cap-minus' ? -1 : 1);
        const localCenter = add(add(capsule.center, scale(axis, location)), scale(outward, 0.62));
        const sphereCenter = transform(cp, localCenter);
        const sp = [...sub(sphereCenter, rotate([0, 0, 0, ...sq, 0, 0, 0], sphere.center)), ...sq];
        let capBody, sphereBody, capShape, sphereShape;
        const createCap = () => {
            capBody = api.createBody(world, { type: 0, position: cp.slice(0, 3), rotation: cq });
            capShape = api.createOffsetCapsule(
                capBody,
                capsule.center,
                capsule.radius,
                capsule.halfSegment,
                capsule.direction,
            );
        };
        const createSphere = () => {
            sphereBody = api.createBody(world, { type: 2, position: sp.slice(0, 3), rotation: sq, enableSleep: false });
            sphereShape = api.createOffsetSphere(sphereBody, sphere.center, sphere.radius);
        };
        for (const create of fixture.creationOrder ? [createSphere, createCap] : [createCap, createSphere]) create();
        const bodies = [capBody, sphereBody],
            before = api.bodyTransforms(world, bodies);
        const poses = new Map(bodies.map((body, i) => [key(body), Array.from(before.slice(i * 10, i * 10 + 10))]));
        const shapes = new Map([
            [key(capShape), capsule],
            [key(sphereShape), sphere],
        ]);
        api.step(world);
        const snapshot = api.readStepSnapshot(world);
        report.lastSnapshot = snapshot;
        assert.equal(snapshot.contactsOfOwnedBodies.length, 1);
        const contact = snapshot.contactsOfOwnedBodies[0];
        const row = {
            ...fixture,
            contact,
            independentPoseA: poses.get(key(contact.bodyA)),
            independentPoseB: poses.get(key(contact.bodyB)),
            shapeA: shapes.get(key(contact.shapeA)),
            shapeB: shapes.get(key(contact.shapeB)),
        };
        // Retain the actual row before asserting it: a failed oracle sample is evidence too.
        appendFileSync(samplesPath, JSON.stringify(row) + '\n');
        ++samples;
        verifySphereCapsuleSample(row);
        ++validatedSamples;
        const geometry = api.contactWorldPoints(contact.handle);
        assert.equal(geometry, contact.geometry);
        assert.equal(api.contactWorldPoints(contact.handle), geometry);
        const retained = JSON.stringify(geometry),
            retainedSnapshot = JSON.stringify(snapshot);
        deepFrozen(geometry);
        assert.throws(() => {
            geometry.manifolds[0].points[0].worldPointA[0] = 999;
        }, TypeError);
        assert.equal(JSON.stringify(api.readStepSnapshot(world)), retainedSnapshot);
        if (samples === 1) {
            const foreign = api.createWorld([0, 0, 0]);
            worlds.add(foreign);
            noPartialGeometry(world, foreign, contact);
            api.destroyWorld(foreign);
            worlds.delete(foreign);
            const oldHeap = module.HEAPU8.buffer,
                beforeBytes = oldHeap.byteLength,
                p = module._malloc(beforeBytes + 65536);
            assert.ok(p && module.HEAPU8.buffer !== oldHeap, 'actual memory growth');
            report.observations.heapGrowth = { before: beforeBytes, after: module.HEAPU8.byteLength };
            module._free(p);
            assert.equal(api.contactWorldPoints(contact.handle), geometry);
            assert.equal(JSON.stringify(geometry), retained);
            api.step(world);
            assert.throws(() => api.contactWorldPoints(contact.handle), { code: 'AIR_E_BOX3D_STALE_SNAPSHOT' });
            const second = api.readStepSnapshot(world).contactsOfOwnedBodies;
            assert.equal(second.length, 1);
            api.setBodyLinearVelocity(world, sphereBody, [0, 0, 0]);
            assert.throws(() => api.contactWorldPoints(second[0].handle), { code: 'AIR_E_BOX3D_STALE_SNAPSHOT' });
            api.step(world);
            const third = api.readStepSnapshot(world).contactsOfOwnedBodies;
            assert.equal(third.length, 1);
            api.destroyBody(sphereBody);
            assert.throws(() => api.contactWorldPoints(third[0].handle), { code: 'AIR_E_BOX3D_STALE_SNAPSHOT' });
        }
        api.destroyWorld(world);
        worlds.delete(world);
        assert.throws(() => api.contactWorldPoints(contact.handle), { code: 'AIR_E_BOX3D_STALE_SNAPSHOT' });
        assert.equal(JSON.stringify(geometry), retained);
    }
    assert.equal(samples, CASES.length);
    assert.equal(validatedSamples, CASES.length);
    assert.equal(api.liveBytes(), baseline);
    assert.deepEqual(globalBridge(), bridgeBaseline);
    report.observations.coreBytesBefore = String(baseline);
    report.observations.coreBytesAfter = String(api.liveBytes());
    report.observations.nativeGlobalBridgeAfter = globalBridge();
    for (const name of CHECKS) pass(name);
    api.dispose();
    api = null;
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.error = String(error.stack ?? error);
    process.exitCode = 1;
} finally {
    if (api) {
        for (const world of worlds)
            try {
                api.destroyWorld(world);
            } catch (error) {
                report.cleanupErrors.push(String(error.stack ?? error));
            }
        try {
            api.dispose();
        } catch (error) {
            report.cleanupErrors.push(String(error.stack ?? error));
        }
    }
    if (report.cleanupErrors.length) {
        report.status = 'FAIL';
        process.exitCode = 1;
    }
    const bytes = readFileSync(samplesPath);
    report.validatedSamples = validatedSamples;
    report.samplesArtifact = {
        path: 'sphere-capsule-samples.raw.jsonl',
        records: samples,
        bytes: bytes.length,
        sha256: sha256(bytes),
    };
    report.completedAt = new Date().toISOString();
    save();
    console.log(
        JSON.stringify({ status: report.status, checks: report.checks.length, samples, raw, error: report.error }),
    );
}
