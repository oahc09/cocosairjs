import {
    BlackHoleState,
    ANGULAR_SPEED,
    backgroundPositions,
    streamSeeds,
    streamPosition,
    BACKGROUND_COUNT,
    STREAM_COUNT,
} from '../../examples/black-hole-accretion/src/state';

describe('black-hole procedural motion contract', () => {
    test('rotation uses elapsed seconds, phase wraps continuously, and reset restores physical values', () => {
        const state = new BlackHoleState();
        state.update(0.8);
        expect(state.diskRotation).toBeCloseTo(0.8 * ANGULAR_SPEED);
        expect(state.diskRotation).toBeGreaterThanOrEqual(0.1);
        state.update((Math.PI * 2) / ANGULAR_SPEED);
        expect(state.accretionPhase).toBeGreaterThanOrEqual(0);
        expect(state.accretionPhase).toBeLessThan(1);
        state.reset();
        expect(state.diskRotation).toBe(0);
        expect(state.cameraDistance).toBe(14);
        expect(state.accretionPhase).toBe(0);
    });
    test('wheel has correct engine sign, clamps distance, and smooths independently of frame partition', () => {
        const one = new BlackHoleState();
        const many = new BlackHoleState();
        one.wheel(3000);
        many.wheel(3000); // DOM deltaY=-600 -> engine scrollY=3000.
        expect(one.targetDistance).toBeLessThan(10);
        one.update(1.2);
        for (let i = 0; i < 72; i++) many.update(1 / 60);
        expect(one.cameraDistance).toBeCloseTo(many.cameraDistance, 10);
        expect(one.cameraDistance).toBeLessThan(10);
        one.wheel(1e8);
        expect(one.targetDistance).toBe(5);
        one.wheel(-1e8);
        expect(one.targetDistance).toBe(28);
        one.wheel(NaN);
        expect(one.targetDistance).toBe(28);
    });
    test('seed buffers contain real finite vertices and analytic streams move inward then respawn', () => {
        const stars = backgroundPositions();
        const seeds = streamSeeds();
        expect(stars.length / 3).toBe(BACKGROUND_COUNT);
        expect(stars.length / 3).toBeGreaterThanOrEqual(300);
        expect(seeds.length / 3).toBe(STREAM_COUNT);
        expect(seeds.length / 3).toBeGreaterThanOrEqual(200);
        expect(stars.every(Number.isFinite)).toBe(true);
        expect(seeds.every(Number.isFinite)).toBe(true);
        expect(backgroundPositions()).toEqual(stars);
        const first = streamPosition(1.1, 0.2, 0);
        const next = streamPosition(1.1, 0.2, 1);
        expect(next.radius).toBeLessThan(first.radius);
        expect(Math.hypot(next.x, next.y)).toBeCloseTo(next.radius);
        const swallowed = streamPosition(1.1, 0.99, 0);
        const reborn = streamPosition(1.1, 0.99, 0.2);
        expect(reborn.radius).toBeGreaterThan(swallowed.radius);
    });
});
