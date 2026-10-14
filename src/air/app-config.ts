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

/** Engine-free normalization shared by the full and deferred entries. */
export interface AirNormalizedOptions {
    readonly canvas: HTMLCanvasElement;
    readonly renderMode: number;
    readonly physics: 'builtin' | 'cannon';
    readonly diagnostics: 'errors' | 'warnings';
    readonly pixelRatioCap: number;
    readonly screenMode: 'window' | 'container' | undefined;
    readonly container: HTMLElement | undefined;
    readonly designResolution: Readonly<{ width: number; height: number; policy: number }> | undefined;
    readonly contextLoss: Readonly<{
        autoPause: boolean;
        reload?: () => void;
        onEvent?: NonNullable<AirAppOptions['contextLoss']>['onEvent'];
    }>;
}

export type AirBootstrapStatus = 'idle' | 'initializing' | 'ready' | 'failed' | 'closed';
interface BootstrapRegistry {
    status: AirBootstrapStatus;
    options?: AirNormalizedOptions;
    initialize?: AirInitializer;
    initPromise?: Promise<AirApp>;
    app?: AirApp;
    failure?: unknown;
}
const registryKey = Symbol.for('cocosair.bootstrap.v1');

export function airBootstrapRegistry(): BootstrapRegistry {
    const globals = globalThis as typeof globalThis & { [registryKey]?: BootstrapRegistry };
    return globals[registryKey] ?? (globals[registryKey] = { status: 'idle' });
}

export function airError(code: string, message: string): Error & { code: string } {
    return Object.assign(new Error(`[${code}] ${message}`), { code });
}

/** Native settings uses null for missing values; omitted AIR mode preserves it. */
export function validateAirScreenMode(mode: AirAppOptions['screenMode'], exactFit: unknown): void {
    if (mode !== undefined && exactFit != null && exactFit !== (mode === 'window')) {
        throw airError(
            'AIR_E_SCREEN_CONFIG_CONFLICT',
            'screenMode conflicts with native screen.exactFitScreen; use one matching configuration.',
        );
    }
}

