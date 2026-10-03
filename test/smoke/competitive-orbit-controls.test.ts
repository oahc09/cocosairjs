import { OrbitState } from '../../examples/orbit-controls/src/orbit-state';

describe('competitive orbit controls', () => {
    function moving(): OrbitState {
        const orbit = new OrbitState();
        orbit.begin();
        orbit.drag(0.03, 0.001, 0.05);
        orbit.end();
        return orbit;
    }
    test('release has continuous angular inertia and the documented exponential decay', () => {
        const orbit = moving();
        const velocity = orbit.thetaVelocity;
        const theta = orbit.theta;
        orbit.update(0.2);
        expect(orbit.theta).not.toBe(theta);
        expect(orbit.thetaVelocity).toBeCloseTo(velocity * Math.exp(-8 * 0.2), 10);
        expect(Math.abs(orbit.thetaVelocity)).toBeLessThan(Math.abs(velocity));
    });
    test('equal elapsed time with different frame partitions gives equal angles and velocity', () => {
        const one = moving();
        const many = moving();
        one.update(0.2);
        for (let i = 0; i < 12; i++) many.update(1 / 60);
        expect(many.theta).toBeCloseTo(one.theta, 10);
        expect(many.phi).toBeCloseTo(one.phi, 10);
        expect(many.thetaVelocity).toBeCloseTo(one.thetaVelocity, 10);
    });
    test('wheel is monotonic, bounded, and nonfinite input does not poison the camera', () => {
        const orbit = new OrbitState();
        orbit.wheel(500);
        expect(orbit.radius).toBeLessThan(7);
        orbit.wheel(-1e7);
        expect(orbit.radius).toBe(20);
        orbit.wheel(1e7);
        expect(orbit.radius).toBe(2);
        orbit.wheel(NaN);
        expect(orbit.radius).toBe(2);
    });
    test('cancel and polar bounds stop the corresponding velocity', () => {
        const orbit = moving();
        orbit.end(true);
        expect(orbit.thetaVelocity).toBe(0);
        orbit.begin();
        orbit.drag(0, 10, 0.05);
        expect(orbit.phi).toBeCloseTo(Math.PI - 0.05);
        expect(orbit.phiVelocity).toBe(0);
        const position = orbit.position();
        expect(Math.hypot(position.x, position.y, position.z)).toBeCloseTo(orbit.radius);
    });
});
