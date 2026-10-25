/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
import type { Box3DHullGeometry } from './hull-geometry';
import type { Box3DSurfaceMaterial } from './world-binding';
import { copySurfaceMaterial, finiteFloat32, worldError } from './world-binding';

export type Box3DRoundHullKind = 'cylinder' | 'cone';
export const BOX3D_ROUND_HULL_SEGMENTS = 32;
export const BOX3D_ROUND_HULL_ALGORITHM = 'inscribed-round-hull32-f32-v1';

// Fixed quarter-circle constants, not a platform-dependent runtime sin/cos loop.
// Ideal unit-circle samples are quantized once to the same F32 wire representation.
const QUARTER = Object.freeze(
    [
        1, 0.9807852804032304, 0.9238795325112867, 0.8314696123025452, 0.7071067811865476, 0.5555702330196023,
        0.3826834323650898, 0.19509032201612825, 0,
    ].map(Math.fround),
);
function cosine(index: number): number {
    const i = ((index % 32) + 32) % 32;
    return i <= 8 ? QUARTER[i] : i <= 16 ? -QUARTER[16 - i] : i <= 24 ? -QUARTER[i - 16] : QUARTER[32 - i];
}

/** Finite 32-sided convex approximation. No native Cone factory: its two radii
 * must both be positive and would produce a truncated cone rather than a tip.
 * dimensions = [normalized radius, normalized full height, exact axis 0/1/2].
 * Center uses signed scale; the circular cross section uses the maximum radial
 * absolute scale, not an ellipse. SharedBody independently admits Node transforms.
 */
export function roundHullGeometry(
    kind: Box3DRoundHullKind,
    center: readonly number[],
    dimensions: readonly number[],
    scale: readonly number[],
    trigger: boolean,
    material: Readonly<Box3DSurfaceMaterial> | null,
): Box3DHullGeometry {
    if (kind !== 'cylinder' && kind !== 'cone')
        throw worldError('AIR_E_BOX3D_CONFIG', 'round hull kind', 'Expected cylinder or cone.');
    if (typeof trigger !== 'boolean' || center.length !== 3 || scale.length !== 3 || dimensions.length !== 3)
        throw worldError(
            'AIR_E_BOX3D_CONFIG',
            'round hull configuration',
            'Expected boolean and three-component arrays.',
        );
    const [rawRadius, rawHeight, axis] = dimensions;
    const radius = finiteFloat32(rawRadius, 'round hull radius');
    const height = finiteFloat32(rawHeight, 'round hull height');
    if (!(rawRadius > 0) || !(rawHeight > 0) || radius <= 0 || height <= 0 || ![0, 1, 2].includes(axis))
        throw worldError(
            'AIR_E_BOX3D_CONFIG',
            'round hull dimensions',
            'Expected positive radius/height and exact axis 0/1/2.',
        );
    const s = scale.map((v) => finiteFloat32(v, 'round hull scale'));
    if (s.some((v) => v === 0))
        throw worldError('AIR_E_BOX3D_CONFIG', 'round hull scale', 'Degenerate scale is not supported.');
    const c = center.map((v, i) =>
        finiteFloat32(finiteFloat32(v, 'round hull center') * s[i], 'scaled round hull center'),
    );
    const r = finiteFloat32(
        radius * Math.max(...s.filter((_, i) => i !== axis).map(Math.abs)),
        'scaled round hull radius',
    );
    const half = finiteFloat32(height * Math.abs(s[axis]) * 0.5, 'scaled round hull half height');
    if (r <= 0 || half <= 0)
        throw worldError('AIR_E_BOX3D_CONFIG', 'round hull geometry', 'Positive dimensions must not round to zero.');
    // Y-axis base ring lies in XZ. Cyclic permutations retain handedness for X/Z.
    const radialA = (axis + 2) % 3,
        radialB = (axis + 1) % 3;
    const positions: number[] = [];
    const push = (axial: number, a: number, b: number): void => {
        const point = c.slice();
        point[axis] = finiteFloat32(c[axis] + axial, 'round hull axial point');
        point[radialA] = finiteFloat32(c[radialA] + a, 'round hull radial point');
        point[radialB] = finiteFloat32(c[radialB] + b, 'round hull radial point');
        positions.push(...point);
    };
    // Stable order: lower ring 0..31, then upper ring 0..31 or one unique apex.
    for (const sign of kind === 'cylinder' ? [-1, 1] : [-1])
        for (let i = 0; i < 32; ++i)
            push(
                sign * half,
                finiteFloat32(r * cosine(i), 'round hull point'),
                finiteFloat32(r * cosine(8 - i), 'round hull point'),
            );
    if (kind === 'cone') push(half, 0, 0);
    // Coincident/flat/over-limit cooked topology is rejected by checked createHull,
    // including extreme offsets whose F32 coordinates lose the requested extent.
    return Object.freeze({
        kind: 'hull',
        positions: Object.freeze(positions),
        trigger,
        material: material === null ? null : copySurfaceMaterial(material),
    });
}
