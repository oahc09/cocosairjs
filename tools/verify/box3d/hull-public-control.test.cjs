/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Actual changed source, injected Cocos asset/lifecycle/native seams only. NOT a native, browser or C14 acceptance run.
 * HULL_SOURCE_ROOT/HULL_DEPENDENCY_ROOT permit the independent review candidate without changing the worktree.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { test } = require('node:test');
const root = path.resolve(process.env.HULL_SOURCE_ROOT || path.join(__dirname, '../../..'));
const dependencyRoot = path.resolve(process.env.HULL_DEPENDENCY_ROOT || root);
const ts = require(path.join(dependencyRoot, 'node_modules/typescript'));
const actual = (file) =>
    fs.existsSync(path.join(root, file)) ? path.join(root, file) : path.join(dependencyRoot, file);
const read = (file) => fs.readFileSync(actual(file), 'utf8');
function load(file, imports = {}, source = read(file)) {
    const output = ts.transpileModule(source, {
        fileName: file,
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.CommonJS,
            experimentalDecorators: true,
        },
        reportDiagnostics: true,
    });
    assert.equal(output.diagnostics.length, 0, file);
    const compiled = new Module(file, module);
    compiled.require = (name) => {
        assert(Object.hasOwn(imports, name), `Unexpected runtime import ${file}: ${name}`);
        return imports[name];
    };
    compiled._compile(output.outputText, file);
    return compiled.exports;
}
const binding = load('src/air/physics/box3d/world-binding.ts');
const unsupported = load('src/air/physics/box3d/unsupported.ts', { './world-binding': binding });
const guard = load('src/cocos/core/data/mutation-guard.ts');
const gfxFile = 'src/cocos/gfx/base/define.ts';
const gfxSource = ts.createSourceFile(gfxFile, read(gfxFile), ts.ScriptTarget.Latest, true);
const gfx = load(
    gfxFile,
    {},
    gfxSource.statements
        .filter((n) => ts.isEnumDeclaration(n) && ['AttributeName', 'FormatType'].includes(n.name.text))
        .map((n) => n.getText(gfxSource))
        .join('\n'),
);
const geometry = load('src/air/physics/box3d/hull-geometry.ts', {
    '../../../cocos/gfx/base/define': gfx,
    './world-binding': binding,
    './unsupported': unsupported,
});
const selector = { id: 'box3d' };
const noop = () => {};
class ColliderSeam {
    constructor() {
        this.center = { x: 0, y: 0, z: 0 };
        this.isTrigger = false;
        this.needCollisionEvent = false;
        this.needTriggerEvent = false;
        this.node = { worldScale: { x: 1, y: 1, z: 1 } };
    }
}
const component = load('src/cocos/physics/framework/components/colliders/mesh-collider.ts', {
    '../../../../core/data/mutation-guard': guard,
    '../../physics-selector': { selector },
    'cc.decorator': {
        ccclass: () => noop,
        help: () => noop,
        executeInEditMode: (c) => c,
        menu: () => noop,
        type: () => noop,
        editable: noop,
        serializable: noop,
        tooltip: () => noop,
    },
    './collider': { Collider: ColliderSeam },
    '../../../../3d/assets': { Mesh: class {} },
    '../../physics-enum': { EColliderType: { MESH: 5 }, ERigidBodyType: { DYNAMIC: 1 } },
    '../../../../core': { warnID: noop },
    '../rigid-body': { RigidBody: class {} },
});
const sharedModule = load('src/air/physics/box3d/shared-body.ts', {
    './world-binding': binding,
    './unsupported': unsupported,
    './world-writeback': {
        Box3DSceneTransform: class {
            constructor(node) {
                this.node = node;
            }
            preflight() {}
            records() {
                return [{ node: this.node }];
            }
        },
    },
});
const shapes = load('src/air/physics/box3d/hull-shape.ts', {
    './shared-body': sharedModule,
    './box-sphere-geometry': { primitiveMaterial: (v) => v },
    './hull-geometry': geometry,
    './world-binding': binding,
    './unsupported': unsupported,
});
const tetra = [0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 4];
function mesh(parts = [tetra], format = { count: 3, size: 12, type: gfx.FormatType.FLOAT }) {
    const values = parts.map((p) => [...p]);
    return {
        struct: { primitives: parts.map(() => ({})) },
        values,
        readAttributeFormat: () => format,
        readAttribute: (i, name) => {
            assert.equal(name, gfx.AttributeName.ATTR_POSITION);
            return values[i];
        },
    };
}
function harness(enabled = true) {
    selector.id = 'box3d';
    const collider = new component.MeshCollider();
    const calls = [];
    let reject = null,
        seed,
        current = null;
    const shared = {
        initialScale: [1, 1, 1],
        impl: {},
        rigidBody: null,
        assertConfiguration: noop,
        setShape: (_ref, value) => {
            calls.push(['create', value]);
            if (reject) throw reject;
            current = value;
        },
        validateHull: (value) => {
            calls.push(['validate', value]);
            if (reject) throw reject;
        },
        removeShape: () => {
            calls.push(['remove']);
            current = null;
        },
        componentEnabled: (_ref, value) => calls.push(['enabled', value]),
        release: () => calls.push(['release']),
        applyCopiedMaterial: noop,
        prepareMaterialValues: () => ({ shape: null, commitCaches: noop }),
        copiedTransform: () => [0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    };
    const world = {
        assertComponentConfiguration: noop,
        assertAcceptedShapeMaterialIdentity: noop,
        prepareInitialShapeMaterial: (_adapter, _component, copy) => ({
            material: null,
            copied: copy(null),
            initialization: { assertValid: noop, complete: noop, close: noop, fail: (e) => e },
        }),
        acquireSharedBody: (_node, _ref, _configuration, value) => {
            seed = value;
            return shared;
        },
    };
    const shape = new shapes.Box3DHullShape(() => world, {});
    collider._shape = shape;
    shape.initialize(collider);
    if (enabled) shape.onEnable();
    calls.length = 0;
    return {
        collider,
        shape,
        shared,
        calls,
        seed,
        reject: (e) => {
            reject = e;
        },
        current: () => current,
    };
}

test('actual MeshCollider keeps legal legacy callback/cache order and null convex does not dispatch', () => {
    selector.id = 'cannon.js';
    const c = new component.MeshCollider();
    const calls = [];
    c._shape = {
        setMesh: (m) => calls.push([m, c.mesh, c.convex]),
        setConvex: () => {
            throw new Error('legacy regression');
        },
    };
    c.convex = true;
    assert.deepEqual(calls, []);
    const m = mesh();
    c.mesh = m;
    c.convex = false;
    assert.deepEqual(calls, [
        [m, m, true],
        [m, m, false],
    ]);
    selector.id = 'box3d';
});
for (const enabled of [true, false]) {
    test(`null pending ${enabled}: boolean toggles and material lifecycle never create a shape`, () => {
        const h = harness(enabled);
        h.collider.convex = true;
        h.collider.convex = false;
        h.collider.convex = true;
        h.seed.applyMaterial({}, { friction: 0.4, restitution: 0.1 });
        h.seed.prepareMaterialValues({}, { friction: 0.7, restitution: 0.2 }).commitCaches();
        assert(!h.calls.some(([name]) => name === 'create' || name === 'validate'));
        assert.equal(h.collider.mesh, null);
        assert.equal(h.collider.convex, true);
        assert.throws(() => h.shape.getAABB({ center: {}, halfExtents: {} }), { code: 'AIR_E_BOX3D_GEOMETRY' });
    });
    test(`null ${enabled}: invalid convex input preserves exact component/adapter caches`, () => {
        const h = harness(enabled);
        h.collider.convex = true;
        for (const value of [null, undefined, 1, 0, 'true', NaN, Infinity, {}, []]) {
            assert.throws(
                () => {
                    h.collider.convex = value;
                },
                { code: 'AIR_E_BOX3D_CONFIG' },
            );
            assert.equal(h.collider.convex, true);
            assert.equal(h.collider.mesh, null);
        }
        assert.equal(h.calls.length, 0);
    });
    test(`valid hull ${enabled}: rejected cook preserves exact mesh identity and permits recovery`, () => {
        const h = harness(enabled);
        h.collider.convex = true;
        const old = mesh();
        h.collider.mesh = old;
        const failure = Object.assign(new Error('injected native geometry rejection'), {
            code: 'AIR_E_BOX3D_GEOMETRY',
        });
        h.reject(failure);
        for (let n = 0; n < 2; ++n) {
            assert.throws(() => {
                h.collider.mesh = mesh();
            }, failure);
            assert.equal(h.collider.mesh, old);
        }
        assert.throws(
            () => {
                h.collider.convex = false;
            },
            { code: 'AIR_E_BOX3D_UNSUPPORTED' },
        );
        assert.equal(h.collider.convex, true);
        assert.equal(h.collider.mesh, old);
        h.reject(null);
        const next = mesh([tetra.map((v) => v * 2)]);
        h.collider.mesh = next;
        assert.equal(h.collider.mesh, next);
        if (!enabled) assert(h.calls.every(([name]) => name === 'validate'));
    });
}
for (const field of ['mesh', 'convex'])
    test(`guard admits before same-value ${field} and before any delegate`, () => {
        const h = harness();
        const lease = guard.registerMutationGuard([h.collider], { code: 'HULL_LOCKED', message: 'owned' });
        try {
            assert.throws(
                () => {
                    h.collider[field] = h.collider[field];
                },
                { code: 'HULL_LOCKED' },
            );
            assert.equal(h.calls.length, 0);
        } finally {
            lease.dispose();
        }
    });
test('mesh null removes actual active geometry and reactivation restores, without phantom default shape', () => {
    const h = harness();
    h.collider.convex = true;
    const m = mesh();
    h.collider.mesh = m;
    assert.equal(h.current().kind, 'hull');
    h.collider.mesh = null;
    assert.equal(h.current(), null);
    h.collider.mesh = m;
    assert.equal(h.current().kind, 'hull');
    h.shape.onDisable();
    assert.equal(h.current(), null);
    h.shape.onEnable();
    assert.equal(h.current().kind, 'hull');
    h.shape.onDestroy();
    assert.equal(h.current(), null);
    assert.equal(h.calls.at(-1)[0], 'release');
});
test('copies all POSITION streams, preserves more than 128 inputs, and never reads bounds or indices', () => {
    const m = mesh([tetra, Array.from({ length: 600 }, (_, i) => (i % 3 ? 0.1 : 0.2))]);
    Object.defineProperties(m, {
        minPosition: {
            get: () => {
                throw new Error('bounds fallback');
            },
        },
        maxPosition: {
            get: () => {
                throw new Error('bounds fallback');
            },
        },
    });
    const points = geometry.copyHullPoints(m);
    assert.equal(points.length, 612);
    assert(Object.isFrozen(points));
    m.values[0][0] = 99;
    assert.equal(points[0], 0);
});
test('center and nonuniform scale are baked exactly once; rotation and body origin are not rebaked', () => {
    const value = geometry.hullGeometry(tetra, true, [1, 2, 3], [2, 3, 4], false, null);
    assert.deepEqual(value.positions, [2, 6, 12, 6, 6, 12, 2, 15, 12, 2, 6, 28]);
    const bounds = geometry.hullBounds(value, [10, 20, 30, 0, 0, 0, 1, 100, 200, 300]);
    assert.deepEqual(bounds.center, [14, 30.5, 50]);
    assert.deepEqual(bounds.halfExtents, [2, 4.5, 8]);
});
test('float16 storage decodes finite/subnormal coordinates and rejects encoded infinity/NaN', () => {
    const format = { count: 3, size: 6, type: gfx.FormatType.FLOAT };
    const source = tetra.map((v) => (v === 2 ? 0x4000 : v === 3 ? 0x4200 : v === 4 ? 0x4400 : 0));
    assert.deepEqual(geometry.copyHullPoints(mesh([source], format)), tetra);
    source[0] = 1;
    assert.equal(geometry.copyHullPoints(mesh([source], format))[0], 2 ** -24);
    for (const bits of [0x7c00, 0xfc00, 0x7e00]) {
        source[0] = bits;
        assert.throws(() => geometry.copyHullPoints(mesh([source], format)));
    }
});
for (const [type, max, min] of [
    [gfx.FormatType.UNORM, 255, 0],
    [gfx.FormatType.SNORM, 127, -128],
])
    test(`normalized POSITION format ${type} decodes storage values, not huge coordinates`, () => {
        const points = geometry.copyHullPoints(mesh([[max, min, 0, ...tetra.slice(3)]], { count: 3, size: 3, type }));
        assert.equal(points[0], 1);
        assert.equal(points[1], min === 0 ? 0 : -1);
    });
test('empty, nonfinite, malformed and nonconvex inputs refuse before native candidate creation', () => {
    const h = harness();
    h.collider.convex = true;
    for (const m of [
        mesh([]),
        mesh([[1, 2, 3]]),
        mesh([[...tetra.slice(0, 11), Infinity]]),
        mesh([tetra], { count: 2 }),
    ])
        assert.throws(() => {
            h.collider.mesh = m;
        });
    assert.equal(h.collider.mesh, null);
    assert.equal(h.calls.length, 0);
    h.collider.convex = false;
    assert.throws(
        () => {
            h.collider.mesh = mesh();
        },
        { code: 'AIR_E_BOX3D_UNSUPPORTED' },
    );
    assert.equal(h.calls.length, 0);
});

function sharedHarness(create) {
    const trace = [],
        reference = {},
        world = {},
        bodyId = { low: 1, high: 0 };
    const node = {
        worldPosition: { x: 0, y: 0, z: 0 },
        worldRotation: { x: 0, y: 0, z: 0, w: 1 },
        worldScale: { x: 1, y: 1, z: 1 },
        worldMatrix: { m00: 1, m01: 0, m02: 0, m04: 0, m05: 1, m06: 0, m08: 0, m09: 0, m10: 1 },
    };
    let fault = null,
        enabled = false;
    const owner = {
        assertReady: noop,
        assertCommittedRead: noop,
        isFaulted: () => !!fault,
        adoptBody: () => ({}),
        attachComponent: noop,
        invalidate: () => trace.push('invalidate'),
        fault: (e) => {
            fault = e;
        },
        registerShapeMaterial: noop,
        unregisterShapeMaterial: noop,
    };
    const native = {
        createBody: () => bodyId,
        setBodyEnabled: (_w, _b, value) => {
            enabled = value;
            return Object.freeze({ enabled });
        },
        setBodySleepThreshold: noop,
        createHull: (...args) => create(...args),
        bodyState: () => Object.freeze({ enabled }),
        configureShapeEvents: () => trace.push('events'),
        setShapeFilters: () => [{ group: 1, mask: 0xffffffff }],
        destroyShape: () => trace.push('destroy'),
    };
    const body = new sharedModule.Box3DSharedBody(native, world, node, owner, {
        collisionMask: () => -1,
        sleepThreshold: () => 0.1,
    });
    body.retain(reference, { kind: 'collider', component: {} });
    trace.length = 0;
    return { body, reference, native, trace, fault: () => fault };
}
const phased = (phase) => Object.defineProperty(new Error(phase), 'mutationOutcome', { value: phase });
for (const phase of ['not-mutated', 'committed', undefined])
    test(`SharedBody createHull failure phase ${phase} is not inferred from missing token`, () => {
        const failure = phase ? phased(phase) : new Error('trap unknown');
        const h = sharedHarness(() => {
            throw failure;
        });
        assert.throws(
            () => h.body.setShape(h.reference, geometry.hullGeometry(tetra, true, [0, 0, 0], [1, 1, 1], false, null)),
            failure,
        );
        assert.equal(h.fault(), phase === 'not-mutated' ? null : failure);
        assert(!h.trace.includes('destroy'));
    });
test('post-native create/remove failures stay committed even if a later operation reports not-mutated', () => {
    const h = sharedHarness(() => ({ low: 2, high: 0 }));
    h.native.setShapeFilters = () => {
        throw phased('not-mutated');
    };
    let failure;
    try {
        h.body.setShape(h.reference, geometry.hullGeometry(tetra, true, [0, 0, 0], [1, 1, 1], false, null));
    } catch (e) {
        failure = e;
    }
    assert.equal(failure.mutationOutcome, 'committed');
    assert.equal(h.fault(), failure);
    assert(h.trace.includes('destroy'));
    const phase = Object.getOwnPropertyDescriptor(failure, 'mutationOutcome');
    assert.equal(phase.writable, false);
    assert.equal(phase.configurable, false);
    const removal = sharedHarness(() => ({ low: 3, high: 0 }));
    removal.body.setShape(removal.reference, geometry.hullGeometry(tetra, true, [0, 0, 0], [1, 1, 1], false, null));
    removal.native.setBodyEnabled = () => {
        throw phased('not-mutated');
    };
    assert.throws(
        () => removal.body.removeShape(removal.reference),
        (error) => error.mutationOutcome === 'committed',
    );
    assert.equal(removal.fault().mutationOutcome, 'committed');
});
console.log(
    'Scope: actual changed source with explicit injected seams only. Native Release/Debug, C14, EX01 browser, 2128 cells and nine Gates NOT_RUN.',
);
