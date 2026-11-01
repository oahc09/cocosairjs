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
import type { Box3DBeforeStepCallback, Box3DBeforeStepHandle } from '../../box3d-controls';

type Register = (callback: Box3DBeforeStepCallback, options?: { enabled?: boolean }) => Box3DBeforeStepHandle;
export interface Box3DBeforeStepSource {
    register: Register;
}
const sources = new WeakMap<object, Box3DBeforeStepSource>();
/** Internal wiring only. Never exported from the main entry or installed by an example. */
export function installBox3DBeforeStepSource(world: object, register: Register): { dispose(): void } {
    if (!world || typeof world !== 'object' || typeof register !== 'function' || sources.has(world)) {
        throw Object.assign(new Error('Invalid or duplicate Box3D before-step source.'), {
            code: 'AIR_E_BOX3D_CONFIG',
        });
    }
    let active = true;
    const source: Box3DBeforeStepSource = Object.freeze({
        register(callback: Box3DBeforeStepCallback, options?: { enabled?: boolean }) {
            if (!active)
                throw Object.assign(new Error('Box3D before-step source was disposed.'), {
                    code: 'AIR_E_BOX3D_DISPOSED',
                });
            // Actual owner admission, copying, phase checks and handle lifetime stay authoritative.
            return register(callback, options);
        },
    });
    sources.set(world, source);
    return Object.freeze({
        dispose() {
            if (!active) return;
            active = false;
            if (sources.get(world) === source) sources.delete(world);
        },
    });
}
export function findBox3DBeforeStepSource(world: object): Box3DBeforeStepSource | undefined {
    return sources.get(world);
}
