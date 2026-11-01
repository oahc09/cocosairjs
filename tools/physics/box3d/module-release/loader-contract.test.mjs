/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// CPU lifecycle evidence only. Injected snapshots/modules are explicitly not native qualification.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes, createRequire } from 'node:module';
import { createBox3DSTLoader } from '../../../../src/air/physics/box3d/loader/st-loader.mjs';
import { validatePublicModuleRelease, runPublicModuleRelease } from './public-contract.mjs';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const snapshot = () => ({
    schema: 'air-box3d-module-release-snapshot-v1',
    schemaVersion: 1,
    core: { worlds: 0, trackedRequestedBytes: 1024 },
    bridge: {
        worlds: 0,
        allocations: 0,
        bytes: 0,
        debugShapeHandles: 0,
        temporaryNodes: 0,
        temporaryBytes: 0,
        wireBuffers: 0,
        wireCapacityRecords: 0,
        wireLengthRecords: 0,
        capturedWorlds: 0,
    },
    mesh: { resources: 0, leases: 0, references: 0, borrowNodes: 0, resourceStorageBytes: 0 },
});
function fixture(options = {}) {
    const identity = {
        coreSha: 'a'.repeat(40),
        bindingBaseSha: 'b'.repeat(40),
        schemaSha256: 'c'.repeat(64),
        patchChainSha256: 'd'.repeat(64),
        abiVersion: 1,
        variant: 'st-simd',
    };
    if (options.defaultCapture) {
        const lock = JSON.parse(fs.readFileSync(path.join(root, 'tools/physics/box3d/versions.lock.json'), 'utf8'));
        Object.assign(identity, {
            coreSha: lock.core.commit,
            bindingBaseSha: lock.bindingBase.commit,
            schemaSha256: lock.apiSchemaSha256,
            patchChainSha256: lock.patchLock.patchChainSha256,
        });
    }
    const files = new Map(
        ['box3d-st.mjs', 'box3d-st.wasm', 'facade.mjs', 'facade.d.mts'].map((p) => [p, Buffer.from(p)]),
    );
    files.set(
        'manifest.json',
        Buffer.from(
            JSON.stringify({
                schemaVersion: 1,
                ...identity,
                artifacts: [...files].map(([path, b]) => ({ path, bytes: b.length, sha256: sha(b) })),
            }),
        ),
    );
    const order = [],
        modules = [],
        captures = [],
        released = [];
    let reads = 0;
    const deps = {
        async fetch(url) {
            const name = new URL(url).pathname.split('/').at(-1);
            return new Response(files.get(name), {
                headers: {
                    'content-type': name.endsWith('.wasm')
                        ? 'application/wasm'
                        : name.endsWith('.json')
                          ? 'application/json'
                          : 'text/javascript',
                },
            });
        },
        async loadModule() {
            return {
                default: async () => {
                    const module = { mockModule: true, generation: modules.length + 1 };
                    modules.push(module);
                    return module;
                },
            };
        },
        createBinding(module, expected) {
            order.push('createBinding');
            assert.deepEqual(expected, identity);
            if (options.bindingError) throw options.bindingError;
            return {
                dispose() {
                    order.push('binding.dispose');
                    if (options.disposeError) throw options.disposeError;
                },
            };
        },
        releaseModule(module) {
            order.push('releaseModule');
            released.push(module);
            if (options.releaseError) throw options.releaseError;
        },
        captureModuleReleaseSnapshot(module, expected) {
            const phase = reads++ % 2 === 0 ? 'baseline' : 'terminal';
            order.push(phase);
            captures.push(module);
            assert.deepEqual(expected, identity);
            if (options.captureError?.[phase]) throw options.captureError[phase];
            const value = snapshot();
            options.mutate?.(value, phase);
            return value;
        },
    };
    if (options.defaultCapture) delete deps.captureModuleReleaseSnapshot;
    const loader = createBox3DSTLoader(
        { identity, manifestSha256: sha(files.get('manifest.json')), facadeSha256: sha(files.get('facade.mjs')) },
        { defaultAssetBaseUrl: 'https://cpu.invalid/st/' },
        deps,
    );
    return { loader, order, modules, captures, released };
}
const frozen = (value) => {
    if (value && typeof value === 'object') {
        assert(Object.isFrozen(value));
        Object.values(value).forEach(frozen);
    }
};
test('same acquired module baseline precedes binding; terminal follows dispose and precedes release, copied forever', async () => {
    const f = fixture(),
        lease = await f.loader.prepare();
    assert.deepEqual(f.order, ['baseline', 'createBinding']);
    assert.equal(lease.diagnostics().moduleRelease.status, 'BASELINE_CAPTURED');
    await lease.dispose();
    const receipt = lease.diagnostics();
    assert.deepEqual(f.order, ['baseline', 'createBinding', 'binding.dispose', 'terminal', 'releaseModule']);
    assert.equal(f.captures[0], f.modules[0]);
    assert.equal(f.captures[1], f.modules[0]);
    assert.equal(f.released[0], f.modules[0]);
    assert.equal(receipt.moduleRelease.status, 'VERIFIED');
    assert.equal(receipt.moduleRelease.verified, true);
    frozen(receipt);
    assert.equal(JSON.stringify(receipt).includes('mockModule'), false);
    await Promise.all([lease.dispose(), f.loader.dispose()]);
    assert.equal(f.captures.length, 2);
    assert.equal(f.released.length, 1);
    const next = await f.loader.prepare();
    assert.equal(lease.diagnostics().generation, 1);
    assert.equal(next.diagnostics().generation, 2);
    assert.deepEqual(lease.diagnostics(), receipt);
    await next.dispose();
    assert.deepEqual(lease.diagnostics(), receipt);
});
test('default capture rejects a fake module missing native exports and still releases it', async () => {
    const f = fixture({ defaultCapture: true });
    await assert.rejects(
        f.loader.prepare(),
        (error) =>
            error.code === 'AIR_E_BOX3D_MODULE_RELEASE' &&
            error.message.includes('Missing module release export: _malloc'),
    );
    assert.equal(f.released.length, 1);
    assert(!f.order.includes('createBinding'));
    const receipt = f.loader.diagnostics();
    assert.equal(receipt.moduleRelease.status, 'FAILED');
    assert.equal(receipt.moduleRelease.verified, false);
    assert(receipt.moduleRelease.errors.some((e) => e.phase === 'baseline'));
    assert(receipt.moduleRelease.errors.some((e) => e.phase === 'terminal'));
});
for (const phase of ['baseline', 'terminal'])
    test('capture failure ' + phase + ' is retained and module release still attempted', async () => {
        const primary = Object.assign(new Error('capture-' + phase), { code: 'TEST_CAPTURE' }),
            f = fixture({ captureError: { [phase]: primary } });
        if (phase === 'baseline') await assert.rejects(f.loader.prepare(), (e) => e === primary);
        else {
            await f.loader.prepare();
            await assert.rejects(f.loader.dispose(), AggregateError);
        }
        const r = f.loader.diagnostics();
        assert.equal(f.released.length, 1);
        assert.equal(r.moduleRelease.verified, false);
        assert.equal(r.status, 'CLEANUP_FAILED');
        assert(r.moduleRelease.errors.some((e) => e.phase === phase && e.code === 'TEST_CAPTURE'));
        await f.loader.dispose();
        assert.equal(f.released.length, 1);
    });
