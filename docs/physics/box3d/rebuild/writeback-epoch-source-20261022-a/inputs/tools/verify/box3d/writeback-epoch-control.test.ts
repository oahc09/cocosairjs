/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Actual Cocos Node + independent scalar oracle controls. No WASM or PhysicsSystem result claimed.
 */
import { Node } from '../../../src/cocos/scene-graph/node';
import { Vec3 } from '../../../src/cocos/core/math/vec3';
import { Quat } from '../../../src/cocos/core/math/quat';
import { createBox3DNodeMotionGuard } from '../../../src/air/physics/box3d/node-motion-guard';
import {
    angularError,
    distance,
    expectedLocal,
    hierarchy,
    inspectNode,
    inversePoint,
    localSample,
    sameLocal,
    trs,
} from './writeback-epoch-oracle';

for (const degrees of [0, 30, 90, 179, -90])
    for (const scale of [1, 2, 0.5]) {
        test(`independent local-chain affine vs actual Node: y=${degrees}, uniformScale=${scale}`, () => {
            const parent = new Node('parent'),
                child = new Node('child');
            parent.addChild(child);
            parent.setPosition(3, -2, 5);
            parent.setRotationFromEuler(0, degrees, 0);
            parent.setScale(scale, scale, scale);
            child.setPosition(2, 4, -3);
            child.setRotationFromEuler(20, 10, -15);
            const actual = inspectNode(child),
                scratch = hierarchy(child),
                p = child.worldPosition,
                q = child.worldRotation;
            expect(distance(scratch.position, [p.x, p.y, p.z])).toBeLessThan(1e-10);
            expect(angularError(scratch.rotation, [q.x, q.y, q.z, q.w])).toBeLessThan(1e-10);
            const local = expectedLocal(child, [p.x, p.y, p.z, q.x, q.y, q.z, q.w]);
            expect(distance(local.position, [2, 4, -3])).toBeLessThan(1e-10);
            expect(angularError(local.rotation, actual.local.rotation)).toBeLessThan(1e-10);
        });
    }
test('affine inverse handles rotated nonuniform scale', () => {
    const matrix = trs([5, -2, 7], [0, 0, Math.SQRT1_2, Math.SQRT1_2], [2, 3, 4]);
    expect(distance(inversePoint(matrix, [-1, 0, 19]), [1, 2, 3])).toBeLessThan(1e-12);
});
for (const q of [
    [0, 0, 0, 1],
    [0.1, 0.2, 0.3, 0.9],
    [1, 0, 0, 0],
])
    test('q/-q relative angle is identical: ' + q, () => {
        expect(
            angularError(
                q,
                q.map((x) => -x),
            ),
        ).toBeLessThan(1e-12);
    });
test('zero quaternion and singular parent basis reject', () => {
    expect(() => angularError([0, 0, 0, 0], [0, 0, 0, 1])).toThrow();
    expect(() => inversePoint(trs([0, 0, 0], [0, 0, 0, 1], [0, 1, 1]), [1, 2, 3])).toThrow();
});
for (const subject of ['self', 'parent'])
    test('flush then raw ' + subject + ' alias hides from cached world but not local-chain oracle', () => {
        const parent = new Node('parent'),
            child = new Node('child');
        parent.addChild(child);
        child.setPosition(0, 4, 0);
        const before = localSample(subject === 'self' ? child : parent);
        const pose = inspectNode(child).cached.position;
        (subject === 'self' ? child : parent).position.x += 2;
        const actual = inspectNode(child);
        expect(actual.cached.position).toEqual(pose);
        expect(actual.scratch.position[0]).toBe(2);
        expect(sameLocal(before, localSample(subject === 'self' ? child : parent))).toBe(false);
    });
test('sequential child-before-parent writeback displaces already verified child', () => {
    const parent = new Node('parent'),
        child = new Node('child');
    parent.addChild(child);
    child.setPosition(0, 4, 0);
    child.setWorldPosition(0, 4, 0);
    parent.setWorldPosition(1, 0, 0);
    expect(inspectNode(child).scratch.position).toEqual([1, 4, 0]);
    child.setWorldPosition(0, 4, 0);
    expect(inspectNode(child).scratch.position).toEqual([0, 4, 0]);
});
test('local alias within exact owned setter callback remains visible even when world cache matches expected', () => {
    const node = new Node('owned'),
        lease = createBox3DNodeMotionGuard(node);
    node.on(Node.EventType.TRANSFORM_CHANGED, () => {
        void node.worldMatrix;
        node.position.x += 2;
    });
    lease.write(node, 'setWorldPosition', [1, 2, 3], () => node.setWorldPosition(1, 2, 3));
    const actual = inspectNode(node, [1, 2, 3, 0, 0, 0, 1]);
    expect(actual.errors!.cachedOrigin).toBe(0);
    expect(actual.errors!.origin).toBe(2);
    lease.dispose();
});
test('exact owned setter rejects recursive business setter and keeps SCALE changed bit', () => {
    const node = new Node('owned'),
        lease = createBox3DNodeMotionGuard(node);
    let rejected = false;
    node.hasChangedFlags = 4;
    node.on(Node.EventType.TRANSFORM_CHANGED, () => {
        try {
            node.setPosition(9, 9, 9);
        } catch {
            rejected = true;
        }
    });
    lease.write(node, 'setWorldPosition', [1, 2, 3], () => node.setWorldPosition(1, 2, 3));
    expect(rejected).toBe(true);
    expect(node.hasChangedFlags & 4).toBe(4);
    lease.dispose();
    node.setPosition(new Vec3(4, 5, 6));
    expect(node.position).toEqual(new Vec3(4, 5, 6));
});
test('quaternion expected local uses parent orientation rather than copied native world quaternion', () => {
    const parent = new Node('parent'),
        child = new Node('child');
    parent.addChild(child);
    parent.setRotation(Quat.fromEuler(new Quat(), 0, 90, 0));
    const local = expectedLocal(child, [0, 0, 0, 0, 0, 0, 1]);
    expect(angularError(local.rotation, [0, -Math.SQRT1_2, 0, Math.SQRT1_2])).toBeLessThan(1e-12);
});
