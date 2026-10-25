// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Real static Mesh facade resource ownership. No public Cocos/C16/C19 credit.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { sha256 } from './verify-sources.mjs';
const dir = resolve(process.argv[2]),
    dest = resolve(dir, 'wasm-mesh-contract.raw.json');
assert.ok(!existsSync(dest), 'Preserve prior evidence');
const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json')));
const { default: factory } = await import(pathToFileURL(resolve(dir, 'box3d-st.mjs')));
const { createBox3DBinding } = await import(pathToFileURL(resolve(dir, 'facade.mjs')));
const apis = [];
const make = async () => {
    const mod = await factory({ wasmBinary: readFileSync(resolve(dir, 'box3d-st.wasm')) });
    const api = createBox3DBinding(mod, manifest);
    apis.push(api);
    return { api, mod };
};
const report = {
    status: 'RUNNING',
    fixtureSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    identity: manifest,
    checks: {},
    orders: [],
};
try {
    const { api } = await make(),
        { api: foreign } = await make();
    for (let order = 0; order < 4; ++order) {
        const base = api.liveBytes(),
            world = api.createWorld(),
            other = api.createWorld(),
            foreignWorld = foreign.createWorld();
        const points = new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]);
        const triangles = new Uint32Array([0, 2, 1, 0, 3, 2]);
        const resource = api.cookStaticMesh(world, points, triangles),
            second = api.retainStaticMesh(resource);
        assert.equal(api.staticMeshState(resource).cacheLeases, 2);
        api.releaseStaticMesh(second);
        api.releaseStaticMesh(second);
        assert.equal(api.staticMeshState(resource).cacheLeases, 1);
        assert.throws(
            () => api.staticMeshState({ ...resource }),
            (e) => e.code === 'AIR_E_BOX3D_DISPOSED',
        );
        assert.throws(
            () => foreign.staticMeshState(resource),
            (e) => e.code === 'AIR_E_BOX3D_DISPOSED',
        );
        const bodies = [0, 20, 40].map((x) => api.createBody(world, { type: 0, position: [x, 0, 0] }));
        const shapes = bodies.map((body) => api.createStaticMeshShape(body, resource));
        assert.equal(api.staticMeshState(resource).shapeBorrows, 3);
        const ray = () => api.rayAllRaw(world, [0.2, 2, 0.1], [0, -4, 0], { group: -1, mask: -1, queryTrigger: false });
        const original = ray();
        assert.equal(original.length, 1);
        assert.ok(Math.abs(original[0].fraction - 0.5) <= 1e-6);
        assert.deepEqual(original[0].normal, [0, 1, 0]);
        assert.equal(api.staticMeshSourceFace(shapes[0], original[0].triangleIndex), 0);
        const saved = JSON.stringify(original);
        points.fill(999);
        triangles.fill(0);
        assert.equal(JSON.stringify(ray()), saved);
        const oldState = api.staticMeshState(resource),
            oldPose = api.bodyState(world, bodies[0]);
        for (const type of [1, 2]) {
            const bad = api.createBody(world, { type });
            assert.throws(
                () => api.createStaticMeshShape(bad, resource),
                (e) => e.mutationOutcome === 'not-mutated',
            );
            assert.throws(
                () => api.setBodyType(world, bodies[0], type),
                (e) => e.mutationOutcome === 'not-mutated',
            );
            api.destroyBody(bad);
            assert.deepEqual(api.bodyState(world, bodies[0]), oldPose);
            api.step(world);
            assert.equal(JSON.stringify(ray()), saved);
        }
        const otherBody = api.createBody(other, { type: 0 });
        assert.throws(
            () => api.createStaticMeshShape(otherBody, resource),
            (e) => e.code === 'AIR_E_BOX3D_DISPOSED',
        );
        assert.deepEqual(api.staticMeshState(resource), oldState);
        for (const [p, t] of [
            [points, triangles],
            [
                [0, 0, 0, 1, 0, 0, 0, 0, 1],
                [0, 1, NaN],
            ],
            [
                [0, 0, 0, 1, 0, 0, 0, 0, 1],
                [0, 1, 3],
            ],
            [
                [0, 0, 0, 1, 0, 0, 0, 0, 1],
                [0, 1, 2, 0],
            ],
        ]) {
            assert.throws(() => api.cookStaticMesh(world, p, t));
            assert.deepEqual(api.staticMeshState(resource), oldState);
        }
        if (order === 0) {
            api.releaseStaticMesh(resource);
            api.releaseStaticMesh(resource);
            api.destroyShape(shapes[1]);
            api.destroyBody(bodies[2]);
            assert.equal(JSON.stringify(ray()), saved);
            api.destroyShape(shapes[0]);
        } else if (order === 1) {
            for (const b of [...bodies].reverse()) api.destroyBody(b);
            assert.equal(api.staticMeshState(resource).shapeBorrows, 0);
            api.releaseStaticMesh(resource);
        } else if (order === 2) {
            api.destroyShape(shapes[1]);
            api.releaseStaticMesh(resource);
        }
        api.destroyWorld(world);
        assert.throws(() => api.createStaticMeshShape(bodies[0], resource));
        assert.equal(JSON.stringify(original), saved);
        api.destroyWorld(other);
        foreign.destroyWorld(foreignWorld);
        assert.equal(api.liveBytes(), base);
        assert.equal(api.bridgeMemory().liveAllocations, 0);
        report.orders.push({
            order,
            threeShapes: 3,
            copiedHit: original[0],
            finalCoreBytes: String(api.liveBytes()),
            finalBridge: api.bridgeMemory(),
        });
    }
    report.checks = {
        independentRayAndSourceFace: true,
        copiedInputAndResult: true,
        threeNativeBorrows: true,
        separateIdempotentLeases: true,
        foreignAndForgedRejection: true,
        nonstaticAtomicRejection: true,
        failedReplacementPreservesOld: true,
        fourReleaseOrders: true,
        finalCoreBridgeBaseline: true,
    };
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.error = error.stack;
    process.exitCode = 1;
} finally {
    report.cleanup = [];
    for (const api of apis) {
        try {
            api.dispose();
            report.cleanup.push('disposed');
        } catch (error) {
            report.cleanup.push(String(error));
            report.status = 'FAIL';
            process.exitCode = 1;
        }
    }
    writeFileSync(
        dest,
        JSON.stringify(report, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2) + '\n',
        { flag: 'wx' },
    );
    console.log(JSON.stringify({ status: report.status, output: dest }));
}
