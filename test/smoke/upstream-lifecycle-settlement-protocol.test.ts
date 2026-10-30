import { director, Director } from '../../src';
import { CCObject } from '../../src/cocos/core/data/object';
import { installAssetLifecycle } from '../../examples/shared/asset-lifecycle';

describe('U05 lifecycle protocol negative controls (unit event fixture, not GPU proof)', () => {
    let frame: number;
    beforeEach(() => {
        jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
        frame = 10;
        jest.spyOn(director, 'getTotalFrames').mockImplementation(() => frame);
    });
    afterEach(() => {
        jest.restoreAllMocks();
        jest.useRealTimers();
    });
    const microtasks = async () => {
        await Promise.resolve();
        await Promise.resolve();
    };
    const pair = () => {
        director.emit(Director.EVENT_AFTER_UPDATE);
        director.emit(Director.EVENT_AFTER_DRAW);
    };
    function start() {
        const old = new CCObject();
        const reacquire = jest.fn(async () => [{ name: 'new', ref: new CCObject() }]);
        const report = installAssetLifecycle({
            hold: () => [{ name: 'old', ref: old }],
            release: () => {
                old.destroy();
                CCObject._deferredDestroy();
            },
            reacquire,
        });
        const completion = (window as any).__lifecycle();
        return { report, completion, reacquire };
    }

    test('draw-only, repeated frames and same-task cycles cannot stand in for two complete updates', async () => {
        const { report, completion, reacquire } = start();
        await microtasks();
        director.emit(Director.EVENT_AFTER_DRAW);
        await microtasks();
        expect(reacquire).not.toHaveBeenCalled();
        pair();
        frame++;
        pair(); // Same task: ignored until the required microtask checkpoint.
        await microtasks();
        expect(reacquire).not.toHaveBeenCalled();
        frame--;
        pair(); // Reused frame: ignored.
        await microtasks();
        expect(reacquire).not.toHaveBeenCalled();
        frame += 2;
        pair();
        await microtasks();
        expect(reacquire).toHaveBeenCalledTimes(1);
        for (let i = 0; i < 4; i++) {
            frame++;
            pair();
            await microtasks();
        }
        await completion;
        expect(report.settlement.release).toMatchObject({ completed: true, frames: [10, 12], cycles: 2 });
        expect(report.settlement.reacquire.completed).toBe(true);
        expect(report.errors).toEqual([]);
    });

    test('update without matching draw cannot settle, and completed listeners/timers stay removed', async () => {
        const { report, completion, reacquire } = start();
        await microtasks();
        director.emit(Director.EVENT_AFTER_UPDATE);
        await microtasks();
        expect(reacquire).not.toHaveBeenCalled();
        frame++;
        director.emit(Director.EVENT_AFTER_DRAW); // Draw from a different frame is not the matching pair.
        await microtasks();
        expect(report.settlement.release).toBe(null);
        expect(reacquire).not.toHaveBeenCalled();
        for (let i = 0; i < 8; i++) {
            frame++;
            pair();
            await microtasks();
        }
        await completion;
        expect(report.settlement.release).toMatchObject({ completed: true, cycles: 2 });
        expect(report.settlement.reacquire).toMatchObject({ completed: true, cycles: 2 });
        expect(jest.getTimerCount()).toBe(0);
        const before = JSON.stringify(report);
        const clock = director.getTotalFrames as jest.Mock;
        clock.mockClear();
        frame++;
        pair();
        pair();
        await microtasks();
        expect(clock).not.toHaveBeenCalled();
        expect(JSON.stringify(report)).toBe(before);
        expect(reacquire).toHaveBeenCalledTimes(1);
    });

    test('timer expiry remains a visible incomplete settlement, never a successful engine cycle', async () => {
        const { report, completion } = start();
        await microtasks();
        jest.advanceTimersByTime(8000);
        await microtasks();
        for (let i = 0; i < 5; i++) {
            frame++;
            pair();
            await microtasks();
        }
        await completion;
        expect(report.settlement.release).toMatchObject({ completed: false, frames: [], cycles: 0 });
        expect(report.errors).toContain('release: engine settlement deadline');
    });
});
