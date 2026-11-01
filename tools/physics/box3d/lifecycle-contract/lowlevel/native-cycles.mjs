// Explicit caller authorization required. No WASM load, physics step, or native call at import time.
import assert from 'node:assert/strict';
import { DEBUG_SPEC, validateDebugSnapshot } from './debug-artifacts.mjs';
import { geometry } from './oracle.mjs';
import { CYCLES, BODIES, ORDERS, stages, copy, validateGlobal } from './contract.mjs';
const disposed = (error) => error?.code === 'AIR_E_BOX3D_DISPOSED';

// One diagnostic-owned 120-byte allocation, separate from the facade's private scratch.
// Native core/bridge counters do not count these generic malloc scratch buffers.
export function createNativeProbe(module) {
    for (const name of [
        '_malloc',
        '_free',
        '_air_b3_live_bytes',
        '_air_b3_bridge_memory',
        '_air_b3_mesh_lifetime_counters',
        '_air_b3_world_valid',
        '_air_b3_body_valid',
        '_air_b3_shape_valid',
        '_air_b3_fixed_state',
        '_air_b3_mesh_state',
    ])
        assert.equal(typeof module[name], 'function', `actual same-module export required: ${name}`);
    const pointer = module._malloc(120);
    assert.ok(pointer > 0 && pointer % 4 === 0, 'diagnostic scratch allocation');
    let freed = false;
    const ownership = { bytes: 120, allocations: 1, frees: 0 };
    const read64 = (at) => {
        const view = module.HEAPU32;
        return String(BigInt(view[at >>> 2]) | (BigInt(view[(at >>> 2) + 1]) << 32n));
    };
    const call = (name, ...args) => {
        assert.equal(freed, false, 'no use of freed diagnostic scratch');
        return module[name](...args, pointer);
    };
    const global = () => {
        call('_air_b3_live_bytes');
        const coreBytes = read64(pointer);
        assert.equal(call('_air_b3_bridge_memory', 0), 0);
        const words = module.HEAPU32.slice(pointer >>> 2, (pointer >>> 2) + 6);
        const bridge = {
            origin: 'module._air_b3_bridge_memory',
            worldArgument: 0,
            liveBytes: String(BigInt(words[0]) | (BigInt(words[1]) << 32n)),
            liveAllocations: words[2],
            shapeHandles: words[3],
            primitiveCapacity: words[4],
            capturedPrimitives: words[5],
        };
        assert.equal(call('_air_b3_mesh_lifetime_counters'), 0);
        return { coreBytes, bridge, meshCounters: { cooks: read64(pointer), destroys: read64(pointer + 8) } };
    };
    const snapshot = (api, current, knownWorlds) => {
        const observation = global();
        // Cross-check facade reads, never use facade.bridgeMemory() without a world.
        assert.equal(String(api.liveBytes()), observation.coreBytes);
        assert.deepEqual(copy(api.meshLifetimeCounters()), observation.meshCounters);
        const { world, bodies, shapes, joint, resource } = current;
        const worldValid = module._air_b3_world_valid(world.id);
        observation.worldValid = worldValid;
        if (worldValid) {
            const worldCounts = api.worldCounts(world);
            observation.nativeWorld = {
                counts: Array.from(worldCounts.counts),
                coreBytes: String(worldCounts.liveBytes),
            };
            observation.scopedBridge = copy(api.bridgeMemory(world));
        } else observation.nativeWorld = null;
        observation.bodyValidity = bodies.map((id) => module._air_b3_body_valid(id.low, id.high));
        observation.shapeValidity = shapes.map((id) => module._air_b3_shape_valid(id.low, id.high));
        observation.knownWorldValidity = knownWorlds.map((id) => module._air_b3_world_valid(id));
        observation.fixedJointStatus = joint
            ? module._air_b3_fixed_state(world.id, joint.low, joint.high, pointer, 30)
            : null;
        observation.mesh = null;
        if (resource) {
            const status = call('_air_b3_mesh_state', world.id, resource.low, resource.high);
            observation.mesh = { status };
            if (status === 0) {
                const words = module.HEAPU32.slice(pointer >>> 2, (pointer >>> 2) + 6);
                Object.assign(observation.mesh, {
                    cacheLeases: words[0],
                    shapeBorrows: words[1],
                    vertexCount: words[2],
                    triangleCount: words[3],
                    coreMeshBytes: words[4],
                    worldId: words[5],
                });
            }
        }
        return observation;
    };
    return {
        global,
        snapshot,
        ownership,
        free() {
            assert.equal(freed, false, 'diagnostic scratch is freed exactly once');
            module._free(pointer);
            freed = true;
            ownership.frees++;
        },
    };
}

