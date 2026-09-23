/* 三引擎 Playwright 二进制定位（win32）。
 * Playwright 包版本与 ms-playwright 缓存构建号不一致 ⇒ 必须显式指路，不能靠默认解析。
 * 注：tools/v12/browser-matrix.cjs 目前仍带自己的一份同表副本（它是顶层 IIFE 脚本、被证据链引用，
 * 迁移要等下一次矩阵重采窗口一起做，见 docs/v12-upstream-regression.md §7.6）。改这张表时两处都要改。
 */
const path = require('path');

const ENGINES = {
    chromium: { dir: 'chromium-1228', exe: 'chrome-win64/chrome.exe', args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] },
    firefox: { dir: 'firefox-1543', exe: 'firefox/firefox.exe', args: [] },
    webkit: { dir: 'webkit-2361', exe: 'Playwright.exe', args: [] },
};

const DEFAULT_LOCAL_APP_DATA = 'C:/Users/caosh/AppData/Local';

function launchOptions (engine, localAppData = process.env.LOCALAPPDATA || DEFAULT_LOCAL_APP_DATA) {
    const conf = ENGINES[engine];
    if (!conf) { throw new Error(`未知浏览器引擎: ${engine}（可选 ${Object.keys(ENGINES).join('/')}）`); }
    return { executablePath: path.join(localAppData, 'ms-playwright', conf.dir, conf.exe.replace(/\//g, path.sep)), args: conf.args.slice() };
}

module.exports = { ENGINES, launchOptions };
