/* CPU regressions for the real AIR KTX2 adapter and parse-scoped ownership.
 * GFX capability/format lookup is stubbed; provider tests use deterministic doubles
 * and the repository's pinned Basis WASM.
 * No browser, GPU, or codec conformance claim. No evidence or runtime output writes.
 * node --test tools/verify/gltf-ktx2-lifecycle.test.cjs */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const sourceRoot = 'src/air/assets/gltf';
// Khronos KTX 2.0 specification, section 3.1 (not the KTX 1.0 identifier).
// https://registry.khronos.org/KTX/specs/2.0/ktxspec.v2.html#_identifier
const identifier = Uint8Array.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);

function runtime() {
    const cache = new Map();
    const Format = {
        RGBA8: 35,
        BC7: 73,
        BC7_SRGB: 74,
        ETC2_RGB8: 75,
        ETC2_RGBA8: 76,
        ETC2_SRGB8: 77,
        ETC2_SRGB8_A8: 78,
        ASTC_RGBA_4X4: 79,
    };
    function load(file) {
        if (cache.has(file)) return cache.get(file);
        const exports = {};
        cache.set(file, exports);
        const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
        }).outputText;
        vm.runInNewContext(
            code,
            {
                exports,
                ArrayBuffer,
                Uint8Array,
                DataView,
                TextDecoder,
                URL,
                Headers,
                DOMException,
                console,
                require(name) {
                    if (name === '../../../../cocos/gfx') return { Format };
                    if (name === './device-formats') return { deviceKTX2Formats: () => ['RGBA8'] };
                    assert(name.startsWith('.'), `unexpected dependency ${name}`);
                    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), `${name}.ts`));
                    assert(target.startsWith(`${sourceRoot}/`), `unexpected runtime dependency ${target}`);
                    return load(target);
                },
            },
            { filename: file },
        );
        return exports;
    }
    return {
        Format,
        ...load(`${sourceRoot}/decoder/ktx2.ts`),
        ...load(`${sourceRoot}/extensions/texture/basisu.ts`),
        ...load(`${sourceRoot}/parser-context.ts`),
        ...load(`${sourceRoot}/decoder/types.ts`),
    };
}

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}

function fakeBasis(options = {}) {
    const state = { initialized: 0, files: [], disposed: 0 };
    const module = {
        initializeBasis() {
            state.initialized++;
            options.initialize?.();
        },
        dispose() {
            state.disposed++;
        },
        KTX2File: class {
            constructor(bytes) {
                this.bytes = bytes;
                this.closed = 0;
                this.deleted = 0;
                state.files.push(this);
            }
            isValid() {
                return options.valid ?? true;
            }
            isUASTC() {
                return false;
            }
            getWidth() {
                return 2;
            }
            getHeight() {
                return 2;
            }
            getLayers() {
                return 1;
            }
            getLevels() {
                return 1;
            }
            getFaces() {
                return 1;
            }
            getHasAlpha() {
                return true;
            }
            getDFDTransferFunc() {
                return options.transfer ?? 1;
            }
            getDFDFlags() {
                return options.flags ?? 0;
            }
            startTranscoding() {
                return true;
            }
            getImageLevelInfo() {
                return { width: 2, height: 2, origWidth: 2, origHeight: 2 };
            }
            getImageTranscodedSizeInBytes() {
                return 16;
            }
            transcodeImage(dst) {
                options.transcode?.();
                dst.fill(127);
                return options.transcodeResult ?? true;
            }
            close() {
                this.closed++;
                options.close?.();
            }
            delete() {
                this.deleted++;
            }
        },
    };
    return { module, state };
}

function embeddedContext(api, provider, signal) {
    // Nonzero subview offset with unrelated geometry on both sides.
    const storage = new Uint8Array(48).fill(71);
    storage.set(identifier, 17);
    const json = {
        asset: { version: '2.0' },
        images: [{ bufferView: 0, mimeType: 'image/ktx2' }],
        textures: [{ extensions: { KHR_texture_basisu: { source: 0 } } }],
        bufferViews: [{ buffer: 0, byteOffset: 17, byteLength: identifier.byteLength }],
    };
    const context = new api.GLTFParserContext(json, undefined, { ktx2Transcoder: provider, signal });
    context.buffers.push(storage.buffer);
    context.request = () => {
        throw new Error('embedded KTX2 must not fetch or create a blob URL');
    };
    const handler = api.basisuFactory(context);
    context.handlers = [handler];
    return { context, storage, resolve: () => handler.resolveTextureSource(0, context) };
}

const api = runtime();

