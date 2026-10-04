import { createAirApp, Node, Scene, Component, Asset, game, director, isValid } from '../../src';

describe('PG-30 native paused scene release', () => {
    let app: Awaited<ReturnType<typeof createAirApp>>, destroyed = 0;
    class Tracked extends Component { onDestroy() { destroyed++; } }
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    test('never-run release is bounded, empty, and preserves runtime for first run', async () => {
        const result = await app.releaseScene!();
        expect(result.status).toBe('released'); expect(result.scene).toBeNull(); expect(app.getScene()).toBeNull();
        expect(result.retained).toContain('runtime'); expect(result.measurements.gpuMemory).toBe('unavailable');
    });
    test('in-flight repeat shares promise, run is gated, cleanup drains without an AFTER_DRAW', async () => {
        const scene = new Scene('Owned'); const node = new Node('OwnedChild'); scene.addChild(node); node.addComponent(Tracked);
        app.run(scene); game.pause();
        let settle!: () => void;
        app.session!.own(() => new Promise<void>((resolve) => { settle = resolve; }), 'asset-owner');
        const token = app.session!.token();
        const first = app.releaseScene!(), second = app.releaseScene!();
        expect(second).toBe(first); expect(token.isCurrent()).toBe(false);
        const rejectedScene = new Scene('Rejected');
        expect(() => app.run(rejectedScene)).toThrow('AIR_E_SCENE_RELEASING');
        await Promise.resolve(); await Promise.resolve(); settle();
        const result = await first;
        expect(result.status).toBe('released'); expect(app.getScene()).toBeNull(); expect(director.getScene()).toBeNull();
        expect(isValid(scene)).toBe(false); expect(isValid(node)).toBe(false); expect(destroyed).toBe(1);
        rejectedScene.destroy();
    });
    test('100 paused switch/release cycles clear nodes, ownership, tokens and singleton state', async () => {
        const shared = new Asset('Shared'); shared.addRef(); shared.addRef();
        for (let i = 0; i < 100; i++) {
            const scene = new Scene(`Cycle${i}`), node = new Node(`Node${i}`); scene.addChild(node); node.addComponent(Tracked);
            app.run(scene); game.pause();
            const token = app.session!.token(); app.session!.own(() => {}, 'subscription');
            const result = await app.releaseScene!();
            expect(result.status).toBe('released'); expect(app.getScene()).toBeNull();
            expect(isValid(node)).toBe(false); expect(token.isCurrent()).toBe(false); expect(shared.refCount).toBe(2);
        }
        expect(destroyed).toBe(101);
        shared.decRef(false); shared.decRef(false); shared.destroy();
    });
    test('persistent nodes survive detached and reattach on next run', async () => {
        const scene = new Scene('Persist'), node = new Node('Persistent'); scene.addChild(node);
        app.run(scene); game.pause(); director.addPersistRootNode(node);
        const result = await app.releaseScene!();
        expect(result.retained).toContain(`persist-node:${node.uuid}`); expect(isValid(node)).toBe(true); expect(node.parent).toBeNull();
        const next = new Scene('Next'); app.run(next); game.pause(); expect(node.parent).toBe(next);
        director.removePersistRootNode(node); await app.releaseScene!(); expect(isValid(node)).toBe(false);
    });
    test('late scope releases drain native asset destruction without harming another owner', async () => {
        const privateAsset = new Asset('Private'), shared = new Asset('RetainedByOtherOwner');
        privateAsset.addRef(); shared.addRef(); shared.addRef();
        app.run(new Scene('Assets')); game.pause();
        app.session!.own(async () => { await Promise.resolve(); privateAsset.decRef(); shared.decRef(); });
        const result = await app.releaseScene!();
        expect(result.status).toBe('released'); expect(isValid(privateAsset)).toBe(false);
        expect(isValid(shared)).toBe(true); expect(shared.refCount).toBe(1);
        shared.decRef(false); shared.destroy();
    });
    test('close is terminal, shared, and subsequent initialization requires reload', async () => {
        const first = app.close!(), second = app.close!(); expect(first).toBe(second);
        const rejected = new Scene('Closed'); expect(() => app.run(rejected)).toThrow('AIR_E_APP_CLOSED'); rejected.destroy();
        await expect(createAirApp({ canvas: '#GameCanvas', renderMode: 3 })).rejects.toMatchObject({ code: 'AIR_E_APP_CLOSED' });
        expect((await first).status).toBe('released');
    });
});
