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
export interface Box3DFoundation {
    readonly identity: Readonly<Box3DIdentity>;
    createWorld(gravity?: ArrayLike<number>): Box3DWorld;
    destroyWorld(world: Box3DWorld): void;
    step(world: Box3DWorld, dt?: number, substeps?: number): void;
    createBody(world: Box3DWorld, options?: Box3DBodyOptions): Box3DId;
    destroyBody(body: Box3DId): void;
    bodySnapshot(body: Box3DId): Float32Array;
    /** One native call for the entire validated batch, ten copied floats per body. */
    bodyTransforms(world: Box3DWorld, bodies: readonly Box3DId[]): Float32Array;
    readStepSnapshot(world: Box3DWorld): Box3DStepSnapshot;
    readContactSnapshot(contact: Box3DContactHandle): Box3DContactSnapshot;
    /** Always throws until a common contact-anchor epoch is proven. */
    contactWorldPoints(contact: Box3DContactHandle): never;
    configureShapeEvents(shape: Box3DId, options: { sensor?: boolean; contact?: boolean; hit?: boolean }): void;
    createOffsetSphere(
        body: Box3DId,
        center: ArrayLike<number>,
        radius: number,
        density?: number,
        sensor?: boolean,
    ): Box3DId;
    setLinearVelocity(body: Box3DId, velocity: ArrayLike<number>): void;
    applyCenterImpulse(body: Box3DId, impulse: ArrayLike<number>): void;
    createSphere(body: Box3DId, radius: number, density?: number): Box3DId;
    createBox(body: Box3DId, halfExtents: ArrayLike<number>, density?: number): Box3DId;
    destroyShape(shape: Box3DId): void;
    rayClosest(
        world: Box3DWorld,
        origin: ArrayLike<number>,
        translation: ArrayLike<number>,
    ): { data: Float32Array; shape: Box3DId | null };
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
}
