import { AudioClip } from '../../src/cocos/audio/audio-clip';
import { audioManager } from '../../src/cocos/audio/audio-manager';
import { AudioSource } from '../../src/cocos/audio/audio-source';
import { Node } from '../../src/cocos/scene-graph';
import { game, Game } from '../../src/cocos/game';
import { AudioEvent, AudioState, AudioType } from '../../src/pal/audio/type';
import { AudioPlayer, OneShotAudio } from '../../src/pal/audio/web/player';
import { AudioPlayerDOM, OneShotAudioDOM } from '../../src/pal/audio/web/player-dom';
import { systemInfo } from '../../src/pal/system-info/web/system-info';
import { BrowserType } from '../../src/pal/system-info/enum-type';

// CPU-only contract evidence: the engine classes below are real, but native media,
// gestures, and promise completion are controlled doubles. No audible playback,
// browser autoplay policy, GPU, compositor, or wall-clock timing is established.
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function namedError(name: string): Error {
    return Object.assign(new Error(name), { name });
}

function observe(promise: Promise<void>) {
    const result = { status: 'pending', error: undefined as any };
    promise.then(
        () => {
            result.status = 'fulfilled';
        },
        (error) => {
            result.status = 'rejected';
            result.error = error;
        },
    );
    return result;
}

// Drain only promise jobs, with no timer or sleep and no dependence on elapsed time.
async function flushMicrotasks(): Promise<void> {
    for (let i = 0; i < 24; ++i) await Promise.resolve();
}

class TrackedEventTarget extends EventTarget {
    private listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

    addEventListener(type: string, listener: any, options?: any): void {
        super.addEventListener(type, listener, options);
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type)!.add(listener);
    }

    removeEventListener(type: string, listener: any, options?: any): void {
        super.removeEventListener(type, listener, options);
        this.listeners.get(type)?.delete(listener);
    }

    listenerCount(type: string): number {
        return this.listeners.get(type)?.size ?? 0;
    }
}

class NativeAudioDouble extends TrackedEventTarget {
    src = 'cpu-double.mp3';
    duration = 20;
    currentTime = 7;
    volume = 1;
    loop = false;
    paused = true;
    ended = false;
    attempts: ReturnType<typeof deferred<void>>[] = [];
    play = jest.fn(() => {
        this.paused = false;
        this.ended = false;
        const attempt = deferred<void>();
        this.attempts.push(attempt);
        return attempt.promise;
    });
    pause = jest.fn(() => {
        this.paused = true;
    });
    removeAttribute = jest.fn((name: string) => {
        if (name === 'src') this.src = '';
    });
    load = jest.fn(() => {
        this.paused = true;
        this.currentTime = 0;
        this.ended = false;
        // Keep native play promises controllable after reset. Real browser media
        // abort/delivery ordering is not simulated by this CPU-only double.
    });

    end(): void {
        this.ended = true;
        this.paused = true;
        this.currentTime = this.duration;
        this.dispatchEvent(new Event('ended'));
    }
}

