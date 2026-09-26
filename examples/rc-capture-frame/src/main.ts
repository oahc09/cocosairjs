/**
 * rc-capture-frame — Runtime Control 教学：captureFrame 受控帧捕获。
 *
 * 演示：session 捕获 AFTER_DRAW 时机的一帧并显示为页面内缩略图；
 * bench 宿主走 __benchSession.capture，devtools 宿主走 session.captureFrame。
 */
import {
    createAirApp,
    Scene,
    Node,
    MeshRenderer,
    Camera,
    DirectionalLight,
    Layers,
    Vec3,
    Color,
    Material,
    utils,
    primitives,
} from 'cocosair';

var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('rc-capture-frame');

function materialWith(color: Color): Material {
    var material = new Material();
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('mainColor', color);
    return material;
}

var cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.2, 6.5));
cameraNode.lookAt(new Vec3(0, 0.6, 0));
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

var demoCube = new Node('DemoCube');
demoCube.layer = Layers.Enum.DEFAULT;
scene.addChild(demoCube);
demoCube.setPosition(new Vec3(0, 0.6, 0));
var demoRenderer = demoCube.addComponent(MeshRenderer);
demoRenderer.mesh = utils.createMesh(primitives.box({ width: 1.4, height: 1.4, length: 1.4 }));
demoRenderer.material = materialWith(new Color(95, 205, 120, 255));

app.run(scene);

// Agent Session 绑定入口：bench/devtools 宿主注入 __benchSession；
// 直开页面时退化为动态加载 debug 工件自建 session（V0.5.1 会话合同）。
async function getSession(): Promise<any> {
    for (var i = 0; i < 100; i++) {
        if ((window as any).__benchSession) {
            return (window as any).__benchSession;
        }
        await new Promise(function (r) {
            setTimeout(r, 100);
        });
    }
    var debugBase: string = (window as any).__debugBase || '/__debug';
    var mod = await import(/* bundle-ignore */ String(debugBase + '/agent-session.js'));
    return mod.createAgentSession({ app: app, writableScenes: [app.getScene()] });
}

var panel = document.createElement('div');
panel.style.cssText =
    'position:fixed;left:10px;top:8px;right:10px;color:#9cd;font:11px monospace;white-space:pre;background:rgba(0,0,0,.5);padding:6px 8px;border-radius:4px;max-height:45%;overflow:auto';
document.body.appendChild(panel);

(async function demo() {
    var session = await getSession();
    var canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
    var png: string;
    if (typeof session.capture === 'function') {
        var cap = await session.capture();
        png = cap.png || cap;
    } else if (typeof session.captureFrame === 'function') {
        var frame = await session.captureFrame({});
        png = frame.png || frame;
    } else {
        png = canvas.toDataURL('image/png');
    }

    var img = document.createElement('img');
    img.src = png;
    img.style.cssText = 'position:fixed;right:12px;bottom:12px;width:180px;border:1px solid #456;border-radius:4px';
    document.body.appendChild(img);
    panel.textContent = 'captured frame: ' + png.length + ' bytes(dataURL)\nthumbnail → right-bottom';

    // 数据 URL 换一次宿主动作后再捕获，验证可重复
    demoCube.setRotationFromEuler(0, 45, 0);
    await new Promise(function (r) {
        setTimeout(r, 300);
    });
    var second = typeof session.capture === 'function' ? await session.capture() : null;
    (window as any).__rcState = {
        captured: png.length > 512,
        repeatable: !second || String(second.png || second).length > 512,
    };
})();
