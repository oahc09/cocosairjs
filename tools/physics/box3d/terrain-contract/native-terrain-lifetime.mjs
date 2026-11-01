// Requires an explicitly authorized freshly built actual ST facade, never a mock.
// Geometry is the independent 3x3 terrain fixture, native kind remains mesh.
import assert from 'node:assert/strict';
import { geometry, samples, TOLERANCE } from './oracle.mjs';
const disposed = (e) => e.code === 'AIR_E_BOX3D_DISPOSED';
export function runNativeTerrainLifetime(api) {
    assert.equal(
        typeof api.meshLifetimeCounters,
        'function',
        'fresh native probe is mandatory; old SDK cannot qualify C19',
    );
    const report = {
        scope: 'actual production mesh bridge used by cooked TerrainCollider',
        orders: [],
        freeEvidence: 'completed b3DestroyMesh calls + core-byte baseline; NOT malloc/free invocation counts',
        status: 'RUNNING',
    };
    for (const order of ['cache-first', 'cache-last', 'world-last']) {
        const beforeBytes = api.liveBytes(),
            beforeCounters = api.meshLifetimeCounters(),
            world = api.createWorld();
        let worldLive = true;
        const rows = [];
        const counts = (stage, destroys) => {
            const c = api.meshLifetimeCounters(),
                delta = { cooks: c.cooks - beforeCounters.cooks, destroys: c.destroys - beforeCounters.destroys };
            assert.equal(delta.cooks, 1n);
            assert.equal(delta.destroys, BigInt(destroys));
            rows.push({ stage, ...delta });
        };
        try {
            const g = geometry(),
                points = Float32Array.from(g.positions.flat()),
                indices = Uint32Array.from(g.indices.flat());
            const resource = api.cookStaticMesh(world, points, indices);
            counts('cook', 0);
            const extra = api.retainStaticMesh(resource);
            assert.equal(api.staticMeshState(resource).cacheLeases, 2);
            api.releaseStaticMesh(extra);
            api.releaseStaticMesh(extra);
            assert.equal(api.staticMeshState(resource).cacheLeases, 1);
            const bodies = [0, 20, 40].map((x) => api.createBody(world, { type: 0, position: [x, 0, 0] }));
            const shapes = bodies.map((body) => api.createStaticMeshShape(body, resource));
            assert.equal(api.staticMeshState(resource).shapeBorrows, 3);
            assert.equal(api.staticMeshState(resource).vertexCount, 9);
            assert.equal(api.staticMeshState(resource).triangleCount, 8);
            const rays = () =>
                samples.map(([x, z, y, face]) => {
                    const result = api.rayAllRaw(world, [x, 20, z], [0, -30, 0], {
                        group: -1,
                        mask: -1,
                        queryTrigger: false,
                    });
                    assert.equal(result.length, 1);
                    const hit = result[0];
                    assert.ok(Math.abs(hit.fraction * 30 - (20 - y)) <= TOLERANCE);
                    assert.equal(api.staticMeshSourceFace(shapes[0], hit.triangleIndex), face);
                    return hit;
                });
            const copied = rays(),
                saved = JSON.stringify(copied);
            points.fill(999);
            indices.fill(0);
            assert.equal(JSON.stringify(rays()), saved);
            for (const type of [1, 2]) {
                const old = api.bodyState(world, bodies[0]);
                assert.throws(
                    () => api.setBodyType(world, bodies[0], type),
                    (e) => e.mutationOutcome === 'not-mutated',
                );
                assert.deepEqual(api.bodyState(world, bodies[0]), old);
                counts('nonstatic-rejection', 0);
            }
            assert.throws(() => api.staticMeshState({ ...resource }), disposed);
            if (order === 'cache-first') {
                api.releaseStaticMesh(resource);
                api.releaseStaticMesh(resource);
                counts('cache-released-three-borrows', 0);
                assert.throws(() => api.staticMeshState(resource), disposed);
                api.destroyShape(shapes[1]);
                counts('second-shape-destroyed', 0);
                api.destroyBody(bodies[2]);
                counts('third-body-destroyed', 0);
                assert.equal(JSON.stringify(rays()), saved);
                api.destroyShape(shapes[0]);
                counts('last-native-borrow-released', 1);
            } else if (order === 'cache-last') {
                for (const [n, index] of [2, 1, 0].entries()) {
                    api.destroyShape(shapes[index]);
                    assert.equal(api.staticMeshState(resource).shapeBorrows, 2 - n);
                    counts(`shape-${index}-released-cache-live`, 0);
                }
                api.releaseStaticMesh(resource);
                counts('last-cache-lease-released', 1);
            } else {
                api.destroyShape(shapes[1]);
                counts('one-shape-released', 0);
                api.releaseStaticMesh(resource);
                counts('cache-released-two-borrows', 0);
            }
            api.destroyWorld(world);
            worldLive = false;
            counts('world-destroyed', 1);
            api.releaseStaticMesh(resource);
            counts('idempotent-released-lease', 1);
            assert.throws(() => api.createStaticMeshShape(bodies[0], resource), disposed);
            assert.equal(JSON.stringify(copied), saved, 'copied ray data survives exact native disposal');
            assert.equal(api.liveBytes(), beforeBytes);
            assert.equal(api.bridgeMemory().liveAllocations, 0);
            report.orders.push({ order, rows, finalCoreBytes: api.liveBytes() });
        } finally {
            if (worldLive) api.destroyWorld(world);
        }
    }
    report.status = 'PASS';
    return report;
}
