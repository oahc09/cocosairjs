'use strict';
const test = require('node:test'),
    assert = require('node:assert/strict'),
    fs = require('node:fs'),
    path = require('node:path'),
    vm = require('node:vm'),
    ts = require('typescript');
const ROOT = path.resolve(__dirname, '../..'),
    FILE = 'src/pal/input/web/touch-input.js';
const source = () => fs.readFileSync(path.join(ROOT, FILE), 'utf8');
const types = {
    TOUCH_START: 'touchstart',
    TOUCH_MOVE: 'touchmove',
    TOUCH_END: 'touchend',
    TOUCH_CANCEL: 'touchcancel',
};
function fixture(code = source()) {
    const listeners = new Map(),
        touches = new Map(),
        emitted = [],
        released = [];
    let focused = 0;
    const canvas = {
        addEventListener: (type, f) => listeners.set(type, f),
        getBoundingClientRect: () => ({ x: 5, y: 10, width: 100, height: 50 }),
        focus: () => focused++,
    };
    const modules = {
        'internal:constants': { EDITOR: false, TEST: true, USE_XR: false },
        'pal/system-info': { systemInfo: { hasFeature: () => true } },
        'pal/screen-adapter': {
            screenAdapter: { onCanvasBound: (f) => f(), devicePixelRatio: 2, isFrameRotated: false },
        },
        '../../../cocos/core/math': {
            Rect: class {
                constructor(x, y, width, height) {
                    Object.assign(this, { x, y, width, height });
                }
            },
            Vec2: class {
                constructor(x, y) {
                    Object.assign(this, { x, y });
                }
            },
        },
        '../../../cocos/core/event': {
            EventTarget: class {
                emit(type, event) {
                    emitted.push({ type, event });
                }
            },
        },
        '../../../cocos/input/types': {
            EventTouch: class {
                constructor(changed, bubbles, type, active) {
                    Object.assign(this, { changed, bubbles, type, active });
                }
            },
        },
        '../touch-manager': {
            touchManager: {
                getOrCreateTouch(id, x, y) {
                    const t = { id, x, y };
                    touches.set(id, t);
                    return t;
                },
                releaseTouch(id) {
                    released.push(id);
                    touches.delete(id);
                },
                getAllTouches: () => Array.from(touches.values()),
            },
        },
        '../../../cocos/input/types/event-enum': { InputEventType: types },
        '../../system-info/enum-type': { Feature: { INPUT_TOUCH: 1 } },
        '../../../cocos/core/platform/debug': {
            warn: (s) => {
                throw Error(s);
            },
        },
    };
    const module = { exports: {} };
    vm.runInNewContext(
        ts.transpileModule(code, {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
        }).outputText,
        {
            module,
            exports: module.exports,
            require: (name) => {
                assert(name in modules, 'unexpected import ' + name);
                return modules[name];
            },
            document: { getElementById: () => canvas },
        },
        { filename: FILE },
    );
    new module.exports.TouchInputSource();
    function dispatch(type, cancelable, { target = canvas, ids = [7] } = {}) {
        const event = new Event(type, { cancelable, bubbles: true });
        Object.defineProperty(event, 'target', { value: target });
        Object.defineProperty(event, 'changedTouches', {
            value: ids.map((identifier) => ({ identifier, clientX: 15, clientY: 25 })),
        });
        let cancellations = 0,
            stops = 0;
        const prevent = event.preventDefault.bind(event),
            stop = event.stopPropagation.bind(event);
        event.preventDefault = () => {
            cancellations++;
            prevent();
        };
        event.stopPropagation = () => {
            stops++;
            stop();
        };
        listeners.get(type)(event);
        return { event, cancellations, stops };
    }
    return { dispatch, touches, emitted, released, focused: () => focused };
}
test('frozen public inputs reproduce every committed PAL byte including the touch guard', () => {
    const { outputs } = require('../build/pal-source.cjs').generate();
    for (const [file, bytes] of outputs)
        assert.deepEqual(fs.readFileSync(path.join(ROOT, file)), Buffer.from(bytes), file);
    const vendor = fs.readFileSync(path.join(ROOT, 'vendor/pal-source/pal/input/web/touch-input.ts'), 'utf8');
    assert(vendor.includes('if (event.target === this._canvas) {'));
    assert(!vendor.includes('event.target === this._canvas && event.cancelable'));
});
for (const type of Object.values(types))
    for (const cancelable of [false, true])
        test(`${type}: native cancelable=${cancelable} preserves dispatch, coordinates and retirement`, () => {
            const f = fixture(),
                r = f.dispatch(type, cancelable);
            assert.equal(r.cancellations, Number(cancelable));
            assert.equal(r.event.defaultPrevented, cancelable);
            assert.equal(r.stops, 1);
            assert.equal(f.emitted.length, 1);
            assert.equal(f.emitted[0].type, type);
            assert.equal(f.emitted[0].event.changed[0].x, 20);
            assert.equal(f.emitted[0].event.changed[0].y, 70);
            const retired = type === types.TOUCH_END || type === types.TOUCH_CANCEL;
            assert.equal(f.touches.size, retired ? 0 : 1);
            assert.equal(f.emitted[0].event.active.length, retired ? 0 : 1);
            assert.deepEqual(f.released, retired ? [7] : []);
            assert.equal(f.focused(), Number(type === types.TOUCH_START));
        });
test('a different target is not canceled even when cancelable', () => {
    const f = fixture(),
        r = f.dispatch(types.TOUCH_CANCEL, true, { target: {} });
    assert.equal(r.cancellations, 0);
    assert.equal(r.event.defaultPrevented, false);
    assert.equal(f.touches.size, 0);
    assert.equal(f.emitted.length, 1);
});
test('non-cancelable cancellation retires all contacts and permits a fresh gesture', () => {
    const f = fixture();
    f.dispatch(types.TOUCH_START, true, { ids: [1, 2] });
    const r = f.dispatch(types.TOUCH_CANCEL, false, { ids: [1, 2] });
    assert.equal(r.cancellations, 0);
    assert.equal(f.touches.size, 0);
    assert.deepEqual(f.released, [1, 2]);
    assert.equal(f.emitted.at(-1).event.changed.length, 2);
    f.dispatch(types.TOUCH_START, true, { ids: [3] });
    f.dispatch(types.TOUCH_END, true, { ids: [3] });
    assert.equal(f.touches.size, 0);
    assert.equal(f.emitted.length, 4);
});
test('empty or invalid contacts retain the existing no-dispatch behavior', () => {
    for (const ids of [[], [null]]) {
        const f = fixture(),
            r = f.dispatch(types.TOUCH_CANCEL, false, { ids });
        assert.equal(r.cancellations, 0);
        assert.equal(r.stops, 1);
        assert.equal(f.emitted.length, 0);
    }
});
test('original unguarded callback attempts to cancel a native non-cancelable event', () => {
    const guard = 'event.target === this._canvas && event.cancelable';
    assert.equal(source().split(guard).length - 1, 1);
    const f = fixture(source().replace(guard, 'event.target === this._canvas')),
        r = f.dispatch(types.TOUCH_CANCEL, false);
    assert.equal(r.cancellations, 1);
    assert.equal(r.event.defaultPrevented, false);
    assert.equal(f.emitted.length, 1);
    assert.equal(f.touches.size, 0);
});
