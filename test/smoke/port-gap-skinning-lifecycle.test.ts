import { createAirApp, Node, Scene, Material, SkinnedMeshRenderer, SkeletalAnimation, game, director, utils, gfx } from '../../src';
import { CCObject } from '../../src/cocos/core/data/object';
import { skinnedTriangle, triangleSkeleton } from '../fixtures/skinning/geometry';
import { SkinningModel } from '../../src/cocos/3d/models/skinning-model';
import { BakedSkinningModel } from '../../src/cocos/3d/models/baked-skinning-model';

describe('port native skinning lifecycle: assignment orders and enabled state', () => {
    let app: Awaited<ReturnType<typeof createAirApp>>;
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    const orders = [['mesh', 'skeleton', 'root'], ['mesh', 'root', 'skeleton'], ['skeleton', 'mesh', 'root'],
        ['skeleton', 'root', 'mesh'], ['root', 'mesh', 'skeleton'], ['root', 'skeleton', 'mesh']];
    const cases = [false, true].flatMap((animation) => [false, true].flatMap((enabled) =>
        [false, true].flatMap((baked) => orders.map((order) => ({ animation, enabled, baked, order })))));
    test.each(cases)('animation=$animation enabled=$enabled baked=$baked order=$order', ({ animation, enabled, baked, order }) => {
        const scene = new Scene('Lifecycle');
        const root = new Node('Armature');
        const bone = new Node('Bone');
        root.addChild(bone);
        const unused = new Node('Unused');
        root.addChild(unused);
        if (animation) root.addComponent(SkeletalAnimation).useBakedAnimation = baked;
        const node = new Node('Skin');
        root.addChild(node);
        scene.addChild(root);
        const renderer = node.addComponent(SkinnedMeshRenderer);
        renderer.enabled = enabled;
        const mesh = skinnedTriangle();
        const skeleton = triangleSkeleton();
        const material = new Material();
        material.initialize({ effectName: 'builtin-unlit' });
        renderer.setSharedMaterial(material, 0);
        for (const property of order) {
            if (property === 'mesh') renderer.mesh = mesh;
            else if (property === 'skeleton') renderer.skeleton = skeleton;
            else renderer.skinningRoot = root;
        }
        app.run(scene);
        game.pause();
        renderer.enabled = true;
        // Explicit internal mode control is an observation fixture, not a public persistent lock.
        renderer.setUseBakedAnimation(baked, true);
        director.tick(0);
        const model = renderer.model!;
        expect(model).toBeInstanceOf(baked ? BakedSkinningModel : SkinningModel);
        expect(model.modelBounds).toBeTruthy();
        expect(model.worldBounds).toBeTruthy();
        for (const bounds of [model.modelBounds!, model.worldBounds!]) {
            expect([bounds.center.x, bounds.center.y, bounds.center.z,
                bounds.halfExtents.x, bounds.halfExtents.y, bounds.halfExtents.z].every(Number.isFinite)).toBe(true);
        }
        scene.destroy(); CCObject._deferredDestroy();
        mesh.destroy(); skeleton.destroy(); material.destroy(); CCObject._deferredDestroy();
    });
    afterAll(() => { game.pause(); app.diagnostics?.destroy(); });

    test('dynamic positions, joints and weights invalidate same-mesh bone bounds and hash', () => {
        const source = skinnedTriangle(), skeleton = triangleSkeleton();
        const geometry = (shift: number, joint: number) => ({
            positions: Float32Array.from(source.readAttribute(0, gfx.AttributeName.ATTR_POSITION)!, (value, index) => value + (index % 3 === 0 ? shift : 0)),
            indices16: new Uint16Array([0, 1, 2]),
            customAttributes: [
                { attr: new gfx.Attribute(gfx.AttributeName.ATTR_JOINTS, gfx.Format.RGBA32F),
                    values: new Float32Array([joint, 0, 0, 0, joint, 0, 0, 0, joint, 0, 0, 0]) },
                { attr: new gfx.Attribute(gfx.AttributeName.ATTR_WEIGHTS, gfx.Format.RGBA32F),
                    values: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]) },
            ],
        });
        const mesh = utils.MeshUtils.createDynamicMesh(0, geometry(0, 0), undefined,
            { maxSubMeshes: 1, maxSubMeshVertices: 3, maxSubMeshIndices: 3 });
        const original = mesh.getBoneSpaceBounds(skeleton), originalHash = mesh.hash;
        expect(original[0]!.center.x).toBe(0.5);
        mesh.updateSubMesh(0, geometry(10, 1));
        const updated = mesh.getBoneSpaceBounds(skeleton);
        expect(updated).not.toBe(original); expect(updated[0]).toBeNull();
        expect(updated[1]!.center.x).toBe(10.5); expect(mesh.hash).not.toBe(originalHash);
        mesh.destroy(); source.destroy(); skeleton.destroy(); CCObject._deferredDestroy();
    });

    test('merge recomputes bounds from both meshes rather than keeping the old skeleton cache', () => {
        const mesh = skinnedTriangle(), addition = skinnedTriangle(10), skeleton = triangleSkeleton();
        mesh.initialize(); const original = mesh.getBoneSpaceBounds(skeleton);
        expect(mesh.merge(addition)).toBe(true);
        const updated = mesh.getBoneSpaceBounds(skeleton);
        expect(updated).not.toBe(original);
        expect(updated[0]!.center.x).toBe(5.5); expect(updated[0]!.halfExtents.x).toBe(6.5);
        mesh.destroy(); addition.destroy(); skeleton.destroy(); CCObject._deferredDestroy();
    });

    test.each([SkinningModel, BakedSkinningModel])('a weighted missing joint path rejects before discarding a valid %p binding', (Model) => {
        const mesh = skinnedTriangle();
        const skeleton = triangleSkeleton();
        const validRoot = new Node('ValidRoot');
        validRoot.addChild(new Node('Bone'));
        // An unused joint may be absent without invalidating the binding.
        const model = new Model();
        model.bindSkeleton(skeleton, validRoot, mesh);
        const missingRoot = new Node('MissingRoot');
        expect(() => model.bindSkeleton(skeleton, missingRoot, mesh)).toThrow('AIR_E_SKINNING_JOINT_PATH');
        expect(model.transform).toBe(validRoot);
        if (model instanceof SkinningModel) expect((model as any)._joints).toHaveLength(1);
        else expect((model as any)._skeleton).toBe(skeleton);
        model.destroy(); mesh.destroy(); skeleton.destroy(); validRoot.destroy(); missingRoot.destroy();
        CCObject._deferredDestroy();
    });
});
