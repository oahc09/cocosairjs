/**
 * Cocos AIR — skinned-animation
 *
 * 验证（V0.1 Phase 14 → V0.2 §24，最高复杂度回归）：
 *  1. buildSkeletonTree()（V0.2 正式 utils）：Skeleton.joints + bindposes（Code First）；
 *  2. restoreBindPose()（V0.2 正式 utils）：静止姿势复位；
 *  3. frameObject()（V0.2 正式 utils）：相机按包围盒取景；
 *  4. 骨骼动画（bone 旋转）→ 网格正确变形（Skinning）。
 *
 * 顶点格式：a_position(FLOAT3) + a_normal(FLOAT3) + a_joints(RGBA32F) + a_weights(RGBA32F)。
 */

import {
    createAirApp,
    Scene,
    Node,
    SkinnedMeshRenderer,
    SkeletalAnimation,
    SkinnedMeshUnit,
    Skeleton,
    Mesh,
    Material,
    Component,
    Vec2,
    gfx,
    Color,
    buildSkeletonTree,
    restoreBindPose,
    frameObject,
} from 'cocosair';
import { setupCamera, setupDirectionalLight } from '../shared/scene-kit.js';
import { installAssetLifecycle } from '../shared/asset-lifecycle.js';

const canvas = document.querySelector('#GameCanvas');

const app = await createAirApp({ canvas });
window.__airApp = app; // 开发面板/agent session 显式绑定入口（V0.5.1 T5）

// ---------------- 1. 蒙皮网格（程序化"触手"） ----------------
const ROWS = 9; // 顶点行数（y = row * 0.5，0..4）
const COLS = 4; // 每行 4 个角点
const SEG_H = 0.5;
const corners = [
    [-0.25, -0.25],
    [0.25, -0.25],
    [0.25, 0.25],
    [-0.25, 0.25],
];

const positions = [];
const normals = [];
const joints = []; // 每顶点 4 个关节索引
const weights = []; // 每顶点 4 个权重（刚性绑定）
for (let r = 0; r < ROWS; r++) {
    const y = r * SEG_H;
    for (let c = 0; c < COLS; c++) {
        positions.push(corners[c][0], y, corners[c][1]);
        normals.push(0, 0, 0); // 法线由光照演示近似，此处简化
        // 关节分配：y<1.5 → bone0；y<3 → bone1；其余 → bone2
        let joint;
        if (y < 1.5) joint = 0;
        else if (y < 3.0) joint = 1;
        else joint = 2;
        joints.push(joint, 0, 0, 0);
        weights.push(1, 0, 0, 0);
    }
}
// 侧面三角形
const indices = [];
for (let r = 0; r < ROWS - 1; r++) {
    for (let c = 0; c < COLS; c++) {
        const c2 = (c + 1) % COLS;
        const a = r * COLS + c;
        const b = r * COLS + c2;
        const d = (r + 1) * COLS + c;
        const e = (r + 1) * COLS + c2;
        indices.push(a, d, e, a, e, b);
    }
}
// 顶面封口（简单扇形）
const topCenter = positions.length / 3;
positions.push(0, (ROWS - 1) * SEG_H, 0);
normals.push(0, 1, 0);
joints.push(2, 0, 0, 0);
weights.push(1, 0, 0, 0);
for (let c = 0; c < COLS; c++) {
    const a = (ROWS - 1) * COLS + c;
    const b = (ROWS - 1) * COLS + ((c + 1) % COLS);
    indices.push(topCenter, b, a);
}

const FLOAT3 = gfx.Format.RGB32F;
const FLOAT4 = gfx.Format.RGBA32F;
const TRIANGLE_LIST = 0;
const stride = (3 + 3 + 4 + 4) * 4; // 56 bytes
const vertexData = new Float32Array((positions.length / 3) * 14);
for (let v = 0; v < positions.length / 3; v++) {
    const o = v * 14;
    vertexData[o + 0] = positions[v * 3 + 0];
    vertexData[o + 1] = positions[v * 3 + 1];
    vertexData[o + 2] = positions[v * 3 + 2];
    vertexData[o + 3] = normals[v * 3 + 0];
    vertexData[o + 4] = normals[v * 3 + 1];
    vertexData[o + 5] = normals[v * 3 + 2];
    vertexData[o + 6] = joints[v * 4 + 0];
    vertexData[o + 7] = joints[v * 4 + 1];
    vertexData[o + 8] = joints[v * 4 + 2];
    vertexData[o + 9] = joints[v * 4 + 3];
    vertexData[o + 10] = weights[v * 4 + 0];
    vertexData[o + 11] = weights[v * 4 + 1];
    vertexData[o + 12] = weights[v * 4 + 2];
    vertexData[o + 13] = weights[v * 4 + 3];
}
const indexData = new Uint16Array(indices);

