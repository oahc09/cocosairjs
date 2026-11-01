/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* CPU ONLY: execute actual TypeScript using Node's built-in transform, with explicit
 * engine/native mocks. Private-state fault injection exists only in this VM test;
 * it does not alter production source or prove native allocation/event behavior. */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
const root =
    process.env.BOX3D_INTEGRATION_SOURCE_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const reference = process.env.BOX3D_RELEASE_REFERENCE_ROOT ?? root;
const plain = (v) => JSON.parse(JSON.stringify(v));
function load(relative, names, globals = {}, injection) {
    const candidate = path.join(root, relative);
    let source = fs.readFileSync(fs.existsSync(candidate) ? candidate : path.join(reference, relative), 'utf8');
    if (injection) source = injection(source);
    const js = stripTypeScriptTypes(source, { mode: 'transform', sourceUrl: relative })
        .replace(/^import[\s\S]*?;\s*$/gm, '')
        .replace(/^export /gm, '');
    return vm.runInNewContext(
        `${js}\n;({${names.join(',')}})`,
        { console, setTimeout, clearTimeout, ...globals },
        { filename: relative },
    );
}
const bindingSource = load('src/air/physics/box3d/world-binding.ts', [
    'worldError',
    'mutationNotApplied',
    'requireWorldBinding',
    'copyStepDiagnostics',
    'copyVector',
    'finiteFloat32',
]);
const safeErrors = load('src/air/safe-error.ts', ['safeErrorString', 'safeErrorField']);
const { createAirPhysicsPreparation } = load(
    'src/air/physics/preparation.ts',
    ['createAirPhysicsPreparation'],
    safeErrors,
);
const error = (code) => Object.assign(new Error(code), { code });
function preparation() {
    const p = createAirPhysicsPreparation();
    p.own('box3d', 'module', () => {});
    p.own('box3d', 'world', () => {}, { dependsOn: ['module'] });
    return p;
}
test('single hook requires actual world ownership, prepared state, valid result and terminal invalidation', async () => {
    const empty = createAirPhysicsPreparation();
    assert.throws(
        () => empty.installSceneReleaseHook(() => ({ backend: 'box3d', status: 'RESTORED' })),
        /live acquired/,
    );
    const p = preparation();
    let calls = 0;
    const off = p.installSceneReleaseHook(() => {
        calls++;
        return { backend: 'box3d', status: 'RESTORED' };
    });
    assert.throws(() => p.installSceneReleaseHook(() => {}), /live acquired/);
    assert.throws(() => p.releaseScene(), /prepared/);
    p.prepared();
    assert.equal(p.releaseScene().status, 'RESTORED');
    assert.equal(calls, 1);
    off();
    assert.equal(p.releaseScene(), undefined);
    p.installSceneReleaseHook(() => {
        assert.throws(() => p.releaseScene(), /reentrant/);
        return { backend: 'box3d', status: 'SKIPPED_NONEMPTY' };
    });
    assert.equal(p.releaseScene().status, 'SKIPPED_NONEMPTY');
    await p.dispose();
    assert.throws(() => p.releaseScene(), /closed/);
});
test('hook error is not substituted, and malformed hook result cannot become success', () => {
    const p = preparation(),
        first = error('primary');
    p.installSceneReleaseHook(() => {
        throw first;
    });
    p.prepared();
    assert.throws(
        () => p.releaseScene(),
        (e) => e === first,
    );
    const q = preparation();
    q.installSceneReleaseHook(() => ({ backend: 'box3d', status: 'PASS' }));
    q.prepared();
    assert.throws(() => q.releaseScene(), /Invalid/);
});
function ownerHarness(options = {}) {
    const queue = { phase: 'paused', preparedControl: false, pending: [], provisionalCount: 0, quarantined: null };
    const producers = { closed: false, preparedControl: false, collecting: false };
    class PhysicsSystem {}
    class Node {
        destroy() {}
    }
    class Component {
        destroy() {}
    }
    class Collider extends Component {}
    class RigidBody extends Component {}
    class PhysicsMaterial {}
    const materialRegistrations = [];
    const registerPhysicsMaterialDelegate = (target, delegate, cleanup, mode, reader) => {
        // Explicit CPU registration adapter, not a native or full framework simulation.
        assert.equal(mode, 'legacy');
        assert.equal(typeof reader, 'function');
        for (const name of [
            'open',
            'protectCandidate',
            'preflightCopied',
            'applyCopied',
            'commitActual',
            'fail',
            'dispose',
        ])
            assert.equal(typeof delegate[name], 'function');
        assert.equal(cleanup.generation, 1);
        const record = { target, active: true, disposeCalls: 0 };
        const lease = Object.freeze({
            dispose() {
                assert.equal(this, lease);
                if (!record.active) return;
                record.active = false;
                record.disposeCalls++;
            },
        });
        record.lease = lease;
        materialRegistrations.push(record);
        return lease;
    };
    const world = {},
        system = new PhysicsSystem();
    PhysicsSystem.instance = system;
    system.physicsWorld = world;
    const keys = [
        'phase',
        'commandPhase',
        'scope',
        'destroyAdmission',
        'publicQueryContext',
        'publicQueryReading',
        'jointActivity',
        'materialContext',
        'valuesContext',
        'valuesScope',
        'initialProducerControl',
        'clockReentry',
    ];
    const sets = [
        'activityCleanups',
        'materialCleanups',
        'controlCleanups',
        'activityLeases',
        'materialLeases',
        'bodies',
        'components',
    ];
    const inject = (source) => {
        const s = options.legacyMaterialGuard
            ? source.replace('!this.#hasOnlyWorldMaterialObservation()', 'this.#materialLeases.size')
            : source;
        return s.replace(
            'export class Box3DWorldCommandOwner {',
            `export class Box3DWorldCommandOwner {\n__inject(key, value) { switch(key) { ${keys.map((k) => `case '${k}': this.#${k}=value; break;`).join('')} ${sets.map((k) => `case '${k}': this.#${k}.${k.endsWith('Cleanups') ? 'add(value)' : 'set(value,value)'}; break;`).join('')} case 'cleanupFailures': this.#cleanupFailures.push(value); break; case 'targets': this.#targets.set(value,value); break; case 'replace-system-material': this.#materialLeases.set(this.#system,value); break; case 'remove-system-material': this.#materialLeases.delete(this.#system); break; default: throw Error('test injection key'); } }`,
        );
    };
    const { Box3DWorldCommandOwner } = load(
        'src/air/physics/box3d/world-command-owner.ts',
        ['Box3DWorldCommandOwner'],
        {
            ...bindingSource,
            Node,
            Component,
            PhysicsSystem,
            Collider,
            RigidBody,
            PhysicsMaterial,
            registerPhysicsMaterialDelegate,
            nextPhysicsMaterialCleanupGeneration: () => 1,
            readPhysicsMaterialPrivateValues: () => {
                throw Error('No material value/native read in this CPU test');
            },
            getMaterialSource: () => undefined,
            Box3DCommandQueue: class {
                diagnostics() {
                    return queue;
                }
                registerBody() {}
                releaseBodyAfterTeardown() {}
                close() {
                    queue.phase = 'closed';
                }
            },
            Box3DCommandProducers: class {
                diagnostics() {
                    return producers;
                }
                close() {
                    producers.closed = true;
                }
            },
        },
        inject,
    );
    return {
        owner: new Box3DWorldCommandOwner(1, system, world),
        queue,
        producers,
        system,
        world,
        Node,
        Collider,
        materialRegistrations,
    };
}
test('actual owner guard accepts idle paused/ready queue, not stepping admission', () => {
    const f = ownerHarness();
    f.owner.assertSceneReleaseBoundary(true);
    f.queue.phase = 'ready';
    f.owner.assertSceneReleaseBoundary(true);
    f.system.physicsWorld = {};
    assert.throws(() => f.owner.assertSceneReleaseBoundary(true), /current owner/);
});
for (const phase of ['dispatch', 'solving', 'writeback', 'material', 'control', 'faulted', 'closed'])
    test(`actual owner refuses phase ${phase}`, () => {
        const f = ownerHarness();
        f.owner.__inject('phase', phase);
        assert.throws(() => f.owner.assertSceneReleaseBoundary(false));
    });
