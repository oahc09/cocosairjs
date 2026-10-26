/*
Copyright (c) 2026-2027 oahc09@gmail.com

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

/** Internal foundation API, not a public Cocos adapter or a completed M1 gate. */
export interface Box3DIdentity {
    coreSha: string;
    bindingBaseSha: string;
    patchChainSha256: string;
    abiVersion: 1;
    variant: 'st-simd';
    schemaSha256: string;
}
export interface Box3DWorld {
    readonly id: number;
}
export interface Box3DId {
    readonly low: number;
    readonly high: number;
}
/** Owned cache lease, branded by exact facade instance. Numeric bits are not authority. */
export interface Box3DStaticMeshLease extends Box3DId {}
export interface Box3DStaticMeshState {
    readonly cacheLeases: number;
    readonly shapeBorrows: number;
    readonly vertexCount: number;
    readonly triangleCount: number;
    readonly coreMeshBytes: number;
    readonly worldId: number;
}
export interface Box3DBodyOptions {
    type?: 0 | 1 | 2;
    position?: ArrayLike<number>;
    rotation?: ArrayLike<number>;
    linearVelocity?: ArrayLike<number>;
    angularVelocity?: ArrayLike<number>;
    linearDamping?: number;
    angularDamping?: number;
    gravityScale?: number;
    enableSleep?: boolean;
}
export interface Box3DFixedConfiguration {
    readonly collideConnected: boolean;
    /** Nonnegative finite float32 Newtons and Newton-metres, not impulse. */
    readonly breakForce: number;
    readonly breakTorque: number;
}
export interface Box3DFixedState extends Box3DFixedConfiguration {
    readonly kind: 'fixed';
    readonly bodyA: Readonly<Box3DId>;
    readonly bodyB: Readonly<Box3DId>;
    readonly frameA: readonly number[];
    readonly frameB: readonly number[];
    readonly force: readonly number[];
    readonly torque: readonly number[];
    readonly linearSeparation: number;
    readonly angularSeparation: number;
}
/** Native spherical joint with exactly three unconstrained rotational DOFs. */
export interface Box3DPointToPointGeometry {
    readonly pivotA: ArrayLike<number>;
    readonly pivotB: ArrayLike<number>;
    readonly autoPivotB: boolean;
}
export interface Box3DPointToPointConfiguration {
    readonly collideConnected: boolean;
}
export interface Box3DPointToPointState extends Box3DPointToPointConfiguration {
    readonly kind: 'point-to-point';
    readonly bodyA: Readonly<Box3DId>;
    readonly bodyB: Readonly<Box3DId>;
    readonly frameA: readonly number[];
    readonly frameB: readonly number[];
    readonly springEnabled: false;
    readonly motorEnabled: false;
    readonly coneLimitEnabled: false;
    readonly twistLimitEnabled: false;
    readonly linearSeparation: number;
}
export interface Box3DHingeGeometry {
    readonly pivotA: ArrayLike<number>;
    readonly pivotB: ArrayLike<number>;
    readonly axisA: ArrayLike<number>;
    readonly autoPivotB: boolean;
}
export interface Box3DHingeConfiguration {
    readonly collideConnected: boolean;
    readonly limitEnabled: boolean;
    readonly lowerAngleRadians: number;
    readonly upperAngleRadians: number;
    readonly motorEnabled: boolean;
    /** Native B-relative-A radians per second; public component converts sign/units. */
    readonly motorSpeedRadians: number;
    readonly maxMotorTorque: number;
}
export interface Box3DHingeState extends Box3DHingeConfiguration {
    readonly kind: 'hinge';
    readonly bodyA: Readonly<Box3DId>;
    readonly bodyB: Readonly<Box3DId>;
    readonly frameA: readonly number[];
    readonly frameB: readonly number[];
    readonly angleRadians: number;
    readonly motorTorque: number;
    readonly force: readonly number[];
    /** World-space angular constraint couple on B, N.m, CURRENT SOLVER CACHE.
     * Excludes the linear constraint force's r x F about the body COM.
     * Uses latest world inv_h; configuration can clear individual terms and sleeping
     * caches may be rescaled without a new solve. Not a current-load sensor,
     * outer-step average, historical frozen sample or break-threshold input. */
    readonly torque: readonly number[];
    readonly torqueSemantics: Readonly<{
        quantity: 'angular-constraint-couple';
        coordinates: 'world';
        actsOn: 'B';
        source: 'current-solver-impulse-cache';
        timeBasis: 'latest-world-inverse-substep';
        freshness: 'not-tracked';
        usableForLoadOrBreak: false;
    }>;
    readonly linearSeparation: number;
    readonly axisAlignmentRadians: number;
}
export interface Box3DJointThresholdEvent {
    readonly joint: Readonly<Box3DId>;
    readonly valid: boolean;
}
export interface Box3DFoundation {
    createPointToPointJoint(
        world: Box3DWorld,
        bodyA: Box3DId,
        bodyB: Box3DId,
        geometry: Box3DPointToPointGeometry,
        configuration: Box3DPointToPointConfiguration,
    ): Box3DId;
    pointToPointJointState(world: Box3DWorld, joint: Box3DId): Readonly<Box3DPointToPointState>;
    configurePointToPointJoint(
        world: Box3DWorld,
        joint: Box3DId,
        configuration: Box3DPointToPointConfiguration,
    ): Readonly<Box3DPointToPointState>;
    createHingeJoint(
        world: Box3DWorld,
        bodyA: Box3DId,
        bodyB: Box3DId,
        geometry: Box3DHingeGeometry,
        configuration: Box3DHingeConfiguration,
    ): Box3DId;
    hingeJointState(world: Box3DWorld, joint: Box3DId): Readonly<Box3DHingeState>;
    configureHingeJoint(
        world: Box3DWorld,
        joint: Box3DId,
        configuration: Box3DHingeConfiguration,
    ): Readonly<Box3DHingeState>;
    createFixedJoint(
        world: Box3DWorld,
        bodyA: Box3DId,
        bodyB: Box3DId,
        configuration: Box3DFixedConfiguration,
    ): Box3DId;
    fixedJointState(world: Box3DWorld, joint: Box3DId): Readonly<Box3DFixedState>;
    configureFixedJoint(
        world: Box3DWorld,
        joint: Box3DId,
        configuration: Box3DFixedConfiguration,
    ): Readonly<Box3DFixedState>;
    destroyJoint(world: Box3DWorld, joint: Box3DId): void;
    readonly identity: Readonly<Box3DIdentity>;
    /** Pure native admission. Does not reserve a plan, consume commands or invalidate snapshots. */
    validateMotionBatch(world: Box3DWorld, records: readonly Box3DMotionRecord[], dt: number, substeps: number): void;
    /** Revalidates the entire batch before the first write. Unknown native traps are not rolled back. */
    applyMotionBatch(
        world: Box3DWorld,
        records: readonly Box3DMotionRecord[],
        dt: number,
        substeps: number,
    ): readonly Box3DMotionResult[];
    /** Pure complete-stream admission. Never reserves a plan or consumes an AIR queue. */
    validateCommandBatch(world: Box3DWorld, commands: readonly Box3DCommand[], dt: number, substeps: number): void;
    /** Replans all operations. A post-commit copy error is committed, not rolled back. */
    applyCommandBatch(
        world: Box3DWorld,
        commands: readonly Box3DCommand[],
        dt: number,
        substeps: number,
    ): Box3DCommandBatchResult;
    createWorld(gravity?: ArrayLike<number>): Box3DWorld;
    destroyWorld(world: Box3DWorld): void;
    step(world: Box3DWorld, dt?: number, substeps?: number): void;
    setGravity(world: Box3DWorld, gravity: readonly number[]): void;
    getGravity(world: Box3DWorld): readonly number[];
    setSleepingEnabled(world: Box3DWorld, enabled: boolean): void;
    isSleepingEnabled(world: Box3DWorld): boolean;
    getShapeFilter(world: Box3DWorld, shape: Box3DId): Readonly<Box3DShapeFilter>;
    setShapeFilter(world: Box3DWorld, shape: Box3DId, filter: Box3DShapeFilter): Readonly<Box3DShapeFilter>;
    setShapeFilters(
        world: Box3DWorld,
        shapes: readonly Box3DId[],
        filter: Box3DShapeFilter,
    ): readonly Readonly<Box3DShapeFilter>[];
    getShapeMaterial(world: Box3DWorld, shape: Box3DId): Box3DSurfaceMaterial;
    setShapeMaterial(world: Box3DWorld, shape: Box3DId, material: Box3DSurfaceMaterial): void;
    stepDiagnostics(world: Box3DWorld): Box3DNativeStepDiagnostics;
    debugSnapshot(world: Box3DWorld, flags: number, jointScale: number): Box3DDebugSnapshot;
    /** Facade-owned native bridge allocations only, excluding core/JS/WASM heap capacity. */
    bridgeMemory(world?: Box3DWorld): Box3DBridgeMemory;
    createBody(world: Box3DWorld, options?: Box3DBodyOptions): Box3DId;
    /** New ABI-1 controls require both facade world and body capabilities. */
    bodyState(world: Box3DWorld, body: Box3DId): Box3DBodyState;
    setBodyType(world: Box3DWorld, body: Box3DId, type: 0 | 1 | 2): Box3DBodyState;
    setBodyEnabled(world: Box3DWorld, body: Box3DId, enabled: boolean): Box3DBodyState;
    setBodyMass(world: Box3DWorld, body: Box3DId, mass: number): Box3DBodyState;
    setBodyDamping(world: Box3DWorld, body: Box3DId, linear: number, angular: number): Box3DBodyState;
    setBodyGravityScale(world: Box3DWorld, body: Box3DId, scale: number): Box3DBodyState;
    setBodySleepEnabled(world: Box3DWorld, body: Box3DId, enabled: boolean): Box3DBodyState;
    setBodySleepThreshold(world: Box3DWorld, body: Box3DId, threshold: number): Box3DBodyState;
    setBodyAwake(world: Box3DWorld, body: Box3DId, awake: boolean): Box3DBodyState;
    setBodyCCD(world: Box3DWorld, body: Box3DId, enabled: boolean): Box3DBodyState;
    setBodyMotionFactors(
        world: Box3DWorld,
        body: Box3DId,
        linear: ArrayLike<number>,
        angular: ArrayLike<number>,
    ): Box3DBodyState;
    setBodyLinearVelocity(world: Box3DWorld, body: Box3DId, velocity: ArrayLike<number>): Box3DBodyState;
    setBodyAngularVelocity(world: Box3DWorld, body: Box3DId, velocity: ArrayLike<number>): Box3DBodyState;
    applyBodyForce(
        world: Box3DWorld,
        body: Box3DId,
        force: ArrayLike<number>,
        offset?: ArrayLike<number>,
        space?: 'world' | 'local',
    ): Box3DBodyState;
    applyBodyImpulse(
        world: Box3DWorld,
        body: Box3DId,
        impulse: ArrayLike<number>,
        offset?: ArrayLike<number>,
        space?: 'world' | 'local',
    ): Box3DBodyState;
    applyBodyTorque(
        world: Box3DWorld,
        body: Box3DId,
        torque: ArrayLike<number>,
        space?: 'world' | 'local',
    ): Box3DBodyState;
    applyBodyAngularImpulse(
        world: Box3DWorld,
        body: Box3DId,
        impulse: ArrayLike<number>,
        space?: 'world' | 'local',
    ): Box3DBodyState;
    clearBodyForces(world: Box3DWorld, body: Box3DId): Box3DBodyState;
    clearBodyVelocity(world: Box3DWorld, body: Box3DId): Box3DBodyState;
    clearBodyState(world: Box3DWorld, body: Box3DId): Box3DBodyState;
    createOffsetBox(
        body: Box3DId,
        center: ArrayLike<number>,
        halfExtents: ArrayLike<number>,
        rotation?: ArrayLike<number>,
        density?: number,
        sensor?: boolean,
    ): Box3DId;
    destroyBody(body: Box3DId): void;
    bodySnapshot(body: Box3DId): Float32Array;
    /** One native call for the entire validated batch, ten copied floats per body. */
    bodyTransforms(world: Box3DWorld, bodies: readonly Box3DId[]): Float32Array;
    readStepSnapshot(world: Box3DWorld): Box3DStepSnapshot;
    readContactSnapshot(contact: Box3DContactHandle): Box3DContactSnapshot;
    /** Generation-epoch cached geometry only; explicitly rejects unsupported families/basis. */
    contactWorldPoints(contact: Box3DContactHandle): Box3DContactGeometry;
    geometryCounters(world: Box3DWorld): Box3DGeometryCounters;
    configureShapeEvents(shape: Box3DId, options: { sensor?: boolean; contact?: boolean; hit?: boolean }): void;
    createOffsetSphere(
        body: Box3DId,
        center: ArrayLike<number>,
        radius: number,
        density?: number,
        sensor?: boolean,
    ): Box3DId;
    /** Axis-aligned native capsule in body-local coordinates; zero halfSegment is a native sphere. */
    createOffsetCapsule(
        body: Box3DId,
        center: ArrayLike<number>,
        radius: number,
        halfSegment: number,
        direction: number,
        density?: number,
        sensor?: boolean,
    ): Box3DId;
    /** Actual temporary native cook/topology validation without creating body or shape. */
    validateHull(world: Box3DWorld, positions: ArrayLike<number>): void;
    /** Native convex envelope of all copied body-local XYZ points; no box or reduced-hull fallback. */
    cookStaticMesh(world: Box3DWorld, positions: ArrayLike<number>, indices: ArrayLike<number>): Box3DStaticMeshLease;
    retainStaticMesh(resource: Box3DStaticMeshLease): Box3DStaticMeshLease;
    releaseStaticMesh(resource: Box3DStaticMeshLease): void;
    /** ST module cumulative successful cook/completed destroy calls, including rollback.
     * Not allocator free counts. Exclusive diagnostic deltas; no ownership capability. */
    meshLifetimeCounters(): Readonly<{ cooks: bigint; destroys: bigint }>;
    staticMeshState(resource: Box3DStaticMeshLease): Readonly<Box3DStaticMeshState>;
    createStaticMeshShape(body: Box3DId, resource: Box3DStaticMeshLease): Box3DId;
    staticMeshSourceFace(shape: Box3DId, cookedTriangle: number): number;
    createHull(body: Box3DId, positions: ArrayLike<number>, density?: number, sensor?: boolean): Box3DId;
    setLinearVelocity(body: Box3DId, velocity: ArrayLike<number>): void;
    applyCenterImpulse(body: Box3DId, impulse: ArrayLike<number>): void;
    createSphere(body: Box3DId, radius: number, density?: number): Box3DId;
    createBox(body: Box3DId, halfExtents: ArrayLike<number>, density?: number): Box3DId;
    destroyShape(shape: Box3DId): void;
    /** Unordered copied hits. Adapter deduplicates/sorts by logical collider and selects closest from these same hits. */
    rayAllRaw(
        world: Box3DWorld,
        origin: ArrayLike<number>,
        translation: ArrayLike<number>,
        options: Readonly<Box3DRayQueryOptions>,
    ): readonly Readonly<Box3DRawRayHit>[];
    readQueryEpoch(world: Box3DWorld): Readonly<{ stepIndex: number; mutationRevision: number }>;
    shapeAllRaw(
        world: Box3DWorld,
        origin: ArrayLike<number>,
        translation: ArrayLike<number>,
        proxy: Box3DQueryProxy,
        options: Readonly<Box3DRayQueryOptions>,
    ): readonly Readonly<Box3DRawRayHit>[];
    overlapAllRaw(
        world: Box3DWorld,
        origin: ArrayLike<number>,
        proxy: Box3DQueryProxy,
        options: Readonly<Box3DRayQueryOptions>,
    ): readonly Readonly<{ shape: Readonly<Box3DId> }>[];
    rayClosest(
        world: Box3DWorld,
        origin: ArrayLike<number>,
        translation: ArrayLike<number>,
    ): { data: Float32Array; shape: Box3DId | null };
    memoryDiagnostics(world: Box3DWorld): Readonly<Box3DMemoryDiagnostics>;
    worldCounts(world: Box3DWorld): { counts: Uint32Array; liveBytes: bigint };
    liveBytes(): bigint;
    dispose(): void;
}
export declare function createBox3DBinding(module: unknown, expected: Box3DIdentity): Box3DFoundation;

