/**
 * `KHR_draco_mesh_compression`: primitive-level geometry decompression. The handler maps the
 * extension's Draco attribute ids, decodes through the injected provider and validates the
 * result against the glTF accessors before the shared mesh builder consumes it.
 */
import { GLTFError } from '../../diagnostics';
import type { DracoAttributeInfo, GLTFDracoDecoder } from '../../decoder/types';
import type { GLTFExtensionFactory, GLTFExtensionHandler } from '../../extension-registry';
import { DependencyKeys } from '../../parser-context';
import type { GLTFParserContext } from '../../parser-context';
import { DracoCompressionDef, integer, item } from '../../schema';

export const KHR_DRACO_MESH_COMPRESSION = 'KHR_draco_mesh_compression';

const EXTENSION = KHR_DRACO_MESH_COMPRESSION;

/** Every post-decode validation failure is a stable GLTF_DECODE_FAILED error. */
function fail (message: string): never {
    throw new GLTFError('GLTF_DECODE_FAILED', `${EXTENSION}: ${message}`, EXTENSION);
}

/** Decodes one Draco primitive and cross-checks it against the declared glTF accessors. */
async function decodePrimitive (context: GLTFParserContext, meshIndex: number, primitiveIndex: number,
    definition: DracoCompressionDef, decoder: GLTFDracoDecoder): Promise<import('../../decoder/types').DecodedPrimitive> {
    const mesh = item(context.json.meshes, meshIndex, 'mesh');
    const primitive = item(mesh.primitives, primitiveIndex, 'primitive');
    const attributes: DracoAttributeInfo[] = Object.entries(definition.attributes || {})
        .map(([semantic, id]) => ({ semantic, id: integer(id, `Draco attribute ${semantic}`) }));
    if (!attributes.some((info) => info.semantic === 'POSITION')) {
        throw new GLTFError('GLTF_EXTENSION_INVALID', `${EXTENSION}: POSITION attribute is required`, EXTENSION);
    }
    const bytes = context.bufferView(definition.bufferView);
    const result = await decoder.decodePrimitive(bytes.slice().buffer, attributes, context.json)
        .catch((error: unknown) => {
            if (error instanceof GLTFError) { throw error; }
            throw new GLTFError('GLTF_DECODE_FAILED', `${KHR_DRACO_MESH_COMPRESSION} on mesh ${meshIndex}: ${(error as Error).message}`,
                KHR_DRACO_MESH_COMPRESSION);
        });
    const position = result.attributes.POSITION;
    if (!position) { fail('decoded primitive has no POSITION'); }
    const count = position.length / 3;
    for (const [semantic, values] of Object.entries(result.attributes)) {
        const width = semantic === 'POSITION' || semantic === 'NORMAL' ? 3 : /^TEXCOORD_\d+$/.test(semantic) ? 2 : 4;
        if (values.length !== count * width) { fail(`decoded ${semantic} has ${values.length} components, expected ${count * width}`); }
        const accessorIndex = primitive.attributes[semantic];
        if (accessorIndex !== undefined) {
            const accessor = item(context.json.accessors, accessorIndex, `accessor for ${semantic}`);
            if (accessor.count !== count) { fail(`decoded ${semantic} count ${count} does not match accessor count ${accessor.count}`); }
        }
    }
    if (result.indices && !result.indices.every((index) => index < count)) { fail('index exceeds decoded vertex count'); }
    return result;
}

export const dracoCompressionFactory: GLTFExtensionFactory = (context: GLTFParserContext): GLTFExtensionHandler => {
    const decoder = context.options.dracoDecoder;
    return {
        name: KHR_DRACO_MESH_COMPRESSION,
        support: () => (decoder
            ? { name: KHR_DRACO_MESH_COMPRESSION, status: 'supported' as const }
            : { name: KHR_DRACO_MESH_COMPRESSION, status: 'decoder-required' as const, reason: 'configure a decoder with setDRACODecoder()' }),
        loadPrimitive (primitiveIndex, meshIndex, ctx) {
            const mesh = item(ctx.json.meshes, meshIndex, 'mesh');
            const primitive = item(mesh.primitives, primitiveIndex, 'primitive');
            const definition = primitive.extensions?.[KHR_DRACO_MESH_COMPRESSION] as DracoCompressionDef | undefined;
            if (!definition) { return Promise.resolve(null); }
            if (!decoder) {
                throw new GLTFError('GLTF_DECODER_MISSING',
                    `${KHR_DRACO_MESH_COMPRESSION}: configure a decoder with setDRACODecoder()`, KHR_DRACO_MESH_COMPRESSION);
            }
            return ctx.dependency(DependencyKeys.primitive(meshIndex, primitiveIndex),
                () => decodePrimitive(ctx, meshIndex, primitiveIndex, definition, decoder));
        },
    };
};
