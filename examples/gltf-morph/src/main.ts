/**
 * gltf-morph — glTF morph target（AnimatedMorphCube）加载与动画播放。
 *
 * 演示：GLTFLoader.parseAsync 加载带 morph target + 动画剪辑的 GLB，
 * instantiate 后用 Animation.play 循环播放变形动画。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    Animation,
    AnimationClip,
    Layers,
    Vec3,
    Color,
    frameObject,
    GLTFLoader,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('gltf-morph');

var cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2, 6));
cameraNode.setRotationFromEuler(-15, 0, 0);
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

// 加载 morph target 模型（Khronos AnimatedMorphCube，本地资产）
var bytes = await (await fetch('./assets/AnimatedMorphCube.glb')).arrayBuffer();
var asset: any;
var instance: any;

/** 解析 → 挂场景 → 循环播放变形动画：首帧与 §25 合同 reacquire 共用路径。 */
async function acquire(): Promise<any[]> {
    asset = await new GLTFLoader().parseAsync(bytes.slice(0), './assets/');
    instance = asset.instantiate();
    scene.addChild(instance.root);
    frameObject(camera, instance.root);

    // 循环播放第一个动画剪辑
    var animation = instance.root.getComponent(Animation);
    animation.clips.forEach(function (clip) {
        clip.wrapMode = AnimationClip.WrapMode.Loop;
    });
    animation.play(animation.clips[0].name);
    console.log(
        '[gltf-morph] clips:',
        animation.clips.map(function (c) {
            return c.name;
        }),
    );
    return [
        { name: 'GLTFAsset(AnimatedMorphCube)', ref: asset },
        { name: 'instance.root', ref: instance.root },
    ];
}

await acquire();

// §25 Lifecycle Contract：morph 资产与实例全部释放后重新解析，动画随之重新播放。
installAssetLifecycle({
    label: 'gltf-morph',
    hold: () => [
        { name: 'GLTFAsset(AnimatedMorphCube)', ref: asset },
        { name: 'instance.root', ref: instance.root },
    ],
    release: () => {
        instance.dispose();
        asset.destroy();
    },
    reacquire: acquire,
});

console.log('[gltf-morph] running');
