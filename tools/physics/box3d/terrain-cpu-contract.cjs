/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Actual candidate TS, with only engine host/native ownership boundaries mocked. No physics execution.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '../../..');
const ts = require(process.env.BOX3D_TYPESCRIPT || 'typescript');
const base = path.join(root, 'src/air/physics/box3d');
const cache = new Map();
const mocks = new Map();
const decorate = () => () => {};
const decorator = {
    ccclass: () => (target) => target,
    serializable: () => {},
    help: decorate,
    executeInEditMode: () => {},
    menu: decorate,
    type: decorate,
    tooltip: decorate,
};
class Asset {}
class RigidBody {}
class Collider {}
const selector = { id: 'box3d' };
let mutationAllowed = true;
function load(filename) {
    filename = path.resolve(filename);
    if (mocks.has(filename)) return mocks.get(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const source = fs.readFileSync(filename, 'utf8');
    const result = ts.transpileModule(source, {
        fileName: filename,
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.CommonJS,
            experimentalDecorators: true,
        },
        reportDiagnostics: true,
    });
    assert.equal(
        (result.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error).length,
        0,
        filename,
    );
    const module = { exports: {} };
    cache.set(filename, module);
    const req = (name) => {
        if (name === 'cc.decorator') return decorator;
        if (name.endsWith('/asset/assets')) return { Asset, Texture2D: class {} };
        if (name.endsWith('/gc-object')) return { GCObject: class {} };
        if (name.endsWith('/rigid-body')) return { RigidBody };
        if (name.endsWith('/mutation-guard'))
            return {
                assertMutationAllowed() {
                    if (!mutationAllowed) throw new Error('mutation denied');
                },
            };
        if (name.endsWith('/physics-selector')) return { selector };
        if (name === './collider') return { Collider };
        if (name.endsWith('/core')) return { warnID() {}, Enum: (value) => value };
        if (name.startsWith('.'))
            return load(path.resolve(path.dirname(filename), name + (path.extname(name) ? '' : '.ts')));
        throw new Error(`Unmocked import ${name}`);
    };
    new Function('require', 'module', 'exports', result.outputText)(req, module, module.exports);
    return module.exports;
}
const intake = load(path.join(base, 'terrain-intake.ts'));
const { sameStaticMeshKey } = load(path.join(base, 'static-mesh-intake.ts'));
const heights = [0, 1, 4, 2, 5, 3, 6, 4, 8];
const asset = (values = heights, id = 'a') => ({
    _uuid: id,
    tileSize: 1,
    getVertexCountI: () => 3,
    getVertexCountJ: () => 3,
    getHeight: (i, j) => values[j * 3 + i],
});
const identity = { coreSha: 'core', patchChainSha256: 'patch', schemaSha256: 'schema' };
const geometry = (source, center = [0, 0, 0], scale = [2, 1, 3]) =>
    intake.terrainGeometry(intake.copyTerrainSource(source), center, scale, false, null, identity);
