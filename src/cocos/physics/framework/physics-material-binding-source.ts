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
/** Private factory/source glue. This records actual adapter construction identity, never a backend label. */
import {
    getOrRegisterMaterialWorld,
    registerMaterialSource,
    prepareBindingIdentity,
    markMaterialSourceInitialized,
    markMaterialSourceUnknown,
    closeMaterialSource,
    recordMaterialAcquisitionUnknown,
    beginMaterialSourceInitialization,
} from './physics-material-bindings';
import type { MaterialWorldLease, MaterialSourceLease, MaterialIdentityTransition } from './physics-material-bindings';

const adapterWorlds = new WeakMap<object, MaterialWorldLease>();
const nonphysical = new WeakSet<object>();
const sources = new WeakMap<
    object,
    Readonly<{
        adapter: object;
        world: MaterialWorldLease;
        lease: MaterialSourceLease;
    }>
>();

export function recordPhysicsMaterialWorld(world: object, physical: boolean): void {
    if (physical) getOrRegisterMaterialWorld(world);
    else nonphysical.add(world);
}

export function recordPhysicsMaterialAdapter(adapter: object, world: object | null, physical: boolean): void {
    if (!physical || (world !== null && nonphysical.has(world))) {
        nonphysical.add(adapter);
        return;
    }
    if (world === null) {
        // The actual construction has no world identity; never substitute a later selector world.
        recordMaterialAcquisitionUnknown();
        return;
    }
    const lease = getOrRegisterMaterialWorld(world);
    const prior = adapterWorlds.get(adapter);
    if (prior && prior !== lease) {
        recordMaterialAcquisitionUnknown();
        throw new Error('Material adapter construction world changed.');
    }
    adapterWorlds.set(adapter, lease);
}

export function ensurePhysicsMaterialSource(
    source: object,
    adapter: object,
    role: 'explicit' | 'default',
    readActualCache: () => object | null,
): MaterialSourceLease | undefined {
    if (nonphysical.has(adapter)) return undefined;
    const world = role === 'default' ? getOrRegisterMaterialWorld(adapter) : adapterWorlds.get(adapter);
    const current = readActualCache();
    if (!world) {
        recordMaterialAcquisitionUnknown(current);
        return undefined;
    }
    const previous = sources.get(source);
    if (previous?.adapter === adapter && previous.world === world) return previous.lease;
    const lease = registerMaterialSource({ source, adapter, world, role, current, readActualCache });
    sources.set(source, Object.freeze({ adapter, world, lease }));
    return lease;
}

export function beginPhysicsMaterialSourceIdentity(
    source: object,
    before: object | null,
    candidate: object | null,
    operation: string,
): MaterialIdentityTransition | undefined {
    const record = sources.get(source);
    return record ? prepareBindingIdentity(record.lease, before, candidate, operation) : undefined;
}

export function initializePhysicsMaterialSource(source: object): void {
    const record = sources.get(source);
    if (record) markMaterialSourceInitialized(record.lease);
}

export function markPhysicsMaterialSourceUnknown(source: object, actual?: object | null): void {
    const record = sources.get(source);
    if (record) markMaterialSourceUnknown(record.lease, actual);
}

export function closePhysicsMaterialSourceUnknown(source: object): void {
    const record = sources.get(source);
    if (record) closeMaterialSource(record.lease);
}

/** Captured factory identities only. A later selector world or public material getter is not authority. */
export function beginPhysicsMaterialSourceInitialization(source: object, adapter: object, actualWorld: object) {
    const record = sources.get(source);
    if (!record || record.adapter !== adapter || adapterWorlds.get(adapter) !== record.world) {
        throw new Error('Missing exact material source construction identity.');
    }
    return beginMaterialSourceInitialization(record.lease, source, adapter, actualWorld);
}
