/**
 * gltf-meshopt — Meshopt 压缩全流程：配置解码器 → 加载 → 可见；再演示缺 decoder 的稳定错误。
 *
 * 正常模式：createMeshoptDecoder(MeshoptDecoder) → loader.setMeshoptDecoder → loadAsync
 * 教学模式：未配置 decoder 加载 → GLTF_DECODER_MISSING
 */

import {
    createAirApp,
    Scene,
    Node,
    MeshRenderer,
    Material,
    Camera,
    DirectionalLight,
    Layers,
    Vec3,
    Color,
    frameObject,
    GLTFLoader,
    createMeshoptDecoder,
    isMeshoptAvailable,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('gltf-meshopt');

var cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.8, 5));
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

var panel = document.createElement('div');
panel.style.cssText =
    'position:fixed;left:10px;top:8px;color:#9cd;font:12px monospace;white-space:pre;background:rgba(0,0,0,.45);padding:6px 8px;border-radius:4px';
document.body.appendChild(panel);

var lines: string[] = [];
function render() {
    panel.textContent = lines.join('\n');
}

// 官方 meshopt_decoder.mjs（ESM，wasm 内嵌）— 拼接 URL 避免 bundler 静态解析
var decoderUrl = '/build/gltf-decoders' + '/meshopt/meshopt_decoder.mjs';
var decoderModule = await import(/* @vite-ignore */ decoderUrl);

// 正常模式：配置解码器
var decoder = createMeshoptDecoder(decoderModule.MeshoptDecoder);
var configured = new GLTFLoader();
configured.setMeshoptDecoder(decoder);
lines.push('isMeshoptAvailable: ' + isMeshoptAvailable(decoderModule.MeshoptDecoder));

var bytes = await (await fetch('./assets/meshopt-khr.glb')).arrayBuffer();
var asset: any;
var instance: any;
var visibleMaterial: any;

function owned(): any[] {
    return [
        { name: 'GLTFAsset(meshopt-khr)', ref: asset },
        { name: 'instance.root', ref: instance.root },
        { name: 'Material', ref: visibleMaterial },
    ];
}

/** 解码器已配置 → 解析 → 挂场景 → 补标准材质使解压几何可见。 */
async function acquire(): Promise<any[]> {
    asset = await configured.parseAsync(bytes.slice(0), './assets/');
    instance = asset.instantiate();
    scene.addChild(instance.root);
    // fixture 无材质（默认渲染为黑）：挂标准材质使解压后的几何可见
    visibleMaterial = new Material();
    visibleMaterial.initialize({ effectName: 'builtin-standard' });
    visibleMaterial.setProperty('mainColor', new Color(200, 205, 215, 255));
    instance.root.walk(function (node: any) {
        var renderer = node.getComponent ? node.getComponent(MeshRenderer) : null;
        if (renderer) {
            renderer.material = visibleMaterial;
        }
    });
    // 显式相机位姿：正对压缩几何（三角形位于原点附近）
    cameraNode.setPosition(new Vec3(0.2, 0.6, 2.6));
    cameraNode.lookAt(new Vec3(0, 0.5, 0));
    lines.push('mode: decoder-configured → model visible ✓');
    render();
    return owned();
}

await acquire();
// 部署验收探针：配置了解码器的 loader 已真实完成一次 decode（wasm 内嵌形制没有独立 .wasm
// 网络请求可数，gallery 门禁以此标记为 "wasm 可用" 的机器证明）。
(window as any).__meshoptConfigured = true;

// §25 Lifecycle Contract：meshopt 解码出的资产与补挂材质全部释放后重新解码重建。
installAssetLifecycle({
    label: 'gltf-meshopt',
    hold: owned,
    release: () => {
        instance.dispose();
        visibleMaterial.destroy();
        asset.destroy();
    },
    reacquire: acquire,
});

// 教学模式：未配置解码器的 loader 加载同一模型 → 稳定错误码
var decoderState = 'loaded';
try {
    var bare = await new GLTFLoader().parseAsync(bytes.slice(0), './assets/');
    lines.push('UNEXPECTED: bare loader parsed meshopt model');
    decoderState = 'loaded-bare';
} catch (error: any) {
    var code = error && error.code ? error.code : String(error);
    lines.push('bare loader → stable error code: ' + code);
    decoderState = code === 'GLTF_DECODER_MISSING' ? 'decoder-missing-observed' : decoderState;
}
render();
(window as any).__decoderState = decoderState;
console.log('[gltf-meshopt] decoderState =', decoderState);

app.run(scene);
