/**
 * Smoke 1 — createAirApp 引导（计划书 Phase 16）。
 * jsdom + HEADLESS 渲染模式：验证引擎初始化全链路（Base→Infrastructure→Subsystem）。
 */
import { createAirApp } from '../../src/air/bootstrap';
import { AIR_VERSION, AIR_REVISION, AIR_BUILD_DATE, AIR_BUILD_NUMBER } from '../../src/air/app';
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
        expect(AIR_BUILD_DATE).toBe('unbuilt');
        expect(AIR_BUILD_NUMBER).toBe(1);
        const { resolveBuildDate, readBuildNumber, commitBuildNumber } = require('../../tools/build/build-metadata.cjs');
        expect(resolveBuildDate('0')).toBe('197001010800');
        expect(resolveBuildDate(undefined, new Date('2026-10-06T14:39:00Z'))).toBe('202610062239');
        expect(resolveBuildDate(undefined, new Date('2026-10-06T16:00:00Z'))).toBe('202610070000');
        for (const epoch of ['', '-1', '1.5', 'invalid', '999999999999999999999999']) {
            expect(() => resolveBuildDate(epoch)).toThrow(/SOURCE_DATE_EPOCH/);
        }
        const tempBase = path.resolve(require('os').tmpdir());
        const temp = fs.mkdtempSync(path.join(tempBase, 'cocosair-build-number-'));
        try {
            fs.mkdirSync(path.join(temp, 'tools/build'), { recursive: true });
            fs.writeFileSync(path.join(temp, 'tools/build/build-number.json'), '{"lastBuildNumber":0}');
            expect(readBuildNumber(temp) + 1).toBe(1);
            commitBuildNumber(temp, 1);
            expect(readBuildNumber(temp) + 1).toBe(2);
            expect(() => commitBuildNumber(temp, 1)).toThrow(/concurrently/);
            expect(readBuildNumber(temp)).toBe(1);
            commitBuildNumber(temp, 2);
            expect(readBuildNumber(temp)).toBe(2);
        } finally {
            if (!path.resolve(temp).startsWith(tempBase + path.sep)) throw new Error('Invalid test cleanup path');
            fs.rmSync(temp, { recursive: true, force: true });
        }
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
            expect(names).toContain('AIR_BUILD_DATE');
            expect(names).toContain('AIR_BUILD_NUMBER');
            expect(fs.readFileSync(bundle, 'utf8')).toMatch(/["']\d{12}["']/);
        }
        const declarations = fs.readFileSync(path.join(process.cwd(), 'build', 'cocosair.module.d.ts'), 'utf8');
        expect(declarations).toMatch(/export\s+(?:declare\s+)?const\s+AIR_REVISION\b/);
        expect(declarations).toMatch(/export\s+(?:declare\s+)?const\s+AIR_BUILD_DATE\s*:\s*string/);
        expect(declarations).toMatch(/export\s+(?:declare\s+)?const\s+AIR_BUILD_NUMBER\s*:\s*number/);
    });
});
