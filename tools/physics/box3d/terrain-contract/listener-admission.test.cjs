/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// CPU only: actual candidate Collider, Eventify/CallbacksInvoker and adapter admission methods.
// No engine bootstrap, WASM instantiation or physics steps.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createHash } = require('node:crypto');
const candidate = path.resolve(__dirname, '../../../..');
const source = process.env.BOX3D_SOURCE_ROOT || candidate;
const ts = require(process.env.BOX3D_TYPESCRIPT || 'typescript');
const cache = new Map();
const selector = { id: 'box3d' };
class Vec3 {}
class Component {
    isValid = true;
}
class Pool {
    constructor(make) {
        this.make = make;
    }
    alloc() {
        return this.make();
    }
    free() {}
}
const js = {
    createMap: () => Object.create(null),
    array: {
        fastRemoveAt: (a, i) => {
            a[i] = a[a.length - 1];
            a.pop();
        },
    },
};
const decorator = new Proxy({}, { get: (_, key) => (key === 'ccclass' ? () => (c) => c : () => {}) });
const worldError = (code, operation, detail) => Object.assign(new Error(`${code}: ${operation}: ${detail}`), { code });
function load(relative) {
    if (cache.has(relative)) return cache.get(relative).exports;
    const filename = fs.existsSync(path.join(candidate, relative))
        ? path.join(candidate, relative)
        : path.join(source, relative);
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        fileName: filename,
        reportDiagnostics: true,
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.CommonJS,
            experimentalDecorators: true,
        },
    });
    assert.equal(output.diagnostics.filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0);
    const mod = { exports: {} };
    cache.set(relative, mod);
    const req = (name) => {
        if (name === 'cc.decorator') return decorator;
        if (name === 'internal:constants') return { TEST: false, EDITOR: false };
        if (name.endsWith('/core'))
            return { Eventify: load('src/cocos/core/event/eventify.ts').Eventify, Vec3, geometry: {}, error() {} };
        if (name.endsWith('/scene-graph')) return { Component, Node: class {} };
        if (name.endsWith('/physics-selector')) return { selector };
        if (name.endsWith('/physics-enum')) return { EColliderType: { TERRAIN: 6 }, EAxisDirection: {} };
        if (name === '../utils/js') return js;
        if (name === '../memop') return { Pool };
        if (name === '../data/object') return { isCCObject: () => false, isValid: () => true };
        if (name === '../global-exports') return { legacyCC: {} };
        if (name === './world-binding') return { worldError };
        if (name === './unsupported') return load('src/air/physics/box3d/unsupported.ts');
        if (name === './contact-equation') return load('src/air/physics/box3d/contact-equation.ts');
        if (name.endsWith('/eventify') || name === './callbacks-invoker')
            return load(path.normalize(path.join(path.dirname(relative), name + '.ts')));
        // Non-event constructor/engine/native dependencies are never called by these controls.
        return {};
    };
    new Function('require', 'module', 'exports', output.outputText)(req, mod, mod.exports);
    return mod.exports;
}
const { Collider } = load('src/cocos/physics/framework/components/colliders/collider.ts');
const { Box3DTerrainShape } = load('src/air/physics/box3d/terrain-shape.ts');
const { Box3DHullShape } = load('src/air/physics/box3d/hull-shape.ts');
const { Box3DCollisionEvents } = load('src/air/physics/box3d/collision-events.ts');
const { Box3DRoundHullShape } = load('src/air/physics/box3d/round-hull-shape.ts');
function admission(Type) {
    const shape = Type === Box3DRoundHullShape ? new Type('cone', () => {}, {}) : new Type(() => {}, {});
    // Only the shared-body ownership/phase boundary is mocked; candidate demand logic is actual source.
    shape.assertConfiguration = () => {};
    return shape.validateEventListener.bind(shape);
}