for (const key of [
    'scope',
    'destroyAdmission',
    'publicQueryContext',
    'publicQueryReading',
    'jointActivity',
    'materialContext',
    'valuesContext',
    'valuesScope',
    'initialProducerControl',
    'clockReentry',
    'activityCleanups',
    'materialCleanups',
    'controlCleanups',
    'cleanupFailures',
])
    test(`actual owner refuses unresolved ${key}`, () => {
        const f = ownerHarness();
        f.owner.__inject(key, {});
        assert.throws(() => f.owner.assertSceneReleaseBoundary(true), /no event acknowledgement/);
    });
for (const [key, value] of [
    ['phase', 'validating'],
    ['preparedControl', true],
    ['pending', [{}]],
    ['provisionalCount', 1],
    ['quarantined', {}],
])
    test(`queue ${key} prevents ACK`, () => {
        const f = ownerHarness();
        f.queue[key] = value;
        assert.throws(() => f.owner.assertSceneReleaseBoundary(true));
    });
for (const key of ['preparedControl', 'collecting', 'closed'])
    test(`producer ${key} prevents ACK`, () => {
        const f = ownerHarness();
        f.producers[key] = true;
        assert.throws(() => f.owner.assertSceneReleaseBoundary(true));
    });
for (const key of ['bodies', 'components', 'activityLeases', 'materialLeases', 'targets'])
    test(`empty native state cannot hide retained ${key}`, () => {
        const f = ownerHarness();
        f.owner.__inject(key, {});
        f.owner.assertSceneReleaseBoundary(false);
        assert.throws(() => f.owner.assertSceneReleaseBoundary(true), /retained owner/);
    });
