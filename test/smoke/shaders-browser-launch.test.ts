/**
 * Contracts for the shader-scoped browser launch options helper.
 * Pure function tests — no browser launch, no output/ dependency.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const {
    shaderLaunchOptions,
    isWindows,
    ACCELERATED_COMPOSITING_FLAG,
} = require('../../tools/verify/shaders-browser-launch.cjs');
// Mock browser-engines to avoid its internal require('playwright') in Jest VM
jest.mock('../../tools/verify/browser-engines.cjs', () => ({
    ENGINES: {
        chromium: { dir: 'chromium-1228', exe: 'chrome-win64/chrome.exe', args: ['--use-gl=angle'] },
        firefox: { dir: 'firefox-1543', exe: 'firefox/firefox.exe', args: [] },
        webkit: { dir: 'webkit-2311', exe: 'Playwright.exe', args: [] },
    },
    launchOptions: (engine) => ({
        executablePath: '/mock/' + engine + '/browser.exe',
        args: engine === 'chromium' ? ['--use-gl=angle'] : [],
    }),
}));
const { launchOptions: baseLaunchOptions } = require('../../tools/verify/browser-engines.cjs');

const ROOT = path.resolve(__dirname, '../..');

describe('shader-browser-launch: production options contracts', () => {
    const originalPlatform = process.platform;

    afterEach(() => {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    function setPlatform(platform: string) {
        Object.defineProperty(process, 'platform', { value: platform });
    }

    test('Windows WebKit: exactly one ignored flag, and it is the compositing flag', () => {
        setPlatform('win32');
        const opts = shaderLaunchOptions('webkit');
        expect(opts.ignoreDefaultArgs).toEqual([ACCELERATED_COMPOSITING_FLAG]);
        expect(opts.ignoreDefaultArgs).toHaveLength(1);
        expect(opts.args).not.toContain(ACCELERATED_COMPOSITING_FLAG);
    });

    test('Windows Chromium: no ignoreDefaultArgs, options identical to base', () => {
        setPlatform('win32');
        const opts = shaderLaunchOptions('chromium');
        const base = baseLaunchOptions('chromium');
        expect(opts.ignoreDefaultArgs).toBeUndefined();
        expect(opts.executablePath).toBe(base.executablePath);
        expect(opts.args).toEqual(base.args);
    });

    test('Windows Firefox: no ignoreDefaultArgs, options identical to base', () => {
        setPlatform('win32');
        const opts = shaderLaunchOptions('firefox');
        const base = baseLaunchOptions('firefox');
        expect(opts.ignoreDefaultArgs).toBeUndefined();
        expect(opts.executablePath).toBe(base.executablePath);
        expect(opts.args).toEqual(base.args);
    });

    test('Non-Windows WebKit (linux): no ignoreDefaultArgs', () => {
        setPlatform('linux');
        const opts = shaderLaunchOptions('webkit');
        expect(opts.ignoreDefaultArgs).toBeUndefined();
    });

    test('Non-Windows WebKit (darwin): no ignoreDefaultArgs', () => {
        setPlatform('darwin');
        const opts = shaderLaunchOptions('webkit');
        expect(opts.ignoreDefaultArgs).toBeUndefined();
    });

    test('Preserves executablePath from base launchOptions', () => {
        setPlatform('win32');
        const base = baseLaunchOptions('webkit');
        const opts = shaderLaunchOptions('webkit');
        expect(opts.executablePath).toBe(base.executablePath);
    });

    test('Each call returns a fresh object (not shared mutable state)', () => {
        setPlatform('win32');
        const a = shaderLaunchOptions('webkit');
        const b = shaderLaunchOptions('webkit');
        expect(a).not.toBe(b);
        expect(a.args).not.toBe(b.args);
        expect(a.ignoreDefaultArgs).not.toBe(b.ignoreDefaultArgs);
    });

    test('Unknown engine throws', () => {
        expect(() => shaderLaunchOptions('safari')).toThrow(/Unknown engine/);
        expect(() => shaderLaunchOptions('')).toThrow(/Unknown engine/);
    });

    test('args never contain the compositing disable flag', () => {
        setPlatform('win32');
        for (const engine of ['chromium', 'firefox', 'webkit']) {
            const opts = shaderLaunchOptions(engine);
            expect(opts.args).not.toContain(ACCELERATED_COMPOSITING_FLAG);
        }
    });

    test('recordStrategy includes decision details', () => {
        setPlatform('win32');
        const wk = shaderLaunchOptions('webkit', { recordStrategy: true });
        expect(wk.strategy?.engine).toBe('webkit');
        expect(wk.strategy?.platform).toBe('win32');
        expect(wk.strategy?.flagsIgnored).toEqual([ACCELERATED_COMPOSITING_FLAG]);
        expect(wk.strategy?.reason).toContain('accelerated');

        const ch = shaderLaunchOptions('chromium', { recordStrategy: true });
        expect(ch.strategy?.flagsIgnored).toEqual([]);
    });

    test('isWindows is a pure platform check', () => {
        setPlatform('win32');
        expect(isWindows()).toBe(true);
        setPlatform('linux');
        expect(isWindows()).toBe(false);
    });
});

describe('shader-browser-launch: SDK identity invariant', () => {
    test('launch option queries preserve current SDK artifact SHAs', () => {
        const sha = (f: string) =>
            crypto
                .createHash('sha256')
                .update(fs.readFileSync(path.join(ROOT, f)))
                .digest('hex');
        const artifacts = ['build/cocosair.module.js', 'build/cocosair.module.d.ts', 'build/npm/cocosair.module.js'];
        const before = artifacts.map(sha);
        const originalPlatform = process.platform;
        try {
            jest.isolateModules(() => {
                const helper = require('../../tools/verify/shaders-browser-launch.cjs');
                for (const platform of ['win32', 'linux', 'darwin']) {
                    Object.defineProperty(process, 'platform', { value: platform });
                    for (const engine of ['chromium', 'firefox', 'webkit']) {
                        helper.shaderLaunchOptions(engine);
                        helper.shaderLaunchOptions(engine, { recordStrategy: true });
                    }
                }
            });
        } finally {
            Object.defineProperty(process, 'platform', { value: originalPlatform });
        }
        expect(artifacts.map(sha)).toEqual(before);
    });
});
