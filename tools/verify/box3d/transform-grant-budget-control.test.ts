/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Actual Node + neutral ownership source. Native-call sentinels below are synthetic, not WASM qualification.
 */
import '../../../src/exports/base';
import '../../../src/cocos/game';
import { Node } from '../../../src/cocos/scene-graph/node';
import { NodeEventType } from '../../../src/cocos/scene-graph/node-event';
import { Vec3, Quat } from '../../../src/cocos/core/math';
import { registerNodeTransformGuard } from '../../../src/cocos/scene-graph/node-transform-validation';
import type {
    NodeTransformGuardLease,
    NodeTransformWriteReservation,
} from '../../../src/cocos/scene-graph/node-transform-validation';

const maximum = Number.MAX_SAFE_INTEGER;
const leases: NodeTransformGuardLease[] = [];
const rejection = Object.freeze({ code: 'AIR_E_BOX3D_CONFIG', message: 'grant-budget source control' });
const guard = (...nodes: Node[]) => {
    const lease = registerNodeTransformGuard(nodes, rejection);
    leases.push(lease);
    return lease;
};
const position = Object.freeze([7, 8, 9]);
const rotation = Object.freeze([0, 0, 1, 0]);
function positionWrite(writer: NodeTransformWriteReservation, node: Node): void {
    writer.write(node, 'setWorldPosition', position, () => node.setWorldPosition(7, 8, 9));
}
function caught(action: () => void): { threw: boolean; value?: unknown } {
    try {
        action();
        return { threw: false };
    } catch (value) {
        return { threw: true, value };
    }
}
function getterArray(read: () => void): number[] {
    const values = [7, 8, 9];
    Object.defineProperty(values, 0, {
        get() {
            read();
            return 7;
        },
    });
    return values;
}
function state(node: Node): unknown {
    const n = node as any;
    return {
        local: [n._lpos.clone(), n._lrot.clone(), n._lscale.clone()],
        world: [n._pos.clone(), n._rot.clone(), n._scale.clone(), n._mat.clone()],
        flags: [n._transformFlags, n._hasChangedFlags, n._flagChangeVersion, n._eulerDirty, n._objFlags],
        parent: n._parent,
    };
}
afterEach(() => {
    while (leases.length) leases.pop()!.dispose();
    jest.restoreAllMocks();
});

test('capacity check is pure and repeatable at the real MAX_SAFE_INTEGER boundary', () => {
    const node = new Node('capacity'), lease = guard(node);
    const before = state(node);
    for (let i = 0; i < 4; i++) lease.assertWriteCapacity(maximum);
    const reserved = lease.reserveWrites(maximum);
    expect(Object.isFrozen(lease)).toBe(true);
    expect(Object.isFrozen(reserved)).toBe(true);
    lease.assertWriteCapacity(0);
    expect(() => lease.assertWriteCapacity(1)).toThrow(/sequence exhausted/);
    expect(() => lease.reserveWrites(1)).toThrow(/sequence exhausted/);
    expect(state(node)).toEqual(before);
    positionWrite(reserved, node);
    expect(node.worldPosition).toEqual(new Vec3(7, 8, 9));
});

test('two exact planned setters refuse before expected getters, Node writes or synthetic native apply', () => {
    const node = new Node('pre-native'), lease = guard(node);
    lease.reserveWrites(maximum - 1).dispose();
    const calls = { expected: 0, node: 0, nativeApply: 0, nativeStep: 0 };
    const before = state(node);
    const expected = getterArray(() => calls.expected++);
    expect(() => {
        lease.assertWriteCapacity(2);
        const reservation = lease.reserveWrites(2);
        calls.nativeApply++;
        calls.nativeStep++;
        reservation.write(node, 'setWorldPosition', expected, () => {
            calls.node++;
            node.setWorldPosition(7, 8, 9);
        });
    }).toThrow(/sequence exhausted/);
    expect(calls).toEqual({ expected: 0, node: 0, nativeApply: 0, nativeStep: 0 });
    expect(state(node)).toEqual(before);
    // A failed check/reservation has not allocated the last sequence.
    expect(() => lease.reserveWrites(2)).toThrow(/sequence exhausted/);
    positionWrite(lease.reserveWrites(1), node);
});

