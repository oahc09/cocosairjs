/** Pure evidence policy; this module never simulates physics. */
export const SPEEDS = Object.freeze([10, 30, 80]);
export const FIXED_DT = 1 / 60;
export const RADIUS = 0.05;
export const TRIAL_TICKS = 90;
export function configuration(input) {
    const speed = Number(input.speed);
    const thickness = Number(input.thickness);
    if (!SPEEDS.includes(speed) || !Number.isFinite(thickness) || thickness < 0.01 || thickness > 0.5)
        throw new Error('Invalid speed or wall thickness');
    if (!['wall', 'slow-target', 'bullet-target'].includes(input.target)) throw new Error('Invalid target');
    if (!['body', 'sweep'].includes(input.mode)) throw new Error('Invalid mode');
    return Object.freeze({ speed, thickness, target: input.target, mode: input.mode, bullet: !!input.bullet });
}
export function promised(config) {
    return config.target === 'wall' && config.bullet && config.mode === 'body' && config.thickness === 0.05;
}
export function assessTrial(config, trace, contacts, interrupted = false) {
    if (interrupted) return { status: 'ABORTED', reason: 'reset/close interrupted trial' };
    if (
        trace.length !== TRIAL_TICKS ||
        trace.some(
            (r, i) =>
                r.step !== i + 1 ||
                !Number.isInteger(r.tick) ||
                (i > 0 && r.tick !== trace[i - 1].tick + 1) ||
                !['x', 'y', 'z'].every((axis) => Number.isFinite(r.position[axis])),
        )
    )
        return { status: 'INCOMPLETE', reason: 'missing or nonfinite fixed-step observation' };
    const final = trace.at(-1);
    const crossed = trace.some((r) => r.position.x > config.thickness / 2 + RADIUS);
    const poseMatches = trace.every((r) => Number.isFinite(r.poseError) && r.poseError <= 1e-4);
    const finiteVector = (value) => value && ['x', 'y', 'z'].every((axis) => Number.isFinite(value[axis]));
    const ticks = new Set(trace.map((row) => row.tick));
    const validContact = (contact) =>
        contact &&
        typeof config.trialId === 'string' &&
        contact.trialId === config.trialId &&
        contact.projectileId === `${config.trialId}:projectile` &&
        contact.targetId === `${config.trialId}:target` &&
        contact.target === config.target &&
        ticks.has(contact.tick) &&
        Number.isInteger(contact.contactCount) &&
        contact.contactCount > 0 &&
        Array.isArray(contact.points) &&
        contact.points.length === contact.contactCount &&
        contact.points.every((row) => finiteVector(row.point) && finiteVector(row.normal));
    const hit = contacts.length > 0 && contacts.every(validContact);
    // Query hits do NOT count as collision events or proof of stopping.
    return {
        status: !promised(config) ? 'OBSERVATION_ONLY' : crossed || !poseMatches || !hit ? 'FAIL' : 'OBSERVED_OK',
        crossed,
        poseMatches,
        hit,
        finalPosition: final.position,
        reason: 'Local fixed-step evidence only; browser presentation and C26-C28 matrix remain NOT_RUN',
    };
}
export function counts(trials) {
    return SPEEDS.map((speed) => {
        const rows = trials.filter((t) => t.config.speed === speed && promised(t.config));
        return {
            speed,
            required: 30,
            completed: rows.filter((t) => ['OBSERVED_OK', 'FAIL'].includes(t.result.status)).length,
            observedOK: rows.filter((t) => t.result.status === 'OBSERVED_OK').length,
            failed: rows.filter((t) => t.result.status === 'FAIL').length,
            acceptance: 'NOT_RUN',
        };
    });
}
