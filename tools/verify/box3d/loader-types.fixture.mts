// Declaration consumer only. This file is typechecked, never executed as a physics test.
import {
    createBox3DSTLoader,
    normalizeBox3DSTOptions,
    type Box3DBuildDescriptor,
} from '../../../src/air/physics/box3d/loader/st-loader.mjs';

const descriptor: Box3DBuildDescriptor = {
    manifestSha256: 'hash-placeholder-not-executed',
    facadeSha256: 'hash-placeholder-not-executed',
    identity: {
        coreSha: 'revision-placeholder-not-executed',
        bindingBaseSha: 'revision-placeholder-not-executed',
        schemaSha256: 'hash-placeholder-not-executed',
        patchChainSha256: 'hash-placeholder-not-executed',
        abiVersion: 1,
        variant: 'st-simd',
    },
};
const loader = createBox3DSTLoader(descriptor, { documentBaseUrl: 'https://example.invalid/app/' });
const pending = loader.prepare({ threading: 'single', workerCount: 1, solverSubSteps: 4 });
pending.then(async (lease) => {
    const world = lease.binding.createWorld();
    lease.binding.step(world, 1 / 60, lease.options.solverSubSteps);
    const identity: string = lease.binding.identity.patchChainSha256;
    void identity;
    await lease.dispose();
});
const substeps: 1 | 2 | 4 | 8 = normalizeBox3DSTOptions({ solverSubSteps: 8 }).solverSubSteps;
void substeps;
// @ts-expect-error This increment does not advertise multi-thread loading.
loader.prepare({ threading: 'multi' });
// @ts-expect-error This increment does not advertise automatic fallback.
loader.prepare({ threading: 'auto' });
// @ts-expect-error ST uses exactly one execution thread.
loader.prepare({ workerCount: 2 });
// @ts-expect-error Solver substeps are a discrete reviewed set.
loader.prepare({ solverSubSteps: 3 });
