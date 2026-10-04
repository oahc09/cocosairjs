import type { AirApp, AirAppOptions } from './app';
import { admitAirOptions, normalizeAirOptions } from './app-config';
export type { AirApp, AirAppOptions } from './app';

/** Validate and bind the canvas before dynamically importing the same runtime. */
export function createAirApp (options: AirAppOptions): Promise<AirApp> {
    try {
        const normalized = normalizeAirOptions(options), state = admitAirOptions(normalized);
        if (state.initPromise) return state.initPromise;
        if (state.loadPromise) return state.loadPromise;
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
