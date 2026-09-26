/**
 * material-unlit — builtin-standard（受光）与 builtin-unlit（不受光）对照。
 *
 * 演示：两个相同立方体，左受平行光产生明暗，右不参与光照呈现纯平色。
 */
import {
    createAirApp,
    Scene,
    Node,
    MeshRenderer,
    Camera,
    DirectionalLight,
    Component,
    Layers,
    Vec3,
    Color,
    Material,
    builtinResMgr,
    utils,
    primitives,
} from 'cocosair';

var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('material-unlit');

var cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.6, 7.5));
cameraNode.lookAt(new Vec3(0, 0.5, 0));
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

// 左：标准材质（受光）
var lit = new Node('LitCube');
lit.layer = Layers.Enum.DEFAULT;
scene.addChild(lit);
lit.setPosition(new Vec3(-1.6, 0.5, 0));
var litRenderer = lit.addComponent(MeshRenderer);
litRenderer.mesh = utils.createMesh(primitives.box({ width: 1.4, height: 1.4, length: 1.4 }));
litRenderer.material = builtinResMgr.get('builtin-standard-material');

// 右：无光照材质（纯平色，忽略灯光）
var unlit = new Node('UnlitCube');
unlit.layer = Layers.Enum.DEFAULT;
scene.addChild(unlit);
unlit.setPosition(new Vec3(1.6, 0.5, 0));
var unlitRenderer = unlit.addComponent(MeshRenderer);
unlitRenderer.mesh = utils.createMesh(primitives.box({ width: 1.4, height: 1.4, length: 1.4 }));
unlitRenderer.material = builtinResMgr.get('builtin-unlit-material');

class Spin extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 40, 0);
    }
}
lit.addComponent(Spin);
unlit.addComponent(Spin);

app.run(scene);
console.log('[material-unlit] running');