describe('audio cancellation and ownership (CPU media doubles)', () => {
    let canvas: TrackedEventTarget;
    let players: { native: NativeAudioDouble; dom: AudioPlayerDOM; player: AudioPlayer }[];
    let sources: AudioSource[];

    function makePlayer() {
        const native = new NativeAudioDouble();
        const dom = new AudioPlayerDOM(native as unknown as HTMLAudioElement);
        const player = new AudioPlayer(dom);
        const result = { native, dom, player };
        players.push(result);
        return result;
    }

    function makeClip(url: string): AudioClip {
        const clip = new AudioClip(url);
        clip._nativeAsset = { player: null, url, duration: 20, type: AudioType.DOM_AUDIO };
        return clip;
    }

    function makeSource() {
        const source = new AudioSource();
        source.node = new Node('CPU audio source');
        source.playOnAwake = false;
        const started = jest.fn();
        const ended = jest.fn();
        const loaded = jest.fn();
        source.node.on(AudioSource.EventType.STARTED, started);
        source.node.on(AudioSource.EventType.ENDED, ended);
        source.node.on('audiosource-loaded', loaded);
        sources.push(source);
        return { source, started, ended, loaded };
    }

    async function loadedSource() {
        const result = makePlayer();
        jest.spyOn(AudioPlayer, 'load').mockResolvedValue(result.player);
        const source = makeSource();
        source.source.clip = makeClip('loaded.mp3');
        await flushMicrotasks();
        return { ...result, ...source };
    }

    function isTracked(player: AudioPlayer): boolean {
        return (audioManager as any)._audioPlayerInfoList.some((entry: any) => entry.audio === player);
    }

    beforeEach(() => {
        canvas = new TrackedEventTarget();
        (globalThis as any).__CC_CANVAS__ = canvas;
        players = [];
        sources = [];
    });

    afterEach(() => {
        sources.forEach((source) => source.onDestroy());
        players.forEach(({ dom, player }) => {
            audioManager.removePlaying(player);
            if ((dom as any)._domAudio) dom.destroy();
        });
        delete (globalThis as any).__CC_CANVAS__;
        jest.restoreAllMocks();
    });

    test.each(['pause', 'stop', 'destroy'] as const)(
        '%s promptly cancels pending play and physically stops native media before native settlement',
        async (action) => {
            const { dom, native } = makePlayer();
            const play = observe(dom.play());
            expect(native.play).toHaveBeenCalledTimes(1);
            const control = observe(Promise.resolve(dom[action]()));
            expect(native.paused).toBe(true);
            expect(native.currentTime).toBe(action === 'pause' ? 7 : 0);
            await flushMicrotasks();
            expect(control.status).toBe('fulfilled');
            expect(play.status).toBe('rejected');
            expect(play.error?.name).toBe('AbortError');
            expect(dom.state).not.toBe(AudioState.PLAYING);
            native.attempts[0].resolve();
            await flushMicrotasks();
            expect(dom.state).not.toBe(AudioState.PLAYING);
            expect(native.paused).toBe(true);
        },
    );

    test.each(['resolve', 'reject'] as const)('late native %s cannot revive a canceled player', async (outcome) => {
        const { dom, native } = makePlayer();
        const play = observe(dom.play());
        const stop = observe(dom.stop());
        if (outcome === 'resolve') native.attempts[0].resolve();
        else native.attempts[0].reject(namedError('AbortError'));
        await flushMicrotasks();
        expect(play.status).toBe('rejected');
        expect(stop.status).toBe('fulfilled');
        expect(dom.state).toBe(AudioState.STOPPED);
        expect(native.paused).toBe(true);
        expect(native.currentTime).toBe(0);
        expect(canvas.listenerCount('mouseup')).toBe(0);
        expect(canvas.listenerCount('touchend')).toBe(0);
    });

    test('play-stop-play does not wait for the old native play, and its late completion leaves the new intent live', async () => {
        const { dom, native } = makePlayer();
        const first = observe(dom.play());
        const stop = observe(dom.stop());
        const second = observe(dom.play());
        expect(native.play).toHaveBeenCalledTimes(2);
        await flushMicrotasks();
        expect(first.status).toBe('rejected');
        expect(stop.status).toBe('fulfilled');
        expect(second.status).toBe('pending');
        native.attempts[1].resolve();
        await flushMicrotasks();
        const pauses = native.pause.mock.calls.length;
        expect(second.status).toBe('fulfilled');
        native.attempts[0].resolve();
        await flushMicrotasks();
        expect(dom.state).toBe(AudioState.PLAYING);
        expect(native.paused).toBe(false);
        expect(native.pause).toHaveBeenCalledTimes(pauses);
    });

    test('repeated plays settle superseded promises and ignore their late failure/success', async () => {
        const { dom, native } = makePlayer();
        const first = observe(dom.play());
        const second = observe(dom.play());
        const third = observe(dom.play());
        expect(native.play).toHaveBeenCalledTimes(3);
        await flushMicrotasks();
        expect(first.status).toBe('rejected');
        expect(second.status).toBe('rejected');
        expect(third.status).toBe('pending');
        native.attempts[2].resolve();
        await flushMicrotasks();
        native.attempts[0].reject(namedError('NotAllowedError'));
        native.attempts[1].resolve();
        await flushMicrotasks();
        expect(third.status).toBe('fulfilled');
        expect(dom.state).toBe(AudioState.PLAYING);
        expect(canvas.listenerCount('mouseup')).toBe(0);
        canvas.dispatchEvent(new Event('mouseup'));
        expect(native.play).toHaveBeenCalledTimes(3);
    });

    test.each(['AbortError', 'NotSupportedError'])('%s rejects without installing gesture retry', async (name) => {
        const { dom, native } = makePlayer();
        const play = observe(dom.play());
        const error = namedError(name);
        native.attempts[0].reject(error);
        await flushMicrotasks();
        expect(play.status).toBe('rejected');
        expect(play.error).toBe(error);
        expect(dom.state).not.toBe(AudioState.PLAYING);
        expect(canvas.listenerCount('mouseup')).toBe(0);
        expect(canvas.listenerCount('touchend')).toBe(0);
        canvas.dispatchEvent(new Event('mouseup'));
        expect(native.play).toHaveBeenCalledTimes(1);
    });

    test('NotAllowedError retries remain pending through a rejected gesture, then settle only on native success', async () => {
        const { dom, native } = makePlayer();
        const play = observe(dom.play());
        native.attempts[0].reject(namedError('NotAllowedError'));
        await flushMicrotasks();
        expect(play.status).toBe('pending');
        expect(canvas.listenerCount('mouseup')).toBe(1);
        expect(canvas.listenerCount('touchend')).toBe(1);
        canvas.dispatchEvent(new Event('mouseup'));
        expect(native.play).toHaveBeenCalledTimes(2);
        native.attempts[1].reject(namedError('NotAllowedError'));
        await flushMicrotasks();
        expect(play.status).toBe('pending');
        expect(dom.state).not.toBe(AudioState.PLAYING);
        canvas.dispatchEvent(new Event('touchend'));
        expect(native.play).toHaveBeenCalledTimes(3);
        await flushMicrotasks();
        expect(play.status).toBe('pending');
        native.attempts[2].resolve();
        await flushMicrotasks();
        expect(play.status).toBe('fulfilled');
        expect(dom.state).toBe(AudioState.PLAYING);
        expect(canvas.listenerCount('mouseup')).toBe(0);
        expect(canvas.listenerCount('touchend')).toBe(0);
        canvas.dispatchEvent(new Event('mouseup'));
        expect(native.play).toHaveBeenCalledTimes(3);
    });

    test.each(['pause', 'stop', 'destroy'] as const)(
        '%s removes denied-play gesture retry listeners',
        async (action) => {
            const { dom, native } = makePlayer();
            const play = observe(dom.play());
            native.attempts[0].reject(namedError('NotAllowedError'));
            await flushMicrotasks();
            expect(canvas.listenerCount('mouseup')).toBe(1);
            observe(Promise.resolve(dom[action]()));
            await flushMicrotasks();
            expect(play.status).toBe('rejected');
            expect(canvas.listenerCount('mouseup')).toBe(0);
            expect(canvas.listenerCount('touchend')).toBe(0);
            canvas.dispatchEvent(new Event('mouseup'));
            canvas.dispatchEvent(new Event('touchend'));
            expect(native.play).toHaveBeenCalledTimes(1);
            expect(native.paused).toBe(true);
        },
    );

    test('canceling an in-flight gesture retry observes its late rejection without installing another retry', async () => {
        const { dom, native } = makePlayer();
        const play = observe(dom.play());
        native.attempts[0].reject(namedError('NotAllowedError'));
        await flushMicrotasks();
        canvas.dispatchEvent(new Event('mouseup'));
        canvas.dispatchEvent(new Event('touchend'));
        expect(native.play).toHaveBeenCalledTimes(2);
        const stop = observe(dom.stop());
        await flushMicrotasks();
        expect(stop.status).toBe('fulfilled');
        expect(play.status).toBe('rejected');
        expect(play.error?.name).toBe('AbortError');
        native.attempts[1].reject(namedError('NotAllowedError'));
        await flushMicrotasks();
        expect(canvas.listenerCount('mouseup')).toBe(0);
        expect(canvas.listenerCount('touchend')).toBe(0);
        canvas.dispatchEvent(new Event('mouseup'));
        expect(native.play).toHaveBeenCalledTimes(2);
        expect(dom.state).toBe(AudioState.STOPPED);
    });

    test('native void-returning play remains supported, and synchronous native failures are observed', async () => {
        const { dom, native } = makePlayer();
        native.play.mockImplementationOnce(() => undefined as any);
        const legacy = observe(dom.play());
        await flushMicrotasks();
        expect(legacy.status).toBe('fulfilled');
        expect(dom.state).toBe(AudioState.PLAYING);
        await dom.stop();
        const failure = namedError('NotSupportedError');
        native.play.mockImplementationOnce(() => {
            throw failure;
        });
        const failed = observe(dom.play());
        await flushMicrotasks();
        expect(failed.status).toBe('rejected');
        expect(failed.error).toBe(failure);
        expect(canvas.listenerCount('mouseup')).toBe(0);
    });

    test('destroy detaches media, gesture, and game interruption listeners', async () => {
        const { dom, native } = makePlayer();
        const ended = jest.fn();
        dom.onEnded(ended);
        const play = observe(dom.play());
        native.attempts[0].reject(namedError('NotAllowedError'));
        await flushMicrotasks();
        const off = jest.spyOn(game, 'off');
        dom.destroy();
        await flushMicrotasks();
        expect(play.status).toBe('rejected');
        expect(native.listenerCount('ended')).toBe(0);
        expect(native.removeAttribute).toHaveBeenCalledWith('src');
        expect(native.load).toHaveBeenCalledTimes(1);
        expect(native.src).toBe('');
        expect(canvas.listenerCount('mouseup')).toBe(0);
        expect(canvas.listenerCount('touchend')).toBe(0);
        expect(off).toHaveBeenCalledWith(Game.EVENT_PAUSE, (dom as any)._onInterruptedBegin, dom);
        expect(off).toHaveBeenCalledWith(Game.EVENT_RESUME, (dom as any)._onInterruptedEnd, dom);
        native.end();
        expect(ended).not.toHaveBeenCalled();
        expect((dom as any)._operationQueue).toHaveLength(0);
    });

    test('stop preserves the native source for replay, while repeated destroy is harmless', async () => {
        const { dom, native } = makePlayer();
        observe(dom.play());
        await dom.stop();
        expect(native.src).toBe('cpu-double.mp3');
        expect(native.removeAttribute).not.toHaveBeenCalled();
        expect(native.load).not.toHaveBeenCalled();
        dom.destroy();
        expect(() => dom.destroy()).not.toThrow();
        expect(native.load).toHaveBeenCalledTimes(1);
        const afterDestroy = observe(dom.play());
        await flushMicrotasks();
        expect(afterDestroy.status).toBe('rejected');
        expect(afterDestroy.error?.name).toBe('AbortError');
        expect(native.play).toHaveBeenCalledTimes(1);
    });

    test('natural ended before native fulfilment cancels play, keeps INIT, and permits replay', async () => {
        const { dom, native } = makePlayer();
        const ended = jest.fn();
        dom.onEnded(ended);
        const first = observe(dom.play());
        native.end();
        await flushMicrotasks();
        expect(first.status).toBe('rejected');
        expect(dom.state).toBe(AudioState.INIT);
        expect(native.currentTime).toBe(0);
        expect(ended).toHaveBeenCalledTimes(1);
        native.attempts[0].resolve();
        await flushMicrotasks();
        expect(dom.state).toBe(AudioState.INIT);
        const replay = observe(dom.play());
        native.attempts[1].resolve();
        await flushMicrotasks();
        expect(replay.status).toBe('fulfilled');
        expect(dom.state).toBe(AudioState.PLAYING);
        expect(ended).toHaveBeenCalledTimes(1);
    });

    test('a stale ended event with native ended=false cannot end a newer play', async () => {
        const { dom, native } = makePlayer();
        const ended = jest.fn();
        dom.onEnded(ended);
        const current = observe(dom.play());
        native.attempts[0].resolve();
        await flushMicrotasks();
        native.dispatchEvent(new Event('ended'));
        await flushMicrotasks();
        expect(current.status).toBe('fulfilled');
        expect(native.ended).toBe(false);
        expect(dom.state).toBe(AudioState.PLAYING);
        expect(ended).not.toHaveBeenCalled();
    });

    test.each(['resolve', 'reject'] as const)(
        'one-shot stop prevents onPlay after a late native %s',
        async (outcome) => {
            const native = new NativeAudioDouble();
            const oneShot = new OneShotAudioDOM(native as unknown as HTMLAudioElement, 1);
            const played = jest.fn();
            oneShot.onPlay = played;
            oneShot.play();
            oneShot.stop();
            expect(native.paused).toBe(true);
            if (outcome === 'resolve') native.attempts[0].resolve();
            else native.attempts[0].reject(namedError('NotAllowedError'));
            await flushMicrotasks();
            expect(played).not.toHaveBeenCalled();
            expect(canvas.listenerCount('mouseup')).toBe(0);
            expect(canvas.listenerCount('touchend')).toBe(0);
            canvas.dispatchEvent(new Event('mouseup'));
            expect(native.play).toHaveBeenCalledTimes(1);
        },
    );

    test('one-shot ignores old queued ended after stop/replay but still completes the new natural EOS once', async () => {
        const native = new NativeAudioDouble();
        const oneShot = new OneShotAudio(new OneShotAudioDOM(native as unknown as HTMLAudioElement, 1));
        const ended = jest.fn(() => audioManager.removePlaying(oneShot));
        oneShot.onEnd = ended;
        oneShot.play();
        native.attempts[0].resolve();
        await flushMicrotasks();
        native.ended = true;
        native.paused = true; // Old EOS occurred; event delivery is still queued.
        oneShot.stop();
        oneShot.play();
        audioManager.addPlaying(oneShot);
        native.attempts[1].resolve();
        await flushMicrotasks();
        native.dispatchEvent(new Event('ended'));
        expect(ended).not.toHaveBeenCalled();
        expect((audioManager as any)._oneShotAudioInfoList.some((entry: any) => entry.audio === oneShot)).toBe(true);
        native.end();
        native.dispatchEvent(new Event('ended'));
        expect(ended).toHaveBeenCalledTimes(1);
        expect((audioManager as any)._oneShotAudioInfoList.some((entry: any) => entry.audio === oneShot)).toBe(false);
    });

    test('one-shot natural EOS before native fulfilment cancels late onPlay and allows a subsequent replay', async () => {
        const native = new NativeAudioDouble();
        const oneShot = new OneShotAudioDOM(native as unknown as HTMLAudioElement, 1);
        const ended = jest.fn(),
            played = jest.fn();
        oneShot.onEnd = ended;
        oneShot.onPlay = played;
        oneShot.play();
        native.end();
        native.attempts[0].resolve();
        await flushMicrotasks();
        expect(ended).toHaveBeenCalledTimes(1);
        expect(played).not.toHaveBeenCalled();
        oneShot.play();
        native.attempts[1].resolve();
        await flushMicrotasks();
        expect(played).toHaveBeenCalledTimes(1);
        native.end();
        expect(ended).toHaveBeenCalledTimes(2);
    });

    test('queued ended cannot change STOPPED to INIT or end a newer live DOM play', async () => {
        const { dom, native } = makePlayer();
        const ended = jest.fn();
        dom.onEnded(ended);
        observe(dom.play());
        await dom.stop();
        native.dispatchEvent(new Event('ended'));
        expect(dom.state).toBe(AudioState.STOPPED);
        expect(ended).not.toHaveBeenCalled();
        observe(dom.play());
        native.attempts[1].resolve();
        await flushMicrotasks();
        native.dispatchEvent(new Event('ended'));
        expect(dom.state).toBe(AudioState.PLAYING);
        expect(ended).not.toHaveBeenCalled();
        native.end();
        expect(dom.state).toBe(AudioState.INIT);
        expect(ended).toHaveBeenCalledTimes(1);
    });

    test('one-shot stop removes a pending autoplay gesture retry', async () => {
        const native = new NativeAudioDouble();
        const oneShot = new OneShotAudioDOM(native as unknown as HTMLAudioElement, 1);
        const played = jest.fn();
        oneShot.onPlay = played;
        oneShot.play();
        native.attempts[0].reject(namedError('NotAllowedError'));
        await flushMicrotasks();
        expect(canvas.listenerCount('mouseup')).toBe(1);
        oneShot.stop();
        await flushMicrotasks();
        expect(canvas.listenerCount('mouseup')).toBe(0);
        expect(canvas.listenerCount('touchend')).toBe(0);
        canvas.dispatchEvent(new Event('mouseup'));
        expect(native.play).toHaveBeenCalledTimes(1);
        expect(played).not.toHaveBeenCalled();
        expect(native.paused).toBe(true);
    });

    test('game pause cancels pending play, and an intervening stop prevents game resume replay', async () => {
        const { dom, native } = makePlayer();
        const resumed = jest.fn();
        dom.onInterruptionEnd(resumed);
        const play = observe(dom.play());
        game.emit(Game.EVENT_PAUSE);
        expect(native.paused).toBe(true);
        const stop = observe(dom.stop());
        game.emit(Game.EVENT_RESUME);
        await flushMicrotasks();
        expect(play.status).toBe('rejected');
        expect(stop.status).toBe('fulfilled');
        expect(dom.state).toBe(AudioState.STOPPED);
        expect(native.play).toHaveBeenCalledTimes(1);
        native.attempts[0].resolve();
        await flushMicrotasks();
        game.emit(Game.EVENT_RESUME);
        await flushMicrotasks();
        expect(dom.state).toBe(AudioState.STOPPED);
        expect(native.play).toHaveBeenCalledTimes(1);
        expect(resumed).not.toHaveBeenCalled();
    });

    test.each(['stop', 'pause', 'onDestroy'] as const)(
        'AudioSource %s suppresses STARTED from late native fulfilment',
        async (action) => {
            const { source, started, native } = await loadedSource();
            source.play();
            source[action]();
            expect(native.paused).toBe(true);
            native.attempts[0].resolve();
            await flushMicrotasks();
            expect(started).not.toHaveBeenCalled();
            expect(source.playing).toBe(false);
        },
    );

    test('AudioSource play-stop-play keeps current manager tracking when the canceled play rejects', async () => {
        const { source, started, native, player } = await loadedSource();
        source.play();
        source.stop();
        source.play();
        expect(native.play).toHaveBeenCalledTimes(2);
        await flushMicrotasks();
        expect(isTracked(player)).toBe(true);
        expect(started).not.toHaveBeenCalled();
        native.attempts[0].reject(namedError('AbortError'));
        await flushMicrotasks();
        expect(isTracked(player)).toBe(true);
        native.attempts[1].resolve();
        await flushMicrotasks();
        expect(started).toHaveBeenCalledTimes(1);
        expect(source.playing).toBe(true);
        expect(isTracked(player)).toBe(true);
    });

    test.each(['stop', 'pause', 'onDestroy'] as const)(
        'AudioSource %s invalidates a fulfilled PAL play before its queued STARTED callback runs',
        async (action) => {
            const { source, started, native } = await loadedSource();
            source.play();
            native.attempts[0].resolve();
            // Cross the native acknowledgement and PAL fulfilment jobs, but stop
            // before the already-enqueued AudioSource completion callback runs.
            await native.attempts[0].promise;
            await Promise.resolve();
            expect(source.playing).toBe(true);
            expect(started).not.toHaveBeenCalled();
            source[action]();
            await flushMicrotasks();
            expect(started).not.toHaveBeenCalled();
            expect(source.playing).toBe(false);
        },
    );

    test('AudioSource repeated plays emit STARTED only for the latest intent', async () => {
        const { source, started, native, player } = await loadedSource();
        source.play();
        source.play();
        source.play();
        expect(native.play).toHaveBeenCalledTimes(3);
        await flushMicrotasks();
        expect(isTracked(player)).toBe(true);
        native.attempts[2].resolve();
        await flushMicrotasks();
        native.attempts[0].resolve();
        native.attempts[1].reject(namedError('AbortError'));
        await flushMicrotasks();
        expect(started).toHaveBeenCalledTimes(1);
        expect(source.playing).toBe(true);
        expect(isTracked(player)).toBe(true);
    });

    test('AudioSource natural ended before fulfilment emits ENDED but never stale STARTED, then replays', async () => {
        const { source, started, ended, native, player } = await loadedSource();
        source.play();
        native.end();
        native.attempts[0].resolve();
        await flushMicrotasks();
        expect(ended).toHaveBeenCalledTimes(1);
        expect(started).not.toHaveBeenCalled();
        expect(source.state).toBe(AudioState.INIT);
        expect(isTracked(player)).toBe(false);
        source.play();
        native.attempts[1].resolve();
        await flushMicrotasks();
        expect(started).toHaveBeenCalledTimes(1);
        expect(source.playing).toBe(true);
    });

    test('A/B/A loads accept only the last request even when the same clip object returns', async () => {
        const requests: ReturnType<typeof deferred<AudioPlayer>>[] = [];
        jest.spyOn(AudioPlayer, 'load').mockImplementation(() => {
            const request = deferred<AudioPlayer>();
            requests.push(request);
            return request.promise;
        });
        const { source, started, loaded } = makeSource();
        const clipA = makeClip('A.mp3');
        source.clip = clipA;
        source.clip = makeClip('B.mp3');
        source.clip = clipA;
        source.play();
        const firstA = makePlayer();
        const middleB = makePlayer();
        const lastA = makePlayer();
        requests[0].resolve(firstA.player);
        await flushMicrotasks();
        expect(firstA.native.listenerCount('ended')).toBe(0);
        expect(firstA.native.play).not.toHaveBeenCalled();
        expect(loaded).not.toHaveBeenCalled();
        requests[2].resolve(lastA.player);
        await flushMicrotasks();
        expect(lastA.native.play).toHaveBeenCalledTimes(1);
        lastA.native.attempts[0].resolve();
        await flushMicrotasks();
        requests[1].resolve(middleB.player);
        await flushMicrotasks();
        expect(middleB.native.listenerCount('ended')).toBe(0);
        expect((source as any)._player).toBe(lastA.player);
        expect(loaded).toHaveBeenCalledTimes(1);
        expect(started).toHaveBeenCalledTimes(1);
        expect(source.playing).toBe(true);
    });

    test('destroy during load discards the resolved player and all queued playback', async () => {
        const request = deferred<AudioPlayer>();
        jest.spyOn(AudioPlayer, 'load').mockReturnValue(request.promise);
        const { source, started, loaded } = makeSource();
        source.clip = makeClip('pending.mp3');
        source.play();
        source.onDestroy();
        const late = makePlayer();
        request.resolve(late.player);
        await flushMicrotasks();
        expect(late.native.listenerCount('ended')).toBe(0);
        expect(late.native.paused).toBe(true);
        expect(late.native.currentTime).toBe(0);
        expect(late.native.play).not.toHaveBeenCalled();
        expect((source as any)._player).toBeNull();
        expect(loaded).not.toHaveBeenCalled();
        expect(started).not.toHaveBeenCalled();
        expect(isTracked(late.player)).toBe(false);
    });

    test('destroy during one-shot load prevents late playback and manager registration', async () => {
        const request = deferred<OneShotAudio>();
        jest.spyOn(AudioPlayer, 'loadOneShotAudio').mockReturnValue(request.promise);
        const { source, started } = makeSource();
        source.playOneShot(makeClip('one-shot.mp3'));
        source.onDestroy();
        const native = new NativeAudioDouble();
        const oneShot = new OneShotAudio(new OneShotAudioDOM(native as unknown as HTMLAudioElement, 1));
        request.resolve(oneShot);
        await flushMicrotasks();
        expect(native.play).not.toHaveBeenCalled();
        expect(native.paused).toBe(true);
        expect(native.currentTime).toBe(0);
        expect(started).not.toHaveBeenCalled();
        expect((audioManager as any)._oneShotAudioInfoList.some((entry: any) => entry.audio === oneShot)).toBe(false);
    });

    test('clip replacement immediately silences old audio; old rejection cannot remove the new player', async () => {
        const { source, started, native, player: oldPlayer } = await loadedSource();
        source.play();
        const next = deferred<AudioPlayer>();
        jest.mocked(AudioPlayer.load).mockReturnValue(next.promise);
        source.clip = makeClip('replacement.mp3');
        expect(native.paused).toBe(true);
        expect(native.currentTime).toBe(0);
        expect(native.listenerCount('ended')).toBe(0);
        expect(isTracked(oldPlayer)).toBe(false);
        source.play();
        const replacement = makePlayer();
        next.resolve(replacement.player);
        await flushMicrotasks();
        expect(replacement.native.play).toHaveBeenCalledTimes(1);
        replacement.native.attempts[0].resolve();
        await flushMicrotasks();
        native.attempts[0].reject(namedError('AbortError'));
        await flushMicrotasks();
        expect((source as any)._player).toBe(replacement.player);
        expect(isTracked(replacement.player)).toBe(true);
        expect(started).toHaveBeenCalledTimes(1);
        expect(source.playing).toBe(true);
    });

    test('stopAsync settles after native stop without waiting for pending play; repeated stops are idempotent', async () => {
        const { source, started, native } = await loadedSource();
        source.play();
        const first = observe(source.stopAsync());
        const second = observe(source.stopAsync());
        expect(native.paused).toBe(true);
        expect(native.currentTime).toBe(0);
        await flushMicrotasks();
        expect(first.status).toBe('fulfilled');
        expect(second.status).toBe('fulfilled');
        native.attempts[0].resolve();
        await flushMicrotasks();
        expect(started).not.toHaveBeenCalled();
        expect(source.state).toBe(AudioState.STOPPED);
    });

    test('stopAsync during load cancels preceding play without waiting for load or initiating native play', async () => {
        const request = deferred<AudioPlayer>();
        jest.spyOn(AudioPlayer, 'load').mockReturnValue(request.promise);
        const { source, started } = makeSource();
        source.clip = makeClip('pending.mp3');
        source.play();
        const stopped = observe(source.stopAsync());
        await flushMicrotasks();
        expect(stopped.status).toBe('fulfilled');
        expect(source.currentTime).toBe(0);
        const late = makePlayer();
        request.resolve(late.player);
        await flushMicrotasks();
        expect(late.native.play).not.toHaveBeenCalled();
        expect(started).not.toHaveBeenCalled();
        source.play();
        late.native.attempts[0].resolve();
        await flushMicrotasks();
        expect(started).toHaveBeenCalledTimes(1);
    });

    test('an older stopAsync completion does not cancel or certify a later play as stopped', async () => {
        const { source, started, native } = await loadedSource();
        source.play();
        const stopped = source.stopAsync();
        source.play();
        native.attempts[1].resolve();
        await stopped;
        await flushMicrotasks();
        native.attempts[0].reject(namedError('AbortError'));
        await flushMicrotasks();
        expect(source.playing).toBe(true);
        expect(native.paused).toBe(false);
        expect(started).toHaveBeenCalledTimes(1);
    });

    test('stop remains void; stopAsync without a clip or after destruction resolves', async () => {
        const { source } = makeSource();
        expect(source.stop()).toBeUndefined();
        await expect(source.stopAsync()).resolves.toBeUndefined();
        source.onDestroy();
        await expect(source.stopAsync()).resolves.toBeUndefined();
    });

    test('stopAsync preserves backend rejection for its caller', async () => {
        const { source, player } = await loadedSource();
        const failure = new Error('backend stop failure');
        jest.spyOn(player, 'stop').mockImplementation(() => Promise.reject(failure));
        await expect(source.stopAsync()).rejects.toBe(failure);
    });

    test('stopAsync rejects unsupported loaded backend without cancelling its play; legacy stop still delegates', async () => {
        const { source, player } = await loadedSource();
        const backendType = jest.spyOn(player, 'type', 'get').mockReturnValue(AudioType.WEB_AUDIO);
        const stop = jest.spyOn(player, 'stop').mockImplementation(() => Promise.resolve());
        const generation = (source as any)._playGeneration;
        await expect(source.stopAsync()).rejects.toMatchObject({ code: 'AUDIO_STOP_ASYNC_UNSUPPORTED' });
        expect(stop).not.toHaveBeenCalled();
        expect((source as any)._playGeneration).toBe(generation);
        expect(source.stop()).toBeUndefined();
        expect(stop).toHaveBeenCalledTimes(1);
        backendType.mockRestore();
    });

    test('stopAsync rejects an unloaded non-DOM request without deleting its queued play', async () => {
        const request = deferred<AudioPlayer>();
        jest.spyOn(AudioPlayer, 'load').mockReturnValue(request.promise);
        const { source } = makeSource();
        const clip = makeClip('web-request.mp3');
        clip._nativeAsset = { player: null, url: 'web-request.mp3', duration: 20, type: AudioType.WEB_AUDIO };
        source.clip = clip;
        source.play();
        const generation = (source as any)._playGeneration;
        await expect(source.stopAsync()).rejects.toMatchObject({ code: 'AUDIO_STOP_ASYNC_UNSUPPORTED' });
        expect((source as any)._playGeneration).toBe(generation);
        const fallback = makePlayer();
        request.resolve(fallback.player);
        await flushMicrotasks();
        expect(fallback.native.play).toHaveBeenCalledTimes(1);
        await source.stopAsync(); // Actual loaded DOM fallback is now supported.
        expect(fallback.native.paused).toBe(true);
    });

    test('an invalid clip does not destroy the existing valid player', async () => {
        const { source, native, player } = await loadedSource();
        source.play();
        native.attempts[0].resolve();
        await flushMicrotasks();
        const error = jest.spyOn(console, 'error').mockImplementation(() => {});
        source.clip = new AudioClip('invalid');
        expect(error).toHaveBeenCalledWith('Invalid audio clip');
        expect((source as any)._player).toBe(player);
        expect(source.playing).toBe(true);
        expect(native.paused).toBe(false);
        expect(native.removeAttribute).not.toHaveBeenCalled();
        expect(isTracked(player)).toBe(true);
    });

    test('request EOS before startup acknowledges ended without inventing started; replay owns a new token', async () => {
        const { source, native, started } = await loadedSource();
        const first = source.playRequest();
        native.end();
        expect(await first.result).toMatchObject({ id: first.id, status: 'ended' });
        expect(await first.started).toMatchObject({ status: 'ended' });
        native.attempts[0].resolve();
        await flushMicrotasks();
        expect(started).not.toHaveBeenCalled();
        const second = source.playRequest();
        first.cancel(); // a retired token cannot stop the new request
        native.attempts[1].resolve();
        await flushMicrotasks();
        expect(await second.started).toMatchObject({ id: second.id, status: 'started' });
        expect(second.id).not.toBe(first.id);
        native.end();
        expect(await second.result).toMatchObject({ status: 'ended' });
    });

    test('request replacement, late failure, clip change and cancellation never cross tokens', async () => {
        const { source, native } = await loadedSource();
        const first = source.playRequest();
        const second = source.playRequest();
        expect(await first.result).toMatchObject({ status: 'cancelled' });
        native.attempts[0].reject(new Error('old request'));
        native.attempts[1].resolve();
        await flushMicrotasks();
        expect(await second.started).toMatchObject({ status: 'started' });
        source.clip = makeClip('replacement.wav');
        expect(await second.result).toMatchObject({ status: 'cancelled' });
        await flushMicrotasks();
        const third = source.playRequest();
        third.cancel();
        expect(await third.result).toMatchObject({ id: third.id, status: 'cancelled' });
    });

    test('native playback rejection becomes a request failure, not a false start', async () => {
        const { source, native, started } = await loadedSource();
        const request = source.playRequest();
        native.attempts[0].reject(namedError('NotSupportedError'));
        expect(await request.result).toMatchObject({ status: 'failed' });
        expect(await request.started).toMatchObject({ status: 'failed' });
        expect(started).not.toHaveBeenCalled();
    });

    test('a manager-level wrapped player stop retires a pending request without waiting for native play acknowledgement', async () => {
        const { source, player, native, started } = await loadedSource();
        const request = source.playRequest();
        await player.stop(); // same native wrapper boundary used by AudioManager eviction
        audioManager.removePlaying(player);
        expect(await request.result).toMatchObject({ id: request.id, status: 'cancelled' });
        native.attempts[0].resolve();
        await flushMicrotasks();
        expect(started).not.toHaveBeenCalled();
    });

    test('a tagged end from an older play cannot finish a newer request on the same player', async () => {
        const { source, native, dom } = await loadedSource();
        const first = source.playRequest();
        native.attempts[0].resolve();
        await flushMicrotasks();
        const previousGeneration = (source as any)._playGeneration;
        const latest = source.playRequest();
        native.attempts[1].resolve();
        await flushMicrotasks();
        expect(await first.result).toMatchObject({ status: 'cancelled' });
        let ended = false;
        latest.result.then(() => {
            ended = true;
        });
        dom._eventTarget.emit(AudioEvent.ENDED, previousGeneration); // labelled stale metadata negative control
        await flushMicrotasks();
        expect(ended).toBe(false);
        native.end();
        expect(await latest.result).toMatchObject({ id: latest.id, status: 'ended' });
    });

    test('token cancellation before a Web-mode load prevents queued playback and permits explicit replay', async () => {
        const loading = deferred<AudioPlayer>();
        jest.spyOn(AudioPlayer, 'load').mockReturnValue(loading.promise);
        const { source, started } = makeSource();
        const clip = makeClip('delayed-web.wav');
        clip._nativeAsset = { player: null, url: 'delayed-web.wav', duration: 20, type: AudioType.WEB_AUDIO };
        source.clip = clip;
        const request = source.playRequest();
        request.cancel();
        expect(await request.result).toMatchObject({ status: 'cancelled' });
        const fallback = makePlayer();
        loading.resolve(fallback.player);
        await flushMicrotasks();
        expect(fallback.native.play).not.toHaveBeenCalled();
        expect(started).not.toHaveBeenCalled();
        const replay = source.playRequest();
        fallback.native.attempts[0].resolve();
        await flushMicrotasks();
        expect(await replay.started).toMatchObject({ id: replay.id, status: 'started' });
        request.cancel();
        expect(fallback.native.paused).toBe(false);
        fallback.native.end();
        expect(await replay.result).toMatchObject({ status: 'ended' });
    });

    test('new requests supersede pre-load PLAY/STOP controls without cancelling the newest request', async () => {
        const loading = deferred<AudioPlayer>();
        jest.spyOn(AudioPlayer, 'load').mockReturnValue(loading.promise);
        const { source } = makeSource();
        const clip = makeClip('queued.wav');
        clip._nativeAsset = { player: null, url: 'queued.wav', duration: 20, type: AudioType.WEB_AUDIO };
        source.clip = clip;
        const first = source.playRequest();
        const second = source.playRequest();
        second.cancel();
        const latest = source.playRequest();
        expect(await first.result).toMatchObject({ status: 'cancelled' });
        expect(await second.result).toMatchObject({ status: 'cancelled' });
        const fallback = makePlayer();
        loading.resolve(fallback.player);
        await flushMicrotasks();
        expect(fallback.native.play).toHaveBeenCalledTimes(1);
        fallback.native.attempts[0].resolve();
        await flushMicrotasks();
        expect(await latest.started).toMatchObject({ id: latest.id, status: 'started' });
        first.cancel();
        second.cancel();
        expect(fallback.native.paused).toBe(false);
        fallback.native.end();
        expect(await latest.result).toMatchObject({ status: 'ended' });
    });

    test.each(['pause', 'stop'] as const)('%s retires a token without a delayed pre-load PLAY', async (control) => {
        const loading = deferred<AudioPlayer>();
        jest.spyOn(AudioPlayer, 'load').mockReturnValue(loading.promise);
        const { source } = makeSource();
        const clip = makeClip('retired.wav');
        clip._nativeAsset = { player: null, url: 'retired.wav', duration: 20, type: AudioType.WEB_AUDIO };
        source.clip = clip;
        const request = source.playRequest();
        source[control]();
        expect(await request.result).toMatchObject({ status: 'cancelled' });
        const fallback = makePlayer();
        loading.resolve(fallback.player);
        await flushMicrotasks();
        expect(fallback.native.play).not.toHaveBeenCalled();
    });

    test('an invalid unloaded clip gives the request a failure terminal instead of an unbounded queue', async () => {
        const error = jest.spyOn(console, 'error').mockImplementation(() => {});
        const { source } = makeSource();
        source.clip = new AudioClip('invalid');
        expect(error).toHaveBeenCalled();
        const request = source.playRequest();
        expect(await request.result).toMatchObject({ id: request.id, status: 'failed' });
    });

    test('destroy aborts the transport for every owned pending one-shot load', async () => {
        const signals: AbortSignal[] = [];
        jest.spyOn(AudioPlayer, 'loadOneShotAudio').mockImplementation((_url, _volume, opts) => {
            signals.push(opts!.signal!);
            return new Promise((_resolve, reject) =>
                opts!.signal!.addEventListener('abort', () => reject(namedError('AbortError'))),
            );
        });
        const { source } = makeSource();
        source.playOneShot(makeClip('one.wav'));
        source.playOneShot(makeClip('two.wav'));
        expect(signals).toHaveLength(2);
        source.onDestroy();
        await flushMicrotasks();
        expect(signals.every((signal) => signal.aborted)).toBe(true);
        expect((source as any)._oneShotLoads.size).toBe(0);
    });

    test.each(['pause', 'stop'] as const)(
        'Windows WebKit pending %s retires the native source and restores it only on replay',
        async (action) => {
            const descriptor = Object.getOwnPropertyDescriptor(systemInfo, 'browserType');
            Object.defineProperty(systemInfo, 'browserType', { value: BrowserType.SAFARI, configurable: true });
            jest.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
            try {
                const { dom, native } = makePlayer();
                const url = native.src;
                const pending = observe(dom.play());
                await dom[action]();
                await flushMicrotasks();
                expect(pending.status).toBe('rejected');
                expect(native.src).toBe('');
                expect(native.load).toHaveBeenCalledTimes(1);
                native.duration = NaN; // unloaded media has no duration; retain real pre-stop metadata
                expect(dom.src).toBe(url);
                expect(dom.duration).toBe(20);
                await dom.seek(3);
                const resumed = observe(dom.play());
                expect(native.src).toBe(url);
                expect(native.currentTime).toBe(3);
                native.attempts[0].resolve();
                await flushMicrotasks();
                expect(resumed.status).toBe('pending');
                native.attempts[1].resolve();
                await flushMicrotasks();
                expect(resumed.status).toBe('fulfilled');
            } finally {
                if (descriptor) Object.defineProperty(systemInfo, 'browserType', descriptor);
                else delete (systemInfo as any).browserType;
            }
        },
    );
});
