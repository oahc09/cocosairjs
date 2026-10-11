Derived from the cocosair-scene-graph skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

Environment: the HTML examples using `/build/` require the AIR development server and an existing bundle. In npm applications use the installed package name and the application's own bundler/server; resolve docs and declarations from that package. Do not copy repository URLs into a consumer app. Browser behavior is verified only for explicitly tested snippets and candidates.

# Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Component, Layers, Vec3 } from 'cocosair'; // page alias, not the package name

const app = await createAirApp({ canvas: '#GameCanvas' }); // canvas must exist before this import

const scene = new Scene('Main');          // Scene extends Node: attach children to it directly
const root = new Node('Root');
root.layer = Layers.Enum.DEFAULT;         // 3D culling needs camera.visibility to CONTAIN node.layer; the default camera mask already includes DEFAULT
root.setPosition(new Vec3(0, 1, 0));      // local coords, relative to the parent
scene.addChild(root);                     // returns void; no chaining

class Spinner extends Component {
    update (dt) {                         // dt is in SECONDS, not milliseconds
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 30, 0);
    }
}
root.addComponent(Spinner);               // onLoad -> onEnable -> start -> update -> lateUpdate
app.run(scene);                            // running a new scene destroys the previous one
</script>
```

Entry choice, importmap alias and install are owned by [cocosair-project-setup](../../cocosair-project-setup/SKILL.md); `createAirApp` options and the run/release/close handle by [cocosair-application](../../cocosair-application/SKILL.md).
