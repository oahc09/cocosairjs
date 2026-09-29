/* 三引擎 Playwright 二进制定位（win32）。
 * 优先使用当前 Playwright 包匹配且已安装的二进制；缺失时保留既有缓存回退。
 * 注：tools/verify/browser-matrix.cjs 目前仍带自己的一份同表副本（它是顶层 IIFE 脚本、被证据链引用，
 * 改动需与矩阵采集器同步，采集要求见 docs/reference/verification.md）。改这张表时两处都要改。
 */
const path = require('path');
const fs = require('fs');

const ENGINES = {
    chromium: { dir: 'chromium-1228', exe: 'chrome-win64/chrome.exe', args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] },
    firefox: { dir: 'firefox-1543', exe: 'firefox/firefox.exe', args: [] },
    webkit: { dir: 'webkit-2311', exe: 'Playwright.exe', args: [] },
};

const DEFAULT_LOCAL_APP_DATA = 'C:/Users/caosh/AppData/Local';

function launchOptions (engine, localAppData = process.env.LOCALAPPDATA || DEFAULT_LOCAL_APP_DATA) {
    const conf = ENGINES[engine];
    if (!conf) { throw new Error(`未知浏览器引擎: ${engine}（可选 ${Object.keys(ENGINES).join('/')}）`); }
    // Chromium 1193 (the installed package's default) cannot decode the checked-in
    // H.264 clip. The project-pinned 1228 has been verified by the video example.
    // Use the same media-capable browser for all Chromium example evidence.
    if (engine === 'chromium' && arguments.length < 2) {
        const pinned = path.join(localAppData, 'ms-playwright', conf.dir, conf.exe.replace(/\//g, path.sep));
        if (fs.existsSync(pinned)) { return { executablePath: pinned, args: conf.args.slice() }; }
    }
    // Prefer the revision required by the installed Playwright package. A pinned
    // WebKit from a different revision can launch but hang at the protocol layer.
    if (arguments.length < 2) {
        try {
            const executablePath = require('playwright')[engine].executablePath();
            if (fs.existsSync(executablePath)) { return { executablePath, args: conf.args.slice() }; }
        } catch (error) { /* Preserve the existing explicit cache fallback. */ }
    }
    return { executablePath: path.join(localAppData, 'ms-playwright', conf.dir, conf.exe.replace(/\//g, path.sep)), args: conf.args.slice() };
}

module.exports = { ENGINES, launchOptions };
