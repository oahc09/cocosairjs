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
