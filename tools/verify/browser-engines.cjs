/* 三引擎 Playwright 二进制定位（win32）。
 * 优先使用当前 Playwright 包匹配且已安装的二进制；缺失时保留既有缓存回退。
 * browser-matrix 与专项采集器共同使用本模块，避免旧固定WebKit与当前协议不匹配。
 */
const path = require('path');
const fs = require('fs');

const ENGINES = {
    chromium: {
        dir: 'chromium-1228',
        exe: 'chrome-win64/chrome.exe',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
    },
    firefox: { dir: 'firefox-1543', exe: 'firefox/firefox.exe', args: [] },
    webkit: { dir: 'webkit-2311', exe: 'Playwright.exe', args: [] },
};

const DEFAULT_LOCAL_APP_DATA = 'C:/Users/caosh/AppData/Local';

function runnerOptions(engine, options) {
    if (process.platform === 'linux' && process.env.AIR_CI_SOFTWARE_GL === '1' && engine === 'chromium') {
        // Do not let ANGLE auto-select Mesa/OpenGL in a GPU-less Xvfb session.
        return { ...options, args: [...options.args, '--use-angle=swiftshader'] };
    }
    if (process.platform === 'linux' && process.env.AIR_CI_SOFTWARE_GL === '1' && engine === 'firefox') {
        // Firefox blocks software WebGL2 by default on GPU-less runners. Use the
        // real Mesa context in an Xvfb display; no engine fallback or mocked pixels.
        return { ...options, headless: false, firefoxUserPrefs: { 'webgl.force-enabled': true } };
    }
    return options;
}

function launchOptions(engine, localAppData = process.env.LOCALAPPDATA || DEFAULT_LOCAL_APP_DATA) {
    const conf = ENGINES[engine];
    if (!conf) {
        throw new Error(`未知浏览器引擎: ${engine}（可选 ${Object.keys(ENGINES).join('/')}）`);
    }
    // Chromium 1193 (the installed package's default) cannot decode the checked-in
    // H.264 clip. The project-pinned 1228 has been verified by the video example.
    // Use the same media-capable browser for all Chromium example evidence.
    if (engine === 'chromium' && arguments.length < 2) {
        const pinned = path.join(localAppData, 'ms-playwright', conf.dir, conf.exe.replace(/\//g, path.sep));
        if (fs.existsSync(pinned)) {
            return { executablePath: pinned, args: conf.args.slice() };
        }
    }
    // Prefer the revision required by the installed Playwright package. A pinned
    // WebKit from a different revision can launch but hang at the protocol layer.
    if (arguments.length < 2) {
        try {
            const executablePath = require('playwright')[engine].executablePath();
            if (fs.existsSync(executablePath)) {
                return runnerOptions(engine, { executablePath, args: conf.args.slice() });
            }
        } catch (error) {
            /* Preserve the existing explicit cache fallback. */
        }
    }
    return runnerOptions(engine, {
        executablePath: path.join(localAppData, 'ms-playwright', conf.dir, conf.exe.replace(/\//g, path.sep)),
        args: conf.args.slice(),
    });
}

module.exports = { ENGINES, launchOptions };
