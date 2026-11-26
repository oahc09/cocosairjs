/** @jest-environment ./test/helpers/jsdom-node-fetch.cjs */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { TextDecoder, TextEncoder } from 'node:util';
import { assetManager, createAirApp, GLTFLoader, type GLTFAsset } from '../../src';
import { configureGLTFLoaderDefaults } from '../../src/air/assets/gltf/loader';
import { fixture } from '../fixtures/gltf/fixture';

Object.assign(globalThis, { TextDecoder, TextEncoder });

async function serve(handler: (request: IncomingMessage, response: ServerResponse) => void) {
    const server = createServer(handler);
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    return {
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        close: () =>
            new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
    };
}

describe('glTF final response URL and original request origin', () => {
    const model = fixture();
    model.json.buffers![0].uri = 'model.bin';
    const json = JSON.stringify(model.json);
    const paths: string[] = [];
    const credentials: (string | undefined)[] = [];
    let origin: Awaited<ReturnType<typeof serve>>;
    let destination: Awaited<ReturnType<typeof serve>>;

    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
        destination = await serve((request, response) => {
            paths.push(`destination:${request.url}`);
            credentials.push(request.headers['x-sidecar-scope'] as string | undefined);
            if (request.url === '/v2/model.gltf') response.end(json);
            else if (request.url === '/v2/model.bin') response.end(Buffer.from(model.bin));
            else response.writeHead(404).end();
        });
        origin = await serve((request, response) => {
            paths.push(`origin:${request.url}`);
            if (request.url!.startsWith('/go/same.gltf')) {
                response.writeHead(302, { Location: '/v2/model.gltf' }).end();
            } else if (request.url!.startsWith('/go/cross.gltf')) {
                response.writeHead(302, { Location: `${destination.url}/v2/model.gltf` }).end();
            } else if (request.url === '/v2/model.gltf') response.end(json);
            else if (request.url === '/v2/model.bin') response.end(Buffer.from(model.bin));
            else response.writeHead(404).end();
        });
    });

    afterEach(() => {
        paths.length = 0;
        credentials.length = 0;
        configureGLTFLoaderDefaults({ request: undefined });
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await Promise.all([origin?.close(), destination?.close()]);
    });

    test('configured load resolves the external buffer at the final URL, retaining requested progress identity', async () => {
        const requestURL = `${origin.url}/go/same.gltf?configured=1`;
        const progress = jest.fn();
        const asset = await new GLTFLoader({ onProgress: progress }).loadAsync(requestURL);
        try {
            expect(asset.meshes).toHaveLength(1);
            expect(paths).toEqual([
                'origin:/go/same.gltf?configured=1',
                'origin:/v2/model.gltf',
                'origin:/v2/model.bin',
            ]);
            expect(progress.mock.calls.some(([entry]) => entry.url === requestURL)).toBe(true);
        } finally {
            asset.destroy();
        }
    });

    test('native option-free factory retains original cache key and resolves the sidecar after redirect', async () => {
        const requestURL = `${origin.url}/go/same.gltf?legacy=1`;
        const loader = new GLTFLoader();
        const asset = await loader.loadAsync(requestURL);
        try {
            expect(asset.meshes).toHaveLength(1);
            expect(await loader.loadAsync(requestURL)).toBe(asset);
            expect(paths).toEqual(['origin:/go/same.gltf?legacy=1', 'origin:/v2/model.gltf', 'origin:/v2/model.bin']);
        } finally {
            assetManager.assets.remove(requestURL);
            asset.destroy();
        }
    });

    test('native cross-origin redirect does not re-scope global headers to the destination', async () => {
        configureGLTFLoaderDefaults({ request: { headers: { 'x-sidecar-scope': 'original-only' } } });
        const requestURL = `${origin.url}/go/cross.gltf`;
        const asset = await new Promise<GLTFAsset>((resolve, reject) =>
            assetManager.loadRemote<GLTFAsset>(requestURL, (error, value) => (error ? reject(error) : resolve(value))),
        );
        try {
            expect(asset.meshes).toHaveLength(1);
            expect(paths).toEqual(['origin:/go/cross.gltf', 'destination:/v2/model.gltf', 'destination:/v2/model.bin']);
            expect(credentials).toEqual([undefined, undefined]);
        } finally {
            assetManager.assets.remove(requestURL);
            asset.destroy();
        }
    });

    test('configured custom headers still fail closed before following any redirect', async () => {
        await expect(
            new GLTFLoader({ request: { headers: { 'x-sidecar-scope': 'original-only' } } }).loadAsync(
                `${origin.url}/go/cross.gltf?protected=1`,
            ),
        ).rejects.toThrow();
        expect(paths).toEqual(['origin:/go/cross.gltf?protected=1']);
        expect(credentials).toEqual([]);
    });

    test.each([false, true])('empty response URL falls back to the request URL (configured=%s)', async (configured) => {
        const real = globalThis.fetch;
        jest.spyOn(globalThis, 'fetch').mockImplementation(async (...args) => {
            const response = await real(...args);
            Object.defineProperty(response, 'url', { value: '' });
            return response;
        });
        const requestURL = `${origin.url}/v2/model.gltf`;
        const asset = await new GLTFLoader(configured ? { onProgress: jest.fn() } : undefined).loadAsync(requestURL);
        try {
            expect(asset.meshes).toHaveLength(1);
            expect(paths).toEqual(['origin:/v2/model.gltf', 'origin:/v2/model.bin']);
        } finally {
            assetManager.assets.remove(requestURL);
            asset.destroy();
        }
    });
});
