/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Actual Node source + real private registry. No native/WASM/target qualification.
 */
import '../../../src/exports/base';
import '../../../src/cocos/game';
import { Node } from '../../../src/cocos/scene-graph/node';
import { NodeSpace, TransformBit } from '../../../src/cocos/scene-graph/node-enum';
import { NodeEventType } from '../../../src/cocos/scene-graph/node-event';
import { Vec3, Quat, Mat4 } from '../../../src/cocos/core/math';
import {
    registerNodeTransformGuard,
    assertNodeTransformEntry,
    assertNodeTransformWrite,
} from '../../../src/cocos/scene-graph/node-transform-validation';
import type { NodeTransformGuardLease } from '../../../src/cocos/scene-graph/node-transform-validation';
import { createBox3DNodeMotionGuard } from '../../../src/air/physics/box3d/node-motion-guard';

const leases: NodeTransformGuardLease[] = [];
const rejection = Object.freeze({ code: 'AIR_E_BOX3D_CONFIG', message: 'explicit source-control owner' });
const keep = (lease: NodeTransformGuardLease) => (leases.push(lease), lease);
afterEach(() => {
    while (leases.length) leases.pop()!.dispose();
    jest.restoreAllMocks();
});
function raw(node: Node): unknown {
    const n = node as any;
    const components = (v: object) =>
        Object.keys(v)
            .sort()
            .map((k) => [k, (v as any)[k]]);
    return {
        local: [components(n._lpos), components(n._lrot), components(n._lscale), components(n._euler)],
        world: [components(n._pos), components(n._rot), components(n._scale), components(n._mat)],
        flags: [n._transformFlags, n._hasChangedFlags, n._flagChangeVersion, n._eulerDirty, n._objFlags],
        parent: n._parent?.uuid ?? null,
        children: n._children.map((child: Node) => child.uuid),
        siblingIndex: n._siblingIndex,
    };
}
function graph() {
    const root = new Node('root'),
        parent = new Node('parent'),
        body = new Node('body');
    const sibling = new Node('sibling'),
        other = new Node('other');
    root.addChild(parent);
    parent.addChild(body);
    parent.addChild(sibling);
    body.setPosition(1, 2, 3);
    parent.setPosition(4, 5, 6);
    const nodes = [root, parent, body, sibling, other];
    const events: string[] = [];
    for (const node of nodes) {
        for (const type of [
            NodeEventType.TRANSFORM_CHANGED,
            NodeEventType.PARENT_CHANGED,
            NodeEventType.CHILD_ADDED,
            NodeEventType.CHILD_REMOVED,
        ]) {
            node.on(type, () => events.push(`${node.name}:${type}`));
        }
    }
    return { root, parent, body, sibling, other, nodes, events };
}
type Graph = ReturnType<typeof graph>;
type Case = [string, (g: Graph) => void];
const transformCases: Case[] = [
    ['setPosition numeric', ({ body }) => body.setPosition(8, 9, 10)],
    ['setPosition object', ({ body }) => body.setPosition(new Vec3(8, 9, 10))],
    ['setPosition omitted z', ({ body }) => body.setPosition(8, 9)],
    [
        'position property',
        ({ body }) => {
            body.position = new Vec3(8, 9, 10);
        },
    ],
    [
        'x property',
        ({ body }) => {
            body.x = 8;
        },
    ],
    [
        'y property',
        ({ body }) => {
            body.y = 8;
        },
    ],
    [
        'z property',
        ({ body }) => {
            body.z = 8;
        },
    ],
    ['setWorldPosition numeric', ({ body }) => body.setWorldPosition(8, 9, 10)],
    ['setWorldPosition object', ({ body }) => body.setWorldPosition(new Vec3(8, 9, 10))],
    ['setWorldPosition omitted z', ({ body }) => body.setWorldPosition(8, 9)],
    [
        'worldPosition property',
        ({ body }) => {
            body.worldPosition = new Vec3(8, 9, 10);
        },
    ],
    [
        'worldPositionX property',
        ({ body }) => {
            body.worldPositionX = 8;
        },
    ],
    [
        'worldPositionY property',
        ({ body }) => {
            body.worldPositionY = 8;
        },
    ],
    [
        'worldPositionZ property',
        ({ body }) => {
            body.worldPositionZ = 8;
        },
    ],
    ['setRotation numeric', ({ body }) => body.setRotation(0, 0, 1, 0)],
    ['setRotation object', ({ body }) => body.setRotation(new Quat(0, 0, 1, 0))],
    [
        'rotation property',
        ({ body }) => {
            body.rotation = new Quat(0, 0, 1, 0);
        },
    ],
    ['Euler method numeric', ({ body }) => body.setRotationFromEuler(20, 30, 40)],
    ['Euler method object', ({ body }) => body.setRotationFromEuler(new Vec3(20, 30, 40))],
    [
        'Euler property',
        ({ body }) => {
            body.eulerAngles = new Vec3(20, 30, 40);
        },
    ],
    [
        'angle property',
        ({ body }) => {
            body.angle = 45;
        },
    ],
    ['setWorldRotation numeric', ({ body }) => body.setWorldRotation(0, 0, 1, 0)],
    ['setWorldRotation object', ({ body }) => body.setWorldRotation(new Quat(0, 0, 1, 0))],
    [
        'worldRotation property',
        ({ body }) => {
            body.worldRotation = new Quat(0, 0, 1, 0);
        },
    ],
    ['world Euler method', ({ body }) => body.setWorldRotationFromEuler(20, 30, 40)],
    ['setScale numeric', ({ body }) => body.setScale(2, 3, 4)],
    ['setScale object', ({ body }) => body.setScale(new Vec3(2, 3, 4))],
    [
        'scale property',
        ({ body }) => {
            body.scale = new Vec3(2, 3, 4);
        },
    ],
    ['setWorldScale numeric', ({ body }) => body.setWorldScale(2, 3, 4)],
    ['setWorldScale object', ({ body }) => body.setWorldScale(new Vec3(2, 3, 4))],
    ['setWorldScale missing z raw overload', ({ body }) => (body.setWorldScale as any)(2, 3)],
    [
        'worldScale property',
        ({ body }) => {
            body.worldScale = new Vec3(2, 3, 4);
        },
    ],
    [
        'matrix property',
        ({ body }) => {
            body.matrix = Mat4.fromTranslation(new Mat4(), new Vec3(8, 9, 10));
        },
    ],
    ['translate local', ({ body }) => body.translate(new Vec3(1, 2, 3), NodeSpace.LOCAL)],
    ['translate world', ({ body }) => body.translate(new Vec3(1, 2, 3), NodeSpace.WORLD)],
    ['rotate local', ({ body }) => body.rotate(new Quat(0, 0, 1, 0), NodeSpace.LOCAL)],
    ['rotate world', ({ body }) => body.rotate(new Quat(0, 0, 1, 0), NodeSpace.WORLD)],
    ['lookAt', ({ body }) => body.lookAt(new Vec3(10, 10, 10))],
    [
        'forward property',
        ({ body }) => {
            body.forward = new Vec3(1, 0, 0);
        },
    ],
    ['setRTS combined', ({ body }) => body.setRTS(new Quat(), new Vec3(8, 9, 10), new Vec3(2, 3, 4))],
    ['setRTS later invalid scale', ({ body }) => body.setRTS(new Quat(), new Vec3(8, 9, 10), new Vec3(2, NaN, 4))],
    ['same position request', ({ body }) => body.setPosition(1, 2, 3)],
    ['parent translation', ({ parent }) => parent.setPosition(8, 9, 10)],
    ['grandparent rotation', ({ root }) => root.setRotationFromEuler(0, 45, 0)],
    ['ancestor scale', ({ root }) => root.setScale(2, 2, 2)],
    [
        'skip-transform flag',
        ({ body }) => {
            body.isSkipTransformUpdate = true;
        },
    ],
];
const hierarchyCases: Case[] = [
    ['setParent false', ({ body, other }) => body.setParent(other, false)],
    ['setParent keep world', ({ body, other }) => body.setParent(other, true)],
    ['same parent request', ({ body, parent }) => body.setParent(parent)],
    [
        'parent property',
        ({ body, other }) => {
            body.parent = other;
        },
    ],
    ['modifyParent internal', ({ body, other }) => body.modifyParent(other)],
    ['ancestor modifyParent', ({ parent, other }) => parent.modifyParent(other)],
    ['ancestor subtree reparent', ({ parent, other }) => parent.setParent(other)],
    ['addChild', ({ body, other }) => other.addChild(body)],
    ['insertChild', ({ body, other }) => other.insertChild(body, 0)],
    ['removeFromParent', ({ body }) => body.removeFromParent()],
    ['removeChild', ({ parent, body }) => parent.removeChild(body)],
    ['removeAllChildren preflight before unprotected sibling', ({ parent }) => parent.removeAllChildren()],
];
function errorOf(action: () => void): any {
    try {
        action();
    } catch (error) {
        return error;
    }
    return undefined;
}
test.each([...transformCases, ...hierarchyCases])(
    'protected actual Node rejects before mutation: %s',
    (_name, action) => {
        const g = graph();
        keep(createBox3DNodeMotionGuard(g.body));
        const before = g.nodes.map(raw);
        const error = errorOf(() => action(g));
        expect({ code: error?.code, state: g.nodes.map(raw), events: g.events }).toEqual({
            code: 'AIR_E_BOX3D_CONFIG',
            state: before,
            events: [],
        });
    },
);

