import { VideoPlayerImplWeb } from '../../src/cocos/video/video-player-impl-web';
import { screen } from '../../src/cocos/core/platform/screen';
import { sys } from '../../src/cocos/core/platform/sys';
import { BrowserType } from '../../src/pal/system-info/enum-type';

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

describe('VideoPlayer seek/play calibration', () => {
    function playable() {
        const instance = Object.create(VideoPlayerImplWeb.prototype);
        const video = document.createElement('video');
        instance._video = video;
        instance._eventList = new Map();
        instance._cachedCurrentTime = 2;
        let finish!: () => void;
        const promise = new Promise<void>((resolve) => {
            finish = resolve;
        });
        video.play = jest.fn(() => promise);
        instance._bindDomEvent();
        return { instance, video, promise, finish };
    }

    test('a confirmed seek is not repeated after playback has advanced', async () => {
        const { instance, video, promise, finish } = playable();
        video.currentTime = 2;
        instance.canPlay();
        video.dispatchEvent(new Event('seeked'));
        video.currentTime = 2.2;
        finish();
        await promise;
        await Promise.resolve();
        expect(video.currentTime).toBe(2.2);
        expect(instance._cachedCurrentTime).toBe(-1);
    });

    test('an old play promise cannot seek a replacement video', async () => {
        const { instance, promise, finish } = playable();
        instance.canPlay();
        const replacement = document.createElement('video');
        replacement.currentTime = 1.5;
        instance._video = replacement;
        instance._cachedCurrentTime = 0.25;
        finish();
        await promise;
        await Promise.resolve();
        expect(replacement.currentTime).toBe(1.5);
    });

    test('a rejected play does not calibrate the native loop position', async () => {
        const { instance, video } = playable();
        const rejection = Promise.reject(new DOMException('Interrupted by native loop seek', 'AbortError'));
        video.play = jest.fn(() => rejection);
        const seek = jest.spyOn(instance, 'seekTo');
        instance.canPlay();
        video.currentTime = 0.01;
        await rejection.catch(() => {});
        await Promise.resolve();
        expect(seek).not.toHaveBeenCalled();
        expect(video.currentTime).toBe(0.01);
    });
});

describe('Windows WebKit native loop seek', () => {
    const platform = Object.getOwnPropertyDescriptor(navigator, 'platform');
    const browserType = Object.getOwnPropertyDescriptor(sys, 'browserType');

    beforeEach(() => {
        Object.defineProperty(navigator, 'platform', { configurable: true, value: 'Win32' });
        Object.defineProperty(sys, 'browserType', { configurable: true, value: BrowserType.SAFARI });
    });
    afterEach(() => {
        if (platform) Object.defineProperty(navigator, 'platform', platform);
        else delete (navigator as any).platform;
        if (browserType) Object.defineProperty(sys, 'browserType', browserType);
        jest.restoreAllMocks();
    });

    function loopSeek(currentTime = 0) {
        const instance: any = Object.create(VideoPlayerImplWeb.prototype);
        const video = document.createElement('video');
        instance._video = video;
        instance._eventList = new Map();
        instance._componentEventList = new Map();
        instance._cachedCurrentTime = -1;
        video.loop = true;
        video.currentTime = currentTime;
        Object.defineProperty(video, 'seeking', { configurable: true, value: true });
        video.play = jest.fn(() => Promise.resolve());
        video.pause = jest.fn();
        instance._bindDomEvent();
        instance.canPlay();
        video.play.mockClear();
        video.dispatchEvent(new Event('pause'));
        return { instance, video };
    }
    function landed(video: HTMLVideoElement) {
        Object.defineProperty(video, 'seeking', { configurable: true, value: false });
        video.dispatchEvent(new Event('seeked'));
    }

    test('resumes the native rewind once, without changing media time', async () => {
        const { instance, video } = loopSeek();
        const seek = jest.spyOn(instance, 'seekTo');
        landed(video);
        landed(video);
        await Promise.resolve();
        await Promise.resolve();
        expect(video.play).toHaveBeenCalledTimes(1);
        expect(seek).not.toHaveBeenCalled();
        expect(video.currentTime).toBe(0);
        expect(video.loop).toBe(true);
    });

    test('a zero start-position assignment before metadata does not block native looping', () => {
        const { instance, video } = loopSeek();
        Object.defineProperty(video, 'seeking', { configurable: true, value: false });
        instance.seekTo(0);
        video.play.mockClear();
        Object.defineProperty(video, 'seeking', { configurable: true, value: true });
        video.dispatchEvent(new Event('pause'));
        landed(video);
        expect(video.play).toHaveBeenCalledTimes(1);
    });

    test.each(['pause', 'stop', 'seek', 'disable', 'loop-off', 'interrupt'])(
        '%s cancels a pending loop resume',
        async (control) => {
            const { instance, video } = loopSeek();
            if (control === 'seek') instance.seekTo(0);
            else if (control === 'loop-off') instance.syncLoop(false);
            else if (control === 'interrupt') instance._interrupted = true;
            else instance[control]();
            landed(video);
            await Promise.resolve();
            await Promise.resolve();
            expect(video.play).not.toHaveBeenCalled();
        },
    );

    test('a detached element cannot resume its replacement', () => {
        const { instance, video } = loopSeek();
        const replacement = document.createElement('video');
        replacement.play = jest.fn(() => Promise.resolve());
        instance._video = replacement;
        landed(video);
        expect(video.play).not.toHaveBeenCalled();
        expect(replacement.play).not.toHaveBeenCalled();
    });

    test('a queued ended event cannot complete a newer seek/play on the same element', () => {
        const { instance, video } = loopSeek(2);
        const completed = jest.fn();
        instance._componentEventList.set('completed', completed);
        video.dispatchEvent(new Event('play'));
        video.dispatchEvent(new Event('ended'));
        expect(completed).not.toHaveBeenCalled();
        expect(instance.isPlaying).toBe(true);
        Object.defineProperty(video, 'ended', { configurable: true, value: true });
        video.dispatchEvent(new Event('ended'));
        expect(completed).toHaveBeenCalledTimes(1);
        expect(instance.isPlaying).toBe(false);
    });

    test('ordinary pauses and other browser platforms do not auto-resume', () => {
        for (const platformName of ['MacIntel', 'Win32']) {
            Object.defineProperty(navigator, 'platform', { configurable: true, value: platformName });
            const { video } = loopSeek(platformName === 'Win32' ? 1 : 0);
            landed(video);
            expect(video.play).not.toHaveBeenCalled();
        }
    });
});
