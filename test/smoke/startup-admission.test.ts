import {
    airBootstrapRegistry,
    requestAirApp,
    registerAirInitializer,
    prepareAirContainer,
} from '../../src/air/app-config';
import type { AirApp } from '../../src/air/app';

describe('startup admission shared by eager and deferred entries', () => {
    beforeEach(() => {
        delete (globalThis as any)[Symbol.for('cocosair.bootstrap.v1')];
        delete (globalThis as any).__CC_CANVAS__;
        delete (globalThis as any).__CCDPR_CAP__;
        document.body.innerHTML = '<canvas id="custom"></canvas>';
    });
    test('one exact promise across loaders, admission before canvas and cap mutation', async () => {
        const app = {} as AirApp;
        const initialize = jest.fn(async () => app);
        registerAirInitializer(initialize);
        const first = requestAirApp({ canvas: '#custom', pixelRatioCap: 3 }, async () => initialize);
        const otherLoader = jest.fn(async () => initialize);
        const second = requestAirApp({ canvas: '#custom', pixelRatioCap: 3 }, otherLoader);
        expect(second).toBe(first);
        await expect(requestAirApp({ canvas: '#custom', pixelRatioCap: 2 }, otherLoader)).rejects.toMatchObject({
            code: 'AIR_E_APP_CONFLICT',
        });
        expect(await first).toBe(app);
        expect(initialize).toHaveBeenCalledTimes(1);
        expect(otherLoader).not.toHaveBeenCalled();
        expect((globalThis as any).__CC_CANVAS__).toBe(document.querySelector('canvas'));
        expect((globalThis as any).__CCDPR_CAP__).toBe(3);
        expect(requestAirApp({ canvas: '#custom', pixelRatioCap: 3 }, otherLoader)).toBe(first);
    });
    test('invalid options reject before loader or registry ownership mutation', async () => {
        const load = jest.fn();
        for (const options of [{ canvas: '#missing' }, { canvas: '[' }, { canvas: '#custom', pixelRatioCap: NaN }]) {
            await expect(requestAirApp(options, load)).rejects.toBeInstanceOf(Error);
        }
        expect(load).not.toHaveBeenCalled();
        expect(airBootstrapRegistry().status).toBe('idle');
        expect((globalThis as any).__CC_CANVAS__).toBeUndefined();
    });
    test('preselected conflicting canvas is not overwritten', async () => {
        const previous = document.createElement('canvas');
        (globalThis as any).__CC_CANVAS__ = previous;
        await expect(requestAirApp({ canvas: '#custom' }, jest.fn())).rejects.toMatchObject({
            code: 'AIR_E_CANVAS_CONFLICT',
        });
        expect((globalThis as any).__CC_CANVAS__).toBe(previous);
        expect(airBootstrapRegistry().status).toBe('idle');
    });
    test('load or initialization failure is terminal and preserves the original error', async () => {
        const failure = Object.assign(new Error('WebGL failure'), { code: 'WEBGL2_REQUIRED' });
        const first = requestAirApp({ canvas: '#custom' }, async () => async () => {
            throw failure;
        });
        await expect(first).rejects.toBe(failure);
        await expect(requestAirApp({ canvas: '#custom' }, jest.fn())).rejects.toMatchObject({
            code: 'AIR_E_APP_RELOAD_REQUIRED',
        });
        expect(airBootstrapRegistry().failure).toBe(failure);
    });
    test('closed is terminal even when an old init promise exists', async () => {
        await requestAirApp({ canvas: '#custom' }, async () => async () => ({}) as AirApp);
        airBootstrapRegistry().status = 'closed';
        await expect(requestAirApp({ canvas: '#custom' }, jest.fn())).rejects.toMatchObject({
            code: 'AIR_E_APP_CLOSED',
        });
    });
    test.each(['none', 'frame', 'inner'])(
        'inferred host stays stable before and after %s wrapper preparation',
        async (wrapper) => {
            document.body.innerHTML = `<div id="host">${wrapper === 'frame' ? '<div id="GameDiv">' : wrapper === 'inner' ? '<div id="Cocos3dGameContainer">' : ''}<canvas id="custom"></canvas>${wrapper === 'none' ? '' : '</div>'}</div>`;
            const width = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
            const height = jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
            try {
                const options = { canvas: '#custom', screenMode: 'container' as const };
                let release!: () => void;
                let prepared!: () => void;
                const preparedPromise = new Promise<void>((resolve) => {
                    prepared = resolve;
                });
                const gate = new Promise<void>((resolve) => {
                    release = resolve;
                });
                const initialize = jest.fn(async (normalized) => {
                    prepareAirContainer(normalized);
                    prepared();
                    await gate;
                    return {} as AirApp;
                });
                const first = requestAirApp(options, () => initialize);
                const other = jest.fn(() => initialize);
                expect(requestAirApp(options, other)).toBe(first);
                await preparedPromise;
                expect(airBootstrapRegistry().status).toBe('initializing');
                expect(requestAirApp(options, other)).toBe(first);
                release();
                await first;
                expect(airBootstrapRegistry().status).toBe('ready');
                expect(requestAirApp(options, other)).toBe(first);
                expect(initialize).toHaveBeenCalledTimes(1);
                expect(other).not.toHaveBeenCalled();
            } finally {
                width.mockRestore();
                height.mockRestore();
            }
        },
    );
    test('an inner wrapper cannot be selected as the host and rejects before mutation', async () => {
        document.body.innerHTML =
            '<div id="host"><div id="Cocos3dGameContainer"><canvas id="custom"></canvas></div></div>';
        const before = document.body.innerHTML;
        const load = jest.fn();
        await expect(
            requestAirApp({ canvas: '#custom', screenMode: 'container', container: '#Cocos3dGameContainer' }, load),
        ).rejects.toMatchObject({ code: 'AIR_E_CONTAINER' });
        expect(document.body.innerHTML).toBe(before);
        expect(airBootstrapRegistry().status).toBe('idle');
        expect(load).not.toHaveBeenCalled();
        expect((globalThis as any).__CC_CANVAS__).toBeUndefined();
    });
});