export function normalizeAirOptions(options: AirAppOptions): AirNormalizedOptions {
    if (!options || typeof options !== 'object')
        throw airError('AIR_E_APP_OPTIONS', 'createAirApp requires an options object.');
    const physics = options.physics ?? 'builtin',
        diagnostics = options.diagnostics ?? 'errors';
    if (physics !== 'builtin' && physics !== 'cannon')
        throw airError('AIR_E_PHYSICS_BACKEND', 'physics must be builtin or cannon.');
    if (diagnostics !== 'errors' && diagnostics !== 'warnings')
        throw airError('AIR_E_DIAGNOSTIC_MODE', 'diagnostics must be errors or warnings.');
    if (typeof document === 'undefined' || typeof HTMLCanvasElement === 'undefined') {
        throw airError('AIR_E_CANVAS', 'createAirApp requires a browser document and canvas.');
    }
    let canvas: unknown = options.canvas;
    if (typeof canvas === 'string') {
        try {
            canvas = document.querySelector(canvas);
        } catch {
            throw airError('AIR_E_CANVAS', `Invalid canvas selector '${options.canvas}'.`);
        }
    }
    if (!(canvas instanceof HTMLCanvasElement)) {
        throw airError('AIR_E_CANVAS', `Canvas '${options.canvas}' did not match a <canvas> element.`);
    }
    const decoy = document.getElementById('GameCanvas');
    if (decoy && decoy !== canvas) {
        throw airError(
            'AIR_E_CANVAS_CONFLICT',
            'Page already contains another element with id "GameCanvas"; select that canvas or remove the conflicting id.',
        );
    }
    const existingFrame = document.getElementById('GameDiv');
    const existingContainer = document.getElementById('Cocos3dGameContainer');
    if (
        (existingFrame && !existingFrame.contains(canvas)) ||
        (existingContainer &&
            (!existingContainer.contains(canvas) || (existingFrame && !existingFrame.contains(existingContainer))))
    ) {
        throw airError(
            'AIR_E_CONTAINER_CONFLICT',
            'Existing GameDiv/Cocos3dGameContainer must belong to the selected canvas.',
        );
    }
    if (options.renderMode !== undefined && ![0, 1, 2, 3].includes(options.renderMode)) {
        throw airError(
            'AIR_E_RENDER_MODE',
            'renderMode must be an engine render mode integer (0..3); browser startup requires WebGL 2.',
        );
    }
    const legacyCap = Number((globalThis as { __CCDPR_CAP__?: unknown }).__CCDPR_CAP__);
    const pixelRatioCap = options.pixelRatioCap ?? (Number.isFinite(legacyCap) && legacyCap > 0 ? legacyCap : 2);
    if (typeof pixelRatioCap !== 'number' || !Number.isFinite(pixelRatioCap) || pixelRatioCap <= 0) {
        throw airError('AIR_E_PIXEL_RATIO_CAP', 'pixelRatioCap must be a finite positive number.');
    }
    const resolution = options.designResolution;
    if (
        resolution !== undefined &&
        (!resolution ||
            !Number.isFinite(resolution.width) ||
            resolution.width <= 0 ||
            !Number.isFinite(resolution.height) ||
            resolution.height <= 0 ||
            ![0, 1, 2, 3, 4].includes(resolution.policy))
    ) {
        throw airError(
            'AIR_E_DESIGN_RESOLUTION',
            'designResolution requires finite positive width/height and a native policy integer (0..4).',
        );
    }
    const context = options.contextLoss ?? {};
    if (options.screenMode !== undefined && !['window', 'container'].includes(options.screenMode)) {
        throw airError('AIR_E_SCREEN_MODE', 'screenMode must be window or container.');
    }
    if (options.container !== undefined && options.screenMode !== 'container') {
        throw airError('AIR_E_CONTAINER', 'container requires screenMode: container.');
    }
    let container: unknown = options.container;
    if (typeof container === 'string') {
        try {
            container = document.querySelector(container);
        } catch {
            throw airError('AIR_E_CONTAINER', 'Invalid container selector.');
        }
    }
    if (options.screenMode === 'container') {
        if (options.container === undefined) {
            // Preparation inserts native wrappers. Reuse the admitted host instead of
            // letting those runtime-owned DOM changes alter an identical request.
            const admitted = airBootstrapRegistry().options;
            container =
                admitted?.canvas === canvas && admitted.screenMode === 'container'
                    ? admitted.container
                    : (existingFrame ?? existingContainer?.parentElement ?? canvas.parentElement);
        }
        if (
            !(container instanceof HTMLElement) ||
            container === document.body ||
            container === document.documentElement ||
            !container.contains(canvas) ||
            container === canvas ||
            container === existingContainer
        ) {
            throw airError('AIR_E_CONTAINER', 'Container must be an existing non-body ancestor of the canvas.');
        }
        const frame = document.getElementById('GameDiv');
        if (frame && (!frame.contains(canvas) || !(container as HTMLElement).contains(frame))) {
            throw airError(
                'AIR_E_CONTAINER_CONFLICT',
                'GameDiv must contain the canvas inside the selected container.',
            );
        }
        const inner = document.getElementById('Cocos3dGameContainer');
        if (
            inner &&
            (!inner.contains(canvas) ||
                !(container as HTMLElement).contains(inner) ||
                (frame && !frame.contains(inner)))
        ) {
            throw airError('AIR_E_CONTAINER_CONFLICT', 'Cocos3dGameContainer belongs to a different canvas or frame.');
        }
    }
    if (
        !context ||
        typeof context !== 'object' ||
        (context.autoPause !== undefined && typeof context.autoPause !== 'boolean') ||
        (context.reload !== undefined && typeof context.reload !== 'function') ||
        (context.onEvent !== undefined && typeof context.onEvent !== 'function')
    ) {
        throw airError(
            'AIR_E_CONTEXT_OPTIONS',
            'contextLoss requires optional boolean autoPause and function reload/onEvent.',
        );
    }
    return Object.freeze({
        canvas,
        renderMode: options.renderMode ?? 0,
        physics,
        diagnostics,
        pixelRatioCap,
        screenMode: options.screenMode,
        container: container as HTMLElement | undefined,
        designResolution:
            resolution &&
            Object.freeze({ width: resolution.width, height: resolution.height, policy: resolution.policy }),
        contextLoss: Object.freeze({
            autoPause: context.autoPause ?? true,
            reload: context.reload,
            onEvent: context.onEvent,
        }),
    });
}

