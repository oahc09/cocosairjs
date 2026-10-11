Derived from the cocosair-input-action skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

Environment: the HTML examples using `/build/` require the AIR development server and an existing bundle. In npm applications use the installed package name and the application's own bundler/server; resolve docs and declarations from that package. Do not copy repository URLs into a consumer app. Browser behavior is verified only for explicitly tested snippets and candidates.

# Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import {
    createAirApp, Scene, Node, Camera, Vec3, Color, Component,
    input, Input, systemEvent, SystemEvent, KeyCode,
    createActionState, createActionInput, createSessionGate, SceneStack
} from 'cocosair';

const canvas = document.getElementById('GameCanvas'); // must exist before this import
const app = await createAirApp({ canvas });

const scene = new Scene('Main');
const camNode = new Node('Main Camera');
scene.addChild(camNode);
camNode.setPosition(new Vec3(0, 1, 4));
const camera = camNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.clearColor = new Color(20, 26, 40, 255);

const gate = createSessionGate();
gate.activate(); // begin a session generation; further gates below honour it

const state = createActionState({
    actions: {
        fire: { sources: [{ backend: 'native', keyCode: KeyCode.KEY_A }] },
        move: {
            mode: 'axis',
            sources: [
                { backend: 'native', keyCode: KeyCode.KEY_W, value: 1 },
                { backend: 'native', keyCode: KeyCode.KEY_S, value: -1 }
            ]
        }
    }
});

const adapter = createActionInput({ state, backend: 'native', canvas, session: gate });
adapter.attach(); // installs listeners; does not steal focus

const stack = new SceneStack(scene, { canvas, maxCachedPages: 4 });
stack.push(() => new Node('Menu'), 'Menu');

let taps = 0;
const onTouchStart = (event) => { taps += 1; /* event.touch is the changed contact */ };
const onMouseDown = (event) => { /* raw mouse, EventMouse */ };
input.on(Input.EventType.TOUCH_START, onTouchStart);
systemEvent.on(SystemEvent.EventType.MOUSE_DOWN, onMouseDown);

class Driver extends Component {
    update() {
        for (const edge of state.consumeTick().transitions) {
            if (edge.action === 'fire' && edge.kind === 'press') {
                stack.push(() => new Node('Level'), 'Level', { transitionMs: 250 });
            }
        }
        camNode.setPosition(0, 1, 4 + state.axis('move'));
    }
}
camNode.addComponent(Driver);

app.run(scene); // async render loop: frames land on later ticks

function teardown() {
    input.off(Input.EventType.TOUCH_START, onTouchStart);
    systemEvent.off(SystemEvent.EventType.MOUSE_DOWN, onMouseDown);
    adapter.dispose(); // reset('dispose') + detach + unbind gate
    stack.dispose();
}
</script>
```

The `Input.EventType.*` and `SystemEvent.EventType.*` enums are the only legal event names; `EventMouse`, `EventTouch` and `EventKeyboard` carry no static event constants of their own (`src/cocos/input/input.ts:160`, `src/cocos/input/system-event.ts:72`, `src/cocos/input/types/event-enum.ts:277`).
