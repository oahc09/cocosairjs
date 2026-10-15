/*
 Copyright (c) 2022-2023 Xiamen Yaji Software Co., Ltd.

 https://www.cocos.com/

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 of the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/
import { systemInfo } from 'pal/system-info';
import { AudioEvent, AudioState, AudioType } from '../type';
import { EventTarget } from '../../../cocos/core/event';
import { clamp, clamp01 } from '../../../cocos/core';
import { BrowserType, OS } from '../../system-info/enum-type';
import { Game, game } from '../../../cocos/game';
function playbackCancelled() {
    const error = new Error('Audio playback was cancelled.');
    error.name = 'AbortError';
    return error;
}
// Every native Promise is observed, including after cancellation. Only an autoplay-policy
// rejection can wait for a gesture; pause-induced AbortError must never resurrect playback.
function ensurePlaying(domAudio) {
    let settled = false;
    let invoking = false;
    let canvas = null;
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    const cleanup = () => {
        canvas?.removeEventListener('touchend', attempt, { capture: true });
        canvas?.removeEventListener('mouseup', attempt, { capture: true });
        canvas = null;
    };
    const finish = (error, failed = false) => {
        if (settled)
            return;
        settled = true;
        cleanup();
        if (failed)
            reject(error);
        else
            resolve();
    };
    const failed = (error) => {
        invoking = false;
        if (settled)
            return;
        if (error?.name !== 'NotAllowedError') {
            finish(error, true);
            return;
        }
        if (!canvas) {
            canvas = (globalThis.__CC_CANVAS__ || document.getElementById('GameCanvas'));
            if (!canvas) {
                finish(error, true);
                return;
            }
            canvas.addEventListener('touchend', attempt, { capture: true });
            canvas.addEventListener('mouseup', attempt, { capture: true });
        }
    };
    const attempt = () => {
        if (settled || invoking)
            return;
        invoking = true;
        try {
            // Promise.resolve also supports browsers whose native play() returns void.
            Promise.resolve(domAudio.play()).then(() => finish(), failed);
        }
        catch (error) {
            failed(error);
        }
    };
    // The PAL API is also used fire-and-forget. Observing this Promise prevents an
    // unhandled cancellation without converting rejection into apparent success.
    promise.catch(() => { });
    attempt();
    return { promise, cancel: () => finish(playbackCancelled(), true) };
}
export class OneShotAudioDOM {
    get onPlay() {
        return this._onPlayCb;
    }
    set onPlay(cb) {
        this._onPlayCb = cb;
    }
    get onEnd() {
        return this._onEndCb;
    }
    set onEnd(cb) {
        if (this._onEndCb) {
            this._domAudio.removeEventListener('ended', this._onNativeEnded);
        }
        this._onEndCb = cb;
        if (cb) {
            this._domAudio.addEventListener('ended', this._onNativeEnded);
        }
    }
    constructor(nativeAudio, volume) {
        this._playAttempt = null;
        this._playGeneration = 0;
        this._playRequested = false;
        this._onNativeEnded = () => {
            if (!this._playRequested || !this._domAudio.ended)
                return;
            this._playRequested = false;
            ++this._playGeneration;
            this._playAttempt?.cancel();
            this._playAttempt = null;
            this._onEndCb?.();
        };
        this._domAudio = nativeAudio;
        nativeAudio.volume = volume;
    }
    play() {
        this._playAttempt?.cancel();
        const generation = ++this._playGeneration;
        this._playRequested = true;
        const attempt = this._playAttempt = ensurePlaying(this._domAudio);
        attempt.promise.then(() => {
            if (generation === this._playGeneration && !this._domAudio.ended)
                this.onPlay?.();
        }).catch(() => {
            if (generation === this._playGeneration)
                this._playRequested = false;
        });
    }
    stop() {
        ++this._playGeneration;
        this._playRequested = false;
        this._playAttempt?.cancel();
        this._playAttempt = null;
        this._domAudio.pause();
        this._domAudio.currentTime = 0;
    }
}
export class AudioPlayerDOM {
    constructor(nativeAudio) {
        this._state = AudioState.INIT;
        this._playAttempt = null;
        this._playGeneration = 0;
        this._playRequested = false;
        /**
         * @deprecated since v3.5.0, this is an engine private interface that will be removed in the future.
         */
        this._eventTarget = new EventTarget();
        /**
         * @deprecated since v3.5.0, this is an engine private interface that will be removed in the future.
         */
        this._operationQueue = [];
        this._domAudio = nativeAudio;
        // event
        game.on(Game.EVENT_PAUSE, this._onInterruptedBegin, this);
        game.on(Game.EVENT_RESUME, this._onInterruptedEnd, this);
        this._onEnded = () => {
            // An already-queued ended event from a stopped/restarted element is stale.
            if (!this._domAudio?.ended || !this._playRequested)
                return;
            this._cancelPlayback();
            this._domAudio.currentTime = 0;
            this._state = AudioState.INIT;
            this._eventTarget.emit(AudioEvent.ENDED);
        };
        this._domAudio.addEventListener('ended', this._onEnded);
    }
    _cancelPlayback() {
        ++this._playGeneration;
        this._playRequested = false;
        this._playAttempt?.cancel();
        this._playAttempt = null;
    }
    destroy() {
        this._cancelPlayback();
        game.off(Game.EVENT_PAUSE, this._onInterruptedBegin, this);
        game.off(Game.EVENT_RESUME, this._onInterruptedEnd, this);
        const audio = this._domAudio;
        if (!audio)
            return;
        audio.removeEventListener('ended', this._onEnded);
        audio.pause();
        audio.currentTime = 0;
        audio.removeAttribute('src');
        audio.load();
        this._state = AudioState.STOPPED;
        this._eventTarget.off(AudioEvent.ENDED);
        this._eventTarget.off(AudioEvent.INTERRUPTION_BEGIN);
        this._eventTarget.off(AudioEvent.INTERRUPTION_END);
        this._domAudio = null;
    }
    static load(url) {
        return new Promise((resolve, reject) => {
            AudioPlayerDOM.loadNative(url).then((domAudio) => {
                resolve(new AudioPlayerDOM(domAudio));
            }).catch(reject);
        });
    }
    static loadNative(url) {
        return new Promise((resolve, reject) => {
            const domAudio = document.createElement('audio');
            let loadedEvent = 'canplaythrough';
            if (systemInfo.os === OS.IOS) {
                // iOS no event that used to parse completed callback
                // this time is not complete, can not play
                loadedEvent = 'loadedmetadata';
            }
            else if (systemInfo.browserType === BrowserType.FIREFOX) {
                loadedEvent = 'canplay';
            }
            const timer = setTimeout(() => {
                if (domAudio.readyState === 0) {
                    failure();
                }
                else {
                    success();
                }
            }, 8000);
            const clearEvent = () => {
                clearTimeout(timer);
                domAudio.removeEventListener(loadedEvent, success, false);
                domAudio.removeEventListener('error', failure, false);
            };
            const success = () => {
                clearEvent();
                resolve(domAudio);
            };
            const failure = () => {
                clearEvent();
                const message = `load audio failure - ${url}`;
                reject(new Error(message));
            };
            domAudio.addEventListener(loadedEvent, success, false);
            domAudio.addEventListener('error', failure, false);
            domAudio.src = url;
        });
    }
    static loadOneShotAudio(url, volume) {
        return new Promise((resolve, reject) => {
            AudioPlayerDOM.loadNative(url).then((domAudio) => {
                // HACK: AudioPlayer should be a friend class in OneShotAudio
                const oneShotAudio = new OneShotAudioDOM(domAudio, volume);
                resolve(oneShotAudio);
            }).catch(reject);
        });
    }
    _onInterruptedBegin() {
        if (this._playRequested || this._state === AudioState.PLAYING) {
            // pause() is synchronous at the native boundary, even during pending play.
            this.pause().catch(() => { });
            this._state = AudioState.INTERRUPTED;
            this._eventTarget.emit(AudioEvent.INTERRUPTION_BEGIN);
        }
    }
    _onInterruptedEnd() {
        if (this._state === AudioState.INTERRUPTED) {
            const result = this.play();
            const generation = this._playGeneration;
            result.then(() => {
                if (generation === this._playGeneration && this._state === AudioState.PLAYING)
                    this._eventTarget.emit(AudioEvent.INTERRUPTION_END);
            }).catch(() => { });
        }
    }
    get src() {
        return this._domAudio ? this._domAudio.src : '';
    }
    get type() {
        return AudioType.DOM_AUDIO;
    }
    get state() {
        return this._state;
    }
    get loop() {
        return this._domAudio.loop;
    }
    set loop(val) {
        this._domAudio.loop = val;
    }
    get volume() {
        return this._domAudio.volume;
    }
    set volume(val) {
        val = clamp01(val);
        this._domAudio.volume = val;
    }
    get duration() {
        return this._domAudio.duration;
    }
    get currentTime() {
        return this._domAudio.currentTime;
    }
    get sampleRate() {
        return 0;
    }
    getPCMData(channelIndex) {
        return undefined;
    }
    // DOM controls take effect immediately. A native play acknowledgement is not a
    // serialisation barrier: pause/stop/destroy must be able to cancel it.
    seek(time) {
        if (this._domAudio)
            this._domAudio.currentTime = clamp(time, 0, this.duration);
        return Promise.resolve();
    }
    play() {
        this._cancelPlayback();
        const audio = this._domAudio;
        if (!audio) {
            const cancelled = Promise.reject(playbackCancelled());
            cancelled.catch(() => { });
            return cancelled;
        }
        const generation = this._playGeneration;
        this._playRequested = true;
        const attempt = this._playAttempt = ensurePlaying(audio);
        const result = attempt.promise.then(() => {
            if (generation !== this._playGeneration || audio !== this._domAudio)
                throw playbackCancelled();
            // Native play may resolve only after EOS. Never restore PLAYING after ENDED.
            if (audio.ended) {
                this._onEnded();
                throw playbackCancelled();
            }
            this._state = AudioState.PLAYING;
        }, (error) => {
            if (generation === this._playGeneration)
                this._playRequested = false;
            throw error;
        });
        result.catch(() => { });
        return result;
    }
    pause() {
        this._cancelPlayback();
        this._domAudio?.pause();
        this._state = AudioState.PAUSED;
        return Promise.resolve();
    }
    stop() {
        this._cancelPlayback();
        if (this._domAudio) {
            this._domAudio.pause();
            this._domAudio.currentTime = 0;
        }
        this._state = AudioState.STOPPED;
        return Promise.resolve();
    }
    onInterruptionBegin(cb) { this._eventTarget.on(AudioEvent.INTERRUPTION_BEGIN, cb); }
    offInterruptionBegin(cb) { this._eventTarget.off(AudioEvent.INTERRUPTION_BEGIN, cb); }
    onInterruptionEnd(cb) { this._eventTarget.on(AudioEvent.INTERRUPTION_END, cb); }
    offInterruptionEnd(cb) { this._eventTarget.off(AudioEvent.INTERRUPTION_END, cb); }
    onEnded(cb) { this._eventTarget.on(AudioEvent.ENDED, cb); }
    offEnded(cb) { this._eventTarget.off(AudioEvent.ENDED, cb); }
}
