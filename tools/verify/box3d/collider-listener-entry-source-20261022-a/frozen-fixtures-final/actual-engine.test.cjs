/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Real engine classes and owner temporary scopes. Original frozen modules are resolver-mapped;
 * only Collider differs between variants. World identity and adapter effects are explicit doubles.
 * No actual World, native solver, WASM, delivered event support or unified consumer qualification.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const engine = process.env.BOX3D_ENGINE_ROOT || path.resolve(__dirname, '../box3d-rebuild-20261022');
const use = (logical) => require(path.join(engine, logical));
const { Collider } = use('src/cocos/physics/framework/components/colliders/collider.ts');
const { Node } = use('src/cocos/scene-graph/node.ts');
const { CCObject, isValid } = use('src/cocos/core/data/object.ts');
const { PhysicsSystem } = use('src/cocos/physics/framework/physics-system.ts');
const { PhysicsMaterial } = use('src/cocos/physics/framework/assets/physics-material.ts');
const { selector } = use('src/cocos/physics/framework/physics-selector.ts');
const { Box3DWorldCommandOwner } = use('src/air/physics/box3d/world-command-owner.ts');
const { beginPhysicsSystemControl } = use('src/cocos/physics/framework/physics-system-control.ts');
const { registerMutationGuard } = use('src/cocos/core/data/mutation-guard.ts');
const original = {
    instance: PhysicsSystem.instance,
    world: selector.physicsWorld,
    id: selector.id,
};
const rows = [],
    observations = [],
    ordinary = [];
let row,
    fixtures = [];
