/**
 * rc-create-node — Runtime Control 教学：dispatch createNode / setTransform。
 *
 * 演示：通过 session.dispatch 在运行中的场景里创建节点并设置变换，
 * 随后用 inspectScene 核对节点确实出现（稳定错误码 + requestId 幂等语义）。
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
var scene = new Scene('rc-create-node');

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
    var snapshot = session.inspectScene();
    // inspectScene 从 Scene 自身开始深度优先：nodes[0] 才是根，nodes[last] 是最后访问的叶子。
    var root = snapshot.nodes[0];

    // dispatch 不抛异常：失败以 { ok:false, error:{ code } } 返回，业务字段在 result 里。
    var createRes: any = await session.dispatch({
        requestId: 'rc-create-node-1',
        action: 'createNode',
        targetId: root.id,
        params: { name: 'AgentGenerated' },
    });
    var nodeId: string = createRes.ok ? createRes.result.nodeId : '';
    var setRes: any = await session.dispatch({
        requestId: 'rc-set-transform-1',
        action: 'setTransform',
        targetId: nodeId,
        params: { space: 'local', position: [1.8, 0.6, 0], scale: [0.8, 0.8, 0.8] },
    });

    var after = session.inspectScene();
    var view = nodeId ? session.inspectNode(nodeId) : null;
    var lines = [
        'createNode → nodeId: ' + (nodeId || 'FAILED ' + createRes.error.code),
        'scene nodeCount: ' + snapshot.nodeCount + ' → ' + after.nodeCount,
        'AgentGenerated pos: ' + (view ? JSON.stringify(view.local.position) : 'NOT FOUND'),
        'setTransform → ' +
            (setRes.ok ? 'applied ' + JSON.stringify(setRes.result.applied) : 'FAILED ' + setRes.error.code),
    ];

    // 稳定错误码：重复 requestId → INVALID_ARGUMENT（幂等合同，返回而非抛出）
    var dup: any = await session.dispatch({
        requestId: 'rc-create-node-1',
        action: 'createNode',
        targetId: root.id,
        params: { name: 'Dup' },
    });
    var duplicateCode: string = dup.ok ? 'NO-ERROR' : String(dup.error.code);
    lines.push('duplicate requestId → ' + duplicateCode);
    panel.textContent = lines.join('\n');
    (window as any).__rcState = {
        created: !!view,
        nodeCount: after.nodeCount,
        duplicateCode: duplicateCode,
        dupNodeSuppressed: !after.nodes.some(function (n: any) {
            return n.name === 'Dup';
        }),
    };
})();
