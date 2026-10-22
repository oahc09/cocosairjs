/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Actual standalone guard source only. No engine write sites or native physics are exercised.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const output = path.resolve(process.argv[2] ?? 'tools/verify/box3d/mutation-guard-evidence-20261022-a');
await mkdir(output); // Refuse to overwrite prior evidence.
const paths = ['src/cocos/core/data/mutation-guard.ts', 'tools/verify/box3d/mutation-guard-control.mjs'];
const sha = (v) => createHash('sha256').update(v).digest('hex');
const hashes = async () => Object.fromEntries(await Promise.all(paths.map(async (p) => [p, sha(await readFile(p))])));
const before = await hashes();
const startedAt = new Date().toISOString();
const compiled = ts.transpileModule(await readFile(paths[0], 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const module = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);
const { registerMutationGuard: register, assertMutationAllowed: allowed, assertMutationBatchAllowed: batch } = module;
const rows = [];
let leases = [];
const reg = (targets, rejection = { code: 'TEST_A', message: 'Explicit pure control' }) => {
    const lease = register(targets, rejection);
    leases.push(lease);
    return lease;
};
const blocked = (target, code = 'TEST_A') =>
    assert.throws(
        () => allowed(target, 'test-write'),
        (error) => error.code === code,
    );
const poison = () =>
    new Proxy([], {
        get() {
            throw new Error('fast path must not inspect input');
        },
    });
const test = (name, fn) => {
    leases = [];
    try {
        fn();
        rows.push({ name, status: 'PASS_PURE_SOURCE_CONTROL' });
    } catch (error) {
        rows.push({ name, status: 'FAIL', error: String(error), stack: error?.stack ?? null });
    } finally {
        for (const lease of leases) lease.dispose();
    }
};
test('only three runtime entry points; no dispose-by-owner/token or global bypass', () => {
    assert.deepEqual(Object.keys(module).sort(), [
        'assertMutationAllowed',
        'assertMutationBatchAllowed',
        'registerMutationGuard',
    ]);
});
test('no guard fast path does not inspect poisoned batch input or operation', () => {
    const operation = {
        toString() {
            throw Error('must not coerce');
        },
    };
    batch(poison(), operation);
    allowed({}, operation);
});
test('one lease protects exactly its copied object identities', () => {
    const a = {},
        b = {};
    reg([a]);
    blocked(a);
    allowed(b, 'test');
    assert.deepEqual(Object.keys(a), []);
});
test('two owners release independently on the same target', () => {
    const a = {};
    const one = reg([a]);
    const two = reg([a], { code: 'TEST_B', message: 'B' });
    blocked(a);
    one.dispose();
    blocked(a, 'TEST_B');
    one.dispose();
    blocked(a, 'TEST_B');
    two.dispose();
    allowed(a, 'test');
    batch(poison(), 'no guards');
});
test('reverse owner release preserves first rejection until it releases', () => {
    const a = {};
    const one = reg([a]);
    const two = reg([a], { code: 'TEST_B', message: 'B' });
    two.dispose();
    blocked(a);
    one.dispose();
    allowed(a, 'test');
});
test('overlapping multi-target leases never release another owner', () => {
    const a = {},
        b = {},
        c = {};
    const one = reg([a, b]);
    const two = reg([b, c], { code: 'TEST_B', message: 'B' });
    one.dispose();
    allowed(a, 'test');
    blocked(b, 'TEST_B');
    blocked(c, 'TEST_B');
    two.dispose();
    batch([a, b, c], 'test');
});
test('duplicate identities are deduplicated and repeated disposal is safe', () => {
    const a = {};
    const lease = reg([a, a, a]);
    blocked(a);
    lease.dispose();
    lease.dispose();
    batch(poison(), 'all memberships gone');
});
test('changing original target list or descriptor after registration cannot retarget policy', () => {
    const a = {},
        b = {};
    const targets = [a];
    const rejection = { code: 'ORIGINAL', message: 'Original text' };
    const lease = reg(targets, rejection);
    targets[0] = b;
    targets.push({});
    rejection.code = 'CHANGED';
    rejection.message = 'Changed';
    assert.throws(
        () => allowed(a, 'set'),
        (e) => e.code === 'ORIGINAL' && e.message === 'Original text (set)',
    );
    allowed(b, 'set');
    lease.dispose();
    allowed(a, 'set');
});
test('descriptor getters and target element getter are each read exactly once', () => {
    const a = {};
    let targetReads = 0,
        codeReads = 0,
        messageReads = 0;
    const targets = [];
    Object.defineProperty(targets, 0, {
        get() {
            targetReads++;
            return a;
        },
    });
    reg(targets, {
        get code() {
            codeReads++;
            return 'ONCE';
        },
        get message() {
            messageReads++;
            return 'once';
        },
    });
    blocked(a, 'ONCE');
    blocked(a, 'ONCE');
    assert.deepEqual([targetReads, codeReads, messageReads], [1, 1, 1]);
});
test('descriptor getter mutation of original target array cannot change already copied targets', () => {
    const a = {},
        b = {};
    const targets = [a];
    reg(targets, {
        get code() {
            targets[0] = b;
            return 'TEST_A';
        },
        message: 'A',
    });
    blocked(a);
    allowed(b, 'test');
});
test('target object property getters are never read or frozen', () => {
    const a = {
        get any() {
            throw Error('never read identity contents');
        },
    };
    reg([a]);
    blocked(a);
    assert(!Object.isFrozen(a));
    Object.defineProperty(a, 'extra', { value: 1 });
});
for (const targets of [[], {}, null, undefined, [null], [undefined], [1], [() => {}], Array(1)])
    test(`invalid targets ${String(targets)} leave no partial registration`, () => {
        const a = {};
        const input = Array.isArray(targets) ? [a, ...targets] : targets;
        // Empty registration itself, rather than the prefixed nonempty array.
        assert.throws(() => reg(Array.isArray(targets) && targets.length === 0 ? [] : input));
        allowed(a, 'no partial owner');
        batch(poison(), 'no owner count drift');
    });
for (const rejection of [
    null,
    undefined,
    {},
    { code: '', message: 'x' },
    { code: 'x', message: '' },
    { code: 3, message: 'x' },
    { code: 'x', message: () => {} },
])
    test(`invalid rejection ${String(rejection)} leaves no membership`, () => {
        const a = {};
        assert.throws(() => register([a], rejection));
        allowed(a, 'none');
        batch(poison(), 'no owner count drift');
    });
for (const thrown of [undefined, null, 0, '', Error('explicit getter failure')])
    test(`throwing target getter ${String(thrown)} leaves no earlier target installed`, () => {
        const a = {};
        const input = [a];
        Object.defineProperty(input, 1, {
            get() {
                throw thrown;
            },
        });
        assert.throws(() => reg(input));
        allowed(a, 'none');
        batch(poison(), 'no owner count drift');
    });
for (const property of ['code', 'message'])
    test(`throwing rejection ${property} leaves no membership and preserves existing owner`, () => {
        const a = {},
            existing = {};
        reg([existing]);
        const rejection = { code: 'A', message: 'A' };
        Object.defineProperty(rejection, property, {
            get() {
                throw Error('explicit getter');
            },
        });
        assert.throws(() => reg([a], rejection));
        allowed(a, 'none');
        blocked(existing);
    });
for (const location of ['target', 'code', 'message'])
    test(`caught nested register in ${location} getter aborts both registrations`, () => {
        const a = {},
            nested = {};
        const reenter = () => {
            try {
                reg([nested]);
            } catch {}
        };
        const targets = [a];
        const rejection = { code: 'A', message: 'A' };
        if (location === 'target')
            Object.defineProperty(targets, 0, {
                get() {
                    reenter();
                    return a;
                },
            });
        else
            Object.defineProperty(rejection, location, {
                get() {
                    reenter();
                    return 'A';
                },
            });
        assert.throws(() => reg(targets, rejection));
        allowed(a, 'none');
        allowed(nested, 'none');
        batch(poison(), 'no partial owner');
    });
test('caught release in registration getter preserves existing lease and aborts new owner', () => {
    const a = {},
        b = {};
    const lease = reg([a]);
    const targets = [];
    Object.defineProperty(targets, 0, {
        get() {
            try {
                lease.dispose();
            } catch {}
            return b;
        },
    });
    assert.throws(() => reg(targets));
    blocked(a);
    allowed(b, 'none');
});
for (const op of ['single', 'batch'])
    test(`nested ${op} admission in registration getter is rejected even on unguarded targets`, () => {
        const a = {};
        const targets = [];
        Object.defineProperty(targets, 0, {
            get() {
                try {
                    op === 'single' ? allowed({}, 'nested') : batch([], 'nested');
                } catch {}
                return a;
            },
        });
        assert.throws(() => reg(targets));
        allowed(a, 'none');
        batch(poison(), 'no owner count drift');
    });
test('lease is frozen with only a closure release capability, fake object cannot release', () => {
    const a = {},
        b = {};
    const lease = reg([a]);
    reg([b], { code: 'TEST_B', message: 'B' });
    assert(Object.isFrozen(lease));
    assert.deepEqual(Object.keys(lease), ['dispose']);
    assert.throws(() => {
        lease.owner = b;
    });
    ({ dispose() {} }).dispose();
    blocked(a);
    blocked(b, 'TEST_B');
    // Possession of the real function shares only its original owner, regardless of this/arguments.
    lease.dispose.call({ owner: b }, b);
    allowed(a, 'test');
    blocked(b, 'TEST_B');
});
test('rejection callbacks are never installed or invoked', () => {
    const a = {};
    let calls = 0;
    reg([a], {
        code: 'TEST_A',
        message: 'A',
        get onReject() {
            calls++;
            throw Error('not a policy field');
        },
    });
    blocked(a);
    assert.equal(calls, 0);
});
test('guarded operation rejects without coercing an arbitrary operation object', () => {
    const a = {};
    reg([a]);
    const name = {
        toString() {
            throw Error('must not execute');
        },
    };
    assert.throws(
        () => allowed(a, name),
        (e) => e.code === 'TEST_A' && e.operation === 'unknown operation',
    );
});
test('unguarded object fast path still works while another owner is registered', () => {
    const a = {};
    reg([a]);
    allowed(
        {},
        {
            toString() {
                throw Error('never');
            },
        },
    );
});
test('batch succeeds for unrelated copied targets and empty array', () => {
    reg([{}]);
    batch([{}, {}], 'test');
    batch([], 'empty');
});
test('batch rejects any protected later member without running an operation callback', () => {
    const a = {},
        b = {};
    reg([b]);
    let operations = 0;
    assert.throws(
        () =>
            batch([a, b], () => {
                operations++;
            }),
        (e) => e.code === 'TEST_A',
    );
    assert.equal(operations, 0);
});
test('batch reads full target list before reporting a protected first member', () => {
    const a = {},
        b = {};
    reg([a]);
    let reads = 0;
    const targets = [a];
    Object.defineProperty(targets, 1, {
        get() {
            reads++;
            return b;
        },
    });
    assert.throws(
        () => batch(targets, 'batch'),
        (e) => e.code === 'TEST_A',
    );
    assert.equal(reads, 1);
    blocked(a);
});
test('batch later invalid member is rejected before membership result, without changing owners', () => {
    const a = {};
    reg([a]);
    assert.throws(() => batch([a, null], 'batch'), TypeError);
    blocked(a);
});
test('batch later throwing getter is retained as original input error and leaves owners intact', () => {
    const a = {};
    reg([a]);
    const error = Error('explicit batch getter');
    const targets = [a];
    Object.defineProperty(targets, 1, {
        get() {
            throw error;
        },
    });
    assert.throws(
        () => batch(targets, 'batch'),
        (e) => e === error,
    );
    blocked(a);
});
for (const operation of ['register', 'release', 'single', 'batch'])
    test(`caught nested ${operation} during batch copy aborts with no registry changes`, () => {
        const a = {},
            b = {};
        const lease = reg([a]);
        const nested = {
            register: () => reg([b]),
            release: () => lease.dispose(),
            single: () => allowed({}, 'nested'),
            batch: () => batch([], 'nested'),
        }[operation];
        const targets = [];
        Object.defineProperty(targets, 0, {
            get() {
                try {
                    nested();
                } catch {}
                return b;
            },
        });
        assert.throws(() => batch(targets, 'batch'));
        blocked(a);
        allowed(b, 'none');
    });
test('failure does not poison a later valid registration or batch admission', () => {
    const a = {},
        b = {};
    assert.throws(() => register([a], { code: '', message: 'x' }));
    const lease = reg([b]);
    batch([a], 'test');
    blocked(b);
    lease.dispose();
    batch(poison(), 'clean fast path');
});
test('independent target leases can be released and re-registered without old lease authority', () => {
    const a = {};
    const old = reg([a]);
    old.dispose();
    const fresh = reg([a], { code: 'TEST_B', message: 'fresh' });
    old.dispose();
    blocked(a, 'TEST_B');
    fresh.dispose();
    allowed(a, 'test');
});
test('final release restores zero-guard fast path and no input objects gained properties', () => {
    const a = {};
    const lease = reg([a]);
    lease.dispose();
    batch(poison(), 'no callbacks');
    assert.deepEqual(Reflect.ownKeys(a), []);
});
const commands = [];
for (const [name, args] of [
    [
        'tsc',
        [
            'node_modules/typescript/bin/tsc',
            '--strict',
            '--target',
            'ES2022',
            '--module',
            'ES2022',
            '--skipLibCheck',
            '--noEmit',
            paths[0],
        ],
    ],
    ['format', ['node_modules/prettier/bin/prettier.cjs', '--ignore-path', '/dev/null', '--check', ...paths]],
]) {
    const child = spawnSync(process.execPath, args, { encoding: 'utf8' });
    await writeFile(path.join(output, `${name}.stdout.log`), child.stdout ?? '');
    await writeFile(path.join(output, `${name}.stderr.log`), child.stderr ?? '');
    commands.push({
        name,
        executable: process.execPath,
        args,
        exitCode: child.status,
        signal: child.signal,
        error: child.error ? String(child.error) : null,
    });
}
const after = await hashes();
const raw = `${JSON.stringify({ scope: 'Pure actual-source registry controls; no engine entry-point wiring or native physics qualification', rows }, null, 2)}\n`;
await writeFile(path.join(output, 'controls.raw.json'), raw);
const ok =
    rows.every((x) => x.status === 'PASS_PURE_SOURCE_CONTROL') &&
    commands.every((x) => x.exitCode === 0) &&
    JSON.stringify(before) === JSON.stringify(after);
const receipt = {
    status: ok ? 'PASS_PURE_SOURCE_CONTROLS_NOT_ENGINE_WIRING' : 'FAIL',
    startedAt,
    completedAt: new Date().toISOString(),
    sourceHashesBefore: before,
    sourceHashesAfter: after,
    tests: rows.length,
    passed: rows.filter((x) => x.status === 'PASS_PURE_SOURCE_CONTROL').length,
    rawSha256: sha(raw),
    commands,
};
await writeFile(path.join(output, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt));
process.exitCode = ok ? 0 : 1;
