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
import { EDITOR, TEST } from 'internal:constants';
import { systemInfo } from 'pal/system-info';
import { warnID } from '../../../cocos/core/platform/debug';
import { EventTarget } from '../../../cocos/core/event/event-target';
import { Size } from '../../../cocos/core/math';
import { Orientation } from '../enum-type';
import legacyCC from '../../../predefine';
import { checkPalIntegrity, withImpl } from '../../integrity-check';
import { OS } from '../../system-info/enum-type';
const EVENT_TIMEOUT = EDITOR ? 5 : 200;
const orientationMap = {
    auto: Orientation.AUTO,
    landscape: Orientation.LANDSCAPE,
    portrait: Orientation.PORTRAIT,
};
/**
 * On Web platform, the game window may points to different type of window.
 */
var WindowType;
(function (WindowType) {
    /**
     * Unknown window type.
     */
    WindowType[WindowType["Unknown"] = 0] = "Unknown";
    /**
     * A SubFrame in BrowserWindow.
     * Need to set the frame size from an external editor option.
     * Should only dispatch 'resize' event when the frame size changed.
     * Setting window size is supported.
     */
    WindowType[WindowType["SubFrame"] = 1] = "SubFrame";
    /**
     * The window size is determined by the size of BrowserWindow.
     * Should dispatch 'resize' event when the BrowserWindow size changed.
     * Setting window size is NOT supported.
     */
    WindowType[WindowType["BrowserWindow"] = 2] = "BrowserWindow";
    /**
     * The window size is equal to the size of screen.
     * Should dispatch 'resize' event when enter / exit fullscreen or screen resize.
     * Setting window size is NOT supported.
     */
    WindowType[WindowType["Fullscreen"] = 3] = "Fullscreen";
})(WindowType || (WindowType = {}));
class ScreenAdapter extends EventTarget {
    get supportFullScreen() {
        return this._supportFullScreen;
    }
    get isFullScreen() {
        if (!this._supportFullScreen) {
            return false;
        }
        return !!document[this._fn.fullscreenElement];
    }
    get maxDevicePixelRatio() { return this._maxDevicePixelRatio; }
    get devicePixelRatio() {
        // TODO: remove the down sampling operation in DPR after supporting resolutionScale
        const airCap = Number(window.__CCDPR_CAP__);
        const cap = Number.isFinite(airCap) && airCap > 0 ? airCap : (this._maxDevicePixelRatio ?? 2);
        return Math.min(window.devicePixelRatio ?? 1, cap);
    }
    get windowSize() {
        const result = this._windowSizeInCssPixels;
        const dpr = this.devicePixelRatio;
        result.width = Math.round(result.width * dpr);
        result.height = Math.round(result.height * dpr);
        return result;
    }
    set windowSize(size) {
        if (this._windowType !== WindowType.SubFrame) {
            warnID(9202);
            return;
        }
        this._resizeFrame(this._convertToSizeInCssPixels(size));
    }
    get resolution() {
        const windowSize = this.windowSize;
        const resolutionScale = this.resolutionScale;
        return new Size(windowSize.width * resolutionScale, windowSize.height * resolutionScale);
    }
    get resolutionScale() {
        return this._resolutionScale;
    }
    set resolutionScale(v) {
        if (v === this._resolutionScale) {
            return;
        }
        this._resolutionScale = v;
        this._cbToUpdateFrameBuffer?.();
    }
    get orientation() {
        return this._orientation;
    }
    set orientation(value) {
        if (this._orientation === value) {
            return;
        }
        this._orientation = value;
        this._updateFrame();
    }
    _updateFrame() {
        this._updateFrameState();
        this._resizeFrame();
    }
    get safeAreaEdge() {
        const dpr = this.devicePixelRatio;
        const _top = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--safe-top') || '0') * dpr;
        const _bottom = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom') || '0') * dpr;
        const _left = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--safe-left') || '0') * dpr;
        const _right = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--safe-right') || '0') * dpr;
        return {
            top: _top,
            bottom: _bottom,
            left: _left,
            right: _right,
        };
    }
    get isProportionalToFrame() {
        return this._isProportionalToFrame;
    }
    set isProportionalToFrame(v) {
        if (this._isProportionalToFrame === v) {
            return;
        }
        this._isProportionalToFrame = v;
        this._updateContainer();
    }
    destroyLayoutObserver() {
        this._layoutStopped = true;
        this._dprCleanup?.();
        this._dprCleanup = undefined;
        this._layoutObserver?.disconnect();
        this._layoutObserver = undefined;
        if (this._layoutFrame)
            window.cancelAnimationFrame(this._layoutFrame);
        this._layoutFrame = 0;
    }
    _observeLayout() {
        this.destroyLayoutObserver();
        this._layoutStopped = false;
        if (!this._isHeadlessMode)
            this._watchDPR?.();
        if (this._isHeadlessMode || typeof ResizeObserver === 'undefined')
            return;
        this._layoutObserver = new ResizeObserver(() => {
            if (this._layoutStopped || !this.handleResizeEvent || this._layoutFrame)
                return;
            this._layoutFrame = window.requestAnimationFrame(() => {
                this._layoutFrame = 0;
                if (!this._layoutStopped && this.handleResizeEvent)
                    this._updateFrame();
            });
        });
        if (this._gameFrame)
            this._layoutObserver.observe(this._gameFrame);
        if (this._gameContainer)
            this._layoutObserver.observe(this._gameContainer);
    }
    get _windowSizeInCssPixels() {
        if (TEST) {
            return new Size(window.innerWidth, window.innerHeight);
        }
        if (this.isProportionalToFrame) {
            if (!this._gameContainer) {
                warnID(9201);
                return new Size(0, 0);
            }
            return new Size(this._gameContainer.clientWidth, this._gameContainer.clientHeight);
        }
        let fullscreenTarget;
        let width;
        let height;
        switch (this._windowType) {
            case WindowType.SubFrame:
                if (!this._gameFrame) {
                    warnID(9201);
                    return new Size(0, 0);
                }
                return new Size(this._gameFrame.clientWidth, this._gameFrame.clientHeight);
            case WindowType.Fullscreen:
                fullscreenTarget = this._getFullscreenTarget();
                width = this.isFrameRotated ? fullscreenTarget.clientHeight : fullscreenTarget.clientWidth;
                height = this.isFrameRotated ? fullscreenTarget.clientWidth : fullscreenTarget.clientHeight;
                return new Size(width, height);
            case WindowType.BrowserWindow:
                width = this.isFrameRotated ? window.innerHeight : window.innerWidth;
                height = this.isFrameRotated ? window.innerWidth : window.innerHeight;
                return new Size(width, height);
            case WindowType.Unknown:
            default:
                return new Size(1, 1);
        }
    }
    get _windowType() {
        if (this._isHeadlessMode) {
            return WindowType.Unknown;
        }
        if (this.isFullScreen) {
            return WindowType.Fullscreen;
        }
        if (!this._gameFrame) {
            warnID(9201);
            return WindowType.Unknown;
        }
        if (this._exactFitScreen) {
            // Note: It doesn't work well to determine whether the frame exact fits the screen.
            // Need to specify the attribute from Editor.
            return WindowType.BrowserWindow;
        }
        return WindowType.SubFrame;
    }
    onCanvasBound(callback) {
        if (this._canvasBound)
            callback();
        else
            this._canvasWaiters.push(callback);
    }
    constructor() {
        super();
        this.isFrameRotated = false;
        this.handleResizeEvent = true;
        this._maxDevicePixelRatio = null;
        this._isProportionalToFrame = false;
        this._cachedFrameStyle = { width: '0px', height: '0px' };
        this._cachedContainerStyle = { width: '0px', height: '0px' };
        this._supportFullScreen = false;
        // We need to set timeout to handle screen event.
        this._orientationChangeTimeoutId = -1;
        this._cachedFrameSize = new Size(0, 0); // cache before enter fullscreen.
        this._exactFitScreen = false;
        this._measuredLayout = '';
        this._layoutFrame = 0;
        this._layoutStopped = false;
        this._isHeadlessMode = false;
        this._fn = {};
        // Function mapping for cross browser support
        this._fnGroup = [
            [
                'requestFullscreen',
                'exitFullscreen',
                'fullscreenchange',
                'fullscreenEnabled',
                'fullscreenElement',
                'fullscreenerror',
            ],
            [
                'requestFullScreen',
                'exitFullScreen',
                'fullScreenchange',
                'fullScreenEnabled',
                'fullScreenElement',
                'fullscreenerror',
            ],
            [
                'webkitRequestFullScreen',
                'webkitCancelFullScreen',
                'webkitfullscreenchange',
                'webkitIsFullScreen',
                'webkitCurrentFullScreenElement',
                'webkitfullscreenerror',
            ],
            [
                'mozRequestFullScreen',
                'mozCancelFullScreen',
                'mozfullscreenchange',
                'mozFullScreen',
                'mozFullScreenElement',
                'mozfullscreenerror',
            ],
            [
                'msRequestFullscreen',
                'msExitFullscreen',
                'MSFullscreenChange',
                'msFullscreenEnabled',
                'msFullscreenElement',
                'msfullscreenerror',
            ],
        ];
        this._resolutionScale = 1;
        this._orientation = Orientation.AUTO; //The orientation set by user.
        this._orientationDevice = Orientation.AUTO; //Store the device's orientation.
        this._canvasBound = false;
        this._canvasWaiters = [];
    }
    // Explicit startup boundary: no DOM lookup, wrappers or listeners at module import.
    bindCanvas() {
        const canvas = (globalThis.__CC_CANVAS__ || document.getElementById('GameCanvas'));
        if (this._canvasBound) {
            if (canvas !== this._gameCanvas)
                throw new Error('[AIR_E_CANVAS_CONFLICT] Screen adapter already owns another canvas.');
            return;
        }
        if (!canvas)
            throw new Error('[AIR_E_CANVAS] Startup requires a canvas.');
        // TODO: need to access frame from 'pal/launcher' module
        this._gameFrame = document.getElementById('GameDiv');
        this._gameContainer = document.getElementById('Cocos3dGameContainer');
        this._gameCanvas = (globalThis.__CC_CANVAS__ || document.getElementById('GameCanvas'));
        // Compability with old preview or build template in Editor.
        if (!TEST && !EDITOR) {
            if (!this._gameFrame) {
                this._gameFrame = document.createElement('div');
                this._gameFrame.setAttribute('id', 'GameDiv');
                const anchor = this._gameContainer || this._gameCanvas;
                anchor?.parentNode?.insertBefore(this._gameFrame, anchor);
                this._gameFrame.appendChild(anchor);
            }
            if (!this._gameContainer) {
                this._gameContainer = document.createElement('div');
                this._gameContainer.setAttribute('id', 'Cocos3dGameContainer');
                this._gameCanvas?.parentNode?.insertBefore(this._gameContainer, this._gameCanvas);
                this._gameContainer.appendChild(this._gameCanvas);
            }
        }
        let fnList;
        const fnGroup = this._fnGroup;
        for (let i = 0; i < fnGroup.length; i++) {
            fnList = fnGroup[i];
            // detect event support
            if (typeof document[fnList[1]] !== 'undefined') {
                for (let i = 0; i < fnList.length; i++) {
                    this._fn[fnGroup[0][i]] = fnList[i];
                }
                break;
            }
        }
        this._supportFullScreen = (this._fn.requestFullscreen !== undefined);
        this._touchEventName = ('ontouchstart' in window) ? 'touchend' : 'mousedown';
        this._registerEvent();
        this._canvasBound = true;
        const waiters = this._canvasWaiters.splice(0);
        for (const callback of waiters)
            callback();
    }
    init(options, cbToRebuildFrameBuffer) {
        const maximum = options.maxDevicePixelRatio;
        if (maximum != null && (typeof maximum !== 'number' || !Number.isFinite(maximum) || maximum < 1)) {
            throw new RangeError('screen.maxDevicePixelRatio must be a finite number >= 1.');
        }
        this._maxDevicePixelRatio = maximum ?? null;
        this.bindCanvas();
        this._cbToUpdateFrameBuffer = cbToRebuildFrameBuffer;
        this.orientation = orientationMap[options.configOrientation];
        this._exactFitScreen = options.exactFitScreen;
        this._isHeadlessMode = options.isHeadlessMode;
        this._resizeFrame();
        this._observeLayout();
    }
    requestFullScreen() {
        return new Promise((resolve, reject) => {
            if (this.isFullScreen) {
                resolve();
                return;
            }
            this._cachedFrameSize = this.windowSize;
            this._doRequestFullScreen().then(() => {
                resolve();
            }).catch(() => {
                const fullscreenTarget = this._getFullscreenTarget();
                if (!fullscreenTarget) {
                    reject(new Error('Cannot access fullscreen target'));
                    return;
                }
                fullscreenTarget.addEventListener(this._touchEventName, () => {
                    this._doRequestFullScreen().then(() => {
                        resolve();
                    }).catch(reject);
                }, { once: true, capture: true });
            });
        });
    }
    exitFullScreen() {
        return new Promise((resolve, reject) => {
            const requestPromise = document[this._fn.exitFullscreen]();
            if (window.Promise && requestPromise instanceof Promise) {
                requestPromise.then(() => {
                    this.windowSize = this._cachedFrameSize;
                    resolve();
                }).catch(reject);
                return;
            }
            this.windowSize = this._cachedFrameSize;
            resolve();
        });
    }
    _registerEvent() {
        document.addEventListener(this._fn.fullscreenerror, () => {
            this._onFullscreenError?.();
        });
        window.addEventListener('resize', () => {
            // if (!this.handleResizeEvent) {
            //     return;
            // }
            this._updateFrame();
        });
        const notifyOrientationChange = (orientation) => {
            if (orientation === this._orientationDevice) {
                return;
            }
            this._orientationDevice = orientation;
            this._updateFrame();
            this.emit('orientation-change', orientation);
        };
        const getOrientation = () => {
            let tmpOrientation = Orientation.PORTRAIT;
            switch (window.orientation) {
                case 0:
                    tmpOrientation = Orientation.PORTRAIT;
                    break;
                case 90:
                    // Handle landscape orientation, top side facing to the right
                    tmpOrientation = Orientation.LANDSCAPE_RIGHT;
                    break;
                case -90:
                    // Handle landscape orientation, top side facing to the left
                    tmpOrientation = Orientation.LANDSCAPE_LEFT;
                    break;
                case 180:
                    tmpOrientation = Orientation.PORTRAIT_UPSIDE_DOWN;
                    break;
                default:
                    tmpOrientation = this._orientationDevice;
                    break;
            }
            return tmpOrientation;
        };
        /*After receive orientation-change event, window.innerWidth & innerHeight may not change immediately,
        so we delay EVENT_TIMEOUT to handle orientation-change.*/
        let handleOrientationChange;
        const orientationChangeCallback = () => {
            if (this._orientationChangeTimeoutId !== -1) {
                clearTimeout(this._orientationChangeTimeoutId);
            }
            this._orientationChangeTimeoutId = setTimeout(() => {
                handleOrientationChange();
            }, EVENT_TIMEOUT);
        };
        if (typeof window.matchMedia === 'function') {
            const updateDPRChangeListener = () => {
                this._dprCleanup?.();
                // Watch actual browser density; comparing/allocating still uses the effective cap.
                const query = window.matchMedia(`(resolution: ${window.devicePixelRatio ?? 1}dppx)`);
                const changed = () => {
                    if (this._layoutStopped)
                        return;
                    if (this.handleResizeEvent)
                        this._updateContainer();
                    updateDPRChangeListener();
                };
                if (query.addEventListener) {
                    query.addEventListener('change', changed, { once: true });
                    this._dprCleanup = () => query.removeEventListener('change', changed);
                }
                else if (query.addListener) {
                    query.addListener(changed);
                    this._dprCleanup = () => query.removeListener(changed);
                }
            };
            this._watchDPR = updateDPRChangeListener;
            updateDPRChangeListener();
            const mediaQueryPortrait = window.matchMedia('(orientation: portrait)');
            const mediaQueryLandscape = window.matchMedia('(orientation: landscape)');
            // eslint-disable-next-line no-restricted-globals
            const hasScreeOrientation = screen.orientation;
            handleOrientationChange = () => {
                let tmpOrientation = this._orientationDevice;
                if (mediaQueryPortrait.matches) {
                    tmpOrientation = Orientation.PORTRAIT;
                    if (hasScreeOrientation) {
                        // eslint-disable-next-line no-restricted-globals
                        const orientationType = screen.orientation.type;
                        if (orientationType === 'portrait-primary') {
                            tmpOrientation = Orientation.PORTRAIT;
                        }
                        else {
                            tmpOrientation = Orientation.PORTRAIT_UPSIDE_DOWN;
                        }
                    }
                }
                else if (mediaQueryLandscape.matches) {
                    tmpOrientation = Orientation.LANDSCAPE;
                    if (hasScreeOrientation) {
                        // eslint-disable-next-line no-restricted-globals
                        const orientationType = screen.orientation.type;
                        if (orientationType === 'landscape-primary') {
                            tmpOrientation = Orientation.LANDSCAPE_LEFT;
                        }
                        else {
                            tmpOrientation = Orientation.LANDSCAPE_RIGHT;
                        }
                    }
                }
                notifyOrientationChange(tmpOrientation);
            };
            if (mediaQueryPortrait.addEventListener) {
                mediaQueryPortrait.addEventListener('change', orientationChangeCallback);
                mediaQueryLandscape.addEventListener('change', orientationChangeCallback);
            }
            else if (mediaQueryPortrait.addListener) {
                mediaQueryPortrait.addListener(orientationChangeCallback);
                mediaQueryLandscape.addListener(orientationChangeCallback);
            }
        }
        else {
            handleOrientationChange = () => {
                const tmpOrientation = getOrientation();
                notifyOrientationChange(tmpOrientation);
            };
            window.addEventListener('orientationchange', orientationChangeCallback);
        }
        document.addEventListener(this._fn.fullscreenchange, () => {
            this._onFullscreenChange?.();
            this.emit('fullscreen-change', this.windowSize.width, this.windowSize.height);
        });
    }
    _convertToSizeInCssPixels(size) {
        const clonedSize = size.clone();
        const dpr = this.devicePixelRatio;
        clonedSize.width /= dpr;
        clonedSize.height /= dpr;
        return clonedSize;
    }
    /**
     * The frame size may be from screen size or an external editor options by setting screen.windowSize.
     * @param sizeInCssPixels you need to specify this size when the windowType is SubFrame.
     */
    _resizeFrame(sizeInCssPixels) {
        if (!this._gameFrame) {
            return;
        }
        // Center align the canvas
        this._gameFrame.style.display = 'flex';
        this._gameFrame.style['justify-content'] = 'center';
        this._gameFrame.style['align-items'] = 'center';
        if (this._windowType === WindowType.SubFrame) {
            if (!sizeInCssPixels) {
                this._updateContainer();
                return;
            }
            this._gameFrame.style.width = `${sizeInCssPixels.width}px`;
            this._gameFrame.style.height = `${sizeInCssPixels.height}px`;
        }
        else {
            const winWidth = window.innerWidth;
            let winHeight = window.innerHeight;
            //On certain android devices, window.innerHeight may not account for the height of the virtual keyboard, so dynamic calculation is necessary.
            const inputHeight = document.body.scrollHeight - winHeight;
            if (systemInfo.os === OS.ANDROID && winHeight < inputHeight) {
                winHeight += inputHeight;
            }
            if (this.isFrameRotated) {
                this._gameFrame.style['-webkit-transform'] = 'rotate(90deg)';
                this._gameFrame.style.transform = 'rotate(90deg)';
                this._gameFrame.style['-webkit-transform-origin'] = '0px 0px 0px';
                this._gameFrame.style.transformOrigin = '0px 0px 0px';
                this._gameFrame.style.margin = `0 0 0 ${winWidth}px`;
                this._gameFrame.style.width = `${winHeight}px`;
                this._gameFrame.style.height = `${winWidth}px`;
            }
            else {
                this._gameFrame.style['-webkit-transform'] = 'rotate(0deg)';
                this._gameFrame.style.transform = 'rotate(0deg)';
                // TODO
                // this._gameFrame.style['-webkit-transform-origin'] = '0px 0px 0px';
                // this._gameFrame.style.transformOrigin = '0px 0px 0px';
                this._gameFrame.style.margin = '0px auto';
                this._gameFrame.style.width = `${winWidth}px`;
                this._gameFrame.style.height = `${winHeight}px`;
            }
        }
        this._updateContainer();
    }
    _getFullscreenTarget() {
        const windowType = this._windowType;
        if (windowType === WindowType.Fullscreen) {
            return document[this._fn.fullscreenElement];
        }
        if (windowType === WindowType.SubFrame) {
            return this._gameFrame;
        }
        // On web mobile, the transform of game frame doesn't work when it's on fullscreen.
        // So we need to make the body fullscreen.
        return document.body;
    }
    _doRequestFullScreen() {
        return new Promise((resolve, reject) => {
            if (!this._supportFullScreen) {
                reject(new Error('fullscreen is not supported'));
                return;
            }
            const fullscreenTarget = this._getFullscreenTarget();
            if (!fullscreenTarget) {
                reject(new Error('Cannot access fullscreen target'));
                return;
            }
            this._onFullscreenChange = undefined;
            this._onFullscreenError = undefined;
            const requestPromise = fullscreenTarget[this._fn.requestFullscreen]();
            if (window.Promise && requestPromise instanceof Promise) {
                requestPromise.then(resolve).catch(reject);
            }
            else {
                this._onFullscreenChange = resolve;
                this._onFullscreenError = reject;
            }
        });
    }
    _updateFrameState() {
        const orientation = this.orientation;
        const width = window.innerWidth;
        const height = window.innerHeight;
        const isBrowserLandscape = width > height;
        this.isFrameRotated = systemInfo.isMobile
            && ((isBrowserLandscape && orientation === Orientation.PORTRAIT)
                || (!isBrowserLandscape && orientation === Orientation.LANDSCAPE));
    }
    _updateContainer() {
        if (!this._gameContainer) {
            warnID(9201);
            return;
        }
        if (this.isProportionalToFrame) {
            if (!this._gameFrame) {
                warnID(9201);
                return;
            }
            // TODO: access designedResolution from Launcher module.
            const designedResolution = legacyCC.view.getDesignResolutionSize();
            const frame = this._gameFrame;
            const frameW = frame.clientWidth;
            const frameH = frame.clientHeight;
            const designW = designedResolution.width;
            const designH = designedResolution.height;
            const scaleX = frameW / designW;
            const scaleY = frameH / designH;
            const containerStyle = this._gameContainer.style;
            let containerW;
            let containerH;
            if (scaleX < scaleY) {
                containerW = frameW;
                containerH = designH * scaleX;
            }
            else {
                containerW = designW * scaleY;
                containerH = frameH;
            }
            // Set window size on game container
            containerStyle.width = `${containerW}px`;
            containerStyle.height = `${containerH}px`;
        }
        else {
            const containerStyle = this._gameContainer.style;
            // game container exact fit game frame.
            containerStyle.width = '100%';
            containerStyle.height = '100%';
        }
        // CSS/parent layout changes need the same native resize chain as inline changes.
        const size = this.windowSize;
        if (size.width <= 0 || size.height <= 0) {
            // Keep the last valid framebuffer while hidden; reveal must notify even at the old size.
            this._measuredLayout = '';
            return;
        }
        const key = [size.width, size.height, this.devicePixelRatio, this.isFrameRotated].join(':');
        if (key !== this._measuredLayout) {
            // Cache before dispatch: view's policy update may re-enter this method.
            this._measuredLayout = key;
            this.emit('window-resize', size.width, size.height);
        }
    }
}
export const screenAdapter = new ScreenAdapter();
checkPalIntegrity(withImpl());
