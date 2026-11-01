import { createAirApp, Scene, Node, MeshRenderer, Material, game } from '../../src';
import { Mesh } from '../../src/cocos/3d/assets/mesh';
import { MeshUtils } from '../../src/cocos/3d/misc/create-mesh';
import { CCObject } from '../../src/cocos/core/data/object';

const geometry = (x = 0) => ({
    positions: new Float32Array([x, 0, 0, x + 1, 0, 0, x, 1, 0, x + 1, 1, 0]),
    indices16: new Uint16Array([0, 1, 2, 1, 3, 2]),
});

describe('dynamic mesh renderer synchronization', () => {
    let app: Awaited<ReturnType<typeof createAirApp>>;
    let scene: Scene;
    let assets: (Mesh | Material)[];
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    beforeEach(() => {
        scene = new Scene('dynamic-sync');
        app.run(scene);
        game.pause();
        assets = [];
    });
    afterEach(() => {
        scene.destroy();
        CCObject._deferredDestroy();
        for (const asset of assets) asset.destroy();
        CCObject._deferredDestroy();
        jest.restoreAllMocks();
    });
    function mesh() {
        const result = MeshUtils.createDynamicMesh(0, geometry(), undefined, {
            maxSubMeshes: 1,
            maxSubMeshVertices: 4,
            maxSubMeshIndices: 6,
        });
        assets.push(result);
        return result;
    }
    function renderer(source: Mesh, parent: Node = scene) {
        const node = new Node('renderer');
        parent.addChild(node);
        const material = new Material();
        material.initialize({ effectName: 'builtin-unlit' });
        assets.push(material);
        const result = node.addComponent(MeshRenderer);
        result.mesh = source;
        result.setSharedMaterial(material, 0);
        return result;
    }
    const counts = (target: MeshRenderer) => target.model!.subModels[0].inputAssembler.drawInfo;

    test('one committed update refreshes real bounds and draw counts in every sharing renderer', () => {
        const source = mesh();
        const first = renderer(source);
        const parent = new Node('transformed-parent');
        parent.setPosition(10, 0, 0);
        parent.setScale(2, 2, 2);
        scene.addChild(parent);
        const second = renderer(source, parent);
        second.node.setPosition(1, 0, 0);
        source.updateSubMesh(0, {
            positions: new Float32Array([5, 0, 0, 6, 0, 0, 5, 1, 0]),
            indices16: new Uint16Array([0, 1, 2]),
        });
        expect(first.model!.worldBounds!.center.x).toBeCloseTo(5.5);
        expect(second.model!.worldBounds!.center.x).toBeCloseTo(23);
        expect(second.model!.worldBounds!.halfExtents.x).toBeCloseTo(1);
        for (const target of [first, second]) {
            expect(counts(target).indexCount).toBe(3);
            expect(counts(target).vertexCount).toBe(3);
        }
        source.updateSubMesh(0, { indices16: new Uint16Array() });
        expect(counts(first).indexCount).toBe(0);
        expect(counts(second).indexCount).toBe(0);
    });

    test('rebind, disabled updates and repeated enable do not retain old bindings or duplicate notifications', () => {
        const old = mesh(),
            next = mesh();
        const target = renderer(old);
        const changed = jest.spyOn(target, 'onGeometryChanged');
        target.mesh = next;
        old.updateSubMesh(0, geometry(100));
        expect(changed).not.toHaveBeenCalled();
        expect(old.hasEventListener(Mesh.EVENT_GEOMETRY_CHANGED)).toBe(false);
        expect(() => next.updateSubMesh(0, { indices16: new Uint16Array([99]) })).toThrow();
        expect(changed).not.toHaveBeenCalled();
        target.enabled = false;
        next.updateSubMesh(0, geometry(7));
        expect(changed).toHaveBeenCalledTimes(1);
        expect(target.model!.worldBounds!.center.x).toBeCloseTo(7.5);
        target.enabled = true;
        target.mesh = next;
        next.updateSubMesh(0, { indices16: new Uint16Array([0, 1, 2]) });
        expect(changed).toHaveBeenCalledTimes(2);
        expect(counts(target).indexCount).toBe(3);
    });

    test('queued destruction is ignored and never-loaded renderers also release their subscription', () => {
        const source = mesh();
        const active = renderer(source);
        const changed = jest.spyOn(active, 'onGeometryChanged');
        active.destroy();
        source.updateSubMesh(0, geometry(2));
        expect(changed).not.toHaveBeenCalled();
        CCObject._deferredDestroy();
        expect(source.hasEventListener(Mesh.EVENT_GEOMETRY_CHANGED)).toBe(false);
        const dormant = new Node('never-mounted');
        const component = dormant.addComponent(MeshRenderer);
        component.mesh = source;
        expect(component._isOnLoadCalled).toBe(0);
        expect(source.hasEventListener(Mesh.EVENT_GEOMETRY_CHANGED)).toBe(true);
        dormant.destroy();
        CCObject._deferredDestroy();
        expect(source.hasEventListener(Mesh.EVENT_GEOMETRY_CHANGED)).toBe(false);
    });
});