test('actual TS intake: public terrain/native mesh, frozen diagonal, center+unequal spacing', () => {
    const g = geometry(asset(), [1, 2, -1]);
    assert.equal(g.kind, 'mesh');
    assert.equal(g.publicKind, 'terrain');
    assert.equal(g.provenance, 'heightfield-cooked-static-triangle-mesh');
    assert.deepEqual(g.positions.slice(0, 3), [2, 2, -3]);
    assert.deepEqual(g.positions.slice(-3), [6, 10, 3]);
    assert.deepEqual(g.intake.indices.slice(0, 6), [0, 3, 1, 4, 1, 3]);
    assert.deepEqual(
        g.intake.sourceFaces.map((face) => face.flatFace),
        [0, 1, 2, 3, 4, 5, 6, 7],
    );
});
test('canonical existing mesh codec keys actual samples/dimensions/center/scale/version, never uuid', () => {
    const a = geometry(asset()),
        b = geometry(asset(heights, 'different-id'));
    assert.ok(sameStaticMeshKey(a.intake.key, b.intake.key));
    for (const changed of [
        geometry(asset(heights.map((h) => h + 1))),
        geometry(asset(), [1, 0, 0]),
        geometry(asset(), [0, 0, 0], [2, 1, 4]),
    ])
        assert.ok(!sameStaticMeshKey(a.intake.key, changed.intake.key));
    const source = intake.copyTerrainSource(asset());
    const changedVersion = intake.terrainGeometry(source, [0, 0, 0], [2, 1, 3], false, null, {
        ...identity,
        schemaSha256: 'other',
    });
    assert.ok(!sameStaticMeshKey(a.intake.key, changedVersion.intake.key));
});
test('source snapshot does not reread caller samples on center/material changes', () => {
    const values = [...heights],
        source = intake.copyTerrainSource(asset(values));
    values.fill(99);
    assert.equal(intake.terrainGeometry(source, [0, 0, 0], [1, 1, 1], false, null, identity).positions[1], 0);
});
test('real TerrainAsset source dimensions and decoded heights, not only structural mock', () => {
    const { TerrainAsset, TERRAIN_HEIGHT_BASE } = load(path.join(root, 'src/cocos/terrain/terrain-asset.ts'));
    const a = new TerrainAsset();
    a.blockCount = [1, 1];
    a.tileSize = 2;
    a.heights = new Uint16Array(33 * 33).fill(TERRAIN_HEIGHT_BASE + 128);
    const g = geometry(a, [0, 0, 0], [1, 1, 1]);
    assert.equal(g.terrain.countX, 33);
    assert.equal(g.terrain.countZ, 33);
    assert.deepEqual(g.positions.slice(-3), [64, 1, 64]);
});
test('holes, nonfinite, collapsed triangles, scale and budget reject before native cook', () => {
    for (const changed of [
        { holes: [] },
        { holeMask: [] },
        { materialIndices: [] },
        { getHeight: () => NaN },
        { getVertexCountI: () => 1 },
        { getVertexCountI: () => 1000000 },
        { tileSize: 0 },
    ])
        assert.throws(() => geometry({ ...asset(), ...changed }));
    for (const scale of [
        [-1, 1, 1],
        [0, 1, 1],
        [1e-50, 1, 1],
        [Infinity, 1, 1],
    ])
        assert.throws(() => geometry(asset(), [0, 0, 0], scale));
    assert.throws(() => geometry(asset(), [1e8, 0, 0], [1, 1, 1]));
    assert.throws(() => intake.terrainGeometry(null, [0, 0, 0], [1, 1, 1], true, null, identity));
});
test('actual TerrainCollider setter is candidate-first only for Box3D and respects mutation guard', () => {
    const { TerrainCollider } = load(
        path.join(root, 'src/cocos/physics/framework/components/colliders/terrain-collider.ts'),
    );
    const c = new TerrainCollider(),
        before = asset(),
        after = asset([...heights].reverse());
    c.terrain = before;
    c._shape = {
        setTerrain() {
            throw new Error('native preflight failed');
        },
    };
    assert.throws(() => {
        c.terrain = after;
    });
    assert.equal(c.terrain, before);
    mutationAllowed = false;
    assert.throws(() => {
        c.terrain = null;
    });
    assert.equal(c.terrain, before);
    mutationAllowed = true;
    selector.id = 'physx';
    assert.throws(() => {
        c.terrain = after;
    });
    assert.equal(c.terrain, after);
    selector.id = 'box3d';
});

