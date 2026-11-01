/** Pure policy, not a physics simulator or runtime acceptance oracle. */
export const FIXED_DT = 1 / 60,
  SUBSTEPS = 4,
  WINDOW_TICKS = 600;
export function clock(c) {
  return Object.freeze({
    tickIndex: c.tickIndex,
    attemptId: c.attemptId,
    authoredFixedDt: FIXED_DT,
    expectedNativeFixedDt: Math.fround(FIXED_DT),
    actualNativeFixedDt: c.fixedDt,
    expectedSolverSubSteps: SUBSTEPS,
    actualSolverSubSteps: c.solverSubSteps,
  });
}
export function assertClock(row) {
  if (
    row.actualNativeFixedDt !== Math.fround(FIXED_DT) ||
    row.actualSolverSubSteps !== SUBSTEPS
  )
    throw Error("Unexpected native step contract");
}
export function pinPositions() {
  return Array.from({ length: 4 }, (_, row) =>
    Array.from({ length: row + 1 }, (_, column) => ({
      x: (column - row / 2) * 0.85,
      y: 0.61,
      z: -2 - row * 0.8,
    })),
  ).flat();
}
export function down(rotation) {
  const { x, y, z, w } = rotation;
  if (
    ![x, y, z, w].every(Number.isFinite) ||
    Math.abs(Math.hypot(x, y, z, w) - 1) > 1e-3
  )
    throw Error("Invalid native orientation");
  // Dot(rotated local +Y, world +Y). Fallen iff tilt >60°, including upside-down.
  return 1 - 2 * (x * x + z * z) < 0.5;
}
export function assertLive(actor, generation) {
  if (!actor.alive || actor.generation !== generation)
    throw Error("Retired or stale actor");
}
export function massChoice(value) {
  const mass = Number(value);
  if (![0.5, 1, 2].includes(mass)) throw Error("Invalid mass");
  return mass;
}
export function targetPose(step) {
  const t = step * Math.fround(FIXED_DT),
    angle = 0.12 * Math.sin(t * 0.6);
  return {
    position: { x: 0.35 * Math.sin(t * 0.8), y: -0.15, z: -2.8 },
    rotation: { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) },
  };
}
export class IdleQueue {
  tail = Promise.resolve();
  enqueue(work) {
    const result = this.tail.then(work);
    this.tail = result.catch(() => {});
    return result;
  }
}
