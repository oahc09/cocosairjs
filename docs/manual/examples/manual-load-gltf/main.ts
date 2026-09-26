/**
 * Cocos AIR 开发手册 — Load a .GLTF file（加载 glTF 文件）
 * 配套文章：docs/manual/load-gltf.md
 *
 * 零外部资产演示 GLTFLoader 的解析管线：在页面里现造一份最小 glTF JSON
 * （24 顶点/36 索引立方体，buffer 以 data URI 内嵌），走 parseAsync → GLTFAsset
 * → instantiate(0) → 挂场景。真实资产用 loader.loadAsync(url)（见文章 §2）。
 * 覆盖层打印 parse 耗时、warnings、实例根节点结构，供探针取证。
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
    GLTFAsset,
    GLTFInstance,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('load-gltf');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(2.6, 2.4, 4.2));
cameraNode.lookAt(new Vec3(0, 0.9, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(18, 22, 30, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 一盏方向光 ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-50, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 2;

// ---- 现造最小 glTF：立方体 24 顶点 / 36 索引，buffer 内嵌 data URI ----
function buildCubeGLTFText(): string {
    const h = 0.6;
    const faces: { n: number[]; c: number[][] }[] = [
        {
            n: [0, 0, 1],
            c: [
                [-h, -h, h],
                [h, -h, h],
                [h, h, h],
                [-h, h, h],
            ],
        },
        {
            n: [0, 0, -1],
            c: [
                [h, -h, -h],
                [-h, -h, -h],
                [-h, h, -h],
                [h, h, -h],
            ],
        },
        {
            n: [1, 0, 0],
            c: [
                [h, -h, h],
                [h, -h, -h],
                [h, h, -h],
                [h, h, h],
            ],
        },
        {
            n: [-1, 0, 0],
            c: [
                [-h, -h, -h],
                [-h, -h, h],
                [-h, h, h],
                [-h, h, -h],
            ],
        },
        {
            n: [0, 1, 0],
            c: [
                [-h, h, h],
                [h, h, h],
                [h, h, -h],
                [-h, h, -h],
            ],
        },
        {
            n: [0, -1, 0],
            c: [
                [-h, -h, -h],
                [h, -h, -h],
                [h, -h, h],
                [-h, -h, h],
            ],
        },
    ];
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    faces.forEach((f, fi) => {
        f.c.forEach((p) => {
            positions.push(...p);
            normals.push(...f.n);
        });
        const b = fi * 4;
        indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    const posF = new Float32Array(positions);
    const norF = new Float32Array(normals);
    const idxU = new Uint16Array(indices);
    const buf = new Uint8Array(posF.byteLength + norF.byteLength + idxU.byteLength);
    buf.set(new Uint8Array(posF.buffer), 0);
    buf.set(new Uint8Array(norF.buffer), posF.byteLength);
    buf.set(new Uint8Array(idxU.buffer), posF.byteLength + norF.byteLength);
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) {
        bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    }
    const json = {
        asset: { version: '2.0', generator: 'manual-load-gltf in-page builder' },
        scene: 0,
        scenes: [{ name: 'ManualScene', nodes: [0] }],
        nodes: [{ name: 'InMemoryCube', mesh: 0 }],
        meshes: [
            {
                name: 'CubeMesh',
                primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }],
            },
        ],
        materials: [
            {
                name: 'CubeMat',
                pbrMetallicRoughness: {
                    baseColorFactor: [0.85, 0.45, 0.2, 1],
                    metallicFactor: 0,
                    roughnessFactor: 0.7,
                },
            },
        ],
        buffers: [{ byteLength: buf.length, uri: `data:application/octet-stream;base64,${btoa(bin)}` }],
        bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: posF.byteLength },
            { buffer: 0, byteOffset: posF.byteLength, byteLength: norF.byteLength },
            { buffer: 0, byteOffset: posF.byteLength + norF.byteLength, byteLength: idxU.byteLength },
        ],
        accessors: [
            { bufferView: 0, componentType: 5126, count: 24, type: 'VEC3', min: [-h, -h, -h], max: [h, h, h] },
            { bufferView: 1, componentType: 5126, count: 24, type: 'VEC3' },
            { bufferView: 2, componentType: 5123, count: 36, type: 'SCALAR' },
        ],
    };
    return JSON.stringify(json);
}

// ---- 解析 + 实例化 ----
const info = document.querySelector('#info') as HTMLElement;
let report = 'parsing…';
let asset: GLTFAsset | null = null;
let instance: GLTFInstance | null = null;
try {
    const t0 = performance.now();
    const loader = new GLTFLoader();
    asset = await loader.parseAsync(buildCubeGLTFText());
    const parseMs = performance.now() - t0;
    instance = asset.instantiate(0);
    instance.root.setPosition(new Vec3(0, 0.9, 0));
    scene.addChild(instance.root);
    report = [
        'gltf: in-memory minimal cube (24 verts / 36 idx, data-URI buffer)',
        `parseAsync: ${parseMs.toFixed(1)} ms → GLTFAsset (warnings: ${asset.warnings.length})`,
        `instantiate(0): root="${instance.root.name}", children=${instance.root.children.length}, animations=${instance.animations.length}`,
        'real files: loader.loadAsync(url) — see docs/manual/load-gltf.md §2',
    ].join('\n');
} catch (e) {
    report = `gltf parse failed: ${e.name}: ${e.message}`;
}
info.textContent = report;

// ---- 实例自转，便于肉眼确认加载结果在场景里 ----
class Spin extends Component {
    update(dt: number): void {
        if (instance) {
            instance.root.setRotationFromEuler(0, instance.root.eulerAngles.y + dt * 24, 0);
        }
    }
}
cameraNode.addComponent(Spin);

window.__airApp = app;
window.__inspect = {
    get asset() {
        return asset;
    },
    get instance() {
        return instance;
    },
};
app.run(scene);

console.log('[manual/load-gltf] running on cocosair');
