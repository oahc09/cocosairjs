import { OneShotAudioDOM } from '../../src/pal/audio/web/player-dom';
import { AudioContextAgent } from '../../src/pal/audio/web/player-web';

describe('selected canvas audio gesture recovery', () => {
    beforeEach(() => {
        document.body.innerHTML = '<canvas id="custom"></canvas><canvas id="GameCanvas"></canvas>';
        (globalThis as any).__CC_CANVAS__ = document.querySelector('#custom');
    });
    afterEach(() => {
        delete (globalThis as any).__CC_CANVAS__;
    });
    test('DOM playback retry listens to selected custom canvas and detaches on success', async () => {
        const play = jest.fn().mockRejectedValueOnce(new Error('gesture required')).mockResolvedValue(undefined);
        const audio = { play, volume: 1 } as unknown as HTMLAudioElement;
        const instance = new OneShotAudioDOM(audio, 1);
        const played = jest.fn();
        instance.onPlay = played;
        instance.play();
        await Promise.resolve();
        await Promise.resolve();
        document.querySelector('#GameCanvas')!.dispatchEvent(new MouseEvent('mouseup'));
        expect(play).toHaveBeenCalledTimes(1);
        document.querySelector('#custom')!.dispatchEvent(new MouseEvent('mouseup'));
        await Promise.resolve();
        await Promise.resolve();
        expect(play).toHaveBeenCalledTimes(2);
        expect(played).toHaveBeenCalledTimes(1);
        document.querySelector('#custom')!.dispatchEvent(new MouseEvent('mouseup'));
        expect(play).toHaveBeenCalledTimes(2);
    });
    test('Web Audio recovery uses selected custom canvas and removes gesture listeners', async () => {
        const resume = jest.fn(async () => {});
        const instance = Object.create(AudioContextAgent.prototype);
        instance._isRunning = false;
        instance._context = { state: 'interrupted', resume };
        const pending = instance.runContext();
        document.querySelector('#GameCanvas')!.dispatchEvent(new MouseEvent('mouseup'));
        expect(resume).not.toHaveBeenCalled();
        document.querySelector('#custom')!.dispatchEvent(new MouseEvent('mouseup'));
        await pending;
        expect(resume).toHaveBeenCalledTimes(1);
        document.querySelector('#custom')!.dispatchEvent(new MouseEvent('mouseup'));
        expect(resume).toHaveBeenCalledTimes(1);
    });
});
