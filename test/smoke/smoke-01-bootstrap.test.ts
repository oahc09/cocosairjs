/**
 * Smoke 1 — createAirApp 引导（计划书 Phase 16）。
 * jsdom + HEADLESS 渲染模式：验证引擎初始化全链路（Base→Infrastructure→Subsystem）。
 */
import { createAirApp } from '../../src/air/bootstrap';
import { game, Game } from '../../src/cocos/game';
import { DebugMode } from '../../src/cocos/core/platform/debug';

describe('smoke 1 — createAirApp bootstrap', () => {
    beforeAll(() => {
        document.body.innerHTML = '<div id="GameDiv"><div id="Cocos3dGameContainer"><canvas id="GameCanvas"></canvas></div></div>';
    });

    test('createAirApp initializes engine and returns app', async () => {
        const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
        expect(canvas).toBeTruthy();

        const app = await createAirApp({ canvas, renderMode: 3 });
        expect(app).toBeTruthy();
        expect(typeof app.run).toBe('function');
        expect((game as unknown as { _inited: boolean })._inited).toBe(true);
    });
});
