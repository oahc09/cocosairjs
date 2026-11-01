import { containment, localToWorld, LocalNode, skinnedVertices } from '../fixtures/upstream-skinning/oracle';

const node = (parent: LocalNode | null = null): LocalNode => ({
    parent,
    position: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
});
describe('U05 independent reference self-checks (no engine imports)', () => {
    test('scalar TRS composes negative/nonuniform scale and rotation in hierarchy order', () => {
        const parent = node();
        parent.position = { x: 3, y: -4, z: 2 };
        parent.scale = { x: -2, y: 3, z: 0.5 };
        parent.rotation = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 };
        const child = node(parent);
        child.position = { x: 1, y: -1, z: 4 };
        const actual = localToWorld([2, 3, -2], child);
        [-3, -10, 3].forEach((value, axis) => expect(actual[axis]).toBeCloseTo(value, 12));
    });
    test('blended joint weights and morph-before-skinning match hand-calculated vertices', () => {
        const root = node();
        const tip = node(root);
        tip.position.y = 0.5;
        expect(skinnedVertices([root, tip], 0)).toEqual([
            [-1, -1, 0],
            [1, -0.5, 0],
            [0, 1.375, 0],
        ]);
        expect(skinnedVertices([root, tip], 1)).toEqual([
            [-1, -1, 0],
            [1, -0.5, 0],
            [0, 2.125, 0],
        ]);
    });
    test('containment accepts conservative extents but reports a real displaced-vertex escape', () => {
        const bounds = {
            center: [0, 0, 0] as [number, number, number],
            halfExtents: [1, 1, 1] as [number, number, number],
        };
        expect(containment(bounds, [[1 + 0.000001, 0, 0]]).violations).toEqual([]);
        expect(containment(bounds, [[1.01, 0, 0]]).violations).toHaveLength(1);
    });
});
