/** Candidate integration after formal hook/raycast admission. No Node-pose writes or own clock. */
import {
    Camera,
    Collider,
    BoxCollider,
    SphereCollider,
    RigidBody,
    ERigidBodyType,
    Vec3,
    geometry,
    physics,
    isValid,
    registerBox3DBeforeStep,
} from 'cocosair';
import type { Box3DBeforeStepHandle } from 'cocosair';
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
    let selected: { collider: Collider; body: RigidBody; localPoint: Vec3; center: Vec3 } | null = null;
    let pointerId: number | null = null;
    let target: Triple | null = null;
    let planePoint: Triple | null = null;
    let planeNormal: Triple | null = null;
    let hook: Box3DBeforeStepHandle | null = null;
    let disposed = false;
    let enabled = true;
    let lastInputError: string | null = null;
    let lastSubmission: { tickIndex: number; attemptId: number } | null = null;
    const point = new Vec3(),
        com = new Vec3(),
        velocity = new Vec3(),
        angular = new Vec3();
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
            // Explicit simple-shape domain, not a fabricated COM getter for arbitrary compounds.
            if (
                !(collider instanceof BoxCollider || collider instanceof SphereCollider) ||
                collider.node !== body.node ||
                body.node.getComponentsInChildren(Collider).length !== 1 ||
                collider.isTrigger ||
                collider.center.x !== 0 ||
                collider.center.y !== 0 ||
                collider.center.z !== 0
            )
                return;
            const hitPoint = new Vec3(hit.hitPoint.x, hit.hitPoint.y, hit.hitPoint.z);
            const localPoint = new Vec3();
            body.node.inverseTransformPoint(localPoint, hitPoint);
            selected = {
                collider,
                body,
                localPoint,
                center: new Vec3(collider.center.x, collider.center.y, collider.center.z),
            };
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
                // Current EX01 admits one centered symmetric primitive: actual local COM is zero.
                // Reject later geometry roster/center changes rather than using a stale assumption.
                if (
                    drag.body.node.getComponentsInChildren(Collider).length !== 1 ||
                    !Vec3.strictEquals(drag.collider.center, drag.center)
                )
                    throw new Error('Drag geometry changed; cancel before changing the body.');
                Vec3.transformMat4(point, drag.localPoint, drag.body.node.worldMatrix);
                Vec3.transformMat4(com, drag.center, drag.body.node.worldMatrix);
                drag.body.getLinearVelocity(velocity);
                drag.body.getAngularVelocity(angular);
                const command = springForce({
                    target: desired,
                    point,
                    worldCOM: com,
                    linearVelocity: velocity,
                    angularVelocity: angular,
                    mass: drag.body.mass,
                    parameters: config,
                });
                // Exactly one public force submission per invoked fixed-tick hook, never per render frame.
                drag.body.applyForce(
                    new Vec3(command.force.x, command.force.y, command.force.z),
                    new Vec3(command.relativePoint.x, command.relativePoint.y, command.relativePoint.z),
                );
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
            target: target ? { ...target } : null,
            lastSubmission: lastSubmission ? { ...lastSubmission } : null,
            lastSubmissionIsNativeCompletion: false,
            lastInputError,
            scope: 'single centered BoxCollider/SphereCollider only; not compound or arbitrary COM',
            parameters: { ...config },
        }),
    });
}
