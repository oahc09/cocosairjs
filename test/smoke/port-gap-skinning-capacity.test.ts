import { createAirApp, Node, Mat4, Skeleton, game } from '../../src';
import { SkinningModel } from '../../src/cocos/3d/models/skinning-model';
import { UBOSkinning } from '../../src/cocos/rendering/define';
import { CCObject } from '../../src/cocos/core/data/object';
import { skinnedTriangle } from '../fixtures/skinning/geometry';

describe('native realtime skinning palette capacity', () => {
    let formerCapacity: number;
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
        game.pause();
        // HEADLESS has no GPU uniform limits. Configure the real UBO layout for
        // both native transport branches; browser tests record measured limits.
        formerCapacity = UBOSkinning.JOINT_UNIFORM_CAPACITY;
        UBOSkinning.initLayout(30);
    });
    afterAll(() => {
        UBOSkinning.initLayout(formerCapacity);
    });
    function binding(count: number, joint: number, map?: number[]) {
        const mesh = skinnedTriangle(0, joint),
            skeleton = new Skeleton(),
            root = new Node('CapacityRoot');
        skeleton.joints = Array.from({ length: count }, (_, i) => `Joint${i}`);
        skeleton.bindposes = Array.from({ length: count }, () => new Mat4());
        root.addChild(new Node(`Joint${joint}`));
        if (map) {
            mesh.struct.jointMaps = [map];
            mesh.struct.primitives[0].jointMapIndex = 0;
        }
        return { mesh, skeleton, root };
    }
    function close(model: SkinningModel, ...bindings: ReturnType<typeof binding>[]) {
        model.destroy();
        for (const value of bindings) {
            value.mesh.destroy();
            value.skeleton.destroy();
            value.root.destroy();
        }
        CCObject._deferredDestroy();
    }
    test('last legal uniform index and last legal texture index fit actual arrays', () => {
        const capacity = UBOSkinning.JOINT_UNIFORM_CAPACITY;
        expect(capacity).toBeGreaterThan(0);
        const uniform = binding(capacity, capacity - 1),
            texture = binding(256, 255);
        const model = new SkinningModel();
        try {
            model.bindSkeleton(uniform.skeleton, uniform.root, uniform.mesh);
            expect((model as any)._dataArray[0].length / 12).toBe(capacity);
            model.bindSkeleton(texture.skeleton, texture.root, texture.mesh);
            expect((model as any)._dataArray[0].length / 12).toBeGreaterThanOrEqual(256);
        } finally {
            close(model, uniform, texture);
        }
    });
    test('weighted index 256 rejects before discarding a valid binding', () => {
        const valid = binding(1, 0),
            overflow = binding(257, 256),
            model = new SkinningModel();
        try {
            model.bindSkeleton(valid.skeleton, valid.root, valid.mesh);
            expect(() => model.bindSkeleton(overflow.skeleton, overflow.root, overflow.mesh)).toThrow(
                'AIR_E_SKINNING_CAPACITY',
            );
            expect(model.transform).toBe(valid.root);
            expect((model as any)._joints[0].target).toBe(valid.root.children[0]);
        } finally {
            close(model, valid, overflow);
        }
    });
    test('large skeleton with a small local palette remains legal', () => {
        const value = binding(300, 299, [299]),
            model = new SkinningModel();
        try {
            model.bindSkeleton(value.skeleton, value.root, value.mesh);
            expect((model as any)._joints[0].indices).toEqual([0]);
            expect((model as any)._dataArray[0].length / 12).toBe(256);
        } finally {
            close(model, value);
        }
    });
    test('local palette slot 256 rejects with resource and palette context', () => {
        const value = binding(
                257,
                256,
                Array.from({ length: 257 }, (_, i) => i),
            ),
            model = new SkinningModel();
        try {
            expect(() => model.bindSkeleton(value.skeleton, value.root, value.mesh)).toThrow('AIR_E_SKINNING_CAPACITY');
            try {
                model.bindSkeleton(value.skeleton, value.root, value.mesh);
            } catch (error: any) {
                expect(error).toMatchObject({
                    code: 'AIR_E_SKINNING_CAPACITY',
                    joint: 256,
                    palette: 0,
                    slot: 256,
                    capacity: 256,
                    node: 'CapacityRoot',
                });
            }
        } finally {
            close(model, value);
        }
    });
    test('unused large skeleton tail does not reject a legal weighted slot', () => {
        const value = binding(300, 0),
            model = new SkinningModel();
        try {
            expect(() => model.bindSkeleton(value.skeleton, value.root, value.mesh)).not.toThrow();
        } finally {
            close(model, value);
        }
    });
});