for (const [group, key] of [
    ['core', 'worlds'],
    ['core', 'trackedRequestedBytes'],
    ...Object.keys(snapshot().bridge).map((k) => ['bridge', k]),
    ...Object.keys(snapshot().mesh).map((k) => ['mesh', k]),
])
    test('terminal retained ' + group + '.' + key + ' fails without suppressing release', async () => {
        const f = fixture({
            mutate(value, phase) {
                if (phase === 'terminal') value[group][key]++;
            },
        });
        await f.loader.prepare();
        await assert.rejects(f.loader.dispose(), AggregateError);
        const r = f.loader.diagnostics();
        assert.equal(r.moduleRelease.verified, false);
        assert(r.moduleRelease.errors.some((e) => e.phase === 'verify'));
        assert.equal(f.released.length, 1);
    });
test('nonempty baseline is rejected before binding and is never warmed up or rebased', async () => {
    const f = fixture({
        mutate(v, phase) {
            if (phase === 'baseline') v.mesh.resources = 1;
        },
    });
    await assert.rejects(f.loader.prepare(), { code: 'AIR_E_BOX3D_MODULE_RELEASE' });
    assert(!f.order.includes('createBinding'));
    assert.equal(f.released.length, 1);
    assert.equal(f.loader.diagnostics().moduleRelease.baseline.mesh.resources, 1);
});
for (const where of ['disposeError', 'releaseError'])
    test(where + ' cannot be hidden by clean terminal counts', async () => {
        const error = new Error(where),
            f = fixture({ [where]: error });
        await f.loader.prepare();
        await assert.rejects(f.loader.dispose(), (e) => e.errors.includes(error));
        const r = f.loader.diagnostics();
        assert(r.moduleRelease.baseline && r.moduleRelease.terminal);
        assert.equal(r.moduleRelease.verified, false);
        assert.equal(r.status, 'CLEANUP_FAILED');
        assert.equal(f.captures.length, 2);
        assert.equal(f.released.length, 1);
    });
