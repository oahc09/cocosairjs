import { createAirApp, Scene, Node, Camera, Color, Material, SkinnedMeshRenderer,
    SkeletalAnimation, game, director, gfx } from 'cocosair';
import { skinnedTriangle, triangleSkeleton } from '../skinning/geometry';

const app = await createAirApp({ canvas: '#GameCanvas', diagnostics: 'warnings' });
const gl = app.canvas.getContext('webgl2')!;
let resources: Array<{ destroy(): void }> = [];
let stamp = 0;

function renderCase(options: { baked: boolean; target: 'none' | 'smr' | 'root' | 'ancestor';
    scale: number; cull: boolean; boneX?: number }) {
    const scene = new Scene('PausedSkinning');
    const cameraNode = new Node('Camera');
    cameraNode.setPosition(0, 0, 10);
    const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.orthoHeight = 5;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(20, 40, 100, 255);
    scene.addChild(cameraNode);
    const ancestor = new Node('Ancestor');
    const root = new Node('Armature');
    root.setPosition(0, -1.5, 0);
    const bone = new Node('Bone');
    bone.setPosition(options.boneX ?? 0, 0, 0);
    root.addChild(bone);
    // The unused skeleton path intentionally has no node.
    ancestor.addChild(root); scene.addChild(ancestor);
    if (options.baked) root.addComponent(SkeletalAnimation).useBakedAnimation = true;
    const node = new Node('Skin'); root.addChild(node);
    const target = options.target === 'smr' ? node : options.target === 'root' ? root : ancestor;
    if (options.target !== 'none') target.setScale(options.scale, 1, 1);
    const renderer = node.addComponent(SkinnedMeshRenderer);
    renderer.enabled = false;
    const mesh = skinnedTriangle(), skeleton = triangleSkeleton(), material = new Material();
    material.initialize({ effectName: 'builtin-unlit',
        states: { rasterizerState: { cullMode: options.cull ? gfx.CullMode.BACK : gfx.CullMode.NONE } } });
    material.setProperty('mainColor', new Color(230, 30, 20, 255));
    renderer.setSharedMaterial(material, 0);
    renderer.mesh = mesh; renderer.skeleton = skeleton; renderer.skinningRoot = root;
    app.run(scene); game.pause(); renderer.enabled = true;
    renderer.setUseBakedAnimation(options.baked, true);
    app.diagnostics!.clear();
    // One controlled render with dt=0; the animation clock has never advanced.
    director.tick(0);
    const model = renderer.model!;
    const pixels = new Uint8Array(app.canvas.width * app.canvas.height * 4);
    gl.readPixels(0, 0, app.canvas.width, app.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let count = 0, sumX = 0, sumY = 0, minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] > 120 && pixels[i + 1] < 100 && pixels[i + 2] < 100) {
            const x = (i / 4) % app.canvas.width, y = Math.floor(i / 4 / app.canvas.width);
            count++; sumX += x; sumY += y; minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        }
    }
    const bounds = (value) => value && ({ center: [value.center.x, value.center.y, value.center.z],
        halfExtents: [value.halfExtents.x, value.halfExtents.y, value.halfExtents.z] });
    const result = { stamp: ++stamp, options, type: model.constructor.name, modelBounds: bounds(model.modelBounds),
        worldBounds: bounds(model.worldBounds), transform: model.transform.name, paused: game.isPaused(),
        pixels: { count, centroid: count ? [sumX / count, sumY / count] : null,
            extentX: count ? [minX, maxX] : null }, dimensions: [app.canvas.width, app.canvas.height],
        errors: app.diagnostics!.snapshot().filter((entry) => entry.severity === 'error') };
    for (const resource of resources) resource.destroy();
    resources = [mesh, skeleton, material];
    return result;
}
(window as any).__skinningProbe = { ready: true, renderCase };
