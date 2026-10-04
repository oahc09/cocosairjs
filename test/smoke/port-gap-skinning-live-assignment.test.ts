import { createAirApp, Scene, Node, Material, SkinnedMeshRenderer, game, director } from '../../src';
import { CCObject } from '../../src/cocos/core/data/object';
import { skinnedTriangle, triangleSkeleton } from '../fixtures/skinning/geometry';
describe('native skinning assignment in an already running scene', () => {
    let app: Awaited<ReturnType<typeof createAirApp>>;
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
        game.pause();
    });
    const orders = [
        ['mesh', 'skeleton', 'root'],
        ['mesh', 'root', 'skeleton'],
        ['skeleton', 'mesh', 'root'],
        ['skeleton', 'root', 'mesh'],
        ['root', 'mesh', 'skeleton'],
        ['root', 'skeleton', 'mesh'],
    ];
    test.each(orders)('live property order %s / %s / %s completes native submodels', async (...order) => {
        const scene = new Scene(),
            root = new Node('Armature'),
            node = new Node('Skin');
        root.addChild(new Node('Bone'));
        root.addChild(node);
        scene.addChild(root);
        app.run(scene);
        game.pause();
        const renderer = node.addComponent(SkinnedMeshRenderer),
            mesh = skinnedTriangle(),
            skeleton = triangleSkeleton(),
            material = new Material();
        material.initialize({ effectName: 'builtin-unlit' });
        try {
            for (const property of order) {
                if (property === 'mesh') renderer.mesh = mesh;
                else if (property === 'skeleton') renderer.skeleton = skeleton;
                else renderer.skinningRoot = root;
            }
            renderer.setSharedMaterial(material, 0);
            director.tick(0);
            expect(renderer.model!.subModels).toHaveLength(1);
            expect(renderer.model!.enabled).toBe(true);
            expect(renderer.model!.transform).toBe(root);
        } finally {
            await app.releaseScene();
            mesh.destroy();
            skeleton.destroy();
            material.destroy();
            CCObject._deferredDestroy();
        }
    });
});
