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
import type { Box3DFoundation, Box3DId, Box3DWorld } from './binding/facade.mjs';
import type { Box3DDebugSnapshot } from './debug';

/** Future bridge contract, not a declaration that current WASM implements it. */
export interface Box3DNativeStepDiagnostics {
    readonly nativeStepIndex: number;
    readonly nativeCompleted: boolean;
    readonly snapshotAvailable: boolean;
}
export interface Box3DSurfaceMaterial {
    readonly friction: number;
    readonly restitution: number;
}
export interface Box3DWorldBinding extends Box3DFoundation {
    setGravity(world: Box3DWorld, gravity: readonly number[]): void;
    getGravity(world: Box3DWorld): readonly number[];
    setSleepingEnabled(world: Box3DWorld, enabled: boolean): void;
    isSleepingEnabled(world: Box3DWorld): boolean;
    debugSnapshot(world: Box3DWorld, flags: number, jointScale: number): Box3DDebugSnapshot;
    stepDiagnostics(world: Box3DWorld): Box3DNativeStepDiagnostics;
    /** Both methods must validate that shape belongs to this exact world. */
    getShapeMaterial(world: Box3DWorld, shape: Box3DId): Box3DSurfaceMaterial;
    setShapeMaterial(world: Box3DWorld, shape: Box3DId, material: Box3DSurfaceMaterial): void;
}
export function worldError(code: string, operation: string, message: string): Error & { code: string } {
    return Object.assign(new Error(`[${code}] ${operation}: ${message}`), { code });
}
export function finiteFloat32(value: unknown, operation: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isFinite(Math.fround(value)))
        throw worldError('AIR_E_BOX3D_CONFIG', operation, 'Expected a finite float32 value.');
    return Math.fround(value);
}
export function copyVector(value: readonly number[], operation: string): readonly number[] {
    if (!Array.isArray(value) || value.length !== 3)
        throw worldError('AIR_E_BOX3D_CONFIG', operation, 'Expected a copied three-component array.');
    return Object.freeze(value.map((v) => finiteFloat32(v, operation)));
}
export function copyStepDiagnostics(value: Box3DNativeStepDiagnostics): Readonly<Box3DNativeStepDiagnostics> {
    if (
        !value ||
        !Number.isSafeInteger(value.nativeStepIndex) ||
        value.nativeStepIndex < 0 ||
        typeof value.nativeCompleted !== 'boolean' ||
        typeof value.snapshotAvailable !== 'boolean'
    )
        throw worldError('AIR_E_BOX3D_ABI', 'stepDiagnostics', 'Invalid native step diagnostic record.');
    return Object.freeze({
        nativeStepIndex: value.nativeStepIndex,
        nativeCompleted: value.nativeCompleted,
        snapshotAvailable: value.snapshotAvailable,
    });
}
export function copySurfaceMaterial(value: Box3DSurfaceMaterial): Readonly<Box3DSurfaceMaterial> {
    if (!value) throw worldError('AIR_E_BOX3D_CONFIG', 'material', 'Expected a material.');
    const friction = finiteFloat32(value.friction, 'material.friction');
    const restitution = finiteFloat32(value.restitution, 'material.restitution');
    if (value.friction < 0 || value.restitution < 0)
        throw worldError('AIR_E_BOX3D_CONFIG', 'material', 'Friction and restitution must be nonnegative.');
    return Object.freeze({ friction, restitution });
}
/** This guard intentionally rejects g and the geometry-only candidate before world allocation. */
export function requireWorldBinding(binding: Box3DFoundation): Box3DWorldBinding {
    const names = [
        'createWorld',
        'destroyWorld',
        'step',
        'readStepSnapshot',
        'worldCounts',
        'liveBytes',
        'setGravity',
        'getGravity',
        'setSleepingEnabled',
        'isSleepingEnabled',
        'debugSnapshot',
        'stepDiagnostics',
        'getShapeMaterial',
        'setShapeMaterial',
    ] as const;
    const candidate = binding as unknown as Record<string, unknown>;
    const missing = names.filter((name) => typeof candidate?.[name] !== 'function');
    if (missing.length)
        throw worldError(
            'AIR_E_BOX3D_UNSUPPORTED',
            'world preparation',
            `Required native bridge unavailable: ${missing.join(', ')}.`,
        );
    if (binding.identity?.abiVersion !== 1 || binding.identity?.variant !== 'st-simd')
        throw worldError('AIR_E_BOX3D_ABI', 'world preparation', 'Expected the verified ST ABI-1 binding.');
    return binding as Box3DWorldBinding;
}

/** Additive T10 bridge. Presence is admission only, never native qualification. */
export interface Box3DShapeFilter {
    readonly group: number;
    readonly mask: number;
}
export interface Box3DComponentBinding extends Box3DWorldBinding {
    getShapeFilter(world: Box3DWorld, shape: Box3DId): Readonly<Box3DShapeFilter>;
    setShapeFilter(world: Box3DWorld, shape: Box3DId, value: Box3DShapeFilter): Readonly<Box3DShapeFilter>;
}
export function requireComponentBinding(binding: Box3DFoundation): Box3DComponentBinding {
    const candidate = requireWorldBinding(binding) as unknown as Record<string, unknown>;
    const names = [
        'createBody',
        'destroyBody',
        'bodyState',
        'bodyTransforms',
        'setBodyType',
        'setBodyEnabled',
        'setBodyMass',
        'setBodyDamping',
        'setBodyGravityScale',
        'setBodySleepEnabled',
        'setBodySleepThreshold',
        'setBodyAwake',
        'setBodyCCD',
        'setBodyMotionFactors',
        'setBodyLinearVelocity',
        'setBodyAngularVelocity',
        'applyBodyForce',
        'applyBodyImpulse',
        'applyBodyTorque',
        'clearBodyForces',
        'clearBodyVelocity',
        'clearBodyState',
        'createOffsetBox',
        'createOffsetSphere',
        'destroyShape',
        'configureShapeEvents',
        'getShapeFilter',
        'setShapeFilter',
    ];
    const missing = names.filter((name) => typeof candidate[name] !== 'function');
    if (missing.length)
        throw worldError(
            'AIR_E_BOX3D_UNSUPPORTED',
            'components',
            `Required native component bridge unavailable: ${missing.join(', ')}.`,
        );
    return binding as Box3DComponentBinding;
}
