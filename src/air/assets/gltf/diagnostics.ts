/** Stable glTF error codes shared by the loader, registry and extension handlers. */
export type GLTFErrorCode = 'GLTF_EXTENSION_UNSUPPORTED' | 'GLTF_DECODER_MISSING' | 'GLTF_DEVICE_UNSUPPORTED'
    | 'GLTF_EXTENSION_INVALID' | 'GLTF_DECODE_FAILED';

/** Error with a stable machine-readable code; every extension failure path must use it. */
export class GLTFError extends Error {
    public readonly code: GLTFErrorCode;
    public readonly extension?: string;
    constructor (code: GLTFErrorCode, message: string, extension?: string) {
        super(`[glTF] ${message}`);
        this.name = 'GLTFError'; this.code = code; this.extension = extension;
    }
}

export interface GLTFExtensionReportEntry {
    name: string;
    required: boolean;
    status: string;
    reason?: string;
}
