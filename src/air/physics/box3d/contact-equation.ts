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
import type { IVec3Like } from '../../../cocos/core/math/type-define';
import type { IContactEquation } from '../../../cocos/physics/framework/physics-interface';
import type { Box3DContactGeometry, Box3DContactSnapshot, Box3DId } from './binding/facade.mjs';
import { worldError } from './world-binding';

/** Diagnostic values only. No native pointer, ownership handle, Node or live event escapes. */
export interface Box3DCopiedContactImpl {
    readonly geometry: Box3DContactGeometry;
    readonly manifoldIndex: number;
    readonly pointIndex: number;
}

function invalid(message: string): never {
    throw worldError('AIR_E_BOX3D_ABI', 'copied contact', message);
}

function finiteArray(value: readonly number[], length: number, name: string): readonly number[] {
    if (!Array.isArray(value) || value.length !== length || !Array.from(value).every(Number.isFinite))
        invalid(`Invalid ${name}.`);
    return Object.freeze(Array.from(value));
}

function word(value: number, name: string): number {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) invalid(`Invalid ${name}.`);
    return value;
}

function copyId(value: Readonly<Box3DId>, name: string): Readonly<Box3DId> {
    if (!value) invalid(`Missing ${name}.`);
    return Object.freeze({ low: word(value.low, `${name}.low`), high: word(value.high, `${name}.high`) });
}

function readCounter(value: number, name: string): number {
    if (!Number.isSafeInteger(value) || value < 0) invalid(`Invalid ${name}.`);
    return value;
}

/** Copy the additive generation geometry, never the unresolved legacy anchors or pre/post poses. */
function copyGeometry(snapshot: Box3DContactSnapshot): Box3DContactGeometry {
    const geometry = snapshot?.geometry;
    if (geometry?.status === 'UNSUPPORTED_GEOMETRY_FAMILY')
        throw worldError('AIR_E_BOX3D_UNSUPPORTED_GEOMETRY', 'copied contact', 'Contact family is not qualified.');
    if (geometry?.status === 'GEOMETRY_UNAVAILABLE')
        throw worldError(
            'AIR_E_BOX3D_UNSUPPORTED_SNAPSHOT_EPOCH',
            'copied contact',
            'No qualified contact generation basis is available.',
        );
    if (geometry?.status !== 'AVAILABLE' || geometry.source !== 'CACHED_MANIFOLD_GENERATION')
        invalid('Expected AVAILABLE cached manifold generation geometry.');
    const contactId = finiteArray(geometry.contactId, 3, 'contactId').map((value) => word(value, 'contactId'));
    if (
        !Array.isArray(snapshot.contactId) ||
        snapshot.contactId.length !== 3 ||
        contactId.some((value, index) => value !== snapshot.contactId[index])
    )
        invalid('Contact identity does not match its generation geometry.');
    const shapeA = copyId(geometry.shapeA, 'shapeA');
    const shapeB = copyId(geometry.shapeB, 'shapeB');
    const bodyA = copyId(geometry.bodyA, 'bodyA');
    const bodyB = copyId(geometry.bodyB, 'bodyB');
    for (const [name, id] of [
        ['shapeA', shapeA],
        ['shapeB', shapeB],
        ['bodyA', bodyA],
        ['bodyB', bodyB],
    ] as const) {
        if (snapshot[name]?.low !== id.low || snapshot[name]?.high !== id.high)
            invalid(`${name} identity does not match its generation geometry.`);
    }
    if (!Array.isArray(geometry.manifolds)) invalid('Missing generation manifolds.');
    const manifolds = Array.from(geometry.manifolds).map((manifold: Box3DContactGeometry['manifolds'][number]) => {
        if (!manifold || !Array.isArray(manifold.points)) invalid('Missing generation manifold points.');
        return Object.freeze({
            normalAtoB: finiteArray(manifold.normalAtoB, 3, 'normalAtoB'),
            normalBtoA: finiteArray(manifold.normalBtoA, 3, 'normalBtoA'),
            localNormalAtoB_A: finiteArray(manifold.localNormalAtoB_A, 3, 'localNormalAtoB_A'),
            localNormalAtoB_B: finiteArray(manifold.localNormalAtoB_B, 3, 'localNormalAtoB_B'),
            points: Object.freeze(
                Array.from(manifold.points).map(
                    (point: Box3DContactGeometry['manifolds'][number]['points'][number]) => {
                        if (!point) invalid('Missing generation contact point.');
                        return Object.freeze({
                            worldPointA: finiteArray(point.worldPointA, 3, 'worldPointA'),
                            worldPointB: finiteArray(point.worldPointB, 3, 'worldPointB'),
                            localPointA: finiteArray(point.localPointA, 3, 'localPointA'),
                            localPointB: finiteArray(point.localPointB, 3, 'localPointB'),
                        });
                    },
                ),
            ),
        });
    });
    return Object.freeze({
        status: 'AVAILABLE',
        source: 'CACHED_MANIFOLD_GENERATION',
        contactId: Object.freeze(contactId),
        shapeA,
        shapeB,
        bodyA,
        bodyB,
        geometryRevision: copyId(geometry.geometryRevision, 'geometryRevision'),
        generatedAfterStep: copyId(geometry.generatedAfterStep, 'generatedAfterStep'),
        generationPoseA: finiteArray(geometry.generationPoseA, 10, 'generationPoseA'),
        generationPoseB: finiteArray(geometry.generationPoseB, 10, 'generationPoseB'),
        readStepIndex: readCounter(geometry.readStepIndex, 'readStepIndex'),
        readMutationRevision: readCounter(geometry.readMutationRevision, 'readMutationRevision'),
        manifolds: Object.freeze(manifolds),
    });
}