test('KTX2 identifier accepts the spec bytes and offset views, rejecting KTX1 and every corrupted byte', () => {
    assert.equal(api.isKTX2(identifier), true);
    const wrapped = new Uint8Array(20);
    wrapped.set(identifier, 3);
    assert.equal(api.isKTX2(wrapped.subarray(3, 15)), true);
    const ktx1 = identifier.slice();
    ktx1[5] = 0x31;
    ktx1[6] = 0x31;
    assert.equal(api.isKTX2(ktx1), false);
    assert.equal(
        api.isKTX2(Uint8Array.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0x42, 0x42, 0xbb, 0x0d, 0x0a])),
        false,
    );
    for (let i = 0; i < identifier.length; i++) {
        assert.equal(api.isKTX2(identifier.subarray(0, i)), false);
        const invalid = identifier.slice();
        invalid[i] ^= 0xff;
        assert.equal(api.isKTX2(invalid), false, `corruption at identifier byte ${i}`);
    }
});

test('embedded KTX2 transfers only its own bytes without detaching shared GLB geometry', async () => {
    let calls = 0;
    const provider = {
        async transcode(data) {
            calls++;
            assert.equal(data.byteLength, identifier.length);
            assert.deepEqual(new Uint8Array(data), identifier);
            const workerOwned = structuredClone(data, { transfer: [data] });
            assert.equal(data.byteLength, 0);
            assert.deepEqual(new Uint8Array(workerOwned), identifier);
            return { data: new Uint8Array(16), mimeType: api.KTX2_RAW_MIME, width: 2, height: 2, format: 35 };
        },
        dispose() {
            throw new Error('the parse does not own the injected decoder');
        },
    };
    const { context, storage, resolve } = embeddedContext(api, provider);
    const snapshot = storage.slice();
    assert.equal((await resolve()).data.length, 16);
    assert.equal(calls, 1);
    assert.deepEqual(storage, snapshot);
    assert.equal(context.buffers[0].byteLength, 48);
    context.dispose();
    context.dispose();
    assert.deepEqual(storage, snapshot);
});

test('concurrent consumers share failed initialization and one fresh successful retry', async () => {
    const failure = new Error('transient WASM fetch failure');
    const gate = deferred();
    const { module, state } = fakeBasis();
    let factories = 0;
    const transcoder = api.createKTX2Transcoder(() => (++factories === 1 ? gate.promise : module));
    const first = transcoder.transcode(identifier.buffer, ['RGBA8']);
    const second = transcoder.transcode(identifier.buffer, ['RGBA8']);
    const outcomes = Promise.allSettled([first, second]);
    await Promise.resolve();
    assert.equal(factories, 1);
    gate.reject(failure);
    for (const result of await outcomes) {
        assert.equal(result.status, 'rejected');
        assert.equal(result.reason, failure);
    }
    assert.equal(state.files.length, 0);
    const results = await Promise.all([
        transcoder.transcode(identifier.buffer, ['RGBA8']),
        transcoder.transcode(identifier.buffer, ['RGBA8']),
    ]);
    assert.equal(factories, 2);
    assert.equal(state.initialized, 1);
    assert.equal(results.length, 2);
    assert.equal(state.files.length, 2);
    for (const file of state.files) {
        assert.equal(file.closed, 1);
        assert.equal(file.deleted, 1);
    }
    assert.equal(state.disposed, 0);
});

test('factory throws, invalid module surfaces, and initializeBasis failures remain retryable', async () => {
    for (const mode of ['sync-factory', 'invalid-module', 'initialize']) {
        let factories = 0;
        const failure = new Error(mode);
        const healthy = fakeBasis();
        const broken = fakeBasis({
            initialize: () => {
                throw failure;
            },
        });
        const transcoder = api.createKTX2Transcoder(() => {
            if (++factories > 1) return healthy.module;
            if (mode === 'sync-factory') throw failure;
            return mode === 'invalid-module' ? {} : broken.module;
        });
        await assert.rejects(
            transcoder.transcode(identifier.buffer, ['RGBA8']),
            mode === 'invalid-module' ? { code: 'GLTF_DECODER_MISSING' } : (error) => error === failure,
        );
        assert.equal((await transcoder.transcode(identifier.buffer, ['RGBA8'])).data.length, 16);
        assert.equal(factories, 2);
        assert.equal(healthy.state.initialized, 1);
        assert.equal(healthy.state.disposed, 0);
        assert.equal(broken.state.disposed, 0);
    }
});

test('each allocated Basis file closes and deletes exactly once on success or decode failure', async () => {
    for (const options of [
        {},
        { valid: false },
        { transcodeResult: false },
        {
            transcode: () => {
                throw new Error('transcode trap');
            },
        },
    ]) {
        const { module, state } = fakeBasis(options);
        const transcoder = api.createKTX2Transcoder(() => module);
        if (Object.keys(options).length) await assert.rejects(transcoder.transcode(identifier.buffer, ['RGBA8']));
        else await transcoder.transcode(identifier.buffer, ['RGBA8']);
        assert.equal(state.files.length, 1);
        assert.equal(state.files[0].closed, 1);
        assert.equal(state.files[0].deleted, 1);
        assert.equal(state.disposed, 0);
    }
});

