// Synthetic HTTP assets and explicit barriers. No secrets, file writes, or browser mocks.
const http = require('node:http');
const crypto = require('node:crypto');
const { PNG } = require('pngjs');
const specs = require('./cases.json');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const json = (value) => Buffer.from(JSON.stringify(value));
const geometry = Buffer.from(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0, 0, 0, 1, 0, 0.5, 1]).buffer);
const pixel = new PNG({ width: 1, height: 1 });
pixel.data.set([255, 255, 255, 255]);
const png = PNG.sync.write(pixel);
const ktx = Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
function model(caseId, crossOrigin) {
    const doc = {
        asset: { version: '2.0', generator: 'local request-policy fixture, not vendor codec conformance' },
        buffers: [{ uri: 'mesh.bin', byteLength: geometry.length }],
        bufferViews: [
            { buffer: 0, byteLength: 36 },
            { buffer: 0, byteOffset: 36, byteLength: 24 },
        ],
        accessors: [
            { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] },
            { bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' },
        ],
        images: [{ uri: 'pixel.png', mimeType: 'image/png' }],
        textures: [{ source: 0 }],
        materials: [
            { pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 } },
        ],
        meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, material: 0 }] }],
        nodes: [{ mesh: 0 }],
        scenes: [{ nodes: [0] }],
        scene: 0,
    };
    if (caseId === 'cross-origin-headers') {
        for (const resource of [doc.buffers[0], doc.images[0]])
            resource.uri = `${crossOrigin}/__policy/assets/${caseId}/${resource.uri}`;
    }
    if (caseId === 'abort-decode-meshopt') {
        doc.buffers = [{ uri: 'compressed.bin', byteLength: 4 }, { byteLength: 36 }];
        doc.bufferViews = [
            {
                buffer: 1,
                byteLength: 36,
                extensions: {
                    EXT_meshopt_compression: { buffer: 0, byteLength: 4, byteStride: 12, count: 3, mode: 'ATTRIBUTES' },
                },
            },
        ];
        doc.extensionsUsed = doc.extensionsRequired = ['EXT_meshopt_compression'];
    }
    if (caseId === 'abort-decode-draco') {
        doc.meshes[0].primitives[0].extensions = {
            KHR_draco_mesh_compression: { bufferView: 0, attributes: { POSITION: 0 } },
        };
        doc.extensionsUsed = doc.extensionsRequired = ['KHR_draco_mesh_compression'];
    }
    if (['abort-decode-draco', 'abort-decode-meshopt'].includes(caseId)) {
        doc.accessors = doc.accessors.slice(0, 1);
        doc.meshes[0].primitives[0].attributes = { POSITION: 0 };
        delete doc.meshes[0].primitives[0].material;
        delete doc.materials;
        delete doc.textures;
        delete doc.images;
    }
    if (caseId === 'abort-decode-ktx2')
        return {
            asset: doc.asset,
            extensionsUsed: ['KHR_texture_basisu'],
            extensionsRequired: ['KHR_texture_basisu'],
            images: [{ uri: 'image.ktx2' }],
            textures: [{ extensions: { KHR_texture_basisu: { source: 0 } } }],
        };
    return doc;
}
function payload(caseId, resource, crossOrigin) {
    if (resource === 'model.gltf') return { body: json(model(caseId, crossOrigin)), mime: 'model/gltf+json' };
    if (resource === 'mesh.bin') return { body: geometry, mime: 'application/octet-stream' };
    if (resource === 'pixel.png') return { body: png, mime: 'image/png' };
    if (resource === 'compressed.bin' || resource === 'provider.bin')
        return { body: Buffer.from([0, 1, 2, 3]), mime: 'application/octet-stream' };
    if (resource === 'image.ktx2') return { body: ktx, mime: 'image/ktx2' };
    return null;
}
function createState(onEvent = () => {}) {
    const state = { entries: [], held: new Map(), listeners: new Set(), origins: {}, sequence: 0 };
    state.emit = (type, entry) => {
        const order = ++state.sequence;
        if (type === 'request') entry.startEvent = order;
        if (type === 'response-finish') entry.finishEvent = order;
        if (type === 'response-close' && entry.aborted) entry.abortEvent = order;
        onEvent({ type, at: new Date().toISOString(), entry: { ...entry } });
        for (const listener of [...state.listeners]) listener();
    };
    return state;
}
function handler(state, originKind, staticOrigin) {
    return (req, res) => {
        const url = new URL(req.url, 'http://fixture.invalid');
        const send = (status, value) => {
            res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            res.end(json(value));
        };
        const id = url.searchParams.get('case');
        if (url.pathname === '/__policy/config' && originKind === 'primary') {
            if (!specs.some((entry) => entry.id === id)) return send(400, { error: 'unknown case' });
            res.setHeader('Set-Cookie', 'air_policy_fixture=synthetic; Path=/__policy/; SameSite=Lax');
            return send(200, { crossOrigin: state.origins.cross, case: id });
        }
        if (url.pathname === '/__policy/control' && originKind === 'primary') {
            if (!specs.some((entry) => entry.id === id)) return send(400, { error: 'unknown case' });
            const resource = url.searchParams.get('resource'),
                op = url.searchParams.get('op');
            const ordinal = Number(url.searchParams.get('ordinal') || 1);
            const key = `${id}/${resource}/${ordinal}`;
            if (op === 'release') {
                if (req.method !== 'POST') return send(405, { error: 'POST required' });
                const held = state.held.get(key);
                if (held) {
                    state.held.delete(key);
                    if (!held.response.destroyed) held.response.end(held.tail);
                }
                return send(200, { released: !!held });
            }
            if (!['wait-held', 'wait-aborted'].includes(op)) return send(400, { error: 'unknown operation' });
            let timer;
            const finish = () => {
                const entry = state.entries.find(
                    (row) =>
                        row.case === id &&
                        row.resource === resource &&
                        row.count === ordinal &&
                        row.held &&
                        (op === 'wait-held' || row.aborted),
                );
                if (!entry) return;
                clearTimeout(timer);
                state.listeners.delete(finish);
                send(200, entry);
            };
            timer = setTimeout(() => {
                state.listeners.delete(finish);
                send(408, { error: `${op} boundary not reached`, case: id, resource });
            }, 10000);
            state.listeners.add(finish);
            res.once('close', () => {
                clearTimeout(timer);
                state.listeners.delete(finish);
            });
            finish();
            return;
        }
        const match = /^\/__policy\/assets\/([^/]+)\/([^/]+)$/.exec(url.pathname);
        if (match) {
            const [, caseId, resource] = match;
            if (!specs.some((entry) => entry.id === caseId)) return send(404, { error: 'unknown case' });
            const data = payload(caseId, resource, state.origins.cross);
            if (!data) return send(404, { error: 'unknown resource' });
            const count =
                state.entries.filter(
                    (entry) => entry.case === caseId && entry.resource === resource && entry.method === req.method,
                ).length + 1;
            const entry = {
                id: state.entries.length + 1,
                case: caseId,
                resource,
                origin: originKind,
                method: req.method,
                count,
                headers: Object.fromEntries(
                    ['x-synthetic-test', 'x-synthetic-consumer', 'if-none-match', 'cache-control', 'pragma']
                        .filter((name) => req.headers[name] !== undefined)
                        .map((name) => [name, req.headers[name]]),
                ),
                syntheticCookie: (req.headers.cookie || '')
                    .split(';')
                    .some((value) => value.trim() === 'air_policy_fixture=synthetic'),
                held: false,
                aborted: false,
                finished: false,
                status: null,
                bodySha256: null,
            };
            state.entries.push(entry);
            // Retain only synthetic header/cookie facts, never arbitrary credentials or cookies.
            if (originKind === 'cross') {
                res.setHeader('Access-Control-Allow-Origin', state.origins.primary);
                res.setHeader('Access-Control-Allow-Credentials', 'true');
                res.setHeader('Access-Control-Allow-Headers', 'X-Synthetic-Test, X-Synthetic-Consumer');
                res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            }
            res.once('finish', () => {
                entry.finished = true;
                state.emit('response-finish', entry);
            });
            res.once('close', () => {
                if (!entry.finished) entry.aborted = true;
                state.emit('response-close', entry);
            });
            state.emit('request', entry);
            let body = data.body,
                status = 200;
            if (caseId.startsWith('multi-consumer') && resource === 'model.gltf') {
                const variant = model(caseId, state.origins.cross);
                variant.scenes[0].name = req.headers['x-synthetic-consumer'];
                body = json(variant);
            }
            if (req.method === 'OPTIONS') {
                entry.status = 204;
                res.writeHead(204);
                res.end();
                return;
            }
            if (caseId === 'redirect-headers' && originKind === 'primary') {
                entry.status = 302;
                res.writeHead(302, {
                    Location: `${state.origins.cross}/__policy/assets/${caseId}/model.gltf`,
                    'Cache-Control': 'no-store',
                });
                res.end();
                return;
            }
            if (caseId === 'retry-network' && resource === 'mesh.bin' && count === 1) {
                status = 503;
                body = Buffer.from('synthetic temporary outage');
            }
            if (caseId === 'retry-parse' && resource === 'model.gltf' && count === 1)
                body = json({ asset: { version: 'invalid' } });
            const etag = `"${hash(body)}"`;
            if (caseId === 'http-cache' && req.headers['if-none-match'] === etag) status = 304;
            entry.status = status;
            entry.bodySha256 = hash(body);
            entry.etag = etag;
            const headers = {
                'Content-Type': data.mime,
                'Cache-Control': caseId === 'http-cache' ? 'public, max-age=3600' : 'no-store',
                ETag: etag,
            };
            if (status !== 304) headers['Content-Length'] = body.length;
            const hold =
                (count === 1 &&
                    ((caseId === 'abort-main' && resource === 'model.gltf') ||
                        (caseId === 'abort-buffer' && resource === 'mesh.bin') ||
                        (caseId === 'abort-image' && resource === 'pixel.png'))) ||
                (caseId.startsWith('multi-consumer') && resource === 'model.gltf' && count <= 2);
            res.writeHead(status, headers);
            if (hold) {
                entry.held = true;
                state.held.set(`${caseId}/${resource}/${count}`, { response: res, tail: body.subarray(1) });
                res.write(body.subarray(0, 1));
                res.flushHeaders();
                state.emit('body-held', entry);
            } else res.end(status === 304 ? undefined : body);
            return;
        }
        if (originKind !== 'primary' || !staticOrigin) return send(404, { error: 'not a synthetic endpoint' });
        // Static bytes come only from the existing read-only example server. Browser navigation
        // remains on the gateway origin, so model, buffers, images, and harness are same-origin.
        const proxy = http.get(`${staticOrigin}${req.url}`, (upstream) => {
            res.writeHead(upstream.statusCode, upstream.headers);
            upstream.pipe(res);
        });
        proxy.on('error', (error) => {
            if (!res.headersSent) send(502, { error: error.message });
            else res.destroy(error);
        });
        res.once('close', () => proxy.destroy());
    };
}
async function listen(server) {
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            server.off('error', reject);
            resolve();
        });
    });
    return `http://127.0.0.1:${server.address().port}`;
}
async function startPolicyServers(root, onEvent) {
    const { startExampleServer } = require('../../../tools/verify/competitive-example-server.cjs');
    const state = createState(onEvent);
    let staticServer, primary, cross;
    const close = async () => {
        for (const held of state.held.values()) held.response.destroy();
        state.held.clear();
        for (const server of [primary, cross])
            if (server) {
                server.closeAllConnections();
                await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
            }
        if (staticServer) await staticServer.close();
    };
    try {
        staticServer = await startExampleServer(root);
        cross = http.createServer(handler(state, 'cross'));
        state.origins.cross = await listen(cross);
        primary = http.createServer(handler(state, 'primary', staticServer.origin));
        state.origins.primary = await listen(primary);
        return { state, origin: state.origins.primary, close };
    } catch (error) {
        await close().catch(() => undefined);
        throw error;
    }
}
module.exports = { specs, model, payload, createState, handler, startPolicyServers };
