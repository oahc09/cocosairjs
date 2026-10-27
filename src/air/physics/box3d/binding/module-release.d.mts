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

import type { Box3DIdentity } from './facade.mjs';
export const MODULE_RELEASE_WORDS: 38;
export const MODULE_RELEASE_SCHEMA: 'air-box3d-module-release-snapshot-v1';
export interface Box3DModuleReleaseSnapshot {
    readonly schema: typeof MODULE_RELEASE_SCHEMA;
    readonly schemaVersion: 1;
    readonly core: Readonly<{ worlds: number; trackedRequestedBytes: number }>;
    readonly bridge: Readonly<{
        worlds: number;
        allocations: number;
        bytes: number;
        debugShapeHandles: number;
        temporaryNodes: number;
        temporaryBytes: number;
        wireBuffers: number;
        wireCapacityRecords: number;
        wireLengthRecords: number;
        capturedWorlds: number;
    }>;
    readonly mesh: Readonly<{
        resources: number;
        leases: number;
        references: number;
        borrowNodes: number;
        resourceStorageBytes: number;
    }>;
}
/** Exclusive ST snapshot, copied/frozen, no retained module or borrowed native views. */
export function captureModuleReleaseSnapshot(
    module: unknown,
    expectedIdentity: Box3DIdentity & { patchChainSha256: string },
): Box3DModuleReleaseSnapshot;
/** Throws on residual registered ownership or changed original core byte baseline. */
export function verifyModuleReleased(baseline: Box3DModuleReleaseSnapshot, terminal: Box3DModuleReleaseSnapshot): true;
