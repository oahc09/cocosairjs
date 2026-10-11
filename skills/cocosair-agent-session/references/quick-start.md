Derived from the cocosair-agent-session skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

Environment: the HTML examples using `/build/` require the AIR development server and an existing bundle. In npm applications use the installed package name and the application's own bundler/server; resolve docs and declarations from that package. Do not copy repository URLs into a consumer app. Browser behavior is verified only for explicitly tested snippets and candidates.

# Quick Start

The `window.__airApp` binding is a page convention: application code assigns it, devtools read it. Reading it is pure runtime-side JavaScript and safe to run in a browser page.

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, DirectionalLight, Vec3 } from 'cocosair';

// #GameCanvas exists before this import (the screen adapter initializes at module load).
const app = await createAirApp({ canvas: '#GameCanvas' });
const scene = new Scene('probe-target');
const camNode = new Node('Main Camera');
scene.addChild(camNode);
camNode.setPosition(new Vec3(0, 2, 6));
const camera = camNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight).illuminance = 50000;

// Runtime face only: publish the app so a devtools session or panel can find it.
window.__airApp = app;
app.run(scene);

// Later, from a dev-only console (needs the dev server): attach the agent session
// with `await import('/__debug/agent-session.js')` then createAgentSession({ app }).
// See references/agent-session.md; this call does NOT exist in the cocosair export.
</script>
```
