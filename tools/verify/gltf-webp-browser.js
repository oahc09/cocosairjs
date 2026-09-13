/* playwright-cli run-code --filename=tools/verify/gltf-webp-browser.js
 * Real-browser WebP texture evidence: probe detection, full loader parse of a webp
 * image (no mocks; browser decodes the raster), texture upload with correct dimensions,
 * and core-fallback when the extension source is removed. Requires viewer server on 7462. */
async (page) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    await page.goto('http://127.0.0.1:7462/gltf-viewer/');
    const result = await page.evaluate(async () => {
        const { GLTFLoader, setTextureSupportForTesting, detectImageMime } = await import('/build/cocosair.module.js');
        // 1x1 lossy webp, same bytes the capability probe uses.
        const webp = new Uint8Array(atob('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==')
            .split('').map((c) => c.charCodeAt(0)));
        // Minimal textured glTF: one quad with UVs, one webp texture via EXT_texture_webp.
        const encoder = new TextEncoder();
        const positions = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
        const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
        const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
        const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
        const segments = [positions, normals, uvs, indices].map((a) => new Uint8Array(a.buffer));
        let total = segments.reduce((sum, s) => sum + s.byteLength, 0);
        total = Math.ceil(total / 4) * 4;
        const bin = new Uint8Array(total + webp.length + ((4 - (total + webp.length) % 4) % 4));
        const views = [];
        let at = 0;
        for (const s of segments) { views.push({ buffer: 0, byteOffset: at, byteLength: s.byteLength }); bin.set(s, at); at += s.byteLength; }
        at = Math.ceil(at / 4) * 4;
        const imageView = views.length; views.push({ buffer: 0, byteOffset: at, byteLength: webp.length });
        bin.set(webp, at);
        const json = {
            asset: { version: '2.0' },
            extensionsUsed: ['EXT_texture_webp', 'KHR_materials_unlit'],
            buffers: [{ byteLength: bin.byteLength }],
            bufferViews: [...views.slice(0, 4), { buffer: 0, byteOffset: views[4].byteOffset, byteLength: webp.length }],
            accessors: [
                { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3' },
                { bufferView: 1, componentType: 5126, count: 4, type: 'VEC3' },
                { bufferView: 2, componentType: 5126, count: 4, type: 'VEC2' },
                { bufferView: 3, componentType: 5123, count: 6, type: 'SCALAR' },
            ],
            images: [{ bufferView: imageView, mimeType: 'image/webp' }],
            textures: [{ extensions: { EXT_texture_webp: { source: 0 } }, sampler: 0 }],
            samplers: [{}],
            materials: [{ extensions: { KHR_materials_unlit: {} }, pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
            meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
            nodes: [{ mesh: 0, name: 'webp quad' }], scenes: [{ nodes: [0] }], scene: 0,
        };
        // GLB assembly (JSON + BIN chunks).
        const jsonBytes = encoder.encode(JSON.stringify(json));
        const jsonPadded = Math.ceil(jsonBytes.length / 4) * 4;
        const glbSize = 12 + 8 + jsonPadded + 8 + bin.byteLength;
        const glb = new DataView(new ArrayBuffer(glbSize));
        const bytes = new Uint8Array(glb.buffer);
        glb.setUint32(0, 0x46546c67, true); glb.setUint32(4, 2, true); glb.setUint32(8, glbSize, true);
        glb.setUint32(12, jsonPadded, true); bytes.fill(32, 20, 20 + jsonPadded); bytes.set(encoder.encode('JSON'), 16); bytes.set(jsonBytes, 20);
        glb.setUint32(20 + jsonPadded, bin.byteLength, true); bytes.set(encoder.encode('BIN\0'), 24 + jsonPadded); bytes.set(bin, 28 + jsonPadded);
        const glbBytes = glb.buffer;
        // 1. Magic + probe: the real browser decode path.
        const magic = detectImageMime(webp);
        // 2. Full parse with the webp extension (browser Image must decode it).
        const asset = await new GLTFLoader().parseAsync(glbBytes);
        const uploaded = { textures: asset.textures.length, imageWidth: asset.textures[0]?.image?.width ?? -1,
            warnings: asset.warnings.filter((w) => /webp/i.test(w)) };
        // 3. With the format marked unsupported and no core source, the load must fail cleanly.
        setTextureSupportForTesting('image/webp', false);
        let fallbackError = 'none';
        try { await new GLTFLoader().parseAsync(glbBytes); }
        catch (error) { fallbackError = String(error && error.message || error).slice(0, 160); }
        setTextureSupportForTesting('image/webp', null);
        asset.destroy();
        return { magic, uploaded, fallbackError };
    });
    return JSON.stringify({ ok: errors.length === 0 && result.magic === 'image/webp'
        && result.uploaded.textures === 1 && result.uploaded.imageWidth === 1
        && /no image source|failed to decode|unavailable/.test(result.fallbackError),
    result, errors }, null, 1);
}
