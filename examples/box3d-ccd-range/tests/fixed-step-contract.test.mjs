import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FIXED_DT, TRIAL_TICKS, SPEEDS } from '../src/protocol.mjs';
import { NATIVE_FIXED_DT, SOLVER_SUB_STEPS, copyStepClock, assertStepClock } from '../src/fixed-step-contract.mjs';
const context = () => ({ tickIndex: 1, attemptId: 1, fixedDt: NATIVE_FIXED_DT, solverSubSteps: 4 });
test('exact SDK float32 step is accepted; authored/native evidence is copied', () => {
    assert.equal(NATIVE_FIXED_DT, Math.fround(1 / 60));
    assert.equal(NATIVE_FIXED_DT, 0.01666666753590107);
    assert.notEqual(NATIVE_FIXED_DT, FIXED_DT);
    const input = context();
    assert.equal(assertStepClock(input), undefined);
    const copy = copyStepClock(input);
    input.fixedDt = 0;
    assert.deepEqual(copy, {
        tickIndex: 1,
        attemptId: 1,
        authoredFixedDt: 1 / 60,
        expectedNativeFixedDt: Math.fround(1 / 60),
        actualNativeFixedDt: Math.fround(1 / 60),
        expectedSolverSubSteps: 4,
        actualSolverSubSteps: 4,
    });
    assert.equal(Object.isFrozen(copy), true);
});
test('double authored step, neighboring float32 values and invalid dt reject without epsilon', () => {
    const f32 = new Float32Array([NATIVE_FIXED_DT]),
        bits = new Uint32Array(f32.buffer),
        nativeBits = bits[0];
    bits[0] = nativeBits - 1;
    const previous = f32[0];
    bits[0] = nativeBits + 1;
    const next = f32[0];
    for (const fixedDt of [FIXED_DT, previous, next, 1 / 30, 0, -1, NaN, Infinity, undefined, '0.01666666753590107'])
        assert.throws(() => assertStepClock({ ...context(), fixedDt }), /Unexpected fixed step/);
});
test('all nonselected solver subdivisions reject and original trial contract is unchanged', () => {
    assert.equal(SOLVER_SUB_STEPS, 4);
    for (const solverSubSteps of [1, 2, 8, 0, 3, NaN, undefined, '4'])
        assert.throws(() => assertStepClock({ ...context(), solverSubSteps }), /Unexpected solver substeps/);
    assert.equal(TRIAL_TICKS, 90);
    assert.deepEqual(SPEEDS, [10, 30, 80]);
});
test('live hook records actual context before exact check and query uses that same dt', () => {
    const source = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
    assert.ok(
        source.indexOf('current.stepClocks.push(copyStepClock(context))') < source.indexOf('assertStepClock(context)'),
    );
    assert.match(source, /registerBox3DBeforeStep\(\(context\) =>/);
    assert.doesNotMatch(source, /context: any|Math\.abs\(context.fixedDt/);
    for (const axis of ['x', 'y', 'z']) assert.ok(source.includes(`m.linearVelocity.${axis} * context.fixedDt`));
    assert.ok(source.includes('solverSubSteps: SOLVER_SUB_STEPS'));
});