/** Copied observational IDs are not ownership capabilities. */
export interface Box3DContactHandle {
    readonly contactId: readonly number[];
}
export interface Box3DManifoldPoint {
    readonly anchorA: readonly number[];
    readonly anchorB: readonly number[];
    readonly separation: number;
    readonly normalImpulse: number;
    readonly totalNormalImpulse: number;
    readonly normalVelocity: number;
    readonly baseSeparation: number;
    readonly featureId: number;
    readonly triangleIndex: number;
    readonly persisted: boolean;
}
export interface Box3DManifoldSnapshot {
    readonly normalAtoB: readonly number[];
    readonly twistImpulse: number;
    readonly frictionImpulse: readonly number[];
    readonly rollingImpulse: readonly number[];
    readonly points: readonly Box3DManifoldPoint[];
}
export interface Box3DContactSnapshot {
    readonly contactId: readonly number[];
    readonly handle: Box3DContactHandle;
    readonly shapeA: Readonly<Box3DId>;
    readonly shapeB: Readonly<Box3DId>;
    readonly bodyA: Readonly<Box3DId>;
    readonly bodyB: Readonly<Box3DId>;
    readonly awakeA: boolean;
    readonly awakeB: boolean;
    readonly prePoseA: readonly number[] | null;
    readonly prePoseB: readonly number[] | null;
    readonly postPoseA: readonly number[];
    readonly postPoseB: readonly number[];
    readonly manifolds: readonly Box3DManifoldSnapshot[];
    readonly anchorEpoch: 'UNRESOLVED_CACHED_NATIVE';
    readonly worldPointStatus: 'UNSUPPORTED_SNAPSHOT_EPOCH';
    /** Separate additive extension; the preceding g raw wire remains unmodified. */
    readonly geometry:
        Box3DContactGeometry | { readonly status: 'GEOMETRY_UNAVAILABLE' | 'UNSUPPORTED_GEOMETRY_FAMILY' };
}
export interface Box3DContactEvent {
    readonly shapeA: Readonly<Box3DId>;
    readonly shapeB: Readonly<Box3DId>;
    readonly contactId: readonly number[];
    readonly validFlags: number;
}
export interface Box3DContactHitEvent extends Box3DContactEvent {
    readonly nativeHitPoint: readonly number[];
    readonly normalAtoB: readonly number[];
    readonly approachSpeed: number;
    readonly userMaterialA: Readonly<Box3DId>;
    readonly userMaterialB: Readonly<Box3DId>;
    readonly pointSemantics: 'NATIVE_HIT_EVENT_NOT_GENERAL_CONTACT_WORLD_POINT';
}
export interface Box3DSensorEvent {
    readonly sensor: Readonly<Box3DId>;
    readonly visitor: Readonly<Box3DId>;
    readonly validFlags: number;
}
export interface Box3DBodyMoveEvent {
    readonly body: Readonly<Box3DId>;
    readonly valid: boolean;
    readonly fellAsleep: boolean;
    readonly transform: readonly number[];
}
export interface Box3DBodyPoseRow {
    readonly body: Readonly<Box3DId>;
    /** Origin.xyz, rotation.xyzw, COM.xyz; not an asserted anchor epoch. */
    readonly pose: readonly number[];
}
export interface Box3DStepSnapshot {
    readonly jointThresholdEvents: readonly Box3DJointThresholdEvent[];
    readonly worldId: number;
    readonly stepIndex: number;
    readonly bodyMoves: readonly Box3DBodyMoveEvent[];
    readonly contactBegins: readonly Box3DContactEvent[];
    readonly contactEnds: readonly Box3DContactEvent[];
    readonly contactHits: readonly Box3DContactHitEvent[];
    readonly sensorBegins: readonly Box3DSensorEvent[];
    readonly sensorEnds: readonly Box3DSensorEvent[];
    readonly bodyPosesBefore: readonly Box3DBodyPoseRow[];
    readonly bodyPosesAfter: readonly Box3DBodyPoseRow[];
    readonly contactsOfOwnedBodies: readonly Box3DContactSnapshot[];
    readonly geometryCounters: Box3DGeometryCounters;
}

