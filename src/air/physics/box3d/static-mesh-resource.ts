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
import type { Box3DFoundation, Box3DWorld, Box3DStaticMeshLease } from './binding/facade.mjs';
import type { StaticMeshIntake, StaticMeshSource } from './static-mesh-intake';
import { copyStaticMeshIntake, sameStaticMeshKey } from './static-mesh-intake';
import type { Box3DSurfaceMaterial } from './world-binding';
import { worldError } from './world-binding';

export interface Box3DStaticMeshGeometry {
    readonly kind: 'mesh';
    readonly publicKind?: 'terrain';
    readonly provenance?: 'heightfield-cooked-static-triangle-mesh';
    readonly terrain?: Readonly<{ countX: number; countZ: number; tileSize: number }>;
    readonly positions: readonly number[];
    readonly intake: StaticMeshIntake;
    readonly trigger: false;
    readonly material: Readonly<Box3DSurfaceMaterial> | null;
}
export function staticMeshGeometry(
    source: StaticMeshSource | null,
    center: readonly number[],
    scale: readonly number[],
    trigger: boolean,
    material: Readonly<Box3DSurfaceMaterial> | null,
    identity: Box3DFoundation['identity'],
): Box3DStaticMeshGeometry | null {
    if (trigger)
        throw worldError(
            'AIR_E_BOX3D_UNSUPPORTED',
            'static Mesh',
            'Mesh sensors and public Mesh events are not qualified.',
        );
    const intake = copyStaticMeshIntake(source, {
        center: center as readonly [number, number, number],
        scale: scale as readonly [number, number, number],
        sourceWinding: 'ccw',
        cooking: { weld: false, buildAdjacency: true, split: 'sah', degenerates: 'reject', primitiveRestart: 'reject' },
        versions: {
            core: identity.coreSha,
            patch: identity.patchChainSha256,
            mesh: 'b3Mesh-SAH-adjacency-v1',
            schema: identity.schemaSha256,
        },
    });
    return intake
        ? Object.freeze({ kind: 'mesh', intake, positions: intake.positions, trigger: false, material })
        : null;
}
export interface Box3DMeshResourceUse {
    readonly native: Box3DStaticMeshLease;
    release(): void;
}
type Entry = { intake: StaticMeshIntake; native: Box3DStaticMeshLease; uses: number };
/** One pool per actual binding/world. One cache lease + native shape borrows, not copied handles. */
export class Box3DStaticMeshResources {
    readonly #buckets = new Map<string, Entry[]>();
    #closed = false;
    constructor(
        readonly binding: Box3DFoundation,
        readonly world: Box3DWorld,
    ) {}
    acquire(intake: StaticMeshIntake): Box3DMeshResourceUse {
        if (this.#closed) throw worldError('AIR_E_BOX3D_DISPOSED', 'Mesh resource', 'World resource pool is closed.');
        const bucket = this.#buckets.get(intake.key.bucketHash) ?? [];
        let entry = bucket.find((item) => sameStaticMeshKey(item.intake.key, intake.key));
        if (!entry) {
            const native = this.binding.cookStaticMesh(this.world, intake.positions, intake.indices);
            entry = { intake, native, uses: 0 };
            bucket.push(entry);
            this.#buckets.set(intake.key.bucketHash, bucket);
        }
        ++entry.uses;
        const owned = entry;
        let released = false;
        return Object.freeze({
            native: entry.native,
            release: () => {
                if (released || this.#closed) return;
                if (owned.uses === 1) {
                    // Do not update JS ownership until the exact native cache lease release returns.
                    this.binding.releaseStaticMesh(owned.native);
                    bucket.splice(bucket.indexOf(owned), 1);
                    if (!bucket.length) this.#buckets.delete(intake.key.bucketHash);
                }
                --owned.uses;
                released = true;
            },
        });
    }
    readDiagnostics() {
        if (this.#closed) return Object.freeze([]);
        const result = [] as Readonly<
            ReturnType<Box3DFoundation['staticMeshState']> & { users: number; bucketHash: string }
        >[];
        for (const bucket of this.#buckets.values()) {
            for (const entry of bucket)
                result.push(
                    Object.freeze({
                        users: entry.uses,
                        bucketHash: entry.intake.key.bucketHash,
                        ...this.binding.staticMeshState(entry.native),
                    }),
                );
        }
        return Object.freeze(result);
    }

    /** Called only after actual native world destruction; never replays native resource destruction. */
    closeAfterWorld(): void {
        this.#closed = true;
        this.#buckets.clear();
    }
}
