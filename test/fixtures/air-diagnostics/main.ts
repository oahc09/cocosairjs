import { createAirApp, Material, Scene, Node, Camera, Color } from 'cocosair';
import { createAgentSession } from '/tools/debug/agent-session.js';

const mode = new URLSearchParams(location.search).get('mode') === 'warnings' ? 'warnings' : 'errors';
const app = await createAirApp({ canvas: '#GameCanvas', diagnostics: mode });
const scene = new Scene('DiagnosticProbe');
const cameraNode = new Node('Camera');
const camera = cameraNode.addComponent(Camera);
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(20, 60, 120, 255);
scene.addChild(cameraNode);
app.run(scene);
const session = createAgentSession({ app });
const originalWarn = console.warn;
app.diagnostics!.clear();
session.clearRuntimeErrors();
const material = new Material();
material.initialize({ effectName: 'builtin-unlit' });
material.setProperty('mainColor', new Color(200, 40, 20, 255));
const validCount = app.diagnostics!.snapshot().length;
material.setProperty('portUnknownUniform', 1);
material.setProperty('portUnknownUniform', 1);
const diagnostics = app.diagnostics!.snapshot();
const collected = session.getRuntimeErrors();
session.close();
session.close();
material.setProperty('portAfterClose', 1);
let closedCode: string | undefined;
try { session.getRuntimeErrors(); } catch (error) { closedCode = error.code; }
const gl = app.canvas.getContext('webgl2')!;
await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
(window as any).__airDiagnosticProbe = {
    ready: true, mode, validCount, diagnostics, collected, closedCode,
    consoleUnwrapped: console.warn === originalWarn,
    webglVersion: gl.getParameter(gl.VERSION),
    lastHistory: app.diagnostics!.snapshot(),
};
