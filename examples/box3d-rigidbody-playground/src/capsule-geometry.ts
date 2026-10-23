/** EX01's centered, unit-scale, Y-axis capsule. Visual height includes both hemispheres. */
const radius = 0.42;
const cylinderHeight = 1;
export const CAPSULE_DIMENSIONS = Object.freeze({
    radius,
    cylinderHeight,
    totalHeight: cylinderHeight + 2 * radius,
});

/** Analytic support extent for the configured Y-axis capsule; not a native contact/penetration query. */
export function capsuleVerticalExtent(rotation: Readonly<{ x: number; z: number }>): number {
    const axisY = 1 - 2 * (rotation.x * rotation.x + rotation.z * rotation.z);
    return CAPSULE_DIMENSIONS.radius + (CAPSULE_DIMENSIONS.cylinderHeight / 2) * Math.abs(axisY);
}
