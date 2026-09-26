/**
 * Cocos AIR 开发手册 — Freeing Resources（释放资源）
 * 配套文章：docs/manual/cleanup.md
 *
 * JS 的 GC 收不走 GPU 内存，texture/geometry/material 三类资源必须手动释放。
 * AIR 的对应关系（源码取证）：
 *   - node.destroy() 级联销毁子节点+组件（node.ts _onPreDestroyBase），本帧渲染前生效；
 *   - 但资源（Asset 派生：Mesh/Material/Texture2D）不会随节点/场景释放——
 *     Scene.destroy 注释原文 "this action won't destroy related assets"（d.ts 19420）；
 *   - 释放清单三件套：mesh.destroy()（释放 renderingSubMeshes 的 GPU 缓冲，d.ts 185）、
 *     material.destroy()（销毁全部 pass 且不可复活，d.ts 23871）、
 *     texture.destroy()（清空 mipmaps，getGFXTexture 变 null，d.ts 23371）。
 * 本例：A（贴"脸"立方体）与 B（贴"脸"球体）两套私有材质/纹理/网格每 3.5s 互换一次，
 * 换场时对旧套执行"节点+三件套"完整释放，并在 +2 帧后回读失效证据（isValid/GPU 句柄）
 * 打到覆盖层——释放是否真的落锤，看数不看感觉。
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
    Texture2D,
    Mesh,
    utils,
    primitives,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('cleanup');

// ---- 方向光 + 相机 ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-20, 10, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 12;

const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.0, 8.2));
cameraNode.lookAt(new Vec3(0, 1.2, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(16, 20, 28, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 一套 = 一个节点树 + 三个独占 GPU 资源（材质/纹理/网格） ----
const TEX_SIZE = 64;

function makeFaceTexture(letter: string, bg: string, ink: string): Texture2D {
    const paint = document.createElement('canvas');
    paint.width = paint.height = TEX_SIZE;
    const g2d = paint.getContext('2d') as CanvasRenderingContext2D;
    // 实测：box 正面 UV 的 v 方向与 plane 相反——动态纹理/公告板篇的"预翻转"路线
    // 用在这里会让立方体正面的文字倒立，所以这里刻意"不预翻转"
    g2d.fillStyle = bg;
    g2d.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    g2d.fillStyle = ink;
    g2d.font = 'bold 44px sans-serif';
    g2d.fillText(letter, 14, 48);
    const tex = new Texture2D();
    tex.reset({ width: TEX_SIZE, height: TEX_SIZE, format: Texture2D.PixelFormat.RGBA8888 });
    tex.uploadData(paint); // 都在 run 之后的 update 里构建，一次性上传即采样生效（公告板篇实测）
    return tex;
}

let uid = 0;

type AssetSet = {
    name: string;
    id: number;
    swaps: number;
    root: Node;
    trim: Node;
    effect: string;
    mesh: Mesh & { _renderingSubMeshes?: unknown[] };
    tex: Texture2D;
    mat: Material;
};

// 存活探针读回的字段（try 分支可能只填一部分）
type SetProbe = {
    nodeValid?: boolean;
    trimValid?: boolean;
    meshValid?: boolean;
    subs?: number;
    matValid?: boolean;
    passes?: number;
    texValid?: boolean;
    gfx?: number;
    refCount?: number;
    error?: string;
};

type DisposeReturns = { node: boolean; mesh: boolean; mat: boolean; tex: boolean };

function buildSet(name: string): AssetSet {
    const set = { name, id: ++uid, swaps: 0 } as AssetSet;
    set.root = new Node(`Set${name}`);
    set.root.layer = Layers.Enum.DEFAULT;
    set.root.setPosition(new Vec3(0, 1.3, 0));
    scene.addChild(set.root);
    if (name === 'A') {
        set.mesh = utils.createMesh(primitives.box({ width: 1.9, height: 1.9, length: 1.9 }));
        set.tex = makeFaceTexture('A', '#3b82f6', '#ffe08a');
        set.effect = 'builtin-standard';
    } else {
        set.mesh = utils.createMesh(primitives.sphere(1.15, 20, 14));
        set.tex = makeFaceTexture('B', '#14b8a6', '#ffd75e');
        set.effect = 'builtin-standard';
    }
    set.mat = new Material();
    set.mat.initialize({ effectName: set.effect, defines: { USE_ALBEDO_MAP: true } });
    set.mat.setProperty('mainTexture', set.tex);
    const body = new Node('Body');
    body.layer = Layers.Enum.DEFAULT;
    set.root.addChild(body);
    const r = body.addComponent(MeshRenderer);
    r.mesh = set.mesh;
    r.material = set.mat;
    // 小装饰子节点：与 Body 共用同一套 mesh/material，演示"共享资产只能整体释放一次"
    const trim = new Node('Trim');
    trim.layer = Layers.Enum.DEFAULT;
    trim.setPosition(new Vec3(0, -1.25, 0));
    trim.setScale(new Vec3(0.45, 0.2, 0.45));
    set.root.addChild(trim);
    set.trim = trim;
    const tr = trim.addComponent(MeshRenderer);
    tr.mesh = set.mesh;
    tr.material = set.mat;
    return set;
}

// 读一组"存活探针"：节点/资源各自 isValid + 底层 GPU 句柄状态
function probeSet(set: AssetSet): SetProbe {
    const out: SetProbe = {};
    try {
        out.nodeValid = set.root.isValid;
        out.trimValid = set.trim.isValid;
        out.meshValid = set.mesh.isValid;
        // 读私有 _renderingSubMeshes：公开 getter 会对已销毁网格重跑 initialize() 并抛错（实测），
        // 私有字段读法专用于取证销毁效果（destroyRenderingMesh 置 null）
        out.subs = set.mesh._renderingSubMeshes ? set.mesh._renderingSubMeshes.length : 0;
        out.matValid = set.mat.isValid;
        out.passes = set.mat.passes ? set.mat.passes.length : 0; // destroy 后 _passes 置空（material.ts _doDestroy）
        out.texValid = set.tex.isValid;
        out.gfx = set.tex.getGFXTexture() ? 1 : 0; // _mipmaps 清空后为 0
        out.refCount = set.mat.refCount; // 代码 new 出来的资产恒 0：渲染器不会替资源 addRef
    } catch (e) {
        out.error = String(e && e.message);
    }
    return out;
}

// 递归"移除+释放"模板的 AIR 落地：先节点后资源，destroy() 返回值 = 是否首次销毁
function disposeSet(set: AssetSet): DisposeReturns {
    const returns = {
        node: set.root.destroy(),
        mesh: set.mesh.destroy(),
        mat: set.mat.destroy(),
        tex: set.tex.destroy(),
    };
    return returns;
}

const info = document.querySelector('#info') as HTMLElement;
const HALF = 3.5; // 每套展示 3.5s 后换场

class CleanupRig extends Component {
    private _t = 0;
    private _frameCount = 0;
    live: AssetSet | null = null;
    oldProbe: AssetSet | null = null;
    report: SetProbe | null = null;
    returns: DisposeReturns | null = null;
    swaps = 0;

    update(dt: number): void {
        this._t = (this._t || 0) + dt;
        const phase = this._t % (HALF * 2);
        const want = phase < HALF ? 'A' : 'B';
        if (!this.live || this.live.name !== want) {
            const old = this.live;
            if (old) {
                // 释放清单：节点树 + 三件套（材质/纹理/网格），顺序=先离场景再拆资产
                this.returns = disposeSet(old);
                this.oldProbe = old; // 暂存引用，+2 帧后回读失效证据
                this.swaps = (this.swaps || 0) + 1;
            }
            this.live = buildSet(want);
            this._frameCount = 0;
        }
        this._frameCount++;
        if (this.oldProbe && this._frameCount >= 2) {
            this.report = probeSet(this.oldProbe); // 预期：全 false / subs=0 / passes=0 / gfx=0
            this.oldProbe = null;
        }
        const now = probeSet(this.live);
        const rep = this.report;
        const ret = this.returns;
        info.textContent = [
            'cleanup: node.destroy() cascades nodes+components; assets need explicit destroy()',
            `live set=${this.live.name} (swap at t=${HALF}s)  swaps=${this.swaps || 0}  scene children=${scene.children.length}`,
            `live: node=${now.nodeValid} subs=${now.subs} passes=${now.passes} texGfx=${now.gfx} mat.refCount=${now.refCount}`,
            ret
                ? `dispose returns(first-call): node=${ret.node} mesh=${ret.mesh} mat=${ret.mat} tex=${ret.tex}`
                : 'dispose returns: (first swap pending)',
            rep
                ? `old set +2 frames: node=${rep.nodeValid} trim=${rep.trimValid} mesh=${rep.meshValid} subs=${rep.subs} passes=${rep.passes} gfx=${rep.gfx}`
                : 'old set: (no dispose yet)',
        ].join('\n');
    }
}
const rig = cameraNode.addComponent(CleanupRig);

window.__airApp = app;
window.__inspect = {
    scene,
    rig,
    probeLive: () => (rig.live ? probeSet(rig.live) : null),
    getReport: () => rig.report || null,
    getReturns: () => rig.returns || null,
    buildSet,
    disposeSet,
    probeSet,
};
app.run(scene);

console.log('[manual/cleanup] running on cocosair');
