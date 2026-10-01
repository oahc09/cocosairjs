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
import { USE_XR } from 'internal:constants';
import { InputEventType } from '../../../cocos/input/types/event-enum';
import { EventTarget } from '../../../cocos/core/event/event-target';
import legacyCC from '../../../predefine';
import { Feature } from '../../system-info/enum-type';
import { InputSourceButton, InputSourceDpad, InputSourceOrientation, InputSourcePosition, InputSourceStick } from '../input-source';
import { Quat, Vec3, js } from '../../../cocos/core';
import { EventGamepad } from '../../../cocos/input/types';
//#region button index alias
const BUTTON_SOUTH = 0;
const BUTTON_EAST = 1;
const BUTTON_WEST = 2;
const BUTTON_NORTH = 3;
const BUTTON_L1 = 4;
const BUTTON_R1 = 5;
const BUTTON_L2 = 6;
const BUTTON_R2 = 7;
const BUTTON_SHARE = 8;
const BUTTON_OPTIONS = 9;
const BUTTON_L3 = 10;
const BUTTON_R3 = 11;
const BUTTON_DPAD_UP = 12;
const BUTTON_DPAD_DOWN = 13;
const BUTTON_DPAD_LEFT = 14;
const BUTTON_DPAD_RIGHT = 15;
const BUTTON_HOME = 16;
const BUTTON_TOUCH_PAD = 17;
const AXIS_LEFT_STICK_X = 0;
const AXIS_LEFT_STICK_Y = 1;
const AXIS_RIGHT_STICK_X = 2;
const AXIS_RIGHT_STICK_Y = 3;
const XR_TRIGGER = 0;
const XR_GRIP = 1;
const XR_TOUCHPAD = 2;
const XR_STICK = 3;
const XR_BUTTON_1 = 4;
const XR_BUTTON_2 = 5;
const XR_AXIS_TOUCHPAD_X = 0;
const XR_AXIS_TOUCHPAD_Y = 1;
const XR_AXIS_STICK_X = 2;
const XR_AXIS_STICK_Y = 3;
//#endregion  button index alias
const EPSILON = 0.01;
const XRLeftHandedness = 'left';
const XRRightHandedness = 'right';
const devicesTmp = [];
var Pose;
(function (Pose) {
    Pose[Pose["HAND_LEFT"] = 1] = "HAND_LEFT";
    Pose[Pose["HAND_RIGHT"] = 4] = "HAND_RIGHT";
    Pose[Pose["AIM_LEFT"] = 2] = "AIM_LEFT";
    Pose[Pose["AIM_RIGHT"] = 5] = "AIM_RIGHT";
})(Pose || (Pose = {}));
export class GamepadInputDevice {
    get buttonNorth() { return this._buttonNorth; }
    get buttonEast() { return this._buttonEast; }
    get buttonWest() { return this._buttonWest; }
    get buttonSouth() { return this._buttonSouth; }
    get buttonL1() { return this._buttonL1; }
    get buttonL2() { return this._buttonL2; }
    get buttonL3() { return this._buttonL3; }
    get buttonR1() { return this._buttonR1; }
    get buttonR2() { return this._buttonR2; }
    get buttonR3() { return this._buttonR3; }
    // public get buttonTouchPad () { return this._buttonTouchPad; }
    // public get buttonHome () { return this._buttonHome; }
    get buttonShare() { return this._buttonShare; }
    get buttonOptions() { return this._buttonOptions; }
    get dpad() { return this._dpad; }
    get leftStick() { return this._leftStick; }
    get rightStick() { return this._rightStick; }
    get buttonStart() { return this._buttonStart; }
    get gripLeft() { return this._gripLeft; }
    get gripRight() { return this._gripRight; }
    get handLeftPosition() { return this._handLeftPosition; }
    get handLeftOrientation() { return this._handLeftOrientation; }
    get handRightPosition() { return this._handRightPosition; }
    get handRightOrientation() { return this._handRightOrientation; }
    get aimLeftPosition() { return this._aimLeftPosition; }
    get aimLeftOrientation() { return this._aimLeftOrientation; }
    get aimRightPosition() { return this._aimRightPosition; }
    get aimRightOrientation() { return this._aimRightOrientation; }
    get deviceId() {
        return this._deviceId;
    }
    get connected() {
        return this._connected;
    }
    constructor(deviceId) {
        this._deviceId = -1;
        this._connected = false;
        this._webPoseState = {
            [Pose.HAND_LEFT]: { position: Vec3.ZERO, orientation: Quat.IDENTITY },
            [Pose.HAND_RIGHT]: { position: Vec3.ZERO, orientation: Quat.IDENTITY },
            [Pose.AIM_LEFT]: { position: Vec3.ZERO, orientation: Quat.IDENTITY },
            [Pose.AIM_RIGHT]: { position: Vec3.ZERO, orientation: Quat.IDENTITY },
        };
        this._deviceId = deviceId;
        this._initInputSource();
    }
    /**
     * @engineInternal
     */
    static _init() {
        if (!systemInfo.hasFeature(Feature.EVENT_GAMEPAD)) {
            return;
        }
        GamepadInputDevice._registerEvent();
    }
    /**
     * @engineInternal
     */
    static _on(eventType, cb, target) {
        GamepadInputDevice._eventTarget.on(eventType, cb, target);
    }
    static _removeInputDevice(id) {
        const removeIndex = GamepadInputDevice.all.findIndex((device) => device.deviceId === id);
        if (removeIndex === -1) {
            return;
        }
        js.array.fastRemoveAt(GamepadInputDevice.all, removeIndex);
    }
    static _getOrCreateInputDevice(id, connected) {
        let device = GamepadInputDevice.all.find((device) => device.deviceId === id);
        if (!device) {
            device = new GamepadInputDevice(id);
            GamepadInputDevice.all.push(device);
        }
        device._connected = connected;
        return device;
    }
    static _ensureDirectorDefined(callback) {
        GamepadInputDevice._intervalId = setInterval(() => {
            if (legacyCC.director && legacyCC.Director) {
                clearInterval(GamepadInputDevice._intervalId);
                GamepadInputDevice._intervalId = -1;
                callback();
            }
        }, 50);
    }
    static _updateGamepadCnt() {
        let cnt = 0;
        for (let i = 0, l = GamepadInputDevice._cachedWebGamepads.length; i < l; i++) {
            if (GamepadInputDevice._cachedWebGamepads[i])
                cnt++;
        }
        GamepadInputDevice._totalGamepadCnt = cnt;
    }
    static _registerEvent() {
        GamepadInputDevice._ensureDirectorDefined(() => {
            GamepadInputDevice._cachedWebGamepads = GamepadInputDevice._getWebGamePads();
            GamepadInputDevice._updateGamepadCnt();
            legacyCC.director.on(legacyCC.Director.EVENT_BEGIN_FRAME, GamepadInputDevice._scanGamepads);
        });
        window.addEventListener('gamepadconnected', (e) => {
            GamepadInputDevice._cachedWebGamepads[e.gamepad.index] = e.gamepad;
            GamepadInputDevice._updateGamepadCnt();
            const device = GamepadInputDevice._getOrCreateInputDevice(e.gamepad.index, true);
            GamepadInputDevice._eventTarget.emit(InputEventType.GAMEPAD_CHANGE, new EventGamepad(InputEventType.GAMEPAD_CHANGE, device));
        });
        window.addEventListener('gamepaddisconnected', (e) => {
            GamepadInputDevice._cachedWebGamepads[e.gamepad.index] = null;
            GamepadInputDevice._updateGamepadCnt();
            const device = GamepadInputDevice._getOrCreateInputDevice(e.gamepad.index, false);
            GamepadInputDevice._removeInputDevice(e.gamepad.index);
            GamepadInputDevice._eventTarget.emit(InputEventType.GAMEPAD_CHANGE, new EventGamepad(InputEventType.GAMEPAD_CHANGE, device));
        });
    }
    static _scanWebGamepads(devices) {
        const allDisconnected = GamepadInputDevice._totalGamepadCnt === 0;
        if (allDisconnected)
            return;
        const webGamepads = GamepadInputDevice._getWebGamePads();
        if (!webGamepads) {
            return;
        }
        for (let i = 0; i < webGamepads.length; ++i) {
            const webGamepad = webGamepads[i];
            if (!webGamepad) {
                continue;
            }
            const cachedWebGamepad = GamepadInputDevice._cachedWebGamepads[webGamepad.index];
            // TODO: what if cachedWebGamepad is null
            if (cachedWebGamepad) {
                let device;
                const cachedButtons = cachedWebGamepad.buttons;
                for (let j = 0; j < cachedButtons.length; ++j) {
                    const cachedButton = cachedButtons[j];
                    const button = webGamepad.buttons[j];
                    if (Math.abs(cachedButton.value - button.value) > EPSILON) {
                        device = GamepadInputDevice._getOrCreateInputDevice(webGamepad.index, true);
                        break;
                    }
                }
                if (device) {
                    devices.push(device);
                    continue;
                }
                const cachedAxes = cachedWebGamepad.axes;
                for (let j = 0; j < cachedAxes.length; ++j) {
                    const cachedAxisValue = cachedAxes[j];
                    const axisValue = webGamepad.axes[j];
                    if (Math.abs(cachedAxisValue - axisValue) > EPSILON) {
                        device = GamepadInputDevice._getOrCreateInputDevice(webGamepad.index, true);
                        break;
                    }
                }
                if (device) {
                    devices.push(device);
                    continue;
                }
            }
        }
        // update cache
        GamepadInputDevice._cachedWebGamepads = webGamepads;
    }
    static _scanGamepads() {
        devicesTmp.length = 0;
        GamepadInputDevice._scanWebGamepads(devicesTmp);
        GamepadInputDevice._scanWebXRGamepads(devicesTmp);
        // emit event
        for (let i = 0; i < devicesTmp.length; ++i) {
            const device = devicesTmp[i];
            GamepadInputDevice._eventTarget.emit(InputEventType.GAMEPAD_INPUT, new EventGamepad(InputEventType.GAMEPAD_INPUT, device));
        }
        GamepadInputDevice._scanWebXRGamepadsPose();
    }
    static _scanWebXRGamepads(devices) {
        if (!USE_XR)
            return;
        const webxrGamepadMap = GamepadInputDevice._getWebXRGamepadMap();
        if (!webxrGamepadMap) {
            // update cache
            GamepadInputDevice._cachedWebXRGamepadMap = null;
            if (GamepadInputDevice.xr && GamepadInputDevice.xr._connected) {
                GamepadInputDevice.xr._connected = false;
                GamepadInputDevice._eventTarget.emit(InputEventType.GAMEPAD_CHANGE, new EventGamepad(InputEventType.GAMEPAD_CHANGE, GamepadInputDevice.xr));
                devices.push(GamepadInputDevice.xr);
            }
            return;
        }
        if (!GamepadInputDevice.xr) {
            // webxr gamepads index is -1 https://www.w3.org/TR/webxr-gamepads-module-1/#navigator-differences
            GamepadInputDevice.xr = new GamepadInputDevice(-1);
        }
        const left = webxrGamepadMap.get(XRLeftHandedness);
        const right = webxrGamepadMap.get(XRRightHandedness);
        if (!left && !right) {
            if (GamepadInputDevice.xr._connected) {
                GamepadInputDevice.xr._connected = false;
                GamepadInputDevice._eventTarget.emit(InputEventType.GAMEPAD_CHANGE, new EventGamepad(InputEventType.GAMEPAD_CHANGE, GamepadInputDevice.xr));
            }
        }
        else if (!GamepadInputDevice.xr._connected) {
            GamepadInputDevice.xr._connected = true;
            GamepadInputDevice._eventTarget.emit(InputEventType.GAMEPAD_CHANGE, new EventGamepad(InputEventType.GAMEPAD_CHANGE, GamepadInputDevice.xr));
        }
        if (GamepadInputDevice.checkGamepadChanged(left, GamepadInputDevice._cachedWebXRGamepadMap?.get(XRLeftHandedness))) {
            devices.push(GamepadInputDevice.xr);
        }
        else if (GamepadInputDevice.checkGamepadChanged(right, GamepadInputDevice._cachedWebXRGamepadMap?.get(XRRightHandedness))) {
            devices.push(GamepadInputDevice.xr);
        }
        // update cache
        if (!GamepadInputDevice._cachedWebXRGamepadMap) {
            GamepadInputDevice._cachedWebXRGamepadMap = new Map();
        }
        GamepadInputDevice._cachedWebXRGamepadMap.set(XRLeftHandedness, GamepadInputDevice._copyCacheGamepadValue(left));
        GamepadInputDevice._cachedWebXRGamepadMap.set(XRRightHandedness, GamepadInputDevice._copyCacheGamepadValue(right));
    }
    static checkGamepadChanged(currGamepad, cachedGamepad) {
        if (!currGamepad && !cachedGamepad) {
            return false;
        }
        else if (!currGamepad || !cachedGamepad) {
            return true;
        }
        const cachedButtons = cachedGamepad.buttons;
        for (let j = 0; j < cachedButtons.length; ++j) {
            const cachedButton = cachedButtons[j];
            const button = currGamepad.buttons[j];
            if (button.value !== 0 || cachedButton !== 0) {
                return true;
            }
        }
        const cachedAxes = cachedGamepad.axes;
        for (let j = 0; j < cachedAxes.length; ++j) {
            const cachedAxisValue = cachedAxes[j];
            const axisValue = currGamepad.axes[j];
            if (axisValue !== 0 || cachedAxisValue !== 0) {
                return true;
            }
        }
        return false;
    }
    static _copyCacheGamepadValue(gamepad) {
        if (!gamepad) {
            return undefined;
        }
        const cacheGamepad = { buttons: new Array(gamepad.buttons.length), axes: new Array(gamepad.axes.length) };
        for (let j = 0; j < gamepad.buttons.length; ++j) {
            cacheGamepad.buttons[j] = gamepad.buttons[j].value;
        }
        for (let j = 0; j < gamepad.axes.length; ++j) {
            cacheGamepad.axes[j] = gamepad.axes[j];
        }
        return cacheGamepad;
    }
    static _scanWebXRGamepadsPose() {
        if (!USE_XR)
            return;
        const infoList = globalThis.__globalXR?.webxrHandlePoseInfos;
        if (!infoList || !GamepadInputDevice.xr) {
            return;
        }
        for (let i = 0; i < infoList.length; ++i) {
            const info = infoList[i];
            GamepadInputDevice.xr._updateWebPoseState(info);
        }
        GamepadInputDevice._eventTarget.emit(InputEventType.HANDLE_POSE_INPUT, new EventGamepad(InputEventType.HANDLE_POSE_INPUT, GamepadInputDevice.xr));
    }
    static _getWebXRGamepadMap() {
        return globalThis.__globalXR?.webxrGamepadMap;
    }
    static _getWebGamePads() {
        if (typeof navigator.getGamepads === 'function') {
            return navigator.getGamepads();
        }
        else if (typeof navigator.webkitGetGamepads === 'function') {
            // NOTE: 'webkitGetGamepads' is not a standard web interface
            return navigator.webkitGetGamepads();
        }
        return [];
    }
    static _getWebGamepad(deviceId) {
        const webGamepads = GamepadInputDevice._getWebGamePads();
        for (let i = 0; i < webGamepads.length; ++i) {
            const webGamepad = webGamepads[i];
            if (webGamepad && webGamepad.index === deviceId) {
                return webGamepad;
            }
        }
        return undefined;
    }
    _axisToButtons(axisValue) {
        const value = Math.abs(axisValue);
        if (axisValue > 0) {
            return { negative: 0, positive: value };
        }
        else if (axisValue < 0) {
            return { negative: value, positive: 0 };
        }
        else {
            return { negative: 0, positive: 0 };
        }
    }
    _updateWebPoseState(info) {
        if (info.code !== Pose.HAND_LEFT && info.code !== Pose.AIM_LEFT
            && info.code !== Pose.HAND_RIGHT && info.code !== Pose.AIM_RIGHT) {
            return;
        }
        this._webPoseState[info.code] = {
            position: new Vec3(info.position.x, info.position.y, info.position.z),
            orientation: new Quat(info.orientation.x, info.orientation.y, info.orientation.z, info.orientation.w),
        };
    }
    _initInputSource() {
        this._buttonNorth = new InputSourceButton();
        this._buttonNorth.getValue = () => {
            if (this.deviceId === -1) {
                const webxrGamepad = GamepadInputDevice._getWebXRGamepadMap()?.get(XRLeftHandedness);
                if (webxrGamepad && webxrGamepad.buttons.length > XR_BUTTON_2) {
                    return webxrGamepad.buttons[XR_BUTTON_2].value;
                }
                return 0;
            }
            const webGamepad = GamepadInputDevice._getWebGamepad(this.deviceId);
            if (webGamepad) {
                return webGamepad.buttons[BUTTON_NORTH].value;
            }
            return 0;
        };
        this._buttonEast = new InputSourceButton();
        this._buttonEast.getValue = () => {
            if (this.deviceId === -1) {
                const webxrGamepad = GamepadInputDevice._getWebXRGamepadMap()?.get(XRRightHandedness);
                if (webxrGamepad && webxrGamepad.buttons.length > XR_BUTTON_2) {
                    return webxrGamepad.buttons[XR_BUTTON_2].value;
                }
                return 0;
            }
            const webGamepad = GamepadInputDevice._getWebGamepad(this.deviceId);
            if (webGamepad) {
                return webGamepad.buttons[BUTTON_EAST].value;
            }
            return 0;
        };
        this._buttonWest = new InputSourceButton();
        this._buttonWest.getValue = () => {
            if (this.deviceId === -1) {
                const webxrGamepad = GamepadInputDevice._getWebXRGamepadMap()?.get(XRLeftHandedness);
                if (webxrGamepad && webxrGamepad.buttons.length > XR_BUTTON_1) {
                    return webxrGamepad.buttons[XR_BUTTON_1].value;
                }
                return 0;
            }
            const webGamepad = GamepadInputDevice._getWebGamepad(this.deviceId);
            if (webGamepad) {
                return webGamepad.buttons[BUTTON_WEST].value;
            }
            return 0;
        };
        this._buttonSouth = new InputSourceButton();
        this._buttonSouth.getValue = () => {
            if (this.deviceId === -1) {
                const webxrGamepad = GamepadInputDevice._getWebXRGamepadMap()?.get(XRRightHandedness);
                if (webxrGamepad && webxrGamepad.buttons.length > XR_BUTTON_1) {
                    return webxrGamepad.buttons[XR_BUTTON_1].value;
                }
                return 0;
            }
            const webGamepad = GamepadInputDevice._getWebGamepad(this.deviceId);
            if (webGamepad) {
                return webGamepad.buttons[BUTTON_SOUTH].value;
            }
            return 0;
        };
        this._buttonL1 = new InputSourceButton();
        this._buttonL1.getValue = () => {
            const webGamepad = GamepadInputDevice._getWebGamepad(this.deviceId);
            if (webGamepad) {
                return webGamepad.buttons[BUTTON_L1].value;
            }
            return 0;
        };
        this._buttonL2 = new InputSourceButton();
        this._buttonL2.getValue = () => {
            if (this.deviceId === -1) {
                const webxrGamepad = GamepadInputDevice._getWebXRGamepadMap()?.get(XRLeftHandedness);
                if (webxrGamepad && webxrGamepad.buttons.length > XR_TRIGGER) {
                    return webxrGamepad.buttons[XR_TRIGGER].value;
                }
                return 0;
            }
            const webGamepad = GamepadInputDevice._getWebGamepad(this.deviceId);
            if (webGamepad) {
                return webGamepad.buttons[BUTTON_L2].value;
            }
            return 0;
        };
        this._buttonL3 = new InputSourceButton();
        this._buttonL3.getValue = () => {
            if (this.deviceId === -1) {
                const webxrGamepad = GamepadInputDevice._getWebXRGamepadMap()?.get(XRLeftHandedness);
                if (webxrGamepad) {
                    if (webxrGamepad.buttons.length > XR_STICK && webxrGamepad.buttons[XR_STICK].value !== 0) {
                        return webxrGamepad.buttons[XR_STICK].value;
                    }
                    else if (webxrGamepad.buttons.length > XR_TOUCHPAD && webxrGamepad.buttons[XR_TOUCHPAD].value !== 0) {
                        return webxrGamepad.buttons[XR_TOUCHPAD].value;
                    }
                }
                return 0;
            }
            const webGamepad = GamepadInputDevice._getWebGamepad(this.deviceId);
            if (webGamepad) {
                return webGamepad.buttons[BUTTON_L3].value;
            }
            return 0;
        };
        this._buttonR1 = new InputSourceButton();
        this._buttonR1.getValue = () => {
            const webGamepad = GamepadInputDevice._getWebGamepad(this.deviceId);
            if (webGamepad) {
                return webGamepad.buttons[BUTTON_R1].value;
            }
            return 0;
        };
        this._buttonR2 = new InputSourceButton();
        this._buttonR2.getValue = () => {
            if (this.deviceId === -1) {
                const webxrGamepad = GamepadInputDevice._getWebXRGamepadMap()?.get(XRRightHandedness);
                if (webxrGamepad && webxrGamepad.buttons.length > XR_TRIGGER) {
                    return webxrGamepad.buttons[XR_TRIGGER].value;
                }
                return 0;
            }
            const webGamepad = GamepadInputDevice._getWebGamepad(this.deviceId);
            if (webGamepad) {
                return webGamepad.buttons[BUTTON_R2].value;
            }
            return 0;
        };
        this._buttonR3 = new InputSourceButton();
        this._buttonR3.getValue = () => {
            if (this.deviceId === -1) {
                const webxrGamepad = GamepadInputDevice._getWebXRGamepadMap()?.get(XRRightHandedness);
                if (webxrGamepad) {
                    if (webxrGamepad.buttons.length > XR_STICK && webxrGamepad.buttons[XR_STICK].value !== 0) {
                        return webxrGamepad.buttons[XR_STICK].value;
                    }
                    else if (webxrGamepad.buttons.length > XR_TOUCHPAD && webxrGamepad.buttons[XR_TOUCHPAD].value !== 0) {
                        return webxrGamepad.buttons[XR_TOUCHPAD].value;
                    }
                }
                return 0;
            }
            const webGamepad = GamepadInputDevice._getWebGamepad(this.deviceId);
            if (webGamepad) {
                return webGamepad.buttons[BUTTON_R3].value;
            }
            return 0;
        };
        // this._buttonTouchPad = new InputSourceButton();
        // this._buttonTouchPad.getValue = () => {
        //     const webGamepad = GamepadInputDevice._getWebGamepad(this.deviceId);
        //     if (webGamepad) { return webGamepad.buttons[BUTTON_TOUCH_PAD].value; }
        //     return 0;
        // };
        // this._buttonHome = new InputSourceButton();
        // this._buttonHome.getValue = () => {
        //     const webGamepad = GamepadInputDevice._getWebGamepad(this.deviceId);
        //     if (webGamepad) { return webGamepad.buttons[BUTTON_HOME].value; }
        //     return 0;
        // };
        this._buttonShare = new InputSourceButton();
        this._buttonShare.getValue = () => {
            const webGamepad = GamepadInputDevice._getWebGamepad(this.deviceId);
            if (webGamepad) {
                return webGamepad.buttons[BUTTON_SHARE].value;
            }
            return 0;
        };
        this._buttonOptions = new InputSourceButton();
        this._buttonOptions.getValue = () => {
            const webGamepad = GamepadInputDevice._getWebGamepad(this.deviceId);
            if (webGamepad) {
                return webGamepad.buttons[BUTTON_OPTIONS].value;
            }
            return 0;
        };
        const dpadUp = new InputSourceButton();
        dpadUp.getValue = () => {
            const webGamepad = GamepadInputDevice._getWebGamepad(this.deviceId);
            if (webGamepad) {
                return webGamepad.buttons[BUTTON_DPAD_UP].value;
            }
            return 0;
        };
        const dpadDown = new InputSourceButton();
        dpadDown.getValue = () => {
            const webGamepad = GamepadInputDevice._getWebGamepad(this.deviceId);
            if (webGamepad) {
                return webGamepad.buttons[BUTTON_DPAD_DOWN].value;
            }
            return 0;
        };
        const dpadLeft = new InputSourceButton();
        dpadLeft.getValue = () => {
            const webGamepad = GamepadInputDevice._getWebGamepad(this.deviceId);
            if (webGamepad) {
                return webGamepad.buttons[BUTTON_DPAD_LEFT].value;
            }
            return 0;
        };
        const dpadRight = new InputSourceButton();
        dpadRight.getValue = () => {
            const webGamepad = GamepadInputDevice._getWebGamepad(this.deviceId);
            if (webGamepad) {
                return webGamepad.buttons[BUTTON_DPAD_RIGHT].value;
            }
            return 0;
        };
        this._dpad = new InputSourceDpad({ up: dpadUp, down: dpadDown, left: dpadLeft, right: dpadRight });
        const leftStickUp = new InputSourceButton();
        leftStickUp.getValue = () => {
            if (this.deviceId === -1) {
                if (USE_XR) {
                    const webxrGamepad = GamepadInputDevice._getWebXRGamepadMap()?.get(XRLeftHandedness);
                    if (webxrGamepad) {
                        if (webxrGamepad.axes.length > XR_AXIS_STICK_Y && webxrGamepad.axes[XR_AXIS_STICK_Y] !== 0) {
                            return this._axisToButtons(webxrGamepad.axes[XR_AXIS_STICK_Y]).negative;
                        }
                        else if (webxrGamepad.axes.length > XR_AXIS_TOUCHPAD_Y && webxrGamepad.axes[XR_AXIS_TOUCHPAD_Y] !== 0) {
                            return this._axisToButtons(webxrGamepad.axes[XR_AXIS_TOUCHPAD_Y]).negative;
                        }
                    }
                }
                return 0;
            }
            const webGamepad = GamepadInputDevice._getWebGamepad(this.deviceId);
            if (webGamepad) {
                return this._axisToButtons(webGamepad.axes[AXIS_LEFT_STICK_Y]).negative;
            }
            return 0;
        };
        const leftStickDown = new InputSourceButton();
        leftStickDown.getValue = () => {
            if (this.deviceId === -1) {
                if (USE_XR) {
                    const webxrGamepad = GamepadInputDevice._getWebXRGamepadMap()?.get(XRLeftHandedness);
                    if (webxrGamepad) {
                        if (webxrGamepad.axes.length > XR_AXIS_STICK_Y && webxrGamepad.axes[XR_AXIS_STICK_Y] !== 0) {
                            return this._axisToButtons(webxrGamepad.axes[XR_AXIS_STICK_Y]).positive;
                        }
                        else if (webxrGamepad.axes.length > XR_AXIS_TOUCHPAD_Y && webxrGamepad.axes[XR_AXIS_TOUCHPAD_Y] !== 0) {
                            return this._axisToButtons(webxrGamepad.axes[XR_AXIS_TOUCHPAD_Y]).positive;
                        }
                    }
                }
                return 0;
            }
            const webGamepad = GamepadInputDevice._getWebGamepad(this.deviceId);
            if (webGamepad) {
                return this._axisToButtons(webGamepad.axes[AXIS_LEFT_STICK_Y]).positive;
            }
            return 0;
        };
        const leftStickLeft = new InputSourceButton();
        leftStickLeft.getValue = () => {
            if (this.deviceId === -1) {
                if (USE_XR) {
                    const webxrGamepad = GamepadInputDevice._getWebXRGamepadMap()?.get(XRLeftHandedness);
                    if (webxrGamepad) {
                        if (webxrGamepad.axes.length > XR_AXIS_STICK_X && webxrGamepad.axes[XR_AXIS_STICK_X] !== 0) {
                            return this._axisToButtons(webxrGamepad.axes[XR_AXIS_STICK_X]).negative;
                        }
                        else if (webxrGamepad.axes.length > XR_AXIS_TOUCHPAD_X && webxrGamepad.axes[XR_AXIS_TOUCHPAD_X] !== 0) {
                            return this._axisToButtons(webxrGamepad.axes[XR_AXIS_TOUCHPAD_X]).negative;
                        }
                    }
                }
                return 0;
            }
            const webGamepad = GamepadInputDevice._getWebGamepad(this.deviceId);
            if (webGamepad) {
                return this._axisToButtons(webGamepad.axes[AXIS_LEFT_STICK_X]).negative;
            }
            return 0;
        };
        const leftStickRight = new InputSourceButton();
        leftStickRight.getValue = () => {
            if (this.deviceId === -1) {
                if (USE_XR) {
                    const webxrGamepad = GamepadInputDevice._getWebXRGamepadMap()?.get(XRLeftHandedness);
                    if (webxrGamepad) {
                        if (webxrGamepad.axes.length > XR_AXIS_STICK_X && webxrGamepad.axes[XR_AXIS_STICK_X] !== 0) {
                            return this._axisToButtons(webxrGamepad.axes[XR_AXIS_STICK_X]).positive;
                        }
                        else if (webxrGamepad.axes.length > XR_AXIS_TOUCHPAD_X && webxrGamepad.axes[XR_AXIS_TOUCHPAD_X] !== 0) {
                            return this._axisToButtons(webxrGamepad.axes[XR_AXIS_TOUCHPAD_X]).positive;
                        }
                    }
                }
                return 0;
            }
            const webGamepad = GamepadInputDevice._getWebGamepad(this.deviceId);
            if (webGamepad) {
                return this._axisToButtons(webGamepad.axes[AXIS_LEFT_STICK_X]).positive;
            }
            return 0;
        };
        this._leftStick = new InputSourceStick({ up: leftStickUp, down: leftStickDown, left: leftStickLeft, right: leftStickRight });
        const rightStickUp = new InputSourceButton();
        rightStickUp.getValue = () => {
            if (this.deviceId === -1) {
                if (USE_XR) {
                    const webxrGamepad = GamepadInputDevice._getWebXRGamepadMap()?.get(XRRightHandedness);
                    if (webxrGamepad) {
                        if (webxrGamepad.axes.length > XR_AXIS_STICK_Y && webxrGamepad.axes[XR_AXIS_STICK_Y] !== 0) {
                            return this._axisToButtons(webxrGamepad.axes[XR_AXIS_STICK_Y]).negative;
                        }
                        else if (webxrGamepad.axes.length > XR_AXIS_TOUCHPAD_Y && webxrGamepad.axes[XR_AXIS_TOUCHPAD_Y] !== 0) {
                            return this._axisToButtons(webxrGamepad.axes[XR_AXIS_TOUCHPAD_Y]).negative;
                        }
                    }
                }
                return 0;
            }
            const webGamepad = GamepadInputDevice._getWebGamepad(this.deviceId);
            if (webGamepad) {
                return this._axisToButtons(webGamepad.axes[AXIS_RIGHT_STICK_Y]).negative;
            }
            return 0;
        };
        const rightStickDown = new InputSourceButton();
        rightStickDown.getValue = () => {
            if (this.deviceId === -1) {
                if (USE_XR) {
                    const webxrGamepad = GamepadInputDevice._getWebXRGamepadMap()?.get(XRRightHandedness);
                    if (webxrGamepad) {
                        if (webxrGamepad.axes.length > XR_AXIS_STICK_Y && webxrGamepad.axes[XR_AXIS_STICK_Y] !== 0) {
                            return this._axisToButtons(webxrGamepad.axes[XR_AXIS_STICK_Y]).positive;
                        }
                        else if (webxrGamepad.axes.length > XR_AXIS_TOUCHPAD_Y && webxrGamepad.axes[XR_AXIS_TOUCHPAD_Y] !== 0) {
                            return this._axisToButtons(webxrGamepad.axes[XR_AXIS_TOUCHPAD_Y]).positive;
                        }
                    }
                }
                return 0;
            }
            const webGamepad = GamepadInputDevice._getWebGamepad(this.deviceId);
            if (webGamepad) {
                return this._axisToButtons(webGamepad.axes[AXIS_RIGHT_STICK_Y]).positive;
            }
            return 0;
        };
        const rightStickLeft = new InputSourceButton();
        rightStickLeft.getValue = () => {
            if (this.deviceId === -1) {
                if (USE_XR) {
                    const webxrGamepad = GamepadInputDevice._getWebXRGamepadMap()?.get(XRRightHandedness);
                    if (webxrGamepad) {
                        if (webxrGamepad.axes.length > XR_AXIS_STICK_X && webxrGamepad.axes[XR_AXIS_STICK_X] !== 0) {
                            return this._axisToButtons(webxrGamepad.axes[XR_AXIS_STICK_X]).negative;
                        }
                        else if (webxrGamepad.axes.length > XR_AXIS_TOUCHPAD_X && webxrGamepad.axes[XR_AXIS_TOUCHPAD_X] !== 0) {
                            return this._axisToButtons(webxrGamepad.axes[XR_AXIS_TOUCHPAD_X]).negative;
                        }
                    }
                }
                return 0;
            }
            const webGamepad = GamepadInputDevice._getWebGamepad(this.deviceId);
            if (webGamepad) {
                return this._axisToButtons(webGamepad.axes[AXIS_RIGHT_STICK_X]).negative;
            }
            return 0;
        };
        const rightStickRight = new InputSourceButton();
        rightStickRight.getValue = () => {
            if (this.deviceId === -1) {
                if (USE_XR) {
                    const webxrGamepad = GamepadInputDevice._getWebXRGamepadMap()?.get(XRRightHandedness);
                    if (webxrGamepad) {
                        if (webxrGamepad.axes.length > XR_AXIS_STICK_X && webxrGamepad.axes[XR_AXIS_STICK_X] !== 0) {
                            return this._axisToButtons(webxrGamepad.axes[XR_AXIS_STICK_X]).positive;
                        }
                        else if (webxrGamepad.axes.length > XR_AXIS_TOUCHPAD_X && webxrGamepad.axes[XR_AXIS_TOUCHPAD_X] !== 0) {
                            return this._axisToButtons(webxrGamepad.axes[XR_AXIS_TOUCHPAD_X]).positive;
                        }
                    }
                }
                return 0;
            }
            const webGamepad = GamepadInputDevice._getWebGamepad(this.deviceId);
            if (webGamepad) {
                return this._axisToButtons(webGamepad.axes[AXIS_RIGHT_STICK_X]).positive;
            }
            return 0;
        };
        this._rightStick = new InputSourceStick({ up: rightStickUp, down: rightStickDown, left: rightStickLeft, right: rightStickRight });
        this._buttonStart = new InputSourceButton();
        this._buttonStart.getValue = () => 0;
        this._gripLeft = new InputSourceButton();
        this._gripLeft.getValue = () => {
            if (this.deviceId === -1) {
                if (USE_XR) {
                    const webxrGamepad = GamepadInputDevice._getWebXRGamepadMap()?.get(XRLeftHandedness);
                    if (webxrGamepad && webxrGamepad.buttons.length > XR_GRIP) {
                        return webxrGamepad.buttons[XR_GRIP].value;
                    }
                }
            }
            return 0;
        };
        this._gripRight = new InputSourceButton();
        this._gripRight.getValue = () => {
            if (this.deviceId === -1) {
                const webxrGamepad = GamepadInputDevice._getWebXRGamepadMap()?.get(XRRightHandedness);
                if (webxrGamepad && webxrGamepad.buttons.length > XR_GRIP) {
                    return webxrGamepad.buttons[XR_GRIP].value;
                }
            }
            return 0;
        };
        this._handLeftPosition = new InputSourcePosition();
        this._handLeftPosition.getValue = () => this._webPoseState[Pose.HAND_LEFT].position;
        this._handLeftOrientation = new InputSourceOrientation();
        this._handLeftOrientation.getValue = () => this._webPoseState[Pose.HAND_LEFT].orientation;
        this._handRightPosition = new InputSourcePosition();
        this._handRightPosition.getValue = () => this._webPoseState[Pose.HAND_RIGHT].position;
        this._handRightOrientation = new InputSourceOrientation();
        this._handRightOrientation.getValue = () => this._webPoseState[Pose.HAND_RIGHT].orientation;
        this._aimLeftPosition = new InputSourcePosition();
        this._aimLeftPosition.getValue = () => this._webPoseState[Pose.AIM_LEFT].position;
        this._aimLeftOrientation = new InputSourceOrientation();
        this._aimLeftOrientation.getValue = () => this._webPoseState[Pose.AIM_LEFT].orientation;
        this._aimRightPosition = new InputSourcePosition();
        this._aimRightPosition.getValue = () => this._webPoseState[Pose.AIM_RIGHT].position;
        this._aimRightOrientation = new InputSourceOrientation();
        this._aimRightOrientation.getValue = () => this._webPoseState[Pose.AIM_RIGHT].orientation;
    }
}
GamepadInputDevice.all = [];
GamepadInputDevice.xr = null;
GamepadInputDevice._eventTarget = new EventTarget();
GamepadInputDevice._cachedWebGamepads = [];
GamepadInputDevice._cachedWebXRGamepadMap = null;
GamepadInputDevice._intervalId = -1;
GamepadInputDevice._totalGamepadCnt = 0;
