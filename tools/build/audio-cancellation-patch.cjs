// Narrow DOM-audio lifecycle adaptation, applied to the hash-checked frozen PAL source.
// The shared operation queue and WebAudio/video consumers deliberately keep their contract.
const { replaceExactly } = require('./startup-binding-patch.cjs');

exports.patchAudioCancellation = (source, file) => {
    if (file !== 'pal/audio/web/player-dom.ts') return source;
    const replace = (before, after, count = 1) => {
        source = replaceExactly(source, before, after, 'audio cancellation: ' + before.slice(0, 60), count);
    };
    const section = (start, end, replacement) => {
        if (source.split(start).length !== 2 || source.split(end).length !== 2)
            throw Error('PAL audio cancellation section anchor drift: ' + start);
        const first = source.indexOf(start);
        const last = source.indexOf(end, first);
        if (last <= first) throw Error('PAL audio cancellation section order drift: ' + start);
        replace(source.slice(first, last), replacement);
    };
    replace(
        "import { enqueueOperation, OperationInfo, OperationQueueable } from '../operation-queue';",
        "import { OperationInfo, OperationQueueable } from '../operation-queue';",
    );
    section('function ensurePlaying (', 'export class OneShotAudioDOM', `function playbackCancelled (): Error {
    const error = new Error('Audio playback was cancelled.');
    error.name = 'AbortError';
    return error;
}

interface PlaybackAttempt {
    promise: Promise<void>;
    cancel: () => void;
}

// Every native Promise is observed, including after cancellation. Only an autoplay-policy
// rejection can wait for a gesture; pause-induced AbortError must never resurrect playback.
function ensurePlaying (domAudio: HTMLAudioElement): PlaybackAttempt {
    let settled = false;
    let invoking = false;
    let canvas: HTMLCanvasElement | null = null;
    let resolve: () => void;
    let reject: (error: unknown) => void;
    const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    const cleanup = (): void => {
        canvas?.removeEventListener('touchend', attempt, { capture: true });
        canvas?.removeEventListener('mouseup', attempt, { capture: true });
        canvas = null;
    };
    const finish = (error?: unknown, failed = false): void => {
        if (settled) return;
        settled = true;
        cleanup();
        if (failed) reject(error);
        else resolve();
    };
    const failed = (error: any): void => {
        invoking = false;
        if (settled) return;
        if (error?.name !== 'NotAllowedError') {
            finish(error, true);
            return;
        }
        if (!canvas) {
            canvas = ((globalThis as any).__CC_CANVAS__ || document.getElementById('GameCanvas')) as HTMLCanvasElement;
            if (!canvas) { finish(error, true); return; }
            canvas.addEventListener('touchend', attempt, { capture: true });
            canvas.addEventListener('mouseup', attempt, { capture: true });
        }
    };
    const attempt = (): void => {
        if (settled || invoking) return;
        invoking = true;
        try {
            // Promise.resolve also supports browsers whose native play() returns void.
            Promise.resolve(domAudio.play()).then(() => finish(), failed);
        } catch (error) {
            failed(error);
        }
    };
    // The PAL API is also used fire-and-forget. Observing this Promise prevents an
    // unhandled cancellation without converting rejection into apparent success.
    promise.catch(() => {});
    attempt();
    return { promise, cancel: () => finish(playbackCancelled(), true) };
}

`);
    replace(
        '    private _onPlayCb?: () => void;',
        '    private _onPlayCb?: () => void;\n    private _playAttempt: PlaybackAttempt | null = null;\n    private _playGeneration = 0;',
    );
    replace(
        '    private _onEndCb?: () => void;',
        `    private _onEndCb?: () => void;
    private _playRequested = false;
    private _onNativeEnded = (): void => {
        if (!this._playRequested || !this._domAudio.ended) return;
        this._playRequested = false;
        ++this._playGeneration;
        this._playAttempt?.cancel();
        this._playAttempt = null;
        this._onEndCb?.();
    };`,
    );
    replace("this._domAudio.removeEventListener('ended', this._onEndCb);", "this._domAudio.removeEventListener('ended', this._onNativeEnded);");
    replace("this._domAudio.addEventListener('ended', cb);", "this._domAudio.addEventListener('ended', this._onNativeEnded);");
    section('    public play (): void {', 'export class AudioPlayerDOM', `    public play (): void {
        this._playAttempt?.cancel();
        const generation = ++this._playGeneration;
        this._playRequested = true;
        const attempt = this._playAttempt = ensurePlaying(this._domAudio);
        attempt.promise.then(() => {
            if (generation === this._playGeneration && !this._domAudio.ended) this.onPlay?.();
        }).catch(() => {
            if (generation === this._playGeneration) this._playRequested = false;
        });
    }
    public stop (): void {
        ++this._playGeneration;
        this._playRequested = false;
        this._playAttempt?.cancel();
        this._playAttempt = null;
        this._domAudio.pause();
        this._domAudio.currentTime = 0;
    }
}

`);
    replace(
        '    private _onEnded: () => void;',
        `    private _onEnded: () => void;
    private _playAttempt: PlaybackAttempt | null = null;
    private _playGeneration = 0;
    private _playRequested = false;`,
    );
    replace(
        `        this._onEnded = (): void => {
            this.seek(0).catch((e) => {});
            this._state = AudioState.INIT;
            this._eventTarget.emit(AudioEvent.ENDED);
        };`,
        `        this._onEnded = (): void => {
            // An already-queued ended event from a stopped/restarted element is stale.
            if (!this._domAudio?.ended || !this._playRequested) return;
            this._cancelPlayback();
            this._domAudio.currentTime = 0;
            this._state = AudioState.INIT;
            this._eventTarget.emit(AudioEvent.ENDED);
        };`,
    );
    section('    destroy (): void {', '    static load (url:', `    private _cancelPlayback (): void {
        ++this._playGeneration;
        this._playRequested = false;
        this._playAttempt?.cancel();
        this._playAttempt = null;
    }

    destroy (): void {
        this._cancelPlayback();
        game.off(Game.EVENT_PAUSE, this._onInterruptedBegin, this);
        game.off(Game.EVENT_RESUME, this._onInterruptedEnd, this);
        const audio = this._domAudio;
        if (!audio) return;
        audio.removeEventListener('ended', this._onEnded);
        audio.pause();
        audio.currentTime = 0;
        audio.removeAttribute('src');
        audio.load();
        this._state = AudioState.STOPPED;
        this._eventTarget.off(AudioEvent.ENDED);
        this._eventTarget.off(AudioEvent.INTERRUPTION_BEGIN);
        this._eventTarget.off(AudioEvent.INTERRUPTION_END);
        this._domAudio = null as any;
    }
`);
    section('    private _onInterruptedBegin ():', '    get src ():', `    private _onInterruptedBegin (): void {
        if (this._playRequested || this._state === AudioState.PLAYING) {
            // pause() is synchronous at the native boundary, even during pending play.
            this.pause().catch(() => {});
            this._state = AudioState.INTERRUPTED;
            this._eventTarget.emit(AudioEvent.INTERRUPTION_BEGIN);
        }
    }
    private _onInterruptedEnd (): void {
        if (this._state === AudioState.INTERRUPTED) {
            const result = this.play();
            const generation = this._playGeneration;
            result.then(() => {
                if (generation === this._playGeneration && this._state === AudioState.PLAYING)
                    this._eventTarget.emit(AudioEvent.INTERRUPTION_END);
            }).catch(() => {});
        }
    }

`);
    section('    @enqueueOperation\n    seek (', '    onInterruptionBegin (', `    // DOM controls take effect immediately. A native play acknowledgement is not a
    // serialisation barrier: pause/stop/destroy must be able to cancel it.
    seek (time: number): Promise<void> {
        if (this._domAudio) this._domAudio.currentTime = clamp(time, 0, this.duration);
        return Promise.resolve();
    }

    play (): Promise<void> {
        this._cancelPlayback();
        const audio = this._domAudio;
        if (!audio) {
            const cancelled = Promise.reject<void>(playbackCancelled());
            cancelled.catch(() => {});
            return cancelled;
        }
        const generation = this._playGeneration;
        this._playRequested = true;
        const attempt = this._playAttempt = ensurePlaying(audio);
        const result = attempt.promise.then(() => {
            if (generation !== this._playGeneration || audio !== this._domAudio) throw playbackCancelled();
            // Native play may resolve only after EOS. Never restore PLAYING after ENDED.
            if (audio.ended) { this._onEnded(); throw playbackCancelled(); }
            this._state = AudioState.PLAYING;
        }, (error) => {
            if (generation === this._playGeneration) this._playRequested = false;
            throw error;
        });
        result.catch(() => {});
        return result;
    }

    pause (): Promise<void> {
        this._cancelPlayback();
        this._domAudio?.pause();
        this._state = AudioState.PAUSED;
        return Promise.resolve();
    }

    stop (): Promise<void> {
        this._cancelPlayback();
        if (this._domAudio) {
            this._domAudio.pause();
            this._domAudio.currentTime = 0;
        }
        this._state = AudioState.STOPPED;
        return Promise.resolve();
    }

`);
    return source;
};
