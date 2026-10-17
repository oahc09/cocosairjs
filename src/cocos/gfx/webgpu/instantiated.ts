/*
 Copyright (c) 2023 Xiamen Yaji Software Co., Ltd.

 https://www.cocos.com/

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 of the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

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

import { webGPU } from './define';

const defaultAssetBase = '__AIR_WEBGPU_ASSET_BASE__';
let assetBase: string | undefined;
let initialization: Promise<void> | undefined;

export function configureWebGPUAssets (url?: string): void {
    if (initialization && url !== assetBase) throw new Error('WebGPU translators are already initializing.');
    assetBase = url;
}

export function waitForWebGPUWasmInstantiation (): Promise<void> {
    if (initialization) return initialization;
    initialization = (async () => {
        const base = assetBase ?? (defaultAssetBase.startsWith('__AIR_')
            ? new URL('build/webgpu/', document.baseURI).href : defaultAssetBase);
        async function load (name: string): Promise<any> {
            const url = new URL(name + '.js', base).href;
            const wasmUrl = new URL(name + '.wasm', base).href;
            const [module, response] = await Promise.all([import(url), fetch(wasmUrl)]);
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${wasmUrl}`);
            const binary = await response.arrayBuffer();
            // Cocos factory wrappers expose instantiateWasm, not wasmBinary.
            return new Promise((resolve, reject) => {
                let completed = false;
                const timer = setTimeout(() => {
                    if (!completed) reject(new Error(`WebGPU translator timed out: ${name}`));
                }, 30000);
                const fail = (error: unknown): void => { clearTimeout(timer); reject(error); };
                Promise.resolve(module.default({
                    wasmPath: wasmUrl,
                    instantiateWasm(imports: WebAssembly.Imports, receive: (instance: WebAssembly.Instance) => void) {
                        WebAssembly.instantiate(binary, imports).then((result) => receive(result.instance)).catch(fail);
                        return {};
                    },
                })).then((instance) => { completed = true; clearTimeout(timer); resolve(instance); }, fail);
            });
        }
        try {
            const [glslang, twgsl] = await Promise.all([load('glslang'), load('twgsl')]);
            if (typeof glslang.compileGLSL !== 'function' || typeof twgsl.convertSpirV2WGSL !== 'function') {
                throw new Error('Invalid WebGPU shader translator exports.');
            }
            webGPU.glslang = glslang;
            webGPU.twgsl = twgsl;
        } catch (cause) {
            throw Object.assign(new Error('WebGPU shader translators could not be initialized.'), {
                code: 'WEBGPU_SHADER_ASSETS_FAILED', cause,
            });
        }
    })();
    return initialization;
}