test('close failure cannot skip deletion of its Basis file', async () => {
    const failure = new Error('close trap');
    const { module, state } = fakeBasis({
        close: () => {
            throw failure;
        },
    });
    const transcoder = api.createKTX2Transcoder(() => module);
    await assert.rejects(transcoder.transcode(identifier.buffer, ['RGBA8']), (error) => error === failure);
    assert.equal(state.files[0].closed, 1);
    assert.equal(state.files[0].deleted, 1);
    assert.equal(state.disposed, 0);
});

test("cancelling one parse discards its late output without destroying another parse's shared module", async () => {
    const gate = deferred();
    const started = deferred();
    const { module, state } = fakeBasis();
    const transcoder = api.createKTX2Transcoder(() => {
        started.resolve();
        return gate.promise;
    });
    const controller = new AbortController();
    const first = embeddedContext(api, transcoder, controller.signal);
    const second = embeddedContext(api, transcoder);
    const rejected = assert.rejects(first.resolve(), { name: 'AbortError' });
    const surviving = second.resolve();
    await started.promise;
    controller.abort();
    first.context.dispose();
    first.context.dispose();
    await rejected;
    assert.equal(state.files.length, 0);
    gate.resolve(module);
    assert.equal((await surviving).data.length, 16);
    await new Promise(setImmediate);
    assert.equal(state.initialized, 1);
    assert.equal(state.files.length, 2);
    for (const file of state.files) {
        assert.equal(file.closed, 1);
        assert.equal(file.deleted, 1);
    }
    second.context.dispose();
    assert.equal(state.disposed, 0);
    assert.equal((await transcoder.transcode(identifier.buffer, ['RGBA8'])).data.length, 16);
    assert.equal(state.initialized, 1);
});

test('pre-abort skips transcoder work and disposed parse rejects a late result', async () => {
    let calls = 0;
    const gate = deferred();
    const provider = {
        transcode() {
            calls++;
            return gate.promise;
        },
        dispose() {
            assert.fail('caller-owned decoder');
        },
    };
    const controller = new AbortController();
    controller.abort();
    const aborted = embeddedContext(api, provider, controller.signal);
    await assert.rejects(aborted.resolve(), { name: 'AbortError' });
    assert.equal(calls, 0);
    const disposed = embeddedContext(api, provider);
    const result = assert.rejects(disposed.resolve(), { name: 'AbortError' });
    assert.equal(calls, 1);
    disposed.context.dispose();
    gate.resolve({ data: new Uint8Array(16), mimeType: api.KTX2_RAW_MIME, width: 2, height: 2, format: 35 });
    await result;
});

// One synthetic 4x4 UASTC block, with standard little-endian KTX2 indices and DFD.
// The pinned Basis WASM parses AND transcodes this fixture in the native API test.
function uastcTexture(transfer, flags = 0, dfdOffset = 104) {
    const levelOffset = Math.ceil((dfdOffset + 44) / 16) * 16;
    const bytes = new Uint8Array(levelOffset + 16);
    bytes.set(identifier);
    const view = new DataView(bytes.buffer);
    for (const [offset, value] of [
        [16, 1],
        [20, 4],
        [24, 4],
        [36, 1],
        [40, 1],
        [48, dfdOffset],
        [52, 44],
        [80, levelOffset],
        [88, 16],
        [96, 16],
        [dfdOffset, 44],
        [dfdOffset + 40, 0xffffffff],
    ])
        view.setUint32(offset, value, true);
    view.setUint16(dfdOffset + 8, 2, true);
    view.setUint16(dfdOffset + 10, 40, true);
    bytes.set([166, 1, transfer, flags, 3, 3, 0, 0, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 127, 0], dfdOffset + 12);
    return bytes;
}

test('DFD transfer selects sRGB independently of alpha flags, including without exported constants', async () => {
    for (const transfer of [1, 2, 3])
        for (const flags of [0, 1, 2, 0x40]) {
            const { module } = fakeBasis({ transfer, flags });
            const transcoder = api.createKTX2Transcoder(() => module);
            // No DFD in this synthetic input: the real getter is authoritative, as in supported bindings.
            const result = await transcoder.transcode(identifier.buffer, ['BC7']);
            assert.equal(result.format, transfer === 2 ? api.Format.BC7_SRGB : api.Format.BC7);
        }
});

