import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Material,
    MeshRenderer,
    Color,
    Vec3,
    Vec4,
    Layers,
    EffectAsset,
    utils,
} from 'cocosair';
import * as AIR from 'cocosair';

const createAirGradientEffect = AIR.createAirGradientEffect;
if (typeof createAirGradientEffect !== 'function') {
    throw new Error('Gradient API missing from SDK: run npm run build from this checkout, then reload.');
}

const app = await createAirApp({ canvas: '#GameCanvas' });
// The reference writes raw RGB, without HDR tone mapping or sRGB conversion.
const scene = new Scene('local-y-gradient');
scene.globals.skybox.useHDR = false;
scene.globals.ambient.skyColor = new Vec4(1, 1, 1, 1);
scene.globals.ambient.groundAlbedo = new Vec4(1, 1, 1, 1);
scene.globals.ambient.skyIllum = 1;

const cameraNode = new Node('Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(0, 0, 2);
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.ORTHO;
camera.orthoHeight = 0.7;
camera.near = 0.1;
camera.far = 10;
camera.clearColor = new Color(32, 32, 32, 255);
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.visibility = Layers.Enum.DEFAULT;

// XY geometry is deliberate. A rotated Cocos XZ plane still has constant local Y.
const mesh = utils.createMesh({
    positions: [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    indices: [0, 1, 2, 0, 2, 3],
    minPos: new Vec3(-0.5, -0.5, 0),
    maxPos: new Vec3(0.5, 0.5, 0),
});
const node = new Node('Gradient');
node.layer = Layers.Enum.DEFAULT;
scene.addChild(node);
const renderer = node.addComponent(MeshRenderer);
renderer.mesh = mesh;
const effect = createAirGradientEffect();
let material: Material;

function configure(): void {
    const previous = material;
    material = new Material();
    const mode = (document.querySelector('#mode') as HTMLSelectElement).value;
    material.initialize({
        effectAsset: effect,
        technique: 1,
        defines: {
            AIR_GRADIENT_UNLIT: mode === 'unlit',
            AIR_GRADIENT_BABYLON_RESPONSE: mode === 'reference',
        },
    });
    material.setProperty('topColor', new Vec4(0, 0, 1, 1));
    material.setProperty('bottomColor', new Vec4(0, 0, 0, 1));
    update();
    renderer.setSharedMaterial(material, 0);
    previous?.destroy();
}
function update(): void {
    for (const property of ['offset', 'scale', 'smoothness', 'alpha']) {
        const control = document.getElementById(property) as HTMLInputElement;
        material.setProperty(property, Number(control.value));
        document.getElementById(`${property}-value`)!.textContent = control.value;
    }
}
const panel = document.querySelector('#controls')!;
panel.addEventListener('input', update);
document.querySelector('#mode')!.addEventListener('change', configure);
configure();
app.run(scene);

// Native ownership: no shared builtin is mutated, and no renderer instance is
// accidentally edited instead of the shared material bound above.
window.addEventListener('pagehide', () => {
    renderer.setSharedMaterial(null, 0);
    renderer.mesh = null;
    material.destroy();
    mesh.destroy();
    EffectAsset.remove(effect);
    effect.destroy();
});
