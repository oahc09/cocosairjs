/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Exact complete Collider/Eventify/CallbacksInvoker/guard source with explicit infrastructure doubles.
 * This feasibility control is NOT actual-engine, owner-scope, adapter or WASM proof.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = __dirname;
const engineRoot = process.env.BOX3D_ENGINE_ROOT || path.resolve(root, '../box3d-rebuild-20261022');
const ts = require(path.join(engineRoot, 'node_modules/typescript'));
const mode = process.argv[2];
if (!['before', 'source'].includes(mode)) throw new Error('Expected before or source');
const out = path.join(root, process.argv[3] || `pure-${mode}-b`);
fs.mkdirSync(out);
fs.copyFileSync(__filename, path.join(out, 'fixture-used.cjs'), fs.constants.COPYFILE_EXCL);
const sources = {};
const cache = new Map();
class Component {
    get isValid() {
        return true;
    }
}
class Vec3 {
    constructor() {
        this.x = this.y = this.z = 0;
    }
}
class Pool {
    constructor(ctor) {
        this.ctor = ctor;
        this.freeItems = [];
    }
    alloc() {
        return this.freeItems.pop() || this.ctor();
    }
    free(v) {
        this.freeItems.push(v);
    }
}
const decorator = () => () => {};
const decorators = {
    ccclass: decorator,
    tooltip: decorator,
    displayOrder: decorator,
    displayName: decorator,
    readOnly: () => {},
    type: decorator,
    serializable: () => {},
};
const utils = {
    createMap: () => Object.create(null),
    array: {
        fastRemoveAt: (a, i) => {
            a[i] = a[a.length - 1];
            a.length--;
        },
    },
};
function load(logical) {
    if (cache.has(logical)) return cache.get(logical).exports;
    const actual = path.join(root, logical.endsWith('/collider.ts') ? mode : 'before', logical);
    const source = fs.readFileSync(actual, 'utf8');
    sources[logical] = crypto.createHash('sha256').update(source).digest('hex');
    const mod = { exports: {} };
    cache.set(logical, mod);
    const request = (name) => {
        if (name.endsWith('/mutation-guard')) return load('src/cocos/core/data/mutation-guard.ts');
        if (name === './callbacks-invoker') return load('src/cocos/core/event/callbacks-invoker.ts');
        if (name === '../utils/js') return utils;
        if (name === '../memop') return { Pool };
        if (name === '../data/object') return { isCCObject: () => false, isValid: () => true };
        if (name === '../global-exports') return { legacyCC: { _Test: {} } };
        if (name === 'internal:constants') return { EDITOR: false, TEST: false };
        if (name === 'cc.decorator') return decorators;
        if (name === '../../../../core')
            return {
                Eventify: load('src/cocos/core/event/eventify.ts').Eventify,
                Vec3,
                error: () => {},
                geometry: {},
            };
        if (name === '../../../../scene-graph') return { Component };
        if (name === '../rigid-body') return { RigidBody: class {} };
        if (name === '../../assets/physics-material') return { PhysicsMaterial: class {} };
        if (name === '../../physics-enum') return { EColliderType: { BOX: 0 }, EAxisDirection: {} };
        if (name === '../../physics-selector') return { selector: { id: 'box3d' } };
        if (name === '../../physics-material-transaction') return {};
        throw new Error(`Unmapped infrastructure dependency ${logical}: ${name}`);
    };
    const js = ts.transpileModule(source, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.CommonJS,
            experimentalDecorators: true,
            useDefineForClassFields: false,
        },
    }).outputText;
    vm.runInThisContext(`(function(require,module,exports){${js}\n})`, {
        filename: actual,
    })(request, mod, mod.exports);
    return mod.exports;
}
const { Collider } = load('src/cocos/physics/framework/components/colliders/collider.ts');
const { registerMutationGuard } = load('src/cocos/core/data/mutation-guard.ts');
const rows = [];
const methods = ['on', 'off', 'once', 'removeAll-type', 'removeAll-target', 'targetOff', 'clear'];
function fixture(method, event) {
    const c = new Collider(0),
        target = {},
        calls = { adapter: 0, offCallback: 0, callback: 0, input: 0 };
    const callback = () => calls.callback++;
    const fresh = () => (calls.callback += 100);
    c._shape = {
        updateEventListener() {
            calls.adapter++;
        },
    };
    if (!['on', 'once'].includes(method)) c.on(event, callback, target);
    c._registerOffCallback(() => calls.offCallback++);
    calls.adapter = 0;
    const identities = new Map();
    const id = (v) => {
        if (!identities.has(v)) identities.set(v, identities.size + 1);
        return identities.get(v);
    };
    const snapshot = () => ({
        tableIdentity: id(c._callbackTable),
        lists: Object.keys(c._callbackTable)
            .sort()
            .map((key) => {
                const v = c._callbackTable[key];
                return {
                    key,
                    id: id(v),
                    infosId: id(v.callbackInfos),
                    invoking: v.isInvoking,
                    cancelled: v.containCanceled,
                    entries: v.callbackInfos.map(
                        (i) =>
                            i && {
                                id: id(i),
                                callback: id(i.callback),
                                target: id(i.target),
                                once: i.once,
                            },
                    ),
                };
            }),
        trigger: c._needTriggerEvent,
        collision: c._needCollisionEvent,
        calls: { ...calls },
    });
    const act = () => {
        if (method === 'on') return c.on(event, fresh, target);
        if (method === 'once') return c.once(event, fresh, target);
        if (method === 'off') return c.off(event, callback, target);
        if (method === 'removeAll-type') return c.removeAll(event);
        if (method === 'removeAll-target') return c.removeAll(target);
        if (method === 'targetOff') return c.targetOff(target);
        return c.clear();
    };
    return { c, target, calls, callback, fresh, snapshot, act };
}
for (const method of methods)
    for (const event of ['onTriggerEnter', 'onCollisionEnter', 'onControllerTriggerEnter']) {
        const f = fixture(method, event),
            before = f.snapshot(),
            attempts = [];
        const lease = registerMutationGuard([f.c], {
            code: 'AIR_E_TEST_COLLIDER_ENTRY',
            message: 'Explicit feasibility lease',
        });
        for (let i = 0; i < 2; i++) {
            try {
                f.act();
                attempts.push({ threw: false });
            } catch (e) {
                attempts.push({ threw: true, code: e.code, operation: e.operation });
            }
        }
        const after = f.snapshot();
        lease.dispose();
        f.c.emit(event);
        rows.push({
            name: `${method}/${event}`,
            before,
            after,
            attempts,
            checks: {
                bothRejected: attempts.every((a) => a.threw && a.code === 'AIR_E_TEST_COLLIDER_ENTRY'),
                exactUnchanged: JSON.stringify(before) === JSON.stringify(after),
                afterCatchListenersUnchanged: f.calls.callback === (['on', 'once'].includes(method) ? 0 : 1),
            },
        });
    }
const ordinary = [];
for (const method of methods)
    for (const event of ['onTriggerEnter', 'onCollisionEnter', 'onControllerTriggerEnter']) {
        const f = fixture(method, event);
        const result = f.act();
        f.c.emit(event);
        f.c.emit(event);
        ordinary.push({
            method,
            event,
            returnedCallback: result === f.fresh,
            snapshot: f.snapshot(),
        });
    }
const result = {
    scope: 'Exact complete source with explicit Component, decorators, Vec3, pool, utils and validity infrastructure doubles; only explicit leases. No actual owner scopes, engine integration, adapters or WASM.',
    mode,
    sourceHashes: sources,
    rows,
    ordinary,
    failed: rows.filter((r) => Object.values(r.checks).some((v) => !v)).length,
};
fs.writeFileSync(path.join(out, 'raw.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(
    JSON.stringify({
        mode,
        cases: rows.length,
        failed: result.failed,
        sources,
        output: path.relative(root, out),
    }),
);
process.exitCode = result.failed ? 1 : 0;
