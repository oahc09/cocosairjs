/**
 * gltf-draco — Draco 压缩合同与缺失 Decoder 的稳定错误教学（E008 教学附加模式）。
 *
 * 本包 shipped artifacts 不含浏览器版 draco3d glue（bundle isolation 约束），
 * 因此本示例固定演示"Decoder Missing"路径：
 *   1. getExtensionSupport() 查询 KHR_draco_mesh_compression 支持状态；
 *   2. 加载 Draco 压缩模型 → 引擎返回稳定错误码 GLTF_DECODER_MISSING（非崩溃、无泄漏实例）；
 *   3. 面板展示宿主接入方式：loader.setDRACODecoder(createDracoDecoder(() => draco3d.createDecoderModule({})))。
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
    GLTFLoader,
    createDracoDecoder,
} from 'cocosair';

var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('gltf-draco');

var cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.8, 5.5));
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

var loader = new GLTFLoader();

// 1) 扩展支持状态查询
var dracoSupport = loader.getExtensionSupport().filter(function (s) {
    return /draco/i.test(s.name);
});
var lines: string[] = [];
dracoSupport.forEach(function (s) {
    lines.push(s.name + ': ' + s.status + (s.reason ? ' (' + s.reason + ')' : ''));
});
lines.push('---');

// 2) 无 decoder 加载 → 稳定错误码（教学附加模式：Decoder Missing）
var decoderState = 'pending';
try {
    var bytes = await (await fetch('./assets/draco.glb')).arrayBuffer();
    var asset = await loader.parseAsync(bytes, './assets/');
    lines.push('UNEXPECTED: loaded without decoder');
    decoderState = 'loaded';
} catch (error: any) {
    var code = error && error.code ? error.code : String(error);
    lines.push('load → stable error code: ' + code);
    lines.push('expect     : GLTF_DECODER_MISSING');
    decoderState = code === 'GLTF_DECODER_MISSING' ? 'decoder-missing-observed' : 'unexpected-' + code;
}
lines.push('---');
lines.push('host integration (browser):');
lines.push('  import draco3d browser build, then:');
lines.push('  loader.setDRACODecoder(');
lines.push('    createDracoDecoder(() => draco3d.createDecoderModule({})))');
panel.textContent = lines.join('\n');
(window as any).__decoderState = decoderState;
console.log('[gltf-draco] decoderState =', decoderState);

app.run(scene);