mocks.set(path.join(base, 'shared-body.ts'), {
    bodyVector: (v) =>
        Object.freeze(
            [v.x, v.y, v.z].map((n) => {
                assert.ok(Number.isFinite(n));
                return Math.fround(n);
            }),
        ),
    filterBits: (n) => n >>> 0,
});
const { Box3DTerrainShape } = load(path.join(base, 'terrain-shape.ts'));
function shapeHarness(terrain = asset(), rigidType = 2) {
    const state = {
        geometry: null,
        acquired: 0,
        validated: 0,
        released: 0,
        enabled: false,
        refuse: false,
        static: true,
        commits: 0,
    };
    const body = {
        initialScale: [2, 1, 3],
        impl: {},
        rigidBody: {},
        cleanupOnly: false,
        assertConfiguration() {},
        assertStaticMesh() {
            if (!state.static) throw new Error('static-only');
        },
        validateStaticMesh() {
            ++state.validated;
            if (state.refuse) throw new Error('cook refused');
        },
        setShape(ref, g) {
            if (state.refuse) throw new Error('cook refused');
            state.geometry = g;
        },
        removeShape() {
            state.geometry = null;
        },
        release() {
            ++state.released;
        },
        componentEnabled(ref, active) {
            state.enabled = active;
        },
    };
    const world = {
        staticMeshIdentity: identity,
        assertComponentConfiguration() {},
        prepareInitialShapeMaterial(ref, value, copy) {
            const copied = copy(null);
            return {
                copied,
                material: null,
                initialization: {
                    assertValid() {},
                    complete() {
                        ++state.commits;
                    },
                    fail: (e) => e,
                    close() {},
                },
            };
        },
        acquireSharedBody() {
            ++state.acquired;
            return body;
        },
    };
    const collider = {
        center: { x: 0, y: 0, z: 0 },
        terrain,
        isTrigger: false,
        needCollisionEvent: false,
        needTriggerEvent: false,
        node: {
            worldScale: { x: 2, y: 1, z: 3 },
            getComponent: () => (rigidType === null ? null : { type: rigidType }),
        },
    };
    const shape = new Box3DTerrainShape(() => world, {});
    return { shape, state, collider, body };
}
test('actual TerrainShape lifecycle: pending/null/swap/disabled setters/rollback/destroy', () => {
    const { shape, state, collider } = shapeHarness(null);
    shape.initialize(collider);
    shape.onLoad();
    shape.onEnable();
    assert.equal(state.geometry, null);
    assert.equal(shape.impl.kind, 'terrain-shape');
    assert.equal(shape.impl.nativeKind, 'mesh');
    shape.setTerrain(asset());
    const original = state.geometry;
    assert.equal(original.publicKind, 'terrain');
    state.refuse = true;
    assert.throws(() => shape.setTerrain(asset(heights.map((n) => n + 2))));
    assert.equal(state.geometry, original);
    state.refuse = false;
    shape.setCenter({ x: 1, y: 2, z: -1 });
    assert.deepEqual(state.geometry.positions.slice(0, 3), [2, 2, -3]);
    shape.onDisable();
    assert.equal(state.geometry, null);
    const validated = state.validated;
    shape.setTerrain(asset(heights.map((n) => n + 1)));
    assert.ok(state.validated > validated);
    state.refuse = true;
    assert.throws(() => shape.setTerrain(asset(heights.map((n) => n + 7))));
    state.refuse = false;
    shape.onEnable();
    assert.equal(state.geometry.positions[1], 3);
    shape.setTerrain(null);
    assert.equal(state.geometry, null);
    shape.onDestroy();
    shape.onDestroy();
    assert.equal(state.released, 1);
});
test('actual TerrainShape refuses nonstatic before acquire including null terrain; events fail closed', () => {
    for (const type of [1, 4]) {
        // Cocos DYNAMIC/KINEMATIC; only exact STATIC=2 admitted.
        const { shape, collider, state } = shapeHarness(null, type);
        assert.throws(() => shape.initialize(collider));
        assert.equal(state.acquired, 0);
    }
    const { shape, collider, state } = shapeHarness();
    shape.initialize(collider);
    shape.onEnable();
    const original = state.geometry;
    assert.throws(() => shape.setAsTrigger(true));
    assert.equal(state.geometry, original);
    collider.needCollisionEvent = true;
    assert.throws(() => shape.updateEventListener());
    collider.needCollisionEvent = false;
    state.static = false;
    assert.throws(() => shape.setTerrain(null));
    assert.equal(state.geometry, original);
});

