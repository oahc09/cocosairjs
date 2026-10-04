import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Color,
    Material,
    SkinnedMeshRenderer,
    Skeleton,
    Mat4,
    utils,
    gfx,
    game,
    director,
} from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas', diagnostics: 'warnings' });
const gl = app.canvas.getContext('webgl2')!;
const uniformCapacity = Math.min(
    256,
    Math.floor((director.root!.device.capabilities.maxVertexUniformVectors - 38) / 3),
);
async function runCase(count: number, joint: number, mapped: boolean) {
    const scene = new Scene('CapacityScene'),
        root = new Node('CapacityRoot'),
        bone = new Node(`Joint${joint}`);
    root.addChild(bone);
    scene.addChild(root);
    root.setPosition(0, -1, 0);
    bone.setPosition(1, 0, 0);
    const cn = new Node('Camera');
    cn.setPosition(0, 0, 10);
    scene.addChild(cn);
    const camera = cn.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.orthoHeight = 4;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(0, 0, 0, 255);
    const mesh = utils.createMesh({
        positions: [-1, 0, 0, 1, 0, 0, 0, 2, 0],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
        indices: [0, 1, 2],
        minPos: { x: -1, y: 0, z: 0 },
        maxPos: { x: 1, y: 2, z: 0 },
        customAttributes: [
            {
                attr: new gfx.Attribute(gfx.AttributeName.ATTR_JOINTS, gfx.Format.RGBA32F),
                values: [joint, 0, 0, 0, joint, 0, 0, 0, joint, 0, 0, 0],
            },
            {
                attr: new gfx.Attribute(gfx.AttributeName.ATTR_WEIGHTS, gfx.Format.RGBA32F),
                values: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
            },
        ],
    });
    if (mapped) {
        mesh.struct.jointMaps = [[joint]];
        mesh.struct.primitives[0].jointMapIndex = 0;
    }
    const skeleton = new Skeleton();
    skeleton.joints = Array.from({ length: count }, (_, i) => `Joint${i}`);
    skeleton.bindposes = Array.from({ length: count }, () => new Mat4());
    const material = new Material();
    material.initialize({ effectName: 'builtin-unlit', states: { rasterizerState: { cullMode: gfx.CullMode.NONE } } });
    material.setProperty('mainColor', new Color(255, 0, 0, 255));
    // Regress the live assignment path as well as the transport boundary.
    app.run(scene);
    game.pause();
    const sn = new Node('Skin');
    root.addChild(sn);
    const renderer = sn.addComponent(SkinnedMeshRenderer);
    let failure: any = null;
    app.diagnostics!.clear();
    try {
        renderer.setSharedMaterial(material, 0);
        renderer.mesh = mesh;
        renderer.skeleton = skeleton;
        renderer.skinningRoot = root;
        app.run(scene);
        game.pause();
        director.tick(0);
    } catch (error: any) {
        failure = { code: error.code, message: String(error.message) };
    }
    const model: any = renderer.model;
    let countRed = 0,
        sumX = 0;
    if (!failure) {
        const pixels = new Uint8Array(app.canvas.width * app.canvas.height * 4);
        gl.readPixels(0, 0, app.canvas.width, app.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        for (let i = 0; i < pixels.length; i += 4)
            if (pixels[i] > 180 && pixels[i + 1] < 30 && pixels[i + 2] < 30) {
                countRed++;
                sumX += (i / 4) % app.canvas.width;
            }
    }
    const result = {
        count,
        joint,
        mapped,
        uniformCapacity,
        failure,
        type: model?.constructor.name,
        paletteCapacity: model?._dataArray?.map((v: Float32Array) => v.length / 12),
        textureMode: model?._realTimeTextureMode,
        textureFormats: model?._realTimeJointTexture?._textures.map((t: any) => ({
            format: model._realTimeJointTexture._format,
            width: t.width,
            height: t.height,
        })),
        pixels: { count: countRed, centroidX: countRed ? sumX / countRed : null },
        width: app.canvas.width,
        diagnostics: app.diagnostics!.snapshot().filter((v) => v.severity === 'error'),
    };
    if (app.getScene() === scene) await app.releaseScene();
    else scene.destroy();
    mesh.destroy();
    skeleton.destroy();
    material.destroy();
    director.tick(0);
    return result;
}
(window as any).__capacity = { ready: true, uniformCapacity, runCase };
