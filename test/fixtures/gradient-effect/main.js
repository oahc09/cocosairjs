import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Color,
    Vec4,
    MeshRenderer,
    utils,
    Material,
    createStepClock,
    Layers,
    EffectAsset,
    primitives,
    DirectionalLight,
} from '/runtime.js';
import { createAirGradientEffect } from '/runtime.js';
const q = (window.__qa = { done: false, ok: false, checks: [] });
const check = (name, ok, detail) => {
    q.checks.push({ name, ok, detail });
};
const near = (a, b, t = 3) => a.every((x, i) => Math.abs(x - b[i]) <= t);
const canvas = document.querySelector('canvas');
let clock;
const sample = async (x, y) => {
    const receipt = await clock.step(1 / 60);
    q.frameReceipts.push(receipt);
    const gl = canvas.getContext('webgl2'),
        pixel = new Uint8Array(4);
    gl.readPixels(x, canvas.height - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return [...pixel];
};
try {
    const app = await createAirApp({ canvas: '#GameCanvas' });
    const scene = new Scene('gradient-qa');
    scene.globals.skybox.useHDR = false;
    scene.globals.ambient.skyColor = new Vec4(1, 1, 1, 1);
    scene.globals.ambient.groundAlbedo = new Vec4(1, 1, 1, 1);
    scene.globals.ambient.skyIllum = 1;
    const cn = new Node('Camera');
    scene.addChild(cn);
    cn.setPosition(0, 0.5, 5);
    const camera = cn.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.orthoHeight = 1;
    camera.near = 0.1;
    camera.far = 20;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(0, 0, 0, 255);
    camera.visibility = Layers.Enum.DEFAULT;
    const node = new Node('quad-local-y');
    scene.addChild(node);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh({
        positions: [-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
        indices: [0, 1, 2, 0, 2, 3],
    });
    const effect = createAirGradientEffect();
    let mat = new Material();
    mat.initialize({ effectAsset: effect, defines: { AIR_GRADIENT_UNLIT: true } });
    renderer.setSharedMaterial(mat, 0);
    app.run(scene);
    clock = createStepClock({ stepTimeoutMs: 10000 });
    clock.begin();
    q.frameReceipts = [];
    await sample(256, 256);
    for (const [label, y, h] of [
        ['bottom', 383, 0.001953125],
        ['quarter', 320, 0.248046875],
        ['mid', 256, 0.498046875],
        ['top', 129, 0.994140625],
    ]) {
        const pixel = await sample(256, y);
        check('localY-' + label, near(pixel, [Math.round(h * 255), 0, Math.round((1 - h) * 255), 255]), { pixel, h });
    }
    mat.setProperty('scale', 2);
    let p = await sample(256, 320);
    check('scale', near(p, [127, 0, 128, 255]), p);
    mat.setProperty('scale', 1);
    mat.setProperty('offset', 0.25);
    p = await sample(256, 320);
    check('offset', near(p, [127, 0, 128, 255]), p);
    mat.setProperty('offset', 0);
    mat.setProperty('smoothness', 2);
    p = await sample(256, 320);
    check('smoothness', near(p, [16, 0, 239, 255]), p);
    mat.setProperty('smoothness', 0);
    p = await sample(256, 320);
    const w = Math.pow(0.248046875, 0.01);
    check('zero-smoothness-finite', near(p, [Math.round(w * 255), 0, Math.round((1 - w) * 255), 255]), p);
    mat.setProperty('smoothness', 1);
    node.setPosition(0.2, 0.2, 0);
    p = await sample(307, 269);
    check('translation-localY-stable', near(p, [63, 0, 192, 255]), p);
    node.setPosition(0, 0, 0);
    node.setRotationFromEuler(0, 0, 180);
    node.setPosition(0, 1, 0);
    p = await sample(256, 192);
    check('rotation-localY-stable', near(p, [63, 0, 192, 255]), p);
    node.setRotationFromEuler(0, 0, 0);
    node.setPosition(0, 0, 0);
    mat = new Material();
    mat.initialize({ effectAsset: effect, technique: 1, defines: { AIR_GRADIENT_UNLIT: true } });
    mat.setProperty('alpha', 0.5);
    renderer.setSharedMaterial(mat, 0);
    p = await sample(256, 256);
    check('alpha-blend-black', near(p, [64, 0, 64, 255]), p);

    mat = new Material();
    mat.initialize({ effectAsset: effect, defines: { AIR_GRADIENT_UNLIT: true } });
    mat.setProperty('topColor', new Vec4(0, 0, 0.5, 0.4));
    mat.setProperty('bottomColor', new Vec4(0, 0, 0.5, 0.4));
    renderer.setSharedMaterial(mat, 0);
    p = await sample(256, 256);
    check('rgba-opaque-canvas', near(p, [0, 0, 128, 255]), {
        pixel: p,
        context: canvas.getContext('webgl2').getContextAttributes(),
    });
    mat = new Material();
    mat.initialize({ effectAsset: effect, technique: 1, defines: { AIR_GRADIENT_UNLIT: true } });
    mat.setProperty('topColor', new Vec4(0, 0, 0.5, 0.4));
    mat.setProperty('bottomColor', new Vec4(0, 0, 0.5, 0.4));
    renderer.setSharedMaterial(mat, 0);
    p = await sample(256, 256);
    check('color-alpha-blend', near(p, [0, 0, 51, 255]), p);
    mat = new Material();
    mat.initialize({ effectAsset: effect });
    mat.setProperty('topColor', new Vec4(0, 0, 0.5, 1));
    mat.setProperty('bottomColor', new Vec4(0, 0, 0.5, 1));
    renderer.setSharedMaterial(mat, 0);
    p = await sample(256, 256);
    check('native-white-ambient', near(p, [0, 0, 128, 255]), p);
    mat = new Material();
    mat.initialize({ effectAsset: effect, defines: { AIR_GRADIENT_BABYLON_RESPONSE: true } });
    mat.setProperty('topColor', new Vec4(0, 0, 0.5, 1));
    mat.setProperty('bottomColor', new Vec4(0, 0, 0.5, 1));
    renderer.setSharedMaterial(mat, 0);
    p = await sample(256, 256);
    check('babylon-blue-square', near(p, [0, 0, 64, 255]), p);
    mat = new Material();
    mat.initialize({ effectAsset: effect, defines: { AIR_GRADIENT_UNLIT: true, AIR_GRADIENT_SRGB_OUTPUT: true } });
    mat.setProperty('topColor', new Vec4(0.25, 0.25, 0.25, 1));
    mat.setProperty('bottomColor', new Vec4(0.25, 0.25, 0.25, 1));
    renderer.setSharedMaterial(mat, 0);
    p = await sample(256, 256);
    check('srgb-opt-in', near(p, [137, 137, 137, 255]), p);

    mat = new Material();
    mat.initialize({ effectAsset: effect, defines: { AIR_GRADIENT_UNLIT: true } });
    mat.setProperty('topColor', new Vec4(0.4, 0.4, 0.4, 1));
    mat.setProperty('bottomColor', new Vec4(0.2, 0.2, 0.2, 1));
    mat.setProperty('offset', 1.5);
    mat.setProperty('scale', 0);
    renderer.setSharedMaterial(mat, 0);
    p = await sample(256, 256);
    check('extrapolate-above-one', near(p, [128, 128, 128, 255]), p);
    mat.setProperty('offset', 0.9);
    mat.setProperty('smoothness', 20);
    p = await sample(256, 256);
    const high = 255 * (0.2 + 0.2 * Math.pow(0.9, 20));
    check('smoothness-twenty', near(p, [Math.round(high), Math.round(high), Math.round(high), 255]), p);
    mat = new Material();
    mat.initialize({ effectAsset: effect });
    mat.setProperty('topColor', new Vec4(0.5, 0.5, 0.5, 1));
    mat.setProperty('bottomColor', new Vec4(0.5, 0.5, 0.5, 1));
    renderer.setSharedMaterial(mat, 0);
    scene.globals.ambient.skyIllum = 0;
    const ln = new Node('Directional');
    scene.addChild(ln);
    const light = ln.addComponent(DirectionalLight);
    light.color = new Color(255, 255, 255, 255);
    light.illuminance = 1;
    p = await sample(256, 256);
    check('directional-front', near(p, [128, 128, 128, 255]), p);
    ln.setRotationFromEuler(0, 180, 0);
    p = await sample(256, 256);
    check('directional-away', near(p, [0, 0, 0, 255]), p);
    light.enabled = false;
    ln.setRotationFromEuler(0, 0, 0);
    p = await sample(256, 256);
    check('directional-disabled', near(p, [0, 0, 0, 255]), p);
    scene.globals.ambient.skyIllum = 1;
    scene.globals.ambient.skyColor = new Vec4(1, 0, 0, 1);
    scene.globals.ambient.groundAlbedo = new Vec4(0, 0, 1, 1);
    p = await sample(256, 256);
    check('hemisphere-side-normal', near(p, [64, 0, 64, 255]), p);
    const normalMesh = (ny) =>
        utils.createMesh({
            positions: [-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0],
            normals: [0, ny, 0, 0, ny, 0, 0, ny, 0, 0, ny, 0],
            indices: [0, 1, 2, 0, 2, 3],
        });
    renderer.mesh = normalMesh(1);
    p = await sample(256, 256);
    check('hemisphere-up-normal', near(p, [128, 0, 0, 255]), p);
    renderer.mesh = normalMesh(-1);
    p = await sample(256, 256);
    check('hemisphere-down-normal', near(p, [0, 0, 128, 255]), p);
    scene.globals.ambient.skyColor = new Vec4(1, 1, 1, 1);
    scene.globals.ambient.groundAlbedo = new Vec4(1, 1, 1, 1);
    const independent = createAirGradientEffect(),
        m2 = new Material();
    m2.initialize({ effectAsset: independent, defines: { AIR_GRADIENT_UNLIT: true } });
    m2.setProperty('topColor', new Vec4(0, 1, 0, 1));
    m2.setProperty('bottomColor', new Vec4(0, 1, 0, 1));
    renderer.setSharedMaterial(m2, 0);
    p = await sample(256, 256);
    check('second-effect-independent-green', near(p, [0, 255, 0, 255]), p);
    renderer.setSharedMaterial(mat, 0);
    m2.destroy();
    EffectAsset.remove(independent);
    independent.destroy();
    p = await sample(256, 256);
    check('destroy-independent-keeps-first', near(p, [128, 128, 128, 255]), p);
    const recreated = createAirGradientEffect(),
        m3 = new Material();
    m3.initialize({ effectAsset: recreated, defines: { AIR_GRADIENT_UNLIT: true } });
    m3.setProperty('topColor', new Vec4(1, 1, 0, 1));
    m3.setProperty('bottomColor', new Vec4(1, 1, 0, 1));
    renderer.setSharedMaterial(m3, 0);
    p = await sample(256, 256);
    check('recreate-after-destroy', near(p, [255, 255, 0, 255]), p);
    renderer.setSharedMaterial(mat, 0);
    m3.destroy();
    EffectAsset.remove(recreated);
    recreated.destroy();
    renderer.mesh = utils.createMesh(primitives.plane({ width: 2, length: 1 }));
    node.setRotationFromEuler(90, 0, 0);
    node.setPosition(0, 0.5, 0);
    mat = new Material();
    mat.initialize({ effectAsset: effect, defines: { AIR_GRADIENT_UNLIT: true } });
    mat.setProperty('offset', 0.5);
    renderer.setSharedMaterial(mat, 0);
    const flatA = await sample(256, 192),
        flatB = await sample(256, 320);
    check('XZ-plane-has-no-localY-gradient', near(flatA, [128, 0, 128, 255]) && near(flatB, [128, 0, 128, 255]), {
        flatA,
        flatB,
    });
    node.setRotationFromEuler(0, 0, 0);
    node.setPosition(0, 0, 0);
    cn.setPosition(0, 0, 5);
    renderer.mesh = utils.createMesh({
        positions: [-1, -0.5, 0, 1, -0.5, 0, 1, 0.5, 0, -1, 0.5, 0],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
        indices: [0, 1, 2, 0, 2, 3],
    });
    mat = new Material();
    mat.initialize({ effectAsset: effect, defines: { AIR_GRADIENT_BABYLON_RESPONSE: true } });
    mat.setProperty('topColor', new Vec4(0, 0, 1, 1));
    mat.setProperty('bottomColor', new Vec4(0, 0, 0, 1));
    mat.setProperty('offset', 0.5);
    renderer.setSharedMaterial(mat, 0);
    q.reference = [];
    for (const y of [358, 307, 256, 205, 154]) {
        const localY = (255.5 - y) / 256,
            weight = localY + 0.5,
            pixel = await sample(256, y),
            expected = [0, 0, Math.round(weight * weight * 255), 255];
        q.reference.push({ y, localY, weight, pixel, expected });
        check('reference-blue-' + y, near(pixel, expected), q.reference.at(-1));
    }
    q.colorContract =
        'readPixels on raw-output WebGL2 opaque default framebuffer; AIR_GRADIENT_SRGB_OUTPUT=false, native LDR white hemisphere. No implicit gamma expectation; separate explicit sRGB test validates .25=>137.';
    q.glError = canvas.getContext('webgl2').getError();
    check('gl-error-zero', q.glError === 0, q.glError);
    q.ok = q.checks.every((c) => c.ok);
    clock.end();
    q.nativePacingRestored = !clock.stepping;
    q.done = true;
} catch (e) {
    clock?.end();
    q.error = String(e);
    q.done = true;
    throw e;
}
