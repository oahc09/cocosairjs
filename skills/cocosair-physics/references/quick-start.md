Derived from the cocosair-physics skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

Environment: the HTML examples using `/build/` require the AIR development server and an existing bundle. In npm applications use the installed package name and the application's own bundler/server; resolve docs and declarations from that package. Do not copy repository URLs into a consumer app. Browser behavior is verified only for explicitly tested snippets and candidates.

# Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, DirectionalLight, Component, Color, Vec3,
         BoxCollider, RigidBody, ERigidBodyType, PhysicsSystem, geometry } from 'cocosair';

// 'builtin' is also the default when physics is omitted; write it so the choice is visible.
// For gravity, falling and stacking use { physics: 'cannon' } instead - builtin has no integrator.
const app = await createAirApp({ canvas: '#GameCanvas', physics: 'builtin' });
const scene = new Scene('physics-demo');
const camNode = new Node('Main Camera'); scene.addChild(camNode); camNode.setPosition(new Vec3(0, 4, 10));
const camera = camNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE; camera.fov = 45; camera.near = 0.1; camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(24, 30, 44, 255);
const lightNode = new Node('Main Light'); scene.addChild(lightNode); lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight).illuminance = 50000;

const ground = new Node('Ground'); scene.addChild(ground);
const groundBody = ground.addComponent(RigidBody); groundBody.type = ERigidBodyType.STATIC;
const groundCollider = ground.addComponent(BoxCollider); groundCollider.size = new Vec3(12, 0.2, 12);

const sensorNode = new Node('Sensor'); scene.addChild(sensorNode); sensorNode.setPosition(0, 1, -3);
const sensor = sensorNode.addComponent(BoxCollider); sensor.isTrigger = true;
let triggerLog = 'none';
sensor.on('onTriggerEnter', () => { triggerLog = 'enter'; });
sensor.on('onTriggerExit', () => { triggerLog = 'exit'; });

// builtin never moves a node by itself: drive the transform yourself, sync is lazy.
const crate = new Node('Crate'); scene.addChild(crate); crate.setPosition(-2, 0.8, 2);
const crateBody = crate.addComponent(RigidBody); crateBody.type = ERigidBodyType.KINEMATIC;
crate.addComponent(BoxCollider).size = new Vec3(1.5, 1.5, 1.5);

class Driver extends Component {
    constructor () { super(); this.t = 0; }
    update (dt) {
        this.t += dt;
        crate.setPosition(-2, 0.8, 2 - Math.min(this.t * 2, 6));
        if (this.t > 1 && this.t < 1 + dt) {
            const ray = new geometry.Ray(0, 0.8, 4, 0, 0, -1);   // origin + direction, not a target point
            const hit = PhysicsSystem.instance.raycastClosest(ray);   // returns boolean
            console.log('closest hit:', hit, triggerLog);   // read PhysicsSystem.instance.raycastClosestResult
        }
    }
}
crate.addComponent(Driver);
app.run(scene);   // async render loop; PhysicsSystem steps inside it

function teardown () { PhysicsSystem.instance.enabled = false; scene.destroy(); }
</script>
```
