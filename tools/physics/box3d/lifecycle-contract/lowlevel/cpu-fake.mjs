// Deliberately fake CPU model. No native/physics qualification, WASM import, or production code mutation.
// Used only to execute the new fixture's scheduling and fail-closed consumer logic.
export function cpuFake() {
    const worlds = new Map(),
        bodies = new Map(),
        shapes = new Map(),
        joints = new Map(),
        meshes = new Map();
    const bodyTokens = new WeakMap(),
        shapeTokens = new WeakMap(),
        jointTokens = new WeakMap(),
        leases = new WeakMap();
    let nextWorld = 1,
        nextId = 1,
        cooks = 0n,
        destroys = 0n;
    const heap = new Uint32Array(1024);
    const key = (low, high) => `${low}:${high}`;
    const id = () => ({ low: nextId++, high: 1 });
    const disposed = () => {
        throw Object.assign(new Error('CPU fake disposed'), { code: 'AIR_E_BOX3D_DISPOSED' });
    };
    const world = (token) => {
        const w = worlds.get(token?.id);
        if (!w?.alive || w.token !== token) disposed();
        return w;
    };
    const owned = (map, token) => {
        const value = map.get(token);
        if (!value?.alive || !value.world.alive || (value.body && !value.body.alive)) disposed();
        return value;
    };
    const lease = (token) => {
        const l = leases.get(token);
        if (!l || l.released || !l.mesh.alive || !l.mesh.world.alive) disposed();
        return l;
    };
    const maybeFree = (mesh) => {
        if (mesh.alive && mesh.cache === 0 && mesh.borrows === 0) {
            mesh.alive = false;
            destroys++;
        }
    };
    const dropShape = (shape) => {
        if (!shape.alive) return;
        shape.alive = false;
        shape.debugCached = false;
        if (shape.mesh) {
            shape.mesh.borrows--;
            maybeFree(shape.mesh);
        }
    };
    const counts = (w) =>
        [bodies, shapes, null, joints].map((map) =>
            map ? [...map.values()].filter((v) => v.alive && v.world === w).length : 0,
        );
    const core = () =>
        BigInt(
            [...worlds.values()].filter((w) => w.alive).length * 128 +
                [...bodies.values()].filter((v) => v.alive).length * 64 +
                [...shapes.values()].filter((v) => v.alive).length * 32 +
                [...joints.values()].filter((v) => v.alive).length * 96 +
                [...meshes.values()].filter((v) => v.alive).length * 256,
        );
    const bridge = () => {
        const ws = [...worlds.values()].filter((w) => w.alive).length,
            ms = [...meshes.values()].filter((m) => m.alive).length,
            borrows = [...shapes.values()].filter((s) => s.alive && s.mesh).length,
            cached = [...shapes.values()].filter((s) => s.alive && s.debugCached),
            debugBytes = cached.reduce((total, shape) => total + 8 + (shape.mesh ? 24 : 72) * 24, 0);
        return {
            liveBytes: BigInt(ws * 64 + ms * 256 + borrows * 24 + debugBytes),
            liveAllocations: ws + ms + borrows + cached.length,
            shapeHandles: cached.length, // Only lazy createDebugShape resources, never core shape count.
            primitiveCapacity: 0,
            capturedPrimitives: 0,
        };
    };
    const write64 = (p, value) => {
        heap[p >>> 2] = Number(value & 0xffffffffn);
        heap[(p >>> 2) + 1] = Number(value >> 32n);
    };
    const module = {
        HEAPU32: heap,
        _malloc: () => 16,
        _free: () => {},
        _air_b3_live_bytes: (p) => write64(p, core()),
        _air_b3_bridge_memory: (w, p) => {
            if (w && !worlds.get(w)?.alive) return 1;
            const b = bridge();
            write64(p, b.liveBytes);
            heap.set([b.liveAllocations, b.shapeHandles, 0, 0], (p >>> 2) + 2);
            return 0;
        },
        _air_b3_mesh_lifetime_counters: (p) => {
            write64(p, cooks);
            write64(p + 8, destroys);
            return 0;
        },
        _air_b3_world_valid: (w) => Number(!!worlds.get(w)?.alive),
        _air_b3_body_valid: (lo, hi) => Number(!!bodies.get(key(lo, hi))?.alive),
        _air_b3_shape_valid: (lo, hi) => Number(!!shapes.get(key(lo, hi))?.alive),
        _air_b3_fixed_state: (w, lo, hi) => {
            const j = joints.get(key(lo, hi));
            return worlds.get(w)?.alive && j?.alive && j.world.token.id === w ? 0 : 1;
        },
        _air_b3_mesh_state: (w, lo, hi, p) => {
            const m = meshes.get(key(lo, hi));
            if (!worlds.get(w)?.alive || !m?.alive || m.world.token.id !== w) return 1;
            heap.set([m.cache, m.borrows, 9, 8, 256, w], p >>> 2);
            return 0;
        },
    };
    const api = {
        createWorld: () => {
            const token = { id: nextWorld++ };
            worlds.set(token.id, { token, alive: true });
            return token;
        },
        createBody: (token, options = {}) => {
            const body = id(),
                b = { token: body, alive: true, world: world(token), position: options.position ?? [0, 0, 0] };
            bodies.set(key(body.low, body.high), b);
            bodyTokens.set(body, b);
            return body;
        },
        createSphere: (token, radius = 0.5) => {
            const body = owned(bodyTokens, token),
                shape = id(),
                s = { token: shape, alive: true, world: body.world, body, radius, debugCached: false };
            shapes.set(key(shape.low, shape.high), s);
            shapeTokens.set(shape, s);
            return shape;
        },
        cookStaticMesh: (token, points, indices) => {
            const resource = id(),
                m = {
                    token: resource,
                    world: world(token),
                    alive: true,
                    cache: 1,
                    borrows: 0,
                    points: Array.from(points),
                    indices: Array.from(indices),
                };
            cooks++;
            meshes.set(key(resource.low, resource.high), m);
            leases.set(resource, { mesh: m, released: false });
            return resource;
        },
        retainStaticMesh: (resource) => {
            const m = lease(resource).mesh,
                extra = { ...resource };
            m.cache++;
            leases.set(extra, { mesh: m, released: false });
            return extra;
        },
        releaseStaticMesh: (resource) => {
            const old = leases.get(resource);
            if (!old) disposed();
            if (old.released) return;
            const l = lease(resource);
            l.released = true;
            l.mesh.cache--;
            maybeFree(l.mesh);
        },
        staticMeshState: (resource) => {
            const m = lease(resource).mesh;
            return {
                cacheLeases: m.cache,
                shapeBorrows: m.borrows,
                vertexCount: 9,
                triangleCount: 8,
                coreMeshBytes: 256,
                worldId: m.world.token.id,
            };
        },
        createStaticMeshShape: (token, resource) => {
            const m = lease(resource).mesh,
                shape = api.createSphere(token),
                s = shapeTokens.get(shape);
            s.mesh = m;
            m.borrows++;
            return shape;
        },
        createFixedJoint: (token, a, b) => {
            const w = world(token);
            owned(bodyTokens, a);
            owned(bodyTokens, b);
            const joint = id(),
                j = { token: joint, world: w, alive: true, a, b };
            joints.set(key(joint.low, joint.high), j);
            jointTokens.set(joint, j);
            return joint;
        },
        debugSnapshot: (token, flags, jointScale) => {
            const w = world(token),
                primitives = [];
            if (flags !== 1 || jointScale !== 0) throw new Error('CPU model covers only declared wireframe request');
            for (const shape of shapes.values()) {
                if (!shape.alive || shape.world !== w) continue;
                // mirrors lazy callback lifecycle, not a native geometry qualification oracle
                shape.debugCached = true;
                const add = (p) => p.map((value, axis) => Math.fround(value + shape.body.position[axis]));
                const line = (from, to) =>
                    primitives.push({ kind: 'line', from: add(from), to: add(to), color: 0xffcc00 });
                if (shape.mesh) {
                    const { points, indices } = shape.mesh;
                    for (let triangle = 0; triangle < indices.length; triangle += 3) {
                        for (let edge = 0; edge < 3; edge++) {
                            const a = indices[triangle + edge] * 3,
                                b = indices[triangle + ((edge + 1) % 3)] * 3;
                            line(points.slice(a, a + 3), points.slice(b, b + 3));
                        }
                    }
                } else {
                    for (let axis = 0; axis < 3; axis++)
                        for (let i = 0; i < 24; i++) {
                            const ends = [i, i + 1].map((step) => {
                                const angle = Math.fround(step * Math.fround((2 * Math.PI) / 24)),
                                    point = [0, 0, 0];
                                point[(axis + 1) % 3] = Math.fround(shape.radius * Math.cos(angle));
                                point[(axis + 2) % 3] = Math.fround(shape.radius * Math.sin(angle));
                                return point;
                            });
                            line(...ends);
                        }
                }
            }
            // Production api.debugSnapshot releases the wire before return; caches stay live until shapes die.
            return { primitives, flags, jointScale, supportedFlags: 5 };
        },
        fixedJointState: (token, joint) => {
            world(token);
            const j = owned(jointTokens, joint);
            return { kind: 'fixed', bodyA: j.a, bodyB: j.b };
        },
        destroyJoint: (token, joint) => {
            world(token);
            owned(jointTokens, joint).alive = false;
        },
        destroyShape: (token) => dropShape(owned(shapeTokens, token)),
        destroyBody: (token) => {
            const b = owned(bodyTokens, token);
            b.alive = false;
            for (const s of shapes.values()) if (s.body === b) dropShape(s);
        },
        bodySnapshot: (token) => {
            owned(bodyTokens, token);
            return [];
        },
        destroyWorld: (token) => {
            const w = world(token);
            for (const s of shapes.values()) if (s.world === w) dropShape(s);
            for (const b of bodies.values()) if (b.world === w) b.alive = false;
            for (const j of joints.values()) if (j.world === w) j.alive = false;
            for (const m of meshes.values())
                if (m.world === w && m.alive) {
                    m.alive = false;
                    destroys++;
                }
            w.alive = false;
        },
        worldCounts: (token) => ({ counts: Uint32Array.from(counts(world(token))), liveBytes: core() }),
        liveBytes: core,
        bridgeMemory: (token) => {
            world(token);
            return bridge();
        },
        meshLifetimeCounters: () => ({ cooks, destroys }),
        dispose: () => {
            for (const w of worlds.values()) if (w.alive) api.destroyWorld(w.token);
        },
    };
    return { api, module };
}
