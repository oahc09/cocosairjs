"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertMutationBatchAllowed = exports.assertMutationAllowed = exports.registerMutationGuard = void 0;
const ownersByTarget = new WeakMap();
let ownerCount = 0;
let reading;
function rejectReentry() {
    if (!reading)
        return;
    reading.failed = true;
    throw new Error('Mutation guard admission cannot re-enter while copying inputs.');
}
function copyAdmission(read) {
    rejectReentry();
    const admission = { failed: false };
    reading = admission;
    try {
        const value = read();
        if (admission.failed)
            throw new Error('Mutation guard input caught a rejected nested admission.');
        return value;
    }
    finally {
        reading = undefined;
    }
}
function copyTargets(input, allowEmpty) {
    if (!Array.isArray(input))
        throw new TypeError('Mutation guard targets must be an array.');
    const length = input.length;
    if (!Number.isSafeInteger(length) || length < (allowEmpty ? 0 : 1)) {
        throw new TypeError('Invalid mutation guard target count.');
    }
    const unique = new Set();
    for (let index = 0; index < length; index++) {
        const target = input[index];
        if (target === null || typeof target !== 'object') {
            throw new TypeError('Mutation guard target must be an object identity.');
        }
        unique.add(target);
    }
    return Object.freeze(Array.from(unique));
}
function guardError(owner, operation) {
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
function registerMutationGuard(targets, rejection) {
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
    const owner = { targets: copied.identities, rejection: copied.rejection, disposed: false };
    const lease = Object.freeze({
        dispose() {
            rejectReentry();
            if (owner.disposed)
                return;
            owner.disposed = true;
            for (const target of owner.targets) {
                const owners = ownersByTarget.get(target);
                owners.delete(owner);
                if (!owners.size)
                    ownersByTarget.delete(target);
            }
            --ownerCount;
        },
    });
    const installed = [];
    try {
        for (const target of owner.targets) {
            installed.push(target);
            let owners = ownersByTarget.get(target);
            if (!owners)
                ownersByTarget.set(target, (owners = new Set()));
            owners.add(owner);
        }
        ++ownerCount;
        return lease;
    }
    catch (error) {
        // Standard allocation failures before complete registration leave no owner.
        for (const target of installed) {
            const owners = ownersByTarget.get(target);
            owners?.delete(owner);
            if (owners && !owners.size)
                ownersByTarget.delete(target);
        }
        throw error;
    }
}
exports.registerMutationGuard = registerMutationGuard;
/** With no lease for this identity, return without inspecting operation or values.
 * Calls made from a registration/batch input accessor reject before this fast path.
 */
function assertMutationAllowed(target, operation) {
    rejectReentry();
    if (!ownerCount)
        return;
    const owners = ownersByTarget.get(target);
    if (!owners?.size)
        return;
    throw guardError(owners.values().next().value, operation);
}
exports.assertMutationAllowed = assertMutationAllowed;
/** No perform callback and no user operation is executed by this API. When any
 * guards exist, freeze a complete copied target list before checking memberships;
 * even a protected first target cannot skip a later input getter/validation error.
 * Same-registry registration/release/admission during copying is rejected and
 * latches failure even if the accessor swallows it. Arbitrary JS accessor side
 * effects outside this registry cannot be rolled back.
 */
function assertMutationBatchAllowed(targets, operation) {
    rejectReentry();
    if (!ownerCount)
        return;
    const copied = copyAdmission(() => copyTargets(targets, true));
    const blocked = [];
    for (const target of copied) {
        const owners = ownersByTarget.get(target);
        if (owners)
            blocked.push(...owners);
    }
    if (blocked.length)
        throw guardError(blocked[0], operation);
}
exports.assertMutationBatchAllowed = assertMutationBatchAllowed;
