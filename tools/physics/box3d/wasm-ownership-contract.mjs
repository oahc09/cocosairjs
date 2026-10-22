// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Real fixed-core WASM only. Writes raw partial/failure evidence; never substitutes a mock.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { root, sha256 } from './verify-sources.mjs';

const dir = resolve(process.argv[2]);
const output = resolve(dir, 'wasm-ownership-contract.raw.json');
assert.ok(!existsSync(output), 'Keep earlier raw evidence; use a new build output');
const read = (name) => readFileSync(resolve(dir, name));
const report = {
    schemaVersion: 1,
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    nodeVersion: process.version,
    scope: 'Finite real-WASM ownership/argument contracts, not full G1 or a general raw-pointer safety guarantee',
    limitations: [
        '128 sampled cycles do not prove absence of all ABA or 16-bit generation wrap.',
        'Raw body/shape IDs may repeat across module/world lifetimes; facade object ownership is separately enforced.',
        'Native live bytes cover the core allocator, not all JS allocations or the WASM linear-memory high-water mark.',
    ],
    inputHashes: {
        fixture: sha256(readFileSync(fileURLToPath(import.meta.url))),
        lock: sha256(readFileSync(resolve(root, 'tools/physics/box3d/versions.lock.json'))),
        manifest: sha256(read('manifest.json')),
    },
    rejectedOperations: [],
    slotReuseCycles: [],
    worldLifetimeCycles: [],
    observations: {},
};
const persist = () => writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
persist();
try {
    const manifest = JSON.parse(read('manifest.json'));
    report.identity = {
        coreSha: manifest.coreSha,
        schemaSha256: manifest.schemaSha256,
        patchChainSha256: manifest.patchChainSha256,
    };
    for (const artifact of manifest.artifacts) {
        assert.equal(read(artifact.path).length, artifact.bytes);
        assert.equal(sha256(read(artifact.path)), artifact.sha256);
    }
    const { default: createModule } = await import(pathToFileURL(resolve(dir, 'box3d-st.mjs')).href);
    const { createBox3DBinding } = await import(pathToFileURL(resolve(dir, 'facade.mjs')).href);
    const moduleA = await createModule({ wasmBinary: read('box3d-st.wasm') });
    const moduleB = await createModule({ wasmBinary: read('box3d-st.wasm') });
    assert.notEqual(moduleA.HEAPU8.buffer, moduleB.HEAPU8.buffer);
    const a = createBox3DBinding(moduleA, manifest);
    const peer = createBox3DBinding(moduleA, manifest);
    const other = createBox3DBinding(moduleB, manifest);
    const baselineA = a.liveBytes();
    const baselineB = other.liveBytes();
    assert.equal(baselineA, 0n);
    assert.equal(baselineB, 0n);
    const worlds = [
        a.createWorld([0, 0, 0]),
        a.createWorld([0, 0, 0]),
        peer.createWorld([0, 0, 0]),
        other.createWorld([0, 0, 0]),
    ];
    const bindings = [a, a, peer, other];
    const bodies = worlds.map((world, i) =>
        bindings[i].createBody(world, { position: [i * 10, 0, 0], enableSleep: false }),
    );
    const shapes = bodies.map((body, i) => bindings[i].createSphere(body, 0.5));
    const snapshotState = () => ({
        bodies: bodies.map((body, i) => Array.from(bindings[i].bodySnapshot(body))),
        worlds: worlds.map((world, i) => {
            const { counts, liveBytes } = bindings[i].worldCounts(world);
            return { counts: Array.from(counts), liveBytes: String(liveBytes) };
        }),
        coreBytes: [String(a.liveBytes()), String(other.liveBytes())],
    });
    const rejectUnchanged = (name, operation) => {
        const before = snapshotState();
        let error;
        assert.throws(
            operation,
            (value) => {
                error = { code: value.code, message: value.message };
                return [
                    'AIR_E_BOX3D_ARGUMENT',
                    'AIR_E_BOX3D_DISPOSED',
                    'AIR_E_BOX3D_NATIVE',
                    'AIR_E_BOX3D_REENTRANT',
                ].includes(value.code);
            },
            name,
        );
        const after = snapshotState();
        assert.deepEqual(after, before, `${name}: failed operation changed snapshots or counts`);
        report.rejectedOperations.push({ name, error, before, after });
        persist();
    };

    const isolationBefore = snapshotState();
    assert.equal(a.rayClosest(worlds[0], [10, 2, 0], [0, -4, 0]).data[0], 0);
    assert.equal(a.rayClosest(worlds[1], [10, 2, 0], [0, -4, 0]).data[0], 1);
    a.setLinearVelocity(bodies[0], [1, 0, 0]);
    a.step(worlds[0]);
    const isolationAfter = snapshotState();
    assert.ok(isolationAfter.bodies[0][0] > isolationBefore.bodies[0][0]);
    assert.deepEqual(isolationAfter.bodies.slice(1), isolationBefore.bodies.slice(1));
    report.observations.worldIsolation = { before: isolationBefore, after: isolationAfter };
    const snapshot = a.bodySnapshot(bodies[0]);
    const unmodified = Array.from(snapshot);
    snapshot.fill(12345);
    assert.deepEqual(Array.from(a.bodySnapshot(bodies[0])), unmodified);
    report.observations.snapshotCopyMutationIsolated = true;

    for (const [name, binding, world, body, shape] of [
        ['same-module-foreign-owner', a, worlds[2], bodies[2], shapes[2]],
        ['cross-module', a, worlds[3], bodies[3], shapes[3]],
        ['reverse-cross-module', other, worlds[0], bodies[0], shapes[0]],
    ]) {
        rejectUnchanged(`${name}:world`, () => binding.step(world));
        rejectUnchanged(`${name}:create-body`, () => binding.createBody(world));
        rejectUnchanged(`${name}:body`, () => binding.bodySnapshot(body));
        rejectUnchanged(`${name}:destroy-body`, () => binding.destroyBody(body));
        rejectUnchanged(`${name}:shape`, () => binding.destroyShape(shape));
    }
    rejectUnchanged('forged-world-copy', () => a.destroyWorld({ ...worlds[0] }));
    rejectUnchanged('forged-body-copy', () => a.setLinearVelocity({ ...bodies[0] }, [1, 0, 0]));
    rejectUnchanged('forged-body-prototype', () => a.destroyBody(Object.create(bodies[0])));
    rejectUnchanged('forged-shape-copy', () => a.destroyShape({ ...shapes[0] }));
    rejectUnchanged('body-used-as-world', () => a.step(bodies[0]));
    rejectUnchanged('shape-used-as-body', () => a.bodySnapshot(shapes[0]));
    rejectUnchanged('body-used-as-shape', () => a.destroyShape(bodies[0]));
    const queryIdentity = a.rayClosest(worlds[1], [10, 2, 0], [0, -4, 0]).shape;
    assert.ok(queryIdentity);
    rejectUnchanged('ray-shape-identity-is-not-ownership-token', () => a.destroyShape(queryIdentity));
    for (const [label, bad] of [
        ['NaN', NaN],
        ['positive-infinity', Infinity],
        ['negative-infinity', -Infinity],
        ['float32-overflow', 1e40],
        ['negative-float32-overflow', -1e40],
    ]) {
        for (const [name, action] of [
            ['velocity', () => a.setLinearVelocity(bodies[0], [bad, 0, 0])],
            ['impulse', () => a.applyCenterImpulse(bodies[0], [0, bad, 0])],
            ['position', () => a.createBody(worlds[0], { position: [0, 0, bad] })],
            ['angular-velocity', () => a.createBody(worlds[0], { angularVelocity: [0, bad, 0] })],
            ['gravity', () => a.createWorld([0, bad, 0])],
            ['gravity-scale', () => a.createBody(worlds[0], { gravityScale: bad })],
            ['sphere-radius', () => a.createSphere(bodies[0], bad)],
            ['shape-density', () => a.createSphere(bodies[0], 0.5, bad)],
            ['box-extent', () => a.createBox(bodies[0], [1, bad, 1])],
            ['ray-origin', () => a.rayClosest(worlds[0], [bad, 0, 0], [0, -1, 0])],
            ['ray-translation', () => a.rayClosest(worlds[0], [0, 1, 0], [0, bad, 0])],
            ['step-dt', () => a.step(worlds[0], bad)],
        ])
            rejectUnchanged(`${label}:${name}`, action);
    }
    for (const rotation of [
        [0, 0, 0, 0],
        [0, 0, 0, 2],
        [0, 0, 0, 0.5],
        [NaN, 0, 0, 1],
        [1e40, 0, 0, 1],
    ]) {
        rejectUnchanged(`invalid-quaternion:${rotation.map(String).join(',')}`, () =>
            a.createBody(worlds[0], { rotation }),
        );
    }
    for (const damping of [-0.001, 1.001, NaN, Infinity, 1e40]) {
        for (const name of ['linearDamping', 'angularDamping'])
            rejectUnchanged(`${name}:${String(damping)}`, () => a.createBody(worlds[0], { [name]: damping }));
    }
    for (const dt of [0, -1, 1e-50]) rejectUnchanged(`nonpositive-float32-dt:${dt}`, () => a.step(worlds[0], dt));
    for (const substeps of [0, -1, 1.5, NaN, Infinity, 2147483648])
        rejectUnchanged(`invalid-substeps:${String(substeps)}`, () => a.step(worlds[0], 1 / 60, substeps));
    for (const type of [-1, 3, 1.5, '2'])
        rejectUnchanged(`invalid-body-type:${String(type)}`, () => a.createBody(worlds[0], { type }));
    for (const size of [0, -1, 1e-50]) {
        rejectUnchanged(`nonpositive-float32-radius:${size}`, () => a.createSphere(bodies[0], size));
        rejectUnchanged(`nonpositive-float32-box:${size}`, () => a.createBox(bodies[0], [1, size, 1]));
        rejectUnchanged(`nonpositive-float32-density:${size}`, () => a.createSphere(bodies[0], 1, size));
    }
    rejectUnchanged('invalid-vector-length', () => a.setLinearVelocity(bodies[0], [1, 2]));
    rejectUnchanged('reentrant-option-getter', () =>
        a.createBody(worlds[0], {
            get position() {
                a.step(worlds[0]);
                return [0, 0, 0];
            },
        }),
    );
    for (let i = 0; i < worlds.length; ++i) bindings[i].destroyWorld(worlds[i]);
    assert.equal(a.liveBytes(), baselineA);
    assert.equal(other.liveBytes(), baselineB);

    const world = a.createWorld([0, 0, 0]);
    let previous;
    for (let cycle = 0; cycle < 128; ++cycle) {
        const body = a.createBody(world, { enableSleep: false });
        const shape = a.createSphere(body, 0.5);
        assert.equal(moduleA._air_b3_body_valid(body.low, body.high), 1);
        assert.equal(moduleA._air_b3_shape_valid(shape.low, shape.high), 1);
        if (previous) {
            assert.equal(body.high, previous.body.high, 'Fixture must reuse the same body slot');
            assert.equal(shape.high, previous.shape.high, 'Fixture must reuse the same shape slot');
            assert.notEqual(body.low, previous.body.low);
            assert.notEqual(shape.low, previous.shape.low);
            assert.equal(moduleA._air_b3_body_valid(previous.body.low, previous.body.high), 0);
            assert.equal(moduleA._air_b3_shape_valid(previous.shape.low, previous.shape.high), 0);
            assert.throws(() => a.bodySnapshot(previous.body), /disposed/);
            assert.throws(() => a.destroyShape(previous.shape));
        }
        a.step(world);
        const beforeDestroy = Array.from(a.bodySnapshot(body));
        if (cycle % 2 === 0) a.destroyShape(shape);
        a.destroyBody(body);
        assert.equal(moduleA._air_b3_body_valid(body.low, body.high), 0);
        assert.equal(moduleA._air_b3_shape_valid(shape.low, shape.high), 0);
        assert.throws(() => a.bodySnapshot(body), /disposed/);
        assert.throws(() => a.destroyShape(shape));
        const { counts, liveBytes } = a.worldCounts(world);
        assert.equal(counts[0], 0);
        assert.equal(counts[1], 0);
        report.slotReuseCycles.push({
            cycle,
            body,
            shape,
            beforeDestroy,
            countsAfter: Array.from(counts),
            coreBytesAfter: String(liveBytes),
            explicitShapeDestroy: cycle % 2 === 0,
        });
        previous = { body, shape };
        persist();
    }
    a.destroyWorld(world);
    assert.equal(a.liveBytes(), baselineA);

    let stale;
    for (let cycle = 0; cycle < 128; ++cycle) {
        const world = a.createWorld([0, 0, 0]);
        const body = a.createBody(world, { enableSleep: false });
        const shape = a.createBox(body, [0.5, 0.5, 0.5]);
        let priorRawBodyValidInNewWorld = null;
        if (stale) {
            assert.notEqual(world.id, stale.world.id, 'World generation must differ in this finite sample');
            priorRawBodyValidInNewWorld = moduleA._air_b3_body_valid(stale.body.low, stale.body.high);
            const before = Array.from(a.bodySnapshot(body));
            const counts = a.worldCounts(world);
            assert.throws(() => a.step(stale.world), /disposed/);
            assert.throws(() => a.bodySnapshot(stale.body), /disposed/);
            assert.throws(() => a.destroyShape(stale.shape), /disposed/);
            assert.deepEqual(Array.from(a.bodySnapshot(body)), before);
            assert.deepEqual(a.worldCounts(world), counts);
        }
        a.step(world);
        a.destroyWorld(world);
        assert.equal(moduleA._air_b3_world_valid(world.id), 0);
        assert.equal(moduleA._air_b3_body_valid(body.low, body.high), 0);
        assert.equal(moduleA._air_b3_shape_valid(shape.low, shape.high), 0);
        assert.throws(() => a.bodySnapshot(body), /disposed/);
        assert.throws(() => a.destroyShape(shape), /disposed/);
        assert.equal(a.liveBytes(), baselineA);
        report.worldLifetimeCycles.push({
            cycle,
            world,
            body,
            shape,
            priorRawBodyValidInNewWorld,
            coreBytesAfter: String(a.liveBytes()),
        });
        stale = { world, body, shape };
        persist();
    }
    report.observations.rawBodyIdRevalidatedAcrossWorldLifetimes = report.worldLifetimeCycles.filter(
        (entry) => entry.priorRawBodyValidInNewWorld === 1,
    ).length;
    report.observations.coreBytesAfter = [String(a.liveBytes()), String(other.liveBytes())];
    a.dispose();
    a.dispose();
    peer.dispose();
    other.dispose();
    assert.throws(() => a.createWorld(), /disposed/);
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.error = { message: error.message, stack: error.stack };
    process.exitCode = 1;
} finally {
    report.completedAt = new Date().toISOString();
    persist();
    console.log(
        JSON.stringify({
            status: report.status,
            rejectedOperations: report.rejectedOperations.length,
            slotReuseCycles: report.slotReuseCycles.length,
            worldLifetimeCycles: report.worldLifetimeCycles.length,
            error: report.error?.message,
        }),
    );
}
