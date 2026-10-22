/**
 * Focused source/native regression, not browser or public-component acceptance.
 * Runs the actual MeshCollider setters, Box3D shape adapter and native Release/Debug
 * modules. Cocos lifecycle, decorators, transform and Mesh buffer access use explicit
 * CPU seams; native geometry, cooking, calls, counters and rays are never fabricated.
 * Read-only apart from Node's ordinary process execution; writes no evidence files.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const ts = require('typescript');
const { buildSync } = require('esbuild');
const fixture = require('./fixture.json');
const root = path.resolve(__dirname, '../../../..');
const componentFile = 'src/cocos/physics/framework/components/colliders/mesh-collider.ts';
const shapeFile = 'src/air/physics/box3d/shapes.ts';
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
function load(source, filename, imports = {}) {
    const output = ts.transpileModule(source, {
        fileName: filename,
        compilerOptions: {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.CommonJS,
            experimentalDecorators: true,
        },
        reportDiagnostics: true,
    });
    assert.equal(output.diagnostics.length, 0);
    const compiled = new Module(filename, module);
    compiled.require = (name) => {
        assert(Object.hasOwn(imports, name), `Unexpected runtime dependency in ${filename}: ${name}`);
        return imports[name];
    };
    compiled._compile(output.outputText, filename);
    return compiled.exports;
}
const nativeSources = ['native-world', 'cooking', 'math', 'lifecycle-state'].map(
    (name) => `src/air/physics/box3d/${name}.ts`,
);
const compiled = new Module(__filename, module);
compiled._compile(
    buildSync({
        stdin: {
            contents: [...nativeSources, 'src/air/errors.ts'].map((file) => `export * from './${file}';`).join('\n'),
            resolveDir: root,
        },
        bundle: true,
        platform: 'node',
        format: 'cjs',
        write: false,
    }).outputFiles[0].text,
    __filename,
);
const native = compiled.exports;
const PhysicsSystem = { instance: { defaultMaterial: null, physicsWorld: null } };
// Load the actual enum declarations without initializing the browser renderer.
const gfxFile = 'src/cocos/gfx/base/define.ts';
const gfxSource = ts.createSourceFile(gfxFile, read(gfxFile), ts.ScriptTarget.Latest, true);
const gfx = load(
    gfxSource.statements
        .filter((node) => ts.isEnumDeclaration(node) && ['AttributeName', 'PrimitiveMode'].includes(node.name.text))
        .map((node) => node.getText(gfxSource))
        .join('\n'),
    gfxFile,
);
const { Box3DTrimeshShape } = load(read(shapeFile), shapeFile, {
    '../../../cocos/physics/framework/physics-system': { PhysicsSystem },
    '../../errors': native,
    './math': native,
    './cooking': native,
    '../../../cocos/gfx/base/define': gfx,
    './lifecycle-state': native,
});
class ColliderSeam {
    constructor() {
        this._center = { x: 0, y: 0, z: 0 };
        this._isTrigger = false;
        this._material = null;
        this.enabled = true;
    }
    get center() {
        return this._center;
    }
    get isTrigger() {
        return this._isTrigger;
    }
    get sharedMaterial() {
        return this._material;
    }
    set sharedMaterial(value) {
        this._material = value;
    }
}
class MeshSeam {
    constructor(points, empty = false) {
        this.uuid = '';
        this.vertices = new Float32Array(points.map(Number));
        this.indices = new Uint32Array(fixture.indices);
        this.struct = {
            primitives: empty ? [] : [{ primitiveMode: gfx.PrimitiveMode.TRIANGLE_LIST, indexView: { stride: 4 } }],
        };
    }
    readAttributeFormat() {
        return { count: 3 };
    }
    readAttribute() {
        return this.vertices;
    }
    readIndices() {
        return this.indices;
    }
}
const noop = () => {};
const decoratorFactory = () => noop;
function colliderClass(source = read(componentFile)) {
    return load(source, componentFile, {
        'cc.decorator': {
            ccclass: decoratorFactory,
            help: decoratorFactory,
            executeInEditMode: (target) => target,
            menu: decoratorFactory,
            type: decoratorFactory,
            editable: noop,
            serializable: noop,
            tooltip: decoratorFactory,
        },
        './collider': { Collider: ColliderSeam },
        '../../../../3d/assets': { Mesh: MeshSeam },
        '../../physics-enum': { EColliderType: { MESH: 5 }, ERigidBodyType: { DYNAMIC: 1 } },
        '../../../../core': { warnID: noop },
        '../rigid-body': { RigidBody: class {} },
    }).MeshCollider;
}
const MeshCollider = colliderClass();
let nodeId = 0;
function makeNode() {
    return {
        uuid: `pending-convex-unit-${++nodeId}`,
        worldPosition: { x: 0, y: 0, z: 0 },
        worldRotation: { x: 0, y: 0, z: 0, w: 1 },
        worldScale: { x: 1, y: 1, z: 1 },
        worldMatrix: { m00: 1, m01: 0, m02: 0, m04: 0, m05: 1, m06: 0, m08: 0, m09: 0, m10: 1 },
        setWorldPosition(x, y, z) {
            this.worldPosition = { x, y, z };
        },
        setWorldRotation(x, y, z, w) {
            this.worldRotation = { x, y, z, w };
        },
    };
}
const copy = (value) => JSON.parse(JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? String(v) : v)));
const enumValue = (value) => (typeof value === 'number' ? value : value.value);
function harness(m, { enabled = true, dynamic = false, Class = MeshCollider } = {}) {
    const world = new native.Box3DNativeWorld(m);
    m.b3World_SetGravity(world.id, [0, 0, 0]);
    PhysicsSystem.instance.physicsWorld = { native: world };
    const collider = new Class();
    collider.node = makeNode();
    const shape = new Box3DTrimeshShape();
    collider._shape = shape;
    shape.initialize(collider);
    shape.record.rigidOwner = {};
    shape.record.rigidEnabled = true;
    if (dynamic) shape.record.updateSettings({ type: 1 });
    if (enabled) shape.onEnable();
    else collider.enabled = false;
    const snapshot = () => ({
        convex: collider.convex,
        mesh: collider.mesh,
        id: copy(shape.impl),
        counters: copy(m.getBindingCounters()),
        cache: copy(native.cookingCache(m).counters),
    });
    const close = () => {
        shape.onDestroy();
        world.destroy();
        for (const [key, value] of Object.entries(m.getBindingCounters())) assert.equal(String(value), '0', key);
        const cache = native.cookingCache(m).counters;
        for (const key of ['entries', 'leases', 'nativeRefs', 'nativeGeometryBytes']) assert.equal(cache[key], 0, key);
        assert.equal(cache.created, cache.freed);
    };
    const recover = (asset = new MeshSeam(fixture.tetra)) => {
        collider.mesh = asset;
        if (!shape.enabled) {
            collider.enabled = true;
            shape.onEnable();
        }
        world.step(1 / 60);
        assert.equal(world.errors.length, 0);
        assert.equal(enumValue(m.b3Shape_GetType(shape.impl)), collider.convex ? 3 : 4);
        if (collider.convex) assert.equal(m.b3Shape_GetHullVertices(shape.impl).length, 12);
        const ray = m.b3Shape_RayCast(shape.impl, [0.4, 0.6, 8], [0, 0, -12]);
        assert.equal(ray.hit, true);
        ray.point.forEach((value, i) => assert(Math.abs(value - [0.4, 0.6, 2.4][i]) <= 1e-4));
    };
    return { collider, shape, world, snapshot, close, recover };
}
test('legacy backends retain their original nonnull-only mesh callback', () => {
    const c = new MeshCollider();
    const calls = [];
    c._shape = { setMesh: (mesh) => calls.push(mesh) };
    c.convex = true;
    assert.deepEqual(calls, []);
    const asset = new MeshSeam(fixture.tetra);
    c.mesh = asset;
    c.convex = false;
    assert.deepEqual(calls, [asset, asset]);
});
for (const variant of ['st', 'st-debug']) {
    test(`${variant}: pending convex transactional regression`, async (t) => {
        const artifact = path.join(root, 'tools/physics/box3d/artifacts', variant);
        const factory = (await import(pathToFileURL(path.join(artifact, 'box3d.mjs')).href)).default;
        const m = await factory({ wasmBinary: fs.readFileSync(path.join(artifact, 'box3d.wasm')) });
        const trace = [];
        for (const name of [...fixture.traceMethods, 'b3CreateMesh', 'b3DestroyMesh']) {
            const original = m[name];
            m[name] = function (...args) {
                trace.push(name);
                return Reflect.apply(original, this, args);
            };
        }
        for (const existing of [false, true]) {
            for (const spec of fixture.meshRejections) {
                await t.test(`${existing ? 'existing hull' : 'pending mesh'}: ${spec.name}`, () => {
                    const h = harness(m);
                    try {
                        h.collider.convex = true;
                        if (existing) h.recover();
                        const before = h.snapshot();
                        for (let attempt = 0; attempt < 2; attempt++) {
                            trace.length = 0;
                            assert.throws(() => (h.collider.mesh = new MeshSeam(spec.points)), { code: spec.code });
                            assert.deepEqual(h.snapshot(), before);
                            assert.deepEqual(trace, spec.nativeHullCalls ? ['b3CreateHull'] : []);
                            h.shape.refresh();
                            h.world.step(1 / 60);
                            assert.deepEqual(h.snapshot(), before);
                        }
                        h.recover(existing ? before.mesh : undefined);
                        assert.equal(h.collider.convex, true);
                        if (existing) assert.deepEqual(copy(h.shape.impl), before.id);
                    } finally {
                        h.close();
                    }
                });
            }
        }
        for (const enabled of [false, true]) {
            for (const toggles of [[true, false, true], [true, false]]) {
                await t.test(`${enabled ? 'enabled' : 'disabled'} null mesh toggles ${toggles.join('/')}`, () => {
                    const h = harness(m, { enabled });
                    try {
                        trace.length = 0;
                        toggles.forEach((value) => (h.collider.convex = value));
                        assert.deepEqual(trace, []);
                        const before = h.snapshot();
                        for (let attempt = 0; attempt < 2; attempt++) {
                            assert.throws(() => (h.collider.mesh = new MeshSeam([], true)), {
                                code: 'AIR_E_BOX3D_GEOMETRY',
                            });
                            assert.deepEqual(h.snapshot(), before);
                        }
                        assert.deepEqual(trace, []);
                        h.recover();
                        assert.equal(h.collider.convex, toggles.at(-1));
                    } finally {
                        h.close();
                    }
                });
            }
            await t.test(`${enabled ? 'enabled' : 'disabled'} dynamic hull rejects nonconvex edit`, () => {
                const h = harness(m, { dynamic: true });
                try {
                    h.collider.convex = true;
                    h.recover();
                    if (!enabled) {
                        h.collider.enabled = false;
                        h.shape.onDisable();
                    }
                    const before = h.snapshot();
                    trace.length = 0;
                    assert.throws(() => (h.collider.convex = false), { code: 'AIR_E_BOX3D_UNSUPPORTED' });
                    assert.deepEqual(h.snapshot(), before);
                    assert.deepEqual(trace, []);
                    h.recover(before.mesh);
                } finally {
                    h.close();
                }
            });
            for (const convex of [false, true]) {
                await t.test(`${enabled ? 'enabled' : 'disabled'} pending ${convex} rejects nonbooleans`, () => {
                    const h = harness(m, { enabled });
                    try {
                        h.collider.convex = convex;
                        const before = h.snapshot();
                        trace.length = 0;
                        for (const value of ['true', 1, 0, null, undefined, NaN, Infinity, {}, []]) {
                            assert.throws(() => (h.collider.convex = value), { code: 'AIR_E_BOX3D_CONFIG' });
                            assert.deepEqual(h.snapshot(), before);
                        }
                        assert.deepEqual(trace, []);
                        h.recover();
                    } finally {
                        h.close();
                    }
                });
            }
        }
        await t.test('negative control: the original setter reproduces convex rollback and mesh recovery', () => {
            const current = read(componentFile);
            const dispatch = `        if (this._shape) {\n            const shape = this.shape;\n            if (shape.setConvex) shape.setConvex(value);\n            else if (this._mesh) shape.setMesh(this._mesh);\n        }`;
            assert(current.includes(dispatch));
            const Class = colliderClass(
                current.replace(dispatch, '        if (this._shape && this._mesh) this.shape.setMesh(this._mesh);'),
            );
            const h = harness(m, { Class });
            try {
                h.collider.convex = true;
                assert.throws(() => (h.collider.mesh = new MeshSeam(fixture.meshRejections[0].points)), {
                    code: 'AIR_E_BOX3D_GEOMETRY',
                });
                assert.equal(h.collider.convex, false, 'The negative control must reproduce the original defect.');
                h.recover();
                assert.equal(enumValue(m.b3Shape_GetType(h.shape.impl)), 4);
            } finally {
                h.close();
            }
        });
    });
}
const fingerprintFiles = [
    componentFile,
    shapeFile,
    'src/cocos/physics/spec/i-physics-shape.ts',
    ...nativeSources,
    'src/air/errors.ts',
    gfxFile,
    path.relative(root, __filename),
    'tools/verify/box3d/convex-contracts/fixture.json',
    ...['st', 'st-debug'].flatMap((variant) =>
        ['box3d.mjs', 'box3d.wasm'].map((file) => `tools/physics/box3d/artifacts/${variant}/${file}`),
    ),
];
console.log(
    JSON.stringify({
        scope: 'CPU seams plus actual setters/Box3D source and native Release/Debug; not browser acceptance.',
        fingerprints: Object.fromEntries(
            fingerprintFiles.map((file) => [
                file,
                createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex'),
            ]),
        ),
    }),
);