function worldHarness(options = {}) {
    const calls = [],
        state = { nativeStepIndex: 0, nativeCompleted: false, snapshotAvailable: false };
    let hook, owner;
    class Owner {
        constructor() {
            owner = this;
        }
        assertConfiguration() {}
        assertCommittedRead() {}
        assertSteppingAllowed() {}
        assertNativeClockFrame() {}
        installMaterialObservation() {}
        installSystemControlObservation() {}
        installGameControlObservation() {}
        installCommandRouting() {}
        assertSceneReleaseBoundary(empty) {
            calls.push(`owner:${empty}`);
            if (options.ownerError) throw options.ownerError;
        }
        fault() {
            calls.push('owner.fault');
        }
        closeAfterWorldTeardown() {
            calls.push('owner.close');
        }
        diagnostics() {
            return {};
        }
        beginStep() {
            return { prepareWriteback() {}, advance() {}, dispose() {} };
        }
        prepareCommandTick() {
            return {
                teleportNodes: [],
                commands: [],
                context: {},
                acceptedCount: 0,
                beginCommit() {},
                finishCommit() {},
                complete() {},
                fail() {},
                dispose() {},
            };
        }
    }
    const binding = {
        identity: { abiVersion: 1, variant: 'st-simd' },
        memoryDiagnostics: () => ({
            profile: 'air-box3d-memory-diagnostics-v2',
            schemaVersion: 2,
            identity: { worldId: 23, nativeStepIndex: BigInt(state.nativeStepIndex), bindingMutationRevision: 0 },
            mesh: { moduleSuccessfulCooks: 0n, moduleDestroys: 0n },
            ...options.memoryOverride,
        }),
        createWorld: () => Object.freeze({ id: 23 }),
        destroyWorld: () => {
            calls.push('destroy');
        },
        setGravity() {},
        getGravity: () => [0, -10, 0],
        setSleepingEnabled() {},
        isSleepingEnabled: () => true,
        debugSnapshot: () => Object.freeze({ primitives: [] }),
        stepDiagnostics: () => ({ ...state }),
        worldCounts: () => ({ counts: options.counts ?? [0, 0, 0, 0], liveBytes: 0n }),
        liveBytes: () => 0n,
        validateCommandBatch() {},
        applyCommandBatch: () => Object.freeze({ executedOperationCount: 0, operations: [] }),
        readStepSnapshot() {},
        getShapeMaterial() {},
        setShapeMaterial() {},
        step() {
            calls.push('step');
            throw options.stepError ?? error('AIR_E_BOX3D_IDENTITY_EXHAUSTED');
        },
        trimEmptyWorld(world, ack) {
            calls.push(['trim', world.id, ack]);
            if (options.trimError) throw options.trimError;
            if (options.trimResult === false) return false;
            state.snapshotAvailable = false;
            if (options.advanceOnTrim) state.nativeStepIndex++;
            if (options.badView) state.snapshotAvailable = true;
            return options.trimResult ?? true;
        },
    };
    const p = createAirPhysicsPreparation();
    p.own('box3d', 'module', () => {
        calls.push('module.close');
    });
    const install = p.installSceneReleaseHook.bind(p);
    p.installSceneReleaseHook = (fn) => {
        hook = fn;
        return install(fn);
    };
    const maps = ['sharedBodies', 'materialShapes', 'fixedConstraints', 'hingeConstraints', 'pointToPointConstraints'];
    const inject = (s) =>
        s.replace(
            'export class Box3DPhysicsWorld implements IPhysicsWorld {',
            `export class Box3DPhysicsWorld implements IPhysicsWorld {\n__inject(key,value) { switch(key) { ${maps.map((k) => `case '${k}': this.#${k}.${k.endsWith('Constraints') ? 'add(value)' : 'set(value,value)'};break;`).join('')} case 'meshResources': this.#meshResources=value;break; default: this[key]=value; } }`,
        );
    const { Box3DPhysicsWorld } = load(
        'src/air/physics/box3d/world.ts',
        ['Box3DPhysicsWorld'],
        {
            ...bindingSource,
            Box3DWorldCommandOwner: Owner,
            copyWritebackQualification: () => ({ epochLimit: 100000 }),
            copyDebugSnapshot: (v) => v,
            installBox3DBeforeStepSource: () => ({ dispose() {} }),
            installBox3DCommittedQuerySource: () => ({ dispose() {} }),
            Box3DCollisionEvents: class {
                clear() {
                    calls.push('collision.clear');
                }
            },
            Box3DTriggerEvents: class {
                clear() {
                    calls.push('trigger.clear');
                }
            },
            Box3DSharedBody: { plannedWritebackNodes: () => [] },
        },
        inject,
    );
    const config = { threading: 'single', workerCount: 1, solverSubSteps: 4 };
    const world = new Box3DPhysicsWorld({ binding, options: config }, config, p, undefined, {});
    p.prepared();
    return { world, p, binding, state, calls, owner, hook };
}
test('actual world installs hook, ACK true restores same world/step and drops only current refs', () => {
    const f = worldHarness();
    const copy = Object.freeze({ old: Object.freeze([1, 2]) });
    f.world.__inject('snapshot', copy);
    f.world.__inject('debug', copy);
    assert.equal(f.p.releaseScene().status, 'RESTORED');
    assert.deepEqual(f.calls.filter(Array.isArray), [['trim', 23, true]]);
    assert.equal(f.world.getStepSnapshot(), null);
    assert.equal(f.world.getDebugSnapshot(), null);
    assert.deepEqual(copy.old, [1, 2]);
    assert.equal(f.world.impl.worldId, 23);
    assert.equal(f.state.nativeStepIndex, 0);
    assert(!f.calls.includes('step'));
    assert(!f.calls.includes('destroy'));
});
for (const counts of [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
])
    test(`nonempty ${counts.join('/')} preserves events and does not ACK`, () => {
        const f = worldHarness({ counts });
        const snapshot = {};
        f.world.__inject('snapshot', snapshot);
        assert.equal(f.p.releaseScene().status, 'SKIPPED_NONEMPTY');
        assert.equal(f.world.getStepSnapshot(), snapshot);
        assert(!f.calls.some(Array.isArray));
        assert(!f.calls.includes('trigger.clear'));
        assert(!f.calls.includes('step'));
    });
