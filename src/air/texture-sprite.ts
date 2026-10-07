import { Sprite } from '../cocos/2d/components/sprite';
import { UITransform } from '../cocos/2d/framework/ui-transform';
import { SpriteFrame } from '../cocos/2d/assets/sprite-frame';
import type { TextureBase } from '../cocos/asset/assets/texture-base';
import type { Node } from '../cocos/scene-graph/node';
import { Rect, Size } from '../cocos/core/math';
import { spriteNode, SpriteNodeOptions } from './ui-kit';
import { director } from '../cocos/game/director';

export interface AirTextureSpriteOptions extends SpriteNodeOptions {
    name?: string;
    anchor?: readonly [number, number];
}
/** Texture is borrowed; owns the frame and node. No texture metadata is mutated. */
export function createAirTextureSprite(parent: Node, texture: TextureBase, options: AirTextureSpriteOptions = {}): {
    readonly node: Node; readonly sprite: Sprite; readonly frame: SpriteFrame; refresh(): void; dispose(): void;
} {
    const anchor = options.anchor ?? [0.5, 0.5];
    if (!texture.isValid || texture.width <= 0 || texture.height <= 0 || !anchor.every(Number.isFinite)
        || (options.size && !options.size.every((v) => Number.isFinite(v) && v > 0))) throw new Error('AIR_E_TEXTURE_SPRITE_OPTIONS');
    const frame = new SpriteFrame();
    frame.packable = false;
    const node = spriteNode(parent, options.name ?? 'TextureSprite', { ...options, size: options.size ?? [texture.width, texture.height] });
    const sprite = node.getComponent(Sprite)!;
    node.getComponent(UITransform)!.setAnchorPoint(anchor[0], anchor[1]);
    let disposed = false;
    let previousTexture = texture.getGFXTexture();
    const refresh = (): void => {
        if (disposed) throw new Error('AIR_E_TEXTURE_SPRITE_DISPOSED');
        const currentTexture = texture.getGFXTexture();
        if (currentTexture !== previousTexture) {
            director.root?.batcher2D?._releaseDescriptorSetCache(texture.getHash());
            previousTexture = currentTexture;
        }
        frame.reset({ texture, rect: new Rect(0, 0, texture.width, texture.height), originalSize: new Size(texture.width, texture.height) });
        // Texture2D.reset replaces its GFX texture. Rebind through the native
        // setter so Sprite invalidates the cached texture/descriptor even when
        // the SpriteFrame and TextureBase identities themselves are unchanged.
        if (sprite.spriteFrame === frame) { sprite.spriteFrame = null; sprite.spriteFrame = frame; }
        if (!options.size) node.getComponent(UITransform)!.setContentSize(texture.width, texture.height);
    };
    refresh(); sprite.spriteFrame = frame;
    return { node, sprite, frame, refresh, dispose() {
        if (disposed) return; disposed = true;
        if (sprite.isValid) sprite.spriteFrame = null;
        frame.destroy(); if (node.isValid) node.destroy();
    } };
}
