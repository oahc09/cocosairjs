'use strict';
// Shader-scoped browser launch options: reuses the repository's browser-engines
// launchOptions and, on Windows WebKit only, opts out of Playwright's default
// --disable-accelerated-compositing flag (Playwright core pushes it on Windows;
// upstream embedder MainWindow.cpp maps it to WKPreferencesSetAcceleratedCompositingEnabled).
// This restores compositor WebGL canvas presentation after same-page viewport resize.
// All other engines/platforms keep the original options unchanged.
const { launchOptions: baseLaunchOptions, ENGINES } = require('./browser-engines.cjs');

const ACCELERATED_COMPOSITING_FLAG = '--disable-accelerated-compositing';

function isWindows() {
    return process.platform === 'win32';
}

/**
 * Shader-scoped launch options.
 * @param {string} engine chromium|firefox|webkit
 * @param {object} [options]
 * @param {boolean} [options.recordStrategy] When true, includes a `strategy` object
 *   describing the launch decision (engine, platform, flagsIgnored, reason).
 * @returns {{ executablePath: string, args: string[], ignoreDefaultArgs?: string[], strategy?: object }}
 */
function shaderLaunchOptions(engine, options = {}) {
    const base = baseLaunchOptions(engine);
    if (!ENGINES[engine]) {
        throw new Error(`Unknown engine: ${engine} (expected ${Object.keys(ENGINES).join('/')})`);
    }
    const result = { ...base, args: base.args.slice() };
    let strategy;
    if (engine === 'webkit' && isWindows()) {
        // Windows Playwright default-pushes --disable-accelerated-compositing; opting out
        // restores WK accelerated compositing so same-page resize keeps presenting WebGL.
        result.ignoreDefaultArgs = [ACCELERATED_COMPOSITING_FLAG];
        strategy = {
            engine,
            platform: 'win32',
            flagsIgnored: [ACCELERATED_COMPOSITING_FLAG],
            reason: 'Windows WebKit: Playwright default-pushes --disable-accelerated-compositing; opting out restores compositor WebGL canvas presentation after live viewport resize (Lead w1-r16 evidence)',
        };
    } else {
        strategy = {
            engine,
            platform: process.platform,
            flagsIgnored: [],
            reason: 'No override needed: non-Windows or non-WebKit engine keeps original launch options',
        };
    }
    // Guard: never accidentally ADD the flag via args (which would re-disable compositing).
    if (result.args.includes(ACCELERATED_COMPOSITING_FLAG)) {
        throw new Error(
            `Internal error: ${ACCELERATED_COMPOSITING_FLAG} found in args — this would re-disable compositing`,
        );
    }
    if (options.recordStrategy) result.strategy = strategy;
    return result;
}

module.exports = { shaderLaunchOptions, isWindows, ACCELERATED_COMPOSITING_FLAG };
