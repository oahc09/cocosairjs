import { FIXED_DT } from './protocol.mjs';
// SDK world.step uses finiteFloat32 before creating the public before-step context.
export const NATIVE_FIXED_DT = Math.fround(FIXED_DT);
export const SOLVER_SUB_STEPS = 4;
/** @param {Readonly<import('cocosair').Box3DBeforeStepContext>} context */
export function copyStepClock(context) {
    return Object.freeze({
        tickIndex: context.tickIndex,
        attemptId: context.attemptId,
        authoredFixedDt: FIXED_DT,
        expectedNativeFixedDt: NATIVE_FIXED_DT,
        actualNativeFixedDt: context.fixedDt,
        expectedSolverSubSteps: SOLVER_SUB_STEPS,
        actualSolverSubSteps: context.solverSubSteps,
    });
}
/** Exact ABI representation, NOT a widened epsilon. Returns undefined for the synchronous hook contract.
 * @param {Readonly<import('cocosair').Box3DBeforeStepContext>} context */
export function assertStepClock(context) {
    if (context.fixedDt !== NATIVE_FIXED_DT)
        throw new Error(`Unexpected fixed step: expected ${NATIVE_FIXED_DT}, got ${context.fixedDt}`);
    if (context.solverSubSteps !== SOLVER_SUB_STEPS)
        throw new Error(`Unexpected solver substeps: expected ${SOLVER_SUB_STEPS}, got ${context.solverSubSteps}`);
}