export interface Box3DGeometryCounters {
    readonly awakeContactCount: number;
    readonly recycledContactCount: number;
    readonly distanceIterations: number;
    readonly pushBackIterations: number;
    readonly rootIterations: number;
}
export interface Box3DContactGeometry {
    readonly status: 'AVAILABLE';
    readonly source: 'CACHED_MANIFOLD_GENERATION';
    readonly contactId: readonly number[];
    readonly shapeA: Readonly<Box3DId>;
    readonly shapeB: Readonly<Box3DId>;
    readonly bodyA: Readonly<Box3DId>;
    readonly bodyB: Readonly<Box3DId>;
    readonly geometryRevision: Readonly<Box3DId>;
    readonly generatedAfterStep: Readonly<Box3DId>;
    readonly generationPoseA: readonly number[];
    readonly generationPoseB: readonly number[];
    readonly readStepIndex: number;
    readonly readMutationRevision: number;
    readonly manifolds: readonly {
        readonly normalAtoB: readonly number[];
        readonly normalBtoA: readonly number[];
        readonly localNormalAtoB_A: readonly number[];
        readonly localNormalAtoB_B: readonly number[];
        readonly points: readonly {
            readonly worldPointA: readonly number[];
            readonly worldPointB: readonly number[];
            readonly localPointA: readonly number[];
            readonly localPointB: readonly number[];
        }[];
    }[];
}