test('truly empty setRTS remains an event-free no-op under ownership', () => {
    const g = graph();
    keep(createBox3DNodeMotionGuard(g.body));
    const before = g.nodes.map(raw);
    g.body.setRTS();
    expect(g.nodes.map(raw)).toEqual(before);
    expect(g.events).toEqual([]);
});
test('unrelated subtree remains writable with another target ancestor lease', () => {
    const g = graph();
    keep(createBox3DNodeMotionGuard(g.body));
    g.sibling.setPosition(7, 8, 9);
    g.other.addChild(g.sibling);
    expect(g.sibling.position).toEqual(new Vec3(7, 8, 9));
    expect(g.sibling.parent).toBe(g.other);
});
test('shared ancestor remains protected until the last independent owner releases', () => {
    const g = graph(),
        a = keep(createBox3DNodeMotionGuard(g.body)),
        b = keep(createBox3DNodeMotionGuard(g.sibling));
    a.dispose();
    a.dispose();
    expect(errorOf(() => g.root.setPosition(5, 6, 7))?.code).toBe('AIR_E_BOX3D_CONFIG');
    g.body.setPosition(5, 6, 7);
    b.dispose();
    expect(() => g.root.setPosition(5, 6, 7)).not.toThrow();
});
test('empty registry does not evaluate candidate getter or alter legacy validation', () => {
    const n = new Node('unowned'),
        read = jest.fn(() => [1, 2, 3]);
    expect(assertNodeTransformEntry(n, 'setWorldPosition', read)).toBeUndefined();
    expect(read).not.toHaveBeenCalled();
    expect(errorOf(() => n.setPosition(NaN, 1, 2))?.code).toBe('AIR_E_NODE_TRANSFORM');
    let reads = 0;
    const v = {
        get x() {
            ++reads;
            return 1;
        },
        get y() {
            ++reads;
            return 2;
        },
        get z() {
            ++reads;
            return 3;
        },
    };
    n.setWorldPosition(v as Vec3);
    const baselineReads = reads;
    keep(registerNodeTransformGuard([{}], rejection));
    reads = 0;
    n.setWorldPosition(v as Vec3);
    expect(reads).toBe(baselineReads);
});
test('grant expected values are copied and an exact actual Node write consumes once', () => {
    const n = new Node('owned'),
        lease = keep(registerNodeTransformGuard([n], rejection)),
        expected = [1, 2, 3];
    lease.write(n, 'setWorldPosition', expected, () => {
        expected[0] = 99;
        n.setWorldPosition(1, 2, 3);
        expect(errorOf(() => n.setWorldPosition(1, 2, 3))?.code).toBe('AIR_E_BOX3D_CONFIG');
    });
    expect(n.worldPosition).toEqual(new Vec3(1, 2, 3));
});
test.each([
    ['mismatched values', (n: Node) => n.setWorldPosition(9, 2, 3)],
    ['omitted z', (n: Node) => n.setWorldPosition(1, 2)],
    ['wrong operation', (n: Node) => n.setWorldRotation(0, 0, 0, 1)],
] as const)('owned grant rejects before a dirty-world refresh: %s', (_name, action) => {
    const g = graph(),
        lease = keep(createBox3DNodeMotionGuard(g.body)),
        before = g.nodes.map(raw);
    const error = errorOf(() => lease.write(g.body, 'setWorldPosition', [1, 2, 3], () => action(g.body)));
    expect({ code: error?.code, state: g.nodes.map(raw), events: g.events }).toEqual({
        code: 'AIR_E_BOX3D_CONFIG',
        state: before,
        events: [],
    });
});
test('complete object candidate is copied once and used for the actual owned write', () => {
    const n = new Node('object'),
        lease = keep(registerNodeTransformGuard([n], rejection));
    let reads = 0;
    const input = {
        get x() {
            ++reads;
            return 1;
        },
        get y() {
            ++reads;
            return 2;
        },
        get z() {
            ++reads;
            return 3;
        },
    };
    lease.write(n, 'setWorldPosition', [1, 2, 3], () => n.setWorldPosition(input as Vec3));
    expect(reads).toBe(3);
    expect(n.worldPosition).toEqual(new Vec3(1, 2, 3));
});
test('single-use grant is consumed before synchronous user transform listener reentry', () => {
    const n = new Node('reentry'),
        lease = keep(registerNodeTransformGuard([n], rejection));
    let observed: any;
    n.on(NodeEventType.TRANSFORM_CHANGED, () => {
        observed = errorOf(() => n.setWorldPosition(7, 8, 9));
    });
    lease.write(n, 'setWorldPosition', [1, 2, 3], () => n.setWorldPosition(1, 2, 3));
    expect(observed?.code).toBe('AIR_E_BOX3D_CONFIG');
    expect(n.worldPosition).toEqual(new Vec3(1, 2, 3));
});
test('uncaught user exception is preserved and does not leave a reusable grant', () => {
    const n = new Node('listener-throw'),
        lease = keep(registerNodeTransformGuard([n], rejection));
    const cause = new Error('explicit user listener failure');
    n.on(NodeEventType.TRANSFORM_CHANGED, () => {
        throw cause;
    });
    expect(errorOf(() => lease.write(n, 'setWorldPosition', [1, 2, 3], () => n.setWorldPosition(1, 2, 3)))).toBe(cause);
    expect(errorOf(() => n.setWorldPosition(4, 5, 6))?.code).toBe('AIR_E_BOX3D_CONFIG');
});
test('input getter reentry cannot steal a pending grant', () => {
    const n = new Node('input-reentry'),
        lease = keep(registerNodeTransformGuard([n], rejection));
    let observed: any;
    const input = {
        get x() {
            observed = errorOf(() => n.setWorldPosition(1, 2, 3));
            return 1;
        },
        y: 2,
        z: 3,
    };
    lease.write(n, 'setWorldPosition', [1, 2, 3], () => n.setWorldPosition(input as Vec3));
    expect(observed?.code).toBe('AIR_E_BOX3D_CONFIG');
});
test('all shared ancestor leases must provide exact nested permission', () => {
    const g = graph(),
        a = keep(createBox3DNodeMotionGuard(g.body)),
        b = keep(createBox3DNodeMotionGuard(g.sibling));
    const before = g.nodes.map(raw);
    expect(
        errorOf(() => a.write(g.parent, 'setWorldPosition', [1, 2, 3], () => g.parent.setWorldPosition(1, 2, 3)))?.code,
    ).toBe('AIR_E_BOX3D_CONFIG');
    expect(g.nodes.map(raw)).toEqual(before);
    a.write(g.parent, 'setWorldPosition', [1, 2, 3], () =>
        b.write(g.parent, 'setWorldPosition', [1, 2, 3], () => g.parent.setWorldPosition(1, 2, 3)),
    );
    expect(g.parent.worldPosition).toEqual(new Vec3(1, 2, 3));
});
test('mismatched second lease is rejected without consuming or mutating either Node write', () => {
    const n = new Node('two'),
        a = keep(registerNodeTransformGuard([n], rejection)),
        b = keep(registerNodeTransformGuard([n], rejection));
    const before = raw(n);
    expect(
        errorOf(() =>
            a.write(n, 'setWorldPosition', [1, 2, 3], () =>
                b.write(n, 'setWorldPosition', [4, 5, 6], () => n.setWorldPosition(1, 2, 3)),
            ),
        )?.code,
    ).toBe('AIR_E_BOX3D_CONFIG');
    expect(raw(n)).toEqual(before);
    a.write(n, 'setWorldPosition', [1, 2, 3], () =>
        b.write(n, 'setWorldPosition', [1, 2, 3], () => n.setWorldPosition(1, 2, 3)),
    );
});
test('same lease nested permission and unused grant fail explicitly', () => {
    const n = new Node('same'),
        a = keep(registerNodeTransformGuard([n], rejection));
    expect(
        errorOf(() =>
            a.write(n, 'setWorldPosition', [1, 2, 3], () =>
                a.write(n, 'setWorldPosition', [1, 2, 3], () => n.setWorldPosition(1, 2, 3)),
            ),
        )?.code,
    ).toBe('AIR_E_BOX3D_CONFIG');
    expect(errorOf(() => a.write(n, 'setWorldPosition', [1, 2, 3], () => {}))?.code).toBe('AIR_E_BOX3D_CONFIG');
});
test('dispose revokes pending permission and repeated dispose is safe', () => {
    const n = new Node('dispose'),
        a = keep(registerNodeTransformGuard([n], rejection));
    expect(errorOf(() => a.write(n, 'setWorldPosition', [1, 2, 3], () => a.dispose()))?.code).toBe(
        'AIR_E_BOX3D_CONFIG',
    );
    a.dispose();
    expect(errorOf(() => a.write(n, 'setWorldPosition', [1, 2, 3], () => n.setWorldPosition(1, 2, 3)))?.code).toBe(
        'AIR_E_BOX3D_CONFIG',
    );
    expect(() => n.setWorldPosition(1, 2, 3)).not.toThrow();
});
test('invalid registration has no partial owner insertion', () => {
    const n = new Node('invalid');
    expect(() => registerNodeTransformGuard([n, null as any], rejection)).toThrow(TypeError);
    expect(() => n.setPosition(1, 2, 3)).not.toThrow();
});
test('owned world quaternion operation and existing unrelated SCALE flags survive', () => {
    const n = new Node('flags');
    n.setScale(2, 3, 4);
    const flags = n.hasChangedFlags;
    expect(flags & TransformBit.SCALE).toBeTruthy();
    const a = keep(registerNodeTransformGuard([n], rejection));
    a.write(n, 'setWorldRotation', [0, 0, 1, 0], () => n.setWorldRotation(new Quat(0, 0, 1, 0)));
    expect(n.hasChangedFlags & flags).toBe(flags);
    expect(n.worldRotation).toEqual(new Quat(0, 0, 1, 0));
});
test('raw alias bypass is explicitly outside synchronous interception, not a fake rejection', () => {
    const n = new Node('alias');
    keep(createBox3DNodeMotionGuard(n));
    (n.position as Vec3).x = 77;
    expect(n.position.x).toBe(77);
    // The future world admission must detect this against expectedPose. This primitive does not claim it does.
});
test('standalone write gate cannot create permission without matching entry', () => {
    const n = new Node('manual-gate'),
        a = keep(registerNodeTransformGuard([n], rejection));
    expect(
        errorOf(() =>
            a.write(n, 'setWorldPosition', [1, 2, 3], () => assertNodeTransformWrite(n, 'setWorldPosition', [1, 2, 3])),
        )?.code,
    ).toBe('AIR_E_BOX3D_CONFIG');
});