const vertexBundle = {
    view: { offset: 0, length: vertexData.byteLength, count: positions.length / 3, stride },
    attributes: [
        { name: 'a_position', format: FLOAT3, isInstanced: false },
        { name: 'a_normal', format: FLOAT3, isInstanced: false },
        { name: 'a_joints', format: FLOAT4, isInstanced: false },
        { name: 'a_weights', format: FLOAT4, isInstanced: false },
    ],
};

function createMesh() {
    const value = new Mesh();
    value.reset({
        struct: {
            vertexBundles: [vertexBundle],
            primitives: [
                {
                    primitiveMode: TRIANGLE_LIST,
                    vertexBundelIndices: [0],
                    indexView: {
                        offset: vertexData.byteLength,
                        length: indexData.byteLength,
                        count: indices.length,
                        stride: 2,
                    },
                },
            ],
            minPosition: { x: -0.25, y: 0, z: -0.25 },
            maxPosition: { x: 0.25, y: (ROWS - 1) * SEG_H, z: 0.25 },
        },
        data: new Uint8Array(joinBuffers(vertexData.buffer, indexData.buffer)),
    });
    return value;
}
let mesh = createMesh();

function joinBuffers(a, b) {
    const out = new Uint8Array(a.byteLength + b.byteLength);
    out.set(new Uint8Array(a), 0);
    out.set(new Uint8Array(b), a.byteLength);
    return out.buffer;
}

// ---------------- 2. 骨骼层级（Code First） ----------------
const armature = new Node('Armature');

const bone0 = new Node('bone0');
armature.addChild(bone0);
bone0.setPosition(0, 0, 0);

const bone1 = new Node('bone1');
bone0.addChild(bone1);
bone1.setPosition(0, 1.5, 0);

const bone2 = new Node('bone2');
bone1.addChild(bone2);
bone2.setPosition(0, 1.5, 0);

// 骨骼动画驱动：bone1/bone2 绕 Z 摆动 → 网格蒙皮变形
class TentacleDriver extends Component {
    _t = 0;
    update(dt) {
        this._t = (this._t || 0) + dt;
        bone1.setRotationFromEuler(0, 0, Math.sin(this._t * 1.6) * 40);
        bone2.setRotationFromEuler(0, 0, Math.sin(this._t * 1.6 + 0.9) * 50);
    }
}

class SkinnedRendererLifecycleProbe extends SkinnedMeshRenderer {
    onLoad() {
        super.onLoad();
    }
    onDestroy() {
        super.onDestroy();
    }
}

// ---------------- 3. Skeleton 资产（V0.2 buildSkeletonTree 正式 utils） ----------------
// joints 是相对 skinningRoot 的路径；bindpose = inverse(骨骼当前世界矩阵)
let skeleton = buildSkeletonTree(armature, ['bone0', 'bone0/bone1', 'bone0/bone1/bone2']);
const skeletonProbe = new Skeleton('ImportantSkeletonProbe');
skeletonProbe.joints = skeleton.joints.slice();
skeletonProbe.bindposes = skeleton.bindposes.slice();
const skeletonProbeState = {
    constructorName: skeletonProbe.constructor.name,
    joints: skeleton.joints.length,
    bindposes: skeleton.bindposes.length,
    inverseBindposes: skeletonProbe.inverseBindposes.length,
    hash: skeletonProbe.hash,
    valid: skeletonProbe.validate(),
};
skeletonProbe.destroy();

// ---------------- 4. SkinnedMeshRenderer ----------------
let smr = armature.addComponent(SkinnedMeshRenderer);
smr.mesh = mesh;
smr.skeleton = skeleton;
smr.skinningRoot = armature;
const skinnedModel = smr.model;

let skinMaterial = new Material();
skinMaterial.initialize({ effectName: 'builtin-standard' });
skinMaterial.setProperty('mainColor', new Color(240, 160, 40, 255));
smr.material = skinMaterial;
smr.uploadAnimation(null);
const skinUnit = new SkinnedMeshUnit();
skinUnit.offset = new Vec2(0.1, 0.2);
skinUnit.size = new Vec2(0.8, 0.9);
skinUnit.copyFrom = smr;
const skinUnitState = {
    constructorName: skinUnit.constructor.name,
    mesh: skinUnit.mesh === mesh,
    skeleton: skinUnit.skeleton === skeleton,
    material: skinUnit.material === skinMaterial,
    offset: `${skinUnit.offset.x},${skinUnit.offset.y}`,
    size: `${skinUnit.size.x},${skinUnit.size.y}`,
};

