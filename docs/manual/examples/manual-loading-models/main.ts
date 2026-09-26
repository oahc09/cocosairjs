/**
 * Cocos AIR 开发手册 — Loading 3D Models（加载 3D 模型）
 * 配套文章：docs/manual/loading-3d-models.md
 *
 * 零外部资产：在运行时把一个立方体的顶点/法线/索引打包成 glTF 二进制缓冲，
 * 用 base64 data URI 内联进 glTF JSON，再交给 GLTFLoader.parseAsync 解析、
 * instantiate 挂到场景、自转展示。完整走一遍"模型从字节到节点"的链路。
 *
 * 关键 API：
 *   new GLTFLoader().parseAsync(jsonString)  → GLTFAsset（共享原生资产）
 *   asset.instantiate()                      → { root, animations, dispose }
 *   asset.meshes / materials / skeletons / warnings（解析结果自检）
 *
 * decoder 注入边界：本页的 glTF 未压缩、无外部依赖，所以不需要 DRACO / meshopt /
 * KTX2。若模型用了 KHR_draco_mesh_compression / EXT_meshopt_compression / KTX2 纹理，
 * 必须先 loader.setDRACODecoder(...) / setMeshoptDecoder(...) / setKTX2Transcoder(...)
 * 注入解码器，否则解析会如实报"decoder required"。详见文章 §5。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    Component,
    Layers,
    Vec3,
    Color,
    GLTFLoader,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('loading-models');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(2.6, 2.0, 3.4));
cameraNode.lookAt(new Vec3(0, 0, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(20, 26, 38, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 光源 ----
const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-40, -30, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 2;

// ============ 1. 在运行时拼一个 glTF 文档 ============

/**
 * 生成一个轴对齐立方体的网格数据（6 面 × 4 顶点 + 2 三角形）。
 * 每面顶点按"从外侧看的逆时针"排列，符合 glTF 的正面绕序约定。
 * @returns {{ positions: number[], normals: number[], indices: number[] }}
 */
