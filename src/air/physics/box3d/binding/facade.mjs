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
        expected.abiVersion !== 1 ||
        expected.variant !== 'st-simd' ||
        !/^[a-f0-9]{64}$/.test(expected.schemaSha256) ||
        module._air_b3_abi_version() !== 1 ||
        text(module._air_b3_core_sha()) !== CORE_SHA ||
        text(module._air_b3_schema_sha()) !== expected.schemaSha256 ||
        (typeof SharedArrayBuffer !== 'undefined' && module.HEAPU8.buffer instanceof SharedArrayBuffer)
    )
        throw failure('AIR_E_BOX3D_ABI', 'Core/schema/variant identity mismatch');

    const scratch = module._malloc(512);
    if (!scratch) throw failure('AIR_E_BOX3D_NATIVE', 'Cannot allocate binding scratch');
    const input = scratch;
    const ids = scratch + 128;
    const output = scratch + 160;
    let disposed = false;
    let busy = false;
    const worlds = new Map();
    const handles = new WeakMap();

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
        if (!item || item.kind !== kind || item.destroyed || !worlds.has(item.world)) {
            throw failure('AIR_E_BOX3D_DISPOSED', `${kind} is foreign or disposed`);
        }
        return item;
    }
    function copiedId(world, kind) {
        const heap = module.HEAPU32;
        const value = Object.freeze({ low: heap[ids >>> 2], high: heap[(ids >>> 2) + 1] });
        handles.set(value, { kind, world, destroyed: false });
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
                return world;
            });
        },
        destroyWorld(world) {
            return exclusive(() => {
                const id = worldId(world);
                nativeStatus(module._air_b3_world_destroy(id));
                worlds.delete(world);
            });
        },
        step(world, dt = 1 / 60, substeps = 4) {
            return exclusive(() => {
                if (!Number.isInteger(substeps) || substeps < 1 || substeps > 2147483647) {
                    throw failure('AIR_E_BOX3D_ARGUMENT', 'substeps must be a positive int32');
                }
                nativeStatus(module._air_b3_world_step(worldId(world), finite(dt, 'dt'), substeps));
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
                handle(body, 'body');
                nativeStatus(module._air_b3_body_velocity(body.low, body.high, ...vector(velocity, 3, 'velocity')));
            });
        },
        applyCenterImpulse(body, impulse) {
            return exclusive(() => {
                handle(body, 'body');
                nativeStatus(module._air_b3_body_impulse(body.low, body.high, ...vector(impulse, 3, 'impulse')));
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
                return copiedId(item.world, 'shape');
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
                return copiedId(item.world, 'shape');
            });
        },
        destroyShape(shape) {
            return exclusive(() => {
                const item = handle(shape, 'shape');
                nativeStatus(module._air_b3_shape_destroy(shape.low, shape.high));
                item.destroyed = true;
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
                for (const id of worlds.values()) nativeStatus(module._air_b3_world_destroy(id));
                worlds.clear();
                module._free(scratch);
                disposed = true;
            });
        },
    };
    return Object.freeze(api);
}
