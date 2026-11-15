jest.mock('../../src/cocos/game', () => ({ game: { pause: jest.fn(), _paused: false } }));
import { attachContextHealth } from '../../src/air/context-health';
import { game } from '../../src/cocos/game';

function device() {
    let lose!: (info: { reason: string; message: string }) => void;
    const lost = new Promise<{ reason: string; message: string }>((resolve) => {
        lose = resolve;
    });
    return { lost, lose: () => lose({ reason: 'destroyed', message: 'test' }) };
}

describe('context health asynchronous device identity', () => {
    beforeEach(() => jest.clearAllMocks());

    test('late loss of an earlier device does not pause or fail its replacement', async () => {
        const health = attachContextHealth(document.createElement('canvas'));
        const first = device(),
            second = device();
        health.watchWebGPUDevice(first);
        health.watchWebGPUDevice(second);
        first.lose();
        await Promise.resolve();
        expect(health.snapshot().state).toBe('healthy');
        expect(game.pause).not.toHaveBeenCalled();
        second.lose();
        await Promise.resolve();
        expect(health.snapshot()).toMatchObject({ state: 'failed', lostCount: 1, suggestion: 'reload' });
        expect(game.pause).toHaveBeenCalledTimes(1);
        health.destroy();
    });

    test('duplicate watches and late settlement after destroy are harmless', async () => {
        const health = attachContextHealth(document.createElement('canvas'));
        const native = device();
        health.watchWebGPUDevice(native);
        health.watchWebGPUDevice(native);
        native.lose();
        await Promise.resolve();
        expect(health.snapshot().lostCount).toBe(1);
        expect(game.pause).toHaveBeenCalledTimes(1);
        health.destroy();
        const late = device();
        const closing = attachContextHealth(document.createElement('canvas'));
        closing.watchWebGPUDevice(late);
        closing.destroy();
        health.watchWebGPUDevice(late);
        late.lose();
        await Promise.resolve();
        expect(game.pause).toHaveBeenCalledTimes(1);
    });
});
