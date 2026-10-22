/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/
// Actual-source pure observer controls only. No engine wiring, native physics, or WASM qualification.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = 'src/cocos/physics/framework/physics-state-observer.ts';
const runner = 'tools/verify/box3d/physics-state-observer-control.mjs';
const contract = 'tools/verify/box3d/physics-state-observer-contract-20261022-a/README.md';
const revisedContract = 'tools/verify/box3d/physics-state-observer-contract-20261022-b/README.md';
const out = path.resolve(process.argv[2]);
await mkdir(out); // Never overwrite any earlier attempt.
const sha = (data) => createHash('sha256').update(data).digest('hex');
const inputs = {};
for (const file of [source, runner, contract, revisedContract]) {
    try {
        const bytes = await readFile(file);
        inputs[file] = sha(bytes);
        await writeFile(path.join(out, file === revisedContract ? 'contract-b.README.md' : path.basename(file)), bytes);
    } catch (error) {
        if (error.code !== 'ENOENT' || file !== source) throw error;
        inputs[file] = null;
    }
}
if (!inputs[source]) {
    const result = { status: 'MISSING_IMPLEMENTATION_RED_NOT_ENGINE_DEFECT', inputs, rows: [] };
    await writeFile(path.join(out, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result));
    process.exit(1);
}
const compiled = ts.transpileModule(await readFile(source, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);
const { PhysicsStateObserverRegistry: Registry } = api;
const rows = [];
const check = (name, run) => {
    try {
        run();
        rows.push({ name, status: 'PASS_PURE_OBSERVER_CONTROL' });
    } catch (error) {
        rows.push({ name, status: 'FAIL', error: String(error), stack: error?.stack ?? null });
    }
};
const caught = (fn) => {
    try {
        fn();
        return { threw: false };
    } catch (error) {
        return { threw: true, error };
    }
};
const sameThrow = (fn, error) => {
    const observed = caught(fn);
    assert.equal(observed.threw, true);
    assert.equal(observed.error, error);
};
const snapshot = (material = null) => ({ kind: 'collider-material', material, shared: false });
const pair = () => ({ before: snapshot(), candidate: snapshot({}) });
const options = (overrides = {}) => ({
    open() {},
    preflight() {},
    commit() {},
    fail() {},
    dispose() {},
    ...overrides,
});
const setup = (override = {}) => {
    const registry = new Registry();
    const target = {};
    const events = [];
    const received = {};
    const observer = options({
        open(c) {
            events.push('open');
            received.context = c;
        },
        preflight(c, before, candidate) {
            events.push('preflight');
            received.before = before;
            received.candidate = candidate;
        },
        commit(c, actual) {
            events.push('commit');
            received.actual = actual;
        },
        fail(c, failure) {
            events.push('fail');
            received.failure = failure;
        },
        dispose() {
            events.push('dispose');
        },
        ...override,
    });
    const lease = registry.register(target, observer);
    return { registry, target, events, received, observer, lease };
};
const begin = (s) => s.registry.begin(s.target, 'collider-material-set');
check('no-owner fastpath does not inspect operation or candidate', () => {
    const r = new Registry();
    const bomb = new Proxy(
        {},
        {
            get() {
                throw new Error('read');
            },
        },
    );
    assert.equal(r.begin({}, bomb), undefined);
    r.register({}, options());
    assert.equal(r.begin({}, bomb), undefined);
});
check('all owner barriers open before before/candidate getters', () => {
    const s = setup();
    s.registry.register(
        s.target,
        options({
            open() {
                s.events.push('open2');
            },
        }),
    );
    const t = begin(s);
    t.prepare(() => {
        assert.deepEqual(s.events, ['open', 'open2']);
        return pair();
    });
    t.commit(() => snapshot());
    assert.equal(t.diagnostics().commitCompleted, true);
    assert(Object.isFrozen(t));
    assert(Object.isFrozen(s.received.context));
});
check('release one owner leaves another and repeated release is safe', () => {
    const s = setup();
    let other = 0;
    const b = s.registry.register(
        s.target,
        options({
            open() {
                other++;
            },
        }),
    );
    s.lease.dispose();
    s.lease.dispose();
    const t = begin(s);
    t.prepare(pair);
    t.dispose();
    assert.equal(other, 1);
    b.dispose();
    assert.equal(begin(s), undefined);
});
check('copied callback refs preserve original receiver and ignore later changes', () => {
    const s = setup();
    let receiver;
    const o = options({
        open() {
            receiver = this;
        },
    });
    const target = {};
    s.registry.register(target, o);
    o.open = () => {
        throw new Error('mutated');
    };
    const t = s.registry.begin(target, 'collider-material-set');
    t.prepare(pair);
    t.dispose();
    assert.equal(receiver, o);
});
check('snapshot getters read once and scalar copies detached; asset identity not frozen', () => {
    const s = setup();
    const asset = {};
    let reads = 0;
    const input = {
        kind: 'collider-material',
        get material() {
            reads++;
            return asset;
        },
        shared: true,
    };
    const t = begin(s);
    t.prepare(() => ({ before: snapshot(), candidate: input }));
    input.shared = false;
    assert.equal(reads, 1);
    assert.equal(s.received.candidate.shared, true);
    assert.equal(s.received.candidate.material, asset);
    assert(Object.isFrozen(s.received.candidate));
    assert.equal(Object.isFrozen(asset), false);
    t.dispose();
});
check('candidate and independent actual cache remain distinct', () => {
    const s = setup();
    const candidate = {};
    const actual = {};
    const t = begin(s);
    t.prepare(() => ({ before: snapshot(), candidate: snapshot(candidate) }));
    t.effect('delegate-returned');
    t.commit(() => snapshot(actual));
    assert.equal(s.received.candidate.material, candidate);
    assert.equal(s.received.actual.material, actual);
    assert.deepEqual(t.diagnostics().effects, ['delegate-returned']);
});
for (const method of ['open', 'preflight', 'commit', 'fail', 'dispose']) {
    check(`registration ${method} getter copied once`, () => {
        const r = new Registry();
        const target = {};
        const o = options();
        let reads = 0;
        Object.defineProperty(o, method, {
            get() {
                reads++;
                return () => {};
            },
        });
        r.register(target, o);
        const t = r.begin(target, 'collider-material-set');
        t.prepare(pair);
        t.commit(() => snapshot());
        assert.equal(reads, 1);
    });
    check(`throwing registration ${method} getter leaves no membership`, () => {
        const r = new Registry();
        const target = {};
        const marker = {};
        const o = options();
        Object.defineProperty(o, method, {
            get() {
                throw marker;
            },
        });
        sameThrow(() => r.register(target, o), marker);
        assert.equal(r.begin(target, 'collider-material-set'), undefined);
    });
}
check('invalid registration callback leaves no membership', () => {
    const r = new Registry();
    const target = {};
    assert.throws(() => r.register(target, options({ dispose: null })));
    assert.equal(r.begin(target, 'collider-material-set'), undefined);
});
check('caught nested registration poisons admission without partial install', () => {
    const r = new Registry();
    const a = {};
    const b = {};
    let nested;
    const o = options();
    Object.defineProperty(o, 'open', {
        get() {
            nested = caught(() => r.register(b, options())).error;
            return () => {};
        },
    });
    const result = caught(() => r.register(a, o));
    assert(result.threw);
    assert.equal(result.error, nested);
    assert.equal(r.begin(a, 'collider-material-set'), undefined);
    assert.equal(r.begin(b, 'collider-material-set'), undefined);
    assert(nested instanceof Error);
});
for (const action of ['register', 'release', 'begin']) {
    check(`caught ${action} reentry during reader latches exact rejection and keeps roster`, () => {
        const s = setup();
        let nested;
        const t = begin(s);
        const result = caught(() =>
            t.prepare(() => {
                nested = caught(() =>
                    action === 'register'
                        ? s.registry.register(s.target, options())
                        : action === 'release'
                          ? s.lease.dispose()
                          : begin(s),
                ).error;
                return pair();
            }),
        );
        assert.equal(result.threw, true);
        assert.equal(result.error, nested);
        assert.deepEqual(s.events, ['open', 'fail', 'dispose']);
        assert(begin(s));
    });
}
check('between-method roster change rejects without changing membership', () => {
    const s = setup();
    const t = begin(s);
    const rejection = caught(() => s.lease.dispose());
    assert(rejection.threw);
    sameThrow(() => t.prepare(pair), rejection.error);
    const next = begin(s);
    assert(next);
    next.dispose();
    s.lease.dispose();
});
check('all preflights finish before any effect and failure releases all owners', () => {
    const s = setup();
    const marker = {};
    let secondDisposed = false;
    s.registry.register(
        s.target,
        options({
            preflight() {
                throw marker;
            },
            dispose() {
                secondDisposed = true;
            },
        }),
    );
    const t = begin(s);
    sameThrow(() => t.prepare(pair), marker);
    assert.equal(t.diagnostics().effects.length, 0);
    assert.equal(t.diagnostics().committedOwners, 0);
    assert(secondDisposed);
});
check('effect before prepare is rejected and terminally cleaned', () => {
    const s = setup();
    const t = begin(s);
    assert.throws(() => t.effect('cache-written'));
    assert.equal(t.diagnostics().disposed, true);
    assert.equal(t.diagnostics().effects.length, 0);
});
check('invalid effect never becomes native outcome', () => {
    const s = setup();
    const t = begin(s);
    t.prepare(pair);
    assert.throws(() => t.effect('native-committed'));
    assert.equal(t.diagnostics().effects.length, 0);
});
for (const stage of ['open', 'preflight', 'commit', 'dispose'])
    for (const value of [undefined, null, 0]) {
        check(`${stage} throwing ${String(value)} retains identity and independent cleanup`, () => {
            let failSeen;
            let disposed = 0;
            const r = new Registry();
            const target = {};
            r.register(
                target,
                options({
                    [stage]() {
                        if (stage === 'dispose') disposed++;
                        throw value;
                    },
                    fail(c, f) {
                        failSeen = f;
                    },
                    ...(stage === 'dispose'
                        ? {}
                        : {
                              dispose() {
                                  disposed++;
                              },
                          }),
                }),
            );
            let t;
            const result = caught(() => {
                t = r.begin(target, 'collider-material-set');
                t.prepare(pair);
                t.commit(() => snapshot());
            });
            assert(result.threw);
            assert.equal(result.error, value);
            assert.equal(disposed, 1);
            assert.equal(failSeen.error, value);
            if (t) {
                assert(t.diagnostics().hasFailure);
                assert.equal(t.diagnostics().error, value);
            }
        });
    }
for (const stage of ['before', 'candidate', 'actual'])
    for (const value of [undefined, null, 0]) {
        check(`${stage} getter throwing ${String(value)} retains identity`, () => {
            const s = setup();
            const t = begin(s);
            if (stage === 'actual') t.prepare(pair);
            sameThrow(
                () =>
                    stage === 'actual'
                        ? t.commit(() => {
                              throw value;
                          })
                        : t.prepare(() => ({
                              get before() {
                                  if (stage === 'before') throw value;
                                  return snapshot();
                              },
                              get candidate() {
                                  if (stage === 'candidate') throw value;
                                  return snapshot();
                              },
                          })),
                value,
            );
            assert.equal(t.diagnostics().disposed, true);
        });
    }
check('fail and dispose exceptions preserve falsy primary and release every owner', () => {
    const r = new Registry();
    const target = {};
    const order = [];
    for (let i = 0; i < 2; i++)
        r.register(
            target,
            options({
                fail() {
                    order.push(`f${i}`);
                    throw `fail${i}`;
                },
                dispose() {
                    order.push(`d${i}`);
                    throw `dispose${i}`;
                },
            }),
        );
    const t = r.begin(target, 'collider-material-set');
    t.prepare(pair);
    sameThrow(
        () =>
            t.fail(undefined, () => {
                throw 'observe';
            }),
        undefined,
    );
    assert.deepEqual(order, ['f0', 'f1', 'd0', 'd1']);
    assert.deepEqual(t.diagnostics().secondaryErrors, ['observe', 'fail0', 'fail1', 'dispose0', 'dispose1']);
});
check('later commit failure preserves earlier commit and faults all owners without replay', () => {
    const s = setup();
    const marker = {};
    let fails = 0;
    s.registry.register(
        s.target,
        options({
            commit() {
                throw marker;
            },
            fail() {
                fails++;
            },
        }),
    );
    const t = begin(s);
    t.prepare(pair);
    t.effect('cache-written');
    sameThrow(() => t.commit(() => snapshot()), marker);
    assert.equal(t.diagnostics().committedOwners, 1);
    assert.equal(t.diagnostics().commitCompleted, false);
    assert.equal(fails, 1);
    assert.throws(() => t.commit(() => snapshot()));
    assert.equal(t.diagnostics().committedOwners, 1);
    t.dispose();
});
check('dispose failure after complete commit retains known JS completion', () => {
    const marker = {};
    const s = setup({
        dispose() {
            throw marker;
        },
    });
    const t = begin(s);
    t.prepare(pair);
    sameThrow(() => t.commit(() => snapshot()), marker);
    assert(t.diagnostics().commitCompleted);
    assert.equal(t.diagnostics().phase, 'failed');
});
check('dispose cancellation is harmless before effects; effects abandonment faults', () => {
    const s = setup();
    const t = begin(s);
    t.prepare(pair);
    t.dispose();
    t.dispose();
    assert.equal(t.diagnostics().phase, 'cancelled');
    assert.equal(t.diagnostics().hasFailure, false);
    const u = begin(s);
    u.prepare(pair);
    u.effect('delegate-entered');
    assert.throws(() => u.dispose());
    assert.equal(u.diagnostics().phase, 'failed');
});
check('fake/cross-ticket receiver cannot mutate either ticket', () => {
    const s = setup();
    const target2 = {};
    s.registry.register(target2, options());
    const a = begin(s);
    const b = s.registry.begin(target2, 'collider-material-set');
    assert.throws(() => a.prepare.call(b, pair));
    assert.throws(() => a.dispose.call({}));
    assert.equal(a.diagnostics().phase, 'created');
    assert.equal(b.diagnostics().phase, 'created');
    a.dispose();
    b.dispose();
    assert.throws(() => s.lease.dispose.call({}));
    assert(begin(s));
});
check('same-ticket nested method caught by reader still fails outer', () => {
    const s = setup();
    const t = begin(s);
    let nested;
    const result = caught(() =>
        t.prepare(() => {
            nested = caught(() => t.dispose()).error;
            return pair();
        }),
    );
    assert(result.threw);
    assert.equal(result.error, nested);
    assert(t.diagnostics().disposed);
});
check('copy material value tuple once and freeze deeply', () => {
    const r = new Registry();
    const target = {};
    let candidate;
    r.register(
        target,
        options({
            preflight(c, before, next) {
                candidate = next;
            },
        }),
    );
    const t = r.begin(target, 'material-values');
    const values = [0.1, 0.2, 0, 0];
    t.prepare(() => ({
        before: { kind: 'material-values', coefficients: [0, 0, 0, 0] },
        candidate: { kind: 'material-values', coefficients: values },
    }));
    values[0] = 42;
    assert.equal(candidate.coefficients[0], 0.1);
    assert(Object.isFrozen(candidate.coefficients));
    t.dispose();
});
for (const invalid of [NaN, Infinity, '1', null])
    check(`invalid coefficient ${String(invalid)} rejects before preflight`, () => {
        const s = setup();
        const t = s.registry.begin(s.target, 'material-values');
        assert.throws(() =>
            t.prepare(() => ({
                before: { kind: 'material-values', coefficients: [0, 0, 0, 0] },
                candidate: { kind: 'material-values', coefficients: [invalid, 0, 0, 0] },
            })),
        );
        assert.deepEqual(s.events, ['open', 'fail', 'dispose']);
    });
check('system booleans are copied and strict; snapshot operation kind must match', () => {
    const s = setup();
    const t = s.registry.begin(s.target, 'system-enable');
    assert.throws(() =>
        t.prepare(() => ({
            before: { kind: 'system-control', enabled: true, autoSimulation: true },
            candidate: { kind: 'system-control', enabled: 0, autoSimulation: true },
        })),
    );
    const u = begin(s);
    assert.throws(() =>
        u.prepare(() => ({
            before: snapshot(),
            candidate: { kind: 'system-control', enabled: true, autoSimulation: true },
        })),
    );
});
check('registration count exhaustion never invokes input getters', () => {
    const r = new Registry({ counterLimit: 1 });
    const target = {};
    const lease = r.register(target, options());
    lease.dispose();
    let read = false;
    const o = new Proxy(
        {},
        {
            get() {
                read = true;
                throw 1;
            },
        },
    );
    assert.throws(() => r.register({}, o));
    assert.equal(read, false);
});
check('change sequence exhaustion rejects before owner open; no writable counter', () => {
    const r = new Registry({ counterLimit: 2 });
    const target = {};
    let opened = 0;
    r.register(
        target,
        options({
            open() {
                opened++;
            },
        }),
    );
    const a = r.begin(target, 'collider-material-set');
    assert.equal(a.diagnostics().sequence, 1);
    a.prepare(pair);
    a.dispose();
    const b = r.begin(target, 'collider-material-set');
    assert.equal(b.diagnostics().sequence, 2);
    b.prepare(pair);
    b.dispose();
    assert.throws(() => r.begin(target, 'collider-material-set'));
    assert.equal(opened, 2);
});
for (const limit of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, '2', null])
    check(`invalid counter limit ${String(limit)}`, () => assert.throws(() => new Registry({ counterLimit: limit })));
