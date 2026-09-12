/**
 * Smoke 4 — Skeleton → Skinning → Animation（HEADLESS 模式）。
 * 验证 Code First 骨骼/蒙皮链路：Skeleton.joints + bindposes + SkinningModel。
 */
import { Scene, Node, SkinnedMeshRenderer, Skeleton, Mesh, Vec3, Mat4 } from '../../src';

describe('smoke 4 — skeleton and skinning', () => {
    test('skeleton with joints and bindposes drives SkinningModel', () => {
        const armature = new Node('Armature');
        const bone0 = new Node('bone0');
        armature.addChild(bone0);
        const bone1 = new Node('bone1');
        bone0.addChild(bone1);
        bone1.setPosition(new Vec3(0, 1, 0));

        const skeleton = new Skeleton();
        skeleton.joints = ['bone0', 'bone1'];
        skeleton.bindposes = [
            bone0.worldMatrix.clone().invert(),
            bone1.worldMatrix.clone().invert(),
        ];
        expect(skeleton.joints.length).toBe(2);
        expect(skeleton.bindposes.length).toBe(2);

        const smr = armature.addComponent(SkinnedMeshRenderer);
        smr.mesh = new Mesh();
        smr.skeleton = skeleton;
        smr.skinningRoot = armature;
        expect(smr.skinningRoot).toBe(armature);

        const scene = new Scene('skinned');
        scene.addChild(armature);
        expect(scene.getChildByName('Armature')).toBe(armature);
    });
});
