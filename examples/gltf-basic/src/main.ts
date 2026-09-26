/**
 * gltf-basic — 最简 glTF/GLB 正向加载（E007 gltf-basic）。
 *
 * 演示：GLTFLoader.loadAsync 从 URL 加载本地 GLB → instantiate → 挂场景 → 取景渲染。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    Layers,
    Vec3,
    Color,
    frameObject,
    GLTFLoader,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('gltf-basic');

var cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.6, 5));
cameraNode.setRotationFromEuler(-12, 0, 0);
var camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(30, 40, 60, 255);
camera.visibility = Layers.Enum.DEFAULT;
camera.priority = 0;
var lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 8, 0));
lightNode.setRotationFromEuler(-45, -30, 0);
var light = lightNode.addComponent(DirectionalLight);
light.illuminance = 50000;

// 正向加载：GLTFLoader.loadAsync(url) → GLTFAsset → instantiate → 挂场景
var loader = new GLTFLoader();
var asset: any;
var instance: any;

/** 获取资源并挂回场景：首帧与 §25 生命周期合同的 reacquire 共用同一路径。 */
async function acquire(): Promise<any[]> {
    asset = await loader.loadAsync('./assets/BoxTextured.glb');
    instance = asset.instantiate();
    scene.addChild(instance.root);
    frameObject(camera, instance.root);
    return [
        { name: 'GLTFAsset(BoxTextured.glb)', ref: asset },
        { name: 'instance.root', ref: instance.root },
    ];
}

await acquire();
console.log('[gltf-basic] loaded, warnings:', asset.warnings.length);

// §25 Lifecycle Contract：验证器调用 window.__lifecycle() 时真实 dispose/destroy 后重新加载，
// 泄漏数、重载有效性与重载后画面由 v11-examples-verify 的 resource-released 判定。
installAssetLifecycle({
    label: 'gltf-basic',
    hold: () => [
        { name: 'GLTFAsset(BoxTextured.glb)', ref: asset },
        { name: 'instance.root', ref: instance.root },
    ],
    release: () => {
        instance.dispose();
        asset.destroy();
    },
    reacquire: acquire,
});

app.run(scene);
