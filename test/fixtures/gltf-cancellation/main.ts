import { createAirApp, GLTFLoader, game } from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' }); game.pause();
const json = (uri: string) => JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri, byteLength: 4 }] });
const outcome = (promise: Promise<unknown>) => promise.then(() => ({ status: 'unexpected-resolve' }),
    (error) => ({ status: 'rejected', name: error.name, message: String(error), cause: String(error.cause ?? '') }));
let controller: AbortController, pending: Promise<unknown>;
const api = {
    ready: true,
    begin(kind: string) {
        controller = new AbortController();
        const loader = new GLTFLoader({ signal: controller.signal });
        pending = outcome(kind === 'container' ? loader.loadAsync('/slow.gltf')
            : loader.parseAsync(json('/slow-abort.bin'), location.href));
    },
    abort: () => { controller.abort(); return pending; },
    async peer() {
        const asset = await new GLTFLoader().parseAsync(json('/slow-peer.bin'), location.href);
        const valid = asset.isValid; asset.destroy(); await app.releaseScene!();
        return { valid, destroyed: !asset.isValid };
    },
    async preaborted() {
        const c = new AbortController(); c.abort();
        return outcome(new GLTFLoader({ signal: c.signal }).parseAsync(json('/must-not-request.bin'), location.href));
    },
    close: () => app.close!(),
};
(window as any).__gltfCancel = api;
