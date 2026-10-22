/** Reject poisoned native TRS before modifying the node or its descendants. */
export function validateTransformValues (method: string, values: readonly unknown[], node: string): void {
    if (values.some(value => typeof value !== 'number' || !Number.isFinite(value) || !Number.isFinite(Math.fround(value)))) {
        throw Object.assign(new TypeError(`[AIR_E_NODE_TRANSFORM] ${method} requires finite float32 components; use a Vec3/Quat or the documented numeric overload`),
            { code: 'AIR_E_NODE_TRANSFORM', method, node });
    }
}

/** Internal opt-in ownership primitives. No backend or Node runtime dependency. */
export type NodeTransformWriteOperation = 'setWorldPosition' | 'setWorldRotation';

export interface NodeTransformGuardLease {
    dispose (): void;
    write (node: object, operation: NodeTransformWriteOperation, expected: readonly number[], perform: () => void): void;
}

type GrantState = 'pending' | 'reading' | 'entered' | 'consumed';
interface TransformGrant {
    readonly node: object;
    readonly operation: NodeTransformWriteOperation;
    readonly expected: readonly number[];
    readonly sequence: number;
    state: GrantState;
}
interface TransformOwner {
    readonly nodes: Set<object>;
    readonly code: string;
    readonly message: string;
    disposed: boolean;
    sequence: number;
    grant: TransformGrant | undefined;
}
const transformOwners = new WeakMap<object, Set<TransformOwner>>();

function transformGuardError (owner: TransformOwner, operation: string, reason: string): Error {
    return Object.assign(new Error(`${owner.message} (${operation}: ${reason})`), { code: owner.code, operation });
}
function sameTransformValues (a: readonly unknown[], b: readonly number[]): boolean {
    return a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
}

/** Register copied object identities. The private returned capability is not a public Node property. */
export function registerNodeTransformGuard (
    nodes: readonly object[],
    rejection: Readonly<{ code: string; message: string }>,
): NodeTransformGuardLease {
    if (!Array.isArray(nodes) || !nodes.length || nodes.some(node => node === null || typeof node !== 'object')
        || !rejection || typeof rejection.code !== 'string' || !rejection.code
        || typeof rejection.message !== 'string' || !rejection.message) {
        throw new TypeError('Invalid internal Node transform guard registration.');
    }
    const owner: TransformOwner = {
        nodes: new Set(nodes), code: rejection.code, message: rejection.message,
        disposed: false, sequence: 0, grant: undefined,
    };
    for (const node of owner.nodes) {
        let owners = transformOwners.get(node);
        if (!owners) transformOwners.set(node, owners = new Set());
        owners.add(owner);
    }
    return Object.freeze({
        dispose (): void {
            if (owner.disposed) return;
            owner.disposed = true;
            owner.grant = undefined;
            for (const node of owner.nodes) {
                const owners = transformOwners.get(node)!;
                owners.delete(owner);
                if (!owners.size) transformOwners.delete(node);
            }
            owner.nodes.clear();
        },
        write (node: object, operation: NodeTransformWriteOperation, expected: readonly number[], perform: () => void): void {
            if (owner.disposed) throw transformGuardError(owner, operation, 'disposed ownership');
            if (owner.grant) throw transformGuardError(owner, operation, 'same-owner nested grant');
            const length = operation === 'setWorldPosition' ? 3 : operation === 'setWorldRotation' ? 4 : 0;
            const copied = Array.isArray(expected) ? Array.from(expected) : [];
            if (!owner.nodes.has(node) || !length || copied.length !== length
                || copied.some(value => typeof value !== 'number' || !Number.isFinite(value) || !Number.isFinite(Math.fround(value)))
                || typeof perform !== 'function') {
                throw transformGuardError(owner, operation, 'invalid exact write grant');
            }
            if (owner.sequence >= Number.MAX_SAFE_INTEGER) throw transformGuardError(owner, operation, 'grant sequence exhausted');
            const grant: TransformGrant = {
                node, operation, expected: Object.freeze(copied),
                sequence: ++owner.sequence, state: 'pending',
            };
            owner.grant = grant;
            try {
                perform();
                if (owner.disposed || owner.grant !== grant || grant.state !== 'consumed') {
                    throw transformGuardError(owner, operation, 'owned write did not retain valid consumed permission');
                }
            } finally {
                if (owner.grant === grant) owner.grant = undefined;
            }
        },
    });
}

/**
 * Runs before cache-refreshing getters. With no lease, does not even evaluate readValues.
 * Only exact complete world-pose candidates can enter an owned setter. The returned copy
 * must be the values actually written, not re-read user accessors after admission.
 */
export function assertNodeTransformEntry (
    node: object, operation: string, readValues?: () => readonly unknown[],
): readonly number[] | undefined {
    const owners = transformOwners.get(node);
    if (!owners) return undefined;
    const ownerList = Array.from(owners);
    const grants: TransformGrant[] = [];
    for (const owner of ownerList) {
        const grant = owner.grant;
        if (!grant || grant.state !== 'pending' || grant.node !== node || grant.operation !== operation || !readValues) {
            throw transformGuardError(owner, operation, 'motion is owned');
        }
        grants.push(grant);
    }
    // An input accessor cannot re-enter and steal a still-pending grant.
    for (const grant of grants) grant.state = 'reading';
    let values: readonly unknown[];
    try {
        values = Array.from(readValues!());
        const current = transformOwners.get(node);
        if (!current || current.size !== ownerList.length || ownerList.some(owner => !current.has(owner))) {
            throw transformGuardError(ownerList[0], operation, 'ownership changed while copying candidate');
        }
        let index = 0;
        for (const owner of ownerList) {
            const grant = grants[index++];
            if (owner.disposed || owner.grant !== grant || grant.state !== 'reading' || !sameTransformValues(values, grant.expected)) {
                throw transformGuardError(owner, operation, 'candidate does not match exact write grant');
            }
        }
    } catch (error) {
        for (const grant of grants) if (grant.state === 'reading') grant.state = 'pending';
        throw error;
    }
    for (const grant of grants) grant.state = 'entered';
    return Object.freeze(values as number[]);
}

/** Verify every affected lease first; consume all permits before any user event can run. */
export function assertNodeTransformWrite (node: object, operation: string, values: readonly number[]): void {
    const owners = transformOwners.get(node);
    if (!owners) return;
    const grants: TransformGrant[] = [];
    for (const owner of owners) {
        const grant = owner.grant;
        if (!grant || grant.state !== 'entered' || grant.node !== node || grant.operation !== operation
            || !sameTransformValues(values, grant.expected)) {
            throw transformGuardError(owner, operation, 'write does not match admitted grant');
        }
        grants.push(grant);
    }
    for (const grant of grants) grant.state = 'consumed';
}
