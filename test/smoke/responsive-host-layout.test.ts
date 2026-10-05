import { readFileSync } from 'fs';
import { runInNewContext } from 'vm';
import { resolve } from 'path';
import { normalizeAirOptions, prepareAirContainer, equalAirOptions, validateAirScreenMode } from '../../src/air/app-config';

function adapter (legacy = false) {
    const ts = require('typescript');
    let source = legacy
        ? ts.transpileModule(readFileSync(resolve('vendor/pal-source/pal/screen-adapter/web/screen-adapter.ts'), 'utf8'),
            { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } }).outputText
        : readFileSync(resolve('src/pal/screen-adapter/web/screen-adapter.js'), 'utf8');
    source = source.replace(/^import .*;\r?\n/gm, '');
    source = source.slice(0, source.indexOf('export const screenAdapter')) + '\nglobalThis.Adapter=ScreenAdapter;';
    let observe: (() => void) | undefined;
    const disconnect = jest.fn(); const tasks = new Map<number, () => void>(); let serial = 0;
    const context: any = { EDITOR: false, TEST: false, Orientation: { AUTO: 0, LANDSCAPE: 1, PORTRAIT: 2 },
        EventTarget: class {}, Size: class { constructor (public width: number, public height: number) {} clone () { return new (this.constructor as any)(this.width, this.height); } },
        window: { devicePixelRatio: 2, __CCDPR_CAP__: 1.5,
            requestAnimationFrame: (fn: () => void) => { tasks.set(++serial, fn); return serial; },
            cancelAnimationFrame: (id: number) => tasks.delete(id) },
        ResizeObserver: class { constructor (fn: () => void) { observe = fn; } observe () {} disconnect = disconnect; },
        warnID () {}, legacyCC: { view: { getDesignResolutionSize: () => ({ width: 720, height: 720 }) } } };
    runInNewContext(source, context);
    const a = Object.create(context.Adapter.prototype);
    Object.assign(a, { _gameFrame: { clientWidth: 900, clientHeight: 900, style: { width: '', height: '' } },
        _gameContainer: { clientWidth: 900, clientHeight: 900, style: { width: '100%', height: '100%' } },
        _cachedFrameStyle: { width: '0px', height: '0px' }, _cachedContainerStyle: { width: '0px', height: '0px' },
        _measuredLayout: '', _layoutFrame: 0, _isProportionalToFrame: false, _exactFitScreen: false,
        _supportFullScreen: false, _isHeadlessMode: false, handleResizeEvent: true, emit: jest.fn() });
    return { a, context, tasks, disconnect, notify: () => observe?.() };
}