check('unresolved callback cleanup is not reported as confirmed release', () => {
    const r = new Registry();
    const target = {};
    const marker = {};
    r.register(
        target,
        options({
            dispose() {
                throw marker;
            },
        }),
    );
    r.register(target, options());
    const t = r.begin(target, 'collider-material-set');
    t.prepare(pair);
    sameThrow(() => t.commit(() => snapshot()), marker);
    const d = t.diagnostics();
    assert.equal(d.cleanupCompletedOwners, 1);
    assert.equal(d.cleanupUnresolvedOwners, 1);
    assert.equal(d.disposed, true);
    assert.equal(d.commitCompleted, true);
    assert.equal(d.actualRead, 'copied');
});
check('actual readback failure is explicit, not candidate substitution', () => {
    const s = setup();
    const t = begin(s);
    t.prepare(pair);
    t.effect('delegate-returned');
    sameThrow(
        () =>
            t.commit(() => {
                throw null;
            }),
        null,
    );
    assert.equal(t.diagnostics().actualRead, 'failed');
    assert.equal(t.diagnostics().actual, null);
    assert.equal(t.diagnostics().candidate, s.received.candidate);
});
check('effect sequence overflow rejects without appending invented fact', () => {
    const r = new Registry({ counterLimit: 1 });
    const target = {};
    r.register(target, options());
    const t = r.begin(target, 'collider-material-set');
    t.prepare(pair);
    t.effect('delegate-entered');
    assert.throws(() => t.effect('delegate-returned'));
    assert.deepEqual(t.diagnostics().effects, ['delegate-entered']);
});
check('open caught nested failure disposes entered owner and never opens later owner', () => {
    const r = new Registry();
    const target = {};
    let opened = 0;
    let disposed = 0;
    let nested;
    r.register(
        target,
        options({
            open() {
                nested = caught(() => r.begin({}, 'system-enable')).error;
            },
            dispose() {
                disposed++;
            },
        }),
    );
    r.register(
        target,
        options({
            open() {
                opened++;
            },
        }),
    );
    const t = r.begin(target, 'collider-material-set');
    const result = caught(() => t.prepare(pair));
    assert(result.threw);
    assert.equal(result.error, nested);
    assert.equal(opened, 0);
    assert.equal(disposed, 1);
});
check('first nested error beats subsequent reader error by identity', () => {
    const s = setup();
    const t = begin(s);
    let nested;
    const later = {};
    const result = caught(() =>
        t.prepare(() => {
            nested = caught(() => begin(s)).error;
            throw later;
        }),
    );
    assert(result.threw);
    assert.equal(result.error, nested);
    assert(t.diagnostics().secondaryErrors.includes(later));
});
check('default registry wrappers share target registration without public object fields', () => {
    const target = {};
    const lease = api.registerPhysicsStateObserver(target, options());
    const t = api.beginPhysicsStateChange(target, 'system-default-material-set');
    t.prepare(() => ({
        before: { kind: 'system-default-material', material: null },
        candidate: { kind: 'system-default-material', material: {} },
    }));
    t.commit(() => ({ kind: 'system-default-material', material: null }));
    lease.dispose();
    assert.deepEqual(Object.keys(target), []);
    assert.equal(api.beginPhysicsStateChange(target, 'system-default-material-set'), undefined);
});
for (const primary of [undefined, null, 0])
    check(`returned ticket retains final errors when open throws ${String(primary)}`, () => {
        const r = new Registry();
        const target = {};
        let snapshotReads = 0;
        r.register(
            target,
            options({
                dispose() {
                    throw 'cleanup-one';
                },
            }),
        );
        r.register(
            target,
            options({
                open() {
                    throw primary;
                },
                dispose() {
                    throw 'cleanup-two';
                },
            }),
        );
        let ticket;
        const admission = caught(() => {
            ticket = r.begin(target, 'collider-material-set');
        });
        assert.equal(admission.threw, false, 'begin must return ticket before any owner open');
        sameThrow(
            () =>
                ticket.prepare(() => {
                    snapshotReads++;
                    return pair();
                }),
            primary,
        );
        const d = ticket.diagnostics();
        assert.equal(snapshotReads, 0);
        assert.equal(d.error, primary);
        assert.deepEqual(d.secondaryErrors, ['cleanup-one', 'cleanup-two']);
        assert.equal(d.cleanupUnresolvedOwners, 2);
        assert.equal(d.cleanupCompletedOwners, 0);
        ticket.dispose();
    });