test('native stricter NONEMPTY return is observable skip, without clearing copied state', () => {
    const f = worldHarness({ trimResult: false });
    const snapshot = {};
    f.world.__inject('snapshot', snapshot);
    assert.equal(f.p.releaseScene().status, 'SKIPPED_NONEMPTY');
    assert.equal(f.world.getStepSnapshot(), snapshot);
    assert(!f.calls.includes('collision.clear'));
});
for (const key of [
    'sharedBodies',
    'materialShapes',
    'fixedConstraints',
    'hingeConstraints',
    'pointToPointConstraints',
    'pendingSnapshot',
    'hasOwnerCleanupFailure',
])
    test(`zero counts with ${key} refuses before ACK`, () => {
        const f = worldHarness();
        f.world.__inject(key, {});
        assert.throws(() => f.p.releaseScene(), /unresolved ownership/);
        assert(!f.calls.some(Array.isArray));
    });
test('remaining native mesh lease/borrow snapshot refuses before ACK', () => {
    const f = worldHarness();
    f.world.__inject('meshResources', { readDiagnostics: () => [{ cacheLeases: 1, shapeBorrows: 0 }] });
    assert.throws(() => f.p.releaseScene(), /adapter resources/);
    assert(!f.calls.some(Array.isArray));
});
test('mutation-free refusal preserves original error and ready world; close still executes', async () => {
    const e = error('refused');
    Object.defineProperty(e, 'mutationOutcome', { value: 'not-mutated' });
    const f = worldHarness({ trimError: e });
    assert.throws(
        () => f.p.releaseScene(),
        (x) => x === e,
    );
    assert.equal(f.world.diagnostics().state, 'ready');
    await f.p.dispose();
    assert(f.calls.includes('destroy'));
    assert(f.calls.includes('module.close'));
});
for (const options of [{ trimError: error('unknown') }, { advanceOnTrim: true }, { badView: true }, { trimResult: 2 }])
    test(`unknown/invalid committed trim faults but preserves close: ${Object.keys(options)[0]}`, async () => {
        const f = worldHarness(options);
        assert.throws(() => f.p.releaseScene());
        assert.equal(f.world.diagnostics().state, 'faulted');
        await f.p.dispose();
        assert(f.calls.includes('destroy'));
        assert.equal(f.p.diagnostics().status, 'closed');
    });