for (const invalid of [-1, 0.5, NaN, Infinity, -Infinity, maximum + 1, '1', null, undefined, 1n]) {
    test(`invalid count ${String(invalid)} fails without allocating or coercing`, () => {
        const lease = guard(new Node('invalid count'));
        expect(() => lease.assertWriteCapacity(invalid as number)).toThrow(/invalid grant count/);
        expect(() => lease.reserveWrites(invalid as number)).toThrow(/invalid grant count/);
        lease.reserveWrites(maximum).dispose();
    });
}
test('object count is refused without valueOf or toString invocation', () => {
    const lease = guard(new Node('count object'));
    const coercion = jest.fn(() => 1);
    const value = { valueOf: coercion, toString: coercion } as unknown as number;
    expect(() => lease.reserveWrites(value)).toThrow(/invalid grant count/);
    expect(() => lease.assertWriteCapacity(value)).toThrow(/invalid grant count/);
    expect(coercion).not.toHaveBeenCalled();
    lease.reserveWrites(maximum).dispose();
});

test('zero reservation is legal, cannot write, and does not allocate capacity', () => {
    const node = new Node('zero'), lease = guard(node), zero = lease.reserveWrites(0);
    const expected = jest.fn(), perform = jest.fn();
    expect(() => zero.write(node, 'setWorldPosition', getterArray(expected), perform)).toThrow(/reservation exhausted/);
    expect(expected).not.toHaveBeenCalled();
    expect(perform).not.toHaveBeenCalled();
    zero.dispose();
    zero.dispose();
    lease.reserveWrites(maximum).dispose();
});

test('unused disposed reservation never refunds sequence and never releases Node ownership', () => {
    const node = new Node('burned range'), lease = guard(node);
    const burned = lease.reserveWrites(maximum - 1);
    burned.dispose();
    burned.dispose();
    expect(() => node.setWorldPosition(7, 8, 9)).toThrow(/motion is owned/);
    const expected = jest.fn(), perform = jest.fn();
    expect(() => burned.write(node, 'setWorldPosition', getterArray(expected), perform)).toThrow(/disposed write reservation/);
    expect(expected).not.toHaveBeenCalled();
    expect(perform).not.toHaveBeenCalled();
    positionWrite(lease.reserveWrites(1), node);
    expect(() => lease.reserveWrites(1)).toThrow(/sequence exhausted/);
});

test('reserved ranges survive intervening direct writes without over-allocation', () => {
    const node = new Node('disjoint ranges'), lease = guard(node);
    const reserved = lease.reserveWrites(maximum - 1);
    positionWrite(lease, node);
    expect(() => positionWrite(lease, node)).toThrow(/sequence exhausted/);
    reserved.write(node, 'setWorldRotation', rotation, () => node.setWorldRotation(0, 0, 1, 0));
    expect(node.worldRotation).toEqual(new Quat(0, 0, 1, 0));
});

for (const mode of ['direct exhausted', 'reservation exhausted', 'reservation disposed', 'lease disposed'] as const) {
    test(`${mode} rejects before expected accessors and perform callback`, () => {
        const node = new Node(mode), lease = guard(node);
        let writer: NodeTransformWriteReservation = lease;
        if (mode === 'direct exhausted') lease.reserveWrites(maximum).dispose();
        if (mode === 'reservation exhausted') writer = lease.reserveWrites(0);
        if (mode === 'reservation disposed') {
            writer = lease.reserveWrites(1);
            writer.dispose();
        }
        if (mode === 'lease disposed') {
            writer = lease.reserveWrites(1);
            lease.dispose();
        }
        const before = state(node), expected = jest.fn(), perform = jest.fn();
        expect(() => writer.write(node, 'setWorldPosition', getterArray(expected), perform)).toThrow();
        expect(expected).not.toHaveBeenCalled();
        expect(perform).not.toHaveBeenCalled();
        expect(state(node)).toEqual(before);
    });
}

