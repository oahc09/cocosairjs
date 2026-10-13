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
export { GLTFAsset } from './asset';
export type { GLTFInstance } from './asset';
export { GLTFLoader, registerGLTFLoader, configureGLTFLoaderDefaults } from './loader';
export type { GLTFLoaderOptions, GLTFLoadProgress } from './progress';
export type { GLTFExtensionHandler, GLTFExtensionFactory, GLTFInstantiationContext } from './extension-registry';
export { GLTFExtensionRegistry } from './extension-registry';
export type { GLTFExtensionStatus, GLTFExtensionSupport } from './support';
export { GLTFError } from './diagnostics';
export { detectImageMime, setTextureSupportForTesting, SUPPORTED_IMAGE_MIMES } from './extensions/texture/image-formats';
export { isKTX2 } from './extensions/texture/basisu';
export { KTX2_RAW_MIME } from './decoder/types';
export type { GLTFErrorCode, GLTFExtensionReportEntry } from './diagnostics';
export type { GLTFDracoDecoder, GLTFMeshoptDecoder, GLTFKTX2Transcoder, DecodedPrimitive, DecodedTextureSource, DracoAttributeInfo } from './decoder/types';
export { createMeshoptDecoder, isMeshoptAvailable } from './decoder/meshopt';
export type { MeshoptDecoderModule } from './decoder/meshopt';
export { createDracoDecoder } from './decoder/draco';
export { createKTX2Transcoder, isKTX2Available } from './decoder/ktx2';
export type { BasisTranscoderModule, BasisModuleFactory } from './decoder/ktx2';
export type { DracoDecoderModule, DracoDecoderProvider } from './decoder/draco';
export { meshQuantizationFactory, KHR_MESH_QUANTIZATION } from './extensions/geometry/quantization';
export { meshoptCompressionFactory, KHR_MESHOPT_COMPRESSION, EXT_MESHOPT_COMPRESSION } from './extensions/geometry/meshopt';
export { dracoCompressionFactory, KHR_DRACO_MESH_COMPRESSION } from './extensions/geometry/draco';
export type { GLTFMaterialFeatures } from './material/features';

import { registerGLTFLoader } from './loader';
registerGLTFLoader();