test('actual step propagates identity exhaustion unchanged, faults backend and retains terminal teardown', async () => {
    const original = error('AIR_E_BOX3D_IDENTITY_EXHAUSTED');
    const f = worldHarness({ stepError: original });
    assert.throws(
        () => f.world.step(1 / 60),
        (e) => e === original,
    );
    assert.equal(f.world.diagnostics().state, 'faulted');
    assert.equal(f.world.diagnostics().failure.error, original);
    assert.throws(
        () => f.world.step(1 / 60),
        (e) => e.code === 'AIR_E_BOX3D_WORLD_FAULTED',
    );
    assert.equal(f.calls.filter((x) => x === 'step').length, 1);
    await f.p.dispose();
    assert(f.calls.includes('destroy'));
    assert(f.calls.includes('module.close'));
});
function appHarness(options = {}) {
    const calls = [];
    let current = null,
        terminal = false,
        deadline;
    const { createSessionScope } = load('src/air/session-scope.ts', ['createSessionScope'], {
        airError: (code, message) => Object.assign(new Error(message), { code }),
        ...(options.manualTimeout
            ? {
                  setTimeout: (fn) => {
                      deadline = fn;
                      return 1;
                  },
                  clearTimeout() {},
              }
            : {}),
    });
    class Scene {
        constructor(id = 'scene-1') {
            this.uuid = id;
            this.isValid = true;
        }
    }
    const p = createAirPhysicsPreparation();
    p.own('box3d', 'module', () => calls.push('module.dispose'));
    p.own('box3d', 'world', () => calls.push('world.dispose'), { dependsOn: ['module'] });
    p.installSceneReleaseHook(() => {
        calls.push('hook');
        if (options.hookError) throw options.hookError;
        return { backend: 'box3d', status: options.nonempty ? 'SKIPPED_NONEMPTY' : 'RESTORED' };
    });
    p.prepared();
    const game = {
        run() {},
        resume() {},
        pause() {
            calls.push('pause');
        },
    };
    const { AirAppImpl } = load('src/air/app.ts', ['AirAppImpl'], {
        ...safeErrors,
        Scene,
        createSessionScope,
        game,
        airError: (code, message) => Object.assign(new Error(message), { code }),
        airBootstrapRegistry: () => ({}),
        terminateGameClock: () => {
            terminal = true;
            calls.push('terminal');
        },
        isGameClockTerminal: () => terminal,
        screenAdapter: { destroyLayoutObserver: () => calls.push('layout.close') },
        director: {
            getScene: () => current,
            runSceneImmediate: (scene) => {
                current = scene;
            },
            _releaseSceneImmediate() {
                calls.push('scene.immediate');
                if (options.sceneError) throw options.sceneError;
                if (current) {
                    current.isValid = options.sceneStillValid ?? false;
                    current = null;
                }
                // Explicit director mock: only the ordering around this call is claimed.
                calls.push('director.deferred-1');
                return options.nonempty ? ['persist-1'] : [];
            },
        },
        releaseManager: {
            _flushAirReleaseQueue() {
                calls.push('assets.flush');
                if (options.assetError) throw options.assetError;
            },
        },
        CCObject: {
            _deferredDestroy() {
                calls.push('app.deferred-2');
                if (options.deferredError) throw options.deferredError;
            },
        },
    });
    const app = new AirAppImpl({}, { destroy: () => calls.push('context.close') }, undefined, p);
    const scene = new Scene();
    app.run(scene);
    return { app, p, scene, Scene, calls, fireTimeout: () => deadline() };
}
test('actual app/scope microtasks: scene destruction precedes owned cleanup, flush precedes ACK and receipt', async () => {
    const f = appHarness();
    let releaseOwned;
    const pending = new Promise((resolve) => {
        releaseOwned = resolve;
    });
    f.app.session.own(async () => {
        assert(f.calls.includes('director.deferred-1'));
        assert(!f.calls.includes('hook'));
        f.calls.push('owned.start');
        await pending;
        f.calls.push('owned.complete');
    }, 'material');
    const first = f.app.releaseScene();
    assert.equal(f.app.releaseScene(), first);
    assert.equal(f.app.session.active, false);
    await Promise.resolve();
    await Promise.resolve();
    assert(f.calls.includes('owned.start'));
    assert(!f.calls.includes('assets.flush'));
    assert(!f.calls.includes('hook'));
    releaseOwned();
    const receipt = await first;
    f.calls.push('receipt');
    assert.equal(receipt.status, 'released');
    assert.equal(receipt.physicsSceneRelease.status, 'RESTORED');
    assert.deepEqual(f.calls, [
        'pause',
        'scene.immediate',
        'director.deferred-1',
        'owned.start',
        'owned.complete',
        'assets.flush',
        'app.deferred-2',
        'hook',
        'receipt',
    ]);
    assert.equal(f.calls.filter((v) => v === 'hook').length, 1);
});
for (const option of ['sceneError', 'assetError', 'deferredError'])
    test(`actual app ${option} prevents ACK and preserves failure`, async () => {
        const original = error(option);
        const f = appHarness({ [option]: original });
        const receipt = await f.app.releaseScene();
        assert.equal(receipt.status, 'failed');
        assert(!f.calls.includes('hook'));
        assert(receipt.failures.some((x) => x.message.includes(option)));
        assert.throws(
            () => f.app.run(new f.Scene()),
            (e) => e.code === 'AIR_E_SCENE_RELEASE_FAILED',
        );
        await f.app.close();
        assert(f.calls.includes('world.dispose'));
        assert(f.calls.includes('module.dispose'));
    });
