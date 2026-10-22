/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Complete actual source modules with explicit engine infrastructure, asset,
 * owner, shape, and native doubles. Not actual World/native/WASM or full Gates.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = __dirname;
const engine = path.resolve(root, '../box3d-rebuild-20261022');
const ts = require(path.join(engine, 'node_modules/typescript'));
const output = path.join(root, process.argv[2] || 'evidence/run-a');
fs.mkdirSync(output, { recursive: true });
const sha = (x) => crypto.createHash('sha256').update(x).digest('hex');
const TX = 'src/cocos/physics/framework/physics-material-transaction.ts';
const COLLIDER = 'src/cocos/physics/framework/components/colliders/collider.ts';
const SYSTEM = 'src/cocos/physics/framework/physics-system.ts';
const OBSERVER = 'src/cocos/physics/framework/physics-state-observer.ts';
const GUARD = 'src/cocos/core/data/mutation-guard.ts';
const EVENTIFY = 'src/cocos/core/event/eventify.ts';
const INVOKER = 'src/cocos/core/event/callbacks-invoker.ts';
const manifests = {};
const results = [];
const falsies = [undefined, null, false, 0, ''];
function loadEnvironment(variant) {
    const cache = new Map(),
        changes = [],
        sources = {};
    let shape;
    const selector = { id: 'box3d', runInEditor: true };
    class Component {
        get isValid() {
            return true;
        }
    }
    class Vec3 {
        constructor(x = 0, y = 0, z = 0) {
            Object.assign(this, { x, y, z });
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
    const decor = () => () => {};
    const decorators = {
        ccclass: decor,
        tooltip: decor,
        displayOrder: decor,
        displayName: decor,
        readOnly: () => {},
        type: decor,
        serializable: () => {},
    };
    const core = {
        Vec3,
        RecyclePool: Pool,
        Enum: Object.assign,
        System: class {},
        cclegacy: { internal: {} },
        settings: { querySettings() {} },
        SettingsCategory: { PHYSICS: 'physics' },
        geometry: {},
        error() {},
        warn() {},
        errorID() {},
        warnID() {},
    };
    const utils = {
        createMap: () => Object.create(null),
        array: {
            fastRemoveAt(a, i) {
                a[i] = a[a.length - 1];
                a.length--;
            },
        },
    };
    let Material;
    function load(logical) {
        if (cache.has(logical)) return cache.get(logical).exports;
        const file = path.join(
            root,
            [TX, COLLIDER, SYSTEM].includes(logical) && variant === 'candidate' ? '' : 'inputs/product',
            logical,
        );
        const source = fs.readFileSync(file, 'utf8');
        sources[logical] = { sha256: sha(source), bytes: Buffer.byteLength(source) };
        const m = { exports: {} };
        cache.set(logical, m);
        const request = (name) => {
            if (name.endsWith('/physics-material-transaction')) {
                const tx = load(TX);
                return {
                    ...tx,
                    beginPhysicsMaterialChange(...args) {
                        const c = tx.beginPhysicsMaterialChange(...args);
                        if (c) changes.push(c);
                        return c;
                    },
                };
            }
            if (name === './physics-state-observer') return load(OBSERVER);
            if (name.endsWith('/mutation-guard')) return load(GUARD);
            if (name === './callbacks-invoker') return load(INVOKER);
            if (name === '../utils/js') return utils;
            if (name === '../memop') return { Pool };
            if (name === '../data/object') return { isCCObject: () => false, isValid: () => true };
            if (name === '../global-exports') return { legacyCC: { _Test: {} } };
            if (name === 'internal:constants')
                return { EDITOR: false, TEST: false, BUILD: false, EDITOR_NOT_IN_PREVIEW: false };
            if (name === 'cc.decorator') return decorators;
            if (name.endsWith('/core')) return { ...core, Eventify: load(EVENTIFY).Eventify };
            if (name.endsWith('/scene-graph')) return { Component };
            if (name === '../rigid-body') return { RigidBody: class {} };
            if (name.endsWith('/assets/physics-material')) return { PhysicsMaterial: Material };
            if (name.endsWith('/physics-enum'))
                return { EColliderType: { BOX: 0 }, EAxisDirection: {}, PhysicsGroup: { DEFAULT: 1 } };
            if (name.endsWith('/physics-selector'))
                return { selector, createShape: () => shape, constructDefaultWorld() {} };
            if (name === './physics-system-control')
                return {
                    installPhysicsSystemControlSource() {},
                    beginPhysicsSystemControl() {},
                    getPhysicsSystemControlDisposition() {},
                    assertPhysicsSystemManualStep() {},
                };
            if (name === '../../game') return { director: { once() {} }, DirectorEvent: { INIT: 'init' }, game: {} };
            if (name === './physics-ray-result')
                return { PhysicsRayResult: class {}, PhysicsLineStripCastResult: class {} };
            if (name === './collision-matrix') return { CollisionMatrix: class {} };
            if (name === '../../asset/asset-manager') return {};
            throw new Error(`Unmapped import: ${logical}: ${name}`);
        };
        const js = ts.transpileModule(source, {
            compilerOptions: {
                target: ts.ScriptTarget.ES2022,
                module: ts.ModuleKind.CommonJS,
                experimentalDecorators: true,
                useDefineForClassFields: false,
            },
        }).outputText;
        const dest = path.join(output, variant, logical.replace(/\.ts$/, '.js'));
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, js);
        fs.writeFileSync(dest.replace(/\.js$/, '.ts'), source);
        vm.runInThisContext(`(function(require,module,exports){${js}\n})`, { filename: file })(request, m, m.exports);
        return m.exports;
    }
    Material = class extends load(EVENTIFY).Eventify(class {}) {
        static EVENT_UPDATE = 'physics_material_update';
        constructor(label, log, options = {}) {
            super();
            Object.assign(this, {
                label,
                friction: 0.3,
                restitution: 0.4,
                rollingFriction: 0.5,
                spinningFriction: 0.6,
            });
            this.id = label;
            for (const method of ['on', 'off'])
                Object.defineProperty(this, method, {
                    configurable: true,
                    get() {
                        log.push(`${label}.${method}:get`);
                        if (options[`${method}GetThrow`]) throw options.error;
                        return function (...args) {
                            log.push(`${label}.${method}:call`);
                            if (options[`${method}Throw`]) throw options.error;
                            return Material.prototype[method].apply(this, args);
                        };
                    },
                });
            this.clone = () => {
                log.push(`${label}.clone`);
                if (options.cloneThrow) throw options.error;
                return options.cloneResult || new Material(`${label}-clone`, log, options.cloneOptions);
            };
        }
    };
    const env = {
        load,
        changes,
        selector,
        Material,
        setShape(v) {
            shape = v;
        },
        Collider: load(COLLIDER).Collider,
        PhysicsSystem: load(SYSTEM).PhysicsSystem,
        tx: load(TX),
        guard: load(GUARD),
    };
    manifests[variant] = sources;
    return env;
}
const original = loadEnvironment('original'),
    candidate = loadEnvironment('candidate');
function attempt(fn) {
    try {
        return { threw: false, value: fn() };
    } catch (error) {
        return { threw: true, error };
    }
}
function control(name, fn) {
    const row = { name };
    results.push(row);
    try {
        fn();
        row.status = 'PASS';
    } catch (e) {
        row.status = 'FAIL';
        row.error = String(e);
        row.stack = e.stack;
    }
}
function setup(env, kind, mode, options = {}) {
    const log = [],
        assets = [];
    const material = (name, opts) => {
        const a = new env.Material(name, log, opts);
        assets.push(a);
        return a;
    };
    const a = material('a', options.a),
        b = material('b', options.b);
    const target = kind === 'system' ? Object.create(env.PhysicsSystem.prototype) : new env.Collider(0);
    target._material = options.initialNull ? null : a;
    const commits = [],
        failures = [],
        reports = [];
    let activeGuard, lease;
    let membership = 1;
    const delegate = {
        open(context) {
            log.push('owner.open');
            activeGuard = env.guard.registerMutationGuard([target], {
                code: 'MOCK_OWNER_LEASE',
                message: 'Explicit mock owner transaction lease',
            });
            if (options.openThrow) throw options.error;
        },
        protectCandidate(context, asset) {
            log.push(`owner.protect:${asset.label}`);
            if (options.protectThrow) throw options.error;
        },
        preflightCopied(context, copied) {
            log.push('owner.preflight');
            if (options.preflightThrow) throw options.error;
        },
        applyCopied(context, copied) {
            log.push('mock.native');
            if (options.applyThrow) throw options.error;
        },
        commitActual(context, actual) {
            log.push(
                `owner.commit:${actual.material?.label ?? 'null'}:${actual.kind === 'collider-material' ? actual.shared : 'system'}`,
            );
            commits.push(actual);
            if (options.commitThrow) throw options.error;
        },
        fail(context, failure) {
            log.push('owner.fail');
            failures.push(failure);
            if (options.failThrow) throw options.secondary;
        },
        dispose() {
            log.push('owner.dispose');
            activeGuard?.dispose();
            if (options.disposeThrow) throw options.secondary;
        },
    };
    const register = () => {
        if (mode !== 'none')
            lease = env.tx.registerPhysicsMaterialDelegate(
                target,
                delegate,
                {
                    generation: 1,
                    report(r) {
                        log.push('cleanup.report');
                        reports.push(r);
                        if (options.reportThrow) throw options.secondary;
                    },
                },
                mode === 'default' ? undefined : mode,
            );
    };
    const shape = {
        initialize() {
            log.push('shape.initialize');
            if (options.lateRegister) register();
        },
        onLoad() {
            log.push('shape.onLoad');
            if (options.loadThrow) throw options.error;
        },
        setMaterial(v) {
            log.push(`shape.setMaterial:${v?.label ?? 'null'}`);
        },
        updateEventListener() {
            log.push('shape.clear');
            if (options.clearThrow) throw options.error;
        },
        onDestroy() {
            log.push('shape.destroy');
            if (options.destroyThrow) throw options.secondary;
            membership--;
            lease?.dispose();
        },
    };
    target._shape = shape;
    env.setShape(shape);
    target._boundingSphere = {
        destroy() {
            log.push('bounds.destroy');
            if (options.boundsThrow) throw options.secondary;
        },
    };
    env.selector.physicsWorld = {
        setDefaultMaterial(v) {
            log.push(`world.setMaterial:${v?.label ?? 'null'}`);
        },
    };
    env.selector.id = options.backend || 'box3d';
    if (!options.lateRegister) register();
    const changesStart = env.changes.length;
    return {
        env,
        target,
        a,
        b,
        log,
        assets,
        material,
        commits,
        failures,
        reports,
        shape,
        changesStart,
        membership: () => membership,
        diagnostic() {
            return env.changes.at(-1)?.diagnostics();
        },
        run() {
            if (kind === 'set') target.material = options.valueNull ? null : options.same ? a : b;
            else if (kind === 'clone') return target.material;
            else if (kind === 'load') return target.onLoad();
            else return target.setDefaultPhysicsMaterial(options.same ? a : b);
        },
        dispose() {
            lease?.dispose();
        },
    };
}
function normalized(f, a) {
    return {
        threw: a.threw,
        error: a.threw ? String(a.error) : null,
        log: f.log,
        material: f.target._material?.label ?? null,
        shared: f.target._isSharedMaterial,
        changes: f.env.changes.slice(f.changesStart).map((c) => c.diagnostics()),
        commits: f.commits.map((x) => ({ kind: x.kind, material: x.material?.label ?? null, shared: x.shared })),
    };
}
function expectNoListeners(f) {
    const d = f.diagnostic();
    assert(!f.log.some((x) => /\.(on|off):/.test(x)));
    assert(!d.observer.effects.some((x) => x.startsWith('listener')));
}
for (const mode of ['none', 'default', 'legacy'])
    for (const kind of ['set', 'clone', 'load', 'system'])
        for (const variant of ['normal', 'on-throw', 'off-throw', 'same', 'initial-null', 'set-null']) {
            if (
                (variant === 'initial-null' && ['clone', 'load'].includes(kind)) ||
                (variant === 'set-null' && kind !== 'set') ||
                (variant === 'same' && ['clone', 'load'].includes(kind))
            )
                continue;
            control(`legacy-equivalence/${mode}/${kind}/${variant}`, () => {
                const options = {
                    same: variant === 'same',
                    initialNull: variant === 'initial-null',
                    valueNull: variant === 'set-null',
                    a: {
                        offThrow: variant === 'off-throw',
                        error: 'public-off',
                        cloneOptions: { onThrow: variant === 'on-throw', error: 'public-on' },
                    },
                    b: { onThrow: variant === 'on-throw', error: 'public-on' },
                };
                if (kind === 'load') options.a.onThrow = variant === 'on-throw';
                const f = setup(original, kind, mode, options),
                    g = setup(candidate, kind, mode, options);
                const a = attempt(() => f.run()),
                    b = attempt(() => g.run());
                // Context target objects differ; reduce diagnostics to observable protocol facts.
                const clean = (x) => JSON.parse(JSON.stringify(x, (_k, v) => (_k === 'target' ? '<target>' : v)));
                assert.deepEqual(clean(normalized(g, b)), clean(normalized(f, a)));
                f.dispose();
                g.dispose();
            });
        }
for (const kind of ['set', 'clone', 'load', 'system'])
    for (const throwing of ['getters', 'methods']) {
        control(`private/no-public-${throwing}/${kind}`, () => {
            const hostile = {
                error: 'must-not-read-public',
                onGetThrow: throwing === 'getters',
                offGetThrow: throwing === 'getters',
                onThrow: throwing === 'methods',
                offThrow: throwing === 'methods',
            };
            const f = setup(candidate, kind, 'private', {
                a: { ...hostile, cloneOptions: hostile },
                b: hostile,
                lateRegister: kind === 'load',
            });
            let userEvents = 0;
            candidate.Material.prototype.on.call(f.a, candidate.Material.EVENT_UPDATE, () => userEvents++);
            candidate.Material.prototype.on.call(f.b, candidate.Material.EVENT_UPDATE, () => userEvents++);
            f.run();
            expectNoListeners(f);
            assert.equal(f.commits.length, 1);
            assert.equal(f.commits[0].material, f.target._material);
            assert.equal(f.diagnostic().observer.phase, 'committed');
            assert.equal(f.diagnostic().observer.effects.includes('cache-written'), kind !== 'load');
            if (kind === 'clone') {
                assert.notEqual(f.target._material, f.a);
                assert.equal(f.target._isSharedMaterial, false);
                assert(f.log.indexOf('owner.protect:a-clone') < f.log.findIndex((x) => x.startsWith('owner.commit:')));
                assert.deepEqual(f.diagnostic().observer.effects, [
                    'clone-allocation-entered',
                    'clone-returned',
                    'cache-written',
                ]);
            }
            candidate.Material.prototype.emit.call(f.a, candidate.Material.EVENT_UPDATE);
            candidate.Material.prototype.emit.call(f.b, candidate.Material.EVENT_UPDATE);
            assert.equal(userEvents, 2);
            if (kind !== 'system') {
                f.target.onDestroy();
                assert.equal(f.reports.length, 1);
                assert.equal(f.membership(), 0);
                assert.deepEqual(f.reports[0].errors, []);
                expectNoListeners(f);
            } else f.dispose();
        });
    }
for (const variant of ['same', 'initial-null', 'set-null'])
    control(`private/set/${variant}`, () => {
        const f = setup(candidate, 'set', 'private', {
            same: variant === 'same',
            initialNull: variant === 'initial-null',
            valueNull: variant === 'set-null',
        });
        f.run();
        expectNoListeners(f);
        assert.equal(f.commits[0].material, f.target._material);
        assert.equal(
            f.target._isSharedMaterial,
            variant !== 'same' && variant !== 'initial-null' && variant !== 'set-null' ? false : true,
        );
        assert.equal(f.diagnostic().observer.effects.includes('cache-written'), variant !== 'same');
        f.target.onDestroy();
        assert.equal(f.reports.length, 1);
    });
for (const kind of ['set', 'clone', 'load', 'system'])
    for (const stage of ['open', 'preflight', 'commit'])
        for (const [i, error] of falsies.entries())
            control(`private/falsy-primary/${kind}/${stage}/${i}`, () => {
                const f = setup(candidate, kind, 'private', {
                    [`${stage}Throw`]: true,
                    error,
                    failThrow: true,
                    disposeThrow: true,
                    secondary: 'secondary',
                });
                const a = attempt(() => f.run());
                assert(a.threw);
                assert(Object.is(a.error, error));
                assert.equal(f.failures.length, 1);
                assert(Object.is(f.failures[0].error, error));
                assert(f.log.includes('owner.dispose'));
                expectNoListeners(f);
                if (kind !== 'system') {
                    f.target.onDestroy();
                    assert.equal(f.reports.length, 1);
                } else f.dispose();
            });
for (const kind of ['set', 'system'])
    for (const [i, error] of falsies.entries())
        control(`private/falsy-native/${kind}/${i}`, () => {
            const f = setup(candidate, kind, 'private', {
                    applyThrow: true,
                    error,
                    disposeThrow: true,
                    secondary: 'secondary',
                }),
                a = attempt(() => f.run());
            assert(a.threw);
            assert(Object.is(a.error, error));
            assert.equal(f.target._material, f.a);
            expectNoListeners(f);
            assert.deepEqual(f.diagnostic().observer.effects, ['delegate-entered']);
            f.dispose();
        });
for (const kind of ['set', 'clone', 'load'])
    for (const [i, error] of falsies.entries())
        control(`private/independent-destroy/${kind}/${i}`, () => {
            const f = setup(candidate, kind, 'private', {
                clearThrow: true,
                destroyThrow: true,
                boundsThrow: true,
                reportThrow: true,
                error,
                secondary: 'secondary',
            });
            f.run();
            const before = f.log.length;
            const a = attempt(() => f.target.onDestroy());
            assert(a.threw);
            assert(Object.is(a.error, error));
            assert.deepEqual(f.log.slice(before), ['shape.clear', 'shape.destroy', 'bounds.destroy', 'cleanup.report']);
            assert.equal(f.membership(), 1); // Mock native destroy threw: no fake physical release.
            assert.deepEqual(
                f.reports[0].errors.map((x) => x.stage),
                ['event-listener-clear', 'adapter-destroy', 'bounds-destroy'],
            );
            assert(Object.is(f.reports[0].firstError, error));
            expectNoListeners(f);
            f.dispose();
        });
control('private/clone-accept-before-cache-reject-bad-copy', () => {
    const f = setup(candidate, 'clone', 'private');
    const bad = f.material('bad');
    bad.friction = 9;
    f.a.clone = () => bad;
    const a = attempt(() => f.run());
    assert(a.threw);
    assert.equal(f.target._material, f.a);
    assert.equal(f.target._isSharedMaterial, true);
    assert(!f.diagnostic().observer.effects.includes('cache-written'));
    expectNoListeners(f);
    f.target.onDestroy();
    assert.equal(f.reports.length, 1);
});
for (const mode of [undefined, 'legacy', 'private'])
    control(`registration/copied-frozen/${mode}`, () => {
        const registry = new candidate.tx.PhysicsMaterialTransactionRegistry(),
            target = {},
            delegate = {
                open() {},
                protectCandidate() {},
                preflightCopied() {},
                applyCopied() {},
                commitActual() {},
                fail() {},
                dispose() {},
            };
        const cleanup = { generation: 1, report() {} };
        const l = registry.register(target, delegate, cleanup, mode);
        cleanup.generation = 999;
        delegate.subscriptionMode = mode === 'private' ? 'legacy' : 'private';
        const c = registry.begin(target, 'collider-material-set');
        assert(Object.isFrozen(c));
        assert.equal(c.privateSubscriptions, mode === 'private');
        assert.equal(Reflect.set(c, 'privateSubscriptions', mode !== 'private'), false);
        assert.equal(c.privateSubscriptions, mode === 'private');
        c.dispose();
        const reporter = registry.captureCleanup(target);
        reporter.complete([]);
        assert.equal(reporter.diagnostics().report.generation, 1);
        l.dispose();
    });
for (const bad of [null, false, 0, 'PRIVATE', '', {}, new String('private')])
    control(`registration/reject-mode/${String(bad)}`, () => {
        const registry = new candidate.tx.PhysicsMaterialTransactionRegistry(),
            target = {};
        let reads = 0,
            coercions = 0;
        const delegate = {
            get open() {
                reads++;
                return () => {};
            },
            protectCandidate() {},
            preflightCopied() {},
            applyCopied() {},
            commitActual() {},
            fail() {},
            dispose() {},
        };
        if (bad && typeof bad === 'object')
            bad[Symbol.toPrimitive] = () => {
                coercions++;
                return 'private';
            };
        assert(attempt(() => registry.register(target, delegate, undefined, bad)).threw);
        assert.equal(reads, 0);
        assert.equal(coercions, 0);
        assert.equal(registry.begin(target, 'collider-material-set'), undefined);
    });
control('registration/admission-reentry-remains-rejected', () => {
    const registry = new candidate.tx.PhysicsMaterialTransactionRegistry(),
        target = {};
    let nested;
    const delegate = {
        get open() {
            nested = attempt(() => registry.register({}, delegate, undefined, 'private'));
            return () => {};
        },
        protectCandidate() {},
        preflightCopied() {},
        applyCopied() {},
        commitActual() {},
        fail() {},
        dispose() {},
    };
    assert(attempt(() => registry.register(target, delegate, undefined, 'private')).threw);
    assert(nested.threw);
    assert.equal(registry.begin(target, 'collider-material-set'), undefined);
});
control('private/no-selector-owner-discovery', () => {
    const f = setup(candidate, 'set', 'private');
    Object.defineProperty(candidate.selector, 'id', {
        configurable: true,
        get() {
            throw Error('selector access');
        },
    });
    try {
        f.run();
        assert.equal(f.target._material, f.b);
        expectNoListeners(f);
    } finally {
        Object.defineProperty(candidate.selector, 'id', { configurable: true, writable: true, value: 'box3d' });
        f.dispose();
    }
});

control('private/clone-accept-cache-shared-exact-order', () => {
    const f = setup(candidate, 'clone', 'private');
    let cached = f.a;
    const writes = [];
    Object.defineProperty(f.target, '_material', {
        configurable: true,
        get() {
            return cached;
        },
        set(value) {
            const d = f.diagnostic();
            writes.push({
                value,
                shared: f.target._isSharedMaterial,
                accepted: d.cloneAccepted,
                effects: [...d.observer.effects],
            });
            cached = value;
        },
    });
    const cloned = f.run();
    assert.equal(writes.length, 1);
    assert.equal(writes[0].value, cloned);
    assert.equal(writes[0].shared, true);
    assert.equal(writes[0].accepted, true);
    assert.deepEqual(writes[0].effects, ['clone-allocation-entered', 'clone-returned']);
    assert.equal(f.target._isSharedMaterial, false);
    assert.equal(f.commits[0].material, cloned);
    assert.equal(f.commits[0].shared, false);
    f.target.onDestroy();
    assert.equal(f.reports.length, 1);
    expectNoListeners(f);
});
for (const [i, error] of falsies.entries())
    control(`private/falsy-clone-cache-write/${i}`, () => {
        const f = setup(candidate, 'clone', 'private', { disposeThrow: true, secondary: 'cleanup' });
        Object.defineProperty(f.target, '_material', {
            get() {
                return f.a;
            },
            set() {
                assert(f.diagnostic().cloneAccepted);
                throw error;
            },
        });
        const a = attempt(() => f.run());
        assert(a.threw);
        assert(Object.is(a.error, error));
        assert.equal(f.target._isSharedMaterial, true);
        assert.equal(f.target._material, f.a);
        assert.deepEqual(f.diagnostic().observer.effects, ['clone-allocation-entered', 'clone-returned']);
        expectNoListeners(f);
        f.target.onDestroy();
        assert.equal(f.reports.length, 1);
    });
for (const mode of ['none', 'default', 'legacy'])
    for (const kind of ['set', 'clone', 'load', 'system'])
        for (const backend of ['box3d', 'cannon.js'])
            control(`legacy/access-order/${mode}/${kind}/${backend}`, () => {
                const make = (env) => {
                    const f = setup(env, kind, mode, { backend });
                    let cached = f.a;
                    Object.defineProperty(f.target, '_material', {
                        configurable: true,
                        get() {
                            f.log.push('cache:get');
                            return cached;
                        },
                        set(v) {
                            f.log.push(`cache:set:${v?.label ?? 'null'}`);
                            cached = v;
                        },
                    });
                    for (const asset of [f.a, f.b])
                        Object.defineProperty(asset, 'id', {
                            get() {
                                f.log.push(`${asset.label}.id:get`);
                                return asset.label;
                            },
                        });
                    return f;
                };
                const f = make(original),
                    g = make(candidate),
                    a = attempt(() => f.run()),
                    b = attempt(() => g.run());
                assert.equal(a.threw, b.threw);
                assert.equal(String(a.error), String(b.error));
                assert.deepEqual(g.log, f.log);
                assert.equal(g.target._isSharedMaterial, f.target._isSharedMaterial);
                f.dispose();
                g.dispose();
            });
for (const backend of ['box3d', 'cannon.js'])
    for (const [i, value] of [undefined, null, false, 0, '', NaN].entries())
        control(`unobserved/falsy-input-order/${backend}/${i}`, () => {
            const f = setup(original, 'set', 'none', { backend }),
                g = setup(candidate, 'set', 'none', { backend });
            const a = attempt(() => {
                    f.target.material = value;
                }),
                b = attempt(() => {
                    g.target.material = value;
                });
            assert.equal(a.threw, b.threw);
            assert.equal(String(a.error), String(b.error));
            assert.deepEqual(g.log, f.log);
            assert(Object.is(f.target._material, g.target._material));
            assert.equal(g.target._isSharedMaterial, f.target._isSharedMaterial);
        });
control('private/system-no-selector-owner-discovery', () => {
    const f = setup(candidate, 'system', 'private');
    Object.defineProperty(candidate.selector, 'id', {
        configurable: true,
        get() {
            throw Error('selector access');
        },
    });
    try {
        f.run();
        assert.equal(f.target._material, f.b);
        expectNoListeners(f);
    } finally {
        Object.defineProperty(candidate.selector, 'id', { configurable: true, writable: true, value: 'box3d' });
        f.dispose();
    }
});
control('private/no-public-listener-guard-candidate-adopted', () => {
    const f = setup(candidate, 'set', 'private');
    f.run();
    let calls = 0;
    f.target.once('onCollisionEnter', () => calls++);
    f.target.emit('onCollisionEnter');
    f.target.emit('onCollisionEnter');
    assert.equal(calls, 1);
    f.target.onDestroy();
    assert.equal(f.reports.length, 1);
    expectNoListeners(f);
});
control('registration/cleanup-third-argument-copy-is-unchanged', () => {
    const registry = new candidate.tx.PhysicsMaterialTransactionRegistry(),
        target = {};
    const calls = [];
    const delegate = {
        open() {},
        protectCandidate() {},
        preflightCopied() {},
        applyCopied() {},
        commitActual() {},
        fail() {},
        dispose() {},
    };
    const cleanup = {
        get generation() {
            calls.push('generation');
            return 1;
        },
        get report() {
            calls.push('report');
            return function (report) {
                calls.push(report.generation);
            };
        },
    };
    const lease = registry.register(target, delegate, cleanup, 'private');
    assert.deepEqual(calls, ['generation', 'report']);
    const reporter = registry.captureCleanup(target);
    lease.dispose();
    reporter.complete([]);
    assert.deepEqual(calls, ['generation', 'report', 1]);
});
const result = {
    schema: 'private-subscription-sites-controls/1',
    scope: 'Complete source with explicit infrastructure/asset/owner/native doubles. Actual production owners NOT_INTEGRATED; all formal 2128 cells NOT_RUN; staged=false; unified=false.',
    sources: manifests,
    results,
    passed: results.filter((x) => x.status === 'PASS').length,
    failed: results.filter((x) => x.status === 'FAIL').length,
};
fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(result, null, 2) + '\n');
fs.copyFileSync(__filename, path.join(output, 'controls-used.cjs'));
console.log(JSON.stringify({ passed: result.passed, failed: result.failed, output: path.relative(root, output) }));
for (const row of results.filter((x) => x.status === 'FAIL')) console.error(`${row.name}: ${row.stack}`);
process.exitCode = result.failed ? 1 : 0;
