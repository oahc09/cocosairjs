/* Single-process, actual-entry-source controls. No real World, owner adapter, or WASM. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = __dirname;
const tsPath = require.resolve('typescript', { paths: [path.join(root, '../box3d-rebuild-20261022')] });
const ts = require(tsPath);
const sources = {
    original: 'inputs/product/src/cocos/physics/framework/assets/physics-material.ts',
    candidate: 'src/cocos/physics/framework/assets/physics-material.ts',
    bridge: 'src/cocos/physics/framework/physics-material-values.ts',
    primitive: 'inputs/s1/physics-material-values-transaction.ts',
    guard: 'inputs/product/src/cocos/core/data/mutation-guard.ts',
    math: 'inputs/product/src/cocos/core/math/utils.ts',
};
const source = Object.fromEntries(
    Object.entries(sources).map(([k, p]) => [k, fs.readFileSync(path.join(root, p), 'utf8')]),
);
const compiled = {};
for (const key of ['original', 'candidate', 'bridge', 'primitive', 'guard']) {
    const r = ts.transpileModule(source[key], {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.CommonJS,
            experimentalDecorators: true,
        },
        fileName: sources[key],
        reportDiagnostics: true,
    });
    assert.equal((r.diagnostics || []).length, 0);
    compiled[key] = r.outputText;
}
const mathAst = ts.createSourceFile('utils.ts', source.math, ts.ScriptTarget.Latest, true);
const equalsNode = mathAst.statements.find((node) => ts.isFunctionDeclaration(node) && node.name.text === 'equals');
assert(equalsNode);
const mathJs = ts.transpileModule(equalsNode.getText(mathAst), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const mathExports = {};
new Function('exports', 'mathAbs', 'EPSILON', mathJs)(mathExports, Math.abs, 0.000001);
const fields = ['friction', 'restitution', 'rollingFriction', 'spinningFriction'];
function repr(v) {
    if (typeof v === 'number') return Number.isNaN(v) ? 'NaN' : Object.is(v, -0) ? '-0' : `${v}`;
    if (v === undefined) return 'undefined';
    if (typeof v === 'bigint') return `${v}n`;
    return v && typeof v === 'object' ? 'object' : `${typeof v}:${v}`;
}
function instantiate(version = 'candidate') {
    const events = [];
    const cache = {};
    const modules = {};
    function load(key) {
        if (modules[key]) return modules[key];
        const exports = (modules[key] = {});
        const req = (id) => {
            if (id.includes('physics-material-values-transaction')) return load('primitive');
            if (id.includes('physics-material-values')) return load('bridge');
            if (id.includes('mutation-guard')) return load('guard');
            if (id === 'cc.decorator')
                return {
                    ccclass: () => (ctor) => ctor,
                    editable() {},
                    serializable() {},
                    type: () => () => {},
                    range: () => () => {},
                };
            if (id.endsWith('/asset'))
                return {
                    Asset: class {
                        constructor() {
                            this._uuid = '';
                            this.flags = 0;
                            this.listeners = [];
                        }
                        emit(event) {
                            events.push(['emit', event]);
                            for (const listener of this.listeners) listener();
                        }
                        destroy() {
                            events.push(['super.destroy']);
                            this.flags++;
                            return true;
                        }
                    },
                };
            if (id.endsWith('/core')) return { CCFloat: Number, math: mathExports };
            throw new Error(`Unmapped dependency ${id}`);
        };
        new Function('require', 'exports', 'module', compiled[key])(req, exports, { exports });
        return exports;
    }
    const Material = load(version).PhysicsMaterial;
    const asset = new Material();
    for (const f of fields) {
        cache[f] = asset[`_${f}`];
        Object.defineProperty(asset, `_${f}`, {
            configurable: true,
            get() {
                events.push(['read', f]);
                return cache[f];
            },
            set(v) {
                events.push(['write', f, repr(v)]);
                cache[f] = v;
            },
        });
    }
    const env = { asset, Material, events, cache, bridge: load('bridge'), guard: load('guard') };
    env.own = (options = {}) => {
        const record = {
            context: null,
            copied: null,
            committed: null,
            fault: null,
            opens: 0,
            prepares: 0,
            disposals: 0,
            cacheCommits: 0,
            invokes: 0,
            verifies: 0,
        };
        const binding = {};
        const delegate = {
            admitAsset(a) {
                assert.equal(a, asset);
                if (options.admit) options.admit(a);
            },
            open(context) {
                record.context = context;
                record.opens++;
                events.push(['open']);
                if (options.open) options.open(context);
            },
            prepare(context, copied) {
                record.prepares++;
                record.copied = copied;
                events.push(['prepare']);
                if (options.prepare) return options.prepare(context, copied);
                return {
                    native: copied.changed
                        ? [
                              {
                                  target: {},
                                  invoke() {
                                      record.invokes++;
                                      events.push(['native']);
                                      if (options.invoke) options.invoke();
                                  },
                                  verify() {
                                      record.verifies++;
                                      events.push(['verify']);
                                      if (options.verify) options.verify();
                                  },
                              },
                          ]
                        : [],
                    commitCaches() {
                        record.cacheCommits++;
                        events.push(['owner.cache']);
                        if (options.cache) options.cache();
                    },
                };
            },
            commit(context, actual) {
                record.committed = actual;
                events.push(['commit']);
                if (options.commit) options.commit(actual);
            },
            fault(context, failure) {
                record.fault = failure;
                events.push(['fault']);
                if (options.fault) options.fault(failure);
            },
            dispose() {
                record.disposals++;
                events.push(['dispose']);
                if (options.dispose) options.dispose();
            },
        };
        const lease = env.bridge.registerPhysicsMaterialValuesOwner({}, 1, delegate);
        const transition = lease.prepareMembership({
            binding,
            before: null,
            after: asset,
            role: options.role || 'explicit',
            initialized: options.initialized !== false,
        });
        if (!options.provisional) transition.publish(asset);
        events.length = 0;
        return { lease, transition, record, binding };
    };
    events.length = 0;
    return env;
}
function caught(fn) {
    try {
        fn();
        return { threw: false };
    } catch (error) {
        return { threw: true, error };
    }
}
const results = [];
function test(name, run) {
    const start = process.hrtime.bigint();
    try {
        const detail = run();
        results.push({
            name,
            status: 'PASS',
            detail: detail || null,
            elapsedMs: Number(process.hrtime.bigint() - start) / 1e6,
        });
    } catch (error) {
        results.push({ name, status: 'FAIL', error: (error && error.stack) || repr(error) });
    }
}
function runEntry(e, entry, value) {
    if (entry === 'setValues') e.asset.setValues(...value);
    else e.asset[entry] = value;
}
const entries = [...fields, 'setValues'];
for (const entry of entries) {
    const values =
        entry === 'setValues'
            ? [
                  [0.6, 0, 0, 0],
                  [0.7, 0.3, 0.4, 0.2],
                  [NaN, 0, 0, Infinity],
                  [-0, -0, -0, -0],
                  [null, undefined, 'x', false],
              ]
            : [0.6, 0, 0.6000005, 0.600002, -0, -1, NaN, Infinity, '0.8', null, undefined, 1n];
    values.forEach((value, i) =>
        test(`unowned.original-trace.${entry}.${i}`, () => {
            const a = instantiate('original'),
                b = instantiate();
            const x = caught(() => runEntry(a, entry, value)),
                y = caught(() => runEntry(b, entry, value));
            assert.equal(y.threw, x.threw);
            if (x.threw) assert.equal(y.error.constructor, x.error.constructor);
            assert.deepEqual(b.events, a.events);
            for (const f of fields) assert(Object.is(b.cache[f], a.cache[f]));
            return { trace: b.events };
        }),
    );
}
for (const entry of fields)
    test(`unowned.coercion-trace.${entry}`, () => {
        const traces = [];
        for (const version of ['original', 'candidate']) {
            const e = instantiate(version);
            let count = 0;
            const value = {
                valueOf() {
                    e.events.push(['coerce', ++count]);
                    return 0.8;
                },
            };
            runEntry(e, entry, value);
            traces.push(e.events);
        }
        assert.deepEqual(traces[1], traces[0]);
        return { trace: traces[1] };
    });
for (const failure of [undefined, null, false, 0, ''])
    test(`unowned.coercion-falsy.${repr(failure)}`, () => {
        const traces = [];
        for (const version of ['original', 'candidate']) {
            const e = instantiate(version);
            const value = {
                valueOf() {
                    e.events.push(['coerce']);
                    throw failure;
                },
            };
            const out = caught(() => {
                e.asset.friction = value;
            });
            assert(out.threw);
            assert(Object.is(out.error, failure));
            traces.push(e.events);
        }
        assert.deepEqual(traces[1], traces[0]);
    });
for (const entry of entries)
    test(`mutation-guard-first.${entry}`, () => {
        const e = instantiate();
        e.own();
        e.guard.registerMutationGuard([e.asset], { code: 'TEST', message: 'blocked' });
        const out = caught(() => runEntry(e, entry, entry === 'setValues' ? [0.7, 0, 0, 0.2] : 0.7));
        assert(out.threw);
        assert.equal(out.error.code, 'TEST');
        assert.deepEqual(e.events, []);
    });
for (const entry of entries)
    test(`owned.entry.${entry}`, () => {
        const e = instantiate();
        if (entry === 'rollingFriction' || entry === 'spinningFriction') e.cache[entry] = -0;
        const o = e.own();
        const value =
            entry === 'setValues'
                ? [0.8, 0, 0, 0.3]
                : entry === 'rollingFriction' || entry === 'spinningFriction'
                  ? 0
                  : 0.8;
        runEntry(e, entry, value);
        assert.equal(o.record.opens, 1);
        assert.equal(o.record.prepares, 1);
        assert.equal(o.record.disposals, 1);
        assert.deepEqual(
            o.record.copied.candidate,
            entry === 'setValues'
                ? [0.8, 0.3, 0, 0]
                : fields.map((f) => (f === entry ? value : f === 'friction' ? 0.6 : 0)),
        );
        const changed = entry !== 'rollingFriction' && entry !== 'spinningFriction';
        assert.equal(o.record.invokes, changed ? 1 : 0);
        assert.equal(e.events.filter((v) => v[0] === 'emit').length, changed ? 1 : 0);
        if (changed)
            assert(e.events.findIndex((v) => v[0] === 'owner.cache') < e.events.findIndex((v) => v[0] === 'emit'));
        return { trace: e.events, copied: o.record.copied };
    });
for (const entry of fields)
    test(`owned.scalar-tolerance.${entry}`, () => {
        const e = instantiate();
        const o = e.own();
        const v = e.cache[entry] + (entry === 'rollingFriction' || entry === 'spinningFriction' ? 0 : 0.0000005);
        e.asset[entry] = v;
        assert.equal(o.record.copied.changed, false);
        assert.equal(o.record.invokes, 0);
        assert.equal(e.events.filter((v) => v[0] === 'write' || v[0] === 'emit').length, 0);
        assert(Object.is(e.cache[entry], entry === 'friction' ? 0.6 : 0));
    });
test('owned.setValues-exact-small-change-and-write-order', () => {
    const e = instantiate();
    const o = e.own();
    e.asset.setValues(0.6000005, 0, 0, 0);
    assert.equal(o.record.copied.changed, true);
    assert.deepEqual(
        e.events.filter((v) => v[0] === 'write').map((v) => v[1]),
        ['friction', 'rollingFriction', 'spinningFriction', 'restitution'],
    );
    assert.equal(e.events.filter((v) => v[0] === 'emit').length, 1);
    return { trace: e.events };
});
test('owned.setValues-no-change-still-writes-four-and-retains-signed-zero', () => {
    const e = instantiate();
    const o = e.own();
    e.asset.setValues(0.6, -0, -0, -0);
    assert.equal(o.record.copied.changed, false);
    assert.equal(o.record.invokes, 0);
    assert.equal(o.record.cacheCommits, 0);
    assert.deepEqual(
        e.events.filter((v) => v[0] === 'write').map((v) => v[1]),
        ['friction', 'rollingFriction', 'spinningFriction', 'restitution'],
    );
    assert.equal(e.events.filter((v) => v[0] === 'emit').length, 0);
    for (const f of fields.slice(1)) assert(Object.is(e.cache[f], -0));
    return { trace: e.events };
});
for (const entry of entries)
    for (const invalid of [NaN, Infinity, -Infinity, -1, null, undefined, '0.7', {}, 1n, 1e100])
        test(`owned.invalid.${entry}.${repr(invalid)}`, () => {
            const e = instantiate();
            const o = e.own();
            const out = caught(() => runEntry(e, entry, entry === 'setValues' ? [invalid, 0, 0, 0] : invalid));
            assert(out.threw);
            assert.equal(o.record.disposals, 1);
            assert.equal(o.record.prepares, 0);
            assert(!e.events.some((v) => ['write', 'native', 'emit'].includes(v[0])));
        });
for (const entry of ['rollingFriction', 'spinningFriction'])
    test(`owned.unsupported-positive.${entry}`, () => {
        const e = instantiate();
        e.own();
        assert(
            caught(() => {
                e.asset[entry] = 0.1;
            }).threw,
        );
        assert(!e.events.some((v) => ['write', 'native', 'emit'].includes(v[0])));
    });
for (const entry of entries)
    test(`owned.strict-validation-before-coercion.${entry}`, () => {
        const e = instantiate();
        e.own();
        let conversions = 0;
        const value = {
            valueOf() {
                conversions++;
                e.asset.restitution = 0.4;
                return 0.7;
            },
        };
        assert(caught(() => runEntry(e, entry, entry === 'setValues' ? [value, 0, 0, 0] : value)).threw);
        assert.equal(conversions, 0);
        assert(!e.events.some((v) => ['write', 'native', 'emit'].includes(v[0])));
    });
for (const entry of entries)
    test(`owned.ignores-public-getters.${entry}`, () => {
        const e = instantiate();
        e.own();
        for (const f of fields)
            Object.defineProperty(e.asset, f, {
                get() {
                    throw new Error('public getter must not run');
                },
                set: Object.getOwnPropertyDescriptor(e.Material.prototype, f).set,
            });
        runEntry(
            e,
            entry,
            entry === 'setValues'
                ? [0.7, 0, 0, 0.2]
                : entry === 'rollingFriction' || entry === 'spinningFriction'
                  ? 0
                  : 0.7,
        );
    });
for (const swallowed of [false, true])
    test(`owned.private-read-reentry.${swallowed}`, () => {
        const e = instantiate();
        const o = e.own();
        let entered = false;
        Object.defineProperty(e.asset, '_friction', {
            get() {
                if (!entered) {
                    entered = true;
                    const f = () => {
                        e.asset.restitution = 0.4;
                    };
                    if (swallowed) caught(f);
                    else f();
                }
                return 0.6;
            },
            set() {
                throw new Error('must not write');
            },
        });
        const out = caught(() => {
            e.asset.friction = 0.7;
        });
        assert(out.threw);
        assert.match(out.error.message, /re-enter/);
        assert.equal(o.record.disposals, 1);
        assert.equal(o.record.prepares, 0);
        assert(!e.events.some((v) => ['write', 'native', 'emit'].includes(v[0])));
    });
for (const phase of ['live', 'provisional', 'uninitialized', 'blocker', 'closed-unknown'])
    test(`owned.destroy-held.${phase}`, () => {
        const e = instantiate();
        const o = e.own({
            provisional: phase === 'provisional',
            initialized: phase !== 'uninitialized',
            role: phase === 'blocker' ? 'blocker' : 'explicit',
        });
        if (phase === 'closed-unknown') o.lease.close('unknown');
        e.events.length = 0;
        const before = e.Material.allMaterials.slice();
        assert(caught(() => e.asset.destroy()).threw);
        assert.equal(e.asset.flags, 0);
        assert.deepEqual(e.Material.allMaterials, before);
        assert(!e.events.some((v) => v[0] === 'super.destroy'));
    });
test('owned.destroy-after-exact-released-close', () => {
    const e = instantiate();
    const o = e.own();
    o.lease.close('released');
    e.events.length = 0;
    assert.equal(e.asset.destroy(), true);
    assert.equal(e.asset.flags, 1);
    assert(!e.Material.allMaterials.includes(e.asset));
    assert.deepEqual(e.events, [['super.destroy']]);
});
test('unowned.destroy-original-trace', () => {
    const traces = [];
    for (const v of ['original', 'candidate']) {
        const e = instantiate(v);
        assert(e.asset.destroy());
        assert.equal(e.asset.flags, 1);
        traces.push(e.events);
    }
    assert.deepEqual(...traces);
});
for (const failure of [undefined, null, false, 0, ''])
    test(`owned.falsy-public-and-cleanup.${repr(failure)}`, () => {
        const e = instantiate();
        let observed;
        const cleanup = new Error('cleanup secondary');
        const a = e.own({
            dispose() {
                throw cleanup;
            },
            fault(f) {
                observed = f;
            },
        });
        const b = e.own();
        e.asset.listeners.push(() => {
            throw failure;
        });
        const out = caught(() => {
            e.asset.friction = 0.8;
        });
        assert(out.threw);
        assert(Object.is(out.error, failure));
        assert.equal(a.record.disposals, 1);
        assert.equal(b.record.disposals, 1);
        assert(observed.hasFailure);
        assert(Object.is(observed.error, failure));
        assert.equal(e.cache.friction, 0.8);
        assert.equal(e.events.filter((v) => v[0] === 'emit').length, 1);
        assert(
            caught(() => {
                e.asset.restitution = 0.2;
            }).threw,
        );
        return { trace: e.events };
    });
for (const phase of ['open', 'prepare', 'invoke', 'verify', 'cache', 'commit', 'dispose'])
    test(`owned.failure-boundary.${phase}`, () => {
        const e = instantiate();
        const failure = false;
        const o = e.own({
            [phase]() {
                throw failure;
            },
        });
        const out = caught(() => {
            e.asset.friction = 0.8;
        });
        assert(out.threw);
        assert.equal(out.error, false);
        assert.equal(o.record.disposals, 1);
        if (phase === 'open' || phase === 'prepare') assert.equal(e.cache.friction, 0.6);
        else assert.equal(e.cache.friction, 0.8);
    });
test('owned.partial-setValues-recorder-after-each-assignment', () => {
    const e = instantiate();
    let diagnostic;
    const o = e.own({
        fault(f) {
            diagnostic = f;
        },
    });
    Object.defineProperty(e.asset, '_spinningFriction', {
        get() {
            return 0;
        },
        set() {
            throw false;
        },
    });
    const out = caught(() => e.asset.setValues(0.8, 0, 0, 0.3));
    assert(out.threw);
    assert.equal(out.error, false);
    assert.equal(diagnostic.cacheWrites, 2);
    assert.equal(diagnostic.publicEntered, false);
    assert.equal(o.record.invokes, 0);
    assert.equal(e.cache.friction, 0.8);
    assert.equal(e.cache.restitution, 0);
    return { diagnostic };
});
test('owned.success-cannot-reuse-ticket', () => {
    const e = instantiate();
    e.own();
    const t = e.bridge.beginPhysicsMaterialValuesChange(e.asset);
    t.dispose();
    assert(caught(() => t.apply()).threw);
    assert.equal(t.diagnostics().phase, 'cancelled');
    e.asset.friction = 0.7;
});

test('static.original-statements-unchanged-in-unowned-path', () => {
    const parse = (text) => ts.createSourceFile('asset.ts', text, ts.ScriptTarget.Latest, true);
    const oldAst = parse(source.original),
        newAst = parse(source.candidate);
    const oldClass = oldAst.statements.find(ts.isClassDeclaration),
        newClass = newAst.statements.find(ts.isClassDeclaration);
    for (const oldMember of oldClass.members) {
        const newMember = newClass.members.find(
            (m) => m.kind === oldMember.kind && m.name?.getText(newAst) === oldMember.name?.getText(oldAst),
        );
        assert(newMember);
        const name = oldMember.name?.getText(oldAst);
        if (ts.isSetAccessorDeclaration(oldMember) || name === 'setValues') {
            assert.equal(newMember.body.statements.length, oldMember.body.statements.length + 2);
            assert.deepEqual(
                newMember.body.statements.filter((_, i) => i !== 1 && i !== 2).map((n) => n.getText(newAst)),
                oldMember.body.statements.map((n) => n.getText(oldAst)),
            );
        } else if (name === 'destroy') {
            assert.equal(newMember.body.statements.length, oldMember.body.statements.length + 1);
            assert.deepEqual(
                newMember.body.statements.filter((_, i) => i !== 1).map((n) => n.getText(newAst)),
                oldMember.body.statements.map((n) => n.getText(oldAst)),
            );
        } else assert.equal(newMember.getText(newAst), oldMember.getText(oldAst));
    }
});
test('static.bridge-exposes-only-three-s1-wrappers', () => {
    const e = instantiate();
    assert.deepEqual(Object.keys(e.bridge).sort(), [
        'assertPhysicsMaterialDestroyable',
        'beginPhysicsMaterialValuesChange',
        'registerPhysicsMaterialValuesOwner',
    ]);
    const ast = ts.createSourceFile('bridge.ts', source.bridge, ts.ScriptTarget.Latest, true);
    const imports = ast.statements.filter(ts.isImportDeclaration).map((n) => n.moduleSpecifier.text);
    assert.deepEqual(imports, ['./physics-material-values-transaction']);
});
for (const entry of entries)
    test(`unowned.private-getter-reentry-trace.${entry}`, () => {
        const traces = [];
        for (const version of ['original', 'candidate']) {
            const e = instantiate(version);
            let nested = false;
            Object.defineProperty(e.asset, '_friction', {
                get() {
                    e.events.push(['special-read', 'friction']);
                    if (!nested) {
                        nested = true;
                        e.asset.restitution = 0.25;
                    }
                    return e.cache.friction;
                },
                set(v) {
                    e.events.push(['special-write', 'friction', repr(v)]);
                    e.cache.friction = v;
                },
            });
            runEntry(e, entry, entry === 'setValues' ? [0.7, 0.1, 0.2, 0.3] : 0.8);
            traces.push(e.events);
        }
        assert.deepEqual(traces[1], traces[0]);
        return { trace: traces[1] };
    });
for (const field of ['friction', 'rollingFriction', 'spinningFriction', 'restitution'])
    test(`unowned.setValues-partial-write.${field}`, () => {
        const traces = [];
        for (const version of ['original', 'candidate']) {
            const e = instantiate(version);
            Object.defineProperty(e.asset, `_${field}`, {
                get() {
                    e.events.push(['special-read', field]);
                    return e.cache[field];
                },
                set() {
                    e.events.push(['throw-write', field]);
                    throw null;
                },
            });
            const out = caught(() => e.asset.setValues(0.8, 0.2, 0.3, 0.4));
            assert(out.threw);
            assert.equal(out.error, null);
            traces.push(e.events);
        }
        assert.deepEqual(traces[1], traces[0]);
        return { trace: traces[1] };
    });
for (const entry of fields)
    test(`unowned.coercion-reentry-trace.${entry}`, () => {
        const traces = [];
        for (const version of ['original', 'candidate']) {
            const e = instantiate(version);
            let n = 0;
            const value = {
                valueOf() {
                    e.events.push(['coerce', ++n]);
                    e.asset.setValues(0.6, 0, 0, 0.1 * n);
                    return 0.8;
                },
            };
            runEntry(e, entry, value);
            traces.push(e.events);
        }
        assert.deepEqual(traces[1], traces[0]);
        return { trace: traces[1] };
    });
for (const role of ['default', 'explicit'])
    test(`owned.exact-role-propagation.${role}`, () => {
        const e = instantiate();
        const o = e.own({ role });
        e.asset.friction = 0.8;
        assert.equal(o.record.context.bindings[0].role, role);
        assert.equal(o.record.context.bindings[0].binding, o.binding);
    });
for (const entry of entries)
    test(`owned.public-emit-cannot-obtain-private-propagation.${entry}`, () => {
        const e = instantiate();
        const o = e.own();
        e.asset.emit(e.Material.EVENT_UPDATE);
        assert.equal(o.record.opens, 0);
        assert.equal(o.record.invokes, 0);
        runEntry(
            e,
            entry,
            entry === 'setValues'
                ? [0.7, 0, 0, 0.2]
                : entry === 'rollingFriction' || entry === 'spinningFriction'
                  ? 0
                  : 0.7,
        );
        assert.equal(o.record.opens, 1);
    });
if (process.argv.includes('--known-s1-red'))
    test('KNOWN_S1_DEFECT.scalar-nochange-commit-failure-must-fault', () => {
        const e = instantiate();
        let commits = 0;
        const a = e.own();
        const b = e.own({
            commit() {
                commits++;
                if (commits === 1) throw null;
            },
        });
        const failure = caught(() => {
            e.asset.friction = 0.6;
        });
        assert(failure.threw);
        assert.equal(failure.error, null);
        const afterFailure = {
            first: a.lease.diagnostics(),
            second: b.lease.diagnostics(),
            firstFault: a.record.fault,
            secondFault: b.record.fault,
            firstCommitted: a.record.committed,
            secondCommitted: b.record.committed,
            trace: e.events.slice(),
        };
        const followup = caught(() => {
            e.asset.friction = 0.8;
        });
        const observed = {
            afterFailure,
            followup: { threw: followup.threw, invokes: [a.record.invokes, b.record.invokes], cache: e.cache.friction },
        };
        fs.mkdirSync(path.join(root, 'evidence/s1-known-defect'), { recursive: true });
        fs.writeFileSync(
            path.join(root, 'evidence/s1-known-defect/probe.json'),
            JSON.stringify(observed, null, 2) + '\n',
        );
        assert.equal(
            afterFailure.first.state,
            'faulted',
            'A no-change owner commit is an effect; first owner must fault when later owner commit throws.',
        );
    });
const outDir = path.join(root, process.argv[2] || 'evidence/run-a');
fs.mkdirSync(outDir, { recursive: true });
const stats = {
    schema: 'material-value-entry-controls/1',
    scope: 'Actual asset entry and guard source; frozen S1; simulated Asset/EventTarget and owner/native callbacks; not actual World/WASM',
    node: process.version,
    typescript: ts.version,
    passed: results.filter((r) => r.status === 'PASS').length,
    failed: results.filter((r) => r.status === 'FAIL').length,
    total: results.length,
    sources: Object.entries(sources).map(([role, p]) => ({
        role,
        path: p,
        sha256: crypto.createHash('sha256').update(source[role]).digest('hex'),
    })),
    results,
};
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(stats, null, 2) + '\n');
for (const [key, js] of Object.entries(compiled)) fs.writeFileSync(path.join(outDir, `${key}.js`), js);
fs.writeFileSync(path.join(outDir, 'math-equals.js'), mathJs);
console.log(
    JSON.stringify({
        passed: stats.passed,
        failed: stats.failed,
        total: stats.total,
        results: path.relative(root, path.join(outDir, 'results.json')),
    }),
);
for (const r of results.filter((r) => r.status === 'FAIL')) console.error(r.name + '\n' + r.error);
process.exitCode = stats.failed ? 1 : 0;
