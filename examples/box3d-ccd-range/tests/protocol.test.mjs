import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { configuration, counts, assessTrial, promised, TRIAL_TICKS } from '../src/protocol.mjs';
const c = {
    ...configuration({ speed: 80, thickness: 0.05, target: 'wall', mode: 'body', bullet: true }),
    trialId: 'fixture:1',
};
const contact = () => ({
    trialId: c.trialId,
    projectileId: `${c.trialId}:projectile`,
    targetId: `${c.trialId}:target`,
    tick: 20,
    target: 'wall',
    contactCount: 1,
    points: [{ point: { x: -0.025, y: 0, z: 0 }, normal: { x: -1, y: 0, z: 0 } }],
});
const trace = () =>
    Array.from({ length: TRIAL_TICKS }, (_, i) => ({
        step: i + 1,
        tick: i + 10,
        position: { x: -0.08, y: 0, z: 0 },
        poseError: 0,
    }));
test('invalid configuration fails closed', () => {
    for (const patch of [{ speed: 20 }, { thickness: NaN }, { thickness: 0 }, { target: 'fake' }, { mode: 'teleport' }])
        assert.throws(() => configuration({ ...c, ...patch }));
});
test('only explicit static-wall baseline is promised', () => {
    assert.equal(promised(c), true);
    for (const patch of [
        { bullet: false },
        { mode: 'sweep' },
        { target: 'bullet-target' },
        { target: 'slow-target' },
        { thickness: 0.1 },
    ])
        assert.equal(promised({ ...c, ...patch }), false);
});
test('crossing at any tick fails even when final pose comes back', () => {
    const rows = trace();
    rows[5].position.x = 0.2;
    assert.equal(assessTrial(c, rows, [contact()]).status, 'FAIL');
});
test('queries cannot substitute for collision / incomplete evidence cannot pass', () => {
    assert.equal(assessTrial(c, trace(), []).status, 'FAIL');
    assert.equal(assessTrial(c, [], [contact()]).status, 'INCOMPLETE');
    assert.equal(assessTrial(c, trace(), [contact()], true).status, 'ABORTED');
    const rows = trace();
    rows[0].poseError = 0.01;
    assert.equal(assessTrial(c, rows, [contact()]).status, 'FAIL');
});
test('30 CPU fixtures never promote real acceptance or boundary support', () => {
    const result = assessTrial(c, trace(), [contact()]);
    assert.equal(result.status, 'OBSERVED_OK');
    const rows = Array.from({ length: 30 }, () => ({ config: c, result }));
    assert.deepEqual(counts(rows).at(-1), {
        speed: 80,
        required: 30,
        completed: 30,
        observedOK: 30,
        failed: 0,
        acceptance: 'NOT_RUN',
    });
    assert.equal(assessTrial({ ...c, target: 'bullet-target' }, trace(), [contact()]).status, 'OBSERVATION_ONLY');
});
test('source owns no physics clock or runtime teleport; public query and body paths retained', () => {
    const source = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
    for (const required of [
        'registerBox3DBeforeStep',
        'queryBox3DCommittedRay',
        'queryBox3DCommittedColliders',
        'readBox3DBodyMotion',
        'mountAndConfigureBodies',
        'system.maxSubSteps = 1',
        'app.releaseScene()',
        'app.close()',
    ])
        assert.ok(source.includes(required), required);
    assert.doesNotMatch(source, /requestAnimationFrame|\.simulate\(|\.step\(|_air_b3_|physicsWorld\./);
    assert.equal((source.match(/\.setPosition\(/g) || []).length, 1, 'initial spawn only');
});

test('malformed, missing, nonfinite and out-of-range contacts cannot pass', () => {
    for (const row of [
        {},
        { ...contact(), trialId: 'other-trial' },
        { ...contact(), projectileId: 'other-body' },
        { ...contact(), targetId: 'other-target' },
        { ...contact(), tick: 0 },
        { ...contact(), target: 'other' },
        { ...contact(), contactCount: 0 },
        { ...contact(), points: [] },
        { ...contact(), points: [{ point: { x: NaN, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 } }] },
    ])
        assert.equal(assessTrial(c, trace(), [row]).status, 'FAIL');
});
