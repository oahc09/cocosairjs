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
const runner = 'tools/verify/box3d/material-cleanup-reporter-control.mjs';
const files = [source, b0, runner];
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

const delegate = () =>
    Object.fromEntries(
        ['open', 'protectCandidate', 'preflightCopied', 'applyCopied', 'commitActual', 'fail', 'dispose'].map((k) => [
            k,
            () => {},
        ]),
    );
const setup = (report = () => {}, generation = 1) => {
    const registry = new Registry(),
        target = {},
        owner = { generation, report };
    const lease = registry.register(target, delegate(), owner);
    return { registry, target, owner, lease, capture: () => registry.captureCleanup(target) };
};
check('no observer capture/inspect has no reader callback', () => {
    const r = new Registry();
    assert.equal(r.captureCleanup({}), undefined);
    assert.equal(r.inspectCleanup({}), undefined);
});
for (const generation of [undefined, null, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1'])
    check(`invalid generation ${String(generation)}`, () => {
        const registry = new Registry(),
            target = {};
        assert(caught(() => registry.register(target, delegate(), { generation, report() {} })).threw);
        assert.equal(registry.captureCleanup(target), undefined);
        const l = registry.register(target, delegate(), { generation: 1, report() {} });
        l.dispose();
    });
check('capture one per generation, readable after unregister and fresh generation independent', () => {
    const s = setup();
    const a = s.capture();
    assert(caught(s.capture).threw);
    s.lease.dispose();
    assert.equal(s.capture(), undefined);
    a.complete([]);
    assert.equal(s.registry.inspectCleanup(s.target).report.hasFailure, false);
    assert(caught(() => s.registry.register(s.target, delegate(), { generation: 1, report() {} })).threw);
    const l = s.registry.register(s.target, delegate(), { generation: 2, report() {} });
    const b = s.capture();
    assert.notEqual(a, b);
    b.complete([]);
    assert.equal(s.registry.inspectCleanup(s.target).report.generation, 2);
    l.dispose();
});
for (const primary of [undefined, null, 0])
    check(`falsy primary ${String(primary)} survives report and dispose`, () => {
        let delivered;
        const s = setup((r) => {
            delivered = r;
        });
        const t = s.capture();
        s.lease.dispose();
        const rows = [
            { stage: 'material-off', error: primary },
            { stage: 'adapter-destroy', error: 'second' },
        ];
        t.complete(rows);
        rows[0].error = 99;
        assert.equal(delivered.firstError, primary);
        assert.equal(delivered.hasFailure, true);
        assert.equal(delivered.errors[1].error, 'second');
        assert(Object.isFrozen(delivered.errors[0]));
        assert.equal(s.registry.inspectCleanup(s.target).report, delivered);
    });
check('report function/generation copied at registration', () => {
    let calls = 0;
    const s = setup(() => calls++);
    s.owner.generation = 7;
    s.owner.report = () => {
        throw 2;
    };
    s.capture().complete([]);
    assert.equal(calls, 1);
    assert.equal(s.registry.inspectCleanup(s.target).report.generation, 1);
});
check('complete invalid receiver cannot consume real reporter', () => {
    const s = setup(),
        t = s.capture();
    assert(caught(() => t.complete.call({}, [])).threw);
    assert.equal(t.diagnostics().consumed, false);
    t.complete([]);
});
check('diagnostic receiver cannot be forged', () => {
    const s = setup(),
        t = s.capture();
    assert(caught(() => t.diagnostics.call({})).threw);
});
check('complete cannot replay delivery', () => {
    let calls = 0;
    const s = setup(() => calls++),
        t = s.capture();
    t.complete([]);
    assert(caught(() => t.complete([])).threw);
    assert.equal(calls, 1);
});
for (const primary of [undefined, null, 0])
    check(`delivery failure ${String(primary)} is independent and stays reachable`, () => {
        const s = setup(() => {
                throw primary;
            }),
            t = s.capture();
        s.lease.dispose();
        sameThrow(() => t.complete([{ stage: 'material-off', error: 'original' }]), primary);
        const d = s.registry.inspectCleanup(s.target);
        assert.equal(d.report.firstError, 'original');
        assert.equal(d.deliveryFailed, true);
        assert.equal(d.deliveryError, primary);
        assert.equal(d.deliveryReturned, false);
    });
for (const primary of [undefined, null, 0])
    check(`copy failure ${String(primary)} is independent and stays reachable`, () => {
        const s = setup(() => {
                throw 'must not deliver';
            }),
            t = s.capture();
        s.lease.dispose();
        sameThrow(
            () =>
                t.complete([
                    {
                        stage: 'material-off',
                        get error() {
                            throw primary;
                        },
                    },
                ]),
            primary,
        );
        const d = s.registry.inspectCleanup(s.target);
        assert.equal(d.copyFailed, true);
        assert.equal(d.copyError, primary);
        assert.equal(d.deliveryAttempted, false);
        assert.equal(d.report, null);
    });
check('getter nested caught completion identity retained', () => {
    const s = setup(),
        t = s.capture();
    let nested;
    const o = caught(() =>
        t.complete([
            {
                get stage() {
                    nested = caught(() => t.complete([])).error;
                    return 'material-off';
                },
                error: null,
            },
        ]),
    );
    assert(o.threw);
    assert.equal(o.error, nested);
    assert.equal(t.diagnostics().copyError, nested);
    assert.equal(t.diagnostics().deliveryAttempted, false);
});
check('raw error object is not read or frozen', () => {
    let reads = 0;
    const error = new Proxy(
        {},
        {
            get() {
                reads++;
                throw 9;
            },
        },
    );
    const s = setup(),
        t = s.capture();
    t.complete([{ stage: 'bounds-destroy', error }]);
    assert.equal(reads, 0);
    assert.equal(t.diagnostics().report.firstError, error);
});
check('throwing registration getters leave no half registration', () => {
    const r = new Registry(),
        target = {};
    sameThrow(
        () =>
            r.register(target, delegate(), {
                get generation() {
                    throw 0;
                },
                report() {},
            }),
        0,
    );
    assert.equal(r.captureCleanup(target), undefined);
    r.register(target, delegate(), { generation: 1, report() {} }).dispose();
});
check('caught reentrant registration still rejects outer', () => {
    const r = new Registry(),
        target = {};
    let nested;
    const o = caught(() =>
        r.register(target, delegate(), {
            get generation() {
                nested = caught(() => r.register({}, delegate())).error;
                return 1;
            },
            report() {},
        }),
    );
    assert(o.threw);
    assert.equal(o.error, nested);
    assert.equal(r.captureCleanup(target), undefined);
});
check('only copied stages are accepted and completion stays consumed', () => {
    const s = setup(),
        t = s.capture();
    assert(caught(() => t.complete([{ stage: 'native-success', error: 0 }])).threw);
    assert.equal(t.diagnostics().copyFailed, true);
    assert(caught(() => t.complete([])).threw);
});
check('bounded report rejects oversized list before entries', () => {
    const s = setup(),
        t = s.capture();
    assert(caught(() => t.complete(new Array(4097))).threw);
    assert.equal(t.diagnostics().deliveryAttempted, false);
});
for (const length of [NaN, -1, 0.5, '0', Infinity, undefined, null]) {
    check(`proxy array invalid length ${String(length)} rejected before entry reads/delivery`, () => {
        let delivered = false,
            reads = 0;
        const s = setup(() => {
                delivered = true;
            }),
            t = s.capture();
        const input = new Proxy([], {
            get(target, key) {
                if (key === 'length') return length;
                reads++;
                return { stage: 'material-off', error: 0 };
            },
        });
        assert(caught(() => t.complete(input)).threw);
        assert.equal(reads, 0);
        assert.equal(delivered, false);
        assert.equal(t.diagnostics().copyFailed, true);
    });
}
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
    status: ok ? 'PASS_PURE_CLEANUP_REPORTER_ONLY' : 'FAIL',
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
