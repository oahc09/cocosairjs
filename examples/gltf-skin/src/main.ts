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
    AnimationClip,
    SkinnedMeshRenderer,
    Material,
    Layers,
    Vec3,
    Color,
    frameObject,
    GLTFLoader,
} from 'cocosair';
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
var asset: any;
var instance: any;
var skinMaterial: any;

function owned(): any[] {
    return [
        { name: 'GLTFAsset(SimpleSkin)', ref: asset },
        { name: 'instance.root', ref: instance.root },
        { name: 'Material', ref: skinMaterial },
    ];
}

/** 解析 → 挂场景 → 补标准材质 → 播放蒙皮动画；首帧与 §25 合同 reacquire 共用路径。 */
async function acquire(): Promise<any[]> {
    asset = await new GLTFLoader().parseAsync(jsonText, './assets/');
    instance = asset.instantiate();
    scene.addChild(instance.root);
    frameObject(camera, instance.root);

    // SimpleSkin 不含材质（默认渲染为黑）：为蒙皮渲染器挂标准材质使蒙皮可见
    skinMaterial = new Material();
    skinMaterial.initialize({ effectName: 'builtin-standard' });
    skinMaterial.setProperty('mainColor', new Color(220, 220, 228, 255));
    instance.root.walk(function (node: any) {
        var skin = node.getComponent ? node.getComponent(SkinnedMeshRenderer) : null;
        if (skin) {
            skin.material = skinMaterial;
        }
    });

    // 播放蒙皮动画
    var animation = instance.root.getComponent(Animation) || instance.root.getComponentInChildren(Animation);
    if (animation && animation.clips.length > 0) {
        animation.clips.forEach(function (clip) {
            clip.wrapMode = AnimationClip.WrapMode.Loop;
        });
        animation.play(animation.clips[0].name);
        console.log('[gltf-skin] playing clip:', animation.clips[0].name, '| skins:', asset.skeletons.length);
    } else {
        console.log('[gltf-skin] no animation clip; skins:', asset.skeletons.length);
    }
    (window as any).__skinState = {
        skeletons: asset.skeletons.length,
        playing: !!(animation && animation.clips.length > 0),
    };
    return owned();
}

await acquire();

// §25 Lifecycle Contract：骨架/蒙皮材质随实例一并释放，再整条重建，动画重新播放。
installAssetLifecycle({
    label: 'gltf-skin',
    hold: owned,
    release: () => {
        instance.dispose();
        skinMaterial.destroy();
        asset.destroy();
    },
    reacquire: acquire,
});

console.log('[gltf-skin] running');
