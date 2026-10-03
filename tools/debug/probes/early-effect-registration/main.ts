import {
    createAirApp,
    Scene,
    Node,
    Camera,
    EffectAsset,
    Material,
    MeshRenderer,
    Vec4,
    Color,
    utils,
    director,
    Director,
} from 'cocosair';
import { diskEffect } from '../../../../examples/black-hole-accretion/src/effects.generated.js';

const data = JSON.parse(JSON.stringify(diskEffect));
data.name += '-early-probe';
data.techniques[0].passes[0].program += '-early-probe';
data.shaders[0].name = data.techniques[0].passes[0].program;
data.shaders[0].hash++;
const effect = Object.assign(new EffectAsset(), data);
effect.onLoaded(); // Intentionally before createAirApp, under the FULL SDK's import-time library.
const earlyLookup = EffectAsset.get(effect.name) === effect;
const app = await createAirApp({ canvas: '#GameCanvas' });
const scene = new Scene('early-effect-probe');
const cameraNode = new Node('Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(0, 0, 12);
const camera = cameraNode.addComponent(Camera);
camera.near = 0.1;
camera.far = 100;
camera.clearColor = new Color(0, 0, 0, 255);
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
const mesh = utils.createMesh({ positions: [-7, -7, 0, 7, -7, 0, 7, 7, 0, -7, 7, 0], indices: [0, 1, 2, 0, 2, 3] });
const material = new Material();
material.initialize({ effectAsset: effect });
material.setProperty('motion', new Vec4(0, 0, 1, 0));
const node = new Node('Early Registered Ring');
scene.addChild(node);
const renderer = node.addComponent(MeshRenderer);
renderer.mesh = mesh;
renderer.setSharedMaterial(material, 0);
(window as any).__earlyEffectProbe = {
    ready: false,
    earlyLookup,
    lateLookup: EffectAsset.get(effect.name) === effect,
    brightPixels: 0,
};
director.once(Director.EVENT_AFTER_DRAW, () => {
    const canvas = document.querySelector('canvas')!;
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    const context = copy.getContext('2d')!;
    context.drawImage(canvas, 0, 0);
    const pixels = context.getImageData(0, 0, copy.width, copy.height).data;
    let brightPixels = 0;
    for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i] > 30 || pixels[i + 1] > 30 || pixels[i + 2] > 30) brightPixels++;
    Object.assign((window as any).__earlyEffectProbe, { ready: true, brightPixels });
});
(window as any).__airApp = app;
app.run(scene);
