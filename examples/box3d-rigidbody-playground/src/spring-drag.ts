/** Candidate integration after formal hook/raycast admission. No Node-pose writes or own clock. */
import {
    Camera,
    Collider,
    RigidBody,
    ERigidBodyType,
    Vec3,
    Quat,
    geometry,
    physics,
    isValid,
    registerBox3DBeforeStep,
    readBox3DBodyMotion,
} from 'cocosair';
import type { Box3DBeforeStepHandle, Box3DBodyMotion } from 'cocosair';
import { copyPoint, springForce } from './drag-spring-math.js';
import type { Triple, SpringParameters } from './drag-spring-math.js';

export function createSpringDrag(
    canvas: HTMLCanvasElement,
    camera: Camera,
    parameters: SpringParameters = {
        stiffness: 180,
        dampingRatio: 0.85,
        maxForce: 600,
        maxStretch: 3,
    },
    callbacks: { onSelect?: (name: string) => void; onError?: (error: unknown) => void } = {},
) {
    const config = Object.freeze({ ...parameters });
    let selected: { collider: Collider; body: RigidBody; localPoint: Vec3 } | null = null;
    let pointerId: number | null = null;
    let target: Triple | null = null;
    let planePoint: Triple | null = null;
    let planeNormal: Triple | null = null;
    let hook: Box3DBeforeStepHandle | null = null;
    let disposed = false;
    let enabled = true;
    let lastInputError: string | null = null;
    let lastSubmission: { tickIndex: number; attemptId: number } | null = null;
    const point = new Vec3();
    let lastMotion: Box3DBodyMotion | null = null;
    let selectedCollider: string | null = null;
    let submissions = 0;
    const lifetime = new AbortController();
    const system = physics.PhysicsSystem.instance;
    const rayFor = (event: PointerEvent): geometry.Ray => {
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) throw new Error('Canvas has no picking extent.');
        const ray = camera.screenPointToRay(
            ((event.clientX - rect.left) * canvas.width) / rect.width,
            ((rect.bottom - event.clientY) * canvas.height) / rect.height,
            new geometry.Ray(),
        );
        Vec3.normalize(ray.d, ray.d);
        return ray;
    };
    const stop = (): void => {
        selected = null;
        target = null;
        planePoint = null;
        planeNormal = null;
        const id = pointerId;
        pointerId = null;
        const previousHook = hook;
        hook = null;
        try {
            previousHook?.dispose();
        } finally {
            if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
        }
        // Do not clear velocity, overwrite poses or add a manufactured release impulse.
        // Stopping future spring input leaves the actual solved linear/angular momentum intact.
    };
    const onDown = (event: PointerEvent): void => {
        if (
            disposed ||
            !enabled ||
            event.button !== 0 ||
            pointerId !== null ||
            !system.enable ||
            !system.autoSimulation
        )
            return;
        try {
            const ray = rayFor(event);
            // The only collision query is the formal PhysicsSystem raycastClosest route.
            if (!system.raycastClosest(ray, 0xffffffff, 100, false)) return;
            const hit = system.raycastClosestResult;
            const collider = hit.collider;
            const body = collider.attachedRigidBody;
            if (
                !body ||
                body.type !== ERigidBodyType.DYNAMIC ||
                !body.enabledInHierarchy ||
                !collider.enabledInHierarchy
            )
                return;
            if (collider.isTrigger) return;
            const motion = readBox3DBodyMotion(body);
            if (!motion.enabled || motion.type !== 2 || motion.massPending) return;
            const hitPoint = new Vec3(hit.hitPoint.x, hit.hitPoint.y, hit.hitPoint.z);
            // Physics geometry is already scaled in native local space. Do NOT apply Node scale twice.
            const localPoint = Vec3.subtract(new Vec3(), hitPoint, motion.position);
            const inverseRotation = new Quat();
            Quat.conjugate(inverseRotation, motion.rotation);
            Vec3.transformQuat(localPoint, localPoint, inverseRotation);
            selected = { collider, body, localPoint };
            selectedCollider = collider.constructor.name;
            lastMotion = motion;
            target = copyPoint(hitPoint);
            planePoint = copyPoint(hitPoint);
            planeNormal = copyPoint(ray.d);
            hook = registerBox3DBeforeStep((context) => {
                const drag = selected,
                    desired = target;
                if (
                    !drag ||
                    !desired ||
                    !isValid(drag.body.node, true) ||
                    !drag.body.enabledInHierarchy ||
                    !drag.collider.enabledInHierarchy ||
                    drag.body.type !== ERigidBodyType.DYNAMIC
                )
                    return;
                const motion = readBox3DBodyMotion(drag.body);
                if (!motion.enabled || motion.type !== 2 || motion.massPending) return;
                Vec3.transformQuat(point, drag.localPoint, motion.rotation);
                Vec3.add(point, point, motion.position);
                lastMotion = motion;
                const command = springForce({
                    target: desired,
                    point,
                    worldCOM: motion.worldCOM,
                    linearVelocity: motion.linearVelocity,
                    angularVelocity: motion.angularVelocity,
                    mass: motion.mass,
                    parameters: config,
                });
                // Exactly one public force submission per invoked fixed-tick hook, never per render frame.
                drag.body.applyForce(
                    new Vec3(command.force.x, command.force.y, command.force.z),
                    new Vec3(command.relativePoint.x, command.relativePoint.y, command.relativePoint.z),
                );
                submissions++;
                lastSubmission = { tickIndex: context.tickIndex, attemptId: context.attemptId };
            });
            lastInputError = null;
            callbacks.onSelect?.(body.node.name);
            pointerId = event.pointerId;
            canvas.setPointerCapture(event.pointerId);
            event.preventDefault();
        } catch (error) {
            stop();
            lastInputError = String(error);
            callbacks.onError?.(error);
        }
    };
    const onMove = (event: PointerEvent): void => {
        if (event.pointerId !== pointerId || !planePoint || !planeNormal) return;
        const ray = rayFor(event),
            n = planeNormal,
            p = planePoint;
        const denominator = n.x * ray.d.x + n.y * ray.d.y + n.z * ray.d.z;
        if (Math.abs(denominator) < 1e-6) return;
        const t = (n.x * (p.x - ray.o.x) + n.y * (p.y - ray.o.y) + n.z * (p.z - ray.o.z)) / denominator;
        if (!Number.isFinite(t) || t < 0 || t > 100) return;
        // Plane projection places the cursor target only; it is not a collision/raycast substitute.
        target = copyPoint({ x: ray.o.x + ray.d.x * t, y: ray.o.y + ray.d.y * t, z: ray.o.z + ray.d.z * t });
    };
    const onUp = (event: PointerEvent): void => {
        if (event.pointerId === pointerId) stop();
    };
    canvas.addEventListener('pointerdown', onDown, { signal: lifetime.signal });
    canvas.addEventListener('pointermove', onMove, { signal: lifetime.signal });
    canvas.addEventListener('pointerup', onUp, { signal: lifetime.signal });
    canvas.addEventListener('pointercancel', onUp, { signal: lifetime.signal });
    canvas.addEventListener('lostpointercapture', onUp, { signal: lifetime.signal });
    window.addEventListener('blur', stop, { signal: lifetime.signal });
    window.addEventListener(
        'keydown',
        (event) => {
            if (event.key === 'Escape') stop();
        },
        { signal: lifetime.signal },
    );
    document.addEventListener(
        'visibilitychange',
        () => {
            if (document.hidden) stop();
        },
        { signal: lifetime.signal },
    );
    return Object.freeze({
        cancel: stop, // Call BEFORE every EX01 pause/reset/body/material/scene mutation.
        setEnabled(next: boolean) {
            if (disposed) return;
            enabled = next;
            if (!enabled) stop();
        },
        dispose() {
            if (disposed) return;
            stop();
            lifetime.abort();
            disposed = true;
        },
        snapshot: () => ({
            enabled: enabled && !disposed,
            disposed,
            active: pointerId !== null,
            selected: selected?.body.node.name ?? null,
            selectedCollider: selected ? selectedCollider : null,
            nativeMotion: lastMotion,
            submissions,
            target: target ? { ...target } : null,
            lastSubmission: lastSubmission ? { ...lastSubmission } : null,
            lastSubmissionIsNativeCompletion: false,
            lastInputError,
            scope: 'owned dynamic Box/Sphere/Capsule/Hull and same-body compounds; actual native COM and origin frame; not a joint',
            parameters: { ...config },
        }),
    });
}
