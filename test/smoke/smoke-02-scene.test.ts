/**
 * Smoke 2 — Scene → Camera → Render 流程（HEADLESS 模式）。
 */
import { createAirApp } from '../../src/air/bootstrap';
import { Scene, Node, Camera, director, game, Layers } from '../../src';

describe('smoke 2 — scene setup and run', () => {
    beforeAll(() => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
    });

    test('scene with camera runs through director', async () => {
        const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
        const app = await createAirApp({ canvas, renderMode: 3 });
        const run = jest.spyOn(game, 'run');

        const scene = new Scene('smoke-scene');
        const cameraNode = new Node('Main Camera');
        scene.addChild(cameraNode);
        const cam = cameraNode.addComponent(Camera);
        expect(cam).toBeTruthy();

        const cube = new Node('Cube');
        cube.layer = Layers.Enum.DEFAULT;
        scene.addChild(cube);

        app.run(scene);
        expect(director.getScene()?.name).toBe('smoke-scene');
        expect(scene.getChildByName('Cube')).toBeTruthy();
        const next = new Scene('replacement');
        app.run(next);
        expect(app.getScene()).toBe(next);
        expect(run).toHaveBeenCalledTimes(1);
        expect(scene.isValid).toBe(false);
        run.mockRestore();
    });
});
