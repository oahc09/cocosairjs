import type { GLTFExtensionHandler } from '../../extension-registry';
import type { GLTFParserContext } from '../../parser-context';

/** KHR_materials_unlit: switches the material to the unlit shading path. */
export function unlitFactory (context: GLTFParserContext): GLTFExtensionHandler {
    void context;
    return {
        name: 'KHR_materials_unlit',
        extendMaterial (_materialIndex, features) {
            if (features.source.extensions?.KHR_materials_unlit) { features.unlit = true; }
        },
    };
}