test('actual SharedBody type guard covers null/disabled Terrain references before target cleanup/native writes', () => {
    const sharedFile = path.join(base, 'shared-body.ts');
    mocks.delete(sharedFile);
    mocks.set(path.join(base, 'world-writeback.ts'), {
        Box3DSceneTransform: class {
            records() {
                return [];
            }
            preflight() {}
        },
    });
    mocks.set(path.join(root, 'src/cocos/physics/framework/components/colliders/mesh-collider.ts'), {
        MeshCollider: class {},
    });
    const { Box3DSharedBody } = load(sharedFile);
    const { TerrainCollider } = load(
        path.join(root, 'src/cocos/physics/framework/components/colliders/terrain-collider.ts'),
    );
    let nativeWrites = 0,
        cleanups = 0;
    const state = Object.freeze({ type: 0, enabled: false });
    const binding = {
        createBody: () => ({}),
        setBodyEnabled() {},
        setBodySleepThreshold() {},
        bodyState: () => state,
        setBodyType() {
            ++nativeWrites;
            return state;
        },
    };
    const owner = {
        invalidate() {},
        adoptBody: () => ({}),
        assertReady() {},
        attachComponent() {},
        isFaulted: () => false,
        releaseComponent() {},
        prepareTargetTransition() {
            ++cleanups;
            return false;
        },
    };
    const node = {
        worldPosition: { x: 0, y: 0, z: 0 },
        worldRotation: { x: 0, y: 0, z: 0, w: 1 },
        worldScale: { x: 1, y: 1, z: 1 },
        worldMatrix: { m00: 1, m01: 0, m02: 0, m04: 0, m05: 1, m06: 0, m08: 0, m09: 0, m10: 1 },
        getComponent: () => null,
    };
    const configuration = { collisionMask: () => 0xffffffff, sleepThreshold: () => 0.1 };
    const body = new Box3DSharedBody(binding, {}, node, owner, configuration);
    const reference = {},
        retainedOther = {};
    body.retain(reference, { kind: 'collider', component: new TerrainCollider() });
    body.retain(retainedOther, { kind: 'body', component: {} });
    for (const type of [1, 4]) {
        assert.throws(() => body.setType(type));
        assert.equal(nativeWrites, 0);
        assert.equal(cleanups, 0);
        const rigid = {
            type,
            mass: 1,
            linearDamping: 0,
            angularDamping: 0,
            useGravity: true,
            allowSleep: true,
            linearFactor: { x: 1, y: 1, z: 1 },
            angularFactor: { x: 1, y: 1, z: 1 },
            group: 1,
        };
        assert.throws(() => body.attachRigidBody(rigid, configuration));
        assert.equal(nativeWrites, 0);
        assert.equal(cleanups, 0);
    }
    // Releasing the actual owner, not merely disabling/removing geometry, retires the restriction.
    body.release(reference);
    body.setType(4);
    assert.equal(nativeWrites, 1);
});

test('authored 100000001 center/scale cannot lose one metre through premature fround', () => {
    const flat = asset(Array(9).fill(0));
    const initial = shapeHarness(flat);
    initial.collider.center = { x: 0, y: 100000001, z: 0 };
    assert.throws(() => initial.shape.initialize(initial.collider), /PRECISION/);
    assert.equal(initial.state.acquired, 0);
    const scaled = shapeHarness(flat);
    scaled.collider.node.worldScale = { x: 100000001, y: 1, z: 3 };
    assert.throws(() => scaled.shape.initialize(scaled.collider), /PRECISION/);
    assert.equal(scaled.state.acquired, 0);
    const live = shapeHarness(flat);
    live.shape.initialize(live.collider);
    live.shape.onEnable();
    const before = live.state.geometry;
    assert.throws(() => live.shape.setCenter({ x: 0, y: 100000001, z: 0 }), /PRECISION/);
    assert.equal(live.state.geometry, before);
    const pending = shapeHarness(null);
    pending.collider.center = { x: 0, y: 100000001, z: 0 };
    pending.shape.initialize(pending.collider);
    pending.shape.onEnable();
    assert.throws(() => pending.shape.setTerrain(flat), /PRECISION/);
    assert.equal(pending.state.geometry, null);
    pending.shape.setCenter({ x: 0, y: 0, z: 0 });
    pending.shape.setTerrain(flat);
    assert.equal(pending.state.geometry.positions[1], 0);
    const amplified = shapeHarness(asset(Array(9).fill(1.00000006)));
    amplified.collider.node.worldScale = { x: 2, y: 1000000, z: 3 };
    assert.throws(() => amplified.shape.initialize(amplified.collider), /PRECISION/);
    assert.equal(amplified.state.acquired, 0);
    // The rejected center never enters the adapter cache used by a later asset update.
    live.shape.setTerrain(flat);
    assert.equal(live.state.geometry.positions[1], 0);
});
