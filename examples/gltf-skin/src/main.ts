/**
 * gltf-skin — glTF 蒙皮（skinned mesh）加载与蒙皮动画播放。
 *
 * 演示：加载 Khronos SimpleSkin（.gltf + 外部 bin，含 skins + animations），
 * instantiate 后蒙皮网格随骨骼动画变形。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    Animation,
    Layers,
    Vec3,
    Color,
    frameObject,
    GLTFLoader,
} from 'cocosair';
import type { GLTFAsset, GLTFInstance } from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('gltf-skin');

var cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.6, 5.5));
cameraNode.setRotationFromEuler(-8, 0, 0);
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

app.run(scene);

// 加载 .gltf（JSON 文本 + 外部 bin 由 baseUrl 解析）
var jsonText = await (await fetch('./assets/SimpleSkin.gltf')).text();
var asset: GLTFAsset | null = null;
var instance: GLTFInstance | null = null;

function owned(): { name: string; ref: object }[] {
    var refs: { name: string; ref: object }[] = [];
    if (asset) refs.push({ name: 'GLTFAsset(SimpleSkin)', ref: asset });
    if (instance) refs.push({ name: 'instance.root', ref: instance.root });
    return refs;
}

/** 解析 → 实例级循环 → 挂场景 → 播放蒙皮动画；首帧与 §25 合同 reacquire 共用路径。 */
async function acquire(): Promise<{ name: string; ref: object }[]> {
    asset = await new GLTFLoader().parseAsync(jsonText, './assets/');
    instance = asset.instantiate();
    // 实例级循环：不修改共享 clip 的 wrapMode
    instance.setAnimationLoop(true);
    scene.addChild(instance.root);
    frameObject(camera, instance.root);

    // 复用加载器创建的 Animation 组件播放蒙皮动画（默认 glTF 材质渲染）
    var animation =
        (instance && instance.root.getComponent(Animation)) ||
        (instance && instance.root.getComponentInChildren(Animation)) ||
        null;
    if (animation && animation.clips.length > 0) {
        var firstClip = animation.clips[0];
        if (firstClip) animation.play(firstClip.name);
        console.log(
            '[gltf-skin] playing clip:',
            firstClip ? firstClip.name : '(none)',
            '| skins:',
            asset ? asset.skeletons.length : 0,
        );
    } else {
        console.log('[gltf-skin] no animation clip; skins:', asset ? asset.skeletons.length : 0);
    }
    (window as any).__skinState = {
        skeletons: asset.skeletons.length,
        playing: !!(animation && animation.clips.length > 0),
    };
    return owned();
}

await acquire();

// §25 Lifecycle Contract：实例与资产一并释放，再整条重建，动画重新播放。
installAssetLifecycle({
    label: 'gltf-skin',
    hold: owned,
    release: () => {
        if (instance) instance.dispose();
        if (asset) asset.destroy();
        instance = null;
        asset = null;
    },
    reacquire: acquire,
});

console.log('[gltf-skin] running');
