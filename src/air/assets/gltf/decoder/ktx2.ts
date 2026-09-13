/**
 * KTX2/BasisU adapter. Wraps the official Basis Universal `KTX2File` transcoder
 * (three.js `basis_transcoder.js` build) so the loader never depends on a specific
 * distribution: only `initializeBasis` and the documented KTX2File surface are used.
 * The provider owns the WASM module lifetime; zstd supercompression is handled by the
 * transcoder build itself. Target-format choice follows the caller's device capability
 * order and falls back to RGBA8 (the transcoder's documented last resort).
 */
import { Format } from '../../../../cocos/gfx';
import { GLTFError } from '../diagnostics';
import { KTX2_RAW_MIME } from './types';
import type { DecodedTextureSource, GLTFKTX2Transcoder, KTX2TargetFormat } from './types';

/** BasisFormat / TranscoderFormat numeric enums (Basis Universal C++ values). */
const BASIS_UASTC = 1;
const TF = { ETC2: 1, BC7_M5: 7, ASTC_4x4: 10, RGBA32: 13 };

/** Structural subset of the Basis module surfaced by the UMD factory. */
export interface BasisTranscoderModule {
    initializeBasis (): void;
    KTX2File: new (data: Uint8Array) => BasisKTX2File;
    KTX2_KHR_DF_TRANSFER_SRGB?: number;
}

/** Per-side texture dimension ceiling for transcoder output (plan §10 allocation limits). */
export const MAX_KTX2_DIMENSION = 16384;

interface BasisLevelInfo { width: number; height: number; origWidth: number; origHeight: number; }

interface BasisKTX2File {
    isValid (): boolean;
    isUASTC (): boolean;
    getWidth (): number;
    getHeight (): number;
    getLayers (): number;
    getLevels (): number;
    getFaces (): number;
    getHasAlpha (): boolean;
    getDFDFlags (): number;
    startTranscoding (): boolean;
    getImageLevelInfo (mip: number, layer: number, face: number): BasisLevelInfo;
    getImageTranscodedSizeInBytes (mip: number, layer: number, face: number, format: number): number;
    transcodeImage (dst: Uint8Array, mip: number, layer: number, face: number, format: number,
        decodeFlags: number, x: number, y: number): boolean;
    close (): void;
    delete (): void;
}

/** Mirrors createDracoDecoder: returns (or lazily produces) the initialized Basis module. */
export type BasisModuleFactory = () => BasisTranscoderModule | Promise<BasisTranscoderModule>;

interface Candidate { transcoder: number; format: number; compressed: boolean; }

// Ranked defaults per Basis flavor (three.js ordering, Air device names).
const UASTC_RANKED: KTX2TargetFormat[] = ['ASTC_4x4', 'BC7', 'ETC2_RGBA8'];
const ETC1S_RANKED: KTX2TargetFormat[] = ['ETC2_RGBA8', 'ASTC_4x4', 'BC7'];

const FORMAT_BY_TARGET: Record<Exclude<KTX2TargetFormat, 'RGBA8' | 'RGBA8_SRGB'>, { transcoder: number; opaque: number; alpha: number }> = {
    ASTC_4x4: { transcoder: TF.ASTC_4x4, opaque: Format.ASTC_RGBA_4X4, alpha: Format.ASTC_RGBA_4X4 },
    ASTC_4x4_SRGB: { transcoder: TF.ASTC_4x4, opaque: Format.ASTC_RGBA_4X4, alpha: Format.ASTC_RGBA_4X4 },
    BC7: { transcoder: TF.BC7_M5, opaque: Format.BC7, alpha: Format.BC7 },
    BC7_SRGB: { transcoder: TF.BC7_M5, opaque: Format.BC7_SRGB, alpha: Format.BC7_SRGB },
    ETC2_RGBA8: { transcoder: TF.ETC2, opaque: Format.ETC2_RGB8, alpha: Format.ETC2_RGBA8 },
    ETC2_SRGB8_ALPHA8: { transcoder: TF.ETC2, opaque: Format.ETC2_SRGB8, alpha: Format.ETC2_SRGB8_A8 },
    // RGB-only hints still need an alpha-capable slot when the source has alpha.
    ETC2_RGB8: { transcoder: TF.ETC2, opaque: Format.ETC2_RGB8, alpha: Format.ETC2_RGBA8 },
    ETC2_SRGB8: { transcoder: TF.ETC2, opaque: Format.ETC2_SRGB8, alpha: Format.ETC2_SRGB8_A8 },
};

function srgbVariant (format: number, srgb: boolean): number {
    if (!srgb) { return format; }
    const map: Record<number, number> = {
        [Format.BC7]: Format.BC7_SRGB,
        [Format.ETC2_RGB8]: Format.ETC2_SRGB8,
        [Format.ETC2_RGBA8]: Format.ETC2_SRGB8_A8,
        [Format.RGBA8]: Format.RGBA8, // no RGBA8 sRGB split in this GFX enum; stays RGBA8.
    };
    return map[format] ?? format;
}

