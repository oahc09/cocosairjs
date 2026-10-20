import type { AirSessionScope, ImageAsset, Sprite, SpriteFrame, Texture2D } from 'cocosair';
import { ownSpriteFrame } from './owned-sprite-frame.js';

export interface ExclusiveSpriteContent {
    frame: SpriteFrame;
    texture: Texture2D;
    image?: ImageAsset;
}
/** Loaders own partial allocations until returning them; failed loaders must clean those up. */
export function createSpriteContentReplacement(session: AirSessionScope, sprite: Pick<Sprite, 'spriteFrame'>) {
    let request = 0;
    let stopped = false;
    let pending: AbortController | undefined;
    let importing = false;
    let current: { content: ExclusiveSpriteContent; origin: 'paper' | 'import'; dispose: () => void } | undefined;
    const discard = (content: ExclusiveSpriteContent): void => {
        content.frame.destroy();
        content.texture.destroy();
        content.image?.destroy();
    };
    const dispose = (): void => {
        if (stopped) return;
        stopped = true;
        request++;
        pending?.abort();
        sprite.spriteFrame = null;
        current?.dispose();
        current = undefined;
    };
    session.own(dispose, 'sprite-content-replacement');
    return {
        dispose,
        async replace(
            origin: 'paper' | 'import',
            load: (signal: AbortSignal) => Promise<ExclusiveSpriteContent>,
        ): Promise<'replaced' | 'stale' | 'preserved-import'> {
            if (stopped || !session.active) return 'stale';
            if (origin === 'paper' && (current?.origin === 'import' || importing)) return 'preserved-import';
            const id = ++request;
            const token = session.token();
            pending?.abort();
            const controller = new AbortController();
            pending = controller;
            importing = origin === 'import';
            let next: ExclusiveSpriteContent;
            try {
                next = await load(controller.signal);
            } catch (error) {
                if (id === request) {
                    pending = undefined;
                    importing = false;
                }
                if (stopped || id !== request || !token.isCurrent()) return 'stale';
                throw error;
            }
            if (id === request) {
                pending = undefined;
                importing = false;
            }
            if (stopped || id !== request || !token.isCurrent()) {
                discard(next);
                return 'stale';
            }
            const previous = current;
            let releaseNext: () => void;
            try {
                releaseNext = ownSpriteFrame(session, next.frame, next.texture, next.image);
            } catch (error) {
                discard(next);
                throw error;
            }
            try {
                sprite.spriteFrame = next.frame;
            } catch (error) {
                try {
                    sprite.spriteFrame = previous?.content.frame ?? null;
                } finally {
                    releaseNext();
                }
                throw error;
            }
            current = { content: next, origin, dispose: releaseNext };
            previous?.dispose();
            return 'replaced';
        },
    };
}
