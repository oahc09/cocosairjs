/**
 * `KHR_meshopt_compression` / `EXT_meshopt_compression`: bufferView-level decompression.
 * Both schemas share one decode core; each handler validates its own extension payload and
 * applies the same fallback rule: without a decoder, an optional extension falls back to the
 * (uncompressed) bufferView data, while a required one fails with `GLTF_DECODER_MISSING`.
 */
import { GLTFError } from '../../diagnostics';
import type { GLTFExtensionFactory, GLTFExtensionHandler } from '../../extension-registry';
import { DependencyKeys } from '../../parser-context';
import type { GLTFParserContext } from '../../parser-context';
import { integer, item, MeshoptCompressionDef } from '../../schema';

export const KHR_MESHOPT_COMPRESSION = 'KHR_meshopt_compression';
export const EXT_MESHOPT_COMPRESSION = 'EXT_meshopt_compression';

const MODES = ['ATTRIBUTES', 'TRIANGLES', 'INDICES'];
const FILTERS = ['NONE', 'OCTAHEDRAL', 'QUATERNION', 'EXPONENTIAL'];

/** Accepts both the string schema and the integer mode/filter of the early KHR draft. */
export function normalizeMode (value: unknown, extension: string): string {
    const mode = typeof value === 'number' ? MODES[value] : typeof value === 'string' ? value : undefined;
    if (!mode || !MODES.includes(mode)) {
        throw new GLTFError('GLTF_EXTENSION_INVALID', `${extension}: invalid mode ${String(value)}`, extension);
    }
    return mode;
}
export function normalizeFilter (value: unknown, extension: string): string {
    if (value === undefined) { return 'NONE'; }
    // KHR_meshopt_compression adds the COLOR filter (value 4); the earlier EXT draft stops at EXPONENTIAL.
    const filters = extension === KHR_MESHOPT_COMPRESSION ? [...FILTERS, 'COLOR'] : FILTERS;
    const filter = typeof value === 'number' ? filters[value] : typeof value === 'string' ? value : undefined;
    if (!filter || !filters.includes(filter)) {
        throw new GLTFError('GLTF_EXTENSION_INVALID', `${extension}: invalid filter ${String(value)}`, extension);
    }
    return filter;
}

