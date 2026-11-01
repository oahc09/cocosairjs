/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Compile-only public consumer. No engine, browser or physics execution.
import { createAirApp, registerBox3DBeforeStep, readBox3DBodyMotion, readBox3DConstraintState } from 'cocosair.js';
import type { AirAppOptions, RigidBody, FixedConstraint, Box3DBeforeStepHandle } from 'cocosair.js';

const options: AirAppOptions = {
    canvas: '#GameCanvas',
    physics: 'box3d',
    physicsOptions: { box3d: { threading: 'single', workerCount: 1, solverSubSteps: 4 } },
};
declare const body: RigidBody;
declare const joint: FixedConstraint;
const handle: Box3DBeforeStepHandle = registerBox3DBeforeStep((context) => {
    const dt: number = context.fixedDt;
    const substeps: 1 | 2 | 4 | 8 = context.solverSubSteps;
    void [dt, substeps];
});
handle.disable();
handle.enable();
handle.dispose();
const motion = readBox3DBodyMotion(body);
const position: number = motion.position.x;
const mass: number = motion.mass;
const enabled: boolean = motion.enabled;
const state: Readonly<Record<string, unknown>> = readBox3DConstraintState(joint);
// @ts-expect-error Copied native observations are readonly.
motion.mass = 1;
// @ts-expect-error Backend names remain a closed public union.
const invalidBackend: AirAppOptions['physics'] = 'box3d-invented';
// @ts-expect-error Solver substeps do not accept arbitrary numbers.
const invalidOptions: AirAppOptions = { physicsOptions: { box3d: { solverSubSteps: 3 } } };

async function consumeCloseReceipt() {
    const app = await createAirApp(options);
    if (!app.close) throw new Error('The selected AirApp handle does not expose close.');
    const receipt = await app.close();
    const release = receipt.physicsPreparation?.moduleRelease;
    if (release) {
        const status: 'NOT_ACQUIRED' | 'BASELINE_CAPTURED' | 'VERIFIED' | 'FAILED' = release.status;
        const worlds: number | undefined = release.terminal?.core.worlds;
        // @ts-expect-error Detached release receipts cannot be rewritten by consumers.
        release.status = 'VERIFIED';
        // @ts-expect-error No private module reference appears on a terminal snapshot.
        void release.terminal?.secretModule;
        void [status, worlds];
    }
}
void [position, mass, enabled, state, invalidBackend, invalidOptions, consumeCloseReceipt];
