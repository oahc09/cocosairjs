import { EventTarget } from '../../src/cocos/core/event/event-target';
import { Input, EventDispatcherPriority } from '../../src/cocos/input/input';
import { InputEventType } from '../../src/cocos/input/types/event-enum';
import { EventMouse } from '../../src/cocos/input/types/event/event-mouse';
import { EventTouch } from '../../src/cocos/input/types/event/event-touch';
import { Touch } from '../../src/cocos/input/types/touch';
import { Vec2 } from '../../src/cocos/core/math/vec2';
import * as debug from '../../src/cocos/core/platform/debug';
import { pointerEventDispatcher } from '../../src/cocos/2d/event/pointer-event-dispatcher';

function dispatch(source: Input, event: EventMouse | EventTouch): void {
    (source as any)._emitEvent(event);
}

describe('competitive input contract: exception recovery', () => {
    let reports: jest.SpyInstance;
    beforeEach(() => {
        reports = jest.spyOn(debug, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        reports.mockRestore();
    });

    test('ordinary EventTarget still throws but restores once/off invocation state', () => {
        const target = new EventTarget();
        const following = jest.fn();
        target.once('event', () => {
            throw new Error('intentional');
        });
        target.on('event', following);
        expect(() => target.emit('event')).toThrow('intentional');
        expect((target as any)._callbackTable.event.isInvoking).toBe(false);
        target.emit('event');
        expect(following).toHaveBeenCalledTimes(1);
        target.off('event', following);
        expect(target.hasEventListener('event')).toBe(false);
    });

    test.each([InputEventType.MOUSE_WHEEL, InputEventType.MOUSE_DOWN, InputEventType.TOUCH_START])(
        '%s isolates a bad listener and subsequent events still reach the following listener',
        (type) => {
            const source = new Input();
            const next = jest.fn();
            source.on(type as any, () => {
                throw new Error('intentional');
            });
            source.on(type as any, next);
            const event = type === InputEventType.TOUCH_START ? new EventTouch([], false, type) : new EventMouse(type);
            expect(() => {
                dispatch(source, event);
                dispatch(source, event);
            }).not.toThrow();
            expect(next).toHaveBeenCalledTimes(2);
            expect(reports).toHaveBeenCalledTimes(2);
            expect(reports.mock.calls[0][0]).toMatchObject({ code: 'AIR_E_INPUT_LISTENER', eventType: type });
        },
    );

    test('once throwing during nested input dispatch is removed; off skips later listeners', () => {
        const source = new Input();
        const event = new EventMouse(InputEventType.MOUSE_WHEEL);
        const order: string[] = [];
        const removed = () => {
            order.push('removed');
        };
        source.once(InputEventType.MOUSE_WHEEL, () => {
            order.push('once');
            source.off(InputEventType.MOUSE_WHEEL, removed);
            dispatch(source, event);
            throw new Error('intentional');
        });
        source.on(InputEventType.MOUSE_WHEEL, removed);
        source.on(InputEventType.MOUSE_WHEEL, () => {
            order.push('tail');
        });
        dispatch(source, event);
        dispatch(source, event);
        expect(order).toEqual(['once', 'tail', 'tail', 'tail']);
        expect(reports).toHaveBeenCalledTimes(1);
        expect((source as any)._eventTarget._callbackTable[InputEventType.MOUSE_WHEEL].isInvoking).toBe(false);
    });

    test('an external dispatcher exception calls recovery without deleting queued events', () => {
        const source = new Input();
        const recovery = jest.fn();
        const following = jest.fn();
        (source as any)._eventKeyboardList.push({ marker: 'queued' });
        source._registerEventDispatcher({
            priority: EventDispatcherPriority.UI,
            onThrowException: recovery,
            dispatchEvent: () => {
                throw new Error('dispatcher');
            },
        });
        source.on(InputEventType.MOUSE_WHEEL, following);
        dispatch(source, new EventMouse(InputEventType.MOUSE_WHEEL));
        expect(recovery).toHaveBeenCalledTimes(1);
        expect(following).toHaveBeenCalledTimes(1);
        expect((source as any)._eventKeyboardList).toHaveLength(1);
        expect(reports).toHaveBeenCalledTimes(1);
    });

    test('nested UI dispatcher errors restore dispatch depth before the outer event resumes', () => {
        const source = new Input();
        const dispatcher = pointerEventDispatcher as any;
        const oldList = dispatcher._pointerEventProcessorList;
        const oldDirty = dispatcher._isListDirty;
        const event = new EventMouse(InputEventType.MOUSE_WHEEL);
        source._registerEventDispatcher(pointerEventDispatcher);
        const following = jest.fn();
        source.on(InputEventType.MOUSE_WHEEL, following);
        dispatcher._isListDirty = false;
        dispatcher._pointerEventProcessorList = [
            {
                isEnabled: true,
                shouldHandleEventMouse: true,
                _handleEventMouse: () => {
                    if (dispatcher._inDispatchCount > 1) throw new Error('nested UI');
                    dispatch(source, event);
                    expect(dispatcher._inDispatchCount).toBe(1);
                    return false;
                },
            },
        ];
        try {
            dispatch(source, event);
            expect(dispatcher._inDispatchCount).toBe(0);
            expect(following).toHaveBeenCalledTimes(2);
            expect(reports).toHaveBeenCalledTimes(1);
        } finally {
            dispatcher._pointerEventProcessorList = oldList;
            dispatcher._isListDirty = oldDirty;
        }
    });

    test('throwing UI touch-end listeners release their claimed touch ID', () => {
        const source = new Input();
        const dispatcher = pointerEventDispatcher as any;
        const oldList = dispatcher._pointerEventProcessorList;
        const oldDirty = dispatcher._isListDirty;
        const claimed = [9];
        const touch = new Touch(13, 27, 9);
        const event = new EventTouch([touch], false, InputEventType.TOUCH_END);
        event.touch = touch;
        source._registerEventDispatcher(pointerEventDispatcher);
        dispatcher._isListDirty = false;
        dispatcher._pointerEventProcessorList = [
            {
                isEnabled: true,
                shouldHandleEventTouch: true,
                claimedTouchIdList: claimed,
                _handleEventTouch: () => {
                    throw new Error('UI end');
                },
            },
        ];
        try {
            dispatch(source, event);
            expect(claimed).toEqual([]);
            expect(dispatcher._inDispatchCount).toBe(0);
            expect(reports).toHaveBeenCalledTimes(1);
        } finally {
            dispatcher._pointerEventProcessorList = oldList;
            dispatcher._isListDirty = oldDirty;
        }
    });
});

describe('competitive input contract: location output', () => {
    const mouse = new EventMouse(InputEventType.MOUSE_DOWN);
    mouse.setLocation(13, 27);
    const touch = new Touch(13, 27);
    const eventTouch = new EventTouch([touch], false, InputEventType.TOUCH_START);
    eventTouch.touch = touch;
    test.each([mouse, touch, eventTouch, new EventTouch([], false, InputEventType.TOUCH_START)])(
        'accepts Vec2 or omitted output and rejects invalid output consistently',
        (event) => {
            const out = new Vec2();
            expect(event.getLocation(out)).toBe(out);
            expect(event.getLocation()).toBeInstanceOf(Vec2);
            for (const invalid of [{}, { x: 0, y: 0 }, [], null, 0, 'xy']) {
                try {
                    event.getLocation(invalid as any);
                    throw new Error('accepted invalid output');
                } catch (error) {
                    expect(error).toMatchObject({ code: 'AIR_E_INPUT_LOCATION_OUT' });
                    expect(error).toBeInstanceOf(TypeError);
                }
            }
        },
    );
});
