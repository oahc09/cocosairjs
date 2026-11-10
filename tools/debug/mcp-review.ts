/** Bounded development-camera review, not a whole-scene snapshot or rollback system. */
import type { AirStepClock } from 'cocosair';
import type { AgentSessionImpl, FrameCapture, ReviewCaptureOptions } from './agent-session';

export interface ReviewShot {
    label: string;
    position: [number, number, number];
    rotationEuler: [number, number, number];
}
export interface ReviewRequest {
    cameraNodeId: string;
    shots: ReviewShot[];
}

export async function captureControlled(
    session: Pick<AgentSessionImpl, 'captureFrame'>,
    clock: AirStepClock,
    dt?: number,
    review?: ReviewCaptureOptions,
): Promise<FrameCapture> {
    // Starting either operation can throw synchronously. Observe both lifecycles before releasing the lease.
    const capture = Promise.resolve().then(() => session.captureFrame(review));
    const step = Promise.resolve().then(() => clock.step(dt));
    const settled = await Promise.all(
        [capture, step].map((promise) =>
            promise.then(
                (value) => ({ ok: true, value }),
                (error) => ({ ok: false, error }),
            ),
        ),
    );
    for (const result of settled) {
        if (!result.ok) {
            throw (result as { error: unknown }).error;
        }
    }
    return (settled[0] as { value: FrameCapture }).value;
}

let reviewSequence = 0;
export async function reviewCamera(
    session: AgentSessionImpl,
    clock: AirStepClock,
    request: ReviewRequest,
    currentScene: () => boolean,
) {
    const fail = (code: string, message: string) => ({ ok: false as const, error: { code, message } });
    const vector = (value: unknown): value is [number, number, number] =>
        Array.isArray(value) &&
        value.length === 3 &&
        value.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e6);
    if (
        !request ||
        typeof request.cameraNodeId !== 'string' ||
        !Array.isArray(request.shots) ||
        request.shots.length < 1 ||
        request.shots.length > 4 ||
        request.shots.some(
            (shot) =>
                !shot ||
                typeof shot.label !== 'string' ||
                shot.label.length < 1 ||
                shot.label.length > 32 ||
                !vector(shot.position) ||
                !vector(shot.rotationEuler),
        )
    ) {
        return fail(
            'INVALID_ARGUMENT',
            'Review needs a camera node and 1–4 labelled local position/rotationEuler shots.',
        );
    }
    const node = session.inspectNode(request.cameraNodeId);
    if (
        session.inspectScene().cameraCount !== 1 ||
        !node.active ||
        !node.components.some((c) => c.type === 'Camera' && c.enabled)
    ) {
        return fail(
            'UNSUPPORTED_REVIEW',
            'Review requires the only Camera component in the scene to be enabled on this active node.',
        );
    }
    const original = { position: node.local.position.slice(), rotationEuler: node.local.rotationEuler.slice() };
    const prefix = `mcp-review-${++reviewSequence}`;
    const frames: (FrameCapture & {
        index: number;
        label: string;
        requestedCamera: ReviewShot;
    })[] = [];
    let problem: { code: string; message: string } | undefined;
    let restoreProblem: string | undefined;
    let touched = false;
    // Admission is outside try: a failed acquisition must never release another clock owner's lease.
    clock.begin();
    try {
        for (let index = 0; index < request.shots.length; index++) {
            if (!currentScene()) {
                throw new Error('Scene changed during review.');
            }
            const shot = request.shots[index];
            touched = true; // Even a throwing setter may have partially changed the target.
            const result = await session.dispatch({
                requestId: `${prefix}-${index}`,
                action: 'setTransform',
                targetId: request.cameraNodeId,
                params: { space: 'local', position: shot.position, rotationEuler: shot.rotationEuler },
            });
            if (!result.ok) {
                throw Object.assign(new Error(result.error.message), { code: result.error.code });
            }
            const frame = await captureControlled(session, clock, 0, {
                cameraNodeId: request.cameraNodeId,
                position: shot.position,
                rotationEuler: shot.rotationEuler,
            });
            if (!currentScene()) {
                throw new Error('Scene changed while capturing review.');
            }
            frames.push({
                ...frame,
                index: index + 1,
                label: shot.label,
                requestedCamera: shot,
            });
        }
    } catch (error) {
        const value = error as { code?: string; message?: string };
        problem = { code: value.code ?? 'REVIEW_FAILED', message: String(value.message ?? error).slice(0, 2000) };
    } finally {
        if (touched) {
            try {
                if (!currentScene()) {
                    throw new Error('Original scene was replaced.');
                }
                const restored = await session.dispatch({
                    requestId: `${prefix}-restore`,
                    action: 'setTransform',
                    targetId: request.cameraNodeId,
                    params: { space: 'local', ...original },
                });
                if (!restored.ok) {
                    throw new Error(restored.error.message);
                }
                const actual = session.inspectNode(request.cameraNodeId).local;
                if (
                    !original.position.every((n, i) => Math.abs(n - actual.position[i]) <= 1e-5) ||
                    !original.rotationEuler.every((n, i) => Math.abs(n - actual.rotationEuler[i]) <= 1e-3)
                ) {
                    throw new Error('Restored camera transform did not match the original.');
                }
            } catch (error) {
                restoreProblem = String(error).slice(0, 2000);
            }
        }
        try {
            clock.end();
        } catch (error) {
            restoreProblem = `${restoreProblem ?? ''} Clock release failed: ${String(error)}`;
        }
    }
    if (restoreProblem) {
        return { ...fail('RESTORE_FAILED', restoreProblem), cameraRestored: false, closeRequired: true };
    }
    if (problem) {
        return { ok: false as const, error: problem, cameraRestored: true };
    }
    return {
        ok: true as const,
        cameraNodeId: request.cameraNodeId,
        cameraRestored: true,
        originalCamera: original,
        simulation:
            'Zero-delta ticks; callbacks can still change application state. No whole-scene snapshot or rewind.',
        frames,
    };
}
