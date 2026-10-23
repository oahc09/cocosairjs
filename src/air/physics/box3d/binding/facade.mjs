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
const SCHEMA_SHA256 = '0df007cd748883621f89836b55f1c09437c04d6d7e6253914577b21455a11bd5';
const commandIsArray = Array.isArray;
const commandKeys = Object.keys;
const PATCH_CHAIN_SHA256 = '434fb89494867f515051d5ac0dfc0c694556ba1f0da9ac3fc895a27097b1c7c7';

function failure(code, message) {
    return Object.assign(new Error(message), { code });
}

function nativeStatus(status) {
    if (status === 11) throw failure('AIR_E_BOX3D_CONFIG', 'Motion conflicts with a locked world velocity component');
    if (status === 12) throw failure('AIR_E_BOX3D_CONFIG', 'Motion exceeds the safe native speed cap');
    if (status === 9) throw failure('AIR_E_BOX3D_LOCKED', 'World is locked');
    if (status === 10) throw failure('AIR_E_BOX3D_MASS_PENDING', 'Dynamic enabled body has no effective geometry');
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

function boxExtents(value) {
    const values = vector(value, 3, 'halfExtents');
    // Fixed core b3MakeTransformedBoxHull clamps smaller values. Reject, never silently enlarge geometry.
    if (values.some((v) => Math.fround(v) < Math.fround(0.001)))
        throw failure('AIR_E_BOX3D_ARGUMENT', 'Box half extents must be at least 0.001m for this fixed core');
    return values;
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
    let commandAdmission;
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
    function geometryCounters(world) {
        nativeStatus(module._air_b3_world_geometry_counters(worldId(world), output));
        const values = module.HEAPU32.slice(output >>> 2, (output >>> 2) + 5);
        return Object.fromEntries(
            [
                'awakeContactCount',
                'recycledContactCount',
                'distanceIterations',
                'pushBackIterations',
                'rootIterations',
            ].map((name, i) => [name, values[i]]),
        );
    }
    function readGeometry(world, contact) {
        module.HEAPU32.set(contact.contactId, ids >>> 2);
        const status = module._air_b3_contact_geometry(worldId(world), ids, output, 25);
        if (status === 6 || status === 7)
            return { status: status === 6 ? 'GEOMETRY_UNAVAILABLE' : 'UNSUPPORTED_GEOMETRY_FAMILY' };
        nativeStatus(status);
        const r = reader(module.HEAPU8.slice(output, output + 100));
        if (r.u() !== 1) throw failure('AIR_E_BOX3D_ABI', 'Unknown contact geometry source');
        const geometryRevision = r.id();
        const generatedAfterStep = r.id();
        const generationPoseA = r.floats(10);
        const generationPoseB = r.floats(10);
        r.done();
        const add = (a, b) => a.map((v, i) => v + b[i]);
        const sub = (a, b) => a.map((v, i) => v - b[i]);
        const inverseRotate = (q, v) => {
            const [x, y, z, w] = q;
            const t = [2 * (-y * v[2] + z * v[1]), 2 * (-z * v[0] + x * v[2]), 2 * (-x * v[1] + y * v[0])];
            return [
                v[0] + w * t[0] - y * t[2] + z * t[1],
                v[1] + w * t[1] - z * t[0] + x * t[2],
                v[2] + w * t[2] - x * t[1] + y * t[0],
            ];
        };
        const local = (pose, worldPoint) => inverseRotate(pose.slice(3, 7), sub(worldPoint, pose.slice(0, 3)));
        const state = worldStates.get(world);
        return {
            status: 'AVAILABLE',
            source: 'CACHED_MANIFOLD_GENERATION',
            contactId: [...contact.contactId],
            shapeA: contact.shapeA,
            shapeB: contact.shapeB,
            bodyA: contact.bodyA,
            bodyB: contact.bodyB,
            geometryRevision,
            generatedAfterStep,
            generationPoseA,
            generationPoseB,
            readStepIndex: state.step,
            readMutationRevision: state.revision,
            manifolds: contact.manifolds.map((manifold) => ({
                normalAtoB: [...manifold.normalAtoB],
                normalBtoA: manifold.normalAtoB.map((v) => -v),
                localNormalAtoB_A: inverseRotate(generationPoseA.slice(3, 7), manifold.normalAtoB),
                localNormalAtoB_B: inverseRotate(generationPoseB.slice(3, 7), manifold.normalAtoB),
                points: manifold.points.map((point) => {
                    const worldPointA = add(generationPoseA.slice(7, 10), point.anchorA);
                    const worldPointB = add(generationPoseB.slice(7, 10), point.anchorB);
                    return {
                        worldPointA,
                        worldPointB,
                        localPointA: local(generationPoseA, worldPointA),
                        localPointB: local(generationPoseB, worldPointB),
                    };
                }),
            })),
        };
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
                contact.geometry = readGeometry(world, contact);
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
            geometryCounters: geometryCounters(world),
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
        if (busy) {
            if (commandAdmission) commandAdmission.reentered = true;
            throw failure('AIR_E_BOX3D_REENTRANT', 'Binding scratch is already in use');
        }
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
    function bodyOwner(world, body) {
        const wid = worldId(world);
        const item = handle(body, 'body');
        if (item.world !== world) throw failure('AIR_E_BOX3D_DISPOSED', 'Body belongs to another world');
        return { wid, item, target: item.targetMass ?? 0 };
    }
    function bodyState(world, body) {
        const { wid, item, target } = bodyOwner(world, body);
        nativeStatus(module._air_b3_body_state(wid, body.low, body.high, target, output));
        const p = Array.from(readFloats(49));
        if (!p.every(Number.isFinite)) throw failure('AIR_E_BOX3D_ABI', 'Nonfinite native body state');
        return decodeBodyState(p, item.targetMass ?? null);
    }
    function decodeBodyState(p, requestedMass) {
        return freeze({
            type: p[0],
            enabled: Boolean(p[1]),
            awake: Boolean(p[2]),
            sleeping: Boolean(p[3]),
            sleepy: Boolean(p[4]),
            sleepEnabled: Boolean(p[5]),
            ccd: Boolean(p[6]),
            sleepTime: p[7],
            sleepVelocity: p[8],
            sleepThreshold: p[9],
            linearDamping: p[10],
            angularDamping: p[11],
            gravityScale: p[12],
            linearVelocity: p.slice(13, 16),
            angularVelocity: p.slice(16, 19),
            force: p.slice(19, 22),
            torque: p.slice(22, 25),
            linearFactor: p.slice(25, 28),
            angularFactor: p.slice(28, 31),
            mass: p[31],
            localCenter: p.slice(32, 35),
            inertia: p.slice(35, 44),
            worldCenter: p.slice(44, 47),
            requestedMass,
            massPending: Boolean(p[47]),
            sensorMassFallback: Boolean(p[48]),
        });
    }
    function boolean(value, name) {
        if (typeof value !== 'boolean') throw failure('AIR_E_BOX3D_ARGUMENT', `${name} must be boolean`);
        return value ? 1 : 0;
    }
    let activeMutation;
    function mutate(action) {
        return exclusive(() => {
            const context = { outcome: 'not-mutated' };
            activeMutation = context;
            try {
                return action();
            } catch (error) {
                if (context.outcome !== undefined && error instanceof Error)
                    Object.defineProperty(error, 'mutationOutcome', {
                        value: context.outcome,
                        enumerable: true,
                        writable: false,
                        configurable: false,
                    });
                throw error;
            } finally {
                activeMutation = undefined;
            }
        });
    }
    function mutatingCall(world, action) {
        activeMutation.outcome = undefined;
        let status;
        try {
            status = action();
        } catch (error) {
            // The call may already have mutated native state. Do not advertise an old snapshot as current.
            changed(world);
            throw error;
        }
        activeMutation.outcome = status === 0 ? 'committed' : 'not-mutated';
        nativeStatus(status);
    }
    function filterBits(value, name) {
        if (!Number.isInteger(value) || value < -2147483648 || value > 4294967295)
            throw failure('AIR_E_BOX3D_ARGUMENT', `${name} must be a signed32 or unsigned32 bitset`);
        return value >>> 0;
    }
    function shapeOwner(world, shape) {
        const wid = worldId(world),
            item = handle(shape, 'shape');
        if (item.world !== world) throw failure('AIR_E_BOX3D_DISPOSED', 'Shape belongs to another world');
        return wid;
    }
    function shapeFilters(world, shapes, filter) {
        const wid = worldId(world);
        if (!filter || typeof filter !== 'object') throw failure('AIR_E_BOX3D_ARGUMENT', 'Filter object required');
        const group = filterBits(filter.group, 'group'),
            mask = filterBits(filter.mask, 'mask');
        if (!Array.isArray(shapes)) throw failure('AIR_E_BOX3D_ARGUMENT', 'Shape array required');
        if (shapes.length > 4096) throw failure('AIR_E_BOX3D_CAPACITY', 'At most 4096 shapes per filter transaction');
        const seen = new Set();
        for (const shape of shapes) {
            shapeOwner(world, shape);
            const key = idKey(shape);
            if (seen.has(key)) throw failure('AIR_E_BOX3D_ARGUMENT', 'Duplicate shape in filter transaction');
            seen.add(key);
        }
        if (shapes.length === 0) {
            // Native still validates exact world identity and unlocked state, without mutation.
            nativeStatus(module._air_b3_shape_filters_set(wid, 0, 0, group, mask, 0, 0));
            return freeze([]);
        }
        const bytes = shapes.length * 8;
        return withBuffer(bytes * 2, (ptr) => {
            const words = [];
            for (const shape of shapes) words.push(shape.low, shape.high);
            module.HEAPU32.set(words, ptr >>> 2);
            mutatingCall(world, () =>
                module._air_b3_shape_filters_set(wid, ptr, shapes.length, group, mask, ptr + bytes, shapes.length * 2),
            );
            changed(world);
            // Acquire/copy after native completion. Never return or retain a HEAP view.
            const actual = Array.from(module.HEAPU32.slice((ptr + bytes) >>> 2, (ptr + bytes * 2) >>> 2));
            if (actual.length !== shapes.length * 2)
                throw failure('AIR_E_BOX3D_ABI', 'Truncated native filter readback');
            return freeze(shapes.map((_, i) => ({ group: actual[2 * i], mask: actual[2 * i + 1] })));
        });
    }
    function bodyControl(world, body, op, values) {
        const { wid, target } = bodyOwner(world, body);
        module.HEAPF32.set(
            values.map((v) => finite(v, 'body control')),
            input >>> 2,
        );
        mutatingCall(world, () => module._air_b3_body_control(wid, body.low, body.high, op, input, target));
        changed(world);
        return bodyState(world, body);
    }
    function motionPose(pose) {
        if (!pose || typeof pose !== 'object') throw failure('AIR_E_BOX3D_ARGUMENT', 'Origin pose required');
        const position = vector(pose.position, 3, 'pose.position').map(Math.fround);
        if (!pose.rotation || pose.rotation.length !== 4)
            throw failure('AIR_E_BOX3D_ARGUMENT', 'pose.rotation needs four components');
        const q = Array.from(pose.rotation);
        if (q.some((v) => typeof v !== 'number' || !Number.isFinite(v)))
            throw failure('AIR_E_BOX3D_ARGUMENT', 'Quaternion must be finite');
        const scale = Math.max(...q.map(Math.abs));
        if (scale === 0) throw failure('AIR_E_BOX3D_ARGUMENT', 'Quaternion must be nonzero');
        const scaled = q.map((v) => v / scale),
            norm = Math.hypot(...scaled);
        const rotation = scaled.map((v) => Math.fround(v / norm));
        return { position, rotation };
    }
    function motionBatch(world, records, dt, substeps, apply) {
        const wid = worldId(world),
            state = worldStates.get(world);
        if (!Array.isArray(records)) throw failure('AIR_E_BOX3D_ARGUMENT', 'Motion record array required');
        if (records.length > 4096) throw failure('AIR_E_BOX3D_CAPACITY', 'At most 4096 bodies per motion batch');
        const delta = Math.fround(finite(dt, 'motion.dt'));
        if (delta <= 0 || ![1, 2, 4, 8].includes(substeps))
            throw failure('AIR_E_BOX3D_ARGUMENT', 'Positive float32 dt and AIR substeps 1, 2, 4 or 8 required');
        if (
            apply &&
            records.length &&
            (!Number.isSafeInteger(state.revision) || state.revision >= Number.MAX_SAFE_INTEGER)
        )
            throw failure('AIR_E_BOX3D_CAPACITY', 'Mutation revision exhausted before motion invocation');
        const seen = new Set();
        const prepared = records.map((record) => {
            if (!record || typeof record !== 'object') throw failure('AIR_E_BOX3D_ARGUMENT', 'Motion record required');
            const body = record.body;
            bodyOwner(world, body);
            if (seen.has(idKey(body))) throw failure('AIR_E_BOX3D_ARGUMENT', 'Duplicate body in motion batch');
            seen.add(idKey(body));
            let flags = 0,
                intent = 0,
                reset = null,
                target = null;
            if (record.reset !== undefined) {
                if (!record.reset || typeof record.reset !== 'object')
                    throw failure('AIR_E_BOX3D_ARGUMENT', 'Reset required');
                const { mode = 'teleport', preserveVelocity = false, wake = true } = record.reset;
                if (mode !== 'teleport' && mode !== 'scene')
                    throw failure('AIR_E_BOX3D_ARGUMENT', 'Invalid reset mode');
                flags =
                    1 |
                    (boolean(preserveVelocity, 'preserveVelocity') << 1) |
                    (boolean(wake, 'wake') << 2) |
                    (mode === 'scene' ? 8 : 0);
                reset = { pose: motionPose(record.reset.pose), mode, preserveVelocity, wake };
            }
            if (record.intent !== undefined) {
                if (!record.intent || typeof record.intent !== 'object')
                    throw failure('AIR_E_BOX3D_ARGUMENT', 'Intent required');
                if (record.intent.kind === 'target') {
                    intent = 1;
                    target = motionPose(record.intent.pose);
                } else if (record.intent.kind === 'clear') {
                    if (record.intent.pose !== undefined) throw failure('AIR_E_BOX3D_ARGUMENT', 'Clear has no pose');
                    intent = 2;
                } else throw failure('AIR_E_BOX3D_ARGUMENT', 'Invalid motion intent');
            }
            if (!flags && !intent) throw failure('AIR_E_BOX3D_ARGUMENT', 'Empty body motion record');
            // Read-only state admission before any member is applied. No cached plan is trusted at commit.
            bodyState(world, body);
            return { body, flags, intent, reset, target };
        });
        const inputWords = prepared.length * 18,
            outputFloats = prepared.length * 61;
        return withBuffer((inputWords + (apply ? outputFloats : 0)) * 4, (ptr) => {
            const inputArray = new Uint32Array(inputWords),
                floats = new Float32Array(inputArray.buffer);
            for (let i = 0; i < prepared.length; ++i) {
                const r = prepared[i],
                    offset = i * 18;
                inputArray.set([r.body.low, r.body.high, r.flags, r.intent], offset);
                if (r.reset) floats.set([...r.reset.pose.position, ...r.reset.pose.rotation], offset + 4);
                if (r.target) floats.set([...r.target.position, ...r.target.rotation], offset + 11);
            }
            module.HEAPU32.set(inputArray, ptr >>> 2);
            const dst = ptr + inputWords * 4;
            const invoke = () =>
                module._air_b3_motion_batch(
                    wid,
                    ptr,
                    prepared.length,
                    inputWords,
                    delta,
                    substeps,
                    apply ? dst : 0,
                    apply ? outputFloats : 0,
                    apply ? 1 : 0,
                );
            if (!apply || !prepared.length) {
                // Read-only native validation: unknown throw stays unannotated; never invalidate a snapshot.
                activeMutation.outcome = undefined;
                const status = invoke();
                activeMutation.outcome = 'not-mutated';
                nativeStatus(status);
                return apply ? freeze([]) : undefined;
            }
            mutatingCall(world, invoke);
            changed(world);
            const copied = Array.from(module.HEAPF32.slice(dst >>> 2, (dst >>> 2) + outputFloats));
            if (copied.length !== outputFloats || !copied.every(Number.isFinite))
                throw failure('AIR_E_BOX3D_ABI', 'Invalid copied native motion result');
            const poseAt = (p, offset) => ({
                position: p.slice(offset, offset + 3),
                rotation: p.slice(offset + 3, offset + 7),
            });
            return freeze(
                prepared.map((record, i) => {
                    const p = copied.slice(i * 61, (i + 1) * 61),
                        actualState = bodyState(world, record.body);
                    if (
                        p[33] !== actualState.type ||
                        Boolean(p[34]) !== actualState.enabled ||
                        Boolean(p[35]) !== actualState.awake
                    )
                        throw failure('AIR_E_BOX3D_ABI', 'Motion state/readback mismatch');
                    return {
                        body: record.body,
                        requested: {
                            reset: record.reset,
                            intent:
                                record.intent === 1
                                    ? { kind: 'target', pose: record.target }
                                    : record.intent === 2
                                      ? { kind: 'clear' }
                                      : null,
                        },
                        pose: poseAt(p, 0),
                        worldCenter: p.slice(7, 10),
                        state: actualState,
                        applied: { linearVelocity: p.slice(10, 13), angularVelocity: p.slice(13, 16) },
                        plan: {
                            linearVelocity: p.slice(16, 19),
                            angularVelocity: p.slice(19, 22),
                            linearLockResidue: p.slice(22, 25),
                            angularLockResidue: p.slice(25, 28),
                            linearDamping: p[28],
                            angularDamping: p[29],
                            maximumLinearSpeed: p[30],
                            maximumAngularSpeed: p[32] ? null : p[31],
                            allowFastRotation: Boolean(p[32]),
                            fixedDt: delta,
                            solverSubSteps: substeps,
                        },
                        before: {
                            pose: poseAt(p, 45),
                            worldCenter: p.slice(52, 55),
                            linearVelocity: p.slice(55, 58),
                            angularVelocity: p.slice(58, 61),
                        },
                    };
                }),
            );
        });
    }
    function commandStatus(status) {
        const codes = {
            1: 'NATIVE',
            2: 'NATIVE',
            4: 'CAPACITY',
            5: 'NATIVE',
            8: 'UNSUPPORTED',
            9: 'LOCKED',
            10: 'MASS_PENDING',
            11: 'CONFIG',
            12: 'CONFIG',
        };
        if (status === 0) return;
        const code = typeof status === 'number' && Object.hasOwn(codes, status) ? codes[status] : 'ABI';
        const error = failure(`AIR_E_BOX3D_${code}`, `Unified command native status ${status}`);
        Object.defineProperty(error, 'nativeStatus', { value: status, enumerable: true });
        throw error;
    }
    function commandTransaction(action) {
        return mutate(() => {
            commandAdmission = { reentered: false };
            try {
                return action();
            } finally {
                commandAdmission = undefined;
            }
        });
    }
    // Read each caller-owned field/index once. Never invoke its map/iterator or reuse m2's reader.
    function commandVector(value, count, name, normalize = false) {
        if (value === null || value === undefined) throw failure('AIR_E_BOX3D_ARGUMENT', `${name} required`);
        const length = value.length;
        if (length !== count) throw failure('AIR_E_BOX3D_ARGUMENT', `${name} needs ${count} components`);
        const copied = [];
        for (let i = 0; i < count; ++i) {
            const component = value[i];
            if (normalize) {
                if (typeof component !== 'number' || !Number.isFinite(component))
                    throw failure('AIR_E_BOX3D_ARGUMENT', `${name} must be finite`);
                copied.push(component);
            } else copied.push(Math.fround(finite(component, name)));
        }
        if (!normalize) return copied;
        const scale = Math.max(Math.abs(copied[0]), Math.abs(copied[1]), Math.abs(copied[2]), Math.abs(copied[3]));
        if (scale === 0) throw failure('AIR_E_BOX3D_ARGUMENT', 'Quaternion must be nonzero');
        const scaled = copied.map((v) => v / scale),
            norm = Math.hypot(...scaled);
        return scaled.map((v) => Math.fround(v / norm));
    }
    function commandPose(value) {
        if (!value || typeof value !== 'object') throw failure('AIR_E_BOX3D_ARGUMENT', 'Origin pose required');
        const position = value.position,
            rotation = value.rotation;
        return [...commandVector(position, 3, 'pose.position'), ...commandVector(rotation, 4, 'pose.rotation', true)];
    }
    function commandBatch(world, commands, dt, substeps, apply) {
        const wid = worldId(world),
            state = worldStates.get(world);
        if (!commandIsArray(commands)) throw failure('AIR_E_BOX3D_ARGUMENT', 'Command array required');
        const length = commands.length;
        if (!Number.isInteger(length) || length < 0 || length > 16384)
            throw failure('AIR_E_BOX3D_CAPACITY', 'At most 16384 commands');
        const delta = Math.fround(finite(dt, 'command.dt'));
        if (delta <= 0 || ![1, 2, 4, 8].includes(substeps))
            throw failure('AIR_E_BOX3D_ARGUMENT', 'Positive float32 dt and AIR substeps 1, 2, 4 or 8 required');
        if (apply && length && (!Number.isSafeInteger(state.revision) || state.revision >= Number.MAX_SAFE_INTEGER))
            throw failure('AIR_E_BOX3D_CAPACITY', 'Mutation revision exhausted before command invocation');
        const kinds = [
            'force',
            'torque',
            'linearImpulse',
            'angularImpulse',
            'clearForces',
            'clearVelocity',
            'clearState',
            'reset',
            'target',
            'pairedClear',
        ];
        const bodies = [],
            bodyMap = new Map(),
            records = [];
        for (let n = 0; n < length; ++n) {
            const command = commands[n];
            if (!command || typeof command !== 'object') throw failure('AIR_E_BOX3D_ARGUMENT', 'Command required');
            const body = command.body,
                kind = command.kind,
                sequence = command.sequence;
            const owner = bodyOwner(world, body),
                opcode = kinds.indexOf(kind) + 1;
            if (!opcode) throw failure('AIR_E_BOX3D_ARGUMENT', 'Unknown command kind');
            if (!Number.isSafeInteger(sequence) || sequence < 0)
                throw failure('AIR_E_BOX3D_ARGUMENT', 'Command sequence must be a nonnegative safe integer');
            let flags = 0,
                payload = [],
                allowed = ['body', 'kind', 'sequence'];
            if (opcode <= 4) {
                const givenSpace = command.space,
                    givenValue = command.value;
                const space = givenSpace === undefined ? 'world' : givenSpace;
                if (space !== 'world' && space !== 'local')
                    throw failure('AIR_E_BOX3D_ARGUMENT', 'Invalid command space');
                flags = space === 'local' ? 1 : 0;
                payload = commandVector(givenValue, 3, 'command.value');
                allowed.push('value', 'space');
                if (opcode === 1 || opcode === 3) {
                    const offset = command.offset;
                    payload.push(...commandVector(offset === undefined ? [0, 0, 0] : offset, 3, 'command.offset'));
                    allowed.push('offset');
                }
            } else if (opcode === 8 || opcode === 9) {
                const pose = command.pose;
                payload = commandPose(pose);
                allowed.push('pose');
                if (opcode === 8) {
                    const givenMode = command.mode,
                        givenPreserve = command.preserveVelocity,
                        givenWake = command.wake;
                    const mode = givenMode === undefined ? 'teleport' : givenMode;
                    if (mode !== 'teleport' && mode !== 'scene')
                        throw failure('AIR_E_BOX3D_ARGUMENT', 'Invalid reset mode');
                    flags =
                        (boolean(givenPreserve === undefined ? false : givenPreserve, 'preserveVelocity') << 1) |
                        (boolean(givenWake === undefined ? true : givenWake, 'wake') << 2) |
                        (mode === 'scene' ? 8 : 0);
                    allowed.push('mode', 'preserveVelocity', 'wake');
                }
            } else if (opcode === 10) {
                const reason = command.reason;
                if (!['user', 'idle', 'cleanup'].includes(reason))
                    throw failure('AIR_E_BOX3D_ARGUMENT', 'Invalid paired-clear reason');
                flags = reason === 'idle' ? 16 : reason === 'cleanup' ? 32 : 0;
                allowed.push('reason');
            }
            for (const key of commandKeys(command))
                if (!allowed.includes(key)) throw failure('AIR_E_BOX3D_ARGUMENT', `Unused command field ${key}`);
            let index = bodyMap.get(body);
            if (index === undefined) {
                if (bodies.length === 4096) throw failure('AIR_E_BOX3D_CAPACITY', 'At most 4096 command bodies');
                index = bodies.length;
                bodyMap.set(body, index);
                bodies.push({ body, target: owner.target, count: 0, lastSequence: 0 });
            }
            bodies[index].count++;
            bodies[index].lastSequence = sequence;
            records.push({ body, index, kind, opcode, flags, sequence, payload });
        }
        if (commandAdmission.reentered) throw failure('AIR_E_BOX3D_REENTRANT', 'Reentry during command input copy');
        const inputWords = 12 + 4 * bodies.length + 16 * records.length;
        const outputWords = apply && records.length ? 12 + 160 * bodies.length + 80 * records.length : 0;
        return withBuffer((inputWords + outputWords) * 4, (ptr) => {
            const wire = new Uint32Array(inputWords),
                floats = new Float32Array(wire.buffer);
            wire.set([
                0x314d4355,
                1,
                inputWords,
                bodies.length,
                records.length,
                4,
                16,
                12,
                12 + 4 * bodies.length,
                0,
                substeps,
                0,
            ]);
            floats[9] = delta;
            bodies.forEach((entry, i) => {
                const at = 12 + 4 * i;
                wire[at] = entry.body.low;
                wire[at + 1] = entry.body.high;
                floats[at + 2] = entry.target;
            });
            records.forEach((entry, i) => {
                const at = 12 + 4 * bodies.length + 16 * i;
                wire.set(
                    [
                        entry.index,
                        entry.opcode,
                        entry.flags,
                        entry.sequence >>> 0,
                        Math.floor(entry.sequence / 4294967296),
                    ],
                    at,
                );
                floats.set(entry.payload, at + 5);
            });
            module.HEAPU32.set(wire, ptr >>> 2);
            const dst = outputWords ? ptr + inputWords * 4 : 0,
                writing = apply && records.length !== 0;
            if (commandAdmission.reentered) throw failure('AIR_E_BOX3D_REENTRANT', 'Reentry during command allocation');
            commandAdmission = undefined;
            activeMutation.outcome = undefined;
            let status;
            try {
                status = module._air_b3_command_batch(wid, ptr, inputWords, dst, outputWords, apply ? 1 : 0);
            } catch (error) {
                if (writing) changed(world);
                throw error;
            }
            const knownFailure = [1, 2, 4, 5, 8, 9, 10, 11, 12].includes(status);
            if (status === 0) {
                activeMutation.outcome = writing ? 'committed' : 'not-mutated';
                if (writing) changed(world);
            } else if (knownFailure) activeMutation.outcome = 'not-mutated';
            else if (writing) changed(world);
            commandStatus(status);
            if (!apply) return;
            if (!writing) return freeze({ bodies: [], operations: [], executedOperationCount: 0 });
            // Refresh views after allocation and native growth, then own every word before parsing.
            const copied = module.HEAPU32.slice(dst >>> 2, (dst >>> 2) + outputWords);
            if (copied.length !== outputWords) throw failure('AIR_E_BOX3D_ABI', 'Truncated command output');
            return decodeCommandResult(copied, bodies, records);
        });
    }
    function decodeCommandResult(words, bodies, records) {
        const floats = new Float32Array(words.buffer, words.byteOffset, words.length);
        const reject = () => {
            throw failure('AIR_E_BOX3D_ABI', 'Invalid copied command result');
        };
        const expected = [
            0x31524355,
            1,
            words.length,
            bodies.length,
            records.length,
            160,
            80,
            12,
            12 + 160 * bodies.length,
            1,
            0,
            0,
        ];
        expected.forEach((value, i) => {
            if (words[i] !== value) reject();
        });
        const take = (at, count) => {
            const value = Array.from(floats.slice(at, at + count));
            if (value.length !== count || !value.every(Number.isFinite)) reject();
            return value;
        };
        const zero = (at, count) => {
            for (let i = at; i < at + count; ++i) if (words[i] !== 0) reject();
        };
        const pose = (at) => {
            const p = take(at, 7),
                q2 = p.slice(3).reduce((sum, x) => sum + x * x, 0);
            if (Math.abs(q2 - 1) > 1e-4) reject();
            return { position: p.slice(0, 3), rotation: p.slice(3) };
        };
        const booleanWord = (at) => {
            if (words[at] !== 0 && words[at] !== 1) reject();
            return words[at] === 1;
        };
        const stateAt = (at, mass) => {
            const p = take(at, 49);
            if (![0, 1, 2].includes(p[0])) reject();
            for (const i of [1, 2, 3, 4, 5, 6, 25, 26, 27, 28, 29, 30, 47, 48]) if (p[i] !== 0 && p[i] !== 1) reject();
            return decodeBodyState(p, mass || null);
        };
        const observation = (at, stateOffset, mass) => {
            const result = { pose: pose(at), worldCenter: take(at + 7, 3), state: stateAt(stateOffset, mass) };
            if (result.worldCenter.some((value, i) => !Object.is(value, result.state.worldCenter[i]))) reject();
            return result;
        };
        const decodedBodies = bodies.map((entry, i) => {
            const at = 12 + i * 160;
            if (
                words[at] !== entry.body.low ||
                words[at + 1] !== entry.body.high ||
                words[at + 2] !== entry.count ||
                words[at + 158] !== entry.lastSequence >>> 0 ||
                words[at + 159] !== Math.floor(entry.lastSequence / 4294967296)
            )
                reject();
            zero(at + 3, 1);
            const fast = booleanWord(at + 157),
                limits = take(at + 153, 4);
            if (
                limits[0] < 0 ||
                limits[1] !== Math.fround(entry.target) ||
                limits[2] <= 0 ||
                (fast ? limits[3] !== 0 : limits[3] <= 0)
            )
                reject();
            return {
                body: entry.body,
                executedOperationCount: entry.count,
                lastSequence: entry.lastSequence,
                before: observation(at + 4, at + 14, entry.target),
                plan: {
                    pose: pose(at + 63),
                    worldCenter: take(at + 70, 3),
                    linearVelocity: take(at + 73, 3),
                    angularVelocity: take(at + 76, 3),
                    force: take(at + 79, 3),
                    torque: take(at + 82, 3),
                    inverseInertiaWorld: take(at + 144, 9),
                    inverseMass: limits[0],
                    requestedMass: limits[1],
                    maximumLinearSpeed: limits[2],
                    maximumAngularSpeed: fast ? null : limits[3],
                    allowFastRotation: fast,
                },
                actual: observation(at + 85, at + 95, entry.target),
            };
        });
        const operations = records.map((entry, i) => {
            const at = 12 + bodies.length * 160 + i * 80;
            [
                entry.index,
                entry.opcode,
                entry.flags,
                entry.sequence >>> 0,
                Math.floor(entry.sequence / 4294967296),
            ].forEach((x, j) => {
                if (words[at + j] !== x) reject();
            });
            const actionBits = words[at + 5];
            const allowedActions =
                entry.opcode <= 2
                    ? [2]
                    : entry.opcode === 3
                      ? [6, 7]
                      : entry.opcode === 4
                        ? [6]
                        : entry.opcode === 8
                          ? [16, 18]
                          : entry.opcode === 9
                            ? [2, 8]
                            : [0];
            if (!allowedActions.includes(actionBits)) reject();
            zero(at + 6, 2);
            zero(at + 62, 2);
            zero(at + 74, 6);
            // Even unused vectors must be canonical zero, not hidden payloads.
            if (entry.opcode > 4) zero(at + 18, 12);
            else if (entry.opcode === 2 || entry.opcode === 4) zero(at + 21, 6);
            if (entry.opcode !== 8 && entry.opcode !== 9) zero(at + 42, 6);
            return {
                body: entry.body,
                kind: entry.kind,
                flags: entry.flags,
                sequence: entry.sequence,
                plannerActionBits: words[at + 5],
                plan: {
                    basisPose: pose(at + 8),
                    basisWorldCenter: take(at + 15, 3),
                    worldVector: take(at + 18, 3),
                    applicationPoint: take(at + 21, 3),
                    actualOffset: take(at + 24, 3),
                    angularEffect: take(at + 27, 3),
                    linearVelocity: take(at + 30, 3),
                    angularVelocity: take(at + 33, 3),
                    force: take(at + 36, 3),
                    torque: take(at + 39, 3),
                    linearLockResidue: take(at + 42, 3),
                    angularLockResidue: take(at + 45, 3),
                },
                actual: {
                    pose: pose(at + 64),
                    worldCenter: take(at + 71, 3),
                    linearVelocity: take(at + 48, 3),
                    angularVelocity: take(at + 51, 3),
                    force: take(at + 54, 3),
                    torque: take(at + 57, 3),
                    awake: booleanWord(at + 60),
                    enabled: booleanWord(at + 61),
                },
            };
        });
        return freeze({ bodies: decodedBodies, operations, executedOperationCount: records.length });
    }
    function bodyApply(world, body, kind, value, offset, space) {
        const { wid, target } = bodyOwner(world, body);
        if (space !== 'world' && space !== 'local') throw failure('AIR_E_BOX3D_ARGUMENT', 'Invalid force space');
        const values = [...vector(value, 3, 'force/impulse'), ...vector(offset, 3, 'COM offset')];
        nativeStatus(module._air_b3_body_mass_ready(wid, body.low, body.high, target));
        module.HEAPF32.set(values, input >>> 2);
        mutatingCall(world, () =>
            module._air_b3_body_apply(wid, body.low, body.high, kind, space === 'local' ? 1 : 0, input),
        );
        changed(world);
        return bodyState(world, body);
    }
    function massShape(body, kind, values, sensor) {
        const item = handle(body, 'body');
        const sensorFlag = boolean(sensor, 'sensor');
        module.HEAPF32.set(
            values.map((v) => finite(v, 'shape')),
            input >>> 2,
        );
        nativeStatus(
            module._air_b3_mass_shape_create(
                worldId(item.world),
                body.low,
                body.high,
                kind,
                input,
                sensorFlag,
                item.targetMass ?? 0,
                ids,
            ),
        );
        const result = copiedId(item.world, 'shape', body);
        bodyState(item.world, body);
        return result;
    }
    const api = {
        identity: Object.freeze({ ...expected }),
        validateCommandBatch(world, commands, dt, substeps) {
            return commandTransaction(() => commandBatch(world, commands, dt, substeps, false));
        },
        applyCommandBatch(world, commands, dt, substeps) {
            return commandTransaction(() => commandBatch(world, commands, dt, substeps, true));
        },
        validateMotionBatch(world, records, dt, substeps) {
            return mutate(() => motionBatch(world, records, dt, substeps, false));
        },
        applyMotionBatch(world, records, dt, substeps) {
            return mutate(() => motionBatch(world, records, dt, substeps, true));
        },
        createWorld(gravity = [0, -10, 0]) {
            return exclusive(() => {
                const g = vector(gravity, 3, 'gravity');
                const id = module._air_b3_world_create(...g) >>> 0;
                if (!id) throw failure('AIR_E_BOX3D_NATIVE', 'World creation failed');
                const world = Object.freeze({ id });
                worlds.set(world, id);
                worldStates.set(world, {
                    step: 0,
                    completed: false,
                    revision: 0,
                    available: false,
                    snapshot: null,
                    bodies: new Set(),
                });
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
                const value = Math.fround(finite(dt, 'dt'));
                if (value <= 0) throw failure('AIR_E_BOX3D_ARGUMENT', 'dt must be positive');
                const wid = worldId(world);
                const state = worldStates.get(world);
                if (!Number.isSafeInteger(state.step) || state.step >= Number.MAX_SAFE_INTEGER)
                    throw failure('AIR_E_BOX3D_CAPACITY', 'Native step index exhausted before invocation');
                const bodies = [...state.bodies];
                for (const body of bodies) {
                    const target = handles.get(body).targetMass ?? 0;
                    const status = module._air_b3_body_mass_ready(wid, body.low, body.high, target);
                    if (status === 10)
                        throw failure('AIR_E_BOX3D_MASS_PENDING', `Body ${idKey(body)} has no effective geometry`);
                    nativeStatus(status);
                }
                const beforeRows = poseRows(bodies, transforms(world, bodies));
                state.completed = false;
                state.available = false;
                nativeStatus(module._air_b3_world_step(wid, value, substeps));
                ++state.step;
                state.completed = true;
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
        stepDiagnostics(world) {
            return exclusive(() => {
                worldId(world);
                const state = worldStates.get(world);
                return freeze({
                    nativeStepIndex: state.step,
                    nativeCompleted: state.completed,
                    snapshotAvailable: state.available,
                });
            });
        },
        setGravity(world, gravity) {
            return exclusive(() => {
                const wid = worldId(world);
                if (!Array.isArray(gravity))
                    throw failure('AIR_E_BOX3D_ARGUMENT', 'gravity must be a three-component array');
                nativeStatus(module._air_b3_world_gravity_set(wid, ...vector(gravity, 3, 'gravity')));
                changed(world);
            });
        },
        getGravity(world) {
            return exclusive(() => {
                nativeStatus(module._air_b3_world_gravity_get(worldId(world), output));
                return freeze(Array.from(readFloats(3)));
            });
        },
        setSleepingEnabled(world, enabled) {
            return exclusive(() => {
                const wid = worldId(world);
                if (typeof enabled !== 'boolean') throw failure('AIR_E_BOX3D_ARGUMENT', 'enabled must be boolean');
                nativeStatus(module._air_b3_world_sleep_set(wid, enabled ? 1 : 0));
                changed(world);
            });
        },
        isSleepingEnabled(world) {
            return exclusive(() => {
                nativeStatus(module._air_b3_world_sleep_get(worldId(world), output));
                return Boolean(module.HEAPU32[output >>> 2]);
            });
        },
        getShapeFilter(world, shape) {
            return exclusive(() => {
                const wid = shapeOwner(world, shape);
                nativeStatus(module._air_b3_shape_filter_get(wid, shape.low, shape.high, output));
                const actual = module.HEAPU32.slice(output >>> 2, (output >>> 2) + 2);
                return freeze({ group: actual[0], mask: actual[1] });
            });
        },
        setShapeFilter(world, shape, filter) {
            return mutate(() => shapeFilters(world, [shape], filter)[0]);
        },
        setShapeFilters(world, shapes, filter) {
            return mutate(() => shapeFilters(world, shapes, filter));
        },
        getShapeMaterial(world, shape) {
            return exclusive(() => {
                const wid = worldId(world);
                if (handle(shape, 'shape').world !== world)
                    throw failure('AIR_E_BOX3D_DISPOSED', 'Shape belongs to another world');
                nativeStatus(module._air_b3_shape_material_get(wid, shape.low, shape.high, output));
                const values = readFloats(2);
                return freeze({ friction: values[0], restitution: values[1] });
            });
        },
        setShapeMaterial(world, shape, material) {
            return exclusive(() => {
                const wid = worldId(world);
                if (handle(shape, 'shape').world !== world)
                    throw failure('AIR_E_BOX3D_DISPOSED', 'Shape belongs to another world');
                if (!material || Object.keys(material).some((key) => !['friction', 'restitution'].includes(key)))
                    throw failure('AIR_E_BOX3D_ARGUMENT', 'Only friction and restitution are supported');
                const friction = finite(material.friction, 'friction');
                const restitution = finite(material.restitution, 'restitution');
                if (friction < 0 || restitution < 0)
                    throw failure('AIR_E_BOX3D_ARGUMENT', 'Material values must be nonnegative');
                nativeStatus(module._air_b3_shape_material_set(wid, shape.low, shape.high, friction, restitution));
                changed(world);
            });
        },
        debugSnapshot(world, flags, jointScale) {
            return exclusive(() => {
                const wid = worldId(world);
                if (!Number.isInteger(flags) || flags < 0 || flags > 5 || flags & ~5)
                    throw failure(
                        'AIR_E_BOX3D_UNSUPPORTED',
                        'Only WIRE_FRAME=1 and AABB=4 are qualified; constraints are unsupported',
                    );
                const scale = Math.fround(finite(jointScale, 'jointScale'));
                if (jointScale < 0) throw failure('AIR_E_BOX3D_ARGUMENT', 'jointScale must be nonnegative');
                try {
                    nativeStatus(module._air_b3_world_debug_capture(wid, flags, scale, output));
                    const words = module.HEAPU32[output >>> 2];
                    return withBuffer(words * 4, (ptr) => {
                        nativeStatus(module._air_b3_world_debug_copy(wid, ptr, words));
                        const r = reader(module.HEAPU8.slice(ptr, ptr + words * 4));
                        const count = r.u();
                        const primitives = Array.from({ length: count }, () => {
                            const kind = r.u(),
                                color = r.u(),
                                a = r.floats(3),
                                b = r.floats(3);
                            if (![...a, ...b].every(Number.isFinite))
                                throw failure('AIR_E_BOX3D_ABI', 'Nonfinite debug geometry');
                            if (kind === 1) return { kind: 'line', from: a, to: b, color };
                            if (kind === 2 && a.every((value, i) => value <= b[i]))
                                return { kind: 'bounds', lower: a, upper: b, color };
                            throw failure('AIR_E_BOX3D_ABI', 'Invalid debug primitive');
                        });
                        r.done();
                        return freeze({ primitives, flags, jointScale: scale, supportedFlags: 5 });
                    });
                } finally {
                    const status = module._air_b3_world_debug_release(wid);
                    if (status !== 0)
                        throw failure('AIR_E_BOX3D_CLEANUP', `Debug buffer cleanup failed with status ${status}`);
                }
            });
        },
        bridgeMemory(world) {
            return exclusive(() => {
                const ids = world === undefined ? [...worlds.values()] : [worldId(world)];
                const result = {
                    liveBytes: 0n,
                    liveAllocations: 0,
                    shapeHandles: 0,
                    primitiveCapacity: 0,
                    capturedPrimitives: 0,
                };
                for (const id of ids) {
                    nativeStatus(module._air_b3_bridge_memory(id, output));
                    result.liveBytes += readU64(output);
                    const counts = module.HEAPU32.slice((output >>> 2) + 2, (output >>> 2) + 6);
                    result.liveAllocations += counts[0];
                    result.shapeHandles += counts[1];
                    result.primitiveCapacity += counts[2];
                    result.capturedPrimitives += counts[3];
                }
                return freeze(result);
            });
        },
        createBody(world, options = {}) {
            return exclusive(() => {
                const id = worldId(world);
                if (!options || typeof options !== 'object')
                    throw failure('AIR_E_BOX3D_ARGUMENT', 'Body options must be an object');
                if (options.enableSleep !== undefined) boolean(options.enableSleep, 'enableSleep');
                const type = options.type === undefined ? 2 : options.type;
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
        bodyState(world, body) {
            return exclusive(() => bodyState(world, body));
        },
        setBodyType(world, body, type) {
            return mutate(() => {
                if (![0, 1, 2].includes(type)) throw failure('AIR_E_BOX3D_ARGUMENT', 'Invalid body type');
                return bodyControl(world, body, 1, [type]);
            });
        },
        setBodyEnabled(world, body, enabled) {
            return mutate(() => bodyControl(world, body, 2, [boolean(enabled, 'enabled')]));
        },
        setBodyMass(world, body, mass) {
            return mutate(() => {
                const { wid, item } = bodyOwner(world, body);
                const value = Math.fround(finite(mass, 'mass'));
                if (value <= 0) throw failure('AIR_E_BOX3D_ARGUMENT', 'Mass must be positive after float32 conversion');
                mutatingCall(world, () => module._air_b3_body_mass_set(wid, body.low, body.high, value));
                item.targetMass = value;
                changed(world);
                return bodyState(world, body);
            });
        },
        setBodyDamping(world, body, linear, angular) {
            return mutate(() => {
                finite(linear, 'linear damping');
                finite(angular, 'angular damping');
                if (linear < 0 || linear > 1 || angular < 0 || angular > 1)
                    throw failure('AIR_E_BOX3D_ARGUMENT', 'Damping range is [0,1]');
                return bodyControl(world, body, 3, [linear, angular]);
            });
        },
        setBodyGravityScale(world, body, scale) {
            return mutate(() => bodyControl(world, body, 4, [scale]));
        },
        setBodySleepEnabled(world, body, enabled) {
            return mutate(() => bodyControl(world, body, 5, [boolean(enabled, 'sleep enabled')]));
        },
        setBodySleepThreshold(world, body, threshold) {
            return mutate(() => {
                finite(threshold, 'sleep threshold');
                if (threshold < 0) throw failure('AIR_E_BOX3D_ARGUMENT', 'Sleep threshold must be nonnegative');
                return bodyControl(world, body, 6, [threshold]);
            });
        },
        setBodyAwake(world, body, awake) {
            return mutate(() => bodyControl(world, body, 7, [boolean(awake, 'awake')]));
        },
        setBodyCCD(world, body, enabled) {
            return mutate(() => bodyControl(world, body, 8, [boolean(enabled, 'CCD')]));
        },
        setBodyMotionFactors(world, body, linear, angular) {
            return mutate(() => {
                const values = [...vector(linear, 3, 'linear factor'), ...vector(angular, 3, 'angular factor')];
                if (values.some((v) => v !== 0 && v !== 1))
                    throw failure('AIR_E_BOX3D_ARGUMENT', 'Motion factors must be 0/1');
                return bodyControl(world, body, 9, values);
            });
        },
        setBodyLinearVelocity(world, body, value) {
            return mutate(() => bodyControl(world, body, 10, vector(value, 3, 'linear velocity')));
        },
        setBodyAngularVelocity(world, body, value) {
            return mutate(() => bodyControl(world, body, 11, vector(value, 3, 'angular velocity')));
        },
        clearBodyForces(world, body) {
            return mutate(() => bodyControl(world, body, 12, []));
        },
        clearBodyVelocity(world, body) {
            return mutate(() => bodyControl(world, body, 13, []));
        },
        clearBodyState(world, body) {
            return mutate(() => bodyControl(world, body, 14, []));
        },
        applyBodyForce(world, body, value, offset = [0, 0, 0], space = 'world') {
            return mutate(() => bodyApply(world, body, 0, value, offset, space));
        },
        applyBodyImpulse(world, body, value, offset = [0, 0, 0], space = 'world') {
            return mutate(() => bodyApply(world, body, 1, value, offset, space));
        },
        applyBodyTorque(world, body, value, space = 'world') {
            return mutate(() => bodyApply(world, body, 2, value, [0, 0, 0], space));
        },
        applyBodyAngularImpulse(world, body, value, space = 'world') {
            return mutate(() => bodyApply(world, body, 3, value, [0, 0, 0], space));
        },
        createOffsetBox(body, center, halfExtents, rotation = [0, 0, 0, 1], density = 1, sensor = false) {
            return exclusive(() =>
                massShape(
                    body,
                    1,
                    [
                        ...vector(center, 3, 'center'),
                        ...boxExtents(halfExtents),
                        ...vector(rotation, 4, 'rotation'),
                        density,
                    ],
                    sensor,
                ),
            );
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
            return mutate(() => {
                const item = handle(body, 'body');
                bodyControl(item.world, body, 10, vector(velocity, 3, 'velocity'));
            });
        },
        applyCenterImpulse(body, impulse) {
            return mutate(() => {
                const item = handle(body, 'body');
                bodyApply(item.world, body, 1, impulse, [0, 0, 0], 'world');
            });
        },
        createSphere(body, radius, density = 1) {
            return exclusive(() => {
                const item = handle(body, 'body');
                if (item.targetMass !== undefined) return massShape(body, 0, [0, 0, 0, radius, density], false);
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
                if (item.targetMass !== undefined)
                    return massShape(body, 1, [0, 0, 0, ...boxExtents(halfExtents), 0, 0, 0, 1, density], false);
                nativeStatus(
                    module._air_b3_shape_box(
                        body.low,
                        body.high,
                        ...boxExtents(halfExtents),
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
                const target = handles.get(item.body).targetMass;
                if (target === undefined) nativeStatus(module._air_b3_shape_destroy(shape.low, shape.high));
                else
                    nativeStatus(
                        module._air_b3_mass_shape_destroy(
                            worldId(item.world),
                            item.body.low,
                            item.body.high,
                            shape.low,
                            shape.high,
                            target,
                        ),
                    );
                item.destroyed = true;
                changed(item.world);
                bodyState(item.world, item.body);
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
                const geometry = snapshotHandle(token).contact.geometry;
                if (geometry.status !== 'AVAILABLE')
                    throw failure(
                        geometry.status === 'UNSUPPORTED_GEOMETRY_FAMILY'
                            ? 'AIR_E_BOX3D_UNSUPPORTED_GEOMETRY'
                            : 'AIR_E_BOX3D_UNSUPPORTED_SNAPSHOT_EPOCH',
                        `Generation geometry unavailable: ${geometry.status}`,
                    );
                return geometry;
            });
        },
        geometryCounters(world) {
            return exclusive(() => freeze(geometryCounters(world)));
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
                if (item.targetMass !== undefined)
                    return massShape(body, 0, [...vector(center, 3, 'center'), radius, density], sensor);
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
        rayAllRaw(world, origin, translation, options) {
            return exclusive(() => {
                const id = worldId(world);
                const start = vector(origin, 3, 'origin');
                const delta = vector(translation, 3, 'translation').map(Math.fround);
                if (!options || typeof options !== 'object')
                    throw failure('AIR_E_BOX3D_ARGUMENT', 'Query options are required');
                const group = filterBits(options.group, 'group');
                const mask = filterBits(options.mask, 'mask');
                const queryTrigger = boolean(options.queryTrigger, 'queryTrigger');
                for (let i = 0; i < 3; ++i) finite(Math.fround(start[i]) + delta[i], 'ray endpoint');
                // A zero segment is not an overlap query. Do not call native.
                if (delta.every((value) => value === 0) || group === 0 || mask === 0) return Object.freeze([]);
                module.HEAPF32.set([...start, ...delta], input >>> 2);
                nativeStatus(module._air_b3_ray_query(id, input, group, mask, queryTrigger, 0, 0, output));
                const count = module.HEAPU32[output >>> 2];
                if (!count) return Object.freeze([]);
                const words = count * 11;
                return withBuffer(words * 4, (ptr) => {
                    nativeStatus(module._air_b3_ray_query(id, input, group, mask, queryTrigger, ptr, words, output));
                    if (module.HEAPU32[output >>> 2] !== count)
                        throw failure('AIR_E_BOX3D_ABI', 'Query count changed during a synchronous read');
                    // Copy before decoding. These full IDs are observations, never ownership capabilities.
                    const data = module.HEAPU32.slice(ptr >>> 2, (ptr >>> 2) + words);
                    const floats = new Float32Array(data.buffer);
                    return freeze(
                        Array.from({ length: count }, (_, index) => {
                            const at = index * 11;
                            return {
                                shape: { low: data[at], high: data[at + 1] },
                                point: Array.from(floats.slice(at + 2, at + 5)),
                                normal: Array.from(floats.slice(at + 5, at + 8)),
                                fraction: floats[at + 8],
                                triangleIndex: data[at + 9] | 0,
                                childIndex: data[at + 10] | 0,
                            };
                        }),
                    );
                });
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
