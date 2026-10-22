'use strict';
const assert = require('node:assert/strict');
const {
    PhysicsMaterialValuesTransactionRegistry: Registry,
} = require('./compiled/physics-material-values-transaction.js');
const results = [];
function test(name, fn) {
    try {
        fn();
        results.push({ name, status: 'PASS' });
        console.log('PASS', name);
    } catch (error) {
        results.push({ name, status: 'FAIL', error: String(error), stack: error?.stack });
        console.error('FAIL', name, error);
    }
}
function caught(fn, expected) {
    let thrown = false,
        actual;
    try {
        fn();
    } catch (error) {
        thrown = true;
        actual = error;
    }
    assert.equal(thrown, true, 'expected a thrown value');
    if (arguments.length > 1) assert.equal(actual, expected);
    return actual;
}
function setup(options = {}) {
    const registry = new Registry(options.qualification),
        asset = {},
        trace = [],
        owners = [];
    let values = [0.5, 0.1, 0, 0],
        events = 0,
        native = 0,
        cache = 0;
    function addOwner(config = {}) {
        const state = { open: 0, prepare: 0, fault: 0, dispose: 0, commit: 0, bindings: [], plans: [], contexts: [] };
        const delegate = {
            admitAsset(a) {
                if (a.destroyed) throw new Error('destroyed asset');
                config.admit?.(a);
            },
            open(context) {
                trace.push('open:' + owners.indexOf(state));
                ++state.open;
                state.contexts.push(context);
                config.open?.(context);
            },
            prepare(context, copied) {
                trace.push('prepare:' + owners.indexOf(state));
                ++state.prepare;
                config.prepare?.(context, copied);
                const count = copied.changed ? (config.nativeCount ?? 1) : 0;
                const operations = Array.from({ length: count }, (_, index) => ({
                    target: config.sameTarget ?? {},
                    invoke() {
                        trace.push('native:' + owners.indexOf(state) + ':' + index);
                        ++native;
                        config.invoke?.(index);
                    },
                    verify() {
                        trace.push('verify:' + owners.indexOf(state) + ':' + index);
                        config.verify?.(index);
                    },
                }));
                const plan = {
                    native: operations,
                    commitCaches() {
                        ++cache;
                        trace.push('cache:' + owners.indexOf(state));
                        config.cache?.();
                    },
                };
                state.plans.push(plan);
                return plan;
            },
            commit(context, actual) {
                ++state.commit;
                config.commit?.(context, actual);
            },
            fault(context, failure) {
                ++state.fault;
                state.failure = failure;
                config.fault?.(context, failure);
            },
            dispose(context) {
                ++state.dispose;
                trace.push('dispose:' + owners.indexOf(state));
                config.dispose?.(context);
            },
        };
        state.lease = registry.registerOwner(config.identity ?? {}, config.generation ?? 1, delegate);
        state.delegate = delegate;
        owners.push(state);
        return state;
    }
    function bind(owner, role = 'explicit', initialized = true, selectedAsset = asset) {
        const binding = {};
        owner.lease
            .prepareMembership({ binding, before: null, after: selectedAsset, role, initialized })
            .publish(selectedAsset);
        owner.bindings.push(binding);
        return binding;
    }
    function source(candidate = [0.7, 0.2, 0, 0], config = {}) {
        return {
            read() {
                trace.push('read');
                config.read?.();
                return {
                    before: values,
                    candidate,
                    changed: config.changed ?? true,
                    writeOnNoChange: config.writeOnNoChange ?? false,
                };
            },
            write(next, recorder) {
                trace.push('write');
                config.beforeWrite?.();
                for (let i = 0; i < 4; ++i) {
                    values[i] = next[i];
                    recorder.written();
                    config.afterWrite?.(i);
                }
            },
            emit() {
                ++events;
                trace.push('emit');
                config.emit?.();
            },
            readActual() {
                config.actual?.();
                return values;
            },
        };
    }
    return {
        registry,
        asset,
        trace,
        owners,
        addOwner,
        bind,
        source,
        get values() {
            return values;
        },
        get events() {
            return events;
        },
        get native() {
            return native;
        },
        get cache() {
            return cache;
        },
    };
}
function apply(s, source = s.source()) {
    const t = s.registry.begin(s.asset);
    t.prepare(source);
    t.apply();
    return t;
}

