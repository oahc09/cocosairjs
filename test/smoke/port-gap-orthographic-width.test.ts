import { createAirApp, Scene, Node, Camera, Vec3, game, director } from '../../src';
describe('native orthographic width opt-in and projection', () => {
    let app: Awaited<ReturnType<typeof createAirApp>>;
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    test('automatic aspect remains the default; explicit width changes projection and its inverse', async () => {
        const scene = new Scene('Width'), node = new Node('Camera'); scene.addChild(node);
        node.setPosition(0, 0, 10); const component = node.addComponent(Camera);
        component.projection = Camera.ProjectionType.ORTHO; component.orthoHeight = 3;
        app.run(scene); game.pause(); const camera = component.camera!; camera.resize(800, 400); camera.update(true);
        expect(component.orthoWidth).toBe(0); expect(camera.matProj.m00).toBeCloseTo(1 / 6);
        component.orthoWidth = 5; camera.update(true);
        expect(() => { camera.orthoWidth = -1; }).toThrow('AIR_E_ORTHO_WIDTH');
        expect(camera.orthoWidth).toBe(5);
        expect(camera.matProj.m00).toBeCloseTo(1 / 5); expect(camera.matProj.m05).toBeCloseTo(1 / 3);
        const projected = component.worldToScreen(new Vec3(5, 3, 0));
        expect(projected.x).toBeCloseTo(800); expect(projected.y).toBeCloseTo(400);
        const world = component.screenToWorld(new Vec3(800, 400, 0));
        expect(world.x).toBeCloseTo(5); expect(world.y).toBeCloseTo(3);
        component.orthoWidth = 0; camera.update(true); expect(camera.matProj.m00).toBeCloseTo(1 / 6);
        await app.releaseScene!();
    });
    test.each([-1, NaN, Infinity, '5'])('invalid half-width %p preserves the component value', (value) => {
        const component = new Node().addComponent(Camera); component.orthoWidth = 2;
        expect(() => { component.orthoWidth = value as number; }).toThrow('AIR_E_ORTHO_WIDTH');
        expect(component.orthoWidth).toBe(2);
    });
    test('pooled camera initialization resets the width override and perspective ignores it', async () => {
        const scene = new Scene('Pool'), node = new Node('Camera'); scene.addChild(node);
        const component = node.addComponent(Camera); component.orthoWidth = 20;
        app.run(scene); game.pause(); const camera = component.camera!; camera.resize(800, 400); camera.update(true);
        const perspective = camera.matProj.clone(); camera.orthoWidth = 10; camera.update(true);
        expect(camera.matProj).toEqual(perspective); await app.releaseScene!();
        const fresh = director.root!.createCamera();
        fresh.orthoWidth = 99;
        fresh.initialize({ name: 'Fresh', node: new Node(), projection: Camera.ProjectionType.ORTHO, window: director.root!.mainWindow });
        expect(fresh.orthoWidth).toBe(0); fresh.destroy();
    });
});
