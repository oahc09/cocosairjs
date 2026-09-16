# -*- coding: utf-8 -*-
"""Deterministically rebuild the B063-B070 row span."""
import io

p = 'tools/benchmark/catalog/catalog100.ts'
lines = io.open(p, encoding='utf-8').read().split('\n')

start = next(i for i, l in enumerate(lines) if "{ id: 'B063'" in l)
end = next(i for i, l in enumerate(lines) if "{ id: 'B071'" in l)

clean = """    { id: 'B063', type: 'source-create', category: 'Animation', name: 'animation-component-source', prompt: 'Create src/main.ts: add an Animation component to a cube node (clips may be empty); inspectScene must see the Animation component.', validators: ['scene-ready', 'animation-playing', 'no-runtime-error'], template: 'scene-cubes', params: { cubes: [{ name: 'animated', pos: [0, 0, 0] }], extra: 'const animated = scene.getChildByName("animated")!;\\nanimated.addComponent(Animation);' } },
    { id: 'B064', type: 'source-create', category: 'Skeleton', name: 'skinned-simple-skin', prompt: 'Create src/main.ts: load "/assets/SimpleSkin.gltf" (served by the fixture) with GLTFLoader, instantiate the skinned model, and render a frame.', validators: ['scene-ready', 'no-runtime-error', 'visible-frame'], template: 'custom', params: { ref: 'B064' }, refCode: `import { createAirApp, Scene, Camera, DirectionalLight, Node, Layers, GLTFLoader, frameObject } from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B064');
const cameraNode = new Node('camera');
scene.addChild(cameraNode);
const camera = cameraNode.addComponent(Camera);
camera.visibility = Layers.Enum.DEFAULT;
const lightNode = new Node('light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight);
app.run(scene);
const asset = await new GLTFLoader().parseAsync(await (await fetch('/assets/SimpleSkin.gltf')).text(), '/assets/');
scene.addChild(asset.instantiate().root);
frameObject(camera, scene);
` },
    { id: 'B065', type: 'source-create', category: 'Animation', name: 'morph-cube-load', prompt: 'Create src/main.ts: load "/assets/AnimatedMorphCube.glb", instantiate the morph cube, and render without errors.', validators: ['scene-ready', 'no-runtime-error', 'visible-frame'], template: 'custom', params: { ref: 'B065' }, refCode: `import { createAirApp, Scene, Camera, DirectionalLight, Node, Layers, GLTFLoader, frameObject } from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B065');
const cameraNode = new Node('camera');
scene.addChild(cameraNode);
const camera = cameraNode.addComponent(Camera);
camera.visibility = Layers.Enum.DEFAULT;
const lightNode = new Node('light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight);
app.run(scene);
const asset = await new GLTFLoader().parseAsync(await (await fetch('/assets/AnimatedMorphCube.glb')).arrayBuffer(), '/');
scene.addChild(asset.instantiate().root);
frameObject(camera, scene);
` },
    { id: 'B066', type: 'runtime-control', category: 'Animation', name: 'rc-anim-two-nodes', prompt: 'Use the runtime agent session: create nodes anim-a and anim-b, attach Animation to both, then inspectScene for the Animation count.', validators: ['scene-ready', 'animation-playing', 'no-runtime-error'], template: 'rc-app', params: {}, refCode: rcApp('B066') },
    { id: 'B067', type: 'runtime-control', category: 'Skeleton', name: 'rc-skin-instantiate', prompt: 'Use the runtime agent session: loadAsset "/assets/SimpleSkin.gltf" (skinned) then instantiateAsset under the scene root.', validators: ['scene-ready', 'no-runtime-error'], template: 'rc-app', params: {}, refCode: rcApp('B067') },
    { id: 'B068', type: 'source-create', category: 'Animation', name: 'tween-rotation', prompt: 'Create src/main.ts: rotate a cube continuously using a Component whose update() advances euler.y; the scene runs error-free.', validators: ['scene-ready', 'no-runtime-error', 'visible-frame'], template: 'scene-cubes', params: { cubes: [{ name: 'spinner', pos: [0, 0, 0] }] } },
    { id: 'B069', type: 'runtime-control', category: 'Animation', name: 'rc-animation-whitelist-guard', prompt: 'Use the runtime agent session: confirm that addComponent with a non-whitelisted type returns INVALID_ARGUMENT (stable error), then finish normally.', validators: ['scene-ready', 'no-runtime-error'], template: 'rc-app', params: {}, refCode: rcApp('B069') },
    { id: 'B070', type: 'source-create', category: 'Skeleton', name: 'skinned-skeleton-components', prompt: 'Create src/main.ts: load "/assets/SimpleSkin.gltf" and confirm the instantiated tree contains a SkinnedMeshRenderer (log it); render without errors.', validators: ['scene-ready', 'no-runtime-error'], template: 'custom', params: { ref: 'B070' }, refCode: `import { createAirApp, Scene, Camera, DirectionalLight, Node, Layers, SkinnedMeshRenderer, GLTFLoader } from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B070');
const cameraNode = new Node('camera');
scene.addChild(cameraNode);
cameraNode.addComponent(Camera).visibility = Layers.Enum.DEFAULT;
const lightNode = new Node('light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight);
app.run(scene);
const asset = await new GLTFLoader().parseAsync(await (await fetch('/assets/SimpleSkin.gltf')).text(), '/assets/');
const instance = asset.instantiate();
scene.addChild(instance.root);
const skinned = instance.root.getComponentsInChildren(SkinnedMeshRenderer);
console.log('[B070] skinned renderers:', skinned.length);
` },"""

new_lines = lines[:start] + clean.split('\n') + lines[end:]
io.open(p, 'w', encoding='utf-8', newline='\n').write('\n'.join(new_lines))
print('B063-B070 span rebuilt')
