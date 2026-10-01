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
export var Platform;
(function (Platform) {
    Platform["UNKNOWN"] = "UNKNOWN";
    // Web Based
    Platform["EDITOR_PAGE"] = "EDITOR_PAGE";
    Platform["EDITOR_CORE"] = "EDITOR_CORE";
    Platform["NODEJS_PAGE"] = "NODEJS_PAGE";
    Platform["MOBILE_BROWSER"] = "MOBILE_BROWSER";
    Platform["DESKTOP_BROWSER"] = "DESKTOP_BROWSER";
    // Native
    Platform["WIN32"] = "WIN32";
    Platform["ANDROID"] = "ANDROID";
    Platform["IOS"] = "IOS";
    Platform["MACOS"] = "MACOS";
    Platform["OHOS"] = "OHOS";
    Platform["OPENHARMONY"] = "OPENHARMONY";
    // Minigame
    Platform["WECHAT_GAME"] = "WECHAT_GAME";
    Platform["WECHAT_MINI_PROGRAM"] = "WECHAT_MINI_PROGRAM";
    Platform["XIAOMI_QUICK_GAME"] = "XIAOMI_QUICK_GAME";
    Platform["ALIPAY_MINI_GAME"] = "ALIPAY_MINI_GAME";
    Platform["TAOBAO_CREATIVE_APP"] = "TAOBAO_CREATIVE_APP";
    Platform["TAOBAO_MINI_GAME"] = "TAOBAO_MINI_GAME";
    Platform["BYTEDANCE_MINI_GAME"] = "BYTEDANCE_MINI_GAME";
    // Runtime Based
    Platform["OPPO_MINI_GAME"] = "OPPO_MINI_GAME";
    Platform["VIVO_MINI_GAME"] = "VIVO_MINI_GAME";
    Platform["HUAWEI_QUICK_GAME"] = "HUAWEI_QUICK_GAME";
    Platform["MIGU_MINI_GAME"] = "MIGU_MINI_GAME";
    Platform["HONOR_MINI_GAME"] = "HONOR_MINI_GAME";
    Platform["SUD_MINI_GAME"] = "SUD_MINI_GAME";
    Platform["SUDV2_MINI_GAME"] = "SUDV2_MINI_GAME";
})(Platform || (Platform = {}));
