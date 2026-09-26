/**
 * Cocos AIR 开发手册 — Primitives（内置图元）
 * 配套文章：docs/manual/primitives.md
 *
 * 3×3 全家福：box / sphere / cylinder / cone / torus / capsule / plane / circle / quad，
 * 每个都缓慢自转（平面类带 -60° 倾角以便正面可见）。
 * 所有几何都来自 primitives.*（IGeometry 纯数据），经 utils.createMesh 变成 Mesh 资产。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    MeshRenderer,
    Material,
    Component,
    Layers,
    Vec3,
    Color,
    gfx,
    utils,
    primitives,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('primitives');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 0.9, 9.5));
cameraNode.lookAt(new Vec3(0, 0.6, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(18, 24, 34, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 光源 ----
const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 2;

// ---- 自转组件：tiltX 给平面类图元一个正面倾角 ----
class Rotator extends Component {
    tiltX = 0;
    speed = 30;
    private _angle = 0;

    constructor() {
        super();
        this.tiltX = 0;
        this.speed = 30;
        this._angle = 0;
    }
    update(dt: number): void {
        this._angle += dt * this.speed;
        this.node.setRotationFromEuler(this.tiltX, this._angle, 0);
    }
}

// ---- 3×3 图元全家福 ----
// [名字, IGeometry 工厂, 颜色, 列 x, 行 y, 倾角, 自转速度]
// 平面类不自转（转到背面会被剔除）：plane/quad 法线朝 +Y，倾角 +60° 转向相机；circle 法线本就朝 +Z，无需倾角
const shapes: [string, () => primitives.IGeometry, Color, number, number, number, number][] = [
    ['box', () => primitives.box({ width: 1, height: 1, length: 1 }), new Color(230, 120, 60, 255), -3, 2.4, 0, 30],
    [
        'sphere',
        () => primitives.sphere(0.62, { widthSegments: 32, heightSegments: 16 }),
        new Color(90, 200, 220, 255),
        0,
        2.4,
        0,
        30,
    ],
    [
        'cylinder',
        () => primitives.cylinder(0.45, 0.45, 1.3, { radialSegments: 32 }),
        new Color(140, 220, 130, 255),
        3,
        2.4,
        0,
        30,
    ],
    ['cone', () => primitives.cone(0.55, 1.3, { radialSegments: 32 }), new Color(240, 210, 90, 255), -3, 0.6, 0, 30],
    [
        'torus',
        () => primitives.torus(0.5, 0.18, { radialSegments: 32, tubularSegments: 24 }),
        new Color(220, 110, 200, 255),
        0,
        0.6,
        0,
        30,
    ],
    ['capsule', () => primitives.capsule(0.4, 0.4, 0.8), new Color(130, 150, 240, 255), 3, 0.6, 0, 30],
    ['plane', () => primitives.plane({ width: 1.5, length: 1.5 }), new Color(240, 240, 240, 255), -3, -1.2, 60, 0],
    [
        'circle',
        () => {
            // circle 两个实测坑：不带 normals（standard 光照会黑）、minPos/maxPos 写反（包围盒无效）
            const g = primitives.circle({ radius: 0.75, segments: 40 });
            const count = g.positions.length / 3;
            g.normals = new Array<number>(count * 3).fill(0);
            for (let i = 2; i < count * 3; i += 3) g.normals[i] = 1; // XY 平面圆，法线 +Z
            if (g.minPos.x > g.maxPos.x) {
                const t = g.minPos;
                g.minPos = g.maxPos;
                g.maxPos = t;
            }
            return g;
        },
        new Color(250, 150, 160, 255),
        0,
        -1.2,
        0,
        0,
    ],
    ['quad', () => primitives.quad(), new Color(160, 230, 190, 255), 3, -1.2, 60, 0],
];

for (const [name, makeGeometry, color, x, y, tiltX, speed] of shapes) {
    const node = new Node(name);
    node.layer = Layers.Enum.DEFAULT;
    node.setPosition(new Vec3(x, y, 0));
    scene.addChild(node);

    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(makeGeometry()); // IGeometry → Mesh 资产

    const material = new Material(); // 绝不改共享 builtin 材质：每个都新建实例
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('mainColor', color);
    material.setProperty('metallic', 0.0);
    material.setProperty('roughness', 0.45);
    renderer.material = material;

    // 第三个坑：pass 的 PSO 会把 primitiveMode 覆盖成 TRIANGLE_LIST，
    // circle 是 TRIANGLE_FAN，不 override 就会把扇形索引误三角化成碎条
    if (name === 'circle') {
        renderer.getMaterialInstance(0).overridePipelineStates({ primitive: gfx.PrimitiveMode.TRIANGLE_FAN });
    }

    const rotator = node.addComponent(Rotator);
    rotator.tiltX = tiltX;
    rotator.speed = speed;
}

window.__airApp = app;
app.run(scene);

// ============ 覆盖层：图元清单 ============
(document.querySelector('#info') as HTMLElement).textContent = [
    'primitives: 9 shapes (3x3)',
    'row1: box / sphere / cylinder',
    'row2: cone / torus / capsule',
    'row3: plane(+60°) / circle / quad(+60°), static',
    'helpers: translate / scale / wireframed / toWavefrontOBJ',
].join('\n');

console.log('[manual/primitives] running on cocosair');