function collider(validate = admission(Box3DTerrainShape)) {
    const c = new Collider(6);
    let denied = false;
    c._shape = {
        updateEventListener() {
            if (denied) throw worldError('PASSIVE_REJECT', '', '');
        },
        validateEventListener: (collision, trigger) => {
            if (denied) throw worldError('PASSIVE_REJECT', '', '');
            validate(collision, trigger);
        },
    };
    return {
        c,
        deny: (v) => {
            denied = v;
        },
    };
}
const kinds = [
    'onCollisionEnter',
    'onCollisionStay',
    'onCollisionExit',
    'onTriggerEnter',
    'onTriggerStay',
    'onTriggerExit',
    'onControllerTriggerEnter',
    'onControllerTriggerStay',
    'onControllerTriggerExit',
];
test('all unsupported on/once/on-once variants reject before callback and demand publication', () => {
    for (const validate of [admission(Box3DTerrainShape), admission(Box3DHullShape), admission(Box3DRoundHullShape)]) {
        for (const kind of kinds)
            for (const mode of ['on', 'once', 'on-once']) {
                const { c } = collider(validate),
                    fn = () => {},
                    target = {};
                assert.throws(() => (mode === 'on-once' ? c.on(kind, fn, target, true) : c[mode](kind, fn, target)), {
                    code: 'AIR_E_BOX3D_UNSUPPORTED',
                });
                assert.equal(c.hasEventListener(kind), false);
                assert.equal(c.needCollisionEvent, false);
                assert.equal(c.needTriggerEvent, false);
            }
    }
});
test('failed duplicate or different-target registration never deletes existing handler', () => {
    const { c } = collider(() => {}),
        fn = () => {},
        target = {},
        other = {};
    c.on('onCollisionEnter', fn, target);
    c._shape.validateEventListener = admission(Box3DTerrainShape);
    for (const t of [target, other])
        for (const mode of ['on', 'once']) {
            assert.throws(() => c[mode]('onCollisionEnter', fn, t), { code: 'AIR_E_BOX3D_UNSUPPORTED' });
            assert.equal(c.hasEventListener('onCollisionEnter', fn, target), true);
            assert.equal(c.hasEventListener('onCollisionEnter', fn, other), false);
            assert.equal(c.needCollisionEvent, true);
        }
});
test('registration phase rejection precedes on/once edits and preserves exact targets', () => {
    const { c, deny } = collider(() => {}),
        fn = () => {},
        target = {},
        other = {};
    c.on('onCollisionEnter', fn, target);
    c.on('onCollisionEnter', fn, other);
    deny(true);
    for (const edit of [
        () => c.on('onCollisionStay', fn),
        () => c.once('onCollisionStay', fn),
        () => c.on('onCollisionEnter', fn, target),
    ]) {
        assert.throws(edit, { code: 'PASSIVE_REJECT' });
        assert.equal(c.hasEventListener('onCollisionEnter', fn, target), true);
        assert.equal(c.hasEventListener('onCollisionEnter', fn, other), true);
        assert.equal(c.hasEventListener('onCollisionStay'), false);
        assert.equal(c.needCollisionEvent, true);
    }
});
test('supported once/duplicate/target semantics unchanged and no spurious trigger demand', () => {
    const { c } = collider(() => {}),
        target = {};
    let calls = 0;
    const fn = function () {
        assert.equal(this, target);
        calls++;
    };
    c.once('onCollisionEnter', fn, target);
    c.on('onCollisionEnter', fn, target);
    c.emit('onCollisionEnter');
    c.emit('onCollisionEnter');
    assert.equal(calls, 1);
    assert.equal(c.hasEventListener('onCollisionEnter'), false);
    assert.equal(c.needTriggerEvent, false);
});
test('legacy backend retains original mutation-first behavior; no new adapter call', () => {
    const { c } = collider();
    selector.id = 'physx';
    try {
        c.on('onCollisionEnter', () => {});
        assert.equal(c.needCollisionEvent, true);
    } finally {
        selector.id = 'box3d';
    }
});
test('actual collision event demand gate skips listener-free Sphere–Terrain but still rejects demanded pair', () => {
    const { c } = collider();
    assert.throws(() => c.on('onCollisionEnter', () => {}));
    const sphere = {},
        roster = [
            { low: 1, high: 0, collider: c, kind: 'mesh', trigger: false, collisionListener: c.needCollisionEvent },
            { low: 2, high: 0, collider: sphere, kind: 'sphere', trigger: false, collisionListener: false },
        ];
    const snapshot = {
        stepIndex: 1,
        contactsOfOwnedBodies: [{ shapeA: { low: 1, high: 0 }, shapeB: { low: 2, high: 0 } }],
    };
    const events = new Box3DCollisionEvents();
    assert.deepEqual(events.prepare(snapshot, roster), []);
    assert.deepEqual(events.prepare(snapshot, roster), []);
    assert.throws(
        () => events.prepare({ ...snapshot, stepIndex: 2 }, [{ ...roster[0], collisionListener: true }, roster[1]]),
        { code: 'AIR_E_BOX3D_UNSUPPORTED_GEOMETRY' },
    );
    assert.deepEqual(events.prepare({ ...snapshot, stepIndex: 2 }, roster), []);
    assert.throws(() => events.prepare({ ...snapshot, stepIndex: 1 }, roster), { code: 'AIR_E_BOX3D_ABI' });
});