function buildBox(w: number, h: number, d: number): { positions: number[]; normals: number[]; indices: number[] } {
    const x = w / 2;
    const y = h / 2;
    const z = d / 2;
    const faces: { n: number[]; v: number[][] }[] = [
        {
            n: [0, 0, 1],
            v: [
                [-x, -y, z],
                [x, -y, z],
                [x, y, z],
                [-x, y, z],
            ],
        }, // +Z
        {
            n: [0, 0, -1],
            v: [
                [x, -y, -z],
                [-x, -y, -z],
                [-x, y, -z],
                [x, y, -z],
            ],
        }, // -Z
        {
            n: [1, 0, 0],
            v: [
                [x, -y, z],
                [x, -y, -z],
                [x, y, -z],
                [x, y, z],
            ],
        }, // +X
        {
            n: [-1, 0, 0],
            v: [
                [-x, -y, -z],
                [-x, -y, z],
                [-x, y, z],
                [-x, y, -z],
            ],
        }, // -X
        {
            n: [0, 1, 0],
            v: [
                [-x, y, z],
                [x, y, z],
                [x, y, -z],
                [-x, y, -z],
            ],
        }, // +Y
        {
            n: [0, -1, 0],
            v: [
                [-x, -y, -z],
                [x, -y, -z],
                [x, -y, z],
                [-x, -y, z],
            ],
        }, // -Y
    ];
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    faces.forEach((face, i) => {
        const base = i * 4;
        for (const p of face.v) {
            positions.push(p[0], p[1], p[2]);
            normals.push(face.n[0], face.n[1], face.n[2]);
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
    return { positions, normals, indices };
}

/**
 * 把 positions(Float32) / normals(Float32) / indices(Uint16) 顺序打包进一个 ArrayBuffer。
 * glTF 要求每个 bufferView 的 byteOffset 按其 componentType 对齐：
 * Float32 需 4 字节对齐、Uint16 需 2 字节对齐 —— 这里 288 / 288 / 576 全部满足。
 * @returns {ArrayBuffer}
 */
function packBoxBuffer(box: { positions: number[]; normals: number[]; indices: number[] }): ArrayBuffer {
    const positions = new Float32Array(box.positions);
    const normals = new Float32Array(box.normals);
    const indices = new Uint16Array(box.indices);
    const buffer = new ArrayBuffer(positions.byteLength + normals.byteLength + indices.byteLength);
    const bytes = new Uint8Array(buffer);
    bytes.set(new Uint8Array(positions.buffer), 0);
    bytes.set(new Uint8Array(normals.buffer), positions.byteLength);
    bytes.set(new Uint8Array(indices.buffer), positions.byteLength + normals.byteLength);
    return buffer;
}

/** ArrayBuffer → base64（浏览器内联 data URI 用）。 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

const box = buildBox(1, 1, 1);
const buffer = packBoxBuffer(box);
const base64 = arrayBufferToBase64(buffer);
const POS_BYTES = (box.positions.length / 3) * 4 * 3; // 24 顶点 × vec3 × 4 字节 = 288
const NRM_BYTES = POS_BYTES;
const IDX_BYTES = box.indices.length * 2; // 36 索引 × 2 字节 = 72

// 一个最小但合法的 glTF 2.0 文档：单 mesh、单 PBR 材质、缓冲以 base64 data URI 内联。
const gltfDocument = {
    asset: { version: '2.0', generator: 'cocosair manual / loading-3d-models' },
    scene: 0,
    scenes: [{ name: 'inline-scene', nodes: [0] }],
    nodes: [{ name: 'InlineBox', mesh: 0 }],
    meshes: [
        {
            name: 'box',
            primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }],
        },
    ],
    materials: [
        {
            name: 'teal-pbr',
            pbrMetallicRoughness: {
                baseColorFactor: [0.18, 0.7, 0.64, 1.0],
                metallicFactor: 0.1,
                roughnessFactor: 0.55,
            },
        },
    ],
    accessors: [
        { bufferView: 0, componentType: 5126, count: 24, type: 'VEC3', min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
        { bufferView: 1, componentType: 5126, count: 24, type: 'VEC3' },
        { bufferView: 2, componentType: 5123, count: 36, type: 'SCALAR' },
    ],
    bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: POS_BYTES, target: 34962 },
        { buffer: 0, byteOffset: POS_BYTES, byteLength: NRM_BYTES, target: 34962 },
        { buffer: 0, byteOffset: POS_BYTES + NRM_BYTES, byteLength: IDX_BYTES, target: 34963 },
    ],
    buffers: [
        {
            byteLength: buffer.byteLength,
            uri: `data:application/octet-stream;base64,${base64}`,
        },
    ],
};

// ============ 2. 解析 → 实例化 → 挂场景 ============

const loader = new GLTFLoader();
const asset = await loader.parseAsync(JSON.stringify(gltfDocument));
const instance = asset.instantiate();

// 用一个 pivot 节点承载模型，自转挂在 pivot 上，便于以后整体移动/缩放模型
const pivot = new Node('model-pivot');
pivot.layer = Layers.Enum.DEFAULT;
scene.addChild(pivot);
pivot.addChild(instance.root);

class Rotator extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 40, 0);
    }
}
pivot.addComponent(Rotator);

window.__airApp = app;
app.run(scene);

// ============ 3. 解析结果自检（覆盖层） ============

(document.querySelector('#info') as HTMLElement).textContent = [
    'GLTFLoader.parseAsync(inline glTF JSON)',
    `meshes: ${asset.meshes.length}  materials: ${asset.materials.length}`,
    `skeletons: ${asset.skeletons.length}  animations: ${instance.animations.length}`,
    asset.warnings.length ? `warnings: ${asset.warnings.join(' | ')}` : 'warnings: none (parsed clean)',
].join('\n');

console.log('[manual/loading-models] running on cocosair');
