import { EffectAsset } from '../../src';
import { cclegacy } from '../../src/cocos/core';
import { deviceManager } from '../../src/cocos/gfx';
import { programLib } from '../../src/cocos/render-scene/core/program-lib';
import { CCObject } from '../../src/cocos/core/data/object';

describe('competitive full-bundle early effect lifecycle', () => {
    let originalGame: typeof cclegacy.game;
    let originalRendering: typeof cclegacy.rendering;
    let callbacks: Array<{ callback: () => void; target: unknown }>;
    let effects: EffectAsset[];
    let device: unknown;
    beforeEach(() => {
        originalGame = cclegacy.game;
        originalRendering = cclegacy.rendering;
        callbacks = []; effects = []; device = undefined;
        jest.spyOn(deviceManager, 'gfxDevice', 'get').mockImplementation(() => device as never);
        cclegacy.game = {
            once: (_event: string, callback: () => void, target: unknown): void => { callbacks.push({ callback, target }); },
            off: (_event: string, callback: () => void, target: unknown): void => {
                callbacks = callbacks.filter((item) => item.callback !== callback || item.target !== target);
            },
        } as never;
    });
    afterEach(() => {
        for (const effect of effects) effect.destroy();
        cclegacy.game = originalGame;
        cclegacy.rendering = originalRendering;
        jest.restoreAllMocks();
        CCObject._deferredDestroy();
    });
    const ready = (): void => { const pending = callbacks; callbacks = []; for (const item of pending) item.callback.call(item.target); };
    const effect = (): EffectAsset => {
        const asset = new EffectAsset(); asset.name = 'competitive-early-effect'; effects.push(asset); return asset;
    };

    test('metadata is immediate and legacy registration follows the selected renderer', () => {
        const imported = { addEffect: jest.fn(), init: jest.fn(), precompileEffect: jest.fn() };
        cclegacy.rendering = { enableEffectImport: true, programLib: imported } as never;
        const register = jest.spyOn(programLib, 'register').mockImplementation(() => undefined as never);
        const asset = effect();
        asset.onLoaded(); asset.onLoaded();
        expect(EffectAsset.get(asset.name)).toBe(asset);
        expect(imported.init).not.toHaveBeenCalled();
        expect(callbacks.length).toBe(1);
        // game.init disables the initially imported namespace in the legacy configuration.
        cclegacy.rendering = undefined;
        device = {};
        ready();
        expect(register).toHaveBeenCalledWith(asset);
        expect(imported.addEffect).not.toHaveBeenCalled();
    });

    test('an actual custom renderer registers and precompiles only after its device exists', () => {
        const imported = { addEffect: jest.fn(), init: jest.fn(), precompileEffect: jest.fn() };
        cclegacy.rendering = { enableEffectImport: true, programLib: imported } as never;
        const asset = effect(); asset.onLoaded();
        expect(imported.addEffect).not.toHaveBeenCalled();
        device = {};
        ready();
        expect(imported.addEffect).toHaveBeenCalledWith(asset);
        expect(imported.init).toHaveBeenCalledWith(device);
        expect(imported.precompileEffect).toHaveBeenCalledWith(device, asset);
    });

    test('destroying a pending effect removes registration and its renderer listener', () => {
        const imported = { addEffect: jest.fn(), init: jest.fn(), precompileEffect: jest.fn() };
        cclegacy.rendering = { enableEffectImport: true, programLib: imported } as never;
        const asset = effect(); asset.onLoaded(); asset.destroy();
        expect(EffectAsset.get(asset.name)).toBeNull();
        expect(callbacks.length).toBe(0);
        device = {}; ready();
        expect(imported.init).not.toHaveBeenCalled();
    });
});