function writeVector(out: IVec3Like, value: readonly number[], sign = 1): void {
    out.x = value[0] * sign;
    out.y = value[1] * sign;
    out.z = value[2] * sign;
}

/** Created only with a detached, deeply frozen generation geometry. */
class Box3DContactEquation implements IContactEquation {
    readonly impl: Readonly<Box3DCopiedContactImpl>;

    constructor(
        geometry: Box3DContactGeometry,
        readonly isBodyA: boolean,
        manifoldIndex: number,
        pointIndex: number,
    ) {
        this.impl = Object.freeze({ geometry, manifoldIndex, pointIndex });
        Object.freeze(this);
    }

    private get manifold(): Box3DContactGeometry['manifolds'][number] {
        return this.impl.geometry.manifolds[this.impl.manifoldIndex];
    }

    private get point(): Box3DContactGeometry['manifolds'][number]['points'][number] {
        return this.manifold.points[this.impl.pointIndex];
    }

    getLocalPointOnA(out: IVec3Like): void {
        writeVector(out, this.point.localPointA);
    }

    getLocalPointOnB(out: IVec3Like): void {
        writeVector(out, this.point.localPointB);
    }

    getWorldPointOnA(out: IVec3Like): void {
        writeVector(out, this.point.worldPointA);
    }

    getWorldPointOnB(out: IVec3Like): void {
        writeVector(out, this.point.worldPointB);
    }

    // Match the Bullet/PhysX getter sign convention, but use the matching generation frames.
    // A normal is other -> self. B normal is the canonical native B -> A for either receiver.
    // A/B point and local-frame identity remain native A/B; they are not reordered to self/other.
    getLocalNormalOnA(out: IVec3Like): void {
        writeVector(out, this.manifold.localNormalAtoB_A, this.isBodyA ? -1 : 1);
    }

    getLocalNormalOnB(out: IVec3Like): void {
        writeVector(out, this.manifold.localNormalAtoB_B, -1);
    }

    getWorldNormalOnA(out: IVec3Like): void {
        writeVector(out, this.isBodyA ? this.manifold.normalBtoA : this.manifold.normalAtoB);
    }

    getWorldNormalOnB(out: IVec3Like): void {
        writeVector(out, this.manifold.normalBtoA);
    }
}

/**
 * Copy one equation per generation-manifold point, preserving manifold/point order.
 * isBodyA must be resolved against this snapshot's full native A/B identity before callbacks.
 * The caller must retain the already-qualified shape-family scope; AVAILABLE is not new qualification.
 * Unsupported geometry/epoch throws explicitly. Never substitute raw anchors or live Node poses.
 * The returned array is caller-owned; its equations and complete diagnostic geometry are immutable.
 */
export function createContactEquations(snapshot: Box3DContactSnapshot, isBodyA: boolean): IContactEquation[] {
    if (typeof isBodyA !== 'boolean') invalid('Expected a captured receiver A/B identity.');
    const geometry = copyGeometry(snapshot);
    const result: IContactEquation[] = [];
    for (let manifoldIndex = 0; manifoldIndex < geometry.manifolds.length; ++manifoldIndex) {
        const manifold = geometry.manifolds[manifoldIndex];
        for (let pointIndex = 0; pointIndex < manifold.points.length; ++pointIndex)
            result.push(new Box3DContactEquation(geometry, isBodyA, manifoldIndex, pointIndex));
    }
    return result;
}
