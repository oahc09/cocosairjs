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
// Actual-source pure typed bridge controls. Fake delegates/guards are not engine or native qualification.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = 'src/cocos/physics/framework/physics-material-transaction.ts';
const b0 = 'src/cocos/physics/framework/physics-state-observer.ts';
const runner = 'tools/verify/box3d/physics-material-transaction-control.mjs';
const files = [source, b0, runner, 'tools/verify/box3d/material-identity-b1-plan-20261022-b/README.md'];
const out = path.resolve(process.argv[2]);
await mkdir(out);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const inputs = {};
for (const file of files) {
    const bytes = await readFile(file);
    inputs[file] = sha(bytes);
    await writeFile(path.join(out, path.basename(file)), bytes);
}
const compile = (text) =>
    ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } })
        .outputText;
const url = (text) => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const b0url = url(compile(await readFile(b0, 'utf8')));
const compiled = compile(await readFile(source, 'utf8')).replace(
    /from ['"]\.\/physics-state-observer['"]/g,
    `from '${b0url}'`,
);
const api = await import(url(compiled));
const { PhysicsMaterialTransactionRegistry: Registry } = api;
const rows = [];
const check = (name, fn) => {
    try {
        fn();
        rows.push({ name, status: 'PASS_PURE_TYPED_BRIDGE_CONTROL' });
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
    const o = caught(fn);
    assert(o.threw);
    assert.equal(o.error, error);
};
const asset = (friction = 0.3) => ({ friction, restitution: 0.1, rollingFriction: 0, spinningFriction: 0 });
const id = (material, kind = 'collider-material') =>
    kind === 'collider-material' ? { kind, material, shared: true } : { kind, material };
const setup = (override = {}) => {
    const registry = new Registry(),
        target = {},
        events = [],
        protectedAssets = new Set(),
        received = {};
    let open = false;
    const delegate = {
        open() {
            open = true;
            events.push('open');
        },
        protectCandidate(c, a) {
            assert(open);
            protectedAssets.add(a);
            events.push('protect');
        },
        preflightCopied(c, v) {
            received.prepared = v;
            events.push('preflight');
        },
        applyCopied(c, v) {
            received.applied = v;
            events.push('apply');
        },
        commitActual(c, v) {
            received.actual = v;
            events.push('commit');
        },
        fail(c, f) {
            received.failure = f;
            events.push('fail');
        },
        dispose() {
            open = false;
            events.push('dispose');
        },
        ...override,
    };
    const lease = registry.register(target, delegate);
    return { registry, target, events, protectedAssets, received, delegate, lease, isOpen: () => open };
};
const start = (s, operation = 'collider-material-set') => s.registry.begin(s.target, operation);
const prepare = (t, old, next, kind = 'collider-material') =>
    t.prepare(() => ({ before: id(old, kind), candidate: id(next, kind) }));
check('unregistered fastpath reads no operation or candidate', () => {
    const r = new Registry();
    assert.equal(
        r.begin(
            {},
            new Proxy(
                {},
                {
                    get() {
                        throw 1;
                    },
                },
            ),
        ),
        undefined,
    );
});
check('created ticket opens nothing and cancel releases reserved entry', () => {
    const s = setup();
    const t = start(s);
    assert.deepEqual(s.events, []);
    t.dispose();
    const u = start(s);
    u.dispose();
    s.lease.dispose();
});
check('candidate guarded before every coefficient getter, read once; copied delegate only', () => {
    const s = setup(),
        old = asset(),
        reads = {};
    const next = {};
    for (const [key, value] of Object.entries(asset(0.8)))
        Object.defineProperty(next, key, {
            get() {
                assert(s.isOpen());
                assert(s.protectedAssets.has(next));
                reads[key] = (reads[key] ?? 0) + 1;
                return value;
            },
        });
    const t = start(s);
    prepare(t, old, next);
    t.apply();
    t.effect('listener-edit-entered');
    t.effect('cache-written');
    t.commit(() => id(next));
    assert.deepEqual(Object.values(reads), [1, 1, 1, 1]);
    assert.equal(s.received.prepared, s.received.applied);
    assert.equal(s.received.applied.asset, next);
    assert(Object.isFrozen(s.received.applied.coefficients));
    assert.equal(t.diagnostics().observer.commitCompleted, true);
    assert.equal(s.events.filter((v) => v === 'apply').length, 1);
});
check('candidate guarded before following shared-flag accessor', () => {
    const s = setup(),
        next = asset();
    const t = start(s);
    t.prepare(() => ({
        before: id(null),
        candidate: {
            kind: 'collider-material',
            material: next,
            get shared() {
                assert(s.protectedAssets.has(next));
                return false;
            },
        },
    }));
    t.dispose();
});
check('later asset field edits do not alter copied candidate', () => {
    const s = setup(),
        next = asset();
    const t = start(s);
    prepare(t, null, next);
    next.friction = 9;
    t.apply();
    assert.equal(s.received.applied.coefficients[0], 0.3);
    t.commit(() => id(next));
});
check('null inheritance does not manufacture asset reads', () => {
    const s = setup();
    const t = start(s);
    prepare(t, asset(), null);
    t.apply();
    t.commit(() => id(null));
    assert.equal(s.received.applied.coefficients, null);
});
check('default identity kind and actual cache commit', () => {
    const s = setup(),
        next = asset(0.8);
    const t = start(s, 'system-default-material-set');
    prepare(t, asset(), next, 'system-default-material');
    t.apply();
    t.commit(() => id(next, 'system-default-material'));
    assert.equal(s.received.actual.material, next);
});
check('initialization commits without invented delegate execution', () => {
    const s = setup(),
        next = asset();
    const t = start(s, 'collider-material-initialize');
    prepare(t, next, next);
    t.effect('listener-edit-entered');
    t.commit(() => id(next));
    assert(!s.events.includes('apply'));
});
check('clone accepted only after source preflight/allocation effect, no native application', () => {
    const s = setup(),
        old = asset(),
        clone = asset();
    const t = start(s, 'collider-material-clone');
    prepare(t, old, old);
    t.effect('clone-allocation-entered');
    t.acceptClone(clone);
    t.effect('cache-written');
    t.commit(() => id(clone));
    assert(s.protectedAssets.has(clone));
    assert(!s.events.includes('apply'));
    assert(t.diagnostics().cloneAccepted);
});
check('clone cannot return the original asset', () => {
    const s = setup(),
        old = asset();
    const t = start(s, 'collider-material-clone');
    prepare(t, old, old);
    t.effect('clone-allocation-entered');
    assert.throws(() => t.acceptClone(old));
    assert.equal(t.diagnostics().observer.phase, 'failed');
});
check('clone divergent values fault, never rewrite native', () => {
    const s = setup(),
        old = asset();
    const t = start(s, 'collider-material-clone');
    prepare(t, old, old);
    t.effect('clone-allocation-entered');
    assert.throws(() => t.acceptClone(asset(0.8)));
    assert(!s.events.includes('apply'));
});
check('clone requires recorded allocation entry', () => {
    const s = setup(),
        old = asset();
    const t = start(s, 'collider-material-clone');
    prepare(t, old, old);
    assert.throws(() => t.acceptClone(asset()));
});
check('real actual-cache mismatch retained rather than candidate substitution', () => {
    const s = setup(),
        old = asset(),
        next = asset(0.8);
    const t = start(s);
    prepare(t, old, next);
    t.apply();
    assert.throws(() => t.commit(() => id(old)));
    assert.equal(t.diagnostics().observer.actual.material, old);
    assert.equal(t.diagnostics().observer.candidate.material, next);
    assert.equal(t.diagnostics().delegateReturned, true);
});
for (const error of [undefined, null, 0])
    check(`post-delegate external failure ${String(error)} retains original and actual cache`, () => {
        const s = setup(),
            old = asset(),
            next = asset(0.8);
        const t = start(s);
        prepare(t, old, next);
        t.apply();
        sameThrow(() => t.fail(error, () => id(old)), error);
        t.dispose();
        assert.equal(t.diagnostics().observer.error, error);
        assert.equal(t.diagnostics().observer.actual.material, old);
        assert.equal(s.events.filter((v) => v === 'apply').length, 1);
    });
for (const stage of ['open', 'protectCandidate', 'preflightCopied', 'applyCopied', 'commitActual'])
    check(`${stage} thrown null preserves cleanup and no retry`, () => {
        let disposed = 0;
        const s = setup({
                [stage]() {
                    throw null;
                },
                dispose() {
                    disposed++;
                },
            }),
            next = asset();
        const t = start(s);
        sameThrow(() => {
            prepare(t, null, next);
            t.apply();
            t.commit(() => id(next));
        }, null);
        t.dispose();
        assert.equal(disposed, 1);
        assert.equal(t.diagnostics().observer.error, null);
    });
check('dispose failure after actual commit remains unresolved, not released', () => {
    const s = setup({
            dispose() {
                throw 0;
            },
        }),
        next = asset();
    const t = start(s);
    prepare(t, null, next);
    t.apply();
    sameThrow(() => t.commit(() => id(next)), 0);
    assert.equal(t.diagnostics().observer.cleanupUnresolvedOwners, 1);
    assert.equal(t.diagnostics().observer.commitCompleted, true);
});
check('first primary includes later fail/dispose failures after wrapper cleanup', () => {
    const s = setup({
            fail() {
                throw 'fault-handler';
            },
            dispose() {
                throw 'cleanup';
            },
        }),
        next = asset();
    const t = start(s);
    prepare(t, null, next);
    t.apply();
    sameThrow(() => t.fail(undefined), undefined);
    assert.deepEqual(t.diagnostics().observer.secondaryErrors, ['fault-handler', 'cleanup']);
    sameThrow(() => t.fail(null), undefined);
});
check('copied delegate functions are not looked up again', () => {
    const s = setup(),
        next = asset();
    s.delegate.applyCopied = () => {
        throw 1;
    };
    const t = start(s);
    prepare(t, null, next);
    t.apply();
    t.commit(() => id(next));
    assert(s.received.applied);
});
check('duplicate physical delegate rejected without releasing first', () => {
    const s = setup();
    assert.throws(() => s.registry.register(s.target, s.delegate));
    const t = start(s);
    t.dispose();
    s.lease.dispose();
    assert.equal(start(s), undefined);
});
check('registration getter reentry caught still installs neither nested nor outer delegate', () => {
    const r = new Registry(),
        a = {},
        b = {};
    const d = setup().delegate;
    let nested;
    Object.defineProperty(d, 'open', {
        get() {
            nested = caught(() => r.register(b, d)).error;
            return () => {};
        },
    });
    const result = caught(() => r.register(a, d));
    assert(result.threw);
    assert.equal(result.error, nested);
    assert.equal(r.begin(a, 'collider-material-set'), undefined);
    assert.equal(r.begin(b, 'collider-material-set'), undefined);
});
check('getters cannot switch registry ownership or start another transaction', () => {
    const s = setup(),
        next = asset();
    let nested;
    Object.defineProperty(next, 'friction', {
        get() {
            nested = caught(() => start(s)).error;
            return 0.3;
        },
    });
    const t = start(s);
    const result = caught(() => prepare(t, null, next));
    assert(result.threw);
    assert.equal(result.error, nested);
    assert.equal(t.diagnostics().observer.disposed, true);
});
check('private delegate is consumed before callback; caught nested apply cannot trigger second call', () => {
    let t,
        calls = 0,
        nested;
    const s = setup({
        applyCopied() {
            calls++;
            nested = caught(() => t.apply()).error;
        },
    });
    const next = asset();
    t = start(s);
    prepare(t, null, next);
    const result = caught(() => t.apply());
    assert(result.threw);
    assert.equal(result.error, nested);
    assert.equal(calls, 1);
    assert(t.diagnostics().delegateReturned);
});
check('clone accessor caught nested dispose cannot release barriers while getter runs', () => {
    const s = setup(),
        old = asset(),
        clone = asset();
    const t = start(s, 'collider-material-clone');
    prepare(t, old, old);
    t.effect('clone-allocation-entered');
    let releasedDuringGetter;
    Object.defineProperty(clone, 'friction', {
        get() {
            caught(() => t.dispose());
            releasedDuringGetter = !s.isOpen();
            return 0.3;
        },
    });
    assert.throws(() => t.acceptClone(clone));
    assert.equal(releasedDuringGetter, false);
    assert.equal(t.diagnostics().observer.disposed, true);
});
check('cross-ticket and fabricated receivers do not consume either candidate', () => {
    const a = setup(),
        b = setup();
    const ta = start(a),
        tb = start(b);
    assert.throws(() => ta.prepare.call(tb, () => ({ before: id(null), candidate: id(null) })));
    assert.equal(ta.diagnostics().observer.phase, 'created');
    assert.equal(tb.diagnostics().observer.phase, 'created');
    ta.dispose();
    tb.dispose();
});
for (const invalid of [NaN, Infinity, '1', null])
    check(`invalid coefficient ${String(invalid)} has no delegate effects`, () => {
        const s = setup(),
            next = asset();
        next.friction = invalid;
        const t = start(s);
        assert.throws(() => prepare(t, null, next));
        assert(!s.events.includes('apply'));
        assert.equal(t.diagnostics().observer.effects.length, 0);
    });
check('commit before required apply refuses before owner cache commit', () => {
    const s = setup(),
        next = asset();
    const t = start(s);
    prepare(t, null, next);
    assert.throws(() => t.commit(() => id(next)));
    assert(!s.events.includes('commit'));
});
check('caught invocation refusal stays primary while later getter failure is retained', () => {
    const s = setup(),
        old = asset(),
        clone = asset();
    const t = start(s, 'collider-material-clone');
    prepare(t, old, old);
    t.effect('clone-allocation-entered');
    let primary;
    Object.defineProperty(clone, 'friction', {
        get() {
            primary = caught(() => t.dispose()).error;
            throw null;
        },
    });
    const result = caught(() => t.acceptClone(clone));
    assert(result.threw);
    assert.equal(result.error, primary);
    assert.deepEqual(t.diagnostics().invocationErrors, [primary, null]);
});
const commandResults = [
    [
        'format',
        [
            process.execPath,
            'node_modules/prettier/bin/prettier.cjs',
            '--ignore-path',
            '/dev/null',
            '--check',
            source,
            runner,
        ],
    ],
    [
        'tsc',
        [
            process.execPath,
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
].map(([name, argv]) => {
    const r = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8' });
    return { name, argv, exitCode: r.status, stdout: r.stdout, stderr: r.stderr };
});
for (const r of commandResults) await writeFile(path.join(out, `${r.name}.raw.txt`), `${r.stdout}\n${r.stderr}`);
const after = Object.fromEntries(await Promise.all(files.map(async (file) => [file, sha(await readFile(file))])));
const stable = JSON.stringify(inputs) === JSON.stringify(after);
const ok = stable && commandResults.every((v) => v.exitCode === 0) && rows.every((v) => v.status !== 'FAIL');
const report = {
    status: ok ? 'PASS_PURE_TYPED_BRIDGE_ONLY' : 'FAIL',
    physicalQualification: false,
    inputs,
    after,
    stable,
    counts: { cases: rows.length, passed: rows.filter((v) => v.status !== 'FAIL').length },
    rows,
    commands: commandResults,
};
await writeFile(path.join(out, 'result.json'), JSON.stringify(report, null, 2) + '\n');
console.log(
    JSON.stringify(
        { status: report.status, counts: report.counts, stable, failures: rows.filter((v) => v.status === 'FAIL') },
        null,
        2,
    ),
);
process.exitCode = ok ? 0 : 1;
