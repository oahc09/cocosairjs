import {
    Animation,
    Camera,
    Color,
    createAirApp,
    createStepClock,
    director,
    GLTFLoader,
    Node,
    Scene,
    SkinnedMeshRenderer,
} from 'cocosair';
import { containment, Point, skinnedVertices } from './oracle';

// Prepared for real Chromium / Firefox / WebKit WebGL2. A successful build is NOT execution evidence.
const app = await createAirApp({ canvas: '#GameCanvas', diagnostics: 'warnings' });
const gl = app.canvas.getContext('webgl2');
if (!gl) throw new Error('U05 requires real WebGL2; EmptyDevice is not an accepted substitute');
const scene = new Scene('U05 real browser fixture');
const cameraNode = new Node('Fixed camera');
cameraNode.setPosition(0, 0, 10);
scene.addChild(cameraNode);
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.ORTHO;
camera.orthoHeight = 4;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(0, 0, 0, 255);
app.run(scene);
const clock = createStepClock();
const source = await (await fetch('./rig.gltf')).text();
const tuple = (value: { x: number; y: number; z: number }): Point => [value.x, value.y, value.z];
const skinOf = (root: Node) => root.getComponentsInChildren(SkinnedMeshRenderer)[0];
const jointsOf = (root: Node) => [
    root.getChildByPath('Ancestor__0/RootBone__1')!,
    root.getChildByPath('Ancestor__0/RootBone__1/TipBone__2')!,
];
const referenceIds = new WeakMap<object, string>();
let referenceSequence = 0;
function referenceId(value: object): string {
    if (!referenceIds.has(value)) referenceIds.set(value, `cocos-reference-${++referenceSequence}`);
    return referenceIds.get(value)!;
}
function jointChain(joint: Node) {
    const chain: { position: Point; scale: Point; rotation: [number, number, number, number] }[] = [];
    for (let current: Node | null = joint; current && current !== scene; current = current.parent) {
        chain.push({
            position: tuple(current.position),
            scale: tuple(current.scale),
            rotation: [current.rotation.x, current.rotation.y, current.rotation.z, current.rotation.w],
        });
    }
    return chain;
}
function observe(root: Node) {
    const skin = skinOf(root);
    const bound = skin.model!.worldBounds!;
    const weight = skin.getWeight(0, 0);
    return {
        weight,
        bone: tuple(jointsOf(root)[0].position),
        jointChains: jointsOf(root).map(jointChain),
        bounds: {
            min: tuple(bound.center).map((value, axis) => value - tuple(bound.halfExtents)[axis]),
            max: tuple(bound.center).map((value, axis) => value + tuple(bound.halfExtents)[axis]),
        },
        containment: containment(
            { center: tuple(bound.center), halfExtents: tuple(bound.halfExtents) },
            skinnedVertices(jointsOf(root), weight),
        ),
    };
}
function pixels() {
    const data = new Uint8Array(app.canvas.width * app.canvas.height * 4);
    gl!.readPixels(0, 0, app.canvas.width, app.canvas.height, gl!.RGBA, gl!.UNSIGNED_BYTE, data);
    let colored = 0;
    const sums = [0, 0, 0, 0];
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 8 || data[i + 1] > 8 || data[i + 2] > 8) colored++;
        for (let channel = 0; channel < 4; channel++) sums[channel] += data[i + channel];
    }
    return {
        colored,
        sums,
        width: app.canvas.width,
        height: app.canvas.height,
        glError: gl!.getError(),
        renderedPrimitives: director.root!.device.numTris,
        drawCalls: director.root!.device.numDrawCalls,
    };
}
async function settle() {
    const frames: number[] = [];
    for (let i = 0; i < 2; i++) {
        frames.push(director.getTotalFrames());
        await clock.step(0);
        await Promise.resolve();
    }
    return frames;
}
let running = false;
type Checkpoint = (detail: {
    color: string;
    stage: 'combined' | 'frustum' | 'cycle-before' | 'cycle-live' | 'cycle-disposed';
    index?: number;
    weight?: number;
    x?: number;
    expectedVisible?: boolean;
}) => Promise<void>;
// A collector may observe the already-drawn state. It must not advance the engine or replace native APIs.
async function run(checkpoint: Checkpoint = async () => {}) {
    if (running) throw new Error('U05 fixture is already running');
    running = true;
    clock.begin();
    const results: unknown[] = [];
    try {
        for (const color of ['RGB', 'RGBA']) {
            // Select one actual primitive so one color mode cannot hide the other with an overlapping draw.
            const document = JSON.parse(source);
            document.meshes[0].primitives = [document.meshes[0].primitives[color === 'RGB' ? 0 : 1]];
            const asset = await new GLTFLoader().parseAsync(JSON.stringify(document));
            const instances = [asset.instantiate(), asset.instantiate(), asset.instantiate()];
            const parents = instances.map((instance, index) => {
                const parent = new Node(`Independent parent ${index}`);
                parent.setScale(
                    ...([
                        [0.5, 0.5, 1],
                        [0.75, 0.3, 1],
                        [-0.5, 0.75, 1],
                    ][index] as Point),
                );
                parent.setPosition((index - 1) * 2.5, 0, 0);
                parent.addChild(instance.root);
                scene.addChild(parent);
                return parent;
            });
            try {
                await settle();
                instances.forEach((instance, index) => {
                    const controller = instance.root.getComponent(Animation)!;
                    controller.play('move');
                    controller.getState('move')!.time = [0.25, 0.75, 1.5][index];
                    controller.getState('move')!.sample();
                    controller.pause();
                });
                await settle();
                const independent = instances.map((instance) => ({
                    ...observe(instance.root),
                    rootId: referenceId(instance.root),
                    skeletonId: referenceId(jointsOf(instance.root)[0]),
                    mixerId: referenceId(instance.root.getComponent(Animation)!),
                    geometryId: referenceId(skinOf(instance.root).mesh!),
                    textureId: referenceId(
                        skinOf(instance.root).getSharedMaterial(0)!.getProperty('mainTexture') as object,
                    ),
                    clipId: referenceId(instance.animations[0]),
                }));
                const shared = {
                    meshes: instances.every((instance) => skinOf(instance.root).mesh === asset.meshes[0]),
                    clips: instances.every((instance) => instance.animations[0] === instances[0].animations[0]),
                    texture: instances.every(
                        (instance) =>
                            skinOf(instance.root).getSharedMaterial(0)!.getProperty('mainTexture') ===
                            asset.textures[0],
                    ),
                };
                const combined = pixels();
                await checkpoint({ color, stage: 'combined', expectedVisible: true });
                instances.slice(1).forEach((instance) => {
                    instance.root.active = false;
                });
                const frustum: unknown[] = [];
                for (const weight of [-1, 0, 1]) {
                    skinOf(instances[0].root).setWeight(weight, 0, 0);
                    for (const x of [-8, 0, 8, 0]) {
                        parents[0].setPosition(x, 0, 0);
                        await settle();
                        frustum.push({
                            weight,
                            x,
                            expectedVisible: x === 0,
                            pixels: pixels(),
                            state: observe(instances[0].root),
                        });
                        await checkpoint({
                            color,
                            stage: 'frustum',
                            index: frustum.length - 1,
                            weight,
                            x,
                            expectedVisible: x === 0,
                        });
                    }
                }
                instances.slice(1).forEach((instance) => {
                    instance.root.active = true;
                });
                await settle();
                const models = scene.renderScene!.models.length;
                const cycles: unknown[] = [];
                for (let cycle = 0; cycle < 30; cycle++) {
                    await checkpoint({ color, stage: 'cycle-before', index: cycle });
                    const copy = asset.instantiate();
                    scene.addChild(copy.root);
                    await settle();
                    const variant = skinOf(copy.root).getMaterialInstance(0)!;
                    await checkpoint({ color, stage: 'cycle-live', index: cycle });
                    copy.dispose();
                    copy.dispose();
                    const frames = await settle();
                    cycles.push({
                        cycle,
                        frames,
                        rootValid: copy.root.isValid,
                        passes: variant.passes.length,
                        refs: asset.refCount,
                        models: scene.renderScene!.models.length,
                    });
                    await checkpoint({ color, stage: 'cycle-disposed', index: cycle });
                }
                results.push({
                    color,
                    shared,
                    independent,
                    combined,
                    frustum,
                    cycles,
                    baselineModels: models,
                    unchangedOtherInstances: instances.slice(1).map((instance) => observe(instance.root)),
                });
            } finally {
                asset.destroy();
                instances.forEach((instance) => instance.dispose());
                await settle();
                parents.forEach((parent) => parent.destroy());
                await settle();
            }
        }
        return {
            schema: 'upstream-skinning-browser-observations/1',
            results,
            diagnostics: app.diagnostics?.snapshot(),
            scope: 'GPU readback and runtime observations only; collector must assert these and retain compositor screenshots separately.',
        };
    } finally {
        clock.end();
        running = false;
    }
}
(window as any).__upstreamSkinning = {
    ready: true,
    run,
    async close() {
        if (running) throw new Error('U05 cannot acknowledge close while the fixture is running');
        if (typeof app.close !== 'function') throw new Error('U05 requires the native app close contract');
        const receipt = await app.close();
        return { receipt, scene: app.getScene(), sceneValid: scene.isValid, running };
    },
};
