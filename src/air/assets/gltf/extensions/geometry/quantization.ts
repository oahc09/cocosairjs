/**
 * `KHR_mesh_quantization`: widens the accepted component types for mesh attributes and
 * validates them table-driven. Dequantization itself happens in the accessor read path,
 * which normalizes integer components to floating point before the mesh is built.
 */
import { attributeTypeRule } from '../../attributes';
import { GLTFError } from '../../diagnostics';
import type { GLTFExtensionHandler, GLTFExtensionFactory } from '../../extension-registry';
import type { GLTFParserContext } from '../../parser-context';
import { item, Primitive } from '../../schema';

export const KHR_MESH_QUANTIZATION = 'KHR_mesh_quantization';

/** Validates every accessor reachable from a mesh (attributes, indices, morph targets). */
export function validateQuantizedAccessors (context: GLTFParserContext): void {
    const checkAccessor = (index: number, semantic: string): void => {
        const accessor = item(context.json.accessors, index, `accessor for ${semantic}`);
        const rule = attributeTypeRule(semantic, true);
        const normalized = !!accessor.normalized;
        if (!rule.types.includes(accessor.componentType)
            && !(normalized && (rule.normalizedTypes?.includes(accessor.componentType) ?? false))) {
            throw new GLTFError('GLTF_EXTENSION_INVALID', `accessor ${index} (${semantic}): componentType `
                + `${accessor.componentType}${normalized ? ' normalized' : ''} is invalid for ${KHR_MESH_QUANTIZATION}`,
            KHR_MESH_QUANTIZATION);
        }
    };
    for (const [meshIndex, mesh] of (context.json.meshes || []).entries()) {
        for (const [primitiveIndex, primitive] of (mesh.primitives || []).entries()) {
            for (const [semantic, index] of Object.entries(primitive.attributes)) {
                checkAccessor(index, semantic);
            }
            if (primitive.indices !== undefined) {
                const accessor = item(context.json.accessors, primitive.indices, `indices of mesh ${meshIndex}`);
                if (![5121, 5123, 5125].includes(accessor.componentType) || accessor.normalized) {
                    throw new GLTFError('GLTF_EXTENSION_INVALID',
                        `accessor ${primitive.indices}: invalid quantized indices type ${accessor.componentType}`,
                        KHR_MESH_QUANTIZATION);
                }
            }
            for (const target of primitive.targets || []) {
                for (const [semantic, index] of Object.entries(target)) {
                    checkAccessor(index, semantic);
                }
            }
            void primitiveIndex;
        }
    }
}

/** Handler: relaxes core attribute typing by declaring support and validating up front. */
export function meshQuantizationFactory (context: GLTFParserContext): GLTFExtensionHandler {
    void context;
    return {
        name: KHR_MESH_QUANTIZATION,
        support: () => ({ name: KHR_MESH_QUANTIZATION, status: 'supported' }),
        validate: (ctx): void => validateQuantizedAccessors(ctx),
    };
}

export const meshQuantizationExtension: GLTFExtensionFactory = meshQuantizationFactory;

/** Type guard used by the mesh builder to pick the quantized component-type table. */
export function isQuantizedPrimitive (primitive: Primitive): boolean {
    return !!primitive.extensions?.[KHR_MESH_QUANTIZATION];
}