function rejectOldTokens(api, prior) {
    let count = 0;
    const reject = (call) => {
        assert.throws(call, disposed);
        count++;
    };
    reject(() => api.worldCounts(prior.world));
    for (const body of prior.bodies) reject(() => api.bodySnapshot(body));
    for (const shape of prior.shapes) reject(() => api.destroyShape(shape));
    reject(() => api.fixedJointState(prior.world, prior.joint));
    reject(() => api.staticMeshState(prior.resource));
    reject(() => api.staticMeshState(prior.extra));
    assert.equal(count, 104);
    return count;
}

export function runNativeCycles({ api, module, probe, baseline, emit, state, retainDebugSnapshot }) {
    assert.equal(typeof retainDebugSnapshot, 'function', 'complete raw debug result preservation required');
    let prior;
    for (let cycle = 0; cycle < CYCLES; cycle++) {
        const order = ORDERS[cycle % ORDERS.length],
            expectations = stages(order);
        let stageIndex = 0;
        const current = { world: null, bodies: [], shapes: [], joint: null, resource: null, extra: null };
        state.current = current;
        emit({ kind: 'cycle-begin', cycle, order });
        const record = (stage, detail = {}) => {
            const spec = expectations[stageIndex++];
            assert.equal(stage, spec.stage, 'execution must follow predeclared release order');
            const observation = probe.snapshot(api, current, state.knownWorlds);
            emit({ kind: 'stage', cycle, order, stage, worldId: current.world.id, observation, ...detail });
            // Persist the raw observation BEFORE asserting, including a failing stage.
            validateGlobal(observation, baseline, stage === 'world-destroyed');
            assert.equal(observation.bridge.shapeHandles, spec.debugHandles);
            assert.equal(observation.bridge.primitiveCapacity, 0);
            assert.equal(observation.bridge.capturedPrimitives, 0);
            assert.equal(
                BigInt(observation.meshCounters.cooks),
                BigInt(baseline.meshCounters.cooks) + BigInt(cycle + spec.cooked),
            );
            assert.equal(
                BigInt(observation.meshCounters.destroys),
                BigInt(baseline.meshCounters.destroys) + BigInt(cycle + spec.destroyed),
            );
            if (stage === 'world-destroyed') {
                assert.equal(observation.worldValid, 0);
                assert.ok(observation.bodyValidity.every((v) => v === 0));
                assert.ok(observation.shapeValidity.every((v) => v === 0));
                assert.ok(observation.knownWorldValidity.every((v) => v === 0));
                assert.equal(observation.fixedJointStatus, 1);
            } else {
                assert.equal(observation.worldValid, 1);
                assert.deepEqual(observation.nativeWorld.counts, [spec.bodies, spec.shapes, 0, spec.joints]);
            }
            if (spec.cooked === 0) assert.equal(observation.mesh, null);
            else if (spec.cache === null) assert.equal(observation.mesh.status, 1);
            else {
                assert.equal(observation.mesh.status, 0);
                assert.equal(observation.mesh.cacheLeases, spec.cache);
                assert.equal(observation.mesh.shapeBorrows, spec.borrows);
                assert.equal(observation.mesh.vertexCount, 9);
                assert.equal(observation.mesh.triangleCount, 8);
            }
        };
        try {
            current.world = api.createWorld([0, 0, 0]);
            state.knownWorlds.push(current.world.id);
            state.createdWorlds++;
            record('world-created');
            if (prior) {
                const rejected = rejectOldTokens(api, prior);
                const rawBodyRevalidation = prior.bodies.map((id) => module._air_b3_body_valid(id.low, id.high));
                emit({
                    kind: 'stale-token-cross-world',
                    cycle,
                    rejected,
                    rawBodyRevalidation,
                    note: 'raw IDs are unscoped; only facade tokens carry world-lifetime ownership',
                });
            }
            const mesh = geometry();
            current.resource = api.cookStaticMesh(
                current.world,
                Float32Array.from(mesh.positions.flat()),
                Uint32Array.from(mesh.indices.flat()),
            );
            record('mesh-cooked');
            current.extra = api.retainStaticMesh(current.resource);
            record('mesh-retained');
            api.releaseStaticMesh(current.extra);
            api.releaseStaticMesh(current.extra);
            record('extra-lease-released');
            for (let i = 0; i < BODIES; i++) {
                current.bodies.push(
                    api.createBody(current.world, {
                        type: i < 3 ? 0 : 2,
                        position: [i * 20, i < 3 ? 0 : 20, 0],
                        enableSleep: false,
                    }),
                );
                state.createdBodies++;
            }
            record('bodies-created');
            for (let i = 0; i < BODIES; i++)
                current.shapes.push(
                    i < 3
                        ? api.createStaticMeshShape(current.bodies[i], current.resource)
                        : api.createSphere(current.bodies[i], 0.5),
                );
            record('shapes-borrowed');
            current.joint = api.createFixedJoint(current.world, current.bodies[3], current.bodies[4], {
                collideConnected: false,
                breakForce: 1000000,
                breakTorque: 1000000,
            });
            const jointState = api.fixedJointState(current.world, current.joint);
            record('joint-created', {
                jointState,
                ids: {
                    bodies: current.bodies,
                    shapes: current.shapes,
                    joint: current.joint,
                    resource: current.resource,
                },
            });
            assert.equal(jointState.kind, 'fixed');
            assert.deepEqual(jointState.bodyA, current.bodies[3]);
            assert.deepEqual(jointState.bodyB, current.bodies[4]);
            // After population, observe possible raw-ID revalidation honestly, while old scoped tokens remain invalid.
            if (prior)
                emit({
                    kind: 'stale-token-populated-world',
                    cycle,
                    rejected: rejectOldTokens(api, prior),
                    rawBodyRevalidation: prior.bodies.map((id) => module._air_b3_body_valid(id.low, id.high)),
                    rawShapeRevalidation: prior.shapes.map((id) => module._air_b3_shape_valid(id.low, id.high)),
                });
            // The API calls real native WIRE_FRAME capture and always releases its copied wire.
            // Lazy debug caches deliberately remain owned by their native shapes until destruction.
            const debugSnapshot = api.debugSnapshot(current.world, DEBUG_SPEC.flags, DEBUG_SPEC.jointScale);
            const debugArtifact = retainDebugSnapshot(cycle, current.world.id, debugSnapshot);
            record('debug-captured', { debugArtifact });
            validateDebugSnapshot(debugSnapshot);
            state.completedDebugSnapshots = (state.completedDebugSnapshots ?? 0) + 1;
            if (order !== 'cache-last') {
                api.releaseStaticMesh(current.resource);
                record('cache-released');
            }
            if (order === 'world-last') {
                api.destroyShape(current.shapes[1]);
                record('first-borrow-released');
                api.destroyBody(current.bodies[2]);
                record('second-borrow-body-destroyed');
            } else {
                api.destroyJoint(current.world, current.joint);
                record('joint-destroyed');
                for (const [n, index] of [1, 2, 0].entries()) {
                    api.destroyShape(current.shapes[index]);
                    record(['first-borrow-released', 'second-borrow-released', 'last-borrow-released'][n]);
                }
                for (let i = 3; i < BODIES; ++i) api.destroyShape(current.shapes[i]);
                record('all-shapes-destroyed');
                for (const body of current.bodies) api.destroyBody(body);
                record('all-bodies-destroyed');
                if (order === 'cache-last') {
                    api.releaseStaticMesh(current.resource);
                    record('cache-released');
                }
            }
            api.destroyWorld(current.world);
            const rejected = rejectOldTokens(api, current);
            // Idempotent cache release is checked after explicit release, not used to hide a live lease.
            api.releaseStaticMesh(current.resource);
            api.releaseStaticMesh(current.extra);
            record('world-destroyed', { disposedTokenRejections: rejected });
            assert.equal(stageIndex, expectations.length);
            state.completedCycles++;
            prior = current;
        } catch (error) {
            // The original failure remains primary even if a diagnostic read also fails.
            try {
                if (current.world)
                    emit({
                        kind: 'partial-failure-probe',
                        cycle,
                        order,
                        observation: probe.snapshot(api, current, state.knownWorlds),
                        ids: current,
                    });
            } catch (diagnosticError) {
                emit({ kind: 'partial-probe-failed', cycle, error: diagnosticError.stack });
            }
            throw error;
        }
    }
}
