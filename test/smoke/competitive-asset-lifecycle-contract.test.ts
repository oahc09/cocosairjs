import { installAssetLifecycle } from '../../examples/shared/asset-lifecycle';
import { CCObject } from '../../src/cocos/core/data/object';
import { director, Director } from '../../src/cocos/game/director';

describe('native asset lifecycle release predicates', () => {
    let frame: number;
    beforeEach(() => {
        jest.useFakeTimers();
        frame = 0;
        jest.spyOn(director, 'getTotalFrames').mockImplementation(() => frame);
    });
    afterEach(() => {
        jest.restoreAllMocks();
        jest.useRealTimers();
    });
    async function settle(run: Promise<any>): Promise<any> {
        // The predicate fixture supplies complete update/draw cycles; RAF/timers alone are not settlement.
        for (let i = 0; i < 20; i++) {
            await Promise.resolve();
            director.emit(Director.EVENT_AFTER_UPDATE);
            director.emit(Director.EVENT_AFTER_DRAW);
            frame++;
            jest.runAllTicks();
            await Promise.resolve();
        }
        return run;
    }
    test('default CCObject validity still detects release and fresh reacquisition', async () => {
        const old = new CCObject();
        let fresh: CCObject;
        installAssetLifecycle({
            hold: () => [{ name: 'object', ref: old }],
            release: () => {
                old.destroy();
                CCObject._deferredDestroy();
            },
            reacquire: async () => [{ name: 'fresh', ref: (fresh = new CCObject()) }],
        });
        const result = await settle((window as any).__lifecycle());
        expect(result.released).toBe(true);
        expect(result.reloaded).toBe(true);
        expect(result.leaked).toEqual([]);
        fresh!.destroy();
        CCObject._deferredDestroy();
    });
    test('explicit GPU pass destruction can succeed while the object validity flag remains true', async () => {
        const object = new CCObject();
        const passes = [1];
        let destroyed = false;
        installAssetLifecycle({
            hold: () => [{ name: 'gpu variant', ref: object, released: () => destroyed && passes.length === 0 }],
            release: () => {
                passes.length = 0;
                destroyed = true;
            },
            reacquire: async () => [{ name: 'new gpu variant', ref: new CCObject(), released: () => false }],
        });
        const result = await settle((window as any).__lifecycle());
        expect(object.isValid).toBe(true);
        expect(result.released).toBe(true);
        expect(result.reloaded).toBe(true);
        expect(result.errors).toEqual([]);
    });
    test('live pass negative control fails even if release was called', async () => {
        const passes = [1];
        let destroyCalled = false;
        installAssetLifecycle({
            hold: () => [
                { name: 'live pass', ref: new CCObject(), released: () => destroyCalled && passes.length === 0 },
            ],
            release: () => {
                destroyCalled = true;
            },
            reacquire: async () => [{ name: 'new', ref: new CCObject() }],
        });
        const result = await settle((window as any).__lifecycle());
        expect(result.released).toBe(false);
        expect(result.leaked).toEqual(['live pass']);
    });
    test('a throwing predicate fails the release check and is observable', async () => {
        installAssetLifecycle({
            hold: () => [
                {
                    name: 'bad predicate',
                    ref: new CCObject(),
                    released: () => {
                        throw new Error('intentional');
                    },
                },
            ],
            release: () => {},
            reacquire: async () => [{ name: 'new', ref: new CCObject() }],
        });
        const result = await settle((window as any).__lifecycle());
        expect(result.released).toBe(false);
        expect(result.leaked).toEqual(['bad predicate']);
        expect(result.errors[0]).toContain('intentional');
    });
    test('nonboolean predicates and already-released reacquisition fail closed', async () => {
        installAssetLifecycle({
            hold: () => [{ name: 'invalid predicate', ref: new CCObject(), released: () => 'yes' }],
            release: () => {},
            reacquire: async () => [{ name: 'released fresh resource', ref: new CCObject(), released: () => true }],
        });
        const result = await settle((window as any).__lifecycle());
        expect(result.released).toBe(false);
        expect(result.reloaded).toBe(false);
        expect(result.errors.some((message: string) => message.includes('boolean'))).toBe(true);
    });
});
