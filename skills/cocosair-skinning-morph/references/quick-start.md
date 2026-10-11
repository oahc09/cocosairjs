Derived from the cocosair-skinning-morph skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

Environment: the HTML examples using `/build/` require the AIR development server and an existing bundle. In npm applications use the installed package name and the application's own bundler/server; resolve docs and declarations from that package. Do not copy repository URLs into a consumer app. Browser behavior is verified only for explicitly tested snippets and candidates.

# Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, DirectionalLight, Component, Material, Color, Vec3,
         SkinnedMeshRenderer, Mesh, gfx, buildSkeletonTree, restoreBindPose, frameObject } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });   // #GameCanvas must exist before this import
const scene = new Scene('skinning');
const camNode = new Node('Main Camera'); scene.addChild(camNode); camNode.setPosition(new Vec3(0, 2.4, 6.5));
const camera = camNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE; camera.fov = 45; camera.near = 0.1; camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(28, 36, 52, 255);
const lightNode = new Node('Main Light');
scene.addChild(lightNode); lightNode.setPosition(new Vec3(0, 8, 0)); lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight).illuminance = 55000;

// 1) bones: joint paths resolve with getChildByPath from the skinning root, so write FULL paths
const armature = new Node('Armature');
const bone0 = new Node('bone0'); armature.addChild(bone0);
const bone1 = new Node('bone1'); bone0.addChild(bone1); bone1.setPosition(0, 1.5, 0);
const bone2 = new Node('bone2'); bone1.addChild(bone2); bone2.setPosition(0, 1.5, 0);
const jointPaths = ['bone0', 'bone0/bone1', 'bone0/bone1/bone2'];

// 2) rigidly weighted ribbon: a_position + a_normal (RGB32F), a_joints + a_weights (RGBA32F), stride 56
const ROWS = 9, COLS = 4, SEG = 0.5, X = [-0.25, 0.25, 0.25, -0.25], Z = [-0.25, -0.25, 0.25, 0.25];
const vert = new Float32Array(ROWS * COLS * 14), tri = [];
for (let r = 0; r < ROWS; r++) {
    const y = r * SEG, joint = y < 1.5 ? 0 : (y < 3.0 ? 1 : 2);   // joint INDEX into jointPaths, not a name
    for (let c = 0; c < COLS; c++) {
        const o = (r * COLS + c) * 14;
        vert[o] = X[c]; vert[o + 1] = y; vert[o + 2] = Z[c]; vert[o + 5] = -1;   // normal (0, 0, -1)
        vert[o + 6] = joint; vert[o + 10] = 1;                                  // per-vertex weights sum to 1
        if (r < ROWS - 1) { const c2 = (c + 1) % COLS, a = r * COLS + c, d = (r + 1) * COLS + c, e = (r + 1) * COLS + c2; tri.push(a, d, e, a, e, r * COLS + c2); }
    }
}
const indexData = new Uint16Array(tri); const data = new Uint8Array(vert.byteLength + indexData.byteLength);
data.set(new Uint8Array(vert.buffer), 0); data.set(new Uint8Array(indexData.buffer), vert.byteLength);
const mesh = new Mesh();
mesh.reset({
    struct: {
        vertexBundles: [{ view: { offset: 0, length: vert.byteLength, count: ROWS * COLS, stride: 56 }, attributes: [
            { name: 'a_position', format: gfx.Format.RGB32F, isInstanced: false }, { name: 'a_normal', format: gfx.Format.RGB32F, isInstanced: false },
            { name: 'a_joints', format: gfx.Format.RGBA32F, isInstanced: false }, { name: 'a_weights', format: gfx.Format.RGBA32F, isInstanced: false }] }],
        primitives: [{ primitiveMode: gfx.PrimitiveMode.TRIANGLE_LIST, vertexBundelIndices: [0],
            indexView: { offset: vert.byteLength, length: indexData.byteLength, count: tri.length, stride: 2 } }],
        minPosition: { x: -0.25, y: 0, z: -0.25 }, maxPosition: { x: 0.25, y: (ROWS - 1) * SEG, z: 0.25 },
    },
    data,
});

// 3) bindpose = inverse(bone world matrix right now): capture before any bone is moved
const skeleton = buildSkeletonTree(armature, jointPaths);

// 4) mesh + skeleton + root must all exist before enabling; with no enabled SkeletalAnimation on the
//    root the native association path picks realtime skinning, so live bone edits drive the pose
const renderer = armature.addComponent(SkinnedMeshRenderer);
renderer.enabled = false;
renderer.mesh = mesh; renderer.skeleton = skeleton; renderer.skinningRoot = armature;
const material = new Material();
material.initialize({ effectName: 'builtin-standard' }); material.setProperty('mainColor', new Color(240, 160, 40, 255));
renderer.setSharedMaterial(material, 0);
renderer.enabled = true;
scene.addChild(armature);

// 5) edit real joint nodes; bounds and the joint upload complete on the next engine frame
class TentacleDriver extends Component {
    constructor () { super(); this.t = 0; }
    update (dt) { this.t += dt; bone1.setRotationFromEuler(0, 0, Math.sin(this.t * 1.6) * 40); bone2.setRotationFromEuler(0, 0, Math.sin(this.t * 1.6 + 0.9) * 50); }
}
armature.addComponent(TentacleDriver);
restoreBindPose(armature, skeleton);   // back to the pose buildSkeletonTree captured
frameObject(camera, armature);
app.run(scene);                        // async render loop: frame 1 lands on a later tick

function teardown() { renderer.destroy(); mesh.destroy(); skeleton.destroy(); material.destroy(); }
</script>
```
