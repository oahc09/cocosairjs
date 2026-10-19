'use strict';
// Diagnostic only: preserves Playwright arguments/results and all admission deadlines.
const Module = require('node:module');
const { performance } = require('node:perf_hooks');
let sequence = 0;
const seen = new WeakSet();
function emit(phase, extra = {}) {
    process.stderr.write(
        JSON.stringify({
            kind: 'spark-startup-diagnostic',
            variant: process.env.AIR_SPARK_AB_VARIANT,
            pid: process.pid,
            sequence: ++sequence,
            monotonicMs: performance.now(),
            phase,
            ...extra,
        }) + '\n',
    );
}
function wrap(object, name, after) {
    const original = object[name];
    object[name] = async function (...args) {
        const call = ++sequence;
        emit(name + ':begin', { call });
        try {
            const result = await original.apply(this, args);
            if (after) await after(result);
            emit(name + ':end', { call });
            return result;
        } catch (error) {
            emit(name + ':error', { call, errorName: error?.name || 'Error' });
            throw error;
        }
    };
}
function instrumentLauncher(launcher) {
    if (!launcher || seen.has(launcher)) return;
    seen.add(launcher);
    wrap(launcher, 'launch', async (browser) => {
        wrap(browser, 'newContext', async (context) => {
            wrap(context, 'newPage', async (page) => {
                page.on('console', (message) => {
                    const value = message.text();
                    if (value.startsWith('SPARK_DIAGNOSTIC ')) emit('page-snapshot', { value: value.slice(17, 6000) });
                    else
                        emit('console', {
                            type: message.type(),
                            text: value.replace(/https?:\/\/\S+/g, '[url]').slice(0, 500),
                        });
                });
                page.on('pageerror', (error) =>
                    emit('pageerror', {
                        text: String(error)
                            .replace(/https?:\/\/\S+/g, '[url]')
                            .slice(0, 500),
                    }),
                );
                page.on('response', (response) =>
                    emit('response', {
                        resource: new URL(response.url()).pathname.split('/').pop(),
                        status: response.status(),
                    }),
                );
                page.on('requestfailed', (request) =>
                    emit('requestfailed', {
                        resource: new URL(request.url()).pathname.split('/').pop(),
                        failure: request.failure()?.errorText,
                    }),
                );
                await page.addInitScript(() => {
                    const lastGL = [];
                    let calls = 0;
                    for (const prototype of [
                        globalThis.WebGLRenderingContext?.prototype,
                        globalThis.WebGL2RenderingContext?.prototype,
                    ]) {
                        if (!prototype) continue;
                        for (const name of [
                            'compileShader',
                            'linkProgram',
                            'useProgram',
                            'drawArrays',
                            'drawElements',
                            'drawArraysInstanced',
                            'drawElementsInstanced',
                            'readPixels',
                        ]) {
                            if (!Object.prototype.hasOwnProperty.call(prototype, name)) continue;
                            const original = prototype[name];
                            prototype[name] = function (...args) {
                                lastGL.push({ name, at: performance.now(), sequence: ++calls });
                                if (lastGL.length > 12) lastGL.shift();
                                return original.apply(this, args);
                            };
                        }
                    }
                    setInterval(
                        () =>
                            console.debug(
                                'SPARK_DIAGNOSTIC ' +
                                    JSON.stringify({
                                        at: performance.now(),
                                        app: !!window.__airApp,
                                        benchReady: !!window.__benchReady,
                                        benchError: !!window.__benchError,
                                        spark: !!window.__sparkExample,
                                        trial: window.__trialProbe || null,
                                        status: document.querySelector('#status')?.textContent,
                                        calls,
                                        lastGL,
                                    }),
                            ),
                        1000,
                    );
                });
                for (const name of ['goto', 'waitForFunction', 'evaluate']) wrap(page, name);
            });
        });
    });
}
if (process.env.AIR_SPARK_AB_DIAGNOSTIC === '1') {
    const originalLoad = Module._load;
    Module._load = function (request) {
        const result = originalLoad.apply(this, arguments);
        if (request === 'playwright' || request === 'playwright-core') instrumentLauncher(result.chromium);
        return result;
    };
}
module.exports = { instrumentLauncher };