test.each(['dispose-self', 'add-owner', 'replace-owner'] as const)(
    'input accessor changes ownership: %s cannot forge an owned Node write',
    (mode) => {
        const g = graph(),
            a = keep(registerNodeTransformGuard([g.body], rejection));
        const b = mode === 'replace-owner' ? keep(registerNodeTransformGuard([g.body], rejection)) : undefined;
        const before = g.nodes.map(raw);
        const input = {
            get x() {
                if (mode === 'dispose-self') a.dispose();
                else {
                    if (b) b.dispose();
                    keep(registerNodeTransformGuard([g.body], rejection));
                }
                return 1;
            },
            y: 2,
            z: 3,
        };
        const actualWrite = () => g.body.setWorldPosition(input as Vec3);
        const error = errorOf(() =>
            a.write(g.body, 'setWorldPosition', [1, 2, 3], () =>
                b ? b.write(g.body, 'setWorldPosition', [1, 2, 3], actualWrite) : actualWrite(),
            ),
        );
        expect({ code: error?.code, state: g.nodes.map(raw), events: g.events }).toEqual({
            code: 'AIR_E_BOX3D_CONFIG',
            state: before,
            events: [],
        });
        // Registration/disposal side effects themselves are not rolled back.
    },
);
test('listener disposal after a real Node write is not reported as valid owned completion', () => {
    const n = new Node('disposed-in-listener'),
        a = keep(registerNodeTransformGuard([n], rejection));
    n.on(NodeEventType.TRANSFORM_CHANGED, () => a.dispose());
    const error = errorOf(() => a.write(n, 'setWorldPosition', [1, 2, 3], () => n.setWorldPosition(1, 2, 3)));
    expect(error?.code).toBe('AIR_E_BOX3D_CONFIG');
    expect(n.worldPosition).toEqual(new Vec3(1, 2, 3)); // Honest post-write failure, not a rollback claim.
});
