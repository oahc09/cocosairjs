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

import type { Box3DFoundation, Box3DIdentity } from '../binding/facade.mjs';
import type { Box3DModuleReleaseReceipt, Box3DModuleReleaseSnapshot } from '../../preparation.js';

/** Internal ST-only preparer; application/feature integration is not complete. */
export interface Box3DSTOptions {
    assetBaseUrl?: string;
    threading?: 'single';
    workerCount?: 1;
    solverSubSteps?: 1 | 2 | 4 | 8;
}
export interface Box3DSTContext {
    defaultAssetBaseUrl?: string;
    documentBaseUrl?: string;
}
export interface Box3DBuildDescriptor {
    manifestSha256: string;
    facadeSha256: string;
    identity: Box3DIdentity & { bindingBaseSha: string; patchChainSha256: string };
}
export interface Box3DSTLease {
    readonly binding: Box3DFoundation;
    readonly options: Readonly<Required<Box3DSTOptions>>;
    readonly generation: number;
    /** Idempotent; an old lease cannot dispose a newer preparation generation. */
    dispose(): Promise<void>;
    /** Immutable copy of this lease generation, even after another preparation. */
    diagnostics(): Box3DLoaderReceipt;
}
export type { Box3DModuleReleaseReceipt } from '../../preparation.js';
export interface Box3DLoaderReceipt {
    readonly status: 'IDLE' | 'PREPARING' | 'READY' | 'DISPOSED' | 'CANCELLED' | 'FAILED' | 'CLEANUP_FAILED';
    readonly generation: number;
    readonly requests?: readonly string[];
    readonly acquired?: readonly string[];
    readonly cleanup?: readonly Readonly<{ resource: string; attempted: true }>[];
    readonly cleanupErrors?: readonly string[];
    readonly originalError?: Readonly<{ code: string | null; message: string }> | null;
    readonly cleanupFailure?: string;
    /** Copied terminal evidence; never retains a module, native pointer or live getter. */
    readonly moduleRelease?: Box3DModuleReleaseReceipt;
}
export interface Box3DSTLoader {
    /** Same normalized config returns the same Promise, including after it resolves. */
    prepare(options?: Box3DSTOptions): Promise<Box3DSTLease>;
    /** Invalidates and waits for late acquisition cleanup before allowing a retry. */
    dispose(): Promise<void>;
    diagnostics(): Box3DLoaderReceipt;
}
/** Test-only transport seams; injecting fake modules does not prove physics behavior. */
export interface Box3DLoaderDependencies {
    fetch?: (url: string, init: RequestInit) => Promise<Response>;
    loadModule?: (url: string) => Promise<{
        default: (options: { wasmBinary: Uint8Array; locateFile(path: string): string }) => Promise<unknown>;
    }>;
    createBinding?: (module: unknown, expected: Box3DBuildDescriptor['identity']) => Box3DFoundation;
    digest?: (bytes: Uint8Array) => Promise<string>;
    releaseModule?: (module: unknown) => void | Promise<void>;
    /** CPU seam only. Production always defaults to the real same-module native capture. */
    captureModuleReleaseSnapshot?: (
        module: unknown,
        expected: Box3DBuildDescriptor['identity'],
    ) => Box3DModuleReleaseSnapshot;
}
export function normalizeBox3DSTOptions(
    options?: Box3DSTOptions,
    context?: Box3DSTContext,
): Readonly<Required<Box3DSTOptions>>;
export function createBox3DSTLoader(
    descriptor: Box3DBuildDescriptor,
    context?: Box3DSTContext,
    dependencies?: Box3DLoaderDependencies,
): Box3DSTLoader;
