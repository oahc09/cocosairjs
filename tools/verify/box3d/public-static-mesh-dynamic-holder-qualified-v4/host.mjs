/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Host-only adaptation copied from the existing production-ESM consumer. No injected engine/native API.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire, registerHooks } from 'node:module';
import { root, sha } from './inputs.mjs';
export const BASE = 'https://box3d-production-esm.invalid/physics/box3d/st/';
export function installHost(artifacts, lock, report, flush) {
    const require = createRequire(join(root, 'package.json'));
    const { JSDOM, VirtualConsole } = require('jsdom');
    const bundle = pathToFileURL(join(artifacts, 'cocosair.module.js')).href;
    const nativeModule = pathToFileURL(join(artifacts, 'physics/box3d/st/box3d-st.mjs')).href;
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (error) => report.hostErrors.push(String(error.stack ?? error)));
    const dom = new JSDOM(
        '<!doctype html><html><body><div id="GameDiv"><div id="Cocos3dGameContainer"><canvas id="GameCanvas"></canvas></div></div></body></html>',
        {
            url: 'https://box3d-production-esm.invalid/',
            pretendToBeVisual: true,
            virtualConsole,
        },
    );
    for (const key of [
        'window',
        'document',
        'navigator',
        'location',
        'screen',
        'HTMLElement',
        'HTMLCanvasElement',
        'HTMLImageElement',
        'HTMLVideoElement',
        'HTMLAudioElement',
        'Element',
        'Event',
        'Image',
        'XMLHttpRequest',
        'DOMParser',
        'MutationObserver',
        'DeviceMotionEvent',
        'DeviceOrientationEvent',
    ]) {
        if (dom.window[key] !== undefined)
            Object.defineProperty(globalThis, key, {
                value: dom.window[key],
                configurable: true,
            });
    }
    for (const key of ['requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle'])
        globalThis[key] = dom.window[key].bind(dom.window);
    dom.window.HTMLCanvasElement.prototype.getContext = function () {
        return null;
    };
    dom.window.HTMLCanvasElement.prototype.toDataURL = function () {
        return '';
    };
    globalThis.fetch = async (input, init) => {
        const url = String(input);
        const name = url.startsWith(BASE) ? url.slice(BASE.length) : null;
        assert(['manifest.json', 'box3d-st.wasm', 'box3d-st.mjs'].includes(name), 'Unexpected fetch: ' + url);
        assert.equal(init?.signal?.aborted, false);
        const relative = 'physics/box3d/st/' + name;
        const bytes = readFileSync(join(artifacts, relative));
        const expected = lock.runtime.find((item) => item.path === relative);
        assert.equal(sha(bytes), expected.sha256);
        assert.equal(bytes.length, expected.bytes);
        report.transport.push({ url, path: relative, sha256: sha(bytes), bytes: bytes.length });
        flush();
        return new Response(bytes, {
            headers: {
                'content-type': name.endsWith('.wasm')
                    ? 'application/wasm'
                    : name.endsWith('.json')
                      ? 'application/json'
                      : 'text/javascript',
            },
        });
    };
    const hooks = registerHooks({
        resolve(specifier, context, nextResolve) {
            if (specifier === BASE + 'box3d-st.mjs') {
                assert.equal(context.parentURL, bundle, 'Only the real production loader may request this asset');
                const expected = lock.runtime.find((item) => item.path === 'physics/box3d/st/box3d-st.mjs');
                assert.equal(sha(readFileSync(new URL(nativeModule))), expected.sha256);
                report.moduleResolution.push({
                    requested: specifier,
                    parent: context.parentURL,
                    resolved: nativeModule,
                    sha256: expected.sha256,
                });
                flush();
                return { url: nativeModule, shortCircuit: true };
            }
            assert(!/^https?:/.test(specifier), 'Unexpected network module import: ' + specifier);
            return nextResolve(specifier, context);
        },
    });
    return {
        bundle,
        close() {
            hooks.deregister();
            dom.window.close();
        },
    };
}
