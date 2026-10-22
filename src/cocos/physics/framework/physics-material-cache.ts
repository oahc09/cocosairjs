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
/** Private constructor-installed coefficient source. This module is deliberately absent from public barrels.
 * A public accessor, instanceof check, listener or backend name is not cache-reading authority.
 * The captured reader refers only to the material's original private fields. Foreign paths do not use it.
 */
export type PhysicsMaterialPrivateValues = readonly [number, number, number, number];
const readers = new WeakMap<object, () => PhysicsMaterialPrivateValues>();

/** Called exactly once by the actual PhysicsMaterial constructor. Does not read any coefficients. */
export function registerPhysicsMaterialPrivateCache(asset: object, read: () => PhysicsMaterialPrivateValues): void {
    if (asset === null || typeof asset !== 'object' || typeof read !== 'function')
        throw new TypeError('Expected an actual material identity and fixed private cache reader.');
    if (readers.has(asset)) throw new Error('PhysicsMaterial private cache identity is already registered.');
    readers.set(asset, read);
}

/** Read a fresh copied tuple only from constructor-installed authority. Never falls back to public getters. */
export function readPhysicsMaterialPrivateValues(asset: object): PhysicsMaterialPrivateValues {
    const read = asset !== null && typeof asset === 'object' ? readers.get(asset) : undefined;
    if (!read) throw new Error('Expected constructor-authenticated PhysicsMaterial private cache source.');
    const values = read();
    if (!Array.isArray(values) || values.length !== 4)
        throw new TypeError('Expected the fixed four-coefficient private material tuple.');
    const copied: [number, number, number, number] = [values[0], values[1], values[2], values[3]];
    if (copied.some((value) => typeof value !== 'number'))
        throw new TypeError('Private material coefficients must be numbers.');
    return Object.freeze(copied);
}
