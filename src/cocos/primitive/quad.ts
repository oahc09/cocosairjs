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

import { applyDefaultGeometryOptions, IGeometry, IGeometryOptions } from './define';

interface IQuadOptions extends RecursivePartial<IGeometryOptions> {
    /** Width on the X axis. Defaults to 1. */
    width?: number;
    /** Height on the Y axis. Defaults to 1. */
    height?: number;
}

/**
 * @en
 * Generate a quad with configurable width and height (both default to 1), centered at origin.
 * @zh
 * 生成一个四边形，宽高默认都为1，中心在原点。
 * @param options @zh 参数选项。 @en The optional creation parameters of the quad
 */
export default function quad (options?: IQuadOptions): IGeometry {
    const normalizedOptions = applyDefaultGeometryOptions(options);
    const hw = (options?.width ?? 1) * 0.5;
    const hh = (options?.height ?? 1) * 0.5;
    const result: IGeometry = {
        positions: [
            -hw, -hh, 0, // bottom-left
            -hw,  hh, 0, // top-left
            hw,  hh, 0, // top-right
            hw, -hh, 0, // bottom-right
        ],
        indices: [
            0, 3, 1,
            3, 2, 1,
        ],
        minPos: {
            x: -Math.abs(hw), y: -Math.abs(hh), z: 0,
        },
        maxPos: {
            x: Math.abs(hw), y: Math.abs(hh), z: 0,
        },
        boundingRadius: Math.sqrt(hw * hw + hh * hh),
    };
    if (normalizedOptions.includeNormal !== false) {
        result.normals = [
            0, 0, 1,
            0, 0, 1,
            0, 0, 1,
            0, 0, 1,
        ];
    }
    if (normalizedOptions.includeUV !== false) {
        result.uvs = [
            0, 0,
            0, 1,
            1, 1,
            1, 0,
        ];
    }
    return result;
}
