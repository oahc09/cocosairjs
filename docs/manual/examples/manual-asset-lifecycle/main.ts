/**
 * Cocos AIR 开发手册 — Asset Loading and Lifetime（资源加载与生命周期）
 * 配套文章：docs/manual/asset-loading-and-lifetime.md
 *
 * loadAssetAsync 三种形态 + 注册表生命周期的连续实测（异步序列，wait 分拍）：
 *  1) 成功：loadAssetAsync(url) 拉取本例 assets/air-manifest.json（deserialize 失败回退纯 JSON）；
 *  2) 注册表往返：assetManager.assets.add(path, tex) → loadAssetAsync(path, Texture2D) 命中同一实例；
 *  3) 失败·HTTP：加载不存在的 URL → fetch 404 → Promise 拒绝（消息含状态码）；
 *  4) 失败·注册表未命中：loadAssetAsync(path, type) 无此键 → 拒绝（消息含 not found）；
 *  5) 释放：texture.destroy() 后 isValid 翻假；注册表仍交出已销毁实例（必须用 isValid 自查，
 *     再 assets.remove 清键，否则缓存会把已销毁资产复用给后续加载）；
 *  6) 重载：重建纹理重注册同键 → 加载回全新实例（isValid 真、与旧实例不同），
 *     并按新 manifest 切换立方体颜色（视觉面：绿→琥珀）。
 * 立方体持续自旋兜底 frame-diff。断言经 window.__manualProbe() 读回（9 条）。
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
    utils,
    primitives,
    Texture2D,
    ImageAsset,
    assetManager,
    loadAssetAsync,
    isValid,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('asset-lifecycle');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(3.4, 2.8, 5.6));
cameraNode.lookAt(new Vec3(0, 0.6, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(18, 22, 30, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 方向光 ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-50, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 2;

// ---- 被试立方体：颜色由加载到的 manifest 驱动（绿→琥珀的视觉面） ----
const cubeNode = new Node('Cube');
cubeNode.layer = Layers.Enum.DEFAULT;
scene.addChild(cubeNode);
const cubeRenderer = cubeNode.addComponent(MeshRenderer);
cubeRenderer.mesh = utils.createMesh(primitives.box({ width: 1.4, height: 1.4, length: 1.4 }));
const cubeMaterial = new Material();
cubeMaterial.initialize({ effectName: 'builtin-standard' });
cubeMaterial.setProperty('mainColor', new Color(95, 205, 120, 255));
cubeRenderer.material = cubeMaterial;

class Spinner extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 40, 0);
    }
}
cubeNode.addComponent(Spinner);

// ---- 观测与断言 ----
type Check = { name: string; pass: boolean; detail: string };
const checks: Check[] = [];
const expect = (name: string, pass: boolean, detail: string): void => {
    checks.push({ name, pass, detail });
};

let phase = 'p1-url-load';
let done = false;
let seqError = '';

const info = document.querySelector('#info') as HTMLElement;
function showInfo(): void {
    info.textContent = [
        `asset-lifecycle: ${phase}${done ? ' (done)' : ''}`,
        `checks: ${checks.filter((c) => c.pass).length}/${checks.length} pass`,
        ...checks.map((c) => `${c.pass ? ' PASS' : ' FAIL'} ${c.name} | ${c.detail}`),
    ].join('\n');
}

const wait = (s: number): Promise<void> => new Promise((r) => setTimeout(r, s * 1000));
function makeTexture(cssColor: string): Texture2D {
    const cvs = document.createElement('canvas');
    cvs.width = 16;
    cvs.height = 16;
    const ctx = cvs.getContext('2d') as CanvasRenderingContext2D;
    ctx.fillStyle = cssColor;
    ctx.fillRect(0, 0, 16, 16);
    const tex = new Texture2D();
    tex.image = new ImageAsset(cvs);
    return tex;
}
function setCube(cssColor: string): void {
    const [r, g, b] = [
        parseInt(cssColor.slice(1, 3), 16),
        parseInt(cssColor.slice(3, 5), 16),
        parseInt(cssColor.slice(5, 7), 16),
    ];
    cubeMaterial.setProperty('mainColor', new Color(r, g, b, 255));
}

async function runSequence(): Promise<void> {
    // P1 成功：URL 拉取 + deserialize（非序列化格式回退纯 JSON）
    phase = 'p1-url-load';
    const manifest = (await loadAssetAsync('assets/air-manifest.json')) as Record<string, unknown>;
    expect(
        'p1-url-json-load',
        manifest && manifest.name === 'manual-asset-lifecycle' && manifest.items === 3,
        `name=${manifest && manifest.name} items=${manifest && manifest.items}`,
    );
    setCube(String(manifest.tone || '#5fcd78'));
    showInfo();
    await wait(0.9);

    // P2 注册表往返：add 后按 (path, type) 加载命中同一实例
    phase = 'p2-registry-roundtrip';
    const texGreen = makeTexture('#3a8f4e');
    assetManager.assets.add('gen/tex', texGreen);
    const hit = (await loadAssetAsync('gen/tex', Texture2D)) as Texture2D;
    expect(
        'p2-cache-hit-same-instance',
        hit === texGreen && isValid(hit),
        `same=${hit === texGreen} isValid=${isValid(hit)}`,
    );
    showInfo();
    await wait(0.9);

    // P3 失败·HTTP：不存在的 URL → 404 拒绝
    phase = 'p3-http-404';
    let http404 = '';
    try {
        await loadAssetAsync('assets/does-not-exist.json');
    } catch (e) {
        http404 = String((e as Error).message || e);
    }
    expect('p3-404-rejected', /404|failed/.test(http404), http404.slice(0, 90));
    showInfo();
    await wait(0.9);

    // P4 失败·注册表未命中
    phase = 'p4-registry-miss';
    let miss = '';
    try {
        await loadAssetAsync('no/such/tex', Texture2D);
    } catch (e) {
        miss = String((e as Error).message || e);
    }
    expect('p4-not-found-rejected', /not found/.test(miss), miss.slice(0, 90));
    showInfo();
    await wait(0.9);

    // P5 释放：destroy 后 isValid 翻假；注册表仍交出已销毁实例 → 必须自查 + remove 清键
    phase = 'p5-release';
    texGreen.destroy();
    await wait(0.15); // destroy() 帧末才真正销毁：等一拍再读 isValid（同帧读仍是 true）
    const stale = (await loadAssetAsync('gen/tex', Texture2D)) as Texture2D;
    expect(
        'p5-destroyed-invalid',
        isValid(texGreen) === false && texGreen.isValid === false,
        `isValid()=${isValid(texGreen)} .isValid=${texGreen.isValid}`,
    );
    expect(
        'p5-stale-cache-hazard',
        stale === texGreen && !isValid(stale),
        `registry still returned the destroyed instance: same=${stale === texGreen} valid=${isValid(stale)}`,
    );
    assetManager.assets.remove('gen/tex');
    expect(
        'p5-key-removed',
        assetManager.assets.get('gen/tex') === undefined || assetManager.assets.get('gen/tex') === null,
        `after remove: ${String(assetManager.assets.get('gen/tex'))}`,
    );
    showInfo();
    await wait(0.9);

    // P6 重载：重建纹理重注册同键 → 全新实例；manifest-alt 驱动琥珀色（视觉面）
    phase = 'p6-reload';
    const alt = (await loadAssetAsync('assets/air-manifest-alt.json')) as Record<string, unknown>;
    const texAmber = makeTexture('#c8871e');
    assetManager.assets.add('gen/tex', texAmber);
    const reloaded = (await loadAssetAsync('gen/tex', Texture2D)) as Texture2D;
    expect(
        'p6-fresh-instance',
        reloaded === texAmber && reloaded !== texGreen && isValid(reloaded) === true,
        `same-as-new=${reloaded === texAmber} differs-old=${reloaded !== texGreen} isValid=${isValid(reloaded)}`,
    );
    expect(
        'p6-alt-manifest',
        alt && alt.tone === 'amber' && alt.items === 5,
        `tone=${alt && alt.tone} items=${alt && alt.items}`,
    );
    setCube(String(alt.tone || '#c8871e'));
    done = true;
    phase = 'done';
    showInfo();
}

runSequence().catch((e) => {
    seqError = String((e as Error).message || e).slice(0, 200);
    console.error('[asset-lifecycle] sequence error', e);
    done = true;
    showInfo();
});

window.__airApp = app;
window.__manualProbe = () => ({
    ready: done,
    ok: done && !seqError && checks.length > 0 && checks.every((c) => c.pass),
    name: 'asset-lifecycle',
    phase,
    driverError: seqError,
    checks: [...checks],
});
app.run(scene);

console.log('[manual/asset-lifecycle] running on cocosair');