const scene = new Scene('skinned-animation');
class SkeletalLifecycleProbe extends SkeletalAnimation {
    onLoad() {
        super.onLoad();
    }
    start() {
        super.start();
    }
    onEnable() {
        super.onEnable();
    }
    onDisable() {
        super.onDisable();
    }
    onDestroy() {
        super.onDestroy();
    }
}
const skeletalProbeRoot = new Node('SkeletalAnimationProbe');
const probeBone0 = new Node('bone0');
const probeBone1 = new Node('bone1');
skeletalProbeRoot.addChild(probeBone0);
probeBone0.addChild(probeBone1);
scene.addChild(skeletalProbeRoot);
const skeletalProbe = skeletalProbeRoot.addComponent(SkeletalLifecycleProbe);
const rendererProbeNode = new Node('SkinnedRendererLifecycleProbe');
scene.addChild(rendererProbeNode);
const rendererProbe = rendererProbeNode.addComponent(SkinnedRendererLifecycleProbe);
rendererProbe.setSharedMaterial(skinMaterial, 0);

armature.addComponent(TentacleDriver);

// ---------------- 5. 场景 ----------------
const camera = setupCamera(scene, { position: [0, 2.4, 6.5] });
setupDirectionalLight(scene, { position: [0, 8, 0], illuminance: 55000 });

scene.addChild(armature);

// V0.2 restoreBindPose：把骨骼复位到静止姿势（再交给动画驱动接管）
restoreBindPose(armature, skeleton);
// V0.2 frameObject：按包围盒取景触手
frameObject(camera, armature);

function heldResources() {
    return [
        { name: 'SkinnedMesh', ref: mesh },
        { name: 'Skeleton', ref: skeleton },
        { name: 'SkinnedMaterial', ref: skinMaterial },
        { name: 'SkinnedMeshRenderer', ref: smr },
    ];
}

async function releaseResources() {
    smr.destroy();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    skinUnit.mesh = null;
    skinUnit.skeleton = null;
    skinUnit.material = null;
    mesh.destroy();
    skeleton.destroy();
    skinMaterial.destroy();
}

async function reacquireResources() {
    let step = 'mesh';
    try {
        mesh = createMesh();
        step = 'skeleton';
        skeleton = buildSkeletonTree(armature, ['bone0', 'bone0/bone1', 'bone0/bone1/bone2']);
        step = 'material';
        skinMaterial = new Material();
        skinMaterial.initialize({ effectName: 'builtin-standard' });
        skinMaterial.setProperty('mainColor', new Color(240, 160, 40, 255));
        smr = armature.addComponent(SkinnedMeshRenderer);
        step = 'renderer mesh';
        smr.mesh = mesh;
        step = 'renderer skeleton';
        smr.skeleton = skeleton;
        step = 'renderer root';
        smr.skinningRoot = armature;
        step = 'renderer material';
        smr.material = skinMaterial;
        step = 'renderer animation';
        smr.uploadAnimation(null);
        step = 'skinned unit';
        skinUnit.copyFrom = smr;
        step = 'restore bind pose';
        restoreBindPose(armature, skeleton);
        return heldResources();
    } catch (error) {
        throw new Error(`reacquire step ${step}: ${String((error && error.message) || error)}`);
    }
}

installAssetLifecycle({
    label: 'skinned-animation',
    hold: heldResources,
    release: releaseResources,
    reacquire: reacquireResources,
});

app.run(scene);
// Invoke the public start hook once explicitly as the skeletal socket manager is initialized.
skeletalProbe.start();
skeletalProbe.useBakedAnimation = false;
const socketTarget = new Node('SocketTarget');
skeletalProbe.sockets = [new SkeletalAnimation.Socket('bone0/bone1', socketTarget)];
const socketPaths = skeletalProbe.querySockets();
const createdSocket = skeletalProbe.createSocket('bone0/bone1');
skeletalProbe.rebuildSocketAnimations();
skeletalProbe.pause();
skeletalProbe.resume();
skeletalProbe.stop();
skeletalProbe.enabled = false;
skeletalProbe.enabled = true;
const skeletalProbeState = {
    useBakedAnimation: skeletalProbe.useBakedAnimation,
    sockets: skeletalProbe.sockets.length,
    querySockets: socketPaths.length > 0,
    createSocket: createdSocket === socketTarget,
    rendererModel: !!skinnedModel,
};
const skinnedRendererState = {
    constructorName: smr.constructor.name,
    skeleton: smr.skeleton === skeleton,
    skinningRoot: smr.skinningRoot === armature,
    model: !!smr.model,
};
requestAnimationFrame(() =>
    requestAnimationFrame(() => {
        skeletalProbeRoot.destroy();
        rendererProbeNode.destroy();
    }),
);

window.__probe = () => ({ skeletonProbeState, skinUnitState, skeletalProbeState, skinnedRendererState });

console.log('[skinned-animation] running — buildSkeletonTree/restoreBindPose/frameObject + 3-bone skinned ribbon');