export interface Box3DSurfaceMaterial {
    readonly friction: number;
    readonly restitution: number;
}
export interface Box3DNativeStepDiagnostics {
    readonly nativeStepIndex: number;
    readonly nativeCompleted: boolean;
    readonly snapshotAvailable: boolean;
}
export type Box3DDebugPrimitive =
    | Readonly<{ kind: 'line'; from: readonly number[]; to: readonly number[]; color: number }>
    | Readonly<{ kind: 'bounds'; lower: readonly number[]; upper: readonly number[]; color: number }>;
export interface Box3DDebugSnapshot {
    readonly primitives: readonly Box3DDebugPrimitive[];
    readonly flags: number;
    readonly jointScale: number;
    readonly supportedFlags: number;
}
export interface Box3DBridgeMemory {
    readonly liveBytes: bigint;
    readonly liveAllocations: number;
    readonly shapeHandles: number;
    readonly primitiveCapacity: number;
    readonly capturedPrimitives: number;
}

/** Copied native observations plus facade-owned requestedMass, never borrowed memory. */
/** Optional only on reviewed body/filter mutation errors. Missing means unknown/unreviewed. */
export interface Box3DMutationFailure extends Error {
    readonly code: string;
    readonly mutationOutcome?: 'not-mutated' | 'committed';
    /** Present only for the additive unified command native return protocol. */
    readonly nativeStatus?: number;
}
export interface Box3DShapeFilter {
    readonly group: number;
    readonly mask: number;
}
export interface Box3DBodyState {
    readonly type: 0 | 1 | 2;
    readonly enabled: boolean;
    readonly awake: boolean;
    readonly sleeping: boolean;
    readonly sleepy: boolean;
    readonly sleepEnabled: boolean;
    readonly ccd: boolean;
    readonly sleepTime: number;
    readonly sleepVelocity: number;
    readonly sleepThreshold: number;
    readonly linearDamping: number;
    readonly angularDamping: number;
    readonly gravityScale: number;
    readonly linearVelocity: readonly number[];
    readonly angularVelocity: readonly number[];
    readonly force: readonly number[];
    readonly torque: readonly number[];
    readonly linearFactor: readonly number[];
    readonly angularFactor: readonly number[];
    readonly mass: number;
    readonly localCenter: readonly number[];
    /** Column-major inertia about COM. Fully locked rotation has zero native inertia. */
    readonly inertia: readonly number[];
    readonly worldCenter: readonly number[];
    readonly requestedMass: number | null;
    readonly massPending: boolean;
    readonly sensorMassFallback: boolean;
}

