import { Format, FormatInfos } from '../../cocos/gfx';
import { PixelFormat } from '../../cocos/asset/assets/asset-enum';
import { TextureCube } from '../../cocos/asset/assets/texture-cube';
import type { Scene } from '../../cocos/scene-graph/scene';

export class AirColorContractError extends TypeError {
    constructor (readonly code: string, readonly property: string, message: string) {
        super(`[${code}] ${property}: ${message}`);
        this.name = 'AirColorContractError';
    }
}

const fail = (code: string, property: string, message: string): never => { throw new AirColorContractError(code, property, message); };
const srgbFormats = new Set<number>([Format.SRGB8, Format.SRGB8_A8, Format.BC1_SRGB, Format.BC1_SRGB_ALPHA, Format.BC2_SRGB, Format.BC3_SRGB, Format.BC7_SRGB, Format.ETC2_SRGB8, Format.ETC2_SRGB8_A1, Format.ETC2_SRGB8_A8]);
export function isAirSRGBFormat (format: number): boolean {
    return srgbFormats.has(format) || (format >= Format.ASTC_SRGBA_4X4 && format <= Format.ASTC_SRGBA_12X12);
}
export function isAirDepthFormat (format: number): boolean { return format === Format.DEPTH || format === Format.DEPTH_STENCIL; }

/** Omitting format preserves the caller's native default. An explicitly undefined format is a mistake. */
export function resolveAirTextureFormat (info: { format?: Format | PixelFormat }, defaultFormat: Format = Format.RGBA8): Format {
    const explicit = Object.prototype.hasOwnProperty.call(info, 'format');
    const value = explicit ? info.format : defaultFormat;
    if (explicit && value === undefined) fail('AIR_E_TEXTURE_FORMAT', 'format', 'explicit undefined is not a pixel format; omit format for the default');
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= Format.UNKNOWN
        || (value >= Format.COUNT && ![PixelFormat.RGB_A_PVRTC_2BPPV1, PixelFormat.RGB_A_PVRTC_4BPPV1, PixelFormat.RGBA_ETC1].includes(value as PixelFormat))) {
        fail('AIR_E_TEXTURE_FORMAT', 'format', 'use a supported numeric GFX/PixelFormat value');
    }
    return value as Format;
}

export interface AirTextureColorContract {
    format?: Format | PixelFormat;
    usage: 'color' | 'linear-data' | 'depth';
    decode: 'none' | 'shader-srgb' | 'hardware-srgb';
}
/** Pure preflight: never changes texture bytes, standard material decode or framebuffer output. */
export function validateAirTextureColorContract (input: AirTextureColorContract): Readonly<Required<AirTextureColorContract>> {
    const format = resolveAirTextureFormat(input);
    if (!['color', 'linear-data', 'depth'].includes(input.usage)) fail('AIR_E_TEXTURE_COLOR', 'usage', 'declare color, linear-data or depth');
    if (!['none', 'shader-srgb', 'hardware-srgb'].includes(input.decode)) fail('AIR_E_TEXTURE_COLOR', 'decode', 'declare the actual sampling decode exactly once');
    const srgb = isAirSRGBFormat(format), depth = isAirDepthFormat(format);
    if ((input.usage === 'depth') !== depth) fail('AIR_E_TEXTURE_COLOR', 'format', 'depth usage requires a depth format; depth formats cannot be color/data textures');
    if (input.usage !== 'color' && (srgb || input.decode !== 'none')) fail('AIR_E_TEXTURE_COLOR', 'decode', 'normal/roughness/metallic/depth data must remain linear, with no sRGB decode');
    if ((input.decode === 'hardware-srgb') !== srgb) fail('AIR_E_TEXTURE_COLOR', 'decode', 'hardware-srgb requires an sRGB GPU format; an sRGB format already decodes RGB and must not be software-decoded again');
    return Object.freeze({ format, usage: input.usage, decode: input.decode });
}

export interface AirPrefilteredEnvironmentContract {
    distribution: 'ggx';
    roughnessLevels: readonly number[];
    encoding: 'linear' | 'srgb' | 'rgbe';
    /** Identifies the producer/convolution recipe. This is caller attestation, not proof of filtering quality. */
    source: string;
}
export interface AirPrefilteredEnvironmentReceipt { readonly levels: number; readonly format: number; readonly source: string; readonly lodMapping: 'roughness*envmap.mipmapLevel (clamped)' }
const faces = ['right', 'left', 'top', 'bottom', 'front', 'back'] as const;

