import { AudioSource } from '../../src/cocos/audio/audio-source';
import { AudioClip } from '../../src/cocos/audio/audio-clip';
import { AudioPlayer } from '../../src/pal/audio/web/player';
import { AudioPlayerDOM } from '../../src/pal/audio/web/player-dom';
import { AudioType } from '../../src/pal/audio/type';
import { Node } from '../../src/cocos/scene-graph';
import { AudioContextAgent } from '../../src/pal/audio/web/player-web';
import { loadAudioPlayer } from '../../src/cocos/audio/audio-downloader';

const flush = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
};

describe('audio readiness terminal paths', () => {
    let native: HTMLAudioElement;
    let pause: jest.SpyInstance;
    let load: jest.SpyInstance;
    beforeEach(() => {
        jest.useFakeTimers();
        native = document.createElement('audio');
        pause = jest.spyOn(native, 'pause').mockImplementation(() => {});
        load = jest.spyOn(native, 'load').mockImplementation(() => {});
        const create = document.createElement.bind(document);
        jest.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
            tag === 'audio' ? native : create(tag)) as any);
    });
    afterEach(() => {
        jest.restoreAllMocks();
        jest.useRealTimers();
    });

    test.each(['error', 'abort', 'timeout'])('%s rejects and releases the native media request', async (mode) => {
        const controller = new AbortController();
        const pending = AudioPlayerDOM.loadNative('slow.wav', { timeoutMs: 50, signal: controller.signal });
        const outcome = pending.then(
            () => null,
            (error) => error,
        );
        if (mode === 'error') native.dispatchEvent(new Event('error'));
        else if (mode === 'abort') controller.abort();
        else jest.advanceTimersByTime(50);
        expect(await outcome).toBeInstanceOf(Error);
        expect(pause).toHaveBeenCalledTimes(1);
        expect(load).toHaveBeenCalledTimes(1);
        expect(native.getAttribute('src')).toBeNull();
        native.dispatchEvent(new Event('canplaythrough')); // late readiness cannot win
        expect(jest.getTimerCount()).toBe(0);
    });

    test('a configured slow load can complete and removes its cancellation listener', async () => {
        const controller = new AbortController();
        const pending = AudioPlayerDOM.loadNative('slow.wav', { timeoutMs: 12000, signal: controller.signal });
        jest.advanceTimersByTime(9000);
        native.dispatchEvent(new Event('canplaythrough'));
        native.dispatchEvent(new Event('canplay')); // Firefox test environments use canplay
        native.dispatchEvent(new Event('loadedmetadata'));
        expect(await pending).toBe(native);
        controller.abort();
        expect(load).not.toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
    });

    test('already aborted requests do not attach a source or start a timer', async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(AudioPlayerDOM.loadNative('never.wav', { signal: controller.signal })).rejects.toMatchObject({
            name: 'AbortError',
        });
        expect(native.getAttribute('src')).toBeNull();
        expect(jest.getTimerCount()).toBe(0);
    });

    test('assetManager audio downloader forwards readiness controls and preserves failure', async () => {
        const failure = new Error('503');
        const loading = jest.spyOn(AudioPlayer, 'load').mockRejectedValue(failure);
        const controller = new AbortController();
        const completed = jest.fn();
        loadAudioPlayer('slow.wav', { timeoutMs: 15000, signal: controller.signal, transport: 'buffered' }, completed);
        await flush();
        expect(loading).toHaveBeenCalledWith(
            'slow.wav',
            expect.objectContaining({ timeoutMs: 15000, signal: controller.signal, transport: 'buffered' }),
        );
        expect(completed).toHaveBeenCalledWith(failure);
    });

    test('callback-only decode failure rejects even if the browser returns no Promise', async () => {
        const previous = window.AudioContext;
        const failure = new Error('invalid audio');
        (window as any).AudioContext = class {
            decodeAudioData(_data: ArrayBuffer, _success: unknown, reject: (error: Error) => void) {
                reject(failure);
            }
        };
        try {
            const agent = new AudioContextAgent();
            await expect(agent.decodeAudioData(new ArrayBuffer(4))).rejects.toBe(failure);
        } finally {
            (window as any).AudioContext = previous;
        }
    });

    test('buffered DOM transport aborts its network owner and revokes a successfully handed-off Blob on destroy', async () => {
        const originalXHR = global.XMLHttpRequest;
        const originalCreate = URL.createObjectURL;
        const originalRevoke = URL.revokeObjectURL;
        const requests: any[] = [];
        class Request {
            status = 200;
            response = new Blob(['audio']);
            onload: (() => void) | null = null;
            onabort: (() => void) | null = null;
            open() {}
            send() {}
            abort = jest.fn();
            constructor() {
                requests.push(this);
            }
        }
        (global as any).XMLHttpRequest = Request;
        URL.createObjectURL = jest.fn(() => 'blob:owned-audio');
        URL.revokeObjectURL = jest.fn();
        try {
            const controller = new AbortController();
            const cancelled = AudioPlayerDOM.loadNative('slow.wav', {
                transport: 'buffered',
                signal: controller.signal,
            });
            controller.abort();
            await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
            expect(requests[0].abort).toHaveBeenCalledTimes(1);
            const loaded = AudioPlayerDOM.load('tone.wav', { transport: 'buffered' });
            requests[1].onload();
            native.dispatchEvent(new Event('canplay'));
            native.dispatchEvent(new Event('loadedmetadata'));
            const player = await loaded;
            expect(player.src).toBe('tone.wav');
            player.destroy();
            player.destroy();
            expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
            const oneShot = AudioPlayerDOM.loadOneShotAudio('one.wav', 1, { transport: 'buffered' });
            requests[2].onload();
            native.dispatchEvent(new Event('canplay'));
            native.dispatchEvent(new Event('loadedmetadata'));
            await oneShot;
            Object.defineProperty(native, 'ended', { value: true, configurable: true });
            native.dispatchEvent(new Event('ended')); // no public onEnd callback is required for URL cleanup
            jest.runAllTicks(); // fake timers also own queueMicrotask
            await flush();
            expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
        } finally {
            global.XMLHttpRequest = originalXHR;
            URL.createObjectURL = originalCreate;
            URL.revokeObjectURL = originalRevoke;
        }
    });

    function source(url: string): AudioSource {
        const value = new AudioSource();
        value.node = new Node('readiness');
        const clip = new AudioClip(url);
        clip._nativeAsset = { player: null, url, duration: 1, type: AudioType.DOM_AUDIO };
        value.clip = clip;
        return value;
    }

    test('load failure rejects both metadata waiters and explicit retry can become ready', async () => {
        const failure = new Error('503');
        const fake = {
            destroy: jest.fn(),
            stop: jest.fn(() => Promise.resolve()),
            loop: false,
            volume: 1,
            sampleRate: 22050,
        };
        jest.spyOn(AudioPlayer, 'load')
            .mockRejectedValueOnce(failure)
            .mockResolvedValueOnce(fake as any);
        const value = source('retry.wav');
        await expect(value.getSampleRate()).rejects.toBe(failure);
        await expect(value.getPCMData(0)).rejects.toBe(failure);
        expect(value.loadState).toBe('error');
        await value.loadAsync({ retry: true });
        expect(await value.getSampleRate()).toBe(22050);
        value.onDestroy();
    });

    test('an invalid atomic clip load rejects without replacing or destroying the existing player', async () => {
        const fake = {
            destroy: jest.fn(),
            stop: jest.fn(() => Promise.resolve()),
            loop: false,
            volume: 1,
            sampleRate: 22050,
        };
        const loading = jest.spyOn(AudioPlayer, 'load').mockResolvedValue(fake as any);
        const value = source('valid.wav');
        await value.loadAsync();
        const original = value.clip;
        await expect(value.loadAsync({ clip: new AudioClip('invalid') })).rejects.toThrow('Invalid audio clip');
        expect(value.clip).toBe(original);
        expect(loading).toHaveBeenCalledTimes(1);
        expect(fake.destroy).not.toHaveBeenCalled();
        value.onDestroy();
    });

    test('a loaded observer cannot retroactively cancel handed-off readiness', async () => {
        const fake = {
            destroy: jest.fn(),
            stop: jest.fn(() => Promise.resolve()),
            loop: false,
            volume: 1,
            sampleRate: 22050,
        };
        jest.spyOn(AudioPlayer, 'load').mockResolvedValue(fake as any);
        const value = source('ready.wav');
        value.node.once('audiosource-loaded', () => value.cancelLoad());
        await value.loadAsync();
        expect(value.loadState).toBe('ready');
        value.onDestroy();
    });

    test.each(['destroy', 'replace', 'cancel'])(
        '%s ends current metadata waiters and aborts its PAL signal',
        async (mode) => {
            const signals: AbortSignal[] = [];
            jest.spyOn(AudioPlayer, 'load').mockImplementation((_url, opts) => {
                signals.push(opts!.signal!);
                return new Promise(() => {});
            });
            const value = source('first.wav');
            const waiting = value.getSampleRate().then(
                () => null,
                (error) => error,
            );
            if (mode === 'destroy') value.onDestroy();
            else if (mode === 'replace') {
                const clip = new AudioClip('second');
                clip._nativeAsset = { player: null, url: 'second.wav', duration: 1, type: AudioType.DOM_AUDIO };
                value.clip = clip;
            } else value.cancelLoad();
            expect((await waiting).name).toBe('AbortError');
            expect(signals[0].aborted).toBe(true);
            value.onDestroy();
            await flush();
        },
    );
});
