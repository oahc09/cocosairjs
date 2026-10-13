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
/**
 * Meshopt adapter. Wraps the official `meshoptimizer` decoder (`MeshoptDecoder`) so the
 * glTF handler never depends on a specific distribution: only the documented
 * `decodeGltfBufferAsync` behaviour is required, and a sync-only decoder still works.
 */
import { GLTFError } from '../diagnostics';
import type { GLTFMeshoptDecoder } from './types';

/** Structural type of the official decoder module (subset actually used). */
export interface MeshoptDecoderModule {
    supported?: boolean;
    ready?: Promise<void> | Promise<unknown>;
    useWorkers?(count: number): void;
    decodeGltfBufferAsync?(count: number, byteStride: number, source: Uint8Array, mode: string,
        filter?: string): Promise<ArrayBuffer | Uint8Array>;
    decodeGltfBuffer?(target: Uint8Array, count: number, byteStride: number, source: Uint8Array,
        mode: string, filter?: string): void;
}

/** True when the module exposes a usable decoder (WebAssembly present and initialized). */
export function isMeshoptAvailable (module: MeshoptDecoderModule | undefined): boolean {
    return !!module && module.supported !== false
        && (typeof module.decodeGltfBufferAsync === 'function' || typeof module.decodeGltfBuffer === 'function');
}

/**
 * Adapts an official decoder module to the loader contract. `workers` enables the
 * decoder's own worker pool; the loader never creates workers itself.
 */
export function createMeshoptDecoder (module: MeshoptDecoderModule, workers?: number): GLTFMeshoptDecoder {
    const ready = module.ready ? Promise.resolve(module.ready) : Promise.resolve();
    if (workers && typeof module.useWorkers === 'function') { module.useWorkers(workers); }
    return {
        async decodeGltfBufferAsync (count, byteStride, source, mode, filter) {
            await ready;
            if (typeof module.decodeGltfBufferAsync === 'function') {
                const result = await module.decodeGltfBufferAsync(count, byteStride, source, mode, filter);
                return result instanceof Uint8Array ? result : new Uint8Array(result);
            }
            if (typeof module.decodeGltfBuffer === 'function') {
                const target = new Uint8Array(count * byteStride);
                module.decodeGltfBuffer(target, count, byteStride, source, mode, filter);
                return target;
            }
            throw new GLTFError('GLTF_DECODER_MISSING', 'meshopt decoder provides no decodeGltfBuffer entry point');
        },
        dispose () {
            if (typeof (module as { dispose?: () => void }).dispose === 'function') {
                (module as { dispose: () => void }).dispose();
            }
        },
    };
}