const commands = [
    [
        'format',
        process.execPath,
        ['node_modules/prettier/bin/prettier.cjs', '--ignore-path', '/dev/null', '--check', source, runner],
    ],
    [
        'tsc',
        process.execPath,
        [
            'node_modules/typescript/bin/tsc',
            '--noEmit',
            '--strict',
            '--target',
            'ES2022',
            '--module',
            'ES2022',
            '--lib',
            'ES2022',
            '--skipLibCheck',
            source,
        ],
    ],
];
const commandResults = commands.map(([name, exe, args]) => {
    const r = spawnSync(exe, args, { encoding: 'utf8' });
    return { name, argv: [exe, ...args], exitCode: r.status, stdout: r.stdout, stderr: r.stderr };
});
for (const r of commandResults) await writeFile(path.join(out, `${r.name}.raw.txt`), `${r.stdout}\n${r.stderr}`);
const after = Object.fromEntries(
    await Promise.all(Object.keys(inputs).map(async (file) => [file, sha(await readFile(file))])),
);
const stable = JSON.stringify(inputs) === JSON.stringify(after);
const ok = rows.every((r) => r.status !== 'FAIL') && commandResults.every((r) => r.exitCode === 0) && stable;
const result = {
    status: ok ? 'PASS_PURE_OBSERVER_CONTROL_ONLY' : 'FAIL',
    physicalQualification: false,
    inputs,
    after,
    stable,
    counts: { cases: rows.length, passed: rows.filter((r) => r.status !== 'FAIL').length },
    rows,
    commands: commandResults,
};
await writeFile(path.join(out, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(
    JSON.stringify(
        { status: result.status, counts: result.counts, stable, failures: rows.filter((r) => r.status === 'FAIL') },
        null,
        2,
    ),
);
process.exitCode = ok ? 0 : 1;