test('scope cleanup failure and timeout remain failures; neither can authorize ACK', async () => {
    const f = appHarness();
    f.app.session.own(() => {
        throw error('scope-first');
    });
    const receipt = await f.app.releaseScene();
    assert.equal(receipt.status, 'failed');
    assert(!f.calls.includes('hook'));
    assert(receipt.failures.some((x) => x.message.includes('scope-first')));
    const g = appHarness({ manualTimeout: true });
    g.app.session.own(() => new Promise(() => {}), 'pending-owner');
    const pending = g.app.releaseScene();
    await Promise.resolve();
    await Promise.resolve();
    g.fireTimeout();
    const timed = await pending;
    assert.equal(timed.status, 'failed');
    assert.equal(timed.pending.length, 1);
    assert(!g.calls.includes('hook'));
});
test('still-valid native scene prevents ACK', async () => {
    const f = appHarness({ sceneStillValid: true });
    const receipt = await f.app.releaseScene();
    assert.equal(receipt.status, 'failed');
    assert(receipt.pending.includes('native-scene-destruction'));
    assert(!f.calls.includes('hook'));
});
test('persistent nonempty world skips memory restoration without changing scene release contract', async () => {
    const f = appHarness({ nonempty: true });
    const receipt = await f.app.releaseScene();
    assert.equal(receipt.status, 'released');
    assert.equal(receipt.physicsSceneRelease.status, 'SKIPPED_NONEMPTY');
    assert(receipt.retained.includes('persist-node:persist-1'));
    f.app.run(new f.Scene('scene-2'));
});
test('ACK failure is in receipt, blocks replacement and cannot prevent normal close world/module attempts', async () => {
    const f = appHarness({ hookError: error('AIR_E_BOX3D_TRIM_UNSAFE') });
    const receipt = await f.app.releaseScene();
    assert.equal(receipt.status, 'failed');
    assert.deepEqual(plain(receipt.failures), [
        { label: 'box3d-empty-world-reclamation', message: 'Error: AIR_E_BOX3D_TRIM_UNSAFE' },
    ]);
    assert.throws(
        () => f.app.run(new f.Scene()),
        (e) => e.code === 'AIR_E_SCENE_RELEASE_FAILED',
    );
    const close = f.app.close();
    assert.equal(f.app.close(), close);
    const closed = await close;
    assert.equal(closed.status, 'failed');
    assert.equal(f.calls.filter((x) => x === 'world.dispose').length, 1);
    assert.equal(f.calls.filter((x) => x === 'module.dispose').length, 1);
    assert(f.calls.includes('context.close'));
});
test('separate scopes with equal generation do not reuse a prior acknowledgement', async () => {
    const f = appHarness();
    const a = f.app.session;
    await f.app.releaseScene();
    f.app.run(new f.Scene('scene-2'));
    const b = f.app.session;
    assert.notEqual(a, b);
    assert.equal(a.generation, b.generation);
    await f.app.releaseScene();
    assert.equal(f.calls.filter((x) => x === 'hook').length, 2);
});
test('malicious mutation metadata cannot replace original trim error', async () => {
    const hostile = new Proxy(error('primary-native'), {
        getOwnPropertyDescriptor() {
            throw error('metadata-secondary');
        },
    });
    const f = worldHarness({ trimError: hostile });
    assert.throws(
        () => f.p.releaseScene(),
        (e) => e === hostile,
    );
    assert.equal(f.world.diagnostics().state, 'faulted');
    assert.equal(f.world.diagnostics().failure.error, hostile);
    await f.p.dispose();
    assert(f.calls.includes('destroy'));
});

