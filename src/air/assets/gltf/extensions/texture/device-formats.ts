/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

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
/**
 * Device-side transcode target detection for KTX2/BasisU. Ordered by preference
 * (desktop BC7 first, mobile ASTC/ETC2); RGBA8 is appended by the transcoder adapter.
 * Returns undefined (let the transcoder use its own ranking) when no device is up yet.
 */
import { deviceManager, Format, FormatFeatureBit } from '../../../../../cocos/gfx';
import type { KTX2TargetFormat } from '../../decoder/types';

export function deviceKTX2Formats (): KTX2TargetFormat[] | undefined {
    const device = deviceManager.gfxDevice;
    if (!device) { return undefined; }
    const sampled = (format: Format): boolean => (device.getFormatFeatures(format) & FormatFeatureBit.SAMPLED_TEXTURE) !== 0;
    const targets: KTX2TargetFormat[] = [];
    // BC7 covers alpha + sRGB quality on desktop (BPTC).
    if (sampled(Format.BC7) && sampled(Format.BC7_SRGB)) { targets.push('BC7'); }
    if (sampled(Format.ASTC_RGBA_4X4)) { targets.push('ASTC_4x4'); }
    if (sampled(Format.ETC2_RGBA8) && sampled(Format.ETC2_SRGB8_A8)) { targets.push('ETC2_RGBA8'); }
    return targets;
}
