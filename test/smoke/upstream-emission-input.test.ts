import { ParticleSystem } from '../../src/cocos/particle/particle-system';
import { Mode } from '../../src/cocos/particle/animator/curve-range';
import { Node } from '../../src/cocos/scene-graph/node';
import { Input } from '../../src/cocos/input/input';
import { InputEventType } from '../../src/cocos/input/types/event-enum';
import { sys } from '../../src/cocos/core/platform/sys';

afterEach(() => jest.restoreAllMocks());

test.each([Mode.TwoConstants, Mode.TwoCurves])(
    'emission mode %s samples both random factors instead of always upper bound',
    (mode) => {
        const system = new ParticleSystem();
        system.node = new Node();
        Object.assign(system, { _time: 1, _isEmitting: true });
        system.rateOverTime.mode = mode;
        system.rateOverDistance.mode = mode;
        const time = jest.spyOn(system.rateOverTime, 'evaluate').mockReturnValue(0);
        const distance = jest.spyOn(system.rateOverDistance, 'evaluate').mockReturnValue(0);
        jest.spyOn(Math, 'random').mockReturnValue(0.25);
        (system as any)._emit(0.1);
        for (const call of [time.mock.calls[0], distance.mock.calls[0]]) {
            expect(call[1]).toBeGreaterThanOrEqual(0);
            expect(call[1]).toBeLessThan(1);
        }
    },
);

test('constant emission retains deterministic factor and fractional accumulation', () => {
    const system = new ParticleSystem();
    system.node = new Node();
    Object.assign(system, { _time: 1, _isEmitting: true });
    system.rateOverTime.constant = 10;
    system.rateOverDistance.constant = 0;
    const time = jest.spyOn(system.rateOverTime, 'evaluate');
    const emit = jest.spyOn(system, 'emit').mockImplementation(() => {});
    (system as any)._emit(0.15);
    expect(time.mock.calls[0][1]).toBe(1);
    expect(emit).toHaveBeenCalledWith(1, 0.15);
    expect((system as any)._emitRateTimeCounter).toBeCloseTo(0.5);
});

test.each([true, false])('Web mouse synthesizes UI touch with touchscreen capability %s', (touch) => {
    jest.spyOn(sys, 'hasFeature').mockImplementation(
        (feature) => feature === sys.Feature.EVENT_MOUSE || (touch && feature === sys.Feature.INPUT_TOUCH),
    );
    const mouse = new Map<string, (event: unknown) => void>();
    const owner: any = {
        _mouseInput: { on: (name: string, callback: (event: unknown) => void) => mouse.set(name, callback) },
        _touchInput: { on: jest.fn() },
        _dispatchEventTouch: jest.fn(),
        _dispatchEventMouse: jest.fn(),
        _simulateEventTouch: jest.fn(),
    };
    (Input.prototype as any)._registerEvent.call(owner);
    const event = {};
    for (const name of [InputEventType.MOUSE_DOWN, InputEventType.MOUSE_MOVE, InputEventType.MOUSE_UP])
        mouse.get(name)!(event);
    expect(owner._simulateEventTouch).toHaveBeenCalledTimes(3);
    expect(owner._dispatchEventMouse).toHaveBeenCalledTimes(3);
    expect(owner._needSimulateTouchMoveEvent).toBe(false);
    mouse.get(InputEventType.MOUSE_MOVE)!(event);
    expect(owner._simulateEventTouch).toHaveBeenCalledTimes(3);
});
