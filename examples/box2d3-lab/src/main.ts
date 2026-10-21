import * as air from 'cocosair';
const {
    createAirApp,
    Scene,
    Node,
    Camera,
    Canvas,
    UITransform,
    Graphics,
    Color,
    Layers,
    RigidBody2D,
    BoxCollider2D,
    CircleCollider2D,
    PolygonCollider2D,
    ERigidBody2DType,
    MouseJoint2D,
    PhysicsSystem2D,
    Vec2,
    createStepClock,
    getBox2D3Stats,
} = air;
const app = await createAirApp({
    canvas: '#GameCanvas',
    physics2D: 'box2d-v3-wasm',
    designResolution: { width: 1280, height: 720, policy: 0 },
});
const scene = new Scene('Box2D 3.2');
const canvasNode = new Node('Canvas');
canvasNode.setPosition(640, 360, 0);
canvasNode.layer = Layers.Enum.UI_2D;
canvasNode.addComponent(UITransform).setContentSize(1280, 720);
const canvas = canvasNode.addComponent(Canvas);
scene.addChild(canvasNode);
const cameraNode = new Node('Camera');
canvasNode.addChild(cameraNode);
cameraNode.setPosition(0, 0, 1000);
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.ORTHO;
camera.visibility = Layers.Enum.UI_2D;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(17, 27, 41);
camera.far = 2000;
canvas.cameraComponent = camera;
const container = new Node('Physics Objects');
container.setPosition(-640, -360, 0);
container.layer = Layers.Enum.UI_2D;
canvasNode.addChild(container);
function spawn(kind = 'box', x = 640, y = 480, type = ERigidBody2DType.Dynamic, parent = container) {
    const node = new Node(kind);
    node.layer = Layers.Enum.UI_2D;
    node.setPosition(x, y, 0);
    node.addComponent(UITransform).setContentSize(40, 40);
    const body = node.addComponent(RigidBody2D);
    body.type = type;
    body.enabledContactListener = true;
    let collider: any;
    if (kind === 'circle') {
        collider = node.addComponent(CircleCollider2D);
        collider.radius = 20;
    } else if (kind === 'polygon') {
        collider = node.addComponent(PolygonCollider2D);
        collider.points = [
            new Vec2(-22, -18),
            new Vec2(22, -18),
            new Vec2(22, 0),
            new Vec2(0, 0),
            new Vec2(0, 22),
            new Vec2(-22, 22),
        ];
    } else {
        collider = node.addComponent(BoxCollider2D);
        collider.size.set(kind === 'floor' ? 1050 : 40, kind === 'floor' ? 24 : 40);
    }
    collider.friction = 0.5;
    collider.restitution = 0.15;
    const g = node.addComponent(Graphics);
    g.fillColor =
        kind === 'floor'
            ? new Color(77, 104, 127)
            : kind === 'circle'
              ? new Color(100, 214, 190)
              : kind === 'polygon'
                ? new Color(169, 151, 240)
                : new Color(247, 195, 91);
    if (kind === 'circle') g.circle(0, 0, 20);
    else if (kind === 'polygon') {
        for (let i = 0; i < collider.points.length; i++) {
            const p = collider.points[i];
            if (i === 0) g.moveTo(p.x, p.y);
            else g.lineTo(p.x, p.y);
        }
        g.close();
    } else g.rect(-collider.size.width / 2, -collider.size.height / 2, collider.size.width, collider.size.height);
    g.fill();
    parent.addChild(node);
    return { node, body, collider };
}
function clear() {
    for (const node of [...container.children]) node.destroy();
}
function reset() {
    clear();
    spawn('floor', 640, 100, ERigidBody2DType.Static);
    for (let i = 0; i < 20; i++)
        spawn(
            i % 3 === 0 ? 'circle' : i % 3 === 1 ? 'box' : 'polygon',
            390 + (i % 5) * 90,
            200 + Math.floor(i / 5) * 100,
        );
}
reset();
const mouseNode = new Node('Drag');
canvasNode.addChild(mouseNode);
mouseNode.addComponent(RigidBody2D).type = ERigidBody2DType.Static;
const mouse = mouseNode.addComponent(MouseJoint2D);
document.getElementById('spawn')!.addEventListener('click', () => spawn('box', 450 + Math.random() * 350, 580));
document.getElementById('reset')!.addEventListener('click', reset);
app.run(scene);
const physics = PhysicsSystem2D.instance;
const clock = createStepClock();
const status = document.getElementById('status')!;
const timer = setInterval(() => {
    const s = getBox2D3Stats();
    status.textContent = s ? `${s.bodies} bodies · ${s.shapes} shapes · ${s.contacts} contacts` : '';
}, 300);
(window as any).box2d3Lab = {
    air,
    app,
    scene,
    canvasNode,
    container,
    spawn,
    clear,
    reset,
    mouse,
    physics,
    clock,
    stats: getBox2D3Stats,
    stop: () => clearInterval(timer),
};