const copy = (v) => JSON.parse(JSON.stringify(v));
function check(name, actual, expected) {
    row.checks.push({
        name,
        actual: copy(actual),
        expected: copy(expected),
        passed: JSON.stringify(actual) === JSON.stringify(expected),
    });
}
function attempt(fn) {
    try {
        const v = fn();
        return { threw: false, returned: typeof v };
    } catch (e) {
        return {
            threw: true,
            code: e.code || null,
            operation: e.operation || null,
            error: String(e),
        };
    }
}
function control(name, run) {
    test(name, () => {
        row = { name, checks: [], attempts: [] };
        rows.push(row);
        try {
            run();
        } catch (e) {
            row.fixtureError = String(e);
            throw e;
        }
        row.status = row.checks.every((c) => c.passed)
            ? 'PASS_ACTUAL_ENGINE_OWNER_SOURCE'
            : 'RED_ACTUAL_ENGINE_OWNER_SOURCE';
        expect(row.checks.filter((c) => !c.passed).map((c) => c.name)).toEqual([]);
    });
}
function fixture(method, event = 'onCollisionEnter', initialized = true, backend = 'box3d') {
    const c = new Collider(0),
        node = new Node('listener-entry'),
        system = new PhysicsSystem(),
        world = {};
    c.node = node;
    PhysicsSystem._instance = system;
    selector.physicsWorld = world;
    selector.id = backend;
    const calls = {
        adapter: 0,
        offCallback: 0,
        callback: 0,
        hostile: 0,
        fault: 0,
        nativeAccessor: 0,
        driver: 0,
    };
    const adapter = {
        updateEventListener() {
            calls.adapter++;
        },
    };
    if (initialized) c._shape = adapter;
    const target = {},
        other = {},
        callback = () => calls.callback++,
        fresh = () => (calls.callback += 100);
    if (!['on', 'on-once', 'once'].includes(method)) {
        c.on(event, callback, target);
        c.on('onTriggerExit', callback, other);
    }
    c._registerOffCallback(() => calls.offCallback++);
    calls.adapter = 0;
    const owner = new Box3DWorldCommandOwner(101, system, world);
    owner.installMaterialObservation(
        () => {},
        () => calls.fault++,
    );
    owner.installSystemControlObservation(() => calls.fault++);
    const body = owner.adoptBody({
        node,
        ancestry: [node],
        preflight() {
            calls.nativeAccessor++;
        },
        readCommitted() {
            calls.nativeAccessor++;
            throw new Error('Not a solver fixture');
        },
        resolveNative() {
            calls.nativeAccessor++;
            throw new Error('No native authority');
        },
    });
    owner.attachComponent(body, {
        adapter,
        component: c,
        kind: 'collider',
        material: null,
        applyMaterial() {},
    });
    owner.completeComponent(adapter);
    owner.commitComponentEnabled(adapter, true);
    const material = new PhysicsMaterial();
    const ids = new Map();
    const id = (v) => {
        if (!ids.has(v)) ids.set(v, ids.size + 1);
        return ids.get(v);
    };
    const snapshot = () => ({
        table: id(c._callbackTable),
        trigger: c._needTriggerEvent,
        collision: c._needCollisionEvent,
        lists: Object.keys(c._callbackTable)
            .sort()
            .map((key) => {
                const list = c._callbackTable[key];
                return {
                    key,
                    list: id(list),
                    array: id(list.callbackInfos),
                    invoking: list.isInvoking,
                    cancelled: list.containCanceled,
                    entries: list.callbackInfos.map(
                        (info) =>
                            info && {
                                info: id(info),
                                callback: id(info.callback),
                                target: id(info.target),
                                once: info.once,
                            },
                    ),
                };
            }),
        calls: { ...calls },
    });
    const act = (type = event) => {
        switch (method) {
            case 'on':
                return c.on(type, fresh, target);
            case 'on-once':
                return c.on(type, fresh, target, true);
            case 'once':
                return c.once(type, fresh, target);
            case 'off':
                return c.off(type, callback, target);
            case 'off-type':
                return c.off(type);
            case 'removeAll-type':
                return c.removeAll(type);
            case 'removeAll-target':
                return c.removeAll(target);
            case 'targetOff':
                return c.targetOff(target);
            case 'targetOff-type':
                return c.targetOff(type);
            case 'clear':
                return c.clear();
            default:
                throw new Error(method);
        }
    };
    const f = {
        c,
        node,
        system,
        owner,
        material,
        calls,
        adapter,
        target,
        other,
        callback,
        fresh,
        snapshot,
        act,
        method,
        event,
        scope: null,
    };
    fixtures.push(f);
    return f;
}
function enter(f, phase) {
    let scope;
    if (phase === 'writeback') {
        scope = f.owner.beginStep();
        scope.advance('solving');
        scope.advance('writeback');
    } else if (phase === 'dispatch') scope = f.owner.beginDispatch();
    else if (phase === 'material') scope = f.owner.beginMaterialKernel(f.material);
    else {
        scope = beginPhysicsSystemControl(f.system, 'system-auto-simulation');
        const state = {
            kind: 'system-control',
            enabled: f.system.enable,
            autoSimulation: f.system.autoSimulation,
        };
        scope.prepare(() => ({ before: state, candidate: state }));
    }
    f.scope = scope;
    check('actual owner phase', f.owner.diagnostics().phase, phase);
    check('one actual owner scope', f.owner.diagnostics().activeTemporaryScopes, 1);
}
function leave(f) {
    f.scope.dispose();
    f.scope = null;
}
const methods = [
    'on',
    'on-once',
    'once',
    'off',
    'off-type',
    'removeAll-type',
    'removeAll-target',
    'targetOff',
    'targetOff-type',
    'clear',
];
for (const phase of ['writeback', 'dispatch', 'material', 'control'])
    for (const method of methods)
        for (const event of ['onTriggerEnter', 'onCollisionEnter', 'onControllerTriggerEnter']) {
            control(`${phase}/${method}/${event}`, () => {
                const f = fixture(method, event),
                    before = f.snapshot();
                enter(f, phase);
                for (let i = 0; i < 2; i++) {
                    const a = attempt(f.act);
                    row.attempts.push(a);
                    check(`attempt ${i} rejected`, a.threw && a.code === 'AIR_E_BOX3D_REENTRANT', true);
                    check(`attempt ${i} exact listener/cache/effect snapshot`, f.snapshot(), before);
                }
                check('scope remains live after caught errors', f.owner.diagnostics().phase, phase);
                leave(f);
                f.c.emit(event);
                check(
                    'subsequent actual emit proves listeners preserved',
                    f.calls.callback,
                    ['on', 'on-once', 'once'].includes(method) ? 0 : 1,
                );
                check('no native accessors', f.calls.nativeAccessor, 0);
            });
        }