export function equalAirOptions(a: AirNormalizedOptions, b: AirNormalizedOptions): boolean {
    return (
        a.canvas === b.canvas &&
        a.renderMode === b.renderMode &&
        a.physics === b.physics &&
        a.diagnostics === b.diagnostics &&
        a.pixelRatioCap === b.pixelRatioCap &&
        a.screenMode === b.screenMode &&
        a.container === b.container &&
        a.designResolution?.width === b.designResolution?.width &&
        a.designResolution?.height === b.designResolution?.height &&
        a.designResolution?.policy === b.designResolution?.policy &&
        a.contextLoss.autoPause === b.contextLoss.autoPause &&
        a.contextLoss.reload === b.contextLoss.reload &&
        a.contextLoss.onEvent === b.contextLoss.onEvent
    );
}

/** Prepare only native wrappers inside the selected host, before PAL binding. Never size body. */
export function prepareAirContainer(options: AirNormalizedOptions): HTMLElement | undefined {
    if (options.screenMode !== 'container') return undefined;
    let frame = document.getElementById('GameDiv');
    let inner = document.getElementById('Cocos3dGameContainer');
    if (!frame) {
        frame = document.createElement('div');
        frame.id = 'GameDiv';
        frame.style.width = '100%';
        frame.style.height = '100%';
        const anchor = inner ?? options.canvas;
        anchor.parentElement!.insertBefore(frame, anchor);
        frame.appendChild(anchor);
    }
    if (inner && (!frame.contains(inner) || !inner.contains(options.canvas))) {
        throw airError('AIR_E_CONTAINER_CONFLICT', 'Cocos3dGameContainer must contain the canvas inside GameDiv.');
    }
    if (!inner) {
        inner = document.createElement('div');
        inner.id = 'Cocos3dGameContainer';
        inner.style.width = '100%';
        inner.style.height = '100%';
        options.canvas.parentElement!.insertBefore(inner, options.canvas);
        inner.appendChild(options.canvas);
    }
    options.canvas.style.width = '100%';
    options.canvas.style.height = '100%';
    options.canvas.style.display = 'block';
    if (frame.clientWidth <= 0 || frame.clientHeight <= 0) {
        throw airError(
            'AIR_E_CONTAINER_SIZE',
            'Container must have a positive layout size at startup; show it before createAirApp.',
        );
    }
    return frame;
}

export function admitAirOptions(options: AirNormalizedOptions): BootstrapRegistry {
    const state = airBootstrapRegistry();
    if (state.status === 'closed')
        throw airError('AIR_E_APP_CLOSED', 'This runtime is closed; reload the document before creating another app.');
    if (state.status === 'failed')
        throw airError(
            'AIR_E_APP_RELOAD_REQUIRED',
            'Runtime initialization failed; reload the document before retrying.',
        );
    if (state.options && !equalAirOptions(state.options, options)) {
        throw airError(
            'AIR_E_APP_CONFLICT',
            'An app already owns another canvas or configuration; reuse its options or reload the document.',
        );
    }
    return state;
}

/** The full browser entry installs its initializer without binding the DOM at import. */
export type AirInitializer = (options: AirNormalizedOptions) => Promise<AirApp>;
export function registerAirInitializer(initialize: AirInitializer): void {
    airBootstrapRegistry().initialize = initialize;
}

/** One admission and one exact promise for both eager and deferred entry calls. */
export function requestAirApp(
    options: AirAppOptions,
    load: () => AirInitializer | Promise<AirInitializer>,
): Promise<AirApp> {
    try {
        const normalized = normalizeAirOptions(options),
            state = admitAirOptions(normalized);
        if (state.initPromise) return state.initPromise;
        const globals = globalThis as { __CC_CANVAS__?: HTMLCanvasElement; __CCDPR_CAP__?: number };
        if (globals.__CC_CANVAS__ && globals.__CC_CANVAS__ !== normalized.canvas) {
            throw airError(
                'AIR_E_CANVAS_CONFLICT',
                'A different canvas was explicitly selected; reuse it or reload the document.',
            );
        }
        state.options = normalized;
        state.status = 'initializing';
        // Publish the promise before invoking either a loader or initializer. The deferred
        // entry loads an initializer, never recursively calls createAirApp on its own promise.
        state.initPromise = Promise.resolve()
            .then(load)
            .then((initialize) => {
                globals.__CC_CANVAS__ = normalized.canvas;
                globals.__CCDPR_CAP__ = normalized.pixelRatioCap;
                return initialize(normalized);
            })
            .then(
                (app) => {
                    state.app = app;
                    state.status = 'ready';
                    return app;
                },
                (error) => {
                    state.status = 'failed';
                    state.failure = error;
                    throw error;
                },
            );
        return state.initPromise;
    } catch (error) {
        return Promise.reject(error);
    }
}