test('lease disposal invalidates every outstanding reservation and check/reserve/direct write', () => {
    const node = new Node('dispose all'), lease = guard(node);
    const a = lease.reserveWrites(1), b = lease.reserveWrites(2);
    lease.dispose();
    lease.dispose();
    for (const writer of [lease, a, b]) expect(() => positionWrite(writer, node)).toThrow(/disposed ownership/);
    expect(() => lease.assertWriteCapacity(0)).toThrow(/disposed ownership/);
    expect(() => lease.reserveWrites(0)).toThrow(/disposed ownership/);
    node.setWorldPosition(7, 8, 9);
    expect(node.worldPosition).toEqual(new Vec3(7, 8, 9));
});

for (const primary of [undefined, null, 0, false, '', new Error('primary identity')]) {
    for (const phase of ['expected getter', 'perform', 'consumed listener'] as const) {
        test(`falsy/identity primary ${String(primary)} survives ${phase}; reservation cannot retry`, () => {
            const node = new Node('primary'), lease = guard(node), reservation = lease.reserveWrites(1);
            const expected = phase === 'expected getter' ? getterArray(() => { throw primary; }) : position;
            if (phase === 'consumed listener') node.on(NodeEventType.TRANSFORM_CHANGED, () => { throw primary; });
            const result = caught(() => reservation.write(node, 'setWorldPosition', expected, () => {
                if (phase === 'perform') throw primary;
                node.setWorldPosition(7, 8, 9);
            }));
            expect(result.threw).toBe(true);
            expect(result.value).toBe(primary);
            expect(() => positionWrite(reservation, node)).toThrow(/reservation exhausted/);
            // The unused range is max-1, regardless of whether the first write reached Node.
            lease.reserveWrites(maximum - 1).dispose();
            expect(() => lease.reserveWrites(1)).toThrow(/sequence exhausted/);
            expect(() => node.setWorldPosition(1, 2, 3)).toThrow(/motion is owned/);
        });
    }
}

test('failed direct expected read consumes its final sequence before getter and preserves primary', () => {
    const node = new Node('direct failure'), lease = guard(node);
    lease.reserveWrites(maximum - 1).dispose();
    const perform = jest.fn();
    expect(caught(() => lease.write(node, 'setWorldPosition', getterArray(() => { throw 0; }), perform))).toEqual({
        threw: true, value: 0,
    });
    expect(perform).not.toHaveBeenCalled();
    expect(() => lease.assertWriteCapacity(1)).toThrow(/sequence exhausted/);
});

for (const dispose of ['reservation', 'lease'] as const) {
    test(`${dispose} disposal during expected copying prevents perform without refund`, () => {
        const node = new Node('dispose during copy'), lease = guard(node), reservation = lease.reserveWrites(1);
        const perform = jest.fn();
        const expected = getterArray(() => (dispose === 'lease' ? lease : reservation).dispose());
        expect(() => reservation.write(node, 'setWorldPosition', expected, perform)).toThrow(/disposed while copying/);
        expect(perform).not.toHaveBeenCalled();
        if (dispose === 'reservation') lease.reserveWrites(maximum - 1).dispose();
    });
}

test('reservation disposal during perform revokes the pending grant without releasing protection', () => {
    const node = new Node('dispose during perform'), lease = guard(node), reservation = lease.reserveWrites(1);
    const expected = jest.fn();
    const input = { get x() { expected(); return 7; }, y: 8, z: 9 } as Vec3;
    expect(() => reservation.write(node, 'setWorldPosition', position, () => {
        reservation.dispose();
        node.setWorldPosition(input);
    })).toThrow(/motion is owned/);
    expect(expected).not.toHaveBeenCalled();
    expect(node.position).toEqual(new Vec3());
});