test('binding creation primary survives terminal and release failures separately', async () => {
    const primary = new Error('binding-primary'),
        terminal = new Error('terminal-secondary'),
        release = new Error('release-secondary');
    const f = fixture({ bindingError: primary, captureError: { terminal }, releaseError: release });
    await assert.rejects(f.loader.prepare(), (e) => e === primary);
    const r = f.loader.diagnostics();
    assert.equal(r.originalError.message, primary.message);
    assert.deepEqual(
        r.moduleRelease.errors.map((e) => e.phase),
        ['terminal', 'release-module'],
    );
    assert.equal(f.released.length, 1);
});
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
function actualTS(relative, names) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    const code = stripTypeScriptTypes(source, { mode: 'transform' })
        .replace(/^import[\s\S]*?;\s*$/gm, '')
        .replace(/^export /gm, '');
    const dependencies =
        relative === 'src/air/physics/preparation.ts'
            ? actualTS('src/air/safe-error.ts', ['safeErrorString', 'safeErrorField'])
            : {};
    return vm.runInNewContext(code + '\n;({' + names.join(',') + '})', dependencies);
}
for (const disposeFails of [false, true])
    test('actual preparation copies this lease terminal in failure-safe disposal; throws=' + disposeFails, async () => {
        const { createAirPhysicsPreparation } = actualTS('src/air/physics/preparation.ts', [
            'createAirPhysicsPreparation',
        ]);
        const api = actualTS('src/air/physics/box3d/prepare.ts', [
            'prepareBox3D',
            'registerBox3DFeature',
            'registerBox3DWorldAdapter',
        ]);
        const native = fixture({ disposeError: disposeFails ? new Error('primary-dispose') : undefined });
        api.registerBox3DFeature({ createLoader: () => native.loader });
        api.registerBox3DWorldAdapter(() => ({ select() {} }));
        const preparation = createAirPhysicsPreparation();
        await api.prepareBox3D({ threading: 'single' }, preparation);
        preparation.prepared();
        const closing = preparation.dispose();
        assert.equal(preparation.dispose(), closing);
        const r = await closing;
        assert.equal(r.status, disposeFails ? 'cleanup-failed' : 'closed');
        assert.equal(r.moduleRelease.status, disposeFails ? 'FAILED' : 'VERIFIED');
        frozen(r.moduleRelease);
        assert.deepEqual(JSON.parse(JSON.stringify(r.moduleRelease)), native.loader.diagnostics().moduleRelease);
        assert.equal(native.released.length, 1);
        assert.throws(() => preparation.recordBox3DModuleRelease(r.moduleRelease), /once/);
    });
