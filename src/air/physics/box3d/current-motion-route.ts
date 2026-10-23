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
import type { CommandInput } from './command-queue';
import { worldError } from './world-binding';

/** Private realm-current route. A retained handle must reach the current queue's
 * admission before old owner/generation/handle identity is inspected.
 */
export interface Box3DCurrentMotionHandlers {
    submit(owner: object, handle: object, read: () => CommandInput): void;
    revoke(owner: object, handle: object): void;
}
export interface Box3DCurrentMotionLease {
    dispose(): void;
}
interface Owner {
    readonly identity: object;
    readonly submit: Box3DCurrentMotionHandlers['submit'];
    readonly revoke: Box3DCurrentMotionHandlers['revoke'];
    disposed: boolean;
}
let current: Owner | undefined;
let reading: { failed: boolean } | undefined;
let activeCalls = 0;
function reject(message: string): never {
    if (reading) reading.failed = true;
    throw worldError('AIR_E_BOX3D_REENTRANT', 'current motion route', message);
}
function mutable(): void {
    if (reading) reject('Registration cannot re-enter while copying handlers.');
    if (activeCalls) reject('The current owner cannot change during an admitted call.');
}
export function registerBox3DCurrentMotionOwner(
    identity: object,
    handlers: Box3DCurrentMotionHandlers,
): Box3DCurrentMotionLease {
    mutable();
    if (current) reject('A motion owner is already registered.');
    const admission = { failed: false };
    reading = admission;
    try {
        if (!identity || typeof identity !== 'object' || !handlers || typeof handlers !== 'object')
            reject('Expected exact owner identity and handler object.');
        const submit = handlers.submit,
            revoke = handlers.revoke;
        if (typeof submit !== 'function' || typeof revoke !== 'function') reject('Missing motion handlers.');
        if (admission.failed) reject('Handler copying caught a rejected nested admission.');
        const owner: Owner = { identity, submit, revoke, disposed: false };
        const lease = Object.freeze({
            dispose(): void {
                if (reading) reject('Registration cannot re-enter during handler copying.');
                if (owner.disposed) return;
                mutable();
                if (current !== owner) reject('Motion route identity changed.');
                owner.disposed = true;
                current = undefined;
            },
        });
        current = owner;
        return lease;
    } finally {
        reading = undefined;
    }
}
function withCurrent(perform: (owner: Owner) => void): void {
    if (reading) reject('Motion entry cannot re-enter handler registration.');
    const owner = current;
    if (!owner) throw worldError('AIR_E_BOX3D_DISPOSED', 'target handle', 'No current Box3D motion owner.');
    ++activeCalls;
    try {
        perform(owner);
    } finally {
        --activeCalls;
    }
}
export function submitBox3DCurrentTarget(owner: object, handle: object, read: () => CommandInput): void {
    withCurrent((currentOwner) => currentOwner.submit(owner, handle, read));
}
export function revokeBox3DCurrentTarget(owner: object, handle: object): void {
    withCurrent((currentOwner) => currentOwner.revoke(owner, handle));
}