export interface Box3DOriginPose {
    readonly position: readonly number[];
    readonly rotation: readonly number[];
}
export interface Box3DMotionReset {
    readonly pose: Box3DOriginPose;
    /** Defaults teleport; scene is internal static-body synchronization only. */
    readonly mode?: 'teleport' | 'scene';
    readonly preserveVelocity?: boolean;
    readonly wake?: boolean;
}
export type Box3DMotionIntent = Readonly<{ kind: 'target'; pose: Box3DOriginPose }> | Readonly<{ kind: 'clear' }>;
export interface Box3DMotionRecord {
    readonly body: Box3DId;
    readonly reset?: Box3DMotionReset;
    readonly intent?: Box3DMotionIntent;
}
export interface Box3DMotionResult {
    readonly body: Box3DId;
    /** Copied normalized request, not an observed arrival pose. */
    readonly requested: Readonly<{
        reset: Readonly<Required<Box3DMotionReset>> | null;
        intent: Box3DMotionIntent | null;
    }>;
    readonly pose: Box3DOriginPose;
    readonly worldCenter: readonly number[];
    readonly state: Box3DBodyState;
    /** Actual native velocity immediately after the operation, before the fixed step. */
    readonly applied: Readonly<{ linearVelocity: readonly number[]; angularVelocity: readonly number[] }>;
    readonly plan: Readonly<{
        linearVelocity: readonly number[];
        angularVelocity: readonly number[];
        linearLockResidue: readonly number[];
        angularLockResidue: readonly number[];
        linearDamping: number;
        angularDamping: number;
        maximumLinearSpeed: number;
        maximumAngularSpeed: number | null;
        allowFastRotation: boolean;
        fixedDt: number;
        solverSubSteps: number;
    }>;
    readonly before: Readonly<{
        pose: Box3DOriginPose;
        worldCenter: readonly number[];
        linearVelocity: readonly number[];
        angularVelocity: readonly number[];
    }>;
}

