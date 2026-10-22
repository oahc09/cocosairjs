/** Reject poisoned native TRS before modifying the node or its descendants. */
export function validateTransformValues (method: string, values: readonly unknown[], node: string): void {
    if (values.some(value => typeof value !== 'number' || !Number.isFinite(value) || !Number.isFinite(Math.fround(value)))) {
        throw Object.assign(new TypeError(`[AIR_E_NODE_TRANSFORM] ${method} requires finite float32 components; use a Vec3/Quat or the documented numeric overload`),
            { code: 'AIR_E_NODE_TRANSFORM', method, node });
    }
}

/** Internal opt-in ownership primitives. No backend or Node runtime dependency. */
export type NodeTransformWriteOperation = 'setWorldPosition' | 'setWorldRotation';

/** Private, finite write capability. Disposal burns unused capacity without releasing ownership. */
export interface NodeTransformWriteReservation {
    dispose(): void;
    write(node: object, operation: NodeTransformWriteOperation, expected: readonly number[], perform: () => void): void;
}

export interface NodeTransformGuardLease extends NodeTransformWriteReservation {
    /** Pure capacity check: no sequence allocation, expected-value reads or Node mutation. */
    assertWriteCapacity(count: number): void;
    /** Permanently allocates a disjoint grant range. Zero is valid but cannot authorize a write. */
    reserveWrites(count: number): NodeTransformWriteReservation;
}

type GrantState = 'pending' | 'reading' | 'entered' | 'consumed';
interface TransformGrant {
    readonly node: object;
    readonly operation: NodeTransformWriteOperation;
    readonly expected: readonly number[];
    readonly sequence: number;
    readonly reservation: TransformReservation | undefined;
    state: GrantState;
}
interface TransformReservation {
    disposed: boolean;
    sequence: number;
    readonly end: number;
}
interface TransformOwner {
    readonly nodes: Set<object>;
    readonly code: string;
    readonly message: string;
    disposed: boolean;
    sequence: number;
    preparing: boolean;
    grant: TransformGrant | undefined;
}
const transformOwners = new WeakMap<object, Set<TransformOwner>>();

function transformGuardError(owner: TransformOwner, operation: string, reason: string): Error {
    return Object.assign(new Error(`${owner.message} (${operation}: ${reason})`), { code: owner.code, operation });
}
function sameTransformValues(a: readonly unknown[], b: readonly number[]): boolean {
    return a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
}

function assertTransformWriteCapacity(owner: TransformOwner, count: number, operation: string): void {
    if (owner.disposed) throw transformGuardError(owner, operation, 'disposed ownership');
    if (owner.preparing || owner.grant) throw transformGuardError(owner, operation, 'same-owner nested grant');
    if (!Number.isSafeInteger(count) || count < 0) {
        throw transformGuardError(owner, operation, 'invalid grant count');
    }
    if (count > Number.MAX_SAFE_INTEGER - owner.sequence) {
        throw transformGuardError(owner, operation, 'grant sequence exhausted');
    }
}

function writeTransform(
    owner: TransformOwner,
    reservation: TransformReservation | undefined,
    node: object,
    operation: NodeTransformWriteOperation,
    expected: readonly number[],
    perform: () => void,
): void {
    if (owner.disposed) throw transformGuardError(owner, operation, 'disposed ownership');
    if (owner.preparing || owner.grant) throw transformGuardError(owner, operation, 'same-owner nested grant');
    let sequence: number;
    if (reservation) {
        if (reservation.disposed) throw transformGuardError(owner, operation, 'disposed write reservation');
        if (reservation.sequence >= reservation.end) {
            throw transformGuardError(owner, operation, 'write reservation exhausted');
        }
        sequence = ++reservation.sequence;
    } else {
        assertTransformWriteCapacity(owner, 1, operation);
        sequence = ++owner.sequence;
    }
    // Burn the attempt and close same-owner reentry before any caller-controlled expected getter.
    // Neither an invalid candidate nor a falsy thrown value can return this sequence to circulation.
    owner.preparing = true;
    let grant: TransformGrant | undefined;
    try {
        const length = operation === 'setWorldPosition' ? 3 : operation === 'setWorldRotation' ? 4 : 0;
        const copied = Array.isArray(expected) ? Array.from(expected) : [];
        if (owner.disposed || reservation?.disposed) {
            throw transformGuardError(owner, operation, 'ownership or write reservation disposed while copying grant');
        }
        if (
            !owner.nodes.has(node) ||
            !length ||
            copied.length !== length ||
            copied.some(
                (value) => typeof value !== 'number' || !Number.isFinite(value) || !Number.isFinite(Math.fround(value)),
            ) ||
            typeof perform !== 'function'
        ) {
            throw transformGuardError(owner, operation, 'invalid exact write grant');
        }
        grant = {
            node,
            operation,
            expected: Object.freeze(copied),
            sequence,
            reservation,
            state: 'pending',
        };
        owner.preparing = false;
        owner.grant = grant;
        perform();
        if (owner.disposed || reservation?.disposed || owner.grant !== grant || grant.state !== 'consumed') {
            throw transformGuardError(owner, operation, 'owned write did not retain valid consumed permission');
        }
    } finally {
        owner.preparing = false;
        if (owner.grant === grant) owner.grant = undefined;
    }
}

