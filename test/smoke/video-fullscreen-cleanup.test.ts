import { VideoPlayerImplWeb } from '../../src/cocos/video/video-player-impl-web';
import { screen } from '../../src/cocos/core/platform/screen';

describe('VideoPlayer fullscreen cleanup', () => {
    afterEach(() => jest.restoreAllMocks());

    function player(): VideoPlayerImplWeb {
        const instance = Object.create(VideoPlayerImplWeb.prototype);
        instance._video = { readyState: 4, removeAttribute: jest.fn() };
        instance._fullScreenOnAwake = false;
        jest.spyOn(screen, 'supportsFullScreen', 'get').mockReturnValue(true);
        return instance;
    }

    test('disabling an already windowed player does not request a native exit', () => {
        const instance = player();
        jest.spyOn(screen, 'fullScreen').mockReturnValue(false);
        const exit = jest.spyOn(screen, 'exitFullScreen');
        instance.canFullScreen(false);
        expect(exit).not.toHaveBeenCalled();
    });

    test('a rejected native exit is observed and retains the actual fullscreen state', async () => {
        const instance = player();
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(screen, 'fullScreen').mockReturnValueOnce(true).mockReturnValue(false);
        const exit = jest.spyOn(screen, 'exitFullScreen').mockRejectedValue(new Error('Document not active'));
        instance.canFullScreen(false);
        await Promise.resolve();
        expect(exit).toHaveBeenCalledTimes(1);
        expect((instance as any)._fullScreenOnAwake).toBe(false);
    });
});