test('no owner fast path has no source or property reads', () => {
    const r = new Registry(),
        a = new Proxy(
            {},
            {
                get() {
                    throw new Error('unexpected read');
                },
            },
        );
    assert.equal(r.begin(a), undefined);
    r.assertDestroyable(a);
});
test('four bindings on one owner use one scope and complete preflight before effects', () => {
    const s = setup(),
        o = s.addOwner({ nativeCount: 3 });
    s.bind(o, 'default');
    s.bind(o);
    s.bind(o);
    s.bind(o);
    const t = apply(s);
    assert.equal(o.open, 1);
    assert.equal(o.contexts[0].bindings.length, 4);
    assert.equal(s.native, 3);
    assert.equal(s.events, 1);
    assert.equal(o.dispose, 1);
    assert(s.trace.indexOf('prepare:0') < s.trace.indexOf('write'));
    assert(s.trace.indexOf('cache:0') < s.trace.indexOf('emit'));
    assert.equal(t.diagnostics().native.length, 3);
    assert(t.diagnostics().native.every((v) => v.state === 'returned' && v.readback === 'verified'));
});
test('independent owner records prepare completely before any effects (pure protocol only)', () => {
    const s = setup();
    s.bind(s.addOwner());
    s.bind(s.addOwner());
    const t = apply(s);
    assert.equal(t.diagnostics().ownerCount, 2);
    assert(s.trace.indexOf('prepare:1') < s.trace.indexOf('write'));
    assert(s.trace.indexOf('open:1') < s.trace.indexOf('read'));
});
test('later foreign owner open refusal causes no reads, caches, native or public effects', () => {
    const s = setup(),
        refusal = new Error('foreign singleton');
    s.bind(s.addOwner());
    s.bind(
        s.addOwner({
            open() {
                throw refusal;
            },
        }),
    );
    const t = s.registry.begin(s.asset);
    caught(() => t.prepare(s.source()), refusal);
    assert.deepEqual(s.values, [0.5, 0.1, 0, 0]);
    assert.equal(s.native, 0);
    assert(!s.trace.includes('read'));
    assert.equal(t.diagnostics().cleanupCompletedOwners, 2);
    assert.equal(s.owners[0].fault, 0);
});
test('later participant preflight refusal never applies earlier plan', () => {
    const s = setup();
    s.bind(s.addOwner());
    s.bind(
        s.addOwner({
            prepare() {
                throw 0;
            },
        }),
    );
    const t = s.registry.begin(s.asset);
    caught(() => t.prepare(s.source()), 0);
    assert.equal(s.native, 0);
    assert.equal(s.events, 0);
    assert.equal(t.diagnostics().cacheWriteEntered, false);
    assert.equal(t.diagnostics().hasFailure, true);
    assert.equal(t.diagnostics().error, 0);
});
test('strict numeric validation rejects coercion, unsupported axes and float32 overflow', () => {
    for (const value of [
        NaN,
        Infinity,
        -Infinity,
        -1,
        1e40,
        '0.5',
        new Number(0.5),
        {
            valueOf() {
                throw new Error('coerced');
            },
        },
    ]) {
        const s = setup();
        s.bind(s.addOwner());
        const t = s.registry.begin(s.asset);
        caught(() => t.prepare(s.source([value, 0.2, 0, 0])));
        assert.equal(s.native, 0);
        assert.equal(s.events, 0);
    }
    for (const candidate of [
        [0.5, -1, 0, 0],
        [0.5, 0.1, 1, 0],
        [0.5, 0.1, 0, 1],
    ]) {
        const s = setup();
        s.bind(s.addOwner());
        caught(() => s.registry.begin(s.asset).prepare(s.source(candidate)));
        assert.equal(s.native, 0);
    }
    const s = setup();
    s.bind(s.addOwner());
    apply(s, s.source([0.5, 3.2, 0, 0]));
    assert.equal(s.values[1], 3.2);
});
test('native float32 copy does not replace accepted JS numbers', () => {
    const s = setup();
    let copied;
    s.bind(
        s.addOwner({
            prepare(c, value) {
                copied = value;
            },
        }),
    );
    apply(s, s.source([0.123456789, 0.2, 0, 0]));
    assert.equal(s.values[0], 0.123456789);
    assert.equal(copied.native[0], Math.fround(0.123456789));
    assert(Object.isFrozen(copied.native));
});
test('scalar equals no-change does no write/native/emit and retains before', () => {
    const s = setup();
    s.bind(s.addOwner());
    const t = apply(s, s.source([0.500000001, 0.1, 0, 0], { changed: false }));
    assert.equal(s.values[0], 0.5);
    assert.equal(s.native, 0);
    assert.equal(s.events, 0);
    assert.equal(t.diagnostics().cacheWrites, 0);
});
test('setValues exact no-change still writes four fields without native/emit', () => {
    const s = setup();
    s.bind(s.addOwner());
    const t = apply(s, s.source([0.5, 0.1, -0, 0], { changed: false, writeOnNoChange: true }));
    assert.equal(t.diagnostics().cacheWrites, 4);
    assert(Object.is(s.values[2], -0));
    assert.equal(s.native, 0);
    assert.equal(s.events, 0);
});
test('no-change still rejects foreign owners and invalid inputs', () => {
    const s = setup();
    s.bind(
        s.addOwner({
            open() {
                throw new Error('foreign');
            },
        }),
    );
    caught(() => s.registry.begin(s.asset).prepare(s.source(undefined, { changed: false })));
    assert.equal(s.native, 0);
});
test('source getter reentry latched even if caught', () => {
    const s = setup(),
        o = s.addOwner();
    s.bind(o);
    const source = s.source();
    Object.defineProperty(source, 'read', {
        get() {
            caught(() => s.registry.begin(s.asset));
            return () => ({ before: s.values, candidate: s.values, changed: false, writeOnNoChange: false });
        },
    });
    const t = s.registry.begin(s.asset);
    caught(() => t.prepare(source));
    assert.equal(t.diagnostics().hasFailure, true);
    assert.equal(s.native, 0);
});
test('candidate property reentry cannot mutate membership even when caught', () => {
    const s = setup(),
        o = s.addOwner();
    s.bind(o);
    const candidate = [0.7, 0.2, 0, 0];
    Object.defineProperty(candidate, 0, {
        get() {
            caught(() =>
                o.lease.prepareMembership({
                    binding: {},
                    before: null,
                    after: s.asset,
                    role: 'explicit',
                    initialized: true,
                }),
            );
            return 0.7;
        },
    });
    const t = s.registry.begin(s.asset);
    caught(() => t.prepare(s.source(candidate)));
    assert.equal(s.native, 0);
    assert.equal(o.lease.diagnostics().bindings, 1);
});
test('callback methods copied once before prepared plan mutation', () => {
    const s = setup(),
        o = s.addOwner();
    s.bind(o);
    const source = s.source(),
        t = s.registry.begin(s.asset);
    t.prepare(source);
    source.write = () => {
        throw new Error('replacement source');
    };
    o.delegate.prepare = () => {
        throw new Error('replacement owner');
    };
    o.plans[0].native[0].invoke = () => {
        throw new Error('replacement invoke');
    };
    o.plans[0].commitCaches = () => {
        throw new Error('replacement cache');
    };
    t.apply();
    assert.equal(s.native, 1);
    assert.equal(s.events, 1);
});
test('duplicate shape target refuses during prepare', () => {
    const s = setup();
    s.bind(s.addOwner({ nativeCount: 2, sameTarget: {} }));
    const t = s.registry.begin(s.asset);
    caught(() => t.prepare(s.source()));
    assert.equal(s.native, 0);
    assert.equal(t.diagnostics().cacheWrites, 0);
});
test('empty inactive plan return is not a native write', () => {
    const s = setup();
    s.bind(s.addOwner({ nativeCount: 0 }));
    const t = apply(s);
    assert.deepEqual(t.diagnostics().native, []);
    assert.equal(s.native, 0);
    assert.equal(s.cache, 1);
});
test('first exact native throw is unknown, later plans not entered, all owners fault', () => {
    const s = setup();
    s.bind(
        s.addOwner({
            nativeCount: 2,
            invoke() {
                throw null;
            },
        }),
    );
    s.bind(s.addOwner());
    const t = s.registry.begin(s.asset);
    t.prepare(s.source());
    caught(() => t.apply(), null);
    const d = t.diagnostics();
    assert.equal(d.native[0].state, 'entered-unknown');
    assert.equal(d.native[1].state, 'not-entered');
    assert.equal(d.native[2].state, 'not-entered');
    assert.equal(s.native, 1);
    assert.equal(s.events, 0);
    assert(s.owners.every((o) => o.fault === 1 && o.dispose === 1));
    assert.deepEqual(s.values, [0.7, 0.2, 0, 0]);
    caught(() => t.apply());
    assert.equal(s.native, 1);
    caught(() => s.registry.begin(s.asset));
});
test('later native throw preserves returned/verified first operation', () => {
    const s = setup();
    s.bind(
        s.addOwner({
            nativeCount: 3,
            invoke(i) {
                if (i === 1) throw undefined;
            },
        }),
    );
    const t = s.registry.begin(s.asset);
    t.prepare(s.source());
    caught(() => t.apply(), undefined);
    const d = t.diagnostics();
    assert.equal(d.hasFailure, true);
    assert.equal(d.native[0].state, 'returned');
    assert.equal(d.native[0].readback, 'verified');
    assert.equal(d.native[1].state, 'entered-unknown');
    assert.equal(d.native[2].state, 'not-entered');
});
test('readback failure retains returned setter fact and stops future native operations', () => {
    const s = setup();
    s.bind(
        s.addOwner({
            nativeCount: 2,
            verify() {
                throw new Error('readback');
            },
        }),
    );
    const t = s.registry.begin(s.asset);
    t.prepare(s.source());
    caught(() => t.apply());
    const d = t.diagnostics();
    assert.equal(d.native[0].state, 'returned');
    assert.equal(d.native[0].readback, 'entered-unknown');
    assert.equal(d.native[1].state, 'not-entered');
});
test('adapter cache failure retains native returned/verified', () => {
    const s = setup();
    s.bind(
        s.addOwner({
            cache() {
                throw 0;
            },
        }),
    );
    const t = s.registry.begin(s.asset);
    t.prepare(s.source());
    caught(() => t.apply(), 0);
    const d = t.diagnostics();
    assert.equal(d.native[0].readback, 'verified');
    assert.equal(d.ownerCacheStates[0], 'entered-unknown');
});
test('each partial actual cache assignment is retained and faulted', () => {
    const s = setup();
    s.bind(s.addOwner());
    const t = s.registry.begin(s.asset);
    t.prepare(
        s.source(undefined, {
            afterWrite(i) {
                if (i === 1) throw 0;
            },
        }),
    );
    caught(() => t.apply(), 0);
    const d = t.diagnostics();
    assert.equal(d.cacheWrites, 2);
    assert.deepEqual(d.actual, [0.7, 0.2, 0, 0]);
    assert.equal(d.native[0].state, 'not-entered');
    assert.equal(s.owners[0].fault, 1);
});
test('public falsy primary survives independent reporter and cleanup errors', () => {
    for (const primary of [undefined, null, 0, false, '']) {
        const s = setup();
        s.bind(
            s.addOwner({
                fault() {
                    throw new Error('report');
                },
                dispose() {
                    throw new Error('cleanup1');
                },
            }),
        );
        s.bind(
            s.addOwner({
                dispose() {
                    throw new Error('cleanup2');
                },
            }),
        );
        const t = s.registry.begin(s.asset);
        t.prepare(
            s.source(undefined, {
                emit() {
                    throw primary;
                },
            }),
        );
        caught(() => t.apply(), primary);
        const d = t.diagnostics();
        assert.equal(d.hasFailure, true);
        assert.equal(d.error, primary);
        assert.equal(d.cleanupUnresolvedOwners, 2);
        assert.equal(d.publicEntered, true);
        assert.equal(d.publicReturned, false);
        assert.equal(d.secondaryErrors.length, 3);
        assert(s.owners.every((o) => o.dispose === 1));
        t.dispose();
        assert(s.owners.every((o) => o.dispose === 1));
    }
});
test('cleanup-only failure faults all original owners without claiming rollback', () => {
    const s = setup();
    s.bind(
        s.addOwner({
            dispose() {
                throw 0;
            },
        }),
    );
    s.bind(s.addOwner());
    const t = s.registry.begin(s.asset);
    t.prepare(s.source());
    caught(() => t.apply(), 0);
    assert.equal(t.diagnostics().publicReturned, true);
    assert.equal(t.diagnostics().cleanupCompletedOwners, 1);
    assert(s.owners.every((o) => o.fault === 1));
    assert.deepEqual(s.values, [0.7, 0.2, 0, 0]);
});
test('partial open independently disposed even if cleanup also fails', () => {
    const s = setup();
    s.bind(
        s.addOwner({
            dispose() {
                throw new Error('cleanup');
            },
        }),
    );
    s.bind(
        s.addOwner({
            open() {
                throw null;
            },
        }),
    );
    const t = s.registry.begin(s.asset);
    caught(() => t.prepare(s.source()), null);
    assert.equal(t.diagnostics().cleanupAttemptedOwners, 2);
    assert.equal(t.diagnostics().cleanupUnresolvedOwners, 1);
    assert(s.owners.every((o) => o.fault === 1));
});
test('actual read failure is separately retained, with no setter replay', () => {
    const s = setup();
    s.bind(s.addOwner());
    const t = s.registry.begin(s.asset);
    t.prepare(
        s.source(undefined, {
            actual() {
                throw 0;
            },
        }),
    );
    caught(() => t.apply(), 0);
    assert.equal(t.diagnostics().actualRead, 'failed');
    assert.equal(s.native, 1);
    assert.equal(t.diagnostics().native[0].state, 'returned');
});
test('private value reentry from public notification fails even if caught', () => {
    const s = setup();
    s.bind(s.addOwner());
    const t = s.registry.begin(s.asset);
    t.prepare(
        s.source(undefined, {
            emit() {
                caught(() => s.registry.begin(s.asset));
            },
        }),
    );
    caught(() => t.apply());
    assert.equal(t.diagnostics().publicReturned, true);
    assert.equal(s.native, 1);
    assert.equal(s.owners[0].fault, 1);
});
test('wrong receiver, copied ticket and replay cannot execute plans', () => {
    const s = setup();
    s.bind(s.addOwner());
    const t = s.registry.begin(s.asset);
    t.prepare(s.source());
    caught(() => t.apply.call({ ...t }));
    caught(() => t.apply());
    assert.equal(s.native, 0);
    const q = setup();
    q.bind(q.addOwner());
    const completed = apply(q);
    caught(() => completed.apply());
    assert.equal(q.native, 1);
});
test('pending transition protects both assets and cannot publish wrong actual identity', () => {
    const s = setup(),
        o = s.addOwner(),
        binding = s.bind(o),
        replacement = {};
    const transition = o.lease.prepareMembership({
        binding,
        before: s.asset,
        after: replacement,
        role: 'explicit',
        initialized: true,
    });
    caught(() => s.registry.assertDestroyable(s.asset));
    caught(() => s.registry.assertDestroyable(replacement));
    caught(() => s.registry.begin(s.asset));
    caught(() => transition.publish({}));
    caught(() => transition.publish.call({}, replacement));
    transition.publish(replacement);
    s.registry.assertDestroyable(s.asset);
    caught(() => s.registry.assertDestroyable(replacement));
    caught(() => transition.publish(replacement));
});
test('cancel removes only unaccepted candidate, preserves prior live binding', () => {
    const s = setup(),
        o = s.addOwner(),
        b = s.bind(o),
        next = {};
    const p = o.lease.prepareMembership({
        binding: b,
        before: s.asset,
        after: next,
        role: 'explicit',
        initialized: true,
    });
    p.cancel();
    s.registry.assertDestroyable(next);
    caught(() => s.registry.assertDestroyable(s.asset));
    caught(() => p.cancel());
});
test('retiring one binding does not release another owner or same-owner binding', () => {
    const s = setup(),
        a = s.addOwner(),
        b = s.addOwner(),
        first = s.bind(a);
    s.bind(a);
    s.bind(b);
    a.lease
        .prepareMembership({ binding: first, before: s.asset, after: null, role: 'explicit', initialized: true })
        .publish(null);
    assert.equal(a.lease.diagnostics().bindings, 1);
    caught(() => s.registry.assertDestroyable(s.asset));
    a.lease.close('released');
    assert.equal(b.lease.diagnostics().bindings, 1);
    caught(() => s.registry.assertDestroyable(s.asset));
    b.lease.close('released');
    s.registry.assertDestroyable(s.asset);
    assert.equal(s.registry.begin(s.asset), undefined);
});
test('provisional binding cannot execute but remains destroy blocker until initialized', () => {
    const s = setup(),
        o = s.addOwner(),
        b = s.bind(o, 'explicit', false);
    caught(() => s.registry.begin(s.asset));
    caught(() => s.registry.assertDestroyable(s.asset));
    o.lease
        .prepareMembership({ binding: b, before: s.asset, after: s.asset, role: 'explicit', initialized: true })
        .publish(s.asset);
    apply(s);
    assert.equal(s.native, 1);
});
test('mixed-backend blocker refuses complete transaction before opens', () => {
    const s = setup(),
        o = s.addOwner();
    s.bind(o);
    s.bind(s.addOwner(), 'blocker');
    caught(() => s.registry.begin(s.asset));
    assert.equal(o.open, 0);
    assert.equal(s.native, 0);
});
test('unknown teardown retains old/candidate tombstones, revokes execution and forbids replay', () => {
    const s = setup(),
        o = s.addOwner(),
        b = s.bind(o),
        next = {};
    const p = o.lease.prepareMembership({
        binding: b,
        before: s.asset,
        after: next,
        role: 'explicit',
        initialized: true,
    });
    o.lease.close('unknown');
    caught(() => s.registry.begin(s.asset));
    caught(() => s.registry.begin(next));
    caught(() => s.registry.assertDestroyable(s.asset));
    caught(() => s.registry.assertDestroyable(next));
    caught(() => p.cancel());
    caught(() => p.publish(next));
    caught(() => o.lease.close('released'));
    assert.equal(o.lease.diagnostics().state, 'closed-unknown');
});
test('stale generations cannot be registered or operate, unknown old generation remains blocker', () => {
    const s = setup(),
        identity = {},
        a = s.addOwner({ identity });
    s.bind(a);
    a.lease.close('unknown');
    caught(() => s.addOwner({ identity, generation: 1 }));
    const b = s.addOwner({ identity, generation: 2 });
    s.bind(b);
    caught(() => s.registry.begin(s.asset));
    caught(() => a.lease.prepareMembership({}));
    assert.equal(b.open, 0);
});
test('destroyed candidates refused before any lease publication', () => {
    const s = setup(),
        o = s.addOwner(),
        a = { destroyed: true };
    caught(() =>
        o.lease.prepareMembership({ binding: {}, before: null, after: a, role: 'explicit', initialized: true }),
    );
    s.registry.assertDestroyable(a);
    assert.equal(o.lease.diagnostics().pending, 0);
});
test('membership callback reentry latches and does not consume transition capacity', () => {
    const s = setup({ qualification: { counterLimit: 1 } });
    let reenter = true;
    const o = s.addOwner({
        admit() {
            if (reenter) caught(() => s.registry.registerOwner({}, 1, {}));
        },
    });
    caught(() => s.bind(o));
    reenter = false;
    s.bind(o);
    assert.equal(o.lease.diagnostics().bindings, 1);
});
test('counter exhaustion is pre-effect, and cannot wrap into replay authority', () => {
    const s = setup({ qualification: { counterLimit: 1 } }),
        o = s.addOwner();
    s.bind(o);
    caught(() => s.addOwner());
    const t = s.registry.begin(s.asset);
    t.prepare(s.source());
    t.dispose();
    caught(() => s.registry.begin(s.asset));
    assert.equal(s.native, 0);
});
test('prepared native capacity exhaustion precedes source write', () => {
    const s = setup({ qualification: { counterLimit: 1 } });
    s.bind(s.addOwner({ nativeCount: 2 }));
    const t = s.registry.begin(s.asset);
    caught(() => t.prepare(s.source()));
    assert.equal(s.native, 0);
    assert.equal(t.diagnostics().cacheWriteEntered, false);
});
test('parallel pending defaults refuse without creating duplicate owner default', () => {
    const s = setup(),
        o = s.addOwner();
    const p = o.lease.prepareMembership({
        binding: {},
        before: null,
        after: s.asset,
        role: 'default',
        initialized: true,
    });
    caught(() =>
        o.lease.prepareMembership({ binding: {}, before: null, after: s.asset, role: 'default', initialized: true }),
    );
    p.publish(s.asset);
    assert.equal(o.lease.diagnostics().bindings, 1);
});
test('unobserved assets preserve fast path during an owned transaction', () => {
    const s = setup();
    s.bind(s.addOwner());
    const unrelated = {};
    const t = apply(
        s,
        s.source(undefined, {
            emit() {
                assert.equal(s.registry.begin(unrelated), undefined);
                s.registry.assertDestroyable(unrelated);
            },
        }),
    );
    assert.equal(t.diagnostics().phase, 'committed');
});
test('cross-owner duplicate native identity is rejected before effects', () => {
    const s = setup(),
        target = {};
    s.bind(s.addOwner({ sameTarget: target }));
    s.bind(s.addOwner({ sameTarget: target }));
    const t = s.registry.begin(s.asset);
    caught(() => t.prepare(s.source()));
    assert.equal(s.native, 0);
});
test('faulted owner can confirm teardown but cannot execute or be silently replaced', () => {
    const s = setup(),
        identity = {},
        o = s.addOwner({
            identity,
            invoke() {
                throw 0;
            },
        });
    s.bind(o);
    const t = s.registry.begin(s.asset);
    t.prepare(s.source());
    caught(() => t.apply(), 0);
    caught(() => s.addOwner({ identity, generation: 2 }));
    o.lease.close('released');
    s.registry.assertDestroyable(s.asset);
    const fresh = s.addOwner({ identity, generation: 2 });
    s.bind(fresh);
    apply(s);
});
test('cancelling one prepared binding preserves another same-owner reservation', () => {
    const s = setup(),
        o = s.addOwner();
    const first = o.lease.prepareMembership({
        binding: {},
        before: null,
        after: s.asset,
        role: 'explicit',
        initialized: true,
    });
    const second = o.lease.prepareMembership({
        binding: {},
        before: null,
        after: s.asset,
        role: 'explicit',
        initialized: true,
    });
    first.cancel();
    second.publish(s.asset);
    apply(s);
    assert.equal(s.native, 1);
});
test('retiring last live binding preserves pending same-asset candidate group', () => {
    const s = setup(),
        o = s.addOwner(),
        old = s.bind(o);
    const next = o.lease.prepareMembership({
        binding: {},
        before: null,
        after: s.asset,
        role: 'explicit',
        initialized: true,
    });
    o.lease
        .prepareMembership({ binding: old, before: s.asset, after: null, role: 'explicit', initialized: true })
        .publish(null);
    next.publish(s.asset);
    apply(s);
    assert.equal(s.native, 1);
});
test('foreign existing roster reentry from public emit is latched', () => {
    const s = setup(),
        other = {};
    s.bind(s.addOwner());
    s.bind(s.addOwner(), 'explicit', true, other);
    const t = s.registry.begin(s.asset);
    t.prepare(
        s.source(undefined, {
            emit() {
                caught(() => s.registry.begin(other));
            },
        }),
    );
    caught(() => t.apply());
    assert.equal(t.diagnostics().hasFailure, true);
    assert.equal(s.native, 1);
});
const summary = {
    schema: 's1-private-material-roster-controls/1',
    qualification: 'ISOLATED_PURE_PROTOCOL_ONLY',
    browserEvidence: 'NONE',
    realNativeEvidence: 'NONE',
    engineIntegration: false,
    unifiedActivation: false,
    formalRequiredCellsUnchanged: { NOT_RUN: 2128 },
    total: results.length,
    passed: results.filter((v) => v.status === 'PASS').length,
    failed: results.filter((v) => v.status === 'FAIL').length,
    results,
};
require('node:fs').writeFileSync(process.argv[2], JSON.stringify(summary, null, 2) + '\n');
if (summary.failed) process.exitCode = 1;
