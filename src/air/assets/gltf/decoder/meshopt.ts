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