/** Internal canonical stream. Positive safe sequence for users; zero only for flagged lifecycle commands. */
export type Box3DCommand = Readonly<{ body: Box3DId; sequence: number }> &
    (
        | Readonly<{
              kind: 'force' | 'linearImpulse';
              value: readonly number[];
              offset?: readonly number[];
              space?: 'world' | 'local';
          }>
        | Readonly<{ kind: 'torque' | 'angularImpulse'; value: readonly number[]; space?: 'world' | 'local' }>
        | Readonly<{ kind: 'clearForces' | 'clearVelocity' | 'clearState' }>
        | (Readonly<{ kind: 'reset' }> & Box3DMotionReset)
        | Readonly<{ kind: 'target'; pose: Box3DOriginPose }>
        | Readonly<{ kind: 'pairedClear'; reason: 'user' | 'idle' | 'cleanup' }>
    );
export interface Box3DCommandBodyResult {
    readonly body: Box3DId;
    readonly executedOperationCount: number;
    readonly lastSequence: number;
    readonly before: Readonly<{ pose: Box3DOriginPose; worldCenter: readonly number[]; state: Box3DBodyState }>;
    readonly actual: Readonly<{ pose: Box3DOriginPose; worldCenter: readonly number[]; state: Box3DBodyState }>;
    readonly plan: Readonly<{
        pose: Box3DOriginPose;
        worldCenter: readonly number[];
        linearVelocity: readonly number[];
        angularVelocity: readonly number[];
        force: readonly number[];
        torque: readonly number[];
        inverseInertiaWorld: readonly number[];
        inverseMass: number;
        requestedMass: number;
        maximumLinearSpeed: number;
        maximumAngularSpeed: number | null;
        allowFastRotation: boolean;
    }>;
}
export interface Box3DCommandOperationResult {
    readonly body: Box3DId;
    readonly kind: Box3DCommand['kind'];
    readonly flags: number;
    readonly sequence: number;
    /** Scheduled action bits, never a prediction of exact island awake flags. */
    readonly plannerActionBits: number;
    readonly plan: Readonly<{
        basisPose: Box3DOriginPose;
        basisWorldCenter: readonly number[];
        worldVector: readonly number[];
        applicationPoint: readonly number[];
        actualOffset: readonly number[];
        angularEffect: readonly number[];
        linearVelocity: readonly number[];
        angularVelocity: readonly number[];
        force: readonly number[];
        torque: readonly number[];
        linearLockResidue: readonly number[];
        angularLockResidue: readonly number[];
    }>;
    readonly actual: Readonly<{
        pose: Box3DOriginPose;
        worldCenter: readonly number[];
        linearVelocity: readonly number[];
        angularVelocity: readonly number[];
        force: readonly number[];
        torque: readonly number[];
        awake: boolean;
        enabled: boolean;
    }>;
}
export interface Box3DCommandBatchResult {
    readonly bodies: readonly Box3DCommandBodyResult[];
    readonly operations: readonly Box3DCommandOperationResult[];
    readonly executedOperationCount: number;
}

