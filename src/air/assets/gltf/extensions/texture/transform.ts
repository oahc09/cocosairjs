import type { GLTFExtensionHandler } from '../../extension-registry';
import type { GLTFParserContext } from '../../parser-context';
import { TEXTURE_SLOTS, slotTextureInfo } from '../../material/features';
import { textureCoordinates } from '../../material/texture-slots';

/** KHR_texture_transform: UV offset/rotation/scale and texCoord override per texture slot. */
export function textureTransformFactory (context: GLTFParserContext): GLTFExtensionHandler {
    void context;
    return {
        name: 'KHR_texture_transform',
        extendMaterial (_materialIndex, features) {
            for (const slot of TEXTURE_SLOTS) {
                const info = slotTextureInfo(features.source, slot);
                if (info && info.extensions?.KHR_texture_transform !== undefined) {
                    features.uv[slot] = textureCoordinates(info);
                }
            }
        },
    };
}
