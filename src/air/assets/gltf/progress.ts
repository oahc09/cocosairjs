/** Public loader option/progress contracts, shared by loader.ts and parser-context.ts. */
import type { GLTFDracoDecoder, GLTFKTX2Transcoder, GLTFMeshoptDecoder } from './decoder/types';

export interface GLTFLoadProgress {
    phase: 'container' | 'dependencies' | 'decode' | 'textures' | 'objects';
    loaded: number;
    total: number;
    url?: string;
}

export interface GLTFLoaderOptions {
    signal?: AbortSignal;
    dracoDecoder?: GLTFDracoDecoder;
    meshoptDecoder?: GLTFMeshoptDecoder;
    ktx2Transcoder?: GLTFKTX2Transcoder;
    onProgress?: (progress: GLTFLoadProgress) => void;
}
