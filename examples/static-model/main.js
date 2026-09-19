/**
 * Cocos AIR — static-model
 *
 * 验证（V0.1 Phase 13 → V0.2 §23 → V1.1 §25）：
 *  1. Runtime Asset：程序化生成 checkerboard Texture2D；
 *  2. loadAssetAsync()：V0.2 Promise 资产 helper（assetManager 全局缓存约定），结果与 V0.1 一致；
 *  3. Material Effect：builtin-standard 材质 + albedo 纹理引用（Texture Reference）；
 *  4. MeshRenderer 静态模型渲染 + frameObject() 相机取景；
 *  5. §25 Lifecycle Contract：全部自建资源销毁 → 泄漏核对 → 整条重建。
 */

import {
    createAirApp,
    Scene,
    Node,
    MeshRenderer,
    Material,
    Texture2D,
    ImageAsset,
    Mesh,
    utils,
    primitives,
    assetManager,
    loadAssetAsync,
    frameObject,
    Vec3,
    Color,
} from 'cocosair';
import { setupCamera, setupDirectionalLight } from '../shared/scene-kit.js';
import { installAssetLifecycle } from '../shared/asset-lifecycle.js';

const app = await createAirApp({ canvas: '#GameCanvas' });
window.__airApp = app; // 开发面板/agent session 显式绑定入口（V0.5.1 T5）

const scene = new Scene('static-model');
const camera = setupCamera(scene, { position: [0, 3, 6], rotationEuler: [-20, 0, 0] });
setupDirectionalLight(scene, { position: [0, 10, 0], illuminance: 20000 });

// ---------- 1. 程序化 checkerboard 纹理（Texture Reference） ----------
const SIZE = 64;
function checkerboardPixels () {
    const pixelData = new Uint8Array(SIZE * SIZE * 4);
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const i = (SIZE * y + x) * 4;
            const check = ((x >> 3) + (y >> 3)) % 2 === 0;
            const v = check ? 230 : 40;
            pixelData[i] = v;
            pixelData[i + 1] = v;
            pixelData[i + 2] = v;
            pixelData[i + 3] = 255;
        }
    }
    return pixelData;
}

let imgAsset;
let checkerTexture;
let sourceMesh;
let material;
let boxNode;
let groundMesh;
let groundMat;
let groundNode;

/** 本示例持有的全部自建资源（Mesh 与缓存项同源，故只列一份）。 */
function owned () {
    return [
        { name: 'ImageAsset', ref: imgAsset },
        { name: 'Texture2D', ref: checkerTexture },
        { name: 'Material(albedo)', ref: material },
        { name: 'Mesh(pyramid)', ref: sourceMesh },
        { name: 'StaticBox', ref: boxNode },
        { name: 'Material(ground)', ref: groundMat },
        { name: 'Mesh(ground)', ref: groundMesh },
        { name: 'Ground', ref: groundNode },
    ];
}

/** 2) 纹理 + loadAssetAsync 往返 3) 材质 4) 场景组装：首帧与 §25 合同共用同一路径。 */
async function acquire () {
    imgAsset = new ImageAsset({
        width: SIZE,
        height: SIZE,
        _data: checkerboardPixels(),
        _compressed: false,
        format: Texture2D.PixelFormat.RGBA8888,
    });
    checkerTexture = new Texture2D();
    checkerTexture.image = imgAsset;

    const assetResp = await fetch('./assets/model.json');
    const modelAsset = await assetResp.json(); // {positions, normals, uvs, indices}
    sourceMesh = utils.createMesh({
        positions: modelAsset.positions,
        normals: modelAsset.normals,
        uvs: modelAsset.uvs,
    }, undefined, { calculateBounds: true });
    // 注册进 assetManager 全局缓存（以 path 为键），loadAssetAsync 按约定解析
    assetManager.assets.add('models/pyramid', sourceMesh);
    const restoredMesh = await loadAssetAsync('models/pyramid', Mesh);
    console.assert(restoredMesh === sourceMesh, '[static-model] loadAssetAsync round-trip OK');

    material = new Material();
    material.initialize({ effectName: 'builtin-standard', defines: { USE_ALBEDO_MAP: true } });
    material.setProperty('mainTexture', checkerTexture);

    boxNode = new Node('StaticBox');
    scene.addChild(boxNode);
    boxNode.setPosition(new Vec3(0, -0.8, 0));
    const boxRenderer = boxNode.addComponent(MeshRenderer);
    boxRenderer.mesh = restoredMesh; // 缓存往返取回的 Mesh
    boxRenderer.material = material;

    // 地面（非序列化路径的对照模型）
    groundNode = new Node('Ground');
    scene.addChild(groundNode);
    groundNode.setPosition(new Vec3(0, -2, 0));
    const groundRenderer = groundNode.addComponent(MeshRenderer);
    groundMesh = utils.createMesh(primitives.plane({ width: 10, length: 10 }));
    groundRenderer.mesh = groundMesh;
    groundMat = new Material();
    groundMat.initialize({ effectName: 'builtin-standard' });
    groundMat.setProperty('mainColor', new Color(90, 110, 90, 255));
    groundRenderer.material = groundMat;

    // V0.2 frameObject：按包围盒重新取景 StaticBox
    frameObject(camera, boxNode);
    return owned();
}

await acquire();

// §25 Lifecycle Contract：先拆承载节点，再清缓存与资源，最后整条重建（画面须恢复）。
installAssetLifecycle({
    label: 'static-model',
    hold: owned,
    release: () => {
        boxNode.destroy();
        groundNode.destroy();
        assetManager.assets.remove('models/pyramid');
        sourceMesh.destroy();
        groundMesh.destroy();
        material.destroy();
        groundMat.destroy();
        checkerTexture.destroy();
        imgAsset.destroy();
    },
    reacquire: acquire,
});

app.run(scene);

console.log('[static-model] running — loadAssetAsync round-trip mesh + checkerboard texture + frameObject');