test('actual preparation never stores pre-close or function-bearing terminal receipts', async () => {
    const { createAirPhysicsPreparation } = actualTS('src/air/physics/preparation.ts', ['createAirPhysicsPreparation']);
    const p = createAirPhysicsPreparation();
    const receipt = { status: 'VERIFIED', verified: true, baseline: snapshot(), terminal: snapshot(), errors: [] };
    assert.throws(() => p.recordBox3DModuleRelease(receipt), /disposal/);
    p.own('box3d', 'module', () => p.recordBox3DModuleRelease({ ...receipt, nativeCallback() {} }));
    const r = await p.dispose();
    assert.equal(r.status, 'cleanup-failed');
    assert.equal(r.moduleRelease, undefined);
});
function validPublicReport() {
    const receipt = { status: 'VERIFIED', verified: true, baseline: snapshot(), terminal: snapshot(), errors: [] };
    return {
        frames: [{}, {}],
        debug: { primitives: [{ kind: 'CPU_ONLY' }] },
        debugRetainedAfterClose: true,
        sceneRunCalls: 1,
        releaseSceneCalls: 1,
        closeCalls: 1,
        nonempty: { bodies: 4, shapes: 4, joints: 1 },
        activeResources: [{ cacheLeases: 1, shapeBorrows: 2 }],
        release: { status: 'released', physicsSceneRelease: { status: 'RESTORED' }, failures: [], pending: [] },
        sceneInvalid: true,
        materialInvalid: true,
        tokenCurrent: false,
        currentSceneNull: true,
        afterRelease: { bodies: 0, shapes: 0, contacts: 0, joints: 0 },
        resourcesAfterRelease: [],
        close: {
            status: 'released',
            failures: [],
            pending: [],
            physicsPreparation: {
                status: 'closed',
                cleanupErrors: [],
                acquired: [
                    { backend: 'box3d', resource: 'module', cleanup: 'released', retained: [] },
                    { backend: 'box3d', resource: 'world', cleanup: 'released', retained: [] },
                ],
                moduleRelease: receipt,
            },
        },
        moduleRelease: receipt,
    };
}
test('finite public validator requires nonempty real-object evidence plus same-module detached terminal', () => {
    assert(validatePublicModuleRelease(validPublicReport()));
});
for (const [name, change] of [
    ['empty scene', (r) => (r.nonempty.bodies = 0)],
    ['no debug activity', (r) => (r.debug.primitives = [])],
    ['no resource activity', (r) => (r.activeResources = [])],
    ['unreleased scene', (r) => (r.release.status = 'failed')],
    ['additional close', (r) => (r.closeCalls = 2)],
    ['module cleanup failure', (r) => (r.close.physicsPreparation.acquired[0].cleanup = 'failed')],
    ['missing copied baseline', (r) => (r.moduleRelease.baseline = null)],
    ['terminal core requested-byte drift', (r) => r.moduleRelease.terminal.core.trackedRequestedBytes++],
    ['retained registered mesh resource', (r) => r.moduleRelease.terminal.mesh.resources++],
    ['failed terminal capture', (r) => (r.moduleRelease.verified = false)],
])
    test('public module release validator rejects ' + name, () => {
        const r = validPublicReport();
        change(r);
        assert.throws(() => validatePublicModuleRelease(r));
    });
test('actual finite public fixture closes once and preserves an earlier error over close failure', async () => {
    const primary = new Error('public-primary'),
        report = {};
    let calls = 0;
    const sdk = { PhysicsSystem: { instance: { physicsWorld: {} } } };
    const app = {
        getScene() {
            throw primary;
        },
        async close() {
            calls++;
            throw new Error('close-secondary');
        },
    };
    await assert.rejects(runPublicModuleRelease({ sdk, app, report, record() {} }), (e) => e === primary);
    assert.equal(calls, 1);
    assert.equal(report.closeCalls, 1);
    assert.equal(report.status, 'FAIL');
    assert(report.closeError.includes('close-secondary'));
});
test('failed world dependency retains its module without inventing a terminal capture', async () => {
    const { createAirPhysicsPreparation } = actualTS('src/air/physics/preparation.ts', ['createAirPhysicsPreparation']);
    const api = actualTS('src/air/physics/box3d/prepare.ts', [
        'prepareBox3D',
        'registerBox3DFeature',
        'registerBox3DWorldAdapter',
    ]);
    const native = fixture();
    api.registerBox3DFeature({ createLoader: () => native.loader });
    api.registerBox3DWorldAdapter((lease, options, preparation) => {
        preparation.own(
            'box3d',
            'world',
            () => {
                throw new Error('world-still-owned');
            },
            { dependsOn: ['module'] },
        );
        return { select() {} };
    });
    const preparation = createAirPhysicsPreparation();
    await api.prepareBox3D({ threading: 'single' }, preparation);
    const receipt = await preparation.dispose();
    assert.equal(receipt.status, 'cleanup-failed');
    assert.equal(receipt.moduleRelease, undefined);
    assert.equal(native.captures.length, 1);
    assert.equal(native.released.length, 0);
    assert.equal(receipt.acquired[0].cleanup, 'not-attempted');
    assert.equal(receipt.acquired[0].retained[0], 'module');
});
test('actual prepare disposer preserves its primary when receipt copying also fails', async () => {
    const api = actualTS('src/air/physics/box3d/prepare.ts', [
        'prepareBox3D',
        'registerBox3DFeature',
        'registerBox3DWorldAdapter',
    ]);
    const primary = new Error('dispose-primary'),
        secondary = new Error('diagnostics-secondary');
    let disposer,
        reads = 0;
    const recorded = [];
    api.registerBox3DFeature({
        createLoader: () => ({
            async prepare() {
                return {
                    async dispose() {
                        throw primary;
                    },
                    diagnostics() {
                        reads++;
                        throw secondary;
                    },
                };
            },
        }),
    });
    api.registerBox3DWorldAdapter(() => ({ select() {} }));
    await api.prepareBox3D(
        { threading: 'single' },
        {
            own(backend, resource, callback) {
                assert.equal(backend, 'box3d');
                assert.equal(resource, 'module');
                disposer = callback;
            },
            recordCleanupError(label, error) {
                recorded.push({ label, error });
            },
            recordBox3DModuleRelease() {
                throw new Error('not reached');
            },
        },
    );
    await assert.rejects(disposer(), (error) => error === primary);
    assert.equal(reads, 1);
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].error, secondary);
});
for (const kind of ['cycle', 'instance'])
    test('preparation rejects detached evidence ' + kind + ' rather than accepting an empty copy', async () => {
        const { createAirPhysicsPreparation } = actualTS('src/air/physics/preparation.ts', [
            'createAirPhysicsPreparation',
        ]);
        const p = createAirPhysicsPreparation(),
            receipt = { status: 'FAILED', verified: false, baseline: null, terminal: null, errors: [] };
        if (kind === 'cycle') receipt.extra = receipt;
        else receipt.extra = new Date();
        p.own('box3d', 'module', () => p.recordBox3DModuleRelease(receipt));
        const r = await p.dispose();
        assert.equal(r.status, 'cleanup-failed');
        assert.equal(r.moduleRelease, undefined);
    });
