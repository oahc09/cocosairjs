import { createAirApp, Scene, Node, DirectionalLight, Material, game } from '../../src';
import { MeshUtils } from '../../src/cocos/3d/misc/create-mesh';
import { inspectAirMeshMaterial, inspectAirGeometry, inspectAirDirectionalLights } from '../../src/air/rendering/engine-contracts';

describe('read-only native material geometry and light contracts', () => {
    let app: Awaited<ReturnType<typeof createAirApp>>;
    beforeAll(async () => { document.body.innerHTML = '<canvas id="GameCanvas"></canvas>'; app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3 }); });
    test('explicit builtin vertex color and missing UV are distinguished without compiling', () => {
        const mesh = MeshUtils.createMesh({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], colors: [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1] });
        const material = new Material(); material.initialize({ effectName: 'builtin-unlit' });
        const before = material.passes[0].defines;
        const disabled = inspectAirMeshMaterial(mesh, material);
        expect(disabled.issues.some(i => i.code === 'AIR_W_VERTEX_COLOR_DISABLED')).toBe(true);
        expect(material.passes[0].defines).toEqual(before);
        const textured = new Material(); textured.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: true, USE_VERTEX_COLOR: true } });
        const report = inspectAirMeshMaterial(mesh, textured);
        expect(report.issues.some(i => i.code === 'AIR_W_TEXTURE_UV_MISSING')).toBe(true);
        expect(report.issues.some(i => i.code === 'AIR_E_VERTEX_COLOR_MISSING')).toBe(false);
        expect(report.passes[0].reflection).toBe('unavailable'); mesh.destroy(); material.destroy(); textured.destroy();
    });
    test('reflection detects a declared vertex-color macro whose active GPU shader omits a_color', () => {
        const mesh = MeshUtils.createMesh({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], colors: new Array(12).fill(1) });
        const pass = { defines: { USE_VERTEX_COLOR: true }, _shader: { _gpuShader: { glProgram: {}, glInputs: [{ name: 'a_position' }] } } };
        // Explicit reflection fixture, not a GPU execution claim.
        const actual = new Material(); actual.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true } });
        Object.assign(actual.passes[0], { _shader: pass._shader });
        expect(inspectAirMeshMaterial(mesh, actual).issues.some(i => i.code === 'AIR_W_VERTEX_COLOR_INACTIVE')).toBe(true);
        actual.destroy(); mesh.destroy();
    });
    test('winding mismatch, negative and singular transforms are actual data, not a camera-facing guess', () => {
        const mesh = MeshUtils.createMesh({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], normals: [0, 0, -1, 0, 0, -1, 0, 0, -1], indices: [0, 1, 2] });
        const node = new Node(); node.setScale(-2, 1, 1); const report = inspectAirGeometry(mesh, node);
        expect(report.negativeScale).toBe(true); expect(report.triangles[0].providedNormalDot).toBe(-1);
        expect(report.triangles[0].normal).toEqual([0, 0, 1]); expect(report.determinant).toBe(-2);
        node.setScale(0, 1, 1); expect(inspectAirGeometry(mesh, node).singular).toBe(true); mesh.destroy(); node.destroy();
    });
    test('main directional query follows native selection and removal without rewriting light policy', async () => {
        expect(inspectAirDirectionalLights({ renderScene: null } as any).status).toBe('unavailable');
        const unmounted = new Scene('unmounted'); expect(inspectAirDirectionalLights(unmounted).lights.length).toBe(0); unmounted.destroy();
        const scene = new Scene('lights'); const a = new Node('first'), b = new Node('second');
        scene.addChild(a); scene.addChild(b); a.addComponent(DirectionalLight); b.addComponent(DirectionalLight);
        app.run(scene); game.pause();
        const report = inspectAirDirectionalLights(scene);
        expect(report.status).toBe('available'); if (report.status !== 'available') throw Error('mounted scene unavailable');
        expect(report.ordinaryDirectionalCapacity).toBe(1); expect(report.lights.length).toBe(2);
        expect(report.lights.filter(l => l.effective).length).toBe(1);
        const effective = report.lights.find(l => l.effective)!; const selected = effective.node === a.uuid ? a : b;
        selected.getComponent(DirectionalLight)!.enabled = false;
        const next = inspectAirDirectionalLights(scene); if (next.status !== 'available') throw Error('scene unavailable');
        expect(next.mainLight).not.toBe(effective.node); expect(next.lights.length).toBe(1);
        expect(Object.isFrozen(scene.renderScene!.directionalLights)).toBe(true); await app.releaseScene();
    });
});