test('actual backend getter accepts v2 schema and binds generation/native mesh snapshots', () => {
    const f = worldHarness();
    const observation = f.world.getNativeMemoryDiagnostics();
    assert.equal(observation.profile, 'air-box3d-memory-diagnostics-v2');
    assert.equal(observation.schemaVersion, 2);
    assert.equal(observation.identity.worldId, 23);
    assert.equal(typeof observation.identity.bindingGeneration, 'number');
    assert.deepEqual(plain(observation.mesh.liveResourceSnapshots), []);
});
for (const memoryOverride of [
    { profile: 'air-box3d-memory-diagnostics-v1' },
    { schemaVersion: 1 },
    { identity: { worldId: 999 } },
])
    test(`actual backend rejects old/foreign diagnostics: ${Object.keys(memoryOverride)[0]}`, () => {
        const f = worldHarness({ memoryOverride });
        assert.throws(
            () => f.world.getNativeMemoryDiagnostics(),
            (e) => e.code === 'AIR_E_BOX3D_ABI',
        );
    });

// Regression: the production System/default-material observer lasts for the whole world,
// unlike per-collider observers. Native and registry adapters here remain explicit CPU mocks.
function installDefaultObservation(f) {
    f.owner.installMaterialObservation(
        () => {
            throw Error('ACK must not apply a material');
        },
        () => f.owner.fault(),
    );
    assert.equal(f.materialRegistrations.length, 1);
    assert.equal(f.materialRegistrations[0].target, f.system);
    assert.equal(f.owner.diagnostics().materialObserverLeases, 1);
    assert.equal(f.owner.diagnostics().bodies, 0);
    assert.equal(f.owner.diagnostics().components, 0);
    assert.deepEqual(plain(f.owner.diagnostics().targets), { active: 0, protected: 0, unresolved: 0, guards: 0 });
}
test('actual installMaterialObservation retains exact world-scoped lease across empty ACK, then actual owner close releases it', () => {
    const f = ownerHarness();
    installDefaultObservation(f);
    f.owner.assertSceneReleaseBoundary(true);
    f.owner.assertSceneReleaseBoundary(true);
    assert.equal(f.owner.diagnostics().materialObserverLeases, 1);
    assert.equal(f.materialRegistrations[0].active, true);
    assert.equal(f.materialRegistrations[0].disposeCalls, 0);
    f.owner.closeAfterWorldTeardown(true);
    assert.equal(f.materialRegistrations[0].active, false);
    assert.equal(f.materialRegistrations[0].disposeCalls, 1);
    assert.equal(f.owner.diagnostics().materialObserverLeases, 0);
    assert.equal(f.owner.diagnostics().phase, 'closed');
});
test('legacy size predicate reproduces the real ACK blind spot after actual default registration', () => {
    const f = ownerHarness({ legacyMaterialGuard: true });
    installDefaultObservation(f);
    assert.throws(
        () => f.owner.assertSceneReleaseBoundary(true),
        (e) => e.code === 'AIR_E_BOX3D_CONFIG' && /retained owner identities/.test(e.message),
    );
    assert.equal(f.materialRegistrations[0].disposeCalls, 0);
    f.owner.closeAfterWorldTeardown(true);
    assert.equal(f.materialRegistrations[0].disposeCalls, 1);
});
test('actual component/body owner cleanup leaves only default observer, not stale scene ownership', () => {
    const f = ownerHarness();
    installDefaultObservation(f);
    const node = new f.Node(),
        adapter = {},
        component = new f.Collider();
    component.node = node;
    const body = f.owner.adoptBody({
        node,
        ancestry: [node],
        preflight() {},
        readCommitted() {},
        resolveNative() {},
        clearTargetVelocity() {},
        prepareRigidActivity() {},
    });
    f.owner.attachComponent(body, { adapter, component, kind: 'collider', material: null, applyMaterial() {} });
    assert.equal(f.owner.diagnostics().materialObserverLeases, 2);
    assert.throws(() => f.owner.assertSceneReleaseBoundary(true));
    f.owner.releaseComponentAfterCleanup(adapter);
    f.owner.retireBodyAfterDestroy(body);
    assert.equal(f.owner.diagnostics().bodies, 0);
    assert.equal(f.owner.diagnostics().components, 0);
    assert.equal(f.owner.diagnostics().materialObserverLeases, 1);
    assert.equal(f.materialRegistrations[0].active, true);
    assert.equal(f.materialRegistrations[1].disposeCalls, 1);
    f.owner.assertSceneReleaseBoundary(true);
    f.owner.closeAfterWorldTeardown(true);
    assert.deepEqual(
        f.materialRegistrations.map((r) => r.disposeCalls),
        [1, 1],
    );
});
for (const key of ['replace-system-material', 'remove-system-material'])
    test('system-key alone cannot fake or silently lose the exact private lease: ' + key, () => {
        const f = ownerHarness();
        installDefaultObservation(f);
        f.owner.__inject(key, { dispose() {} });
        assert.throws(() => f.owner.assertSceneReleaseBoundary(true));
    });
for (const key of [
    'bodies',
    'components',
    'activityLeases',
    'materialLeases',
    'targets',
    'materialContext',
    'valuesContext',
    'materialCleanups',
])
    test('legal default observer does not exempt other live/pending ownership: ' + key, () => {
        const f = ownerHarness();
        installDefaultObservation(f);
        f.owner.__inject(key, {});
        assert.throws(() => f.owner.assertSceneReleaseBoundary(true));
    });
