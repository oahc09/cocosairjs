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
export var AudioEvent;
(function (AudioEvent) {
    AudioEvent["PLAYED"] = "play";
    AudioEvent["PAUSED"] = "pause";
    AudioEvent["STOPPED"] = "stop";
    AudioEvent["SEEKED"] = "seeked";
    AudioEvent["ENDED"] = "ended";
    AudioEvent["INTERRUPTION_BEGIN"] = "interruptionBegin";
    AudioEvent["INTERRUPTION_END"] = "interruptionEnd";
    AudioEvent["USER_GESTURE"] = "on_gesture";
})(AudioEvent || (AudioEvent = {}));
export var AudioType;
(function (AudioType) {
    AudioType[AudioType["DOM_AUDIO"] = 0] = "DOM_AUDIO";
    AudioType[AudioType["WEB_AUDIO"] = 1] = "WEB_AUDIO";
    AudioType[AudioType["MINIGAME_AUDIO"] = 2] = "MINIGAME_AUDIO";
    AudioType[AudioType["NATIVE_AUDIO"] = 3] = "NATIVE_AUDIO";
    AudioType[AudioType["UNKNOWN_AUDIO"] = 4] = "UNKNOWN_AUDIO";
})(AudioType || (AudioType = {}));
export var AudioState;
(function (AudioState) {
    AudioState[AudioState["INIT"] = 0] = "INIT";
    AudioState[AudioState["PLAYING"] = 1] = "PLAYING";
    AudioState[AudioState["PAUSED"] = 2] = "PAUSED";
    AudioState[AudioState["STOPPED"] = 3] = "STOPPED";
    AudioState[AudioState["INTERRUPTED"] = 4] = "INTERRUPTED";
})(AudioState || (AudioState = {}));
export class AudioPCMDataView {
    constructor(...args) {
        this._normalizeFactor = 1;
        if (args.length === 2) {
            this._bufferView = args[0];
            this._normalizeFactor = args[1];
        }
        else {
            const arrayBuffer = args[0];
            const Ctor = args[1];
            const normalizeFactor = args[2];
            this._bufferView = new Ctor(arrayBuffer);
            this._normalizeFactor = normalizeFactor;
        }
    }
    get length() {
        return this._bufferView.length;
    }
    getData(offset) {
        return this._bufferView[offset] * this._normalizeFactor;
    }
}
