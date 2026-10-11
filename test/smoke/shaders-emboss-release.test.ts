/**
 * E05 child-RT release sequencing (NODE_CONTRACT). Executes the PRODUCTION helper consumed by
 * main.ts (src/child-rt-release.ts) against fake camera/target ports whose semantics mirror the
 * native AirRenderTarget API: bindColor's callback restores only the sampler; attachCamera's
 * callback is what restores the camera target. No engine import, no string matching.
 */
import { retireChildTarget } from '../../examples/shader-emboss/src/child-rt-release';

function makeCamera() {
    const state = { attached: true };
    return {
        state,
        port: { targetTextureIsNull: () => !state.attached },
    };
}
function makeTarget(cameraState: { attached: boolean }) {
    const calls: string[] = [];
    return {
        calls,
        owner: {},
        port: {
            unbindSampler: () => calls.push('unbindSampler'),
            detachCamera: () => {
                calls.push('detachCamera');
                cameraState.attached = false;
            },
            dispose: () => calls.push('dispose'),
        },
    };
}

describe('E05 child-RT release sequencing (production helper)', () => {
    test('full sequence observes the camera detached and disposes after the observation', () => {
        const camera = makeCamera(),
            target = makeTarget(camera.state);
        const result = retireChildTarget(target.owner, target.port, camera.port);
        expect(result).toEqual({ childTargetDetached: true, childDisposed: true, samplerUnbound: true });
        expect(target.calls).toEqual(['unbindSampler', 'detachCamera', 'dispose']);
    });
    test('bindColor alone does NOT detach the camera (the attempt-1 failure mode)', () => {
        const camera = makeCamera(),
            target = makeTarget(camera.state);
        // Reproduce the buggy ordering: sampler unbind, then observe WITHOUT calling detach.
        target.port.unbindSampler();
        expect(camera.port.targetTextureIsNull()).toBe(false);
        const result = retireChildTarget(target.owner, target.port, camera.port);
        expect(result.childTargetDetached).toBe(true);
        expect(target.calls.filter((c) => c === 'unbindSampler')).toHaveLength(2);
    });
    test('a camera that stays attached is reported detached=false, never a constant', () => {
        const camera = makeCamera(),
            target = makeTarget(camera.state);
        // A defective detach callback that fails to restore the target texture.
        const defective = {
            unbindSampler: target.port.unbindSampler,
            detachCamera: () => target.calls.push('detachCamera'),
            dispose: target.port.dispose,
        };
        const result = retireChildTarget(target.owner, defective, camera.port);
        expect(result.childTargetDetached).toBe(false);
    });
    test('repeat release is idempotent: no re-dispose, observed state reported', () => {
        const camera = makeCamera(),
            target = makeTarget(camera.state);
        retireChildTarget(target.owner, target.port, camera.port);
        const before = target.calls.length;
        const again = retireChildTarget(target.owner, target.port, camera.port);
        expect(again).toEqual({ childTargetDetached: true, childDisposed: true, samplerUnbound: true });
        expect(target.calls.length).toBe(before);
        expect(target.calls.filter((c) => c === 'dispose')).toHaveLength(1);
    });
    test('distinct owners are released independently', () => {
        const a = makeCamera(),
            b = makeCamera(),
            ta = makeTarget(a.state),
            tb = makeTarget(b.state);
        retireChildTarget(ta.owner, ta.port, a.port);
        expect(a.port.targetTextureIsNull()).toBe(true);
        expect(b.port.targetTextureIsNull()).toBe(false);
        retireChildTarget(tb.owner, tb.port, b.port);
        expect(b.port.targetTextureIsNull()).toBe(true);
    });
});
