import { createAirApp, Scene, Node, game } from '../../src';

describe('PG-29 native singleton admission', () => {
    beforeAll(() => { document.body.innerHTML = '<canvas id="GameCanvas"></canvas>'; });
    test('concurrent same-canvas normalized defaults share the exact promise and app', async () => {
        const canvas = document.querySelector('canvas')!;
        const first = createAirApp({ canvas, renderMode: 3 });
        const second = createAirApp({ canvas: '#GameCanvas', renderMode: 3, physics: 'builtin',
            diagnostics: 'errors', contextLoss: { autoPause: true }, pixelRatioCap: 2 });
        expect(second).toBe(first);
        const [a, b] = await Promise.all([first, second]);
        expect(a).toBe(b); expect(await createAirApp({ canvas, renderMode: 3 })).toBe(a);
        a.run(new Scene('Singleton'));
        game.pause();
        expect(a.getScene()?.name).toBe('Singleton');
    });
    test('different canvas or configuration rejects without restarting the running app', async () => {
        const app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
        await expect(createAirApp({ canvas: '#GameCanvas', renderMode: 3, diagnostics: 'warnings' }))
            .rejects.toMatchObject({ code: 'AIR_E_APP_CONFLICT' });
        const other = document.createElement('canvas');
        await expect(createAirApp({ canvas: other, renderMode: 3 })).rejects.toMatchObject({ code: 'AIR_E_CANVAS_CONFLICT' });
        expect(app.getScene()?.name).toBe('Singleton');
    });
    test('invalid options retain the existing scene and do not acquire another canvas', async () => {
        const app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
        await expect(createAirApp({ canvas: '#missing' })).rejects.toMatchObject({ code: 'AIR_E_CANVAS' });
        await expect(createAirApp({ canvas: '#GameCanvas', pixelRatioCap: NaN })).rejects.toMatchObject({ code: 'AIR_E_PIXEL_RATIO_CAP' });
        await expect(createAirApp({ canvas: '#GameCanvas', designResolution: { width: 0, height: 480, policy: 0 } }))
            .rejects.toMatchObject({ code: 'AIR_E_DESIGN_RESOLUTION' });
        expect(app.getScene()?.name).toBe('Singleton');
        app.getScene()?.destroy(); game.pause(); app.diagnostics?.destroy();
    });
});
