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
