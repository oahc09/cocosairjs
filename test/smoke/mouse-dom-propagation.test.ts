import { MouseInputSource } from '../../src/pal/input/web/mouse-input';
import { InputEventType } from '../../src/cocos/input/types/event-enum';
import { Vec2 } from '../../src/cocos/core/math';

describe('host DOM mouse propagation', () => {
    test('mouseup registers once on window so canvas bubbling cannot duplicate dispatch', () => {
        const canvas = document.createElement('canvas');
        const source: any = Object.create(MouseInputSource.prototype);
        Object.assign(source, { _canvas: canvas, _registerPointerLockEvent: () => {} });
        const local = jest.spyOn(canvas, 'addEventListener').mockImplementation(() => {});
        const global = jest.spyOn(window, 'addEventListener').mockImplementation(() => {});
        try {
            source._registerEvent();
            expect(local.mock.calls.filter(([type]) => type === 'mouseup')).toHaveLength(0);
            expect(global.mock.calls.filter(([type]) => type === 'mouseup')).toHaveLength(1);
        } finally {
            local.mockRestore();
            global.mockRestore();
        }
    });
    test('canvas input bubbles, cancels defaults locally and still emits engine input', () => {
        const canvas = document.createElement('canvas');
        const outside = document.createElement('div');
        document.body.append(canvas, outside);
        const source: any = Object.create(MouseInputSource.prototype);
        const emit = jest.fn();
        Object.assign(source, {
            _canvas: canvas,
            _preMousePos: new Vec2(),
            _eventTarget: { emit },
            _getLocation: () => new Vec2(),
        });
        const rows = [
            ['wheel', InputEventType.MOUSE_WHEEL],
            ['mousedown', InputEventType.MOUSE_DOWN],
            ['mousemove', InputEventType.MOUSE_MOVE],
            ['mouseup', InputEventType.MOUSE_UP],
        ] as const;
        try {
            for (const [domType, engineType] of rows) {
                const handler =
                    domType === 'wheel' ? source._handleMouseWheel.bind(source) : source._createCallback(engineType);
                const bubble = jest.fn();
                canvas.addEventListener(domType, handler);
                window.addEventListener(domType, bubble);
                try {
                    const makeEvent = (cancelable: boolean) =>
                        domType === 'wheel'
                            ? new WheelEvent(domType, { bubbles: true, cancelable, deltaY: 2 })
                            : new MouseEvent(domType, { bubbles: true, cancelable });
                    const event = makeEvent(true);
                    canvas.dispatchEvent(event);
                    expect(bubble).toHaveBeenCalledTimes(1);
                    expect(event.defaultPrevented).toBe(true);
                    expect(emit).toHaveBeenLastCalledWith(engineType, expect.anything());
                    const external = makeEvent(true);
                    outside.dispatchEvent(external);
                    expect(bubble).toHaveBeenCalledTimes(2);
                    expect(external.defaultPrevented).toBe(false);
                    const noncancelable = makeEvent(false);
                    const cancel = jest.spyOn(noncancelable, 'preventDefault');
                    canvas.dispatchEvent(noncancelable);
                    expect(cancel).not.toHaveBeenCalled();
                    expect(bubble).toHaveBeenCalledTimes(3);
                } finally {
                    canvas.removeEventListener(domType, handler);
                    window.removeEventListener(domType, bubble);
                }
            }
        } finally {
            canvas.remove();
            outside.remove();
        }
    });
});
