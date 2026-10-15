import { Scene, Node, Camera, Color, Layers, Canvas, createUICanvas, UITransform, Sprite, SpriteFrame,
    Texture2D, ImageAsset, MeshRenderer, Material, utils, primitives, director, game } from 'cocosair';
import type { Asset } from 'cocosair';
import { copyCanvasRows } from '../../../examples/shared/canvas-texture.js';
const { createAirApp } = await import('/build/cocosair.module.js');
const app = await createAirApp({ canvas: '#GameCanvas', designResolution: { width: 480, height: 360, policy: 0 } });
const scene = new Scene('TextureSourceReview');
const ui = createUICanvas(scene, 'Canvas', { designWidth: 480, designHeight: 360 });
const uiCamera = ui.getComponent(Canvas)!.cameraComponent!; uiCamera.clearColor = new Color(0, 0, 0, 255);
const spriteNode = new Node('Sprite'); spriteNode.layer = ui.layer; ui.addChild(spriteNode);
spriteNode.addComponent(UITransform).setContentSize(128, 128);
const sprite = spriteNode.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
const plane = new Node('Plane'); plane.layer = Layers.Enum.DEFAULT; scene.addChild(plane); plane.setRotationFromEuler(90, 0, 0);
const geometry = primitives.plane({ width: 128, length: 128, widthSegments: 1, lengthSegments: 1 });
const mesh = utils.createMesh(geometry), renderer = plane.addComponent(MeshRenderer); renderer.mesh = mesh;
const material = new Material(); material.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: true } }); renderer.material = material;
const cameraNode = new Node('PlaneCamera'); scene.addChild(cameraNode); cameraNode.setPosition(0, 0, 10);
const camera = cameraNode.addComponent(Camera); camera.projection = Camera.ProjectionType.ORTHO; camera.orthoHeight = 180;
camera.visibility = Layers.Enum.DEFAULT; camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(0, 0, 0, 255);
const source = document.createElement('canvas'); source.width = 2; source.height = 2;
const bytes = new Uint8Array([255,0,0,255, 0,255,0,255, 0,0,255,255, 255,255,0,255]);
const context = source.getContext('2d')!; context.putImageData(new ImageData(new Uint8ClampedArray(bytes), 2, 2), 0, 0);
const image = new Image(); image.src = source.toDataURL('image/png'); await image.decode();
const bitmap = await createImageBitmap(source);
interface Entry { source: string; texture: Texture2D; frame: SpriteFrame; image?: ImageAsset }
const entries: Entry[] = [];
function finishEntry(name: string, texture: Texture2D, image?: ImageAsset): Entry {
    texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
    texture.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
    const frame = new SpriteFrame(); frame.texture = texture; frame.packable = false;
    const entry = { source: name, texture, frame, image }; entries.push(entry); return entry;
}
function decodedEntry(name: string, asset: ImageAsset): Entry {
    const texture = new Texture2D(); texture.image = asset; return finishEntry(name, texture, asset);
}
const dom = [decodedEntry('htmlImage', new ImageAsset(image)), decodedEntry('canvas', new ImageAsset(source)),
    decodedEntry('imageBitmap', new ImageAsset(bitmap))];
const originals = dom.map((entry) => Object.freeze({ source: entry.source, texture: entry.texture, frame: entry.frame }));
// Compile-time negative only: ImageData is not a public ImageSource. It is
// never force-cast into an engine upload or counted as GPU execution.
function imageDataTypeNegative(value: ImageData): void {
    // @ts-expect-error SDK ImageSource excludes ImageData.
    new ImageAsset(value);
}
void imageDataTypeNegative;
app.run(scene); game.pause();
const observations: unknown[] = [];
function observe(entry: Entry, stage: string, original?: Entry): void {
    for (const kind of ['sprite', 'plane']) {
        ui.active = kind === 'sprite'; plane.active = kind === 'plane'; camera.enabled = kind === 'plane';
        sprite.spriteFrame = entry.frame; material.setProperty('mainTexture', entry.texture);
        director.tick(0); director.tick(0);
        const gl = app.canvas.getContext('webgl2')!;
        const pixels = [[-32,32],[32,32],[-32,-32],[32,-32]].map(([x,y]) => {
            const pixel = new Uint8Array(4); gl.readPixels(240+x,180+y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel); return [...pixel];
        });
        observations.push({ kind, source: entry.source, stage, pixels,
            ...(original ? { sameTexture: entry.texture === original.texture, sameFrame: entry.frame === original.frame } : {}) });
    }
}
function render() {
    for (const entry of dom) observe(entry, 'beforeByteUploads');
    const flipped = new Uint8Array(16); copyCanvasRows(context.getImageData(0, 0, 2, 2), flipped);
    for (const [name, data] of [['rawTopFirst', bytes], ['rawBottomFirst', flipped], ['copyCanvasRows', flipped]] as const) {
        const texture = new Texture2D(); texture.reset({ width: 2, height: 2, format: Texture2D.PixelFormat.RGBA8888 }); texture.uploadData(data);
        observe(finishEntry(name, texture), 'byteUploads');
    }
    observe(decodedEntry('memoryImageTopFirst', new ImageAsset({ _data: bytes, _compressed: false,
        width: 2, height: 2, format: Texture2D.PixelFormat.RGBA8888 })), 'byteUploads');
    dom.forEach((entry, index) => observe(entry, 'afterByteUploads', originals[index]));
    return { observations, imageData: { status: 'NOT_APPLICABLE', reason: 'ImageSource excludes ImageData; compile-time negative checked separately; no forced GPU upload' },
        spriteUV: [...dom[0].frame.uv], planeUV: geometry.uvs, copiedBytes: [...flipped],
        errors: app.diagnostics.snapshot().filter((event) => event.severity === 'error') };
}
async function release() {
    sprite.spriteFrame = null; renderer.mesh = null; renderer.material = null;
    const receipt = await app.releaseScene();
    const owned: Asset[] = [mesh, material, ...entries.flatMap((entry) => [entry.frame, entry.texture, ...(entry.image ? [entry.image] : [])])];
    owned.forEach((asset) => asset.destroy()); director.tick(0); await Promise.resolve(); director.tick(0); bitmap.close();
    return { receipt, valid: owned.map((asset) => asset.isValid), textureRefs: entries.map((entry) => entry.texture.refCount),
        imageRefs: entries.flatMap((entry) => entry.image ? [entry.image.refCount] : []), gpuMemory: 'unavailable' };
}
(window as unknown as { __textureSourceReview: unknown }).__textureSourceReview = { ready: true, render, release };
