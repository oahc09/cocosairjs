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
/** Backend-neutral, opt-in, internal mutation admission. No runtime owner lookup or
 * executable policy callback. Register only copied object identities for the interval
 * controlled by the integrating owner. This primitive is not connected to engine writes.
 */
export interface MutationGuardLease {
    /** Releases only this lease's memberships; repeated release is safe. */
    dispose(): void;
}
export interface MutationGuardRejection {
    readonly code: string;
    readonly message: string;
}
interface Owner {
    readonly targets: readonly object[];
    readonly rejection: Readonly<MutationGuardRejection>;
    disposed: boolean;
}
const ownersByTarget = new WeakMap<object, Set<Owner>>();
let ownerCount = 0;
let reading: { failed: boolean } | undefined;

function rejectReentry(): void {
    if (!reading) return;
    reading.failed = true;
    throw new Error('Mutation guard admission cannot re-enter while copying inputs.');
}
function copyAdmission<T>(read: () => T): T {
    rejectReentry();
    const admission = { failed: false };
    reading = admission;
    try {
        const value = read();
        if (admission.failed) throw new Error('Mutation guard input caught a rejected nested admission.');
        return value;
    } finally {
        reading = undefined;
    }
}
function copyTargets(input: readonly object[], allowEmpty: boolean): readonly object[] {
    if (!Array.isArray(input)) throw new TypeError('Mutation guard targets must be an array.');
    const length = input.length;
    if (!Number.isSafeInteger(length) || length < (allowEmpty ? 0 : 1)) {
        throw new TypeError('Invalid mutation guard target count.');
    }
    const unique = new Set<object>();
    for (let index = 0; index < length; index++) {
        const target = input[index];
        if (target === null || typeof target !== 'object') {
            throw new TypeError('Mutation guard target must be an object identity.');
        }
        unique.add(target);
    }
    return Object.freeze(Array.from(unique));
}
function guardError(owner: Owner, operation: string): Error {
    // Never coerce caller-provided objects or execute a custom toString callback.
    const name = typeof operation === 'string' ? operation : 'unknown operation';
    return Object.assign(new Error(`${owner.rejection.message} (${name})`), {
        code: owner.rejection.code,
        operation: name,
    });
}

/** Copy and validate EVERY input before installing any membership. The returned
 * frozen closure is the only release capability; there is no dispose-by-token API.
 * Sharing its dispose function shares that one capability, never authority over
 * another lease. No owner/callback/native token is placed on guarded objects.
 */
export function registerMutationGuard(
    targets: readonly object[],
    rejection: Readonly<MutationGuardRejection>,
): MutationGuardLease {
    const copied = copyAdmission(() => {
        const identities = copyTargets(targets, false);
        if (rejection === null || typeof rejection !== 'object') {
            throw new TypeError('Mutation guard rejection must be an object.');
        }
        const code = rejection.code;
        const message = rejection.message;
        if (typeof code !== 'string' || !code || typeof message !== 'string' || !message) {
            throw new TypeError('Mutation guard rejection requires nonempty string code and message.');
        }
        return { identities, rejection: Object.freeze({ code, message }) };
    });
    const owner: Owner = { targets: copied.identities, rejection: copied.rejection, disposed: false };
    const lease = Object.freeze({
        dispose(): void {
            rejectReentry();
            if (owner.disposed) return;
            owner.disposed = true;
            for (const target of owner.targets) {
                const owners = ownersByTarget.get(target)!;
                owners.delete(owner);
                if (!owners.size) ownersByTarget.delete(target);
            }
            --ownerCount;
        },
    });
    const installed: object[] = [];
    try {
        for (const target of owner.targets) {
            installed.push(target);
            let owners = ownersByTarget.get(target);
            if (!owners) ownersByTarget.set(target, (owners = new Set()));
            owners.add(owner);
        }
        ++ownerCount;
        return lease;
    } catch (error) {
        // Standard allocation failures before complete registration leave no owner.
        for (const target of installed) {
            const owners = ownersByTarget.get(target);
            owners?.delete(owner);
            if (owners && !owners.size) ownersByTarget.delete(target);
        }
        throw error;
    }
}

/** With no lease for this identity, return without inspecting operation or values.
 * Calls made from a registration/batch input accessor reject before this fast path.
 */
export function assertMutationAllowed(target: object, operation: string): void {
    rejectReentry();
    if (!ownerCount) return;
    const owners = ownersByTarget.get(target);
    if (!owners?.size) return;
    throw guardError(owners.values().next().value!, operation);
}

/** No perform callback and no user operation is executed by this API. When any
 * guards exist, freeze a complete copied target list before checking memberships;
 * even a protected first target cannot skip a later input getter/validation error.
 * Same-registry registration/release/admission during copying is rejected and
 * latches failure even if the accessor swallows it. Arbitrary JS accessor side
 * effects outside this registry cannot be rolled back.
 */
export function assertMutationBatchAllowed(targets: readonly object[], operation: string): void {
    rejectReentry();
    if (!ownerCount) return;
    const copied = copyAdmission(() => copyTargets(targets, true));
    const blocked: Owner[] = [];
    for (const target of copied) {
        const owners = ownersByTarget.get(target);
        if (owners) blocked.push(...owners);
    }
    if (blocked.length) throw guardError(blocked[0], operation);
}
