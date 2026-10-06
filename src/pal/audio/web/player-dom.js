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
var __decorate = function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { systemInfo } from 'pal/system-info';
import { AudioEvent, AudioState, AudioType } from '../type';
import { EventTarget } from '../../../cocos/core/event';
import { clamp, clamp01 } from '../../../cocos/core';
import { enqueueOperation } from '../operation-queue';
import { BrowserType, OS } from '../../system-info/enum-type';
import { Game, game } from '../../../cocos/game';
function ensurePlaying(domAudio) {
    return new Promise((resolve) => {
        const promise = domAudio.play();
        if (promise === undefined) { // Chrome50/Firefox53 below
            return resolve();
        }
        promise.then(resolve).catch(() => {
            const onGesture = () => {
                domAudio.play().then(() => {
                    // HACK NOTE: if the user slide after touch start, the context cannot be resumed correctly.
                    canvas?.removeEventListener('touchend', onGesture, { capture: true });
                    canvas?.removeEventListener('mouseup', onGesture, { capture: true });
                }).catch((e) => { });
                resolve();
            };
            const canvas = document.getElementById('GameCanvas');
            canvas?.addEventListener('touchend', onGesture, { capture: true });
            canvas?.addEventListener('mouseup', onGesture, { capture: true });
        });
        return null;
    });
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
            this._domAudio.removeEventListener('ended', this._onEndCb);
        }
        this._onEndCb = cb;
        if (cb) {
            this._domAudio.addEventListener('ended', cb);
        }
    }
    constructor(nativeAudio, volume) {
        this._domAudio = nativeAudio;
        nativeAudio.volume = volume;
    }
    play() {
        ensurePlaying(this._domAudio).then(() => {
            this.onPlay?.();
        }).catch((e) => { });
    }
    stop() {
        this._domAudio.pause();
    }
}
export class AudioPlayerDOM {
    constructor(nativeAudio) {
        this._state = AudioState.INIT;
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
            this.seek(0).catch((e) => { });
            this._state = AudioState.INIT;
            this._eventTarget.emit(AudioEvent.ENDED);
        };
        this._domAudio.addEventListener('ended', this._onEnded);
    }
    destroy() {
        game.off(Game.EVENT_PAUSE, this._onInterruptedBegin, this);
        game.off(Game.EVENT_RESUME, this._onInterruptedEnd, this);
        this._domAudio.removeEventListener('ended', this._onEnded);
        // NOTE: need to release DOM Audio instance
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
        if (this._state === AudioState.PLAYING) {
            this.pause().then(() => {
                this._state = AudioState.INTERRUPTED;
                this._eventTarget.emit(AudioEvent.INTERRUPTION_BEGIN);
            }).catch((e) => { });
        }
    }
    _onInterruptedEnd() {
        if (this._state === AudioState.INTERRUPTED) {
            this.play().then(() => {
                this._eventTarget.emit(AudioEvent.INTERRUPTION_END);
            }).catch((e) => { });
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
    seek(time) {
        time = clamp(time, 0, this.duration);
        this._domAudio.currentTime = time;
        return Promise.resolve();
    }
    play() {
        return new Promise((resolve) => {
            ensurePlaying(this._domAudio).then(() => {
                this._state = AudioState.PLAYING;
                resolve();
            }).catch((e) => { });
        });
    }
    pause() {
        this._domAudio.pause();
        this._state = AudioState.PAUSED;
        return Promise.resolve();
    }
    stop() {
        return new Promise((resolve) => {
            this._domAudio.pause();
            this._domAudio.currentTime = 0;
            this._state = AudioState.STOPPED;
            resolve();
        });
    }
    onInterruptionBegin(cb) { this._eventTarget.on(AudioEvent.INTERRUPTION_BEGIN, cb); }
    offInterruptionBegin(cb) { this._eventTarget.off(AudioEvent.INTERRUPTION_BEGIN, cb); }
    onInterruptionEnd(cb) { this._eventTarget.on(AudioEvent.INTERRUPTION_END, cb); }
    offInterruptionEnd(cb) { this._eventTarget.off(AudioEvent.INTERRUPTION_END, cb); }
    onEnded(cb) { this._eventTarget.on(AudioEvent.ENDED, cb); }
    offEnded(cb) { this._eventTarget.off(AudioEvent.ENDED, cb); }
}
__decorate([
    enqueueOperation
], AudioPlayerDOM.prototype, "seek", null);
__decorate([
    enqueueOperation
], AudioPlayerDOM.prototype, "play", null);
__decorate([
    enqueueOperation
], AudioPlayerDOM.prototype, "pause", null);
__decorate([
    enqueueOperation
], AudioPlayerDOM.prototype, "stop", null);
