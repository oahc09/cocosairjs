import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Material,
    MeshRenderer,
    Layers,
    utils,
    primitives,
    geometry,
    game,
    director,
} from '../../src';
import { CCObject } from '../../src/cocos/core/data/object';
import { inspectRenderVisibility } from '../../tools/debug/render-visibility';
import { createAgentSession } from '../../tools/debug/agent-session';
describe('optional native visibility filters', () => {
    let app: Awaited<ReturnType<typeof createAirApp>>;
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
        game.pause();
    });
    test('unbound model is explicit and does not initialize resources', () => {
        const node = new Node(),
            renderer = node.addComponent(MeshRenderer),
            report = inspectRenderVisibility(renderer, []);
        expect(report.cameraCount).toBe(0);
        expect(report.modelEnabled).toBeNull();
        expect(renderer.model).toBeNull();
        expect(Object.isFrozen(report.cameras)).toBe(true);
        node.destroy();
        CCObject._deferredDestroy();
    });
    test('real native OR visibility, frustum, disable and repeated session reads are independent of ownership', async () => {
        const scene = new Scene(),
            cn = new Node('Camera'),
            node = new Node('Triangle');
        scene.addChild(cn);
        scene.addChild(node);
        cn.setPosition(0, 0, 10);
        const camera = cn.addComponent(Camera);
        camera.projection = Camera.ProjectionType.ORTHO;
        camera.orthoHeight = 4;
        const renderer = node.addComponent(MeshRenderer),
            mesh = utils.createMesh(primitives.box({})),
            material = new Material();
        material.initialize({ effectName: 'builtin-unlit' });
        renderer.mesh = mesh;
        renderer.setSharedMaterial(material, 0);
        app.run(scene);
        game.pause();
        director.tick(0);
        const session = createAgentSession({ app });
        const report = () => inspectRenderVisibility(renderer, [camera], geometry.intersect.aabbFrustum);
        // HEADLESS has no rendered camera update. Prepare native cached bounds
        // and frustum explicitly; the inspector itself stays read-only.
        const prepare = () => {
            renderer.model?.updateWorldBound();
            camera.camera.resize(480, 360);
            camera.camera.update(true);
        };
        const instance = jest.spyOn(renderer, 'getMaterialInstance'),
            refs = [mesh.refCount, material.refCount],
            model = renderer.model;
        try {
            prepare();
            expect(report().cameras[0].reason).toBe('PASSES_OBSERVED_FILTERS');
            camera.visibility = 0;
            expect(report().cameras[0].reason).toBe('LAYER_MASK');
            camera.visibility = Layers.Enum.DEFAULT;
            node.layer = Layers.Enum.UI_2D;
            renderer.visibility = Layers.Enum.DEFAULT;
            director.tick(0);
            expect(report().cameras[0]).toMatchObject({
                nodeIncluded: false,
                modelIncluded: true,
                layerIncluded: true,
                reason: 'PASSES_OBSERVED_FILTERS',
            });
            node.setPosition(1000, 0, 0);
            director.tick(0);
            prepare();
            expect(report().cameras[0].reason).toBe('FRUSTUM');
            node.setPosition(0, 0, 0);
            director.tick(0);
            prepare();
            camera.enabled = false;
            expect(report().cameras[0].reason).toBe('CAMERA_DISABLED');
            camera.enabled = true;
            renderer.enabled = false;
            expect(report().cameras[0].reason).toBe('MODEL_DISABLED');
            renderer.enabled = true;
            director.tick(0);
            const id = session.inspectScene().nodes.find((v) => v.name === 'Triangle')!.id,
                first = session.inspectNode(id),
                second = session.inspectNode(id);
            expect(first.visual.mesh?.visibility).toEqual(second.visual.mesh?.visibility);
            expect(first.layer).toBe(Layers.Enum.UI_2D);
            expect(instance).not.toHaveBeenCalled();
            expect([mesh.refCount, material.refCount]).toEqual(refs);
            expect(renderer.model).toBe(model);
        } finally {
            instance.mockRestore();
            session.close();
            await app.releaseScene();
            mesh.destroy();
            material.destroy();
            CCObject._deferredDestroy();
        }
    });
});