test('actual finite fixture CPU scheduling uses one scene/close, two shared terrain users, mounted setters and no post-close probe', async () => {
    // Explicit scheduling/roster doubles, not native evidence or a second physics implementation.
    const nodes = [],
        cleanups = [];
    let scene = null,
        closed = false,
        closeCalls = 0,
        frames = 0;
    class Vec3 {
        constructor(x = 0, y = 0, z = 0) {
            Object.assign(this, { x, y, z });
        }
    }
    class RigidBody {
        static Type = { STATIC: 0, DYNAMIC: 1 };
    }
    class BoxCollider {}
    class TerrainCollider {}
    class FixedConstraint {
        set breakForce(value) {
            assert(this.node.mounted);
            this.force = value;
        }
        get breakForce() {
            return this.force;
        }
        set breakTorque(value) {
            assert(this.node.mounted);
            this.torque = value;
        }
        get breakTorque() {
            return this.torque;
        }
    }
    class PhysicsMaterial {
        isValid = true;
        destroy() {
            this.isValid = false;
        }
    }
    class Node {
        isValid = true;
        components = [];
        constructor(name) {
            this.name = name;
            nodes.push(this);
        }
        setPosition(...value) {
            assert(!this.mounted);
            this.position = value;
        }
        addChild(node) {
            node.parent = this;
        }
        addComponent(Kind) {
            const c = new Kind();
            c.node = this;
            this.components.push(c);
            return c;
        }
    }
    class Scene extends Node {}
    const components = (Kind) => (scene ? nodes.flatMap((n) => n.components).filter((c) => c instanceof Kind) : []);
    const world = {
        set debugDrawFlags(value) {
            assert(!closed);
            assert.equal(value, 1);
        },
        getDebugSnapshot() {
            assert(!closed);
            return Object.freeze({ primitives: Object.freeze([Object.freeze({ kind: 'CPU_ONLY' })]) });
        },
        diagnostics() {
            assert(!closed);
            return { native: { nativeStepIndex: 0 } };
        },
        getNativeCounts() {
            assert(!closed);
            return {
                bodies: components(RigidBody).length,
                shapes: components(BoxCollider).length + components(TerrainCollider).length,
                contacts: 0,
                joints: components(FixedConstraint).length,
                liveBytes: 1000n,
            };
        },
        getStaticMeshResourceDiagnostics() {
            assert(!closed);
            const terrains = components(TerrainCollider);
            if (!terrains.length) return [];
            assert.equal(terrains.length, 2);
            assert.equal(terrains[0].terrain, terrains[1].terrain);
            return [{ cacheLeases: 1, shapeBorrows: terrains.length }];
        },
    };
    const app = {
        getScene: () => scene,
        run(value) {
            assert.equal(scene, null);
            scene = value;
            nodes.forEach((n) => (n.mounted = true));
        },
        session: {
            token: () => ({ isCurrent: () => scene !== null }),
            own(callback) {
                cleanups.push(callback);
            },
        },
        async releaseScene() {
            assert(scene);
            nodes.forEach((n) => (n.isValid = false));
            scene = null;
            cleanups.forEach((f) => f());
            return validPublicReport().release;
        },
        async close() {
            closeCalls++;
            assert.equal(scene, null);
            closed = true;
            const value = validPublicReport().close;
            const freeze = (v) => {
                if (v && typeof v === 'object') {
                    Object.values(v).forEach(freeze);
                    Object.freeze(v);
                }
                return v;
            };
            return freeze(value);
        },
    };
    const sdk = {
        Node,
        Scene,
        RigidBody,
        BoxCollider,
        TerrainCollider,
        FixedConstraint,
        PhysicsMaterial,
        Vec3,
        PhysicsSystem: { instance: { physicsWorld: world } },
        readBox3DConstraintState(joint) {
            assert(joint.node.mounted);
            return {
                backend: 'box3d',
                kind: 'fixed',
                state: frames ? 'connected' : 'pending',
                native: { breakForce: joint.breakForce ?? 0, breakTorque: joint.breakTorque ?? 0 },
            };
        },
        createStepClock() {
            return {
                stepping: false,
                begin() {
                    this.stepping = true;
                },
                async step(dt) {
                    assert(scene && !closed);
                    return { step: ++frames, dt, afterDraw: true };
                },
            };
        },
    };
    const report = {},
        records = [];
    await runPublicModuleRelease({
        sdk,
        app,
        report,
        record(name, value) {
            records.push({ name, value: structuredClone(value) });
        },
    });
    assert.equal(report.status, 'PASS_PUBLIC_MODULE_RELEASE_SUBSET');
    assert.equal(closeCalls, 1);
    assert.equal(frames, 2);
    assert.equal(report.nonempty.bodies, 4);
    assert.equal(report.activeResources[0].shapeBorrows, 2);
    assert(records.some((row) => row.name === 'module-release-terminal-receipt'));
});
test('closed preparation without module capture cannot accept fabricated late terminal evidence', async () => {
    const { createAirPhysicsPreparation } = actualTS('src/air/physics/preparation.ts', ['createAirPhysicsPreparation']);
    const p = createAirPhysicsPreparation();
    p.own('box3d', 'module', () => {});
    await p.dispose();
    assert.throws(
        () =>
            p.recordBox3DModuleRelease({
                status: 'VERIFIED',
                verified: true,
                baseline: snapshot(),
                terminal: snapshot(),
                errors: [],
            }),
        /disposal/,
    );
    assert.equal(p.diagnostics().moduleRelease, undefined);
});