test('disposing another reservation cannot revoke the current exact grant', () => {
    const node = new Node('separate dispose'), lease = guard(node), a = lease.reserveWrites(1), b = lease.reserveWrites(1);
    a.write(node, 'setWorldPosition', position, () => {
        b.dispose();
        node.setWorldPosition(7, 8, 9);
    });
    expect(node.worldPosition).toEqual(new Vec3(7, 8, 9));
    expect(() => positionWrite(b, node)).toThrow(/disposed write reservation/);
});

for (const phase of ['expected getter', 'perform', 'consumed listener'] as const) {
    test(`same owner direct/reserved/check/reserve reentry refused during ${phase}`, () => {
        const node = new Node('reentry'), lease = guard(node), outer = lease.reserveWrites(1), inner = lease.reserveWrites(1);
        const expected = jest.fn(), perform = jest.fn();
        let reentries = 0;
        const nested = () => {
            reentries++;
            for (const writer of [lease, outer, inner]) {
                expect(() => writer.write(node, 'setWorldPosition', getterArray(expected), perform)).toThrow(/same-owner nested/);
            }
            expect(() => lease.reserveWrites(0)).toThrow(/same-owner nested/);
            expect(() => lease.assertWriteCapacity(0)).toThrow(/same-owner nested/);
        };
        if (phase === 'consumed listener') node.on(NodeEventType.TRANSFORM_CHANGED, nested);
        outer.write(node, 'setWorldPosition', phase === 'expected getter' ? getterArray(nested) : position, () => {
            if (phase === 'perform') nested();
            node.setWorldPosition(7, 8, 9);
        });
        expect(reentries).toBe(1);
        expect(expected).not.toHaveBeenCalled();
        expect(perform).not.toHaveBeenCalled();
        node.off(NodeEventType.TRANSFORM_CHANGED, nested);
        // Refused nested attempts did not steal the other reservation.
        inner.write(node, 'setWorldRotation', rotation, () => node.setWorldRotation(0, 0, 1, 0));
        lease.reserveWrites(maximum - 2).dispose();
    });
}

test('actual setters compose transaction and two persistent descendant/ancestor reservations exactly once', () => {
    const parent = new Node('shared physics ancestor'), a = new Node('target a'), b = new Node('target b');
    parent.addChild(a);
    parent.addChild(b);
    const temporary = guard(parent, a, b), persistentA = guard(parent, a), persistentB = guard(parent, b);
    for (const [lease, count] of [[temporary, 6], [persistentA, 4], [persistentB, 4]] as const) lease.assertWriteCapacity(count);
    const t = temporary.reserveWrites(6), pa = persistentA.reserveWrites(4), pb = persistentB.reserveWrites(4);
    const setterCalls = { position: 0, rotation: 0 }, listeners = { events: 0, rejected: 0 };
    for (const node of [parent, a, b]) node.on(NodeEventType.TRANSFORM_CHANGED, () => {
        listeners.events++;
        expect(() => node.setWorldPosition(99, 99, 99)).toThrow(/motion is owned/);
        listeners.rejected++;
    });
    for (const [node, writers] of [[parent, [t, pa, pb]], [a, [t, pa]], [b, [t, pb]]] as const) {
        for (const operation of ['setWorldPosition', 'setWorldRotation'] as const) {
            const expected = operation === 'setWorldPosition' ? position : rotation;
            const write = (index: number): void => {
                if (index < writers.length) writers[index].write(node, operation, expected, () => write(index + 1));
                else if (operation === 'setWorldPosition') {
                    setterCalls.position++;
                    node.setWorldPosition(7, 8, 9);
                } else {
                    setterCalls.rotation++;
                    node.setWorldRotation(0, 0, 1, 0);
                }
            };
            write(0);
        }
    }
    expect(setterCalls).toEqual({ position: 3, rotation: 3 });
    expect(listeners).toEqual({ events: 6, rejected: 6 });
    for (const node of [parent, a, b]) {
        expect(node.worldPosition).toEqual(new Vec3(7, 8, 9));
        expect(node.worldRotation).toEqual(new Quat(0, 0, 1, 0));
    }
    for (const reservation of [t, pa, pb]) expect(() => positionWrite(reservation, parent)).toThrow(/reservation exhausted/);
});

