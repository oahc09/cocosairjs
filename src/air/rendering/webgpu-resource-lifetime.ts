/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 of the Software, and to permit persons to whom the Software is furnished to
 do so, subject to the following conditions:

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

interface NativeResource {
    destroy(): void;
}
interface ResourceLifetime {
    readonly active: Set<symbol>;
    readonly pending: Map<NativeResource, Set<symbol>>;
    readonly retired: WeakSet<NativeResource>;
    closed: boolean;
}
const lifetimes = new WeakMap<object, ResourceLifetime>();

/** Internal admission for late asynchronous work; a closed device cannot create new GPU resources. */
export function assertWebGPUDeviceActive<T extends object>(device: {
    readonly isLost: boolean;
    readonly nativeDevice: T | null | undefined;
}): T {
    if (device.isLost || !device.nativeDevice) {
        throw Object.assign(new Error('WebGPU device is lost or closed.'), { code: 'WEBGPU_DEVICE_LOST' });
    }
    return device.nativeDevice;
}

function lifetime(device: object): ResourceLifetime {
    let state = lifetimes.get(device);
    if (!state) {
        state = { active: new Set(), pending: new Map(), retired: new WeakSet(), closed: false };
        lifetimes.set(device, state);
    }
    return state;
}

/** Internal: GFX defers native encoding until pass submission. End on submit OR abandonment. */
export function beginWebGPUResourceUse(device: object): () => void {
    const state = lifetime(device);
    if (state.closed) throw new Error('WEBGPU_DEVICE_LOST');
    const token = Symbol();
    state.active.add(token);
    return (): void => {
        if (!state.active.delete(token)) return;
        for (const [resource, blockers] of state.pending) {
            blockers.delete(token);
            if (!blockers.size) {
                state.pending.delete(resource);
                resource.destroy();
            }
        }
    };
}

/** Detach the old native handle before calling this; later scopes cannot reference it. */
export function retireWebGPUResource(device: object, resource: NativeResource): void {
    const state = lifetime(device);
    if (state.retired.has(resource)) return;
    state.retired.add(resource);
    if (!state.active.size || state.closed) resource.destroy();
    else state.pending.set(resource, new Set(state.active));
}

/** Device loss/destruction abandons every unsubmitted use, without waiting for another frame. */
export function closeWebGPUResourceUses(device: object): void {
    const state = lifetime(device);
    state.closed = true;
    state.active.clear();
    for (const resource of state.pending.keys()) resource.destroy();
    state.pending.clear();
}