test('older bindings without a transfer getter use the little-endian DFD with relocated offsets', async () => {
    for (const transfer of [1, 2])
        for (const flags of [0, 1])
            for (const offset of [104, 260]) {
                const { module, state } = fakeBasis({ flags });
                module.KTX2File.prototype.getDFDTransferFunc = undefined;
                const transcoder = api.createKTX2Transcoder(() => module);
                const result = await transcoder.transcode(uastcTexture(transfer, flags, offset).buffer, ['BC7']);
                assert.equal(result.format, transfer === 2 ? api.Format.BC7_SRGB : api.Format.BC7);
                assert.equal(state.files[0].deleted, 1);
            }
});

test('legacy binding rejects missing, truncated, overflowing, or invalid DFD metadata and still cleans up', async () => {
    const mutations = [
        (bytes) => bytes.subarray(0, 79),
        (bytes, view) => {
            view.setUint32(48, 0, true);
        },
        (bytes, view) => {
            view.setUint32(48, 80, true);
        },
        (bytes, view) => {
            view.setUint32(48, 105, true);
        },
        (bytes, view) => {
            view.setUint32(48, 0xfffffff0, true);
        },
        (bytes, view) => {
            view.setUint32(48, 104, false);
        },
        (bytes, view) => {
            view.setUint32(52, 27, true);
        },
        (bytes, view) => {
            view.setUint32(52, 0xffffffff, true);
        },
        (bytes, view) => {
            view.setUint32(104, 28, true);
        },
        (bytes, view) => {
            view.setUint32(108, 1, true);
        },
        (bytes, view) => {
            view.setUint16(112, 2, false);
        },
        (bytes, view) => {
            view.setUint16(114, 20, true);
        },
        (bytes, view) => {
            view.setUint16(114, 25, true);
        },
        (bytes, view) => {
            view.setUint16(114, 44, true);
        },
    ];
    for (const mutate of mutations) {
        const { module, state } = fakeBasis();
        module.KTX2File.prototype.getDFDTransferFunc = undefined;
        const transcoder = api.createKTX2Transcoder(() => module);
        let bytes = uastcTexture(2);
        bytes = mutate(bytes, new DataView(bytes.buffer)) || bytes;
        await assert.rejects(transcoder.transcode(bytes.buffer.slice(0, bytes.length), ['BC7']), {
            code: 'GLTF_DECODE_FAILED',
            message: /transfer-function descriptor/,
        });
        assert.equal(state.files[0].closed, 1);
        assert.equal(state.files[0].deleted, 1);
    }
});

test('pinned Basis WASM confirms transfer/flags separation and actual UASTC-to-BC7 output', async () => {
    const factory = require(path.join(root, 'build/gltf-decoders/basis/basis_transcoder.js'));
    const module = await factory({
        wasmBinary: fs.readFileSync(path.join(root, 'build/gltf-decoders/basis/basis_transcoder.wasm')),
    });
    assert.equal(module.KTX2_KHR_DF_TRANSFER_LINEAR, 1);
    assert.equal(module.KTX2_KHR_DF_TRANSFER_SRGB, 2);
    assert.equal(typeof module.KTX2File.prototype.getDFDTransferFunc, 'function');
    assert.equal(typeof module.KTX2File.prototype.getDFDFlags, 'function');
    const transcoder = api.createKTX2Transcoder(() => module);
    let linearData;
    for (const transfer of [1, 2])
        for (const flags of [0, 1]) {
            const bytes = uastcTexture(transfer, flags);
            const decoded = await transcoder.transcode(bytes.buffer, ['BC7']);
            assert.equal(decoded.width, 4);
            assert.equal(decoded.height, 4);
            assert.equal(decoded.format, transfer === 2 ? api.Format.BC7_SRGB : api.Format.BC7);
            assert.equal(decoded.compressed, true);
            assert.equal(decoded.data.length, 16);
            assert(decoded.data.some((byte) => byte !== 0));
            if (!linearData) linearData = decoded.data;
            else assert.deepEqual(decoded.data, linearData);
            const file = new module.KTX2File(bytes);
            try {
                assert.equal(file.getDFDTransferFunc(), transfer);
                assert.equal(file.getDFDFlags(), flags);
            } finally {
                file.close();
                file.delete();
            }
        }
    // Hide only the newer getter, retaining all native KTX2 decoding and disposal methods.
    const legacy = {
        initializeBasis() {},
        KTX2File: class {
            constructor(bytes) {
                const file = new module.KTX2File(bytes);
                return new Proxy(file, {
                    get(target, key) {
                        if (key === 'getDFDTransferFunc') return undefined;
                        const value = Reflect.get(target, key);
                        return typeof value === 'function' ? value.bind(target) : value;
                    },
                });
            }
        },
    };
    const fallback = api.createKTX2Transcoder(() => legacy);
    for (const transfer of [1, 2]) {
        const decoded = await fallback.transcode(uastcTexture(transfer).buffer, ['BC7']);
        assert.equal(decoded.format, transfer === 2 ? api.Format.BC7_SRGB : api.Format.BC7);
        assert.deepEqual(decoded.data, linearData);
    }
});
