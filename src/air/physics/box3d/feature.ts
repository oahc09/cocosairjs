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
/** Optional feature registration only. No fetch, module construction or world creation at import. */
import { createBox3DSTLoader } from './loader/st-loader.mjs';
import type { Box3DBuildDescriptor } from './loader/st-loader.mjs';
import { registerBox3DFeature } from './prepare';

// Only the explicit Box3D build plugin replaces these trusted build markers.
const descriptor = '__AIR_BOX3D_ST_DESCRIPTOR__' as unknown as Box3DBuildDescriptor;
const assetBase = '__AIR_BOX3D_ST_ASSET_BASE__';

registerBox3DFeature({
    createLoader: () =>
        createBox3DSTLoader(descriptor, {
            defaultAssetBaseUrl: assetBase,
            documentBaseUrl: typeof document === 'undefined' ? undefined : document.baseURI,
        }),
});