test('demanded qualified-family contacts retain native geometry/epoch/identity fail-closed guards', () => {
    const roster = [
        { low: 1, high: 0, collider: {}, kind: 'box', trigger: false, collisionListener: true },
        { low: 2, high: 0, collider: {}, kind: 'sphere', trigger: false, collisionListener: false },
    ];
    const contact = { shapeA: { low: 1, high: 0 }, shapeB: { low: 2, high: 0 } };
    for (const [geometry, code] of [
        [{ status: 'UNSUPPORTED_GEOMETRY_FAMILY' }, 'AIR_E_BOX3D_UNSUPPORTED_GEOMETRY'],
        [{ status: 'GEOMETRY_UNAVAILABLE' }, 'AIR_E_BOX3D_UNSUPPORTED_SNAPSHOT_EPOCH'],
        [{ status: 'AVAILABLE', source: 'FAKE' }, 'AIR_E_BOX3D_ABI'],
    ]) {
        const events = new Box3DCollisionEvents();
        assert.throws(
            () => events.prepare({ stepIndex: 1, contactsOfOwnedBodies: [{ ...contact, geometry }] }, roster),
            { code },
        );
        assert.deepEqual(events.prepare({ stepIndex: 1, contactsOfOwnedBodies: [] }, roster), []);
    }
});

test('premount unsupported listeners retain original off/removeAll/targetOff recovery', () => {
    for (const Type of [Box3DTerrainShape, Box3DHullShape, Box3DRoundHullShape]) {
        for (const method of ['off', 'removeAll', 'targetOff']) {
            const c = new Collider(6),
                target = {},
                fn = () => {};
            c.on('onCollisionEnter', fn, target);
            const validate = admission(Type);
            c._shape = {
                validateEventListener: validate,
                updateEventListener() {
                    validate(c.needCollisionEvent, c.needTriggerEvent);
                },
            };
            if (method === 'off') c.off('onCollisionEnter', fn, target);
            else if (method === 'removeAll') c.removeAll('onCollisionEnter');
            else c.targetOff(target);
            assert.equal(c.hasEventListener('onCollisionEnter'), false);
            assert.equal(c.needCollisionEvent, false);
            assert.equal(c.needTriggerEvent, false);
            assert.throws(() => c.on('onCollisionEnter', fn), { code: 'AIR_E_BOX3D_UNSUPPORTED' });
            assert.equal(c.hasEventListener('onCollisionEnter'), false);
        }
    }
});
test('real uninitialized adapters reject admission instead of claiming a live ownership phase', () => {
    for (const Type of [Box3DTerrainShape, Box3DHullShape, Box3DRoundHullShape]) {
        const shape = Type === Box3DRoundHullShape ? new Type('cone', () => {}, {}) : new Type(() => {}, {});
        assert.throws(() => shape.validateEventListener(false, false), { code: 'AIR_E_BOX3D_DISPOSED' });
        assert.throws(() => shape.validateEventListener(true, false), { code: 'AIR_E_BOX3D_DISPOSED' });
    }
});

test('removal and once implementations retain the reviewed original source hashes', () => {
    const text = fs.readFileSync(
        path.join(candidate, 'src/cocos/physics/framework/components/colliders/collider.ts'),
        'utf8',
    );
    for (const [start, end, expected] of [
        ['    public off (', '\n    /**', 'bc3538085c7201d2c848fd128c388b28d7a2967016dcef1d9ad0239e6880ef2b'],
        ['    public once<', '\n    /**', 'dbdaefa77b7840fef283a9e1c3961b801cad0c3fa32749a01cd1ef44d5a1e8d4'],
        [
            '    public removeAll (',
            '\n    /// GROUP MASK ///',
            'e5b5f1a6c79dec5128654101da42498b6e01cae20262b28a663e52c6d0786f21',
        ],
        ['    private _updateNeedEvent (', '\n}\n', '28f59538f071a59cbfe0db527b26635fad6a3c22b19f65a9424a81d419f7789c'],
    ]) {
        const i = text.indexOf(start);
        assert(i >= 0);
        const actual = text.slice(i, text.indexOf(end, i));
        assert.equal(createHash('sha256').update(actual).digest('hex'), expected);
    }
});
