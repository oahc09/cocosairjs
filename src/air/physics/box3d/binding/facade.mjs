/*
Copyright (c) 2026-2027 oahc09@gmail.com

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

// Internal, limited M1 foundation. This is not the Cocos physics adapter.
const CORE_SHA = 'efca0c184d40fd6a82016983f1601c4d23965867';
const BINDING_BASE_SHA = '5d5a3af049cccd9948b2b55bac4342414af0ef64';
const SCHEMA_SHA256 = '3aa11fe9d3d4b0269105bddbfebd8a1d09c9a3d162d88cb416d35d4304d1f30a';
const PATCH_CHAIN_SHA256 = '20dd450a4313774e1d934df9fa9ec3458df35d9ee314beffa9d846404cdb86bf';

function failure(code, message) {
    return Object.assign(new Error(message), { code });
}

function nativeStatus(status) {
    if (status !== 0) throw failure('AIR_E_BOX3D_NATIVE', `Box3D foundation status ${status}`);
}

function finite(value, name) {
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isFinite(Math.fround(value))) {
        throw failure('AIR_E_BOX3D_ARGUMENT', `${name} must be a finite float32`);
    }
    return value;
}

function vector(value, count, name) {
    if (!value || value.length !== count) throw failure('AIR_E_BOX3D_ARGUMENT', `${name} needs ${count} values`);
    return Array.from(value, (v) => finite(v, name));
}

export function createBox3DBinding(module, expected) {
    const text = (ptr) => {
        const heap = module.HEAPU8;
        let end = ptr;
        while (end < heap.length && heap[end]) ++end;
        if (end === heap.length) throw failure('AIR_E_BOX3D_ABI', 'Unterminated native identity');
        return new TextDecoder().decode(heap.subarray(ptr, end));
    };
    if (
        !expected ||
        expected.coreSha !== CORE_SHA ||
        expected.bindingBaseSha !== BINDING_BASE_SHA ||
        expected.patchChainSha256 !== PATCH_CHAIN_SHA256 ||
        typeof module?._air_b3_patch_chain_sha !== 'function' ||
        text(module._air_b3_patch_chain_sha()) !== PATCH_CHAIN_SHA256 ||
        expected.abiVersion !== 1 ||
        expected.variant !== 'st-simd' ||
        expected.schemaSha256 !== SCHEMA_SHA256 ||
        module._air_b3_abi_version() !== 1 ||
        text(module._air_b3_core_sha()) !== CORE_SHA ||
        text(module._air_b3_schema_sha()) !== expected.schemaSha256 ||
        (typeof SharedArrayBuffer !== 'undefined' && module.HEAPU8.buffer instanceof SharedArrayBuffer)
    )
        throw failure('AIR_E_BOX3D_ABI', 'Core/schema/variant/patch-chain identity mismatch');

    const scratch = module._malloc(512);
    if (!scratch) throw failure('AIR_E_BOX3D_NATIVE', 'Cannot allocate binding scratch');
    const input = scratch;
    const ids = scratch + 128;
    const output = scratch + 160;
    let disposed = false;
    let busy = false;
    const worlds = new Map();
    const handles = new WeakMap();
    const worldStates = new WeakMap();
    const snapshotHandles = new WeakMap();
    const freeze = (value) => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            for (const child of Object.values(value)) freeze(child);
            Object.freeze(value);
        }
        return value;
    };
    const idKey = (id) => `${id.low}:${id.high}`;
    function changed(world) {
        const state = worldStates.get(world);
        ++state.revision;
        state.available = false;
    }
    function withBuffer(bytes, action) {
        if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > 0x7ffffffc)
            throw failure('AIR_E_BOX3D_CAPACITY', 'Snapshot buffer exceeds supported capacity');
        const ptr = module._malloc(Math.max(bytes, 4));
        if (!ptr) throw failure('AIR_E_BOX3D_NATIVE', 'Cannot allocate snapshot buffer');
        try {
            return action(ptr);
        } finally {
            module._free(ptr);
        }
    }
    function transforms(world, bodies) {
        const worldNative = worldId(world);
        if (!Array.isArray(bodies)) throw failure('AIR_E_BOX3D_ARGUMENT', 'bodies must be an array');
        for (const body of bodies) {
            if (handle(body, 'body').world !== world)
                throw failure('AIR_E_BOX3D_DISPOSED', 'Batch body belongs to another world');
        }
        return withBuffer(bodies.length * 48, (ptr) => {
            for (let i = 0; i < bodies.length; ++i) {
                module.HEAPU32[(ptr >>> 2) + 2 * i] = bodies[i].low;
                module.HEAPU32[(ptr >>> 2) + 2 * i + 1] = bodies[i].high;
            }
            const dst = ptr + bodies.length * 8;
            nativeStatus(module._air_b3_body_transforms(worldNative, ptr, bodies.length, dst));
            return module.HEAPF32.slice(dst >>> 2, (dst >>> 2) + bodies.length * 10);
        });
    }
    function copyWire(sizeCall, copyCall) {
        nativeStatus(sizeCall(output));
        const words = module.HEAPU32[output >>> 2];
        return withBuffer(words * 4, (ptr) => {
            nativeStatus(copyCall(ptr, words));
            // Copy immediately. No view into linear memory survives this expression.
            return module.HEAPU8.slice(ptr, ptr + words * 4);
        });
    }
    function reader(bytes) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        let at = 0;
        const u = () => {
            const value = view.getUint32(at, true);
            at += 4;
            return value;
        };
        const f = () => {
            const value = view.getFloat32(at, true);
            at += 4;
            return value;
        };
        const floats = (count) => Array.from({ length: count }, f);
        const id = () => ({ low: u(), high: u() });
        const contactId = () => [u(), u(), u()];
        const done = () => {
            if (at !== view.byteLength) throw failure('AIR_E_BOX3D_ABI', 'Snapshot wire length mismatch');
        };
        return { u, f, floats, id, contactId, done };
    }
    function readEvents(world) {
        const wid = worldId(world);
        const bytes = copyWire(
            (out) => module._air_b3_world_event_size(wid, out),
            (out, cap) => module._air_b3_world_events(wid, out, cap),
        );
        const r = reader(bytes);
        const counts = Array.from({ length: 6 }, r.u);
        const contact = () => ({ shapeA: r.id(), shapeB: r.id(), contactId: r.contactId(), validFlags: r.u() });
        const sensor = () => ({ sensor: r.id(), visitor: r.id(), validFlags: r.u() });
        const bodyMoves = Array.from({ length: counts[0] }, () => ({
            body: r.id(),
            valid: Boolean(r.u()),
            fellAsleep: Boolean(r.u()),
            transform: r.floats(7),
        }));
        const contactBegins = Array.from({ length: counts[1] }, contact);
        const contactEnds = Array.from({ length: counts[2] }, contact);
        const contactHits = Array.from({ length: counts[3] }, () => ({
            ...contact(),
            nativeHitPoint: r.floats(3),
            normalAtoB: r.floats(3),
            approachSpeed: r.f(),
            userMaterialA: r.id(),
            userMaterialB: r.id(),
            pointSemantics: 'NATIVE_HIT_EVENT_NOT_GENERAL_CONTACT_WORLD_POINT',
        }));
        const sensorBegins = Array.from({ length: counts[4] }, sensor);
        const sensorEnds = Array.from({ length: counts[5] }, sensor);
        r.done();
        return { bodyMoves, contactBegins, contactEnds, contactHits, sensorBegins, sensorEnds };
    }
    function readBodyContacts(world, body) {
        const wid = worldId(world);
        const bytes = copyWire(
            (out) => module._air_b3_body_contact_size(wid, body.low, body.high, out),
            (out, cap) => module._air_b3_body_contacts(wid, body.low, body.high, out, cap),
        );
        const r = reader(bytes);
        const count = r.u();
        const result = [];
        for (let i = 0; i < count; ++i) {
            const contactId = r.contactId();
            const shapeA = r.id();
            const shapeB = r.id();
            const bodyA = r.id();
            const bodyB = r.id();
            const manifoldCount = r.u();
            const awakeA = Boolean(r.u());
            const awakeB = Boolean(r.u());
            const postPoseA = r.floats(10);
            const postPoseB = r.floats(10);
            const manifolds = [];
            for (let m = 0; m < manifoldCount; ++m) {
                const pointCount = r.u();
                const normalAtoB = r.floats(3);
                const twistImpulse = r.f();
                const frictionImpulse = r.floats(3);
                const rollingImpulse = r.floats(3);
                const points = [];
                for (let k = 0; k < pointCount; ++k)
                    points.push({
                        anchorA: r.floats(3),
                        anchorB: r.floats(3),
                        separation: r.f(),
                        normalImpulse: r.f(),
                        totalNormalImpulse: r.f(),
                        normalVelocity: r.f(),
                        baseSeparation: r.f(),
                        featureId: r.u(),
                        triangleIndex: r.u() | 0,
                        persisted: Boolean(r.u()),
                    });
                manifolds.push({ normalAtoB, twistImpulse, frictionImpulse, rollingImpulse, points });
            }
            result.push({
                contactId,
                shapeA,
                shapeB,
                bodyA,
                bodyB,
                awakeA,
                awakeB,
                postPoseA,
                postPoseB,
                manifolds,
                anchorEpoch: 'UNRESOLVED_CACHED_NATIVE',
                worldPointStatus: 'UNSUPPORTED_SNAPSHOT_EPOCH',
            });
        }
        r.done();
        return result;
    }
    function poseRows(bodies, values) {
        return bodies.map((body, i) => ({
            body: { low: body.low, high: body.high },
            pose: Array.from(values.slice(i * 10, i * 10 + 10)),
        }));
    }
    function captureStep(world, beforeRows) {
        const state = worldStates.get(world);
        const events = readEvents(world);
        const bodies = [...state.bodies];
        const afterRows = poseRows(bodies, transforms(world, bodies));
        const contacts = new Map();
        for (const body of bodies)
            for (const contact of readBodyContacts(world, body)) {
                const key = contact.contactId.join(':');
                if (contacts.has(key)) continue;
                contact.prePoseA = beforeRows.find((row) => idKey(row.body) === idKey(contact.bodyA))?.pose ?? null;
                contact.prePoseB = beforeRows.find((row) => idKey(row.body) === idKey(contact.bodyB))?.pose ?? null;
                const token = Object.freeze({ contactId: Object.freeze([...contact.contactId]) });
                contact.handle = token;
                snapshotHandles.set(token, { world, step: state.step, revision: state.revision, contact });
                contacts.set(key, contact);
            }
        const snapshot = freeze({
            worldId: worldId(world),
            stepIndex: state.step,
            ...events,
            bodyPosesBefore: beforeRows,
            bodyPosesAfter: afterRows,
            contactsOfOwnedBodies: [...contacts.values()],
        });
        state.snapshot = snapshot;
        state.available = true;
        return snapshot;
    }
    function snapshotHandle(token) {
        alive();
        const item = snapshotHandles.get(token);
        const state = item && worldStates.get(item.world);
        if (
            !item ||
            !worlds.has(item.world) ||
            !state.available ||
            state.step !== item.step ||
            state.revision !== item.revision
        )
            throw failure('AIR_E_BOX3D_STALE_SNAPSHOT', 'Contact snapshot is foreign, stale or disposed');
        module.HEAPU32.set(item.contact.contactId, ids >>> 2);
        if (!module._air_b3_contact_valid(worldId(item.world), ids))
            throw failure('AIR_E_BOX3D_STALE_SNAPSHOT', 'Native contact is no longer valid');
        return item;
    }

    function alive() {
        if (disposed) throw failure('AIR_E_BOX3D_DISPOSED', 'Box3D binding is disposed');
    }
    function exclusive(action) {
        alive();
        if (busy) throw failure('AIR_E_BOX3D_REENTRANT', 'Binding scratch is already in use');
        busy = true;
        try {
            return action();
        } finally {
            busy = false;
        }
    }
    function worldId(world) {
        alive();
        if (!worlds.has(world)) throw failure('AIR_E_BOX3D_DISPOSED', 'World is foreign or disposed');
        return worlds.get(world);
    }
    function handle(value, kind) {
        alive();
        const item = handles.get(value);
        if (
            !item ||
            item.kind !== kind ||
            item.destroyed ||
            !worlds.has(item.world) ||
            (item.body && handles.get(item.body).destroyed)
        ) {
            throw failure('AIR_E_BOX3D_DISPOSED', `${kind} is foreign or disposed`);
        }
        return item;
    }
    function copiedId(world, kind, body = null) {
        const heap = module.HEAPU32;
        const value = Object.freeze({ low: heap[ids >>> 2], high: heap[(ids >>> 2) + 1] });
        handles.set(value, { kind, world, body, destroyed: false });
        if (kind === 'body') worldStates.get(world).bodies.add(value);
        changed(world);
        return value;
    }
    function readFloats(count) {
        // This view is obtained AFTER the call, not retained across allocation/growth.
        return module.HEAPF32.slice(output >>> 2, (output >>> 2) + count);
    }
    function readU64(ptr) {
        const heap = module.HEAPU32;
        return (BigInt(heap[(ptr >>> 2) + 1]) << 32n) | BigInt(heap[ptr >>> 2]);
    }
    const api = {
        identity: Object.freeze({ ...expected }),
        createWorld(gravity = [0, -10, 0]) {
            return exclusive(() => {
                const g = vector(gravity, 3, 'gravity');
                const id = module._air_b3_world_create(...g) >>> 0;
                if (!id) throw failure('AIR_E_BOX3D_NATIVE', 'World creation failed');
                const world = Object.freeze({ id });
                worlds.set(world, id);
                worldStates.set(world, { step: 0, revision: 0, available: false, snapshot: null, bodies: new Set() });
                return world;
            });
        },
        destroyWorld(world) {
            return exclusive(() => {
                const id = worldId(world);
                nativeStatus(module._air_b3_world_destroy(id));
                const state = worldStates.get(world);
                state.bodies.clear();
                state.snapshot = null;
                state.available = false;
                worlds.delete(world);
            });
        },
        step(world, dt = 1 / 60, substeps = 4) {
            return exclusive(() => {
                if (!Number.isInteger(substeps) || substeps < 1 || substeps > 2147483647) {
                    throw failure('AIR_E_BOX3D_ARGUMENT', 'substeps must be a positive int32');
                }
                const value = finite(dt, 'dt');
                if (value <= 0) throw failure('AIR_E_BOX3D_ARGUMENT', 'dt must be positive');
                const wid = worldId(world);
                const state = worldStates.get(world);
                const bodies = [...state.bodies];
                const beforeRows = poseRows(bodies, transforms(world, bodies));
                nativeStatus(module._air_b3_world_step(wid, value, substeps));
                ++state.step;
                state.available = false;
                try {
                    captureStep(world, beforeRows);
                } catch (error) {
                    throw failure(
                        'AIR_E_BOX3D_SNAPSHOT_UNAVAILABLE',
                        `Native step ${state.step} completed but snapshot copy failed: ${error.message}`,
                    );
                }
            });
        },
        createBody(world, options = {}) {
            return exclusive(() => {
                const id = worldId(world);
                const type = options.type ?? 2;
                if (![0, 1, 2].includes(type)) throw failure('AIR_E_BOX3D_ARGUMENT', 'Invalid body type');
                const values = [
                    ...vector(options.position ?? [0, 0, 0], 3, 'position'),
                    ...vector(options.rotation ?? [0, 0, 0, 1], 4, 'rotation'),
                    ...vector(options.linearVelocity ?? [0, 0, 0], 3, 'linearVelocity'),
                    ...vector(options.angularVelocity ?? [0, 0, 0], 3, 'angularVelocity'),
                    finite(options.linearDamping ?? 0, 'linearDamping'),
                    finite(options.angularDamping ?? 0, 'angularDamping'),
                    finite(options.gravityScale ?? 1, 'gravityScale'),
                ];
                module.HEAPF32.set(values, input >>> 2);
                nativeStatus(module._air_b3_body_create(id, type, input, options.enableSleep === false ? 0 : 1, ids));
                return copiedId(world, 'body');
            });
        },
        destroyBody(body) {
            return exclusive(() => {
                const item = handle(body, 'body');
                nativeStatus(module._air_b3_body_destroy(body.low, body.high));
                item.destroyed = true;
                worldStates.get(item.world).bodies.delete(body);
                changed(item.world);
            });
        },
        bodySnapshot(body) {
            return exclusive(() => {
                handle(body, 'body');
                nativeStatus(module._air_b3_body_snapshot(body.low, body.high, output));
                return readFloats(29);
            });
        },
        setLinearVelocity(body, velocity) {
            return exclusive(() => {
                const item = handle(body, 'body');
                nativeStatus(module._air_b3_body_velocity(body.low, body.high, ...vector(velocity, 3, 'velocity')));
                changed(item.world);
            });
        },
        applyCenterImpulse(body, impulse) {
            return exclusive(() => {
                const item = handle(body, 'body');
                nativeStatus(module._air_b3_body_impulse(body.low, body.high, ...vector(impulse, 3, 'impulse')));
                changed(item.world);
            });
        },
        createSphere(body, radius, density = 1) {
            return exclusive(() => {
                const item = handle(body, 'body');
                nativeStatus(
                    module._air_b3_shape_sphere(
                        body.low,
                        body.high,
                        finite(radius, 'radius'),
                        finite(density, 'density'),
                        ids,
                    ),
                );
                return copiedId(item.world, 'shape', body);
            });
        },
        createBox(body, halfExtents, density = 1) {
            return exclusive(() => {
                const item = handle(body, 'body');
                nativeStatus(
                    module._air_b3_shape_box(
                        body.low,
                        body.high,
                        ...vector(halfExtents, 3, 'halfExtents'),
                        finite(density, 'density'),
                        ids,
                    ),
                );
                return copiedId(item.world, 'shape', body);
            });
        },
        destroyShape(shape) {
            return exclusive(() => {
                const item = handle(shape, 'shape');
                nativeStatus(module._air_b3_shape_destroy(shape.low, shape.high));
                item.destroyed = true;
                changed(item.world);
            });
        },
        bodyTransforms(world, bodies) {
            return exclusive(() => transforms(world, bodies));
        },
        readStepSnapshot(world) {
            return exclusive(() => {
                worldId(world);
                const state = worldStates.get(world);
                if (!state.available)
                    throw failure('AIR_E_BOX3D_STALE_SNAPSHOT', 'No completed unmodified step snapshot');
                return state.snapshot;
            });
        },
        readContactSnapshot(token) {
            return exclusive(() => snapshotHandle(token).contact);
        },
        contactWorldPoints(token) {
            return exclusive(() => {
                snapshotHandle(token);
                throw failure(
                    'AIR_E_BOX3D_UNSUPPORTED_SNAPSHOT_EPOCH',
                    'Cached native anchor epoch is not proven; world/local point reconstruction is unavailable',
                );
            });
        },
        configureShapeEvents(shape, options) {
            return exclusive(() => {
                const item = handle(shape, 'shape');
                if (
                    !options ||
                    ['sensor', 'contact', 'hit'].some(
                        (name) => options[name] !== undefined && typeof options[name] !== 'boolean',
                    )
                )
                    throw failure('AIR_E_BOX3D_ARGUMENT', 'Event flags must be booleans');
                const flags = (options.sensor ? 1 : 0) | (options.contact ? 2 : 0) | (options.hit ? 4 : 0);
                nativeStatus(module._air_b3_shape_events(shape.low, shape.high, flags));
                changed(item.world);
            });
        },
        createOffsetSphere(body, center, radius, density = 1, sensor = false) {
            return exclusive(() => {
                const item = handle(body, 'body');
                if (typeof sensor !== 'boolean') throw failure('AIR_E_BOX3D_ARGUMENT', 'sensor must be boolean');
                nativeStatus(
                    module._air_b3_shape_sphere_ex(
                        body.low,
                        body.high,
                        ...vector(center, 3, 'center'),
                        finite(radius, 'radius'),
                        finite(density, 'density'),
                        sensor ? 1 : 0,
                        ids,
                    ),
                );
                return copiedId(item.world, 'shape', body);
            });
        },
        rayClosest(world, origin, translation) {
            return exclusive(() => {
                const id = worldId(world);
                module.HEAPF32.set(
                    [...vector(origin, 3, 'origin'), ...vector(translation, 3, 'translation')],
                    input >>> 2,
                );
                nativeStatus(module._air_b3_ray_closest(id, input, output, ids));
                const result = readFloats(8);
                // Query identity is copied data, not an ownership token usable to destroy a shape.
                return {
                    data: result,
                    shape: result[0] ? { low: module.HEAPU32[ids >>> 2], high: module.HEAPU32[(ids >>> 2) + 1] } : null,
                };
            });
        },
        worldCounts(world) {
            return exclusive(() => {
                nativeStatus(module._air_b3_world_counts(worldId(world), output));
                const counts = module.HEAPU32.slice(output >>> 2, (output >>> 2) + 4);
                return { counts, liveBytes: readU64(output + 16) };
            });
        },
        liveBytes() {
            return exclusive(() => {
                module._air_b3_live_bytes(output);
                return readU64(output);
            });
        },
        dispose() {
            if (disposed) return;
            exclusive(() => {
                for (const [world, id] of worlds) {
                    nativeStatus(module._air_b3_world_destroy(id));
                    const state = worldStates.get(world);
                    state.bodies.clear();
                    state.snapshot = null;
                    state.available = false;
                }
                worlds.clear();
                module._free(scratch);
                disposed = true;
            });
        },
    };
    return Object.freeze(api);
}