async function decodeBufferView (context: GLTFParserContext, index: number, definition: MeshoptCompressionDef,
    extension: string): Promise<Uint8Array | null> {
    const view = item(context.json.bufferViews, index, 'bufferView');
    const mode = normalizeMode(definition.mode, extension);
    const filter = normalizeFilter(definition.filter, extension);
    integer(definition.buffer, `${extension} buffer index`);
    const offset = integer(definition.byteOffset || 0, `${extension} byteOffset`);
    const length = integer(definition.byteLength, `${extension} byteLength`);
    const stride = integer(definition.byteStride, `${extension} byteStride`);
    const count = integer(definition.count, `${extension} count`);
    if (length <= 0 || count <= 0) {
        throw new GLTFError('GLTF_EXTENSION_INVALID', `${extension} on bufferView ${index}: empty payload`, extension);
    }
    // Filters only apply to attribute data; index payloads must be unfiltered.
    if (mode !== 'ATTRIBUTES' && filter !== 'NONE') {
        throw new GLTFError('GLTF_EXTENSION_INVALID', `${extension} on bufferView ${index}: filter ${filter} requires ATTRIBUTES mode`, extension);
    }
    // KHR allows byteStride up to 256; the EXT draft capped at 252.
    const maxStride = extension === KHR_MESHOPT_COMPRESSION ? 256 : 252;
    if (mode === 'ATTRIBUTES' && (stride % 4 !== 0 || stride < 4 || stride > maxStride)) {
        throw new GLTFError('GLTF_EXTENSION_INVALID', `${extension} on bufferView ${index}: invalid byteStride ${stride}`, extension);
    }
    if ((filter === 'OCTAHEDRAL' || filter === 'COLOR') && stride !== 4 && stride !== 8) {
        throw new GLTFError('GLTF_EXTENSION_INVALID', `${extension} on bufferView ${index}: filter ${filter} requires byteStride 4 or 8`, extension);
    }
    if (filter === 'QUATERNION' && stride !== 8) {
        throw new GLTFError('GLTF_EXTENSION_INVALID', `${extension} on bufferView ${index}: filter QUATERNION requires byteStride 8`, extension);
    }
    if (filter === 'EXPONENTIAL' && stride % 4 !== 0) {
        throw new GLTFError('GLTF_EXTENSION_INVALID', `${extension} on bufferView ${index}: filter EXPONENTIAL requires byteStride divisible by 4`, extension);
    }
    if ((mode === 'TRIANGLES' || mode === 'INDICES') && stride !== 2 && stride !== 4) {
        throw new GLTFError('GLTF_EXTENSION_INVALID', `${extension} on bufferView ${index}: mode ${mode} requires byteStride 2 or 4`, extension);
    }
    if (mode === 'TRIANGLES' && count % 3 !== 0) {
        throw new GLTFError('GLTF_EXTENSION_INVALID', `${extension} on bufferView ${index}: TRIANGLES count must be divisible by 3`, extension);
    }
    if (view.byteLength !== count * stride) {
        throw new GLTFError('GLTF_EXTENSION_INVALID', `${extension} on bufferView ${index}: byteLength must equal count * byteStride`, extension);
    }
    const decoder = context.options.meshoptDecoder;
    if (!decoder) {
        if (context.json.extensionsRequired?.includes(extension)) {
            throw new GLTFError('GLTF_DECODER_MISSING', `${extension}: configure a decoder with setMeshoptDecoder()`, extension);
        }
        context.warn(`${extension} on bufferView ${index}: decoder missing, falling back to uncompressed data`);
        return null;
    }
    const buffer = item(context.buffers, definition.buffer, `${extension} buffer`);
    if (offset + length > buffer.byteLength) {
        throw new GLTFError('GLTF_EXTENSION_INVALID', `${extension} on bufferView ${index}: encoded range out of bounds`, extension);
    }
    const source = new Uint8Array(buffer, offset, length);
    const decoded = await decoder.decodeGltfBufferAsync(count, stride, source, mode, filter)
        .catch((error: unknown) => {
            throw new GLTFError('GLTF_DECODE_FAILED', `${extension} on bufferView ${index}: ${(error as Error).message}`, extension);
        }) as ArrayBuffer | Uint8Array;
    const bytes = decoded instanceof Uint8Array ? decoded : new Uint8Array(decoded);
    if (bytes.byteLength !== count * stride || bytes.byteLength !== view.byteLength) {
        throw new GLTFError('GLTF_DECODE_FAILED', `${extension} on bufferView ${index}: decoded ${bytes.byteLength} bytes, expected ${view.byteLength}`, extension);
    }
    return bytes;
}

/** Creates a handler for either compression extension; both share the decode core. */
export function meshoptCompressionFactory (extension: string): GLTFExtensionFactory {
    return (context: GLTFParserContext): GLTFExtensionHandler => ({
        name: extension,
        providesPlaceholders: true, // decompresses views whose parent buffer is a no-URI placeholder
        support: () => (context.options.meshoptDecoder
            ? { name: extension, status: 'supported' as const }
            : { name: extension, status: 'decoder-required' as const, reason: 'configure a decoder with setMeshoptDecoder()' }),
        loadBufferView (index, ctx) {
            const view = item(ctx.json.bufferViews, index, 'bufferView');
            const definition = view.extensions?.[extension] as MeshoptCompressionDef | undefined;
            if (!definition) { return Promise.resolve(null); }
            // Same key for repeated accessors on one view: the payload is decoded once.
            return ctx.dependency(DependencyKeys.decodedBufferView(index),
                () => decodeBufferView(ctx, index, definition, extension)) as Promise<Uint8Array | null>;
        },
    });
}