// Positive/negative controls for the formerly over-broad DevTools package gate.
test('runtime session errors stay allowed while actual DevTools signatures are rejected', () => {
    const { developmentRuntimeMarkers } = require('../../tools/verify/devtools-runtime-boundary.cjs');
    expect(developmentRuntimeMarkers("throw Error('AIR_E_SESSION_CLOSED')")).toEqual([]);
    expect(developmentRuntimeMarkers('export function createAgentSession() {}')).toEqual(['createAgentSession']);
    expect(developmentRuntimeMarkers("const version = 'v051-agent-contract'")).toEqual(['v051-agent-contract']);
    const fs = require('node:fs');
    expect(developmentRuntimeMarkers(fs.readFileSync('build/cocosair.module.js', 'utf8'))).toEqual([]);
    expect(
        developmentRuntimeMarkers(fs.readFileSync('build/devtools/agent-session.js', 'utf8')).length,
    ).toBeGreaterThan(0);
});

test('an existing inner wrapper stays inside the newly prepared frame', () => {
    const { normalizeAirOptions, prepareAirContainer } = require('../../src/air/app-config');
    document.body.innerHTML = '<div id="host"><div id="Cocos3dGameContainer"><canvas id="custom"></canvas></div></div>';
    const options = normalizeAirOptions({ canvas: '#custom', screenMode: 'container', container: '#host' });
    // jsdom has zero layout size, but preparation must never invert the native wrapper tree.
    expect(() => prepareAirContainer(options)).toThrow('AIR_E_CONTAINER_SIZE');
    const frame = document.getElementById('GameDiv')!;
    const inner = document.getElementById('Cocos3dGameContainer')!;
    expect(frame.contains(inner)).toBe(true);
    expect(inner.contains(options.canvas)).toBe(true);
    expect(document.getElementById('host')!.contains(frame)).toBe(true);
});
