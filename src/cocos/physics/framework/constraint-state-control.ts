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
/** Backend-neutral opt-in request/cache seam. Without an owner all existing
 * backends keep their original setters and lifecycle behavior. No native handle. */
export type ConstraintField =
    | 'connectedBody'
    | 'enableCollision'
    | 'breakForce'
    | 'breakTorque'
    | 'pivotA'
    | 'pivotB'
    | 'axis'
    | 'limitEnabled'
    | 'lowerLimit'
    | 'upperLimit'
    | 'motorEnabled'
    | 'motorVelocity'
    | 'motorForceLimit';
export interface ConstraintStateOwner {
    change(field: ConstraintField, value: unknown, commitCache: (admittedValue?: unknown) => void): void;
    assertDestroy(): void;
    read(): Readonly<Record<string, unknown>>;
}
const owners = new WeakMap<object, ConstraintStateOwner>();
let active = false;
export function registerConstraintStateOwner(target: object, owner: ConstraintStateOwner): { dispose(): void } {
    if (active || owners.has(target)) throw new Error('Constraint state owner is already installed or reentrant.');
    const copy = Object.freeze({
        change: owner.change.bind(owner),
        assertDestroy: owner.assertDestroy.bind(owner),
        read: owner.read.bind(owner),
    });
    owners.set(target, copy);
    return Object.freeze({
        dispose() {
            if (owners.get(target) === copy) owners.delete(target);
        },
    });
}
export function tryChangeConstraintState(
    target: object,
    field: ConstraintField,
    value: unknown,
    commitCache: (admittedValue?: unknown) => void,
): boolean {
    const owner = owners.get(target);
    if (!owner) return false;
    if (active)
        throw Object.assign(new Error('Constraint request cannot re-enter.'), { code: 'AIR_E_BOX3D_REENTRANT' });
    active = true;
    try {
        owner.change(field, value, commitCache);
        return true;
    } finally {
        active = false;
    }
}
export function assertConstraintDestroyAllowed(target: object): void {
    owners.get(target)?.assertDestroy();
}
export function readConstraintState(target: object): Readonly<Record<string, unknown>> {
    const owner = owners.get(target);
    if (!owner) throw Object.assign(new Error('No live Box3D constraint owner.'), { code: 'AIR_E_BOX3D_DISPOSED' });
    return owner.read();
}