export interface Box3DRayQueryOptions {
    readonly group: number;
    readonly mask: number;
    readonly queryTrigger: boolean;
}
/** Full copied shape identity is observational data, not an ownership capability. */
export interface Box3DRawRayHit {
    readonly shape: Readonly<Box3DId>;
    readonly fraction: number;
    readonly point: readonly number[];
    readonly normal: readonly number[];
    readonly triangleIndex: number;
    readonly childIndex: number;
}

export interface Box3DQueryProxy {
    readonly points: readonly (readonly number[])[];
    readonly radius: number;
}

/** Experimental read-only diagnostic profile. Storage row lengths are not live entity counts. */
export interface Box3DMemoryRow {
    readonly id: number;
    readonly name: string;
    readonly count: bigint | null;
    readonly countUnit: string;
    readonly countMeaning: string;
    readonly capacity: bigint;
    readonly capacityUnit: string;
    readonly capacityMeaning: string;
    readonly bytes: bigint;
}
export interface Box3DMemoryBridge {
    readonly trackedBytes: bigint;
    readonly allocations: number;
    readonly debugShapeHandles: number;
    readonly debugPrimitiveCapacity: number;
    readonly capturedPrimitives: number;
}
export interface Box3DMemoryDiagnostics {
    readonly profile: 'air-box3d-memory-diagnostics-v1';
    readonly schemaVersion: 1;
    readonly identity: Readonly<
        Box3DIdentity & {
            worldId: number;
            nativeStepIndex: bigint;
            bindingMutationRevision: number;
        }
    >;
    readonly worldLedger: Readonly<{
        accounting: string;
        coreReportedBytes: bigint;
        classifiedBytes: bigint;
        sumMatchesCore: true;
        rows: readonly Readonly<Box3DMemoryRow>[];
    }>;
    readonly liveCounts: Readonly<{
        bodies: number;
        shapes: number;
        contacts: number;
        joints: number;
        islands: number;
    }>;
    readonly maxWorkload: Readonly<{
        meaning: string;
        staticShapeCount: number;
        dynamicShapeCount: number;
        staticBodyCount: number;
        dynamicBodyCount: number;
        contactCount: number;
    }>;
    readonly moduleCoreTrackedRequestedBytes: bigint;
    readonly nativeWorldBridge: Readonly<Box3DMemoryBridge>;
    readonly nativeGlobalBridge: Readonly<Box3DMemoryBridge>;
    readonly mesh: Readonly<{ moduleSuccessfulCooks: bigint; moduleDestroys: bigint }>;
    readonly excludedObservations: Readonly<{
        workerArenaBackingCapacityBytes: bigint;
        workerArenaPeakDemand: number;
        meaning: string;
    }>;
    readonly unavailable: readonly string[];
    readonly excludedFromWorldLedger: readonly string[];
    readonly observer: Readonly<{ facadeScratchBytes: 4096; queryNativeAllocationPolicy: 'none-by-source-design' }>;
}
