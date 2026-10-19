import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Color,
    Vec4,
    Texture2D,
    MeshRenderer,
    Material,
    EffectAsset,
    utils,
} from 'cocosair';
import { prepareEffectForRegistration } from '../../../../tools/debug/effect-layout.js';
const app = await createAirApp({ canvas: '#GameCanvas' });
const definition = await fetch('/examples/hdr-color-pipeline/vertex-texture-rgb.effect.json').then((response) => {
    if (!response.ok) throw Error(`Effect HTTP ${response.status}`);
    return response.json();
});
const prepared = prepareEffectForRegistration(definition);
const effect = Object.assign(new EffectAsset(), prepared.effect);
effect.onLoaded();
const scene = new Scene('Three input color contract');
const cameraNode = new Node('Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(0, 0, 8);
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.ORTHO;
camera.orthoHeight = Math.max(2, 3.5 / (app.canvas.clientWidth / app.canvas.clientHeight));
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(21, 32, 43, 255);
const srgb = [128, 90, 50],
    decode = (value: number) => {
        const c = value / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
const texture = new Texture2D();
texture.reset({ width: 1, height: 1, format: Texture2D.PixelFormat.SRGBA8888 });
texture.uploadData(Uint8Array.from([...srgb, 255]));
const mesh = utils.createMesh(
    {
        positions: [-0.7, -0.6, 0, 0.7, -0.6, 0, -0.7, 0.6, 0, 0.7, 0.6, 0],
        uvs: [0, 0, 1, 0, 0, 1, 1, 1],
        colors: Array.from({ length: 4 }, () => [...srgb.map((v) => v / 255), 1]).flat(),
        indices: [0, 1, 2, 1, 3, 2],
    },
    undefined,
    { calculateBounds: true },
);
const materials: Material[] = [];
for (let technique = 0; technique < 2; technique++)
    for (let mode = 0; mode < 4; mode++) {
        const material = new Material();
        material.initialize({ effectAsset: effect, technique });
        materials.push(material);
        material.setProperty('params', new Vec4(mode, 0, 0, 0));
        material.setProperty('customColor', new Vec4(...(srgb.map(decode) as [number, number, number]), 1));
        material.setProperty('colorMap', texture);
        const node = new Node(
            `Program ${technique}: ${['vertex sRGB', 'texture sRGB', 'custom linear', 'double decode negative'][mode]}`,
        );
        scene.addChild(node);
        node.setPosition((mode - 1.5) * 1.65, technique ? -0.8 : 0.8, 0);
        const renderer = node.addComponent(MeshRenderer);
        renderer.mesh = mesh;
        renderer.setSharedMaterial(material, 0);
    }
app.run(scene);
const listeners = new AbortController();
app.session!.own(() => listeners.abort(), 'color-listeners');
let closing: ReturnType<NonNullable<typeof app.close>> | undefined;
function close() {
    return (closing ??= (async () => {
        const receipt = await app.close!();
        materials.forEach((m) => m.destroy());
        mesh.destroy();
        texture.destroy();
        effect.destroy();
        return receipt;
    })());
}
window.addEventListener(
    'pagehide',
    () => {
        void close();
    },
    { signal: listeners.signal },
);
document.querySelector('#status')!.textContent =
    'Two programs: first three patches should match [128,90,50]; the fourth is intentionally too dark. This page is not a visual PASS receipt.';

export const verification = { app, scene, camera, materials, mesh, texture, close, bindings: prepared.bindings };
