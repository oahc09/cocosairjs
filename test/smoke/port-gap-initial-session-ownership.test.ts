import { createAirApp, Scene, game } from '../../src';

test('first run adopts prepared session ownership and cleanup occurs only on release', async () => {
    document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
    const app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    const prepared = app.session!; let cleaned = 0;
    prepared.own(() => { cleaned++; }, 'prepared-assets');
    try {
        app.run(new Scene('First')); game.pause();
        expect(cleaned).toBe(0);
        expect(app.session).toBe(prepared);
        expect(prepared.active).toBe(true);
        const release = await app.releaseScene!();
        expect(release.status).toBe('released'); expect(cleaned).toBe(1);
        app.run(new Scene('Second')); game.pause();
        expect(app.session).not.toBe(prepared);
        expect(cleaned).toBe(1);
    } finally { await app.releaseScene!(); }
});
