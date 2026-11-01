import test from 'node:test';
import assert from 'node:assert/strict';
import { assessTrial, counts, TRIAL_TICKS, RADIUS } from '../src/protocol.mjs';
// Synthetic observation fixtures, not simulated physics or newly claimed moving-target geometry.
const config = (target) => ({ target, speed: 30, mode: 'body', bullet: true, thickness: 0.05, trialId: 'fixture:1' });
const rows = (x, targetX = 0) =>
    Array.from({ length: TRIAL_TICKS }, (_, i) => ({
        step: i + 1,
        tick: i + 1,
        position: { x, y: 0, z: 0 },
        target: { x: targetX, y: 0, z: 0 },
        poseError: 0,
    }));
const contact = (c) => [
    {
        trialId: c.trialId,
        projectileId: `${c.trialId}:projectile`,
        targetId: `${c.trialId}:target`,
        target: c.target,
        tick: 20,
        contactCount: 1,
        points: [{ point: { x: 0, y: 0, z: 0 }, normal: { x: -1, y: 0, z: 0 } }],
    },
];
test('moving pair can pass fixed X together while projectile stays left: not target penetration', () => {
    const c = config('slow-target'),
        trace = rows(20.64116859436035, 20.716163635253906);
    assert.ok(trace.every((r) => r.position.x < r.target.x));
    const result = assessTrial(c, trace, contact(c));
    assert.equal(result.crossed, true);
    assert.equal(result.hit, true);
    assert.equal(result.crossedScope, 'FIXED_WORLD_X_DIAGNOSTIC_ONLY');
    assert.equal(result.targetPenetrationAssessment, 'NOT_ASSESSED');
    assert.equal(result.status, 'OBSERVATION_ONLY');
});
test('contact plus sampled center on other side still provides no blocking guarantee', () => {
    const c = config('bullet-target'),
        trace = rows(43, -1.4999992847442627);
    const result = assessTrial(c, trace, contact(c));
    assert.equal(result.crossed, true);
    assert.equal(result.hit, true);
    assert.equal(result.hitMeaning, 'VALID_CONTACT_EVENT_NOT_BLOCKING_PROOF');
    assert.equal(result.targetPenetrationAssessment, 'NOT_ASSESSED');
    assert.equal(result.status, 'OBSERVATION_ONLY');
    assert.equal(counts([{ config: c, result }]).find((r) => r.speed === 30).completed, 0);
});
test('false fixed-X crossing also cannot certify moving-target nonpenetration', () => {
    const c = config('slow-target');
    const result = assessTrial(c, rows(-1, -2), []);
    assert.equal(result.crossed, false);
    assert.equal(result.hit, false);
    assert.equal(result.targetPenetrationAssessment, 'NOT_ASSESSED');
    assert.equal(result.status, 'OBSERVATION_ONLY');
});
test('static wall original strict boundary, contact requirement, status and counts unchanged', () => {
    const c = config('wall'),
        boundary = c.thickness / 2 + RADIUS;
    const at = assessTrial(c, rows(boundary), contact(c));
    assert.equal(at.crossed, false);
    assert.equal(at.status, 'OBSERVED_OK');
    assert.equal(at.crossedScope, 'STATIC_WALL_FIXED_X_BOUND');
    assert.equal('targetPenetrationAssessment' in at, false);
    const beyond = assessTrial(c, rows(boundary + Number.EPSILON), contact(c));
    assert.equal(beyond.crossed, true);
    assert.equal(beyond.status, 'FAIL');
    assert.equal(assessTrial(c, rows(-0.08), []).status, 'FAIL');
    assert.equal(counts([{ config: c, result: at }]).find((r) => r.speed === 30).observedOK, 1);
});
test('incomplete and aborted evidence not promoted by semantic labels', () => {
    const c = config('slow-target');
    assert.equal(assessTrial(c, [], []).status, 'INCOMPLETE');
    assert.equal(assessTrial(c, rows(20, 21), contact(c), true).status, 'ABORTED');
});
