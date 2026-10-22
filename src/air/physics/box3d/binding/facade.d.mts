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
