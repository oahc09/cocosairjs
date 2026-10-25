// CPU observation reviewer only; generated/mock traces are never physics evidence.
import assert from 'node:assert/strict';
import { surfaceDistance, rayOracle, TOLERANCE } from './oracle.mjs';
export const DROP = { radius: 0.1, initialY: 2, gravity: -10, dt: 1 / 60, maxApproachSteps: 90, responseSteps: 12 };
export function reviewDropTrace(trace, config = DROP) {
    assert.ok(trace.length > 0);
    let firstContact = -1;
    for (const [i, row] of trace.entries()) {
        assert.equal(row.step, i + 1);
        const p = row.position,
            clearance = surfaceDistance(p) - config.radius;
        const vertical = rayOracle([p[0], 30, p[2]], [0, -1, 0], 60);
        assert.ok(vertical.length > 0, 'drop stays over finite terrain through response window');
        assert.ok(p[1] >= vertical[0].point[1] - TOLERANCE, 'unsigned distance must not hide tunneling');
        assert.ok(clearance >= -TOLERANCE, 'sphere surface penetration exceeds original .01 m');
        if (firstContact < 0 && clearance <= TOLERANCE) firstContact = i;
    }
    assert.ok(
        firstContact >= 0 && firstContact < config.maxApproachSteps,
        'actual contact must occur within declared approach window',
    );
    assert.ok(trace.length >= firstContact + 1 + config.responseSteps, 'first proximity is NOT contact-response proof');
    const row = trace[firstContact + config.responseSteps],
        t = row.step * config.dt;
    // Continuous ballistic height lies ABOVE semi-implicit zero-damping freefall.
    // A positive separation here therefore rejects either no-contact integration.
    const noCollisionY = config.initialY + 0.5 * config.gravity * t * t;
    assert.ok(
        row.position[1] > noCollisionY + TOLERANCE,
        'continued trace must show a real response, not ballistic transit',
    );
    assert.ok(trace[firstContact].position[1] < config.initialY - TOLERANCE, 'must actually fall');
    return {
        firstContactStep: firstContact + 1,
        responseThroughStep: row.step,
        noCollisionY,
        responseY: row.position[1],
        responseSteps: config.responseSteps,
    };
}
