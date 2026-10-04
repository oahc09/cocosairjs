import { Scene, Node, Camera, Color, Layers, GLTFLoader, Texture2D, director, game } from 'cocosair';
import type { GLTFAsset, GLTFInstance } from 'cocosair';
const { createAirApp } = await import('/build/bootstrap.js');
const app = await createAirApp({ canvas: '#GameCanvas', designResolution: { width: 480, height: 360, policy: 0 } });
const scene = new Scene('GLTFTextureDirection');
const cameraNode = new Node('Camera'); scene.addChild(cameraNode); cameraNode.setPosition(0, 0, 10);
const camera = cameraNode.addComponent(Camera); camera.projection = Camera.ProjectionType.ORTHO;
camera.orthoHeight = 180; camera.visibility = Layers.Enum.DEFAULT;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(0, 0, 0, 255);
app.run(scene); game.pause();

const bytes = new Uint8Array([255,0,0,255, 0,255,0,255, 0,0,255,255, 255,255,0,255]);
const pngSource = document.createElement('canvas'); pngSource.width = 2; pngSource.height = 2;
pngSource.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(bytes), 2, 2), 0, 0);
const pngURL = pngSource.toDataURL('image/png');
const pngBytes = Uint8Array.from(atob(pngURL.split(',')[1]), (char) => char.charCodeAt(0));
const encode = (value: Uint8Array) => btoa(Array.from(value, (byte) => String.fromCharCode(byte)).join(''));
function documentFor(kind: string, sampler: Record<string, number>) {
    const positions = new Float32Array([-64,-64,0, 64,-64,0, -64,64,0, 64,64,0]);
    const uvs = new Float32Array([0,1, 1,1, 0,0, 1,0]);
    const indices = new Uint16Array([0,1,2, 2,1,3]);
    const embedded = kind === 'embedded';
    const binary = new Uint8Array(92 + (embedded ? pngBytes.length : 0));
    binary.set(new Uint8Array(positions.buffer), 0); binary.set(new Uint8Array(uvs.buffer), 48);
    binary.set(new Uint8Array(indices.buffer), 80); if (embedded) binary.set(pngBytes, 92);
    return {
        asset: { version: '2.0' }, extensionsUsed: ['KHR_materials_unlit'],
        buffers: [{ uri: 'data:application/octet-stream;base64,' + encode(binary), byteLength: binary.length }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 48 }, { buffer: 0, byteOffset: 48, byteLength: 32 },
            { buffer: 0, byteOffset: 80, byteLength: 12 }, ...(embedded ? [{ buffer: 0, byteOffset: 92, byteLength: pngBytes.length }] : [])],
        accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [-64,-64,0], max: [64,64,0] },
            { bufferView: 1, componentType: 5126, count: 4, type: 'VEC2' }, { bufferView: 2, componentType: 5123, count: 6, type: 'SCALAR' }],
        images: [embedded ? { bufferView: 3, mimeType: 'image/png' } : { uri: '/gltf-quadrants.png' }],
        samplers: [sampler], textures: [{ source: 0, sampler: 0 }],
        materials: [{ doubleSided: true, extensions: { KHR_materials_unlit: {} }, pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
        nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
    };
}
const assets: GLTFAsset[] = [], instances: GLTFInstance[] = [], samples: unknown[] = [];
const controls: Texture2D[] = [];
function render() {
    director.tick(0); director.tick(0);
    const gl = app.canvas.getContext('webgl2')!;
    return [[-32,32],[32,32],[-32,-32],[32,-32]].map(([x,y]) => {
        const value = new Uint8Array(4); gl.readPixels(240+x,180+y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,value); return [...value];
    });
}
async function run() {
    for (const kind of ['external', 'embedded']) {
        const sampler = { minFilter: 9728, magFilter: 9728, wrapS: 33071, wrapT: 33071 };
        const asset = await new GLTFLoader().parseAsync(JSON.stringify(documentFor(kind, sampler)), location.href);
        const instance = asset.instantiate(); assets.push(asset); instances.push(instance);
        instances.forEach((value) => { value.root.active = value === instance; }); scene.addChild(instance.root);
        const texture = asset.textures[0];
        const info = texture.getGFXSampler().info;
        samples.push({ kind, stage: 'initial', pixels: render(), sampler: asset.document.samplers![0],
            filters: { min: info.minFilter, mag: info.magFilter, wrapS: info.addressU, wrapT: info.addressV },
            // TextureBase maps its asset enums to GFX enums by numeric value.
            samplerMatches: Number(info.minFilter) === Number(Texture2D.Filter.NEAREST) && Number(info.magFilter) === Number(Texture2D.Filter.NEAREST)
                && Number(info.addressU) === Number(Texture2D.WrapMode.CLAMP_TO_EDGE) && Number(info.addressV) === Number(Texture2D.WrapMode.CLAMP_TO_EDGE) });
        // Interleave unrelated top-first and bottom-first byte uploads, then
        // draw the exact same original glTF texture and material again.
        for (const reversed of [false, true]) {
            const raw = new Texture2D(); raw.reset({ width: 2, height: 2, format: Texture2D.PixelFormat.RGBA8888 });
            const upload = reversed ? new Uint8Array([...bytes.slice(8), ...bytes.slice(0, 8)]) : bytes;
            raw.uploadData(upload); controls.push(raw);
        }
        samples.push({ kind, stage: 'afterInterleavedUploads', pixels: render(), sameTexture: asset.textures[0] === texture });
    }
    const sampler = { minFilter: 9728, magFilter: 9728, wrapS: 12345, wrapT: 33071 };
    let rejectedSampler: string | null = null;
    try { const asset = await new GLTFLoader().parseAsync(JSON.stringify(documentFor('embedded', sampler)), location.href); assets.push(asset); }
    catch (error) { rejectedSampler = String(error); }
    return { samples, rejectedSampler, errors: app.diagnostics.snapshot().filter((event) => event.severity === 'error') };
}
async function release() {
    const owned = assets.flatMap((asset) => [...asset.meshes, ...asset.materials, ...asset.textures, ...asset.images]);
    instances.forEach((instance) => instance.dispose()); assets.forEach((asset) => asset.destroy());
    controls.forEach((texture) => texture.destroy());
    const receipt = await app.releaseScene!(); await Promise.resolve(); director.tick(0); await Promise.resolve(); director.tick(0);
    return { receipt, nodesValid: instances.map((instance) => instance.root.isValid),
        assetsValid: assets.map((asset) => asset.isValid), ownedValid: owned.map((asset) => asset.isValid), controlsValid: controls.map((asset) => asset.isValid),
        textureRefs: owned.filter((asset) => asset instanceof Texture2D).map((texture) => texture.refCount), gpuMemory: 'unavailable' };
}
(window as unknown as { __gltfTextureDirection: unknown }).__gltfTextureDirection = { ready: true, pngURL, run, release };