// Declaration-only/in-memory CPU checks: not the official fresh full-SDK DTS seven gates.
const ts = createRequire(import.meta.url)('typescript');
const preparationPath = path.join(root, 'src/air/physics/preparation.ts');
const preparationSource = fs.readFileSync(preparationPath, 'utf8');
const typeOptions = {
    target: ts.ScriptTarget.ES2015,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    lib: ['lib.es2015.d.ts', 'lib.es2017.d.ts', 'lib.dom.d.ts'],
    types: [],
    strict: true,
    skipLibCheck: false,
    declaration: true,
    emitDeclarationOnly: true,
    noEmitOnError: true,
    outDir: path.join(root, '__cpu_module_release_virtual_emit__'),
};
function typeProgram(virtualFiles, roots, options = typeOptions) {
    const host = ts.createCompilerHost(options),
        output = new Map();
    const originalRead = host.readFile,
        originalExists = host.fileExists,
        originalSource = host.getSourceFile,
        originalDirectory = host.directoryExists;
    host.directoryExists = (name) =>
        [...virtualFiles.keys()].some((file) => path.dirname(file) === path.resolve(name)) ||
        !!originalDirectory?.(name);
    host.fileExists = (name) => virtualFiles.has(path.resolve(name)) || originalExists(name);
    host.readFile = (name) => virtualFiles.get(path.resolve(name)) ?? originalRead(name);
    host.getSourceFile = (name, languageVersion, onError, shouldCreateNewSourceFile) =>
        virtualFiles.has(path.resolve(name))
            ? ts.createSourceFile(name, virtualFiles.get(path.resolve(name)), languageVersion, true)
            : originalSource(name, languageVersion, onError, shouldCreateNewSourceFile);
    host.writeFile = (name, text) => output.set(path.resolve(name), text);
    const program = ts.createProgram(roots, options, host);
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (!diagnostics.length && !options.noEmit) {
        const emitted = program.emit();
        diagnostics.push(...emitted.diagnostics);
    }
    return { diagnostics, output };
}
const diagnosticText = (diagnostics) =>
    diagnostics.map((d) => d.code + ':' + ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('\n');
let localDeclaration;
test('actual preparation declaration emits a self-contained public receipt with original ES2015/ES2017 libraries', () => {
    const result = typeProgram(new Map([[preparationPath, preparationSource]]), [preparationPath]);
    assert.equal(result.diagnostics.length, 0, diagnosticText(result.diagnostics));
    localDeclaration = [...result.output].find(([name]) => path.basename(name) === 'preparation.d.ts')?.[1];
    assert(localDeclaration);
    assert.match(localDeclaration, /export interface Box3DModuleReleaseSnapshot/);
    assert.match(localDeclaration, /export interface Box3DModuleReleaseReceipt/);
    const ast = ts.createSourceFile('preparation.d.ts', localDeclaration, ts.ScriptTarget.ES2015, true);
    assert(!ast.statements.some(ts.isImportDeclaration), 'Public declaration has no private import closure');
    assert(!/import\s*\(/.test(localDeclaration), 'Public declaration has no inline private import type');
});
function publicTypeCheck(declaration, consumer) {
    const dir = path.join(root, '__cpu_module_release_virtual_consumer__');
    const input = path.join(dir, 'consumer.ts'),
        decl = path.join(dir, 'preparation.d.ts');
    return typeProgram(
        new Map([
            [input, consumer],
            [decl, declaration],
        ]),
        [input],
        { ...typeOptions, noEmit: true, emitDeclarationOnly: false, declaration: false },
    );
}
const publicConsumer = `import type { AirPhysicsPreparationReceipt, Box3DModuleReleaseReceipt, Box3DModuleReleaseSnapshot } from './preparation';
declare const appClose: {physicsPreparation:AirPhysicsPreparationReceipt};
const release:Box3DModuleReleaseReceipt|undefined=appClose.physicsPreparation.moduleRelease;
if(release){
 const status:'NOT_ACQUIRED'|'BASELINE_CAPTURED'|'VERIFIED'|'FAILED'=release.status;
 const baseline:Box3DModuleReleaseSnapshot|null=release.baseline;
 const terminal:Box3DModuleReleaseSnapshot|null=release.terminal;
 if(terminal){const count:number=terminal.core.worlds;const bytes:number=terminal.core.trackedRequestedBytes;
 const borrows:number=terminal.mesh.borrowNodes;const allocations:number=terminal.bridge.allocations;}
 const errors:ReadonlyArray<{readonly phase:'baseline'|'binding-dispose'|'terminal'|'verify'|'release-module';readonly code:string|null;readonly message:string}>=release.errors;
}`;
test('strict public consumer resolves actual emitted detached receipt/snapshot fields without skipLibCheck', () => {
    assert(localDeclaration);
    const result = publicTypeCheck(localDeclaration, publicConsumer);
    assert.equal(result.diagnostics.length, 0, diagnosticText(result.diagnostics));
});
test('source-derived missing receipt declaration reproduces TS2304 rather than accepting a dangling public type', () => {
    assert(localDeclaration);
    const ast = ts.createSourceFile('preparation.d.ts', localDeclaration, ts.ScriptTarget.ES2015, true);
    const declaration = ast.statements.find(
        (s) => ts.isInterfaceDeclaration(s) && s.name.text === 'Box3DModuleReleaseReceipt',
    );
    assert(declaration);
    const broken = localDeclaration.slice(0, declaration.pos) + localDeclaration.slice(declaration.end);
    const result = publicTypeCheck(
        broken,
        `import type {AirPhysicsPreparationReceipt} from './preparation'; declare const x:AirPhysicsPreparationReceipt; void x.moduleRelease;`,
    );
    assert(
        result.diagnostics.some((d) => d.code === 2304 && diagnosticText([d]).includes('Box3DModuleReleaseReceipt')),
        diagnosticText(result.diagnostics),
    );
});
test('source-derived old fromEntries branch fails the unchanged producer lib set', () => {
    const marker = 'const result: Record<string, unknown> = {};';
    assert(preparationSource.includes(marker));
    const oldBranch = preparationSource.replace(marker, marker + ' Object.fromEntries(Object.entries(value));');
    const result = typeProgram(new Map([[preparationPath, oldBranch]]), [preparationPath]);
    assert(
        result.diagnostics.some((d) => diagnosticText([d]).includes('fromEntries')),
        diagnosticText(result.diagnostics),
    );
    assert.equal(result.output.size, 0, 'A failed local emit is not promoted');
});
test('emitted public declaration rejects mutation and invented snapshot fields', () => {
    const result = publicTypeCheck(
        localDeclaration,
        publicConsumer +
            `
if(release){release.status='VERIFIED';release.errors.push({phase:'verify',code:null,message:'x'});if(release.terminal){release.terminal.core.worlds=1;void release.terminal.secretModule;}}`,
    );
    assert(result.diagnostics.filter((d) => d.code === 2540).length >= 2, diagnosticText(result.diagnostics));
    assert(
        result.diagnostics.some((d) => d.code === 2339 && diagnosticText([d]).includes('secretModule')),
        diagnosticText(result.diagnostics),
    );
    assert(
        result.diagnostics.some((d) => d.code === 2339 && diagnosticText([d]).includes('push')),
        diagnosticText(result.diagnostics),
    );
});
test('loader and decoder declarations re-export canonical TS types without duplicate private definitions', () => {
    for (const [relative, name] of [
        ['src/air/physics/box3d/loader/st-loader.d.mts', 'Box3DModuleReleaseReceipt'],
        ['src/air/physics/box3d/binding/module-release.d.mts', 'Box3DModuleReleaseSnapshot'],
    ]) {
        const text = fs.readFileSync(path.join(root, relative), 'utf8');
        assert.match(text, /from ['"]\.\.\/\.\.\/preparation\.js['"]/);
        assert(text.includes('export type { ' + name + ' }'));
        assert(!text.includes('export interface ' + name));
    }
});
test('actual plain-data copier preserves own __proto__ data without retaining or changing prototypes', async () => {
    const { createAirPhysicsPreparation } = actualTS('src/air/physics/preparation.ts', ['createAirPhysicsPreparation']);
    const p = createAirPhysicsPreparation();
    const receipt = { status: 'VERIFIED', verified: true, baseline: snapshot(), terminal: snapshot(), errors: [] };
    Object.defineProperty(receipt, '__proto__', { value: { copyOnly: 'not a prototype' }, enumerable: true });
    p.own('box3d', 'module', () => p.recordBox3DModuleRelease(receipt));
    const result = await p.dispose();
    assert.equal(result.status, 'closed');
    assert(Object.hasOwn(result.moduleRelease, '__proto__'));
    assert.equal(result.moduleRelease.__proto__.copyOnly, 'not a prototype');
    assert.equal(Object.getPrototypeOf(result.moduleRelease).copyOnly, undefined);
    assert.notEqual(result.moduleRelease.__proto__, receipt.__proto__);
    frozen(result.moduleRelease);
});

test('actual .d.mts loader/decoder type re-exports resolve canonical TS under NodeNext', () => {
    const file = path.join(root, '__cpu_module_release_virtual_consumer__', 'direct-consumer.mts');
    const source = `import type {Box3DModuleReleaseReceipt} from '../src/air/physics/box3d/loader/st-loader.mjs';
import type {Box3DModuleReleaseSnapshot} from '../src/air/physics/box3d/binding/module-release.mjs';
import type {Box3DModuleReleaseReceipt as PublicReceipt,Box3DModuleReleaseSnapshot as PublicSnapshot} from '../src/air/physics/preparation.js';
declare const receipt:Box3DModuleReleaseReceipt;declare const snapshot:Box3DModuleReleaseSnapshot;
const sameReceipt:PublicReceipt=receipt;const sameSnapshot:PublicSnapshot=snapshot;`;
    const result = typeProgram(new Map([[file, source]]), [file], {
        ...typeOptions,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        noEmit: true,
        emitDeclarationOnly: false,
        declaration: false,
    });
    assert.equal(result.diagnostics.length, 0, diagnosticText(result.diagnostics));
});