function candidateFor (name: KTX2TargetFormat, hasAlpha: boolean, srgb: boolean): Candidate | null {
    if (name === 'RGBA8') { return { transcoder: TF.RGBA32, format: srgbVariant(Format.RGBA8, srgb), compressed: false }; }
    if (name === 'RGBA8_SRGB') { return { transcoder: TF.RGBA32, format: srgbVariant(Format.RGBA8, srgb), compressed: false }; }
    const entry = FORMAT_BY_TARGET[name];
    if (!entry) { return null; }
    return { transcoder: entry.transcoder, format: srgbVariant(hasAlpha ? entry.alpha : entry.opaque, srgb), compressed: true };
}

/** True when the module exposes the KTX2File surface used by this adapter. */
export function isKTX2Available (module: BasisTranscoderModule | undefined): boolean {
    return !!module && typeof module.initializeBasis === 'function' && typeof module.KTX2File === 'function';
}

export function createKTX2Transcoder (factory: BasisModuleFactory): GLTFKTX2Transcoder {
    let modulePromise: Promise<BasisTranscoderModule> | null = null;
    const getModule = (): Promise<BasisTranscoderModule> => {
        modulePromise = modulePromise || Promise.resolve(factory()).then((module) => {
            if (!isKTX2Available(module)) {
                throw new GLTFError('GLTF_DECODER_MISSING', 'Basis transcoder module lacks initializeBasis/KTX2File');
            }
            module.initializeBasis();
            return module;
        });
        return modulePromise;
    };
    return {
        async transcode (data: ArrayBuffer, supportedFormats?: readonly KTX2TargetFormat[]): Promise<DecodedTextureSource> {
            const module = await getModule();
            const file = new module.KTX2File(new Uint8Array(data));
            try {
                if (!file.isValid()) { throw new GLTFError('GLTF_DECODE_FAILED', 'invalid or unsupported .ktx2 payload'); }
                const width = file.getWidth(); const height = file.getHeight(); const levels = file.getLevels();
                if (!width || !height || !levels) { throw new GLTFError('GLTF_DECODE_FAILED', 'ktx2: zero dimensions or levels'); }
                // §10 allocation ceilings: reject absurd dimensions before transcoding so a
                // hostile archive cannot request terabyte-sized output buffers.
                if (width > MAX_KTX2_DIMENSION || height > MAX_KTX2_DIMENSION) {
                    throw new GLTFError('GLTF_DECODE_FAILED', `ktx2: dimensions ${width}x${height} exceed the ${MAX_KTX2_DIMENSION} ceiling`);
                }
                if (file.getFaces() !== 1 || (file.getLayers() || 1) !== 1) {
                    throw new GLTFError('GLTF_DECODE_FAILED', 'ktx2: only single-face non-array images are supported');
                }
                const hasAlpha = file.getHasAlpha();
                const srgb = (file.getDFDFlags() & (module.KTX2_KHR_DF_TRANSFER_SRGB ?? 0x40)) !== 0;
                // Candidate order: explicit device list, else ranked defaults for the Basis flavor.
                const names: KTX2TargetFormat[] = supportedFormats && supportedFormats.length
                    ? [...supportedFormats]
                    : [...(file.isUASTC() ? UASTC_RANKED : ETC1S_RANKED)];
                if (!names.includes('RGBA8')) { names.push('RGBA8'); }
                const candidates: Candidate[] = [];
                for (const name of names) {
                    const candidate = candidateFor(name, hasAlpha, srgb);
                    if (candidate && !candidates.some((c) => c.transcoder === candidate.transcoder && c.format === candidate.format)) {
                        candidates.push(candidate);
                    }
                }
                for (const candidate of candidates) {
                    const result = transcodeAll(file, width, height, levels, candidate);
                    if (result) { return result; }
                }
                throw new GLTFError('GLTF_DECODE_FAILED', `ktx2: all ${candidates.length} transcode targets failed`);
            } finally {
                file.close();
                file.delete();
            }
        },
    };
}

function transcodeAll (file: BasisKTX2File, width: number, height: number, levels: number, candidate: Candidate): DecodedTextureSource | null {
    if (!file.startTranscoding()) { return null; }
    const parts: Uint8Array[] = [];
    const sizes: number[] = [];
    for (let mip = 0; mip < levels; ++mip) {
        const info = file.getImageLevelInfo(mip, 0, 0);
        // Multi-level textures keep original dimensions per level; single level may be non-POT.
        void info;
        let size: number;
        try { size = file.getImageTranscodedSizeInBytes(mip, 0, 0, candidate.transcoder); }
        catch (error) { void error; return null; }
        if (!size) { return null; }
        const dst = new Uint8Array(size);
        if (!file.transcodeImage(dst, mip, 0, 0, candidate.transcoder, 0, -1, -1)) { return null; }
        parts.push(dst); sizes.push(size);
    }
    void width; void height;
    const total = sizes.reduce((sum, size) => sum + size, 0);
    const data = new Uint8Array(total);
    let at = 0;
    for (const part of parts) { data.set(part, at); at += part.byteLength; }
    return { data, mimeType: KTX2_RAW_MIME, width, height, format: candidate.format, compressed: candidate.compressed, mipmapLevelDataSize: sizes };
}
