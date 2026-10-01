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
export declare enum AudioEvent {
    PLAYED = "play",
    PAUSED = "pause",
    STOPPED = "stop",
    SEEKED = "seeked",
    ENDED = "ended",
    INTERRUPTION_BEGIN = "interruptionBegin",
    INTERRUPTION_END = "interruptionEnd",
    USER_GESTURE = "on_gesture"
}
export declare enum AudioType {
    DOM_AUDIO = 0,
    WEB_AUDIO = 1,
    MINIGAME_AUDIO = 2,
    NATIVE_AUDIO = 3,
    UNKNOWN_AUDIO = 4
}
export interface AudioLoadOptions {
    audioLoadMode?: AudioType;
}
export declare enum AudioState {
    INIT = 0,
    PLAYING = 1,
    PAUSED = 2,
    STOPPED = 3,
    INTERRUPTED = 4
}
export type AudioBufferView = Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array;
export declare class AudioPCMDataView {
    private _bufferView;
    private _normalizeFactor;
    constructor(arrayBufferView: AudioBufferView, normalizeFactor: number);
    constructor(arrayBuffer: ArrayBuffer, Ctor: Constructor<AudioBufferView>, normalizeFactor: number);
    get length(): number;
    getData(offset: number): number;
}
