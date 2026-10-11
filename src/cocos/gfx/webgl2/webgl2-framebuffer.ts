/*
 Copyright (c) 2020-2023 Xiamen Yaji Software Co., Ltd.

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

import { FramebufferInfo } from '../base/define';
import { Framebuffer } from '../base/framebuffer';
import { WebGL2CmdFuncCreateFramebuffer, WebGL2CmdFuncDestroyFramebuffer } from './webgl2-commands';
import { WebGL2DeviceManager } from './webgl2-define';
import { IWebGL2GPUFramebuffer, IWebGL2GPUTextureView } from './webgl2-gpu-objects';
import { WebGL2RenderPass } from './webgl2-render-pass';
import { WebGL2Texture } from './webgl2-texture';

/** @mangle */
export class WebGL2Framebuffer extends Framebuffer {
    constructor () {
        super();
    }

    getGpuFramebuffer (): IWebGL2GPUFramebuffer {
        return  this._gpuFramebuffer!;
    }

    private _gpuFramebuffer: IWebGL2GPUFramebuffer | null = null;
    private _gpuColorViews: (WebGLTexture | WebGLRenderbuffer | null)[] = [];
    private _gpuDepthStencilView: WebGLTexture | WebGLRenderbuffer | null | undefined;

    get width (): number {
        return this._gpuFramebuffer?.width ?? this._width;
    }

    get height (): number {
        return this._gpuFramebuffer?.height ?? this._height;
    }

    get needRebuild (): boolean {
        const gpuFramebuffer = this.getGpuFramebuffer();
        if (gpuFramebuffer) {
            for (let i = 0; i < gpuFramebuffer.gpuColorViews.length; i++) {
                const texture = gpuFramebuffer.gpuColorViews[i].gpuTexture;
                if ((texture.glTexture ?? texture.glRenderbuffer) !== this._gpuColorViews[i]) {
                    return true;
                }
            }
            const depth = gpuFramebuffer.gpuDepthStencilView?.gpuTexture;
            if ((depth ? (depth.glTexture ?? depth.glRenderbuffer) : undefined) !== this._gpuDepthStencilView) {
                return true;
            }
        }

        return false;
    }

    public initialize (info: Readonly<FramebufferInfo>): void {
        this._renderPass = info.renderPass;
        this._colorTextures = info.colorTextures || [];
        this._depthStencilTexture = info.depthStencilTexture || null;

        const gpuColorViews: IWebGL2GPUTextureView[] = [];
        for (let i = 0; i < info.colorTextures.length; i++) {
            const colorTexture = info.colorTextures[i] as WebGL2Texture;
            if (colorTexture) {
                gpuColorViews.push(colorTexture.gpuTextureView);
            }
        }

        let gpuDepthStencilView: IWebGL2GPUTextureView | null = null;
        if (info.depthStencilTexture) {
            gpuDepthStencilView = (info.depthStencilTexture as WebGL2Texture).gpuTextureView;
        }

        let width = Number.MAX_SAFE_INTEGER;
        let height = Number.MAX_SAFE_INTEGER;
        this._gpuFramebuffer = {
            gpuRenderPass: (info.renderPass as WebGL2RenderPass).getGpuRenderPass(),
            gpuColorViews,
            gpuDepthStencilView,
            glFramebuffer: null,
            isOffscreen: true,
            get width (): number {
                let result = Number.MAX_SAFE_INTEGER;
                for (const view of this.gpuColorViews) {
                    result = Math.min(result, Math.max(1, Math.floor(view.gpuTexture.width / (2 ** view.baseLevel))));
                }
                if (this.gpuDepthStencilView) {
                    const view = this.gpuDepthStencilView;
                    result = Math.min(result, Math.max(1, Math.floor(view.gpuTexture.width / (2 ** view.baseLevel))));
                }
                return result === Number.MAX_SAFE_INTEGER ? width : result;
            },
            set width (val) {
                width = val;
            },
            get height (): number {
                let result = Number.MAX_SAFE_INTEGER;
                for (const view of this.gpuColorViews) {
                    result = Math.min(result, Math.max(1, Math.floor(view.gpuTexture.height / (2 ** view.baseLevel))));
                }
                if (this.gpuDepthStencilView) {
                    const view = this.gpuDepthStencilView;
                    result = Math.min(result, Math.max(1, Math.floor(view.gpuTexture.height / (2 ** view.baseLevel))));
                }
                return result === Number.MAX_SAFE_INTEGER ? height : result;
            },
            set height (val) {
                height = val;
            },
        };

        WebGL2CmdFuncCreateFramebuffer(WebGL2DeviceManager.instance, this._gpuFramebuffer);
        this._gpuColorViews.length = 0;
        this._gpuFramebuffer.gpuColorViews.forEach((tex) => this._gpuColorViews.push(tex.gpuTexture.glTexture ?? tex.gpuTexture.glRenderbuffer));
        const depth = this._gpuFramebuffer.gpuDepthStencilView?.gpuTexture;
        this._gpuDepthStencilView = depth ? (depth.glTexture ?? depth.glRenderbuffer) : undefined;
        this._width = this._gpuFramebuffer.width;
        this._height = this._gpuFramebuffer.height;
    }

    public destroy (): void {
        if (this._gpuFramebuffer) {
            WebGL2CmdFuncDestroyFramebuffer(WebGL2DeviceManager.instance, this._gpuFramebuffer);
            this._gpuFramebuffer = null;
            this._gpuColorViews.length = 0;
            this._gpuDepthStencilView = null;
        }
    }
}
