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
import { Format, FormatInfos, FormatType } from '../../cocos/gfx/base/define';

export function validateIntegerAttachmentClear(format: Format, values: readonly number[], code: string): void {
    const info = FormatInfos[format];
    if (info.type !== FormatType.INT && info.type !== FormatType.UINT) return;
    for (let channel = 0; channel < info.count; ++channel) {
        const bits = format === Format.RGB10A2UI ? (channel === 3 ? 2 : 10) : (info.size * 8) / info.count;
        const lower = info.type === FormatType.INT ? -(2 ** (bits - 1)) : 0;
        const upper = info.type === FormatType.INT ? 2 ** (bits - 1) - 1 : 2 ** bits - 1;
        if (!Number.isInteger(values[channel]) || values[channel] < lower || values[channel] > upper)
            throw Object.assign(new RangeError(`${code}: ${info.name} channel ${channel}`), { code, format, channel });
    }
}
