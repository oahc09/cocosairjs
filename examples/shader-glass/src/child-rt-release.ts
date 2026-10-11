/**
 * Sequenced child render-target release, consumed by main.ts's retire path.
 *
 * The native AirRenderTarget API returns TWO independent callbacks:
 *   - bindColor(material, property) → sampler unbind only (material property restore);
 *   - attachCamera(camera) → camera detach (restores the previous target texture and removes
 *     the pipeline-event listeners).
 * Calling the sampler unbind does NOT detach the camera. Retire must run, in order:
 * sampler unbind → camera detach → OBSERVE camera.targetTexture === null → dispose. The
 * observation is returned, never hard-coded, so evidence reflects the real camera state.
 */
export interface ChildTargetPort {
    /** The bindColor() return value: restores the material sampler binding only. */
    unbindSampler(): void;
    /** The attachCamera() return value: restores the camera target and pipeline listeners. */
    detachCamera(): void;
    dispose(): void;
}
export interface ChildCameraPort {
    targetTextureIsNull(): boolean;
}
export interface ChildReleaseObservation {
    childTargetDetached: boolean;
    childDisposed: boolean;
    samplerUnbound: boolean;
}
const released = new WeakSet<object>();
/**
 * Release one child target exactly once, keyed by the owning native target object; a repeat
 * call is a no-op that reports the observed state without re-running side effects (retire
 * idempotence for the child-RT part). Pure orchestration — no engine imports.
 */
export function retireChildTarget(
    owner: object,
    target: ChildTargetPort,
    camera: ChildCameraPort,
): ChildReleaseObservation {
    if (released.has(owner)) {
        return { childTargetDetached: camera.targetTextureIsNull(), childDisposed: true, samplerUnbound: true };
    }
    released.add(owner);
    target.unbindSampler();
    target.detachCamera();
    const childTargetDetached = camera.targetTextureIsNull();
    target.dispose();
    return { childTargetDetached, childDisposed: true, samplerUnbound: true };
}
