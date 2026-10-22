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
/** Internal, backend-neutral command entry seam. Only an explicitly registered owner
 * can opt in; no selector, component fields, adapter or native capability is inspected.
 * The owner MUST admit and resolve the source inside its queue's latched submission
 * reader, fence the complete copy/publication interval, and validate actual lifetime.
 */
export type PhysicsBodyCommandVector = Readonly<{ x: number; y: number; z: number }>;
export type PhysicsBodyCommandInput =
    | {
          readonly kind: 'force' | 'impulse';
          readonly vector: PhysicsBodyCommandVector;
          readonly relativePoint?: PhysicsBodyCommandVector;
          readonly space?: 'world' | 'local';
      }
    | {
          readonly kind: 'torque' | 'angular-impulse';
          readonly vector: PhysicsBodyCommandVector;
          readonly space?: 'world' | 'local';
      }
    | { readonly kind: 'clear-state' | 'clear-forces' | 'clear-velocity' };
export interface PhysicsCommandOwnerHandlers {
    submit(source: object, read: () => PhysicsBodyCommandInput): number;
    assertConfiguration(operation: string): void;
}
export interface PhysicsCommandOwnerLease {
    dispose(): void;
}
interface Owner {
    readonly identity: object;
    readonly submit: PhysicsCommandOwnerHandlers['submit'];
    readonly assertConfiguration: PhysicsCommandOwnerHandlers['assertConfiguration'];
    disposed: boolean;
}
let current: Owner | undefined;
let reading: { failed: boolean } | undefined;
let activeCalls = 0;

function rejectRegistrationReentry(): void {
    if (!reading) return;
    reading.failed = true;
    throw new Error('Physics command owner registration cannot re-enter while copying handlers.');
}
function assertRegistryMutable(): void {
    rejectRegistrationReentry();
    if (activeCalls) throw new Error('Physics command owner cannot change during an admitted call.');
}

/** One live exact owner per realm. Capture both handlers once before publication;
 * caught same-registry reentry during their getters invalidates the registration.
 * The frozen lease exposes only its own release, never owner/handler/native state.
 */
export function registerPhysicsCommandOwner(
    ownerIdentity: object,
    handlers: PhysicsCommandOwnerHandlers,
): PhysicsCommandOwnerLease {
    assertRegistryMutable();
    if (current) {
        throw new Error(
            current.identity === ownerIdentity
                ? 'Physics command owner is already registered.'
                : 'Another physics command owner is already registered.',
        );
    }
    const admission = { failed: false };
    reading = admission;
    try {
        if (ownerIdentity === null || typeof ownerIdentity !== 'object') {
            throw new TypeError('Physics command owner must be an object identity.');
        }
        if (handlers === null || typeof handlers !== 'object') {
            throw new TypeError('Physics command owner handlers must be an object.');
        }
        const submit = handlers.submit;
        const assertConfiguration = handlers.assertConfiguration;
        if (typeof submit !== 'function' || typeof assertConfiguration !== 'function') {
            throw new TypeError('Physics command owner requires submit and configuration handlers.');
        }
        if (admission.failed) throw new Error('Physics command owner input caught a rejected nested admission.');
        const owner: Owner = { identity: ownerIdentity, submit, assertConfiguration, disposed: false };
        const lease = Object.freeze({
            dispose(): void {
                rejectRegistrationReentry();
                if (owner.disposed) return;
                assertRegistryMutable();
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

/** No owner means no input reads and an unchanged legacy path. Once registered,
 * every source (including wrong/uninitialized sources) reaches owner admission;
 * never fall back after rejection or copy original vectors ahead of that admission.
 * Nested submissions also reach the owner so its queue can latch caught refusals.
 */
export function trySubmitPhysicsBodyCommand(source: object, read: () => PhysicsBodyCommandInput): boolean {
    rejectRegistrationReentry();
    const owner = current;
    if (!owner) return false;
    const submit = owner.submit;
    ++activeCalls;
    try {
        submit(source, read);
        return true;
    } finally {
        --activeCalls;
    }
}

/** Velocity setters remain configuration, not queued commands. This early gate
 * covers unowned/uninitialized components too; existing instance guards still run.
 */
export function assertPhysicsBodyVelocityConfiguration(operation: string): void {
    rejectRegistrationReentry();
    const owner = current;
    if (!owner) return;
    const assertConfiguration = owner.assertConfiguration;
    ++activeCalls;
    try {
        assertConfiguration(operation);
    } finally {
        --activeCalls;
    }
}
