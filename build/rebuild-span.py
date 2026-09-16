# -*- coding: utf-8 -*-
"""Deterministically rebuild the B047-B060 row span in catalog100.ts."""
import io

p = 'tools/benchmark/catalog/catalog100.ts'
lines = io.open(p, encoding='utf-8').read().split('\n')

start = next(i for i, l in enumerate(lines) if "{ id: 'B047'" in l)
end = next(i for i, l in enumerate(lines) if 'B063-B070' in l)

clean = """    { id: 'B047', type: 'source-create', category: 'Asset', name: 'asset-lifecycle-reload', prompt: 'Create src/main.ts: load "/assets/BoxTextured.glb", destroy the asset after instantiating once, then load it AGAIN and instantiate a second model; the scene must remain error-free.', validators: ['scene-ready', 'no-runtime-error', 'resource-released'], template: 'custom', params: { ref: 'B047' }, refCode: `import { createAirApp, Scene, Camera, DirectionalLight, Node, Layers, GLTFLoader } from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B047');
const cameraNode = new Node('camera');
scene.addChild(cameraNode);
cameraNode.addComponent(Camera).visibility = Layers.Enum.DEFAULT;
const lightNode = new Node('light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight);
app.run(scene);
const load = async () => new GLTFLoader().parseAsync(await (await fetch('/assets/BoxTextured.glb')).arrayBuffer(), '/');
const first = await load();
const inst1 = first.instantiate();
scene.addChild(inst1.root);
first.destroy();
const second = await load();
scene.addChild(second.instantiate().root);
` },
    { id: 'B048', type: 'runtime-control', category: 'Asset', name: 'rc-instantiate-scope', prompt: 'Use the runtime agent session: create a node named rc-parent, then create a child under it named rc-child, then inspect the child (parentId must be the parent id).', validators: ['scene-ready', 'node-exists', 'no-runtime-error'], validatorParams: { 'node-exists': { name: 'rc-child' } }, template: 'rc-app', params: {}, refCode: rcApp('B048') },
    { id: 'B049', type: 'source-create', category: 'Asset', name: 'gltf-warnings-clean', prompt: 'Create src/main.ts: load BoxTextured.glb and confirm asset.warnings is empty (log the count); instantiate and render cleanly.', validators: ['scene-ready', 'no-runtime-error', 'visible-frame'], template: 'custom', params: { ref: 'B049' }, refCode: `import { createAirApp, Scene, Camera, DirectionalLight, Node, Layers, GLTFLoader, frameObject } from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B049');
const cameraNode = new Node('camera');
scene.addChild(cameraNode);
const camera = cameraNode.addComponent(Camera);
camera.visibility = Layers.Enum.DEFAULT;
const lightNode = new Node('light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight);
app.run(scene);
const asset = await new GLTFLoader().parseAsync(await (await fetch('/assets/BoxTextured.glb')).arrayBuffer(), '/');
console.log('[B049] warnings:', asset.warnings.length);
scene.addChild(asset.instantiate().root);
frameObject(camera, scene);
` },
    { id: 'B050', type: 'runtime-control', category: 'glTF', name: 'rc-inspect-scene-deep', prompt: 'Use the runtime agent session: create three nodes (rc-a, rc-b under rc-a, rc-c under rc-b) and confirm inspectScene reports nodeCount >= 4.', validators: ['scene-ready', 'node-count', 'no-runtime-error'], validatorParams: { 'node-count': { min: 4 } }, template: 'rc-app', params: {}, refCode: rcApp('B050') },

    // ---- B052-B060：glTF Extensions / Compression 补充 ----
    { id: 'B052', type: 'source-create', category: 'Compression', name: 'draco-sequential-encoding', prompt: 'Create src/main.ts: load "/assets/sequential-draco.glb" (Draco sequential encoding) with GLTFLoader, instantiate, render one clean frame.', validators: ['scene-ready', 'capability-status', 'no-runtime-error'], template: 'custom', params: { ref: 'B052' }, refCode: `import { createAirApp, Scene, Camera, DirectionalLight, Node, Layers, GLTFLoader } from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B052');
const cameraNode = new Node('camera');
scene.addChild(cameraNode);
cameraNode.addComponent(Camera).visibility = Layers.Enum.DEFAULT;
const lightNode = new Node('light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight);
app.run(scene);
const bytes = await (await fetch('/assets/sequential-draco.glb')).arrayBuffer();
const asset = await new GLTFLoader().parseAsync(bytes, '/');
scene.addChild(asset.instantiate().root);
` },
    { id: 'B053', type: 'runtime-control', category: 'Compression', name: 'rc-extension-support-report', prompt: 'Use the runtime agent session: inspect the scene and finish; the fixture page preloads GLTF extension support info in the docs-agent note for cross-checking.', validators: ['scene-ready', 'no-runtime-error'], template: 'rc-app', params: {}, refCode: rcApp('B053') },
    { id: 'B054', type: 'runtime-control', category: 'Compression', name: 'rc-draco-load-scope', prompt: 'Use the runtime agent session: loadAsset "/assets/compressed.glb" (draco decoder is preconfigured in this environment) and report the assetId.', validators: ['scene-ready', 'no-runtime-error'], template: 'rc-app', params: {}, refCode: rcApp('B054') },
    { id: 'B055', type: 'source-create', category: 'Compression', name: 'meshopt-availability-guard', prompt: 'Create src/main.ts: check meshopt availability via the cocosair export isMeshoptAvailable and log the boolean; the scene must run regardless of the result (no errors).', validators: ['scene-ready', 'no-runtime-error'], template: 'custom', params: { ref: 'B055' }, refCode: `import { createAirApp, Scene, isMeshoptAvailable } from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B055');
console.log('[B055] meshopt available:', isMeshoptAvailable());
app.run(scene);
` },
    { id: 'B056', type: 'source-create', category: 'Compression', name: 'ktx2-availability-guard', prompt: 'Create src/main.ts: log isKTX2Available() capability check using the exported helper; scene runs error-free.', validators: ['scene-ready', 'no-runtime-error'], template: 'custom', params: { ref: 'B056' }, refCode: `import { createAirApp, Scene, isKTX2Available } from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B056');
console.log('[B056] ktx2 available:', isKTX2Available());
app.run(scene);
` },
    { id: 'B057', type: 'source-create', category: 'Compression', name: 'draco-reload-twice', prompt: 'Create src/main.ts: load "/assets/compressed.glb" twice sequentially (destroy between) with the configured draco decoder; no errors.', validators: ['scene-ready', 'no-runtime-error', 'resource-released'], template: 'custom', params: { ref: 'B057' }, refCode: `import { createAirApp, Scene, GLTFLoader } from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B057');
app.run(scene);
const load = async () => new GLTFLoader().parseAsync(await (await fetch('/assets/compressed.glb')).arrayBuffer(), '/');
const a = await load();
a.destroy();
const b = await load();
b.destroy();
` },
    { id: 'B058', type: 'runtime-control', category: 'Compression', name: 'rc-draco-instantiate', prompt: 'Use the runtime agent session: loadAsset "/assets/compressed.glb" then instantiateAsset under the scene root.', validators: ['scene-ready', 'no-runtime-error'], template: 'rc-app', params: {}, refCode: rcApp('B058') },
    { id: 'B059', type: 'runtime-control', category: 'Compression', name: 'rc-capability-error-code', prompt: 'Use the runtime agent session: attempt loadAsset on an invalid data URL and verify the stable LOAD_FAILED error code is returned, then finish successfully.', validators: ['scene-ready', 'no-runtime-error'], template: 'rc-app', params: {}, refCode: rcApp('B059') },
    { id: 'B060', type: 'source-create', category: 'Compression', name: 'quantization-mesh', prompt: 'Create src/main.ts: load "/assets/BoxTextured.glb" (KHR_mesh_quantization compatible) and render cleanly.', validators: ['scene-ready', 'no-runtime-error', 'visible-frame'], template: 'custom', params: { ref: 'B060' }, refCode: `import { createAirApp, Scene, Camera, DirectionalLight, Node, Layers, GLTFLoader, frameObject } from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B060');
const cameraNode = new Node('camera');
scene.addChild(cameraNode);
const camera = cameraNode.addComponent(Camera);
camera.visibility = Layers.Enum.DEFAULT;
const lightNode = new Node('light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight);
app.run(scene);
const asset = await new GLTFLoader().parseAsync(await (await fetch('/assets/BoxTextured.glb')).arrayBuffer(), '/');
scene.addChild(asset.instantiate().root);
frameObject(camera, scene);
` },"""

new_lines = lines[:start] + clean.split('\n') + lines[end:]
io.open(p, 'w', encoding='utf-8', newline='\n').write('\n'.join(new_lines))
print('B047-B060 span rebuilt')
