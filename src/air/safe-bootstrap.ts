/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/
import type { AirApp, AirAppOptions } from './app';
import { admitAirOptions, normalizeAirOptions, prepareAirContainer } from './app-config';
export type { AirApp, AirAppOptions } from './app';

/** Validate and bind the canvas before dynamically importing the same runtime. */
export function createAirApp (options: AirAppOptions): Promise<AirApp> {
    try {
        const normalized = normalizeAirOptions(options), state = admitAirOptions(normalized);
        if (state.initPromise) return state.initPromise;
        if (state.loadPromise) return state.loadPromise;
        prepareAirContainer(normalized);
        state.options = normalized; state.status = 'initializing';
        const globals = globalThis as { __CC_CANVAS__?: HTMLCanvasElement; __CCDPR_CAP__?: number };
        globals.__CC_CANVAS__ = normalized.canvas;
        globals.__CCDPR_CAP__ = normalized.pixelRatioCap;
        // The safe-entry builder rewrites this literal to ./cocosair.module.js
        // without bundling it. Consumer bundlers can then emit a deferred chunk.
        state.loadPromise = import('../index')
            .then((runtime) => runtime.createAirApp(normalized))
            .catch((error) => { state.status = 'failed'; state.failure = error; throw error; });
        return state.loadPromise;
    } catch (error) { return Promise.reject(error); }
}
