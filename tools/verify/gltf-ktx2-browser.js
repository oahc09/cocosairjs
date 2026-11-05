/* playwright-cli run-code --filename=tools/verify/gltf-ktx2-browser.js
 * KTX2 browser evidence with the REAL Basis transcoder (no mocks):
 *  1. load /build/gltf-decoders/basis/basis_transcoder.js (UMD global BASIS) + wasm fetch;
 *  2. createKTX2Transcoder drives initializeBasis + KTX2File through real WASM: a synthetic
 *     KTX2 header must surface GLTF_DECODE_FAILED from the transcoder itself (proof the
 *     native path ran, not a JS stub);
 *  3. capability matrix: basisu decoder-required without a provider, supported with one;
 *  4. optional fallback: KHR_texture_basisu + core PNG decodes with a browser Image.
 * Requires tools/verify/serve-gltf.cjs (7462) and a built SDK. */
async (page) => {
    const errors = [];
    const expectedDiagnostics = [];
    page.on('console', (m) => {
        const t = m.text();
        if (/KHR_texture_basisu/.test(t) && (m.type() === 'warning' || m.type() === 'log')) {
            expectedDiagnostics.push(t.slice(0, 200));
            return;
        }
        if (m.type() === 'error' || (m.type() === 'warning' && /WebGL|shader|glTF/i.test(t)))
            errors.push(t.slice(0, 300));
    });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
    await page.goto('http://127.0.0.1:7462/gltf-viewer/');
    const result = await page.evaluate(async () => {
        const mod = await import('/build/cocosair.module.js');
        const { GLTFLoader, createKTX2Transcoder, isKTX2 } = mod;
        // 1. real UMD transcoder script (defines global BASIS; wasm fetched via locateFile)
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = '/build/gltf-decoders/basis/basis_transcoder.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('transcoder script load failed'));
            document.head.appendChild(script);
        });
        const BASISFactory = window.BASIS;
        const moduleFound = typeof BASISFactory === 'function';
        // 2. drive the real WASM: synthetic KTX2 header must fail inside KTX2File.isValid
        let nativeVerdict = 'no-module';
        if (moduleFound) {
            const transcoder = createKTX2Transcoder(() =>
                BASISFactory({
                    locateFile: (file) => '/build/gltf-decoders/basis/' + file,
                }),
            );
            const header = new Uint8Array(64);
            [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a].forEach((b, i) => {
                header[i] = b;
            });
            const view = new DataView(header.buffer);
            view.setUint32(20, 4, true);
            view.setUint32(24, 4, true);
            view.setUint32(32, 1, true);
            view.setUint32(36, 1, true);
            view.setUint32(40, 1, true);
            nativeVerdict = 'unknown';
            try {
                await transcoder.transcode(header.buffer);
                nativeVerdict = 'unexpected-success';
            } catch (error) {
                nativeVerdict = String((error && error.code) || error);
            }
        }
        // 3. capability matrix
        const without = new GLTFLoader().getExtensionSupport().find((e) => e.name === 'KHR_texture_basisu');
        const withProvider = new GLTFLoader({
            ktx2Transcoder: {
                async transcode() {
                    return { data: new Uint8Array(0), mimeType: 'image/png' };
                },
            },
        })
            .getExtensionSupport()
            .find((e) => e.name === 'KHR_texture_basisu');
        // 4. optional fallback with a real 1x1 PNG core image (browser decodes it)
        const png = Uint8Array.from(
            atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')
                .split('')
                .map((c) => c.charCodeAt(0)),
        );
        const json = {
            asset: { version: '2.0' },
            extensionsUsed: ['KHR_texture_basisu'],
            buffers: [{ byteLength: png.length }],
            bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: png.length }],
            accessors: [],
            images: [{ bufferView: 0 }],
            textures: [{ extensions: { KHR_texture_basisu: { source: 0 } }, source: 0 }],
            nodes: [],
            scenes: [{ nodes: [] }],
            scene: 0,
        };
        const enc = new TextEncoder();
        const jsonBytes = enc.encode(JSON.stringify(json));
        const jsonPad = Math.ceil(jsonBytes.length / 4) * 4;
        const binLen = Math.ceil(png.length / 4) * 4;
        const glbSize = 12 + 8 + jsonPad + 8 + binLen;
        const glb = new ArrayBuffer(glbSize);
        const dv = new DataView(glb);
        const u8 = new Uint8Array(glb);
        dv.setUint32(0, 0x46546c67, true);
        dv.setUint32(4, 2, true);
        dv.setUint32(8, glbSize, true);
        dv.setUint32(12, jsonPad, true);
        u8.set(enc.encode('JSON'), 16);
        u8.fill(32, 20, 20 + jsonPad);
        u8.set(jsonBytes, 20);
        dv.setUint32(20 + jsonPad, binLen, true);
        u8.set(enc.encode('BIN\0'), 24 + jsonPad);
        u8.set(png, 28 + jsonPad);
        const asset = await new GLTFLoader().parseAsync(glb);
        const fellBack = asset.warnings.some((w) => /KHR_texture_basisu/.test(w));
        const decodedWidth = (await asset.textures[0]?.image?.width) ?? -1;
        asset.destroy();
        return {
            isKTX2Ok: isKTX2(new Uint8Array(0)) === false,
            moduleFound,
            nativeVerdict,
            withoutStatus: without?.status,
            withStatus: withProvider?.status,
            fellBack,
            decodedWidth,
        };
    });
    const ok =
        errors.length === 0 &&
        result.isKTX2Ok &&
        result.moduleFound &&
        result.nativeVerdict === 'GLTF_DECODE_FAILED' &&
        result.withoutStatus === 'decoder-required' &&
        result.withStatus === 'supported' &&
        result.fellBack &&
        result.decodedWidth === 1;
    return JSON.stringify({ ok, result, errors: errors.slice(0, 4) }, null, 1);
};