describe('responsive host native size transaction', () => {
    test('frozen original fails CSS-only resize; candidate notifies once with effective DPR', () => {
        for (const legacy of [true, false]) {
            const { a } = adapter(legacy); a._updateContainer(); a.emit.mockClear();
            a._gameFrame.clientWidth = a._gameFrame.clientHeight = 390;
            a._updateContainer(); a._updateContainer();
            expect(a.emit.mock.calls.length).toBe(legacy ? 0 : 1);
            if (!legacy) expect(a.emit).toHaveBeenCalledWith('window-resize', 585, 585);
        }
    });
    test('hidden retains buffer; reveal same size notifies, re-entry and repeated sizes deduplicate', () => {
        const { a } = adapter(); a._updateContainer(); a.emit.mockClear();
        a._gameFrame.clientWidth = 0; a._updateContainer(); expect(a.emit).not.toHaveBeenCalled();
        a._gameFrame.clientWidth = 900;
        a.emit.mockImplementation(() => a._updateContainer()); a._updateContainer();
        expect(a.emit).toHaveBeenCalledTimes(1);
    });
    test('parent observation coalesces, respects auto-resize switch and cancels on disposal', () => {
        const { a, tasks, notify, disconnect } = adapter(); a._observeLayout();
        a._updateFrame = jest.fn(); notify(); notify(); expect(tasks.size).toBe(1);
        const run = [...tasks.values()][0]; tasks.clear(); run(); expect(a._updateFrame).toHaveBeenCalledTimes(1);
        a.handleResizeEvent = false; notify(); expect(tasks.size).toBe(0);
        a.handleResizeEvent = true; notify(); a.destroyLayoutObserver(); expect(tasks.size).toBe(0);
        expect(disconnect).toHaveBeenCalled(); notify(); expect(tasks.size).toBe(0);
    });
    test('window fill, proportional frame and public backing-pixel setter preserve semantics', () => {
        const { a, context } = adapter(); context.window.innerWidth = 1100; context.window.innerHeight = 900;
        a._exactFitScreen = true; a._updateContainer(); expect(a.emit).toHaveBeenLastCalledWith('window-resize', 1650, 1350);
        a._exactFitScreen = false; a._isProportionalToFrame = true;
        a._gameFrame.clientWidth = 390; a._gameFrame.clientHeight = 844;
        a._gameContainer.clientWidth = a._gameContainer.clientHeight = 390; a._updateContainer();
        expect(a._gameContainer.style.width).toBe('390px'); expect(a._gameContainer.style.height).toBe('390px');
        a._resizeFrame = jest.fn(); a.windowSize = new context.Size(600, 300);
        expect(a._resizeFrame.mock.calls[0][0]).toEqual({ width: 400, height: 200 });
    });
    test('DPR watcher follows raw density but deduplicates capped sizes and cleans up', () => {
        const { a, context } = adapter(); const media: any[] = [];
        context.window.addEventListener = () => {};
        context.document = { addEventListener () {} }; context.screen = {};
        context.systemInfo = { isMobile: false }; a._fn = {};
        context.window.matchMedia = (query: string) => {
            const row: any = { query, matches: false, addEventListener (_: string, fn: () => void) { this.fn = fn; }, removeEventListener: jest.fn() };
            media.push(row); return row;
        };
        a._registerEvent(); expect(media[0].query).toBe('(resolution: 2dppx)'); a._updateContainer(); a.emit.mockClear();
        context.window.devicePixelRatio = 3; media[0].fn(); expect(a.emit).not.toHaveBeenCalled();
        const next = media.find(row => row.query === '(resolution: 3dppx)');
        context.window.devicePixelRatio = 1; next.fn(); expect(a.emit).toHaveBeenCalledWith('window-resize', 900, 900);
        const final = media.find(row => row.query === '(resolution: 1dppx)'); a.destroyLayoutObserver();
        expect(final.removeEventListener).toHaveBeenCalled(); final.fn(); expect(a.emit).toHaveBeenCalledTimes(1);
    });
});

describe('container startup admission', () => {
    test('native null/undefined are absent settings, matching explicit modes pass and real conflicts reject', () => {
        expect(() => validateAirScreenMode('container', null)).not.toThrow();
        expect(() => validateAirScreenMode('window', undefined)).not.toThrow();
        expect(() => validateAirScreenMode('container', false)).not.toThrow();
        expect(() => validateAirScreenMode('window', true)).not.toThrow();
        expect(() => validateAirScreenMode(undefined, false)).not.toThrow();
        expect(() => validateAirScreenMode('container', true)).toThrow('AIR_E_SCREEN_CONFIG_CONFLICT');
        expect(() => validateAirScreenMode('window', false)).toThrow('AIR_E_SCREEN_CONFIG_CONFLICT');
    });
    beforeEach(() => { document.body.innerHTML = '<div id="host"><canvas id="GameCanvas"></canvas></div>'; });
    test('explicit mode is part of singleton identity; conflicting or invalid containers reject', () => {
        const options = normalizeAirOptions({ canvas: '#GameCanvas', screenMode: 'container', container: '#host' });
        expect(equalAirOptions(options, normalizeAirOptions({ canvas: '#GameCanvas' }))).toBe(false);
        expect(() => normalizeAirOptions({ canvas: '#GameCanvas', container: '#host' })).toThrow('AIR_E_CONTAINER');
        expect(() => normalizeAirOptions({ canvas: '#GameCanvas', screenMode: 'container', container: 'body' })).toThrow('AIR_E_CONTAINER');
        expect(() => normalizeAirOptions({ canvas: '#GameCanvas', screenMode: 'container', container: '#missing' })).toThrow('AIR_E_CONTAINER');
    });
    test('wrappers stay inside host, body dimensions unchanged, zero startup reports a diagnostic', () => {
        const options = normalizeAirOptions({ canvas: '#GameCanvas', screenMode: 'container', container: '#host' });
        expect(() => prepareAirContainer(options)).toThrow('AIR_E_CONTAINER_SIZE');
        const frame = document.getElementById('GameDiv')!;
        Object.defineProperty(frame, 'clientWidth', { value: 390 }); Object.defineProperty(frame, 'clientHeight', { value: 390 });
        expect(prepareAirContainer(options)).toBe(frame); expect(document.body.style.cssText).toBe('');
        expect(document.getElementById('host')!.contains(frame)).toBe(true);
        expect(frame.contains(options.canvas)).toBe(true);
    });
});
