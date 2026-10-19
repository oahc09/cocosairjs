import type { SpriteFrame, Texture2D, ImageAsset } from 'cocosair';

/** Only for resources created exclusively by this owner; cached assets need their cache contract. */
export function ownSpriteFrame(
    session: { own(cleanup: () => void, label?: string): () => void },
    frame: SpriteFrame,
    originalTexture: Texture2D,
    originalImage?: ImageAsset,
): () => void {
    let disposed = false;
    const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        unregister();
        // SpriteFrame removes its own atlas entry. frame.texture may now be a SHARED atlas.
        frame.destroy();
        originalTexture.destroy();
        originalImage?.destroy();
    };
    const unregister = session.own(dispose, 'owned-sprite-frame');
    return dispose;
}
