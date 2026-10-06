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
import { EDITOR_NOT_IN_PREVIEW } from 'internal:constants';
import { AudioPCMDataView, AudioEvent, AudioState, AudioType } from '../type';
import { EventTarget } from '../../../cocos/core/event';
import { clamp01 } from '../../../cocos/core';
import * as debug from '../../../cocos/core/platform/debug';
import { enqueueOperation } from '../operation-queue';
import AudioTimer from '../audio-timer';
import { audioBufferManager } from '../audio-buffer-manager';
import { Game, game } from '../../../cocos/game';
// NOTE: fix CI
const AudioContextClass = (window.AudioContext || window.webkitAudioContext || window.mozAudioContext);
const _contextRunningEvent = 'on-context-running';
export class AudioContextAgent {
    constructor() {
        this._isRunning = false;
        this._context = new (window.AudioContext || window.webkitAudioContext || window.mozAudioContext)();
        this._eventTarget = new EventTarget();
        this._context.onstatechange = () => {
            if (this._context.state === 'running') {
                this._isRunning = true;
                this._eventTarget.emit(_contextRunningEvent);
            }
            else {
                this._isRunning = false;
            }
        };
    }
    get isRunning() {
        return this._isRunning;
    }
    get currentTime() {
        return this._context.currentTime;
    }
    onceRunning(cb, target) {
        this._eventTarget.once(_contextRunningEvent, cb, target);
    }
    offRunning(cb, target) {
        this._eventTarget.off(_contextRunningEvent, cb, target);
    }
    decodeAudioData(audioData) {
        return new Promise((resolve, reject) => {
            const promise = this._context.decodeAudioData(audioData, (audioBuffer) => {
                resolve(audioBuffer);
            }, (err) => {
                // TODO: need to reject the error.
                // eslint-disable-next-line no-console
                console.error('failed to load Web Audio', err);
            });
            promise?.catch(reject); // Safari doesn't support the promise based decodeAudioData
        });
    }
    runContext() {
        return new Promise((resolve) => {
            if (this.isRunning) {
                resolve();
                return;
            }
            const context = this._context;
            if (!context.resume) {
                resolve();
                return;
            }
            // only state is suspended can involve resume function
            if (context.state === 'suspended') {
                context.resume().catch((e) => { debug.warn('runContext error', e); });
            }
            else if (context.state === 'running') {
                resolve();
                return;
            }
            // Force running audio context if state is not 'running', may be 'suspended' or 'interrupted'.
            const canvas = document.getElementById('GameCanvas');
            // HACK NOTE: if the user slide after touch start, the context cannot be resumed correctly.
            const onGesture = () => {
                context.resume().then(() => {
                    canvas?.removeEventListener('touchend', onGesture, { capture: true });
                    canvas?.removeEventListener('mouseup', onGesture, { capture: true });
                    resolve();
                }).catch((e) => { debug.warn('onGesture resume error', e); });
            };
            canvas?.addEventListener('touchend', onGesture, { capture: true });
            canvas?.addEventListener('mouseup', onGesture, { capture: true });
        });
    }
    createBufferSource(audioBuffer, loop) {
        const sourceBufferNode = this._context.createBufferSource();
        if (audioBuffer !== undefined) {
            sourceBufferNode.buffer = audioBuffer;
        }
        if (loop !== undefined) {
            sourceBufferNode.loop = loop;
        }
        return sourceBufferNode;
    }
    createGain(volume = 1) {
        const gainNode = this._context.createGain();
        this.setGainValue(gainNode, volume);
        return gainNode;
    }
    setGainValue(gain, volume) {
        if (gain.gain.setTargetAtTime) {
            try {
                gain.gain.setTargetAtTime(volume, this._context.currentTime, 0);
            }
            catch (e) {
                // Some unknown browsers may crash if timeConstant is 0
                gain.gain.setTargetAtTime(volume, this._context.currentTime, 0.01);
            }
        }
        else {
            gain.gain.value = volume;
        }
    }
    connectContext(audioNode) {
        if (!this._context) {
            return;
        }
        audioNode.connect(this._context.destination);
    }
}
AudioContextAgent.support = !!AudioContextClass;
let audioContextAgent;
if (AudioContextAgent.support) {
    audioContextAgent = new AudioContextAgent();
}
export class OneShotAudioWeb {
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
        this._onEndCb = cb;
    }
    constructor(audioBuffer, volume, url) {
        this._currentTimer = 0;
        this._duration = audioBuffer.duration;
        this._url = url;
        this._bufferSourceNode = audioContextAgent.createBufferSource(audioBuffer, false);
        const gainNode = audioContextAgent.createGain(volume);
        this._bufferSourceNode.connect(gainNode);
        audioContextAgent.connectContext(gainNode);
    }
    play() {
        if (EDITOR_NOT_IN_PREVIEW) {
            return;
        }
        this._bufferSourceNode.start();
        // audioContextAgent does exist
        audioContextAgent.runContext().then(() => {
            this.onPlay?.();
            this._currentTimer = window.setTimeout(() => {
                audioBufferManager.tryReleasingCache(this._url);
                this.onEnd?.();
            }, this._duration * 1000);
        }).catch((e) => { debug.warn('play error', e); });
    }
    stop() {
        clearTimeout(this._currentTimer);
        audioBufferManager.tryReleasingCache(this._url);
        this._bufferSourceNode.stop();
        this._bufferSourceNode.disconnect();
        this._bufferSourceNode.buffer = null;
    }
}
export class AudioPlayerWeb {
    constructor(audioBuffer, url) {
        this._currentTimer = 0;
        this._volume = 1;
        this._loop = false;
        this._state = AudioState.INIT;
        /**
         * @deprecated since v3.5.0, this is an engine private interface that will be removed in the future.
         */
        this._eventTarget = new EventTarget();
        /**
         * @deprecated since v3.5.0, this is an engine private interface that will be removed in the future.
         */
        this._operationQueue = [];
        this._audioBuffer = audioBuffer;
        this._audioTimer = new AudioTimer(audioBuffer);
        this._gainNode = audioContextAgent.createGain();
        audioContextAgent.connectContext(this._gainNode);
        this._src = url;
        // event
        game.on(Game.EVENT_PAUSE, this._onInterruptedBegin, this);
        game.on(Game.EVENT_RESUME, this._onInterruptedEnd, this);
    }
    destroy() {
        window.clearTimeout(this._currentTimer);
        this._audioTimer.destroy();
        if (this._audioBuffer) {
            // NOTE: need to release AudioBuffer instance
            this._audioBuffer = null;
        }
        audioBufferManager.tryReleasingCache(this._src);
        game.off(Game.EVENT_PAUSE, this._onInterruptedBegin, this);
        game.off(Game.EVENT_RESUME, this._onInterruptedEnd, this);
        this.offRunning();
    }
    static load(url) {
        return new Promise((resolve, reject) => {
            AudioPlayerWeb.loadNative(url).then((audioBuffer) => {
                resolve(new AudioPlayerWeb(audioBuffer, url));
            }).catch(reject);
        });
    }
    static loadNative(url) {
        return new Promise((resolve, reject) => {
            const cachedAudioBuffer = audioBufferManager.getCache(url);
            if (cachedAudioBuffer) {
                audioBufferManager.retainCache(url);
                resolve(cachedAudioBuffer);
                return;
            }
            const xhr = new XMLHttpRequest();
            const errInfo = `load audio failed: ${url}, status: `;
            xhr.open('GET', url, true);
            xhr.responseType = 'arraybuffer';
            xhr.onload = () => {
                if (xhr.status === 200 || xhr.status === 0) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                    audioContextAgent.decodeAudioData(xhr.response).then((decodedAudioBuffer) => {
                        audioBufferManager.addCache(url, decodedAudioBuffer);
                        resolve(decodedAudioBuffer);
                    }).catch((e) => { debug.warn('loadNative error', url, e); });
                }
                else {
                    reject(new Error(`${errInfo}${xhr.status}(no response)`));
                }
            };
            xhr.onerror = () => { reject(new Error(`${errInfo}${xhr.status}(error)`)); };
            xhr.ontimeout = () => { reject(new Error(`${errInfo}${xhr.status}(time out)`)); };
            xhr.onabort = () => { reject(new Error(`${errInfo}${xhr.status}(abort)`)); };
            xhr.send(null);
        });
    }
    static loadOneShotAudio(url, volume) {
        return new Promise((resolve, reject) => {
            AudioPlayerWeb.loadNative(url).then((audioBuffer) => {
                // HACK: AudioPlayer should be a friend class in OneShotAudio
                const oneShotAudio = new OneShotAudioWeb(audioBuffer, volume, url);
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                resolve(oneShotAudio);
            }).catch(reject);
        });
    }
    get sampleRate() {
        return this._audioBuffer.sampleRate;
    }
    getPCMData(channelIndex) {
        return new AudioPCMDataView(this._audioBuffer.getChannelData(channelIndex), 1);
    }
    _onInterruptedBegin() {
        if (this._state === AudioState.PLAYING) {
            this.pause().then(() => {
                this._state = AudioState.INTERRUPTED;
                this._eventTarget.emit(AudioEvent.INTERRUPTION_BEGIN);
            }).catch((e) => { debug.warn('_onInterruptedBegin error', e); });
        }
    }
    _onInterruptedEnd() {
        if (this._state === AudioState.INTERRUPTED) {
            this.play().then(() => {
                this._eventTarget.emit(AudioEvent.INTERRUPTION_END);
            }).catch((e) => { debug.warn('_onInterruptedEnd error', e); });
        }
    }
    get src() {
        return this._src;
    }
    get type() {
        return AudioType.WEB_AUDIO;
    }
    get state() {
        return this._state;
    }
    get loop() {
        return this._loop;
    }
    set loop(val) {
        this._loop = val;
        if (this._sourceNode) {
            this._sourceNode.loop = val;
        }
    }
    get volume() {
        return this._volume;
    }
    set volume(val) {
        val = clamp01(val);
        this._volume = val;
        audioContextAgent.setGainValue(this._gainNode, val);
    }
    get duration() {
        return this._audioBuffer.duration;
    }
    get currentTime() {
        return this._audioTimer.currentTime;
    }
    offRunning() {
        if (this._runningCallback) {
            audioContextAgent.offRunning(this._runningCallback);
            this._runningCallback = undefined;
        }
    }
    seek(time) {
        return new Promise((resolve) => {
            this.offRunning();
            this._audioTimer.seek(time);
            if (this._state === AudioState.PLAYING) {
                // one AudioBufferSourceNode can't start twice
                // need to create a new one to start from the offset
                this._doPlay().then(resolve).catch((e) => { debug.warn('seek error', e); });
            }
            else {
                resolve();
            }
        });
    }
    play() {
        this.offRunning();
        if (EDITOR_NOT_IN_PREVIEW) {
            return Promise.resolve();
        }
        return this._doPlay();
    }
    // The decorated play() method can't be call in seek()
    // so we define this method to ensure that the audio seeking works.
    _doPlay() {
        return new Promise((resolve) => {
            if (audioContextAgent.isRunning) {
                this._startSourceNode();
                resolve();
            }
            else {
                this.offRunning();
                this._runningCallback = () => {
                    this._startSourceNode();
                    resolve();
                };
                // Running event may be emit when:
                // - manually resume audio context.
                // - system automatically resume audio context when enter foreground from background.
                audioContextAgent.onceRunning(this._runningCallback);
                // Ensure resume context.
                audioContextAgent.runContext().catch((e) => { debug.warn('doPlay error', e); });
            }
        });
    }
    _startSourceNode() {
        // one AudioBufferSourceNode can't start twice
        this._stopSourceNode();
        this._sourceNode = audioContextAgent.createBufferSource(this._audioBuffer, this.loop);
        this._sourceNode.connect(this._gainNode);
        this._sourceNode.loop = this._loop;
        this._sourceNode.start(0, this._audioTimer.currentTime);
        this._state = AudioState.PLAYING;
        this._audioTimer.start();
        /* still not supported by all platforms *
        this._sourceNode.onended = this._onEnded;
        /* doing it manually for now */
        const checkEnded = () => {
            if (this.loop) {
                this._currentTimer = window.setTimeout(checkEnded, this._audioBuffer.duration * 1000);
            }
            else { // do ended
                this._audioTimer.stop();
                this._eventTarget.emit(AudioEvent.ENDED);
                this._state = AudioState.INIT;
            }
        };
        window.clearTimeout(this._currentTimer);
        this._currentTimer = window.setTimeout(checkEnded, (this._audioBuffer.duration - this._audioTimer.currentTime) * 1000);
    }
    _stopSourceNode() {
        try {
            if (this._sourceNode) {
                this._sourceNode.stop();
                this._sourceNode.disconnect();
                this._sourceNode.buffer = null;
                this._sourceNode = undefined;
            }
        }
        catch (e) {
            // sourceNode can't be stopped twice, especially on Safari.
        }
    }
    pause() {
        this.offRunning();
        if (this._state !== AudioState.PLAYING || !this._sourceNode) {
            return Promise.resolve();
        }
        this._audioTimer.pause();
        this._state = AudioState.PAUSED;
        window.clearTimeout(this._currentTimer);
        this._stopSourceNode();
        return Promise.resolve();
    }
    stop() {
        this.offRunning();
        if (!this._sourceNode) {
            this._audioTimer.stop();
            this._state = AudioState.STOPPED;
            return Promise.resolve();
        }
        this._audioTimer.stop();
        this._state = AudioState.STOPPED;
        window.clearTimeout(this._currentTimer);
        this._stopSourceNode();
        return Promise.resolve();
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
], AudioPlayerWeb.prototype, "seek", null);
__decorate([
    enqueueOperation
], AudioPlayerWeb.prototype, "play", null);
__decorate([
    enqueueOperation
], AudioPlayerWeb.prototype, "pause", null);
__decorate([
    enqueueOperation
], AudioPlayerWeb.prototype, "stop", null);
