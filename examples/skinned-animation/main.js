/**
 * Cocos AIR — skinned-animation
 *
 * 验证（计划书 Phase 14 / L13，最复杂场景验收）：
 *  1. Skeleton.joints + Skeleton.bindposes（Code First 构建）；
 *  2. 骨骼层级（bone0 → bone1 → bone2）重建；
 *  3. bindpose = inverse(bone 初始世界矩阵)，静止姿势正确；
 *  4. SkinnedMeshRenderer + a_joints/a_weights 蒙皮网格；
 *  5. 骨骼动画（bone 旋转）→ 网格正确变形（Skinning）。
 *
 * 顶点格式：a_position(FLOAT3) + a_normal(FLOAT3) + a_joints(RGBA32F) + a_weights(RGBA32F)。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    SkinnedMeshRenderer,
    Skeleton,
    Mesh,
    Material,
    Component,
    Layers,
    gfx,
    Vec3,
    Color,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas');

const app = await createAirApp({ canvas });

// ---------------- 1. 蒙皮网格（程序化"触手"） ----------------
const ROWS = 9;           // 顶点行数（y = row * 0.5，0..4）
const COLS = 4;           // 每行 4 个角点
const SEG_H = 0.5;
const corners = [[-0.25, -0.25], [0.25, -0.25], [0.25, 0.25], [-0.25, 0.25]];

const positions = [];
const normals = [];
const joints = [];   // 每顶点 4 个关节索引
const weights = [];  // 每顶点 4 个权重（刚性绑定）
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
    const b = (ROWS - 1) * COLS + (c + 1) % COLS;
    indices.push(topCenter, b, a);
}

// 顶点格式：a_position(FLOAT3=32?) 使用 RGB32F；a_normal RGB32F；a_joints/a_weights RGBA32F
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

const mesh = new Mesh();
mesh.reset({
    struct: {
        vertexBundles: [vertexBundle],
        primitives: [{
            primitiveMode: TRIANGLE_LIST,
            vertexBundelIndices: [0],
            indexView: { offset: vertexData.byteLength, length: indexData.byteLength, count: indices.length, stride: 2 },
        }],
        minPosition: { x: -0.25, y: 0, z: -0.25 },
        maxPosition: { x: 0.25, y: (ROWS - 1) * SEG_H, z: 0.25 },
    },
    data: new Uint8Array(joinBuffers(vertexData.buffer, indexData.buffer)),
});

function joinBuffers (a, b) {
    const out = new Uint8Array(a.byteLength + b.byteLength);
    out.set(new Uint8Array(a), 0);
    out.set(new Uint8Array(b), a.byteLength);
    return out.buffer;
}

// ---------------- 2. 骨骼层级 + Skeleton（Code First） ----------------
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
    update (dt) {
        this._t = (this._t || 0) + dt;
        bone1.setRotationFromEuler(0, 0, Math.sin(this._t * 1.6) * 40);
        bone2.setRotationFromEuler(0, 0, Math.sin(this._t * 1.6 + 0.9) * 50);
    }
}

// ---------------- 3. Skeleton 资产（joints + bindposes） ----------------
// bindpose = inverse(骨骼初始世界矩阵) → 静止姿势还原正确
// 注意：joints 是相对 skinningRoot 的路径（getChildByPath），层级骨骼必须写完整路径
const skeleton = new Skeleton();
skeleton.joints = ['bone0', 'bone0/bone1', 'bone0/bone1/bone2'];
skeleton.bindposes = [
    bone0.worldMatrix.clone().invert(),
    bone1.worldMatrix.clone().invert(),
    bone2.worldMatrix.clone().invert(),
];

// ---------------- 4. SkinnedMeshRenderer ----------------
const smr = armature.addComponent(SkinnedMeshRenderer);
smr.mesh = mesh;
smr.skeleton = skeleton;
smr.skinningRoot = armature;

const skinMaterial = new Material();
skinMaterial.initialize({ effectName: 'builtin-standard' });
skinMaterial.setProperty('mainColor', new Color(240, 160, 40, 255));
smr.material = skinMaterial;

armature.addComponent(TentacleDriver);

// ---------------- 5. 场景 ----------------
const scene = new Scene('skinned-animation');

const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.4, 6.5));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(30, 40, 60, 255);
camera.visibility = Layers.Enum.DEFAULT;

const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 8, 0));
lightNode.setRotationFromEuler(-45, -30, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 2.2;

scene.addChild(armature);

app.run(scene);

console.log('[skinned-animation] running — 3-bone skeleton + rigid skinned ribbon + bone animation');
