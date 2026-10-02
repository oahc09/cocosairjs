/**
 * Smoke 1 — createAirApp 引导（计划书 Phase 16）。
 * jsdom + HEADLESS 渲染模式：验证引擎初始化全链路（Base→Infrastructure→Subsystem）。
 */
import { createAirApp } from '../../src/air/bootstrap';
import { AIR_VERSION, AIR_REVISION } from '../../src/air/app';
import pkg from '../../package.json';
import { game, Game } from '../../src/cocos/game';
import { DebugMode } from '../../src/cocos/core/platform/debug';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');

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

    test('AIR_VERSION is exported and stays in sync with package.json', () => {
        expect(AIR_VERSION).toMatch(/^\d+\.\d+\.\d+/);
        expect(AIR_VERSION).toBe(pkg.version);
        expect(Number.isInteger(AIR_REVISION)).toBe(true);
        expect(AIR_REVISION).toBe(Number(AIR_VERSION.match(/^\d+\.\d+\.\d+/)![0].replace(/\./g, '')));
    });

    // 同名 `export *` 成员会被 ESM 静默丢弃：只在源码里定义不等于外部拿得到，因此直接查产物导出表。
    test('AIR_VERSION appears in the built bundle export table', () => {
        for (const filename of ['cocosair.module.js', 'cocosair.module.min.js']) {
            const bundle = path.join(process.cwd(), 'build', filename);
            expect(fs.existsSync(bundle)).toBe(true);
            const exported = (fs.readFileSync(bundle, 'utf8').match(/export\s*\{([^}]*)\}/) ?? [])[1] ?? '';
            const names = exported.split(',').map((entry: string) => entry.trim().split(/\s+as\s+/).pop());
            expect(names).toContain('AIR_VERSION');
            expect(names).toContain('AIR_REVISION');
        }
        const declarations = fs.readFileSync(path.join(process.cwd(), 'build', 'cocosair.module.d.ts'), 'utf8');
        expect(declarations).toMatch(/export\s+(?:declare\s+)?const\s+AIR_REVISION\b/);
    });
});
