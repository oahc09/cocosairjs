import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    MeshRenderer,
    Material,
    Color,
    Component,
    Layers,
    Vec2,
    Vec3,
    Vec4,
    Input,
    input,
    EventTouch,
    EventMouse,
    view,
    utils,
    primitives,
} from 'cocosair';
import { OrbitState } from './orbit-state.js';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });
const scene = new Scene('orbit-controls');
scene.globals.ambient.skyColor = new Vec4(0.4, 0.47, 0.59, 1);
const cameraNode = new Node('Orbit Camera');
scene.addChild(cameraNode);
const camera = cameraNode.addComponent(Camera);
camera.visibility = Layers.Enum.DEFAULT;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(22, 29, 43, 255);
const lightNode = new Node('Directional Light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-55, -35, 0);
lightNode.addComponent(DirectionalLight).illuminance = 50000;
for (let index = 0; index < 5; index++) {
    const node = new Node(`Marker ${index}`);
    scene.addChild(node);
    node.setPosition((index - 2) * 1.25, index % 2 ? 0.35 : -0.1, 0);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(
        index === 2 ? primitives.sphere(0.65) : primitives.box({ width: 0.7, height: 0.7, length: 0.7 }),
    );
    const material = new Material();
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('albedo', index % 2 ? new Color(210, 150, 80, 255) : new Color(85, 155, 210, 255));
    renderer.material = material;
}

const orbit = new OrbitState();
const current = new Vec2();
const previous = new Vec2();
const target = new Vec3();
let activeTouch: number | null = null;
let previousTime = 0;
let drags = 0;
let wheels = 0;
let capturedDOMWheels = 0;
let bubbledDOMWheels = 0;
let updates = 0;
let elapsed = 0;

// TOUCH_* also carries simulated mouse input. Do not bind MOUSE_MOVE a second time.
function start(event: EventTouch): void {
    if (activeTouch !== null) return;
    activeTouch = event.getID();
    if (activeTouch === null) return;
    event.getUILocation(previous);
    previousTime = performance.now();
    orbit.begin();
}
function move(event: EventTouch): void {
    if (activeTouch === null || event.getID() !== activeTouch) return;
    event.getUILocation(current);
    const now = performance.now();
    const seconds = Math.max(0.001, (now - previousTime) / 1000);
    const height = Math.max(1, view.getVisibleSize().height);
    orbit.drag((current.x - previous.x) / height, (current.y - previous.y) / height, seconds);
    previous.set(current);
    previousTime = now;
    drags++;
}
function end(event: EventTouch): void {
    if (activeTouch === null || event.getID() !== activeTouch) return;
    activeTouch = null;
    orbit.end(event.type === Input.EventType.TOUCH_CANCEL || performance.now() - previousTime > 100);
}
function wheel(event: EventMouse): void {
    orbit.wheel(event.getScrollY());
    wheels++;
}
function domCapture(event: WheelEvent): void {
    if (event.target === canvas) capturedDOMWheels++;
}
function domBubble(event: WheelEvent): void {
    if (event.target === canvas) bubbledDOMWheels++;
}

class OrbitController extends Component {
    onEnable(): void {
        input.on(Input.EventType.TOUCH_START, start);
        input.on(Input.EventType.TOUCH_MOVE, move);
        input.on(Input.EventType.TOUCH_END, end);
        input.on(Input.EventType.TOUCH_CANCEL, end);
        input.on(Input.EventType.MOUSE_WHEEL, wheel);
        window.addEventListener('wheel', domCapture, { capture: true });
        window.addEventListener('wheel', domBubble);
    }
    onDisable(): void {
        input.off(Input.EventType.TOUCH_START, start);
        input.off(Input.EventType.TOUCH_MOVE, move);
        input.off(Input.EventType.TOUCH_END, end);
        input.off(Input.EventType.TOUCH_CANCEL, end);
        input.off(Input.EventType.MOUSE_WHEEL, wheel);
        window.removeEventListener('wheel', domCapture, true);
        window.removeEventListener('wheel', domBubble);
        orbit.end(true);
        activeTouch = null;
    }
    update(dt: number): void {
        updates++;
        elapsed += dt;
        orbit.update(dt);
        const position = orbit.position();
        cameraNode.setPosition(position.x, position.y, position.z);
        cameraNode.lookAt(target);
        document.querySelector('#status')!.textContent =
            `drag ${drags} · wheel ${wheels} · radius ${orbit.radius.toFixed(2)} · angular speed ${Math.hypot(orbit.thetaVelocity, orbit.phiVelocity).toFixed(3)}`;
    }
}
cameraNode.addComponent(OrbitController);
const initial = orbit.position();
cameraNode.setPosition(initial.x, initial.y, initial.z);
cameraNode.lookAt(target);
(window as any).__airApp = app;
(window as any).__orbitProbe = () => ({
    ready: !!camera.camera,
    theta: orbit.theta,
    phi: orbit.phi,
    radius: orbit.radius,
    thetaVelocity: orbit.thetaVelocity,
    phiVelocity: orbit.phiVelocity,
    damping: orbit.damping,
    dragging: orbit.dragging,
    drags,
    wheels,
    capturedDOMWheels,
    bubbledDOMWheels,
    updates,
    elapsed,
});
app.run(scene);