for (const phase of ['writeback', 'dispatch', 'material', 'control'])
    for (const method of methods) {
        control(`${phase}/${method}/inside-active-callback`, () => {
            const f = fixture(method);
            f.c.on('onCollisionStay', () => {
                f.calls.driver++;
                const before = f.snapshot();
                for (let i = 0; i < 2; i++) {
                    const a = attempt(f.act);
                    row.attempts.push(a);
                    check(`nested ${i} rejected`, a.threw && a.code === 'AIR_E_BOX3D_REENTRANT', true);
                    check(`nested ${i} listener flags and infos unchanged`, f.snapshot(), before);
                }
            });
            f.calls.adapter = 0;
            enter(f, phase);
            f.c.emit('onCollisionStay');
            check('driver completed once', f.calls.driver, 1);
            check('no off callback during rejection', f.calls.offCallback, 0);
            check('no adapter callback during rejection', f.calls.adapter, 0);
            leave(f);
        });
    }
for (const method of methods) {
    control(`${method}/guard-before-argument-and-cache-read`, () => {
        const f = fixture(method),
            lease = registerMutationGuard([f.c], {
                code: 'AIR_E_TEST_EARLY',
                message: 'early-entry control',
            });
        const table = f.c._callbackTable;
        Object.defineProperty(f.c, '_callbackTable', {
            configurable: true,
            get() {
                f.calls.hostile++;
                return table;
            },
        });
        Object.defineProperty(f.c, 'isValid', {
            configurable: true,
            get() {
                f.calls.hostile++;
                return true;
            },
        });
        const type = {
            [Symbol.toPrimitive]() {
                f.calls.hostile++;
                return f.event;
            },
        };
        const a = attempt(() => f.act(type));
        row.attempts.push(a);
        lease.dispose();
        Object.defineProperty(f.c, '_callbackTable', {
            configurable: true,
            writable: true,
            value: table,
        });
        delete f.c.isValid;
        check('early rejection', a.threw && a.code === 'AIR_E_TEST_EARLY', true);
        check('zero callbackTable/isValid/argument reads', f.calls.hostile, 0);
        check('zero delegate and off hooks', [f.calls.adapter, f.calls.offCallback], [0, 0]);
    });
}
for (const backend of ['box3d', 'builtin', 'cannon', 'physx'])
    for (const initialized of [false, true])
        for (const method of methods) {
            control(`no-lease/${backend}/${initialized}/${method}`, () => {
                const f = fixture(method, 'onCollisionEnter', initialized, backend);
                const result = f.act();
                f.c.emit(f.event);
                f.c.emit(f.event);
                const item = {
                    backend,
                    initialized,
                    method,
                    callbackReturned: result === f.fresh,
                    state: f.snapshot(),
                };
                ordinary.push(item);
                check('no owner scope opened', f.owner.diagnostics().activeTemporaryScopes, 0);
                check(
                    'original callback behavior',
                    f.calls.callback,
                    method === 'on' ? 200 : ['on-once', 'once'].includes(method) ? 100 : 0,
                );
            });
        }
