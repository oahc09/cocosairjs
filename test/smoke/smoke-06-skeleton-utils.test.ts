/**
 * Smoke 6 — V0.2 Skeleton Utilities（L4）：buildSkeletonTree + restoreBindPose 往返。
 * 覆盖：骨骼树构建（joints 路径 + bindpose）、扰动后复位、缺失路径报错。
 */
import { Node } from '../../src/cocos/scene-graph/node';
import { Skeleton } from '../../src/cocos/3d/assets/skeleton';
import { buildSkeletonTree } from '../../src/air/utils/skeleton-tree';
import { restoreBindPose } from '../../src/air/utils/restore-bind-pose';

const JOINTS = ['bone0', 'bone0/bone1', 'bone0/bone1/bone2'];

function makeArmature (): Node {
    const root = new Node('skinningRoot');
    const bone0 = new Node('bone0');
    bone0.setPosition(1, 2, 3);
    const bone1 = new Node('bone1');
    bone1.setPosition(0, 5, 0);
    bone1.setScale(2, 1, 1);
    const bone2 = new Node('bone2');
    bone2.setPosition(0, 1, 0);
    root.addChild(bone0);
    bone0.addChild(bone1);
    bone1.addChild(bone2);
    return root;
}

function expectVecNear (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, eps = 1e-4): void {
    expect(Math.abs(a.x - b.x)).toBeLessThan(eps);
    expect(Math.abs(a.y - b.y)).toBeLessThan(eps);
    expect(Math.abs(a.z - b.z)).toBeLessThan(eps);
}

describe('smoke 6 — skeleton utilities', () => {
    test('buildSkeletonTree records joint paths and bindposes', () => {
        const root = makeArmature();
        const skeleton = buildSkeletonTree(root, JOINTS);
        expect(skeleton).toBeInstanceOf(Skeleton);
        expect(skeleton.joints).toEqual(JOINTS);
        expect(skeleton.bindposes.length).toBe(JOINTS.length);
        // bindpose 为有限矩阵（可逆）
        for (const bp of skeleton.bindposes) {
            expect(Number.isFinite(bp.m00)).toBe(true);
        }
    });

    test('buildSkeletonTree throws for missing joint path', () => {
        const root = makeArmature();
        expect(() => buildSkeletonTree(root, ['bone0/boneX']))
            .toThrow(/bone0\/boneX/);
    });

    test('restoreBindPose restores hierarchy to captured rest pose', () => {
        const root = makeArmature();
        const skeleton = buildSkeletonTree(root, JOINTS);

        // 扰动：随意改动骨骼局部变换
        const bone0 = root.getChildByPath('bone0')!;
        const bone1 = root.getChildByPath('bone0/bone1')!;
        const bone2 = root.getChildByPath('bone0/bone1/bone2')!;
        bone0.setPosition(-9, 4, 2);
        bone0.setRotationFromEuler(30, 45, 15);
        bone1.setPosition(7, -1, 5);
        bone1.setScale(1, 3, 1);
        bone2.setPosition(2, 2, 2);

        restoreBindPose(root, skeleton);

        expectVecNear(bone0.position, { x: 1, y: 2, z: 3 });
        expectVecNear(bone1.position, { x: 0, y: 5, z: 0 });
        expectVecNear(bone2.position, { x: 0, y: 1, z: 0 });
        expectVecNear(bone1.scale, { x: 2, y: 1, z: 1 });
    });
});