/** Validate actual native offline cube data; AUTO box-filtered mipmaps are never called PMREM. */
export function validateAirPrefilteredEnvironment (cube: TextureCube, contract: AirPrefilteredEnvironmentContract): AirPrefilteredEnvironmentReceipt {
    if (!(cube instanceof TextureCube) || !cube.isValid) fail('AIR_E_ENV_PREFILTER', 'cube', 'a live native TextureCube is required');
    if (!cube.isUsingOfflineMipmaps()) fail('AIR_E_ENV_PREFILTER', 'cube.mipmapMode', 'native baked convolution data is required; ordinary/AUTO mipmaps are not PMREM');
    if (contract.distribution !== 'ggx' || typeof contract.source !== 'string' || !contract.source.trim()) fail('AIR_E_ENV_PREFILTER', 'source', 'declare GGX prefilter provenance');
    const levels = cube.mipmaps;
    if (levels.length < 2 || !Array.isArray(contract.roughnessLevels) || contract.roughnessLevels.length !== levels.length) fail('AIR_E_ENV_PREFILTER', 'roughnessLevels', 'provide explicit six-face mipmaps and one roughness value for every level');
    const format = cube.getPixelFormat();
    try { resolveAirTextureFormat({ format }); }
    catch { fail('AIR_E_ENV_PREFILTER', 'format', 'a known native color pixel format is required'); }
    if (cube.mipmapLevel !== levels.length) fail('AIR_E_ENV_PREFILTER', 'cube.mipmapLevel', 'GPU mip count must match the explicit prefiltered levels');
    for (let level = 0; level < levels.length; ++level) {
        const roughness = contract.roughnessLevels[level];
        if (!Number.isFinite(roughness) || Math.abs(roughness - level / levels.length) > 1e-6) fail('AIR_E_ENV_PREFILTER', 'roughnessLevels', 'native standard shader uses roughness*envmap.mipmapLevel, clamped to the last mip; incompatible schedules need a custom shader');
        const width = Math.max(1, cube.width >> level);
        for (const face of faces) {
            const image = levels[level][face];
            if (!image || !image.isValid || image.width !== width || image.height !== width || image.format !== format) fail('AIR_E_ENV_PREFILTER', `mipmaps[${level}].${face}`, 'all six native image faces must have matching square mip dimensions and format');
        }
    }
    if (!['linear', 'srgb', 'rgbe'].includes(contract.encoding) || isAirDepthFormat(format)) fail('AIR_E_ENV_PREFILTER', 'encoding', 'declare a color encoding for the filtered environment');
    if (contract.encoding === 'linear') fail('AIR_E_ENV_PREFILTER', 'encoding', 'native standard environment sampling decodes sRGB or RGBE; linear input requires a custom environment shader');
    if (cube.isRGBE !== (contract.encoding === 'rgbe')) fail('AIR_E_ENV_PREFILTER', 'cube.isRGBE', 'native cube RGBE metadata must match the declared encoding');
    // Native environment shaders software-decode sRGB/RGBE; hardware sRGB would double-decode.
    if (isAirSRGBFormat(format)) fail('AIR_E_ENV_PREFILTER', 'format', 'native environment shaders use software decode; hardware sRGB requires an explicit custom environment shader');
    return Object.freeze({ levels: levels.length, format, source: contract.source, lodMapping: 'roughness*envmap.mipmapLevel (clamped)' });
}

/** Bind already validated native data. Does not generate convolution, enable IBL or change exposure. */
export function bindAirPrefilteredEnvironment (scene: Scene, cube: TextureCube, contract: AirPrefilteredEnvironmentContract): AirPrefilteredEnvironmentReceipt {
    const receipt = validateAirPrefilteredEnvironment(cube, contract);
    const envmap = scene?.globals.skybox.envmap;
    if (!scene?.isValid || !envmap) fail('AIR_E_ENV_PREFILTER', 'scene.envmap', 'set a compatible native environment map first; this helper does not implicitly enable lighting');
    if (envmap!.isRGBE !== cube.isRGBE) fail('AIR_E_ENV_PREFILTER', 'scene.envmap.isRGBE', 'the native shader decode macro comes from envmap; reflectionMap encoding must match it');
    if (envmap!.mipmapLevel !== receipt.levels) fail('AIR_E_ENV_PREFILTER', 'scene.envmap.mipmapLevel', 'native roughness LOD comes from envmap; its mip count must match reflectionMap');
    scene.globals.skybox.reflectionMap = cube;
    return receipt;
}

export function describeAirTextureFormat (format: number): Readonly<{ format: number; name: string; srgb: boolean; depth: boolean }> {
    return Object.freeze({ format, name: FormatInfos[format]?.name || PixelFormat[format] || 'UNKNOWN', srgb: isAirSRGBFormat(format), depth: isAirDepthFormat(format) });
}