for (const phase of ['writeback', 'dispatch', 'material', 'control']) {
    control(`${phase}/emit-once-auto-off-rejects-before-callback`, () => {
        const f = fixture('once');
        f.c.once(f.event, f.callback, f.target);
        const before = f.snapshot();
        enter(f, phase);
        const a = attempt(() => f.c.emit(f.event));
        row.attempts.push(a);
        check('once automatic off rejected', a.threw && a.code === 'AIR_E_BOX3D_REENTRANT', true);
        check('listener, invocation flags, caches and callback counts preserved', f.snapshot(), before);
        leave(f);
        f.c.emit(f.event);
        f.c.emit(f.event);
        check('same once listener remains and runs once after release', f.calls.callback, 1);
    });
    control(`${phase}/emit-invalid-target-auto-off-rejects-before-removal`, () => {
        const f = fixture('on'),
            dead = new Node('destroyed-listener-target');
        f.c.on(f.event, f.callback, dead);
        dead.destroy();
        const before = f.snapshot();
        enter(f, phase);
        const a = attempt(() => f.c.emit(f.event));
        row.attempts.push(a);
        check('invalid target automatic off rejected', a.threw && a.code === 'AIR_E_BOX3D_REENTRANT', true);
        check('listener, invocation flags, caches and callback counts preserved', f.snapshot(), before);
        leave(f);
        f.c.emit(f.event);
        check('invalid target never invoked', f.calls.callback, 0);
        check('invalid listener removed after release', f.c.hasEventListener(f.event), false);
    });
}
control('unrelated lease retains no-owner listener behavior', () => {
    const f = fixture('on'),
        lease = registerMutationGuard([{}], { code: 'AIR_E_OTHER', message: 'other object' });
    try {
        check('normal callback return', f.act() === f.fresh, true);
        f.c.emit(f.event);
        check('listener executes normally', f.calls.callback, 100);
    } finally {
        lease.dispose();
    }
});
control('overlapping leases release independently', () => {
    const f = fixture('off'),
        before = f.snapshot();
    const first = registerMutationGuard([f.c], { code: 'AIR_E_FIRST', message: 'first' });
    const second = registerMutationGuard([f.c], { code: 'AIR_E_SECOND', message: 'second' });
    try {
        const a = attempt(f.act);
        row.attempts.push(a);
        check('first rejection', a.code || null, 'AIR_E_FIRST');
        first.dispose();
        const b = attempt(f.act);
        row.attempts.push(b);
        check('second lease still blocks', b.code || null, 'AIR_E_SECOND');
        check('structure and cache retained across partial release', f.snapshot(), before);
    } finally {
        first.dispose();
        second.dispose();
    }
    f.act();
    check('listener removal after both release', f.c.hasEventListener(f.event), false);
});
control('inheritance inventory and explicit non-listener-registration boundaries', () => {
    const f = fixture('off');
    const levels = [];
    let proto = f.c;
    while (proto) {
        levels.push(
            Object.getOwnPropertyNames(proto).filter((key) =>
                ['on', 'off', 'once', 'removeAll', 'targetOff', 'clear', 'emit', '_registerOffCallback'].includes(key),
            ),
        );
        proto = Object.getPrototypeOf(proto);
    }
    observations.push({
        name: 'prototype-inventory',
        levels,
        clearDescriptor: Object.getOwnPropertyDescriptor(Collider.prototype, 'clear')
            ? {
                  ...Object.getOwnPropertyDescriptor(Collider.prototype, 'clear'),
                  value: 'function',
              }
            : null,
    });
    check(
        'all audited runtime methods exist',
        ['on', 'off', 'once', 'removeAll', 'targetOff', 'clear'].map((key) => typeof f.c[key]),
        Array(6).fill('function'),
    );
    check('targetOff still inherited', Object.prototype.hasOwnProperty.call(Collider.prototype, 'targetOff'), false);
});
afterEach(() => {
    const errors = [];
    for (const f of fixtures.reverse()) {
        try {
            f.scope?.dispose();
        } catch (e) {
            errors.push(String(e));
        }
        try {
            f.owner.closeAfterWorldTeardown(true);
        } catch (e) {
            errors.push(String(e));
        }
        f.c._shape = null;
        try {
            if (isValid(f.material, true)) f.material.destroy();
            if (isValid(f.node, true)) f.node.destroy();
        } catch (e) {
            errors.push(String(e));
        }
    }
    fixtures = [];
    CCObject._deferredDestroy();
    selector.physicsWorld = original.world;
    selector.id = original.id;
    PhysicsSystem._instance = original.instance;
    row.cleanupErrors = errors;
    expect(errors).toEqual([]);
});
afterAll(() => {
    const loaded = Object.keys(require.cache)
        .filter((file) => file.includes('/src/') || file.includes('/test/'))
        .sort()
        .map((file) => ({
            path: file,
            sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
        }));
    fs.writeFileSync(
        path.join(process.env.BOX3D_LISTENER_OUT, 'raw.json'),
        JSON.stringify(
            {
                scope: 'Actual source Collider/Eventify/CallbacksInvoker/Node/PhysicsSystem/Box3DWorldCommandOwner and real owner writeback, dispatch, material-kernel and System-control scopes; resolver mapped frozen modules with only candidate Collider changed. Mock world identity and counted adapter effects. No real World transaction/native/WASM/event support/consumer qualification.',
                variant: process.env.BOX3D_LISTENER_VARIANT,
                rows,
                observations,
                ordinary,
                loadedSources: loaded,
            },
            null,
            2,
        ) + '\n',
        { flag: 'wx' },
    );
});
