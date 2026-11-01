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
import type { Box3DBodyMotion } from '../../box3d-controls';
import { worldError } from './world-binding';

type Read = () => Readonly<Box3DBodyMotion>;
const sources = new WeakMap<object, { readonly world: object; readonly read: Read }>();
/** Internal component identity wiring only; no install/read route is exported by AIR. */
export function installBox3DBodyMotionSource(component: object, world: object, read: Read): { dispose(): void } {
    if (!component || !world || typeof read !== 'function' || sources.has(component))
        throw worldError('AIR_E_BOX3D_CONFIG', 'body motion source', 'Invalid or duplicate component source.');
    const source = Object.freeze({ world, read });
    sources.set(component, source);
    return Object.freeze({
        dispose(): void {
            if (sources.get(component) === source) sources.delete(component);
        },
    });
}
export function readBox3DBodyMotionSource(component: object, world: object): Readonly<Box3DBodyMotion> {
    // Identity-only lookup: never inspect caller-owned body/adapter/native properties.
    const source = sources.get(component);
    if (!source || source.world !== world)
        throw worldError(
            'AIR_E_BOX3D_DISPOSED',
            'readBox3DBodyMotion',
            'Expected an initialized body of the current world.',
        );
    return source.read();
}
