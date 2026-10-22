/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Actual frozen queue plus an explicit owner-shaped pre-submit wrapper, NOT an integrated World or native test.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = new URL('./inputs/src/air/physics/box3d/command-queue.ts', import.meta.url);
const bytes = await readFile(source);
const compiled = ts.transpileModule(bytes.toString(), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { Box3DCommandQueue: Queue } = await import(
    `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`
);
const effect = () => ({ kind: 'impulse', vector: { x: 1, y: 0, z: 0 } });
const rows = [];
const capture = (fn) => {
    try {
        return { threw: false, value: fn() };
    } catch (error) {
        return { threw: true, error };
    }
};
function setup() {
    const q = new Queue({ generation: 9 });
    const body = {};
    q.registerBody(body);
    q.submit(body, effect());
    return { q, body, before: q.diagnostics() };
}
// This is the missing outer atomic boundary, not a copied implementation of Queue.submit.
const separatedSubmission = (q, read) => {
    const { body, command } = read();
    return q.submit(body, command);
};
function test(name, run) {
    const observed = run();
    rows.push({ name, status: observed.expected ? 'PASS' : 'RED', ...observed });
}
test('ready owner getter nested successful submit then throw changes accepted prequeue', () => {
    const { q, body, before } = setup();
    const failure = Error('owner resolution injection');
    const result = capture(() =>
        separatedSubmission(q, () => ({
            get body() {
                q.submit(body, effect());
                throw failure;
            },
            command: effect(),
        })),
    );
    const after = q.diagnostics();
    return {
        expected: result.threw && result.error === failure && after.pending === before.pending,
        exactThrown: result.error === failure,
        acceptedBefore: before.pending.length,
        acceptedAfter: after.pending.length,
        sequenceBefore: before.sequence,
        sequenceAfter: after.sequence,
    };
});
test('ready owner getter catches nested invalid submission and outer submission still succeeds', () => {
    const { q, body, before } = setup();
    const result = capture(() =>
        separatedSubmission(q, () => ({
            get body() {
                capture(() => q.submit({}, effect()));
                return body;
            },
            command: effect(),
        })),
    );
    const after = q.diagnostics();
    return {
        expected: result.threw && after.pending === before.pending,
        outerThrew: result.threw,
        acceptedBefore: before.pending.length,
        acceptedAfter: after.pending.length,
        sequenceBefore: before.sequence,
        sequenceAfter: after.sequence,
    };
});
for (const failure of [undefined, null, 0])
    test(`collection caught owner resolution throw ${String(failure)} does not latch`, () => {
        const { q, body, before } = setup();
        const result = capture(() =>
            q.collect(1 / 60, 4, [
                () => {
                    q.submit(body, effect());
                    capture(() =>
                        separatedSubmission(q, () => {
                            throw failure;
                        }),
                    );
                },
            ]),
        );
        const after = q.diagnostics();
        return {
            expected: result.threw && result.error === failure && after.phase === 'ready',
            collectionThrew: result.threw,
            phase: after.phase,
            provisionalCount: after.provisionalCount,
            originalCount: result.value?.original.length ?? null,
            prequeueSame: before.pending === after.pending,
            sequence: after.sequence,
            attemptId: after.attemptId,
        };
    });
test('caught nested command rejection identity is replaced by later getter throw', () => {
    const { q, body, before } = setup();
    let first;
    const replacement = Error('later getter throw');
    const result = capture(() =>
        q.submit(body, {
            kind: 'force',
            get vector() {
                first = capture(() => q.submit(body, effect())).error;
                throw replacement;
            },
        }),
    );
    return {
        expected: result.threw && result.error === first && q.diagnostics().pending === before.pending,
        preservedFirst: result.error === first,
        replacedByLater: result.error === replacement,
        prequeueSame: q.diagnostics().pending === before.pending,
    };
});
assert.equal(rows.length, 6);
const result = {
    scope: 'Actual frozen Queue source. Owner-shaped callback injection exposes a missing integration primitive; no actual World, native/WASM, or component qualification.',
    sourceSha256: createHash('sha256').update(bytes).digest('hex'),
    probeSha256: createHash('sha256')
        .update(await readFile(new URL(import.meta.url)))
        .digest('hex'),
    rows,
    status: rows.every((r) => r.expected) ? 'PASS_PURE_CONTROLS' : 'RED_PURE_ADMISSION_GAP',
};
await writeFile(new URL('./raw.json', import.meta.url), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
process.exitCode = rows.every((r) => r.expected) ? 0 : 1;