/** Register copied object identities. The private returned capability is not a public Node property. */
export function registerNodeTransformGuard(
    nodes: readonly object[],
    rejection: Readonly<{ code: string; message: string }>,
): NodeTransformGuardLease {
    if (
        !Array.isArray(nodes) ||
        !nodes.length ||
        nodes.some((node) => node === null || typeof node !== 'object') ||
        !rejection ||
        typeof rejection.code !== 'string' ||
        !rejection.code ||
        typeof rejection.message !== 'string' ||
        !rejection.message
    ) {
        throw new TypeError('Invalid internal Node transform guard registration.');
    }
    const owner: TransformOwner = {
        nodes: new Set(nodes),
        code: rejection.code,
        message: rejection.message,
        disposed: false,
        sequence: 0,
        preparing: false,
        grant: undefined,
    };
    for (const node of owner.nodes) {
        let owners = transformOwners.get(node);
        if (!owners) transformOwners.set(node, (owners = new Set()));
        owners.add(owner);
    }
    return Object.freeze({
        dispose(): void {
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
        assertWriteCapacity(count: number): void {
            assertTransformWriteCapacity(owner, count, 'assertWriteCapacity');
        },
        reserveWrites(count: number): NodeTransformWriteReservation {
            assertTransformWriteCapacity(owner, count, 'reserveWrites');
            const reservation: TransformReservation = {
                disposed: false,
                sequence: owner.sequence,
                end: owner.sequence + count,
            };
            // Reservation disposal and failed writes never roll back the allocated upper bound.
            owner.sequence = reservation.end;
            return Object.freeze({
                dispose(): void {
                    if (reservation.disposed) return;
                    reservation.disposed = true;
                    if (owner.grant?.reservation === reservation) owner.grant = undefined;
                },
                write(
                    node: object,
                    operation: NodeTransformWriteOperation,
                    expected: readonly number[],
                    perform: () => void,
                ): void {
                    writeTransform(owner, reservation, node, operation, expected, perform);
                },
            });
        },
        write(
            node: object,
            operation: NodeTransformWriteOperation,
            expected: readonly number[],
            perform: () => void,
        ): void {
            writeTransform(owner, undefined, node, operation, expected, perform);
        },
    });
}

/**
 * Runs before cache-refreshing getters. With no lease, does not even evaluate readValues.
 * Only exact complete world-pose candidates can enter an owned setter. The returned copy
 * must be the values actually written, not re-read user accessors after admission.
 */
export function assertNodeTransformEntry(
    node: object,
    operation: string,
    readValues?: () => readonly unknown[],
): readonly number[] | undefined {
    const owners = transformOwners.get(node);
    if (!owners) return undefined;
    const ownerList = Array.from(owners);
    const grants: TransformGrant[] = [];
    for (const owner of ownerList) {
        const grant = owner.grant;
        if (
            !grant ||
            grant.state !== 'pending' ||
            grant.node !== node ||
            grant.operation !== operation ||
            !readValues
        ) {
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
        if (!current || current.size !== ownerList.length || ownerList.some((owner) => !current.has(owner))) {
            throw transformGuardError(ownerList[0], operation, 'ownership changed while copying candidate');
        }
        let index = 0;
        for (const owner of ownerList) {
            const grant = grants[index++];
            if (
                owner.disposed ||
                owner.grant !== grant ||
                grant.state !== 'reading' ||
                !sameTransformValues(values, grant.expected)
            ) {
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
export function assertNodeTransformWrite(node: object, operation: string, values: readonly number[]): void {
    const owners = transformOwners.get(node);
    if (!owners) return;
    const grants: TransformGrant[] = [];
    for (const owner of owners) {
        const grant = owner.grant;
        if (
            !grant ||
            grant.state !== 'entered' ||
            grant.node !== node ||
            grant.operation !== operation ||
            !sameTransformValues(values, grant.expected)
        ) {
            throw transformGuardError(owner, operation, 'write does not match admitted grant');
        }
        grants.push(grant);
    }
    for (const grant of grants) grant.state = 'consumed';
}
