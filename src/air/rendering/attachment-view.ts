/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 of the Software, and to permit persons to whom the Software is furnished to
 do so, subject to the following conditions:

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
import { TextureBase } from '../../cocos/asset/assets/texture-base';
import { PixelFormat, TextureFilter, WrapMode } from '../../cocos/asset/assets/asset-enum';
import type { Format } from '../../cocos/gfx/base/define';
import type { Texture } from '../../cocos/gfx/base/texture';

/** Borrows its native texture; destroying this Asset view never destroys that allocation. */
export class AttachmentView extends TextureBase {
    constructor(
        private readonly read: () => Texture,
        format: Format,
        filter: 'nearest' | 'linear',
    ) {
        super();
        this._format = format as unknown as PixelFormat;
        this.setWrapMode(WrapMode.CLAMP_TO_EDGE, WrapMode.CLAMP_TO_EDGE);
        this.setFilters(
            filter === 'linear' ? TextureFilter.LINEAR : TextureFilter.NEAREST,
            filter === 'linear' ? TextureFilter.LINEAR : TextureFilter.NEAREST,
        );
        this.setMipFilter(TextureFilter.NONE);
    }
    public getGFXTexture(): Texture {
        return this.read();
    }
    public updateSize(width: number, height: number): void {
        this._width = width;
        this._height = height;
    }
}
