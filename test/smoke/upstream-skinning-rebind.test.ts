import {
    createAirApp,
    Scene,
    Node,
    Material,
    SkinnedMeshRenderer,
    Skeleton,
    Mat4,
    game,
    director,
    gfx,
} from '../../src';
import { SkinnedMeshBatchRenderer } from '../../src/cocos/3d/skinned-mesh-renderer/skinned-mesh-batch-renderer';
import {
    UBOSkinning,
    UBOSkinningAnimation,
    UNIFORM_REALTIME_JOINT_TEXTURE_BINDING,
} from '../../src/cocos/rendering/define';
import { CCObject } from '../../src/cocos/core/data/object';
import { skinnedTriangle, triangleSkeleton } from '../fixtures/skinning/geometry';

describe('upstream #354 / #359 skinning accessors and descriptor rebinds', () => {
    let formerCapacity: number;
    let app: Awaited<ReturnType<typeof createAirApp>>;
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
        game.pause();
        // HEADLESS exposes no GPU uniform limits; exercise both native transport branches.
        formerCapacity = UBOSkinning.JOINT_UNIFORM_CAPACITY;
        UBOSkinning.initLayout(30);
    });
    afterAll(() => {
        UBOSkinning.initLayout(formerCapacity);
        game.pause();
        app.diagnostics?.destroy();
    });

    test('batch renderer delegates mesh and skeleton getters/setters without recursion', () => {
        const node = new Node('Batch');
        const renderer = node.addComponent(SkinnedMeshBatchRenderer);
        const mesh = skinnedTriangle();
        const skeleton = triangleSkeleton();
        try {
            expect(renderer.mesh).toBeNull();
            expect(renderer.skeleton).toBeNull();
            renderer.mesh = mesh;
            renderer.skeleton = skeleton;
            expect(renderer.mesh).toBe(mesh);
            expect(renderer.skeleton).toBe(skeleton);
            renderer.mesh = null;
            renderer.skeleton = null;
            expect(renderer.mesh).toBeNull();
            expect(renderer.skeleton).toBeNull();
        } finally {
            node.destroy();
            mesh.destroy();
            skeleton.destroy();
            CCObject._deferredDestroy();
        }
    });

    test.each(['uniform', 'texture', 'baked'])(
        '%s rebind refreshes resources and preserves user instance data',
        async (mode) => {
            const scene = new Scene();
            const roots = [new Node('FirstRoot'), new Node('SecondRoot')];
            for (const root of roots) {
                root.addChild(new Node('Bone'));
                scene.addChild(root);
            }
            const node = new Node('Skin');
            scene.addChild(node);
            app.run(scene);
            game.pause();
            const mesh = skinnedTriangle();
            const skeleton = mode === 'texture' ? new Skeleton() : triangleSkeleton();
            if (mode === 'texture') {
                skeleton.joints = [
                    'Bone',
                    ...Array.from({ length: UBOSkinning.JOINT_UNIFORM_CAPACITY }, (_, i) => `Unused${i}`),
                ];
                skeleton.bindposes = skeleton.joints.map(() => new Mat4());
            }
            const material = new Material();
            material.initialize({ effectName: 'builtin-unlit' });
            try {
                const renderer = node.addComponent(SkinnedMeshRenderer);
                renderer.setUseBakedAnimation(mode === 'baked');
                renderer.skinningRoot = roots[0];
                renderer.skeleton = skeleton;
                renderer.mesh = mesh;
                renderer.setSharedMaterial(material, 0);
                director.tick(0);
                const model = renderer.model! as any;
                const submodel = model.subModels[0];
                // Exercise the real attribute allocator and public setter, not a synthetic attribute block.
                const feature = jest.spyOn(submodel.passes[0].device, 'hasFeature').mockReturnValue(true);
                try {
                    submodel.UpdateInstancedAttributes([
                        new gfx.Attribute('a_userTint', gfx.Format.RGBA32F, false, 0, true),
                    ]);
                    renderer.setInstancedAttribute('a_userTint', [0.125, 0.25, 0.5, 1]);
                    const block = submodel.instancedAttributeBlock;
                    const bytes = block.buffer;
                    const descriptor = submodel.descriptorSet;
                    const binding = mode === 'baked' ? UBOSkinningAnimation.BINDING : UBOSkinning.BINDING;
                    // EmptyDevice omits descriptor layout indices. Observe the actual binding calls
                    // while retaining native model allocation and rebind behavior.
                    const bind = jest.spyOn(descriptor, mode === 'texture' ? 'bindTexture' : 'bindBuffer');
                    const resourceBinding = mode === 'texture' ? UNIFORM_REALTIME_JOINT_TEXTURE_BINDING : binding;
                    const lastResource = () =>
                        bind.mock.calls.filter((call) => call[0] === resourceBinding).slice(-1)[0]?.[1];
                    model.bindSkeleton(skeleton, roots[0], mesh);
                    const previous = lastResource();
                    expect(previous).toBeTruthy();
                    bind.mockClear();
                    model.bindSkeleton(skeleton, roots[1], mesh);
                    const replacement = lastResource();
                    expect(replacement).toBeTruthy();
                    expect(replacement).not.toBe(previous);
                    bind.mockRestore();
                    expect(model.transform).toBe(roots[1]);
                    expect(block.buffer).toBe(bytes);
                    expect(Array.from(block.views[0])).toEqual([0.125, 0.25, 0.5, 1]);
                } finally {
                    feature.mockRestore();
                }
            } finally {
                await app.releaseScene();
                mesh.destroy();
                skeleton.destroy();
                material.destroy();
                CCObject._deferredDestroy();
            }
        },
    );
});
