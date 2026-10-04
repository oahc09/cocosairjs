import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Color,
    Material,
    MeshRenderer,
    SkinnedMeshRenderer,
    SkeletalAnimation,
    AnimationClip,
    animation,
    Skeleton,
    Mat4,
    Quat,
    Vec3,
    DirectionalLight,
    utils,
    gfx,
    game,
    director,
} from 'cocosair';
import { inspectSkinning } from '../../../tools/debug/skinning-inspector';
const app = await createAirApp({ canvas: '#GameCanvas', diagnostics: 'warnings' }),
    gl = app.canvas.getContext('webgl2')!;
const positions = [-1, -1, 0.75, 1, -1, -0.75, 0, 1, 0],
    normal = new Vec3(0.6, 0, 0.8);
function meshAt(points: number[], normals: number[], skinned = false) {
    return utils.createMesh({
        positions: points,
        normals,
        indices: [0, 1, 2],
        minPos: {
            x: Math.min(...points.filter((_, i) => i % 3 === 0)),
            y: Math.min(...points.filter((_, i) => i % 3 === 1)),
            z: Math.min(...points.filter((_, i) => i % 3 === 2)),
        },
        maxPos: {
            x: Math.max(...points.filter((_, i) => i % 3 === 0)),
            y: Math.max(...points.filter((_, i) => i % 3 === 1)),
            z: Math.max(...points.filter((_, i) => i % 3 === 2)),
        },
        ...(skinned
            ? {
                  customAttributes: [
                      {
                          attr: new gfx.Attribute(gfx.AttributeName.ATTR_JOINTS, gfx.Format.RGBA32F),
                          values: Array(12).fill(0),
                      },
                      {
                          attr: new gfx.Attribute(gfx.AttributeName.ATTR_WEIGHTS, gfx.Format.RGBA32F),
                          values: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
                      },
                  ],
              }
            : {}),
    });
}
const normals = Array.from({ length: 3 }, () => [normal.x, normal.y, normal.z]).flat();
function material(lit: boolean, cull = false) {
    const m = new Material();
    m.initialize({
        effectName: lit ? 'builtin-standard' : 'builtin-unlit',
        states: { rasterizerState: { cullMode: cull ? gfx.CullMode.BACK : gfx.CullMode.NONE } },
    });
    m.setProperty('mainColor', new Color(255, lit ? 255 : 0, lit ? 255 : 0, 255));
    if (lit) {
        m.setProperty('metallic', 0);
        m.setProperty('roughness', 1);
    }
    return m;
}
function capture() {
    const data = new Uint8Array(app.canvas.width * app.canvas.height * 4);
    gl.readPixels(0, 0, app.canvas.width, app.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    let count = 0,
        sx = 0,
        sy = 0;
    for (let i = 0; i < data.length; i += 4)
        if (data[i] > 180 && data[i + 1] < 30 && data[i + 2] < 30) {
            count++;
            sx += (i / 4) % app.canvas.width;
            sy += Math.floor(i / 4 / app.canvas.width);
        }
    return { data, count, centroid: count ? [sx / count, sy / count] : null };
}
function sample(data: Uint8Array, center: number[]) {
    const [x, y] = center.map(Math.round),
        out = [0, 0, 0];
    let n = 0;
    for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
            const i = ((y + dy) * app.canvas.width + x + dx) * 4;
            for (let c = 0; c < 3; c++) out[c] += data[i + c];
            n++;
        }
    return out.map((v) => v / n);
}
function vectorTrack(property: string, a: number[], b: number[]) {
    const track = new animation.VectorTrack();
    track.componentsCount = 3;
    track.path.toHierarchy('Bone').toProperty(property);
    for (let c = 0; c < 3; c++)
        track.channels()[c].curve.assignSorted([
            [0, { value: a[c], interpolationMode: 0 }],
            [1, { value: b[c], interpolationMode: 0 }],
        ]);
    return track;
}
function makeRig(baked: boolean, animated = false, bindingOptions: any = {}) {
    const scene = new Scene('SkinningTransforms'),
        cn = new Node('Camera');
    scene.addChild(cn);
    cn.setPosition(0, 0, 10);
    const camera = cn.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.orthoHeight = 4;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(0, 0, 0, 255);
    const ln = new Node('Light');
    scene.addChild(ln);
    ln.addComponent(DirectionalLight).illuminance = 65000;
    const ancestor = new Node('Ancestor'),
        root = new Node('Armature'),
        bone = new Node('Bone'),
        sn = new Node('Skin');
    scene.addChild(ancestor);
    ancestor.addChild(root);
    root.addChild(bone);
    root.addChild(sn);
    let anim: SkeletalAnimation | null = null,
        clip: AnimationClip | null = null;
    if (bindingOptions.hasAnimation ?? (baked || animated)) {
        anim = root.addComponent(SkeletalAnimation);
        anim.useBakedAnimation = baked;
        anim.enabled = bindingOptions.animationEnabled ?? true;
    }
    if (animated) {
        clip = new AnimationClip();
        clip.name = 'MoveBone';
        clip.duration = 1;
        clip.sample = 30;
        clip.addTrack(vectorTrack('position', [0.5, 0, 0], [1.5, 0, 0]));
        anim!.clips = [clip];
    }
    const mesh = meshAt(positions, normals, true),
        skeleton = new Skeleton();
    skeleton.joints = ['Bone', 'Unused'];
    skeleton.bindposes = [new Mat4(), new Mat4()];
    if (bindingOptions.live) {
        app.run(scene);
        game.pause();
    }
    const red = material(false),
        white = material(true),
        skin = sn.addComponent(SkinnedMeshRenderer);
    skin.enabled = bindingOptions.enabled ?? true;
    for (const key of bindingOptions.order ?? ['mesh', 'skeleton', 'root']) {
        if (key === 'mesh') skin.mesh = mesh;
        else if (key === 'skeleton') skin.skeleton = skeleton;
        else skin.skinningRoot = root;
    }
    skin.setSharedMaterial(red, 0);
    const rn = new Node('RigidReference');
    scene.addChild(rn);
    const reference = rn.addComponent(MeshRenderer);
    reference.enabled = false;
    const resources: any[] = [mesh, skeleton, red, white];
    if (clip) resources.push(clip);
    const close = async () => {
        await app.releaseScene();
        for (const r of resources) r.destroy();
        director.tick(0);
        return resources.map((r) => r.isValid);
    };
    return { scene, ancestor, root, bone, sn, skin, skeleton, reference, anim, clip, red, white, resources, close };
}
async function transformCase(options: any) {
    const rig = makeRig(options.baked),
        target = options.target === 'ancestor' ? rig.ancestor : options.target === 'smr' ? rig.sn : rig.root;
    if (options.cull) {
        rig.red = material(false, true);
        rig.resources.push(rig.red);
        rig.skin.setSharedMaterial(rig.red, 0);
    }
    if (options.scale) target.setScale(options.scale[0], options.scale[1], options.scale[2]);
    if (options.rotation) target.setRotationFromEuler(options.rotation[0], options.rotation[1], options.rotation[2]);
    if (options.translation) target.setPosition(options.translation[0], options.translation[1], options.translation[2]);
    const bonePosition = options.bonePosition ?? [0, 0, 0],
        boneRotation = options.boneRotation ?? [0, 0, 0],
        boneScale = options.boneScale ?? [1, 1, 1];
    rig.bone.setPosition(bonePosition[0], bonePosition[1], bonePosition[2]);
    rig.bone.setRotationFromEuler(boneRotation[0], boneRotation[1], boneRotation[2]);
    rig.bone.setScale(boneScale[0], boneScale[1], boneScale[2]);
    if (options.bindpose) {
        const q = new Quat();
        Quat.fromEuler(q, 0, 0, -25);
        Mat4.fromRTS(rig.skeleton.bindposes[0], q, new Vec3(-0.25, 0.2, 0), new Vec3(0.7, 1.2, 1));
    }
    app.run(rig.scene);
    game.pause();
    app.diagnostics!.clear();
    director.tick(0);
    // Independent rigid oracle uses the declared TRS and inverse bind matrix.
    const q = new Quat();
    Quat.fromEuler(q, boneRotation[0], boneRotation[1], boneRotation[2]);
    const local = new Mat4();
    Mat4.fromRTS(
        local,
        q,
        new Vec3(bonePosition[0], bonePosition[1], bonePosition[2]),
        new Vec3(boneScale[0], boneScale[1], boneScale[2]),
    );
    const skinMatrix = new Mat4();
    Mat4.multiply(skinMatrix, local, rig.skeleton.bindposes[0]);
    const world = new Mat4();
    Mat4.multiply(world, rig.root.worldMatrix, skinMatrix);
    const transformed: number[] = [];
    for (let i = 0; i < positions.length; i += 3) {
        const p = new Vec3(positions[i], positions[i + 1], positions[i + 2]);
        Vec3.transformMat4(p, p, world);
        transformed.push(p.x, p.y, p.z);
    }
    const inverseTranspose = new Mat4();
    Mat4.invert(inverseTranspose, world);
    Mat4.transpose(inverseTranspose, inverseTranspose);
    const expectedNormal = new Vec3();
    Vec3.transformMat4Normal(expectedNormal, normal, inverseTranspose);
    Vec3.normalize(expectedNormal, expectedNormal);
    const rm = meshAt(
        transformed,
        Array.from({ length: 3 }, () => [expectedNormal.x, expectedNormal.y, expectedNormal.z]).flat(),
    );
    rig.resources.push(rm);
    rig.reference.mesh = rm;
    rig.reference.setSharedMaterial(rig.red, 0);
    const actual = capture(),
        inspection = inspectSkinning(rig.skin);
    rig.skin.enabled = false;
    rig.reference.enabled = true;
    director.tick(0);
    const expected = capture();
    let lighting: any = null;
    if (options.lit) {
        rig.reference.enabled = false;
        rig.skin.enabled = true;
        rig.skin.setSharedMaterial(rig.white, 0);
        director.tick(0);
        const skinLit = capture();
        rig.skin.enabled = false;
        rig.reference.enabled = true;
        rig.reference.setSharedMaterial(rig.white, 0);
        director.tick(0);
        const referenceLit = capture();
        lighting = {
            actual: sample(skinLit.data, actual.centroid!),
            expected: sample(referenceLit.data, expected.centroid!),
            normal: [expectedNormal.x, expectedNormal.y, expectedNormal.z],
        };
    }
    const errors = app.diagnostics!.snapshot().filter((v) => v.severity === 'error'),
        released = await rig.close();
    return {
        options,
        actual: { count: actual.count, centroid: actual.centroid },
        expected: { count: expected.count, centroid: expected.centroid },
        inspection,
        lighting,
        errors,
        released,
    };
}
async function clipCase(baked: boolean) {
    const rig = makeRig(baked, true);
    app.run(rig.scene);
    game.pause();
    app.diagnostics!.clear();
    rig.anim!.play('MoveBone');
    director.tick(0);
    const state = rig.anim!.getState('MoveBone')!,
        first = capture();
    const firstTime = state.time;
    state.time = 0.5;
    state.sample();
    director.tick(0);
    const middle = capture();
    rig.anim!.pause();
    director.tick(0.2);
    const paused = capture(),
        pausedTime = state.time;
    rig.anim!.resume();
    director.tick(0.25);
    const resumed = capture(),
        resumedTime = state.time;
    const before = inspectSkinning(rig.skin);
    rig.anim!.pause();
    rig.anim!.useBakedAnimation = !baked;
    rig.anim!.play('MoveBone');
    director.tick(0);
    state.time = 0.5;
    state.sample();
    director.tick(0);
    const switched = capture(),
        after = inspectSkinning(rig.skin);
    const result = {
        baked,
        first: { count: first.count, centroid: first.centroid, time: firstTime },
        middle: { centroid: middle.centroid },
        paused: { centroid: paused.centroid, time: pausedTime },
        resumed: { centroid: resumed.centroid, time: resumedTime },
        switched: { centroid: switched.centroid },
        before,
        after,
        errors: app.diagnostics!.snapshot().filter((v) => v.severity === 'error'),
    };
    return { ...result, released: await rig.close() };
}
async function lifecycleCase(options: any) {
    const baked = ['baked', 'disabledBaked'].includes(options.mode),
        rig = makeRig(baked, false, {
            hasAnimation: options.mode !== 'none',
            animationEnabled: options.mode !== 'disabledBaked',
            enabled: options.enabled,
            order: options.order,
            live: options.live,
        });
    app.diagnostics!.clear();
    app.run(rig.scene);
    game.pause();
    rig.skin.enabled = true;
    director.tick(0);
    const pixels = capture(),
        inspection = inspectSkinning(rig.skin),
        errors = app.diagnostics!.snapshot().filter((v) => v.severity === 'error');
    director.tick(0);
    const second = capture();
    const model: any = rig.skin.model;
    const state = {
        enabled: model?.enabled,
        subModels: model?.subModels.length,
        inScene: rig.scene.renderScene?.models.includes(model),
        materialColor: rig.skin.sharedMaterial?.getProperty('mainColor'),
    };
    return {
        options,
        pixels: { count: pixels.count, centroid: pixels.centroid },
        inspection,
        second: { count: second.count, centroid: second.centroid },
        state,
        errors,
        released: await rig.close(),
    };
}
let previewRig: ReturnType<typeof makeRig> | null = null;
async function rebindCase() {
    const rig = makeRig(false);
    app.run(rig.scene);
    game.pause();
    app.diagnostics!.clear();
    director.tick(0);
    const base = capture(),
        before = inspectSkinning(rig.skin);
    const expanded = new Skeleton();
    expanded.joints = Array.from({ length: 300 }, (_, i) => (i === 0 ? 'Bone' : `Unused${i}`));
    expanded.bindposes = Array.from({ length: 300 }, () => new Mat4());
    rig.resources.push(expanded);
    rig.skin.skeleton = expanded;
    rig.bone.setPosition(1, 0, 0);
    director.tick(0);
    const texture = capture(),
        middle = inspectSkinning(rig.skin);
    rig.skin.skeleton = rig.skeleton;
    director.tick(0);
    const uniform = capture(),
        after = inspectSkinning(rig.skin);
    const errors = app.diagnostics!.snapshot().filter((v) => v.severity === 'error');
    return {
        before,
        middle,
        after,
        base: { count: base.count, centroid: base.centroid },
        texture: { count: texture.count, centroid: texture.centroid },
        uniform: { count: uniform.count, centroid: uniform.centroid },
        errors,
        released: await rig.close(),
    };
}
function preview() {
    previewRig = makeRig(false);
    previewRig.root.setScale(-1.6, 0.7, 1);
    app.run(previewRig.scene);
    game.pause();
    director.tick(0);
    return inspectSkinning(previewRig.skin);
}
async function releasePreview() {
    const released = await previewRig!.close();
    previewRig = null;
    return released;
}
(window as any).__skinTransforms = {
    ready: true,
    transformCase,
    clipCase,
    lifecycleCase,
    rebindCase,
    preview,
    releasePreview,
};