test('foreign lease still refuses composed setter before Node argument getters', () => {
    const node = new Node('foreign'), own = guard(node), foreign = guard(node), reserved = own.reserveWrites(1);
    const read = jest.fn();
    const input = { get x() { read(); return 7; }, y: 8, z: 9 } as Vec3;
    expect(() => reserved.write(node, 'setWorldPosition', position, () => node.setWorldPosition(input))).toThrow(/motion is owned/);
    expect(read).not.toHaveBeenCalled();
    expect(node.position).toEqual(new Vec3());
    foreign.dispose();
    expect(() => positionWrite(reserved, node)).toThrow(/reservation exhausted/);
});

test('unconsumed, wrong-value, wrong-node and wrong-operation attempts burn only their reserved attempts', () => {
    const node = new Node('exact'), other = new Node('other'), lease = guard(node), reserved = lease.reserveWrites(4);
    expect(() => reserved.write(node, 'setWorldPosition', position, () => {})).toThrow(/consumed permission/);
    expect(() => reserved.write(node, 'setWorldPosition', position, () => node.setWorldPosition(1, 2, 3))).toThrow(/does not match/);
    expect(() => reserved.write(other, 'setWorldPosition', position, () => other.setWorldPosition(7, 8, 9))).toThrow(/invalid exact/);
    expect(() => reserved.write(node, 'setPosition' as any, position, () => node.setPosition(7, 8, 9))).toThrow(/invalid exact/);
    expect(() => positionWrite(reserved, node)).toThrow(/reservation exhausted/);
    expect(node.position).toEqual(new Vec3());
    expect(other.position).toEqual(new Vec3());
    lease.reserveWrites(maximum - 4).dispose();
});

test('multi-lease preflight finds the last exhausted owner without allocating earlier owners', () => {
    const node = new Node('all-owner preflight'), temporary = guard(node), persistent = guard(node);
    persistent.reserveWrites(maximum - 1).dispose();
    const expected = jest.fn(), actualSetter = jest.fn(), syntheticNativeApply = jest.fn();
    expect(() => {
        for (const lease of [temporary, persistent]) lease.assertWriteCapacity(2);
        const t = temporary.reserveWrites(2), p = persistent.reserveWrites(2);
        syntheticNativeApply();
        t.write(node, 'setWorldPosition', getterArray(expected), () => {
            p.write(node, 'setWorldPosition', getterArray(expected), actualSetter);
        });
    }).toThrow(/sequence exhausted/);
    expect(expected).not.toHaveBeenCalled();
    expect(actualSetter).not.toHaveBeenCalled();
    expect(syntheticNativeApply).not.toHaveBeenCalled();
    temporary.reserveWrites(maximum).dispose();
    persistent.reserveWrites(1).dispose();
});

test('disposing a consumed reservation invalidates success but preserves actual Node completion', () => {
    const node = new Node('postwrite disposal'), lease = guard(node), reservation = lease.reserveWrites(1);
    node.on(NodeEventType.TRANSFORM_CHANGED, () => reservation.dispose());
    expect(() => positionWrite(reservation, node)).toThrow(/valid consumed permission/);
    expect(node.worldPosition).toEqual(new Vec3(7, 8, 9));
    expect(() => positionWrite(reservation, node)).toThrow(/disposed write reservation/);
    expect(() => node.setWorldPosition(1, 2, 3)).toThrow(/motion is owned/);
});
