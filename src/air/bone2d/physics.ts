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
import type { Matrix2D } from './affine';

export const physicsParams = ['inertia', 'strength', 'damping', 'mass', 'wind', 'gravity', 'mix'] as const;
export type PhysicsParam = (typeof physicsParams)[number];
export type PhysicsParams = Record<PhysicsParam, number>;
export type PhysicsConstraint = {
    kind: 'physics';
    id: string;
    bone: string;
    skinRequired: boolean;
    x: number;
    y: number;
    rotate: number;
    scaleX: number;
    shearX: number;
    scaleY: 'none' | 'uniform' | 'volume';
    limit: number;
    fps: number;
    setup: PhysicsParams;
    global: Record<PhysicsParam, boolean>;
};
interface SpringPoint {
    x: number;
    y: number;
    vx: number;
    vy: number;
    anchorX: number;
    anchorY: number;
}
interface Spring {
    root: SpringPoint;
    tip: SpringPoint;
    torque: { value: number; speed: number };
    stretch: { value: number; speed: number };
    remainder: number;
}
export const bone2dPhysicsHorizon = 0.25;
export type Bone2dPhysicsState = Map<string, Spring>;
export interface PhysicsStep {
    state: Bone2dPhysicsState;
    seconds: number;
    intervals: readonly (readonly [number, number])[];
}
function point(x: number, y: number): SpringPoint {
    return { x: 0, y: 0, vx: 0, vy: 0, anchorX: x, anchorY: y };
}

/** Independent damped springs in skeleton space anchored at the animated base and endpoint. */
export function solveBone2dPhysics(
    c: PhysicsConstraint,
    p: PhysicsParams,
    matrix: Matrix2D,
    length: number,
    tick: PhysicsStep,
    reset: boolean,
): Matrix2D {
    const [a, b, d, e, x, y] = matrix;
    const tipX = x + a * length,
        tipY = y + d * length;
    const dt = tick.seconds;
    const spring = tick.state.get(c.id);
    if (reset || !spring || dt > bone2dPhysicsHorizon || p.mix === 0) {
        tick.state.set(c.id, {
            root: point(x, y),
            tip: point(tipX, tipY),
            remainder: 0,
            torque: { value: 0, speed: 0 },
            stretch: { value: 0, speed: 0 },
        });
        return matrix;
    }

    const push = (s: SpringPoint, ax: number, ay: number): void => {
        if (dt > 0) {
            const dx = (ax - s.anchorX) * p.inertia,
                dy = (ay - s.anchorY) * p.inertia;
            const speedLimit = c.limit * dt;
            const magnitude = Math.hypot(dx, dy);
            const factor = magnitude > speedLimit ? speedLimit / magnitude : 1;
            s.x -= dx * factor;
            s.y -= dy * factor;
        }
        s.anchorX = ax;
        s.anchorY = ay;
    };
    push(spring.root, x, y);
    push(spring.tip, tipX, tipY);

    const h = 1 / c.fps;
    const steps = Math.floor((spring.remainder + dt + 1e-12) / h);
    spring.remainder = Math.max(0, spring.remainder + dt - h * steps);
    // Drift/kick integration of m*q'' = F - k*q, with per-step
    // velocity retention. The native authoring force unit is 100 AIR units.
    const stiffness = p.strength / p.mass;
    const damping = Math.pow(p.damping, 60 * h);
    const wind = p.wind / p.mass,
        gravity = -p.gravity / p.mass;
    const integrate = (value: number, speed: number, force: number): [number, number] => {
        for (let i = 0; i < steps; i++) {
            if (h * h * stiffness > 1) {
                // The same oscillator in an implicit step handles stiff
                // extremes without a growing numerical oscillation.
                speed = (damping * speed + h * (force - stiffness * value)) / (1 + h * h * stiffness);
                value += h * speed;
            } else {
                value += h * speed;
                speed = damping * speed + h * (force - stiffness * value);
            }
        }
        const safe = (n: number): number => Math.max(-1e6, Math.min(1e6, n));
        return [safe(value), safe(speed)];
    };
    [spring.root.x, spring.root.vx] = integrate(spring.root.x, spring.root.vx, 100 * wind);
    [spring.root.y, spring.root.vy] = integrate(spring.root.y, spring.root.vy, 100 * gravity);
    const px = x + c.x * p.mix * spring.root.x;
    const py = y + c.y * p.mix * spring.root.y;
    const span = Math.hypot(tipX - x, tipY - y);
    if (span < 1e-8 || !(c.rotate || c.scaleX || c.shearX)) return [a, b, d, e, px, py];

    [spring.tip.x, spring.tip.vx] = integrate(spring.tip.x, spring.tip.vx, 0);
    [spring.tip.y, spring.tip.vy] = integrate(spring.tip.y, spring.tip.vy, 0);
    // Inertia is measured at the moving endpoint. External forces resolve
    // independently into axial strain and torque rather than scaling them
    // by the translation units of the native file.
    const ux = (tipX - x) / span,
        uy = (tipY - y) / span;
    const axial = ux * wind + uy * gravity;
    const torque = ((ux * gravity - uy * wind) * length) / 100;
    [spring.stretch.value, spring.stretch.speed] = integrate(spring.stretch.value, spring.stretch.speed, axial);
    [spring.torque.value, spring.torque.speed] = integrate(spring.torque.value, spring.torque.speed, torque);
    const dx = spring.tip.x - (px - x),
        dy = spring.tip.y - (py - y);
    const along = ux * dx + uy * dy,
        cross = ux * dy - uy * dx;
    const angle = (Math.atan2(cross, span + along) + spring.torque.value) * p.mix;
    const scale = Math.max(0.001, Math.min(32, 1 + (along / span + spring.stretch.value) * c.scaleX * p.mix));
    const transverse = c.scaleY === 'uniform' ? scale : c.scaleY === 'volume' ? 1 / scale : 1;
    const xAngle = angle * (c.rotate + c.shearX),
        yAngle = angle * c.rotate;
    const cosX = Math.cos(xAngle),
        sinX = Math.sin(xAngle),
        cosY = Math.cos(yAngle),
        sinY = Math.sin(yAngle);
    return [
        (a * cosX - d * sinX) * scale,
        (b * cosY - e * sinY) * transverse,
        (a * sinX + d * cosX) * scale,
        (b * sinY + e * cosY) * transverse,
        px,
        py,
    ];
}
