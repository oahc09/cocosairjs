import {
    createAirApp,
    createSessionScope,
    Texture2D,
    SpriteFrame,
    ImageAsset,
    Scene,
    dynamicAtlasManager,
    isValid,
    game,
} from '../../src';
import { CCObject } from '../../src/cocos/core/data/object';
import { ownSpriteFrame } from '../../examples/shared/owned-sprite-frame';
import { observeResource, assertResourceOwnership } from '../../tools/debug/resource-ownership';

describe('dynamic atlas ownership and release diagnostics', () => {
    let app: Awaited<ReturnType<typeof createAirApp>>;
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
        game.pause();
    });
    afterAll(async () => {
        await app.releaseScene!();
        game.pause();
    });
    function resources() {
        const original = new Texture2D();
        original.reset({ width: 16, height: 16 });
        const atlas = new Texture2D();
        atlas.reset({ width: 64, height: 64 });
        const frame = new SpriteFrame();
        frame.texture = original;
        // This unit controls the packing boundary; the browser example performs actual atlas packing.
        frame._setDynamicAtlasFrame({ texture: atlas, x: 0, y: 0 });
        return { original, atlas, frame };
    }
    function observations(original: Texture2D, atlas: Texture2D) {
        return [
            observeResource({
                label: 'original',
                resource: original,
                ownership: 'owned',
                cleanupCompleted: true,
                gfxReleased: () => original.getGFXTexture() === null,
            }),
            observeResource({
                label: 'shared atlas',
                resource: atlas,
                ownership: 'shared',
                cleanupCompleted: false,
                gfxReleased: () => atlas.getGFXTexture() === null,
                cacheRetained: () => true,
            }),
        ];
    }
    test('return, duplicate dispose and re-entry release originals without destroying a shared atlas', async () => {
        for (let visit = 0; visit < 2; visit++) {
            const { original, atlas, frame } = resources();
            const scope = createSessionScope();
            scope.activate();
            const dispose = ownSpriteFrame(scope, frame, original);
            const destroy = jest.spyOn(original, 'destroy');
            const first = scope.dispose();
            expect(scope.dispose()).toBe(first);
            expect((await first).status).toBe('released');
            dispose();
            expect(destroy).toHaveBeenCalledTimes(1);
            const queued = observeResource({
                label: 'original',
                resource: original,
                ownership: 'owned',
                cleanupCompleted: true,
                gfxReleased: () => original.getGFXTexture() === null,
            });
            expect(queued.queuedForDestroy).toBe(true);
            expect(queued.objectValid).toBe(true);
            expect(queued.gfxReleased).toBe(true); // GPU destruction precedes object destruction here.
            CCObject._deferredDestroy();
            assertResourceOwnership(observations(original, atlas));
            expect(isValid(frame)).toBe(false);
            expect(isValid(atlas, true)).toBe(true);
            atlas.destroy();
            CCObject._deferredDestroy();
        }
    });
    test('negative control: zero cleanup registrations cannot conceal an omitted original texture', async () => {
        const { original, atlas, frame } = resources();
        const scope = createSessionScope();
        scope.own(() => {
            frame.destroy();
        });
        await scope.dispose();
        expect(scope.ownedCount).toBe(0);
        CCObject._deferredDestroy();
        expect(() => assertResourceOwnership(observations(original, atlas))).toThrow(
            'original: owned resource was not released',
        );
        original.destroy();
        atlas.destroy();
        CCObject._deferredDestroy();
    });
    test('negative control: destroying frame.texture is rejected as shared resource damage', async () => {
        const { original, atlas, frame } = resources();
        const scope = createSessionScope();
        scope.own(() => {
            frame.texture.destroy();
            frame.destroy();
            original.destroy();
        });
        await scope.dispose();
        CCObject._deferredDestroy();
        expect(() => assertResourceOwnership(observations(original, atlas))).toThrow(
            'shared atlas: shared resource was destroyed',
        );
    });
    test('unknown GFX evidence is explicit and a failed probe cannot become release success', () => {
        const texture = new Texture2D();
        const row = observeResource({
            label: 'cache',
            resource: texture,
            ownership: 'shared',
            cleanupCompleted: false,
            cacheRetained: () => true,
        });
        expect(row.gfxReleased).toBeNull();
        expect(row.cacheRetained).toBe(true);
        expect(() => assertResourceOwnership([row])).not.toThrow();
        const failed = observeResource({
            label: 'cache',
            resource: texture,
            ownership: 'shared',
            cleanupCompleted: false,
            gfxReleased: () => {
                throw Error('unavailable');
            },
        });
        expect(() => assertResourceOwnership([failed])).toThrow('observation failed');
        texture.destroy();
        CCObject._deferredDestroy();
    });

    test('real atlas packing survives an owner exit, then resets legitimately on gallery/scene re-entry', async () => {
        const enabled = dynamicAtlasManager.enabled;
        const persistent = createSessionScope();
        const made: { texture: Texture2D; image: ImageAsset; frame: SpriteFrame }[] = [];
        const make = () => {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 16;
            const image = new ImageAsset(canvas);
            const texture = new Texture2D();
            texture.image = image;
            const frame = new SpriteFrame();
            frame.texture = texture;
            const result = { texture, image, frame };
            made.push(result);
            return result;
        };
        try {
            app.run(new Scene('Work visit 1'));
            game.pause();
            dynamicAtlasManager.enabled = true;
            const gallery = make();
            ownSpriteFrame(persistent, gallery.frame, gallery.texture, gallery.image);
            const first = make();
            ownSpriteFrame(app.session!, first.frame, first.texture, first.image);
            dynamicAtlasManager.packToDynamicAtlas(null, gallery.frame);
            dynamicAtlasManager.packToDynamicAtlas(null, first.frame);
            const atlas = first.frame.texture as Texture2D;
            expect(first.frame.original).not.toBeNull();
            expect(atlas).toBe(gallery.frame.texture);
            expect(atlas).not.toBe(first.texture);
            const originalSession = app.session!;
            expect((await app.releaseScene!()).status).toBe('released');
            await originalSession.dispose();
            CCObject._deferredDestroy();
            expect(first.texture.getGFXTexture()).toBeNull();
            expect(isValid(first.frame)).toBe(false);
            expect(atlas.getGFXTexture()).not.toBeNull(); // another owner still uses it
            app.run(new Scene('Gallery'));
            game.pause();
            CCObject._deferredDestroy();
            expect(atlas.getGFXTexture()).toBeNull(); // manager owns legal scene-boundary reset
            expect(gallery.frame.texture).toBe(gallery.texture);
            expect(isValid(gallery.texture, true)).toBe(true);
            app.run(new Scene('Work visit 2'));
            game.pause();
            expect(app.session).not.toBe(originalSession);
            const second = make();
            ownSpriteFrame(app.session!, second.frame, second.texture, second.image);
            dynamicAtlasManager.packToDynamicAtlas(null, gallery.frame);
            dynamicAtlasManager.packToDynamicAtlas(null, second.frame);
            expect(second.frame.original).not.toBeNull();
            expect(second.frame.texture).toBe(gallery.frame.texture);
            await app.releaseScene!();
            CCObject._deferredDestroy();
            expect(second.texture.getGFXTexture()).toBeNull();
            expect(isValid(gallery.texture, true)).toBe(true);
        } finally {
            await persistent.dispose();
            dynamicAtlasManager.reset();
            for (const { frame, texture, image } of made) {
                if (isValid(frame, true)) frame.destroy();
                if (isValid(texture, true)) texture.destroy();
                if (isValid(image, true)) image.destroy();
            }
            CCObject._deferredDestroy();
            dynamicAtlasManager.enabled = enabled;
        }
    });
});
