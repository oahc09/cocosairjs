import * as cc from 'cocosair';

const app = await cc.createAirApp({ canvas: '#GameCanvas', pixelRatioCap: 2 });
const scene = new cc.Scene('upstream-state');
const owned = [];
const cameras = ['A', 'B'].map((name) => {
    const node = new cc.Node(name);
    scene.addChild(node);
    node.setPosition(0, 0, 4);
    node.lookAt(new cc.Vec3());
    const camera = node.addComponent(cc.Camera);
    camera.projection = cc.Camera.ProjectionType.ORTHO;
    camera.orthoHeight = 1;
    camera.clearFlags = cc.Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new cc.Color(0, 0, 0, 255);
    return camera;
});
const mesh = cc.utils.createMesh(cc.primitives.box({ width: 0.7, height: 0.7, length: 0.1 }));
owned.push(mesh);
function item(name, x, color, transparent) {
    const node = new cc.Node(name);
    scene.addChild(node);
    node.setPosition(x, 0, 0);
    const renderer = node.addComponent(cc.MeshRenderer);
    renderer.mesh = mesh;
    const material = new cc.Material();
    material.initialize({ effectName: 'builtin-unlit', technique: transparent ? 1 : 0 });
    material.setProperty('mainColor', color);
    renderer.setSharedMaterial(material, 0);
    owned.push(material);
    return { node, renderer, material: renderer.getMaterialInstance(0) };
}
const objects = [];
const targets = cameras.map((camera, i) => {
    const target = cc.createAirRenderTarget({
        name: `upstream-${i}`,
        width: 128,
        height: 64,
        colorFormat: 'rgba8',
        depthFormat: 'depth24-stencil8',
        samples: 1,
    });
    target.attachCamera(camera);
    return target;
});
app.session.own(() => {
    for (const target of targets) target.dispose();
    for (const asset of owned) asset.destroy();
}, 'upstream-state-assets');
app.run(scene);
const clock = cc.createStepClock({ stepTimeoutMs: 10000 });
clock.begin();
const gl = app.canvas.getContext('webgl2');
if (!gl) throw new Error('WEBGL2_REQUIRED');
const checks = [];
// Read-only identity and raw-data observations for the independent paired reference contract.
const referenceIds = new WeakMap();
let referenceSequence = 0;
const referenceId = (value) => {
    if (!referenceIds.has(value)) referenceIds.set(value, `cocos-reference-${++referenceSequence}`);
    return referenceIds.get(value);
};
const pairedRaw = { blend: [], targets: [] };
function check(name, condition, details) {
    checks.push({ name, pass: !!condition, details });
}
function pixel(target, x, y = Math.floor(target.info.height / 2)) {
    return Array.from(target.readColor({ x, y, width: 1, height: 1 }));
}
function equal(a, b) {
    return a.length === b.length && a.every((value, i) => Math.abs(value - b[i]) <= 2);
}
async function frame(which = 0) {
    cameras.forEach((camera, i) => (camera.enabled = i === which));
    await clock.step(0);
}
async function run() {
    // This fixture has no animation/physics/business updates. step(0) is controlled rendering,
    // not a claim that arbitrary application callbacks are side-effect free or ready.
    for (const reverse of [false, true]) {
        const specs = [
            ['red', -1, new cc.Color(255, 0, 0, 255), false],
            ['blue', 1, new cc.Color(0, 0, 255, 128), true],
        ];
        const made = (reverse ? [...specs].reverse() : specs).map((args) => item(...args));
        objects.push(...made);
        const red = made.find((value) => value.node.name === 'red'),
            blue = made.find((value) => value.node.name === 'blue');
        blue.node.active = false;
        await frame();
        const redAlone = pixel(targets[0], 32);
        red.node.active = false;
        blue.node.active = true;
        await frame();
        const blueAlone = pixel(targets[0], 96);
        red.node.active = true;
        await frame();
        pairedRaw.blend.push({
            id: reverse ? 'transparent-first' : 'opaque-first',
            opaqueMaterialId: referenceId(red.material),
            transparentMaterialId: referenceId(blue.material),
            opaqueAlone: redAlone,
            transparentAlone: blueAlone,
            opaqueTogether: pixel(targets[0], 32),
            transparentTogether: pixel(targets[0], 96),
        });
        check(
            `non-overlap-order-${reverse}`,
            equal(redAlone, pixel(targets[0], 32)) && equal(blueAlone, pixel(targets[0], 96)),
            { redAlone, blueAlone },
        );
        check(`not-blank-${reverse}`, redAlone[0] > 240 && blueAlone[2] > 110, { redAlone, blueAlone });
        for (const object of made) object.node.active = false;
    }
    // A transparent pair with explicit pass priorities fixes draw order. Source-over
    // is intentionally order dependent; arbitrary reordering is NOT an invariant.
    const red = item('blend-red', 0, new cc.Color(255, 0, 0, 128), true);
    const blue = item('blend-blue', 0, new cc.Color(0, 0, 255, 128), true);
    objects.push(red, blue);
    const alpha = 128 / 255;
    for (const reverse of [false, true]) {
        red.material.overridePipelineStates({ priority: reverse ? 1 : 0 });
        blue.material.overridePipelineStates({ priority: reverse ? 0 : 1 });
        await frame();
        const observed = pixel(targets[0], 64);
        const expected = reverse
            ? [255 * alpha, 0, 255 * alpha * (1 - alpha), 255]
            : [255 * alpha * (1 - alpha), 0, 255 * alpha, 255];
        pairedRaw.blend.push({ id: reverse ? 'source-over-reverse' : 'source-over-forward', pixels: observed });
        check(`source-over-${reverse}`, equal(observed, expected), { observed, expected, alpha });
    }
    red.node.active = blue.node.active = false;
    cameras[0].clearColor = new cc.Color(255, 0, 0, 255);
    cameras[1].clearColor = new cc.Color(0, 0, 255, 255);
    cameras[0].clearDepth = 1;
    cameras[1].clearDepth = 0.25;
    const sequence = [];
    for (const index of [0, 1, 0]) {
        await frame(index);
        sequence.push(pixel(targets[index], 64));
    }
    check('same-size-A-B-A', equal(sequence[0], sequence[2]) && sequence[0][0] > 250 && sequence[1][2] > 250, sequence);
    pairedRaw.targets.push({
        id: 'same-size-A-B-A',
        targetIds: targets.map(referenceId),
        cameraIds: cameras.map(referenceId),
        sizes: targets.map((target) => [target.info.width, target.info.height]),
        sequence,
    });
    const before = targets.map((target) => target.info);
    targets[0].resize(256, 128);
    await frame(0);
    check(
        'resize-rebind-camera',
        targets[0].info.generation === before[0].generation + 1 &&
            targets[1].info.generation === before[1].generation &&
            cameras[0].targetTexture === targets[0].renderTexture &&
            cameras[1].targetTexture === targets[1].renderTexture &&
            pixel(targets[0], 128)[0] > 250,
        targets.map((target) => target.info),
    );
    pairedRaw.targets.push({
        id: 'resize-A',
        sizes: targets.map((target) => [target.info.width, target.info.height]),
        cameraTargets: cameras.map((camera) =>
            referenceId(targets.find((target) => target.renderTexture === camera.targetTexture)),
        ),
    });
    const old = targets[1];
    let oldDisposeEvents = 0;
    const oldTexture = old.renderTexture;
    const oldWasValid = oldTexture.isValid;
    old.dispose();
    // Record an observed native validity transition, not an assumed disposal count.
    const replacement = cc.createAirRenderTarget({
        width: 128,
        height: 64,
        colorFormat: 'rgba8',
        depthFormat: 'depth24-stencil8',
        samples: 1,
    });
    targets[1] = replacement;
    replacement.attachCamera(cameras[1]);
    await frame(1);
    check(
        'same-size-destroy-recreate',
        replacement.renderTexture !== old.renderTexture && pixel(replacement, 64)[2] > 250,
        replacement.info,
    );
    if (oldWasValid && !oldTexture.isValid) oldDisposeEvents++;
    pairedRaw.targets.push({
        id: 'recreate-B',
        newId: referenceId(replacement),
        oldDisposeEvents,
        oldTextureWasValid: oldWasValid,
        oldTextureIsValid: oldTexture.isValid,
        pixels: pixel(replacement, 64),
    });
    // Present the scene to the default target for an independent compositor capture.
    cameras[0].targetTexture = null;
    cameras[0].clearColor = new cc.Color(30, 50, 80, 255);
    objects[0].node.active = true;
    await frame(0);
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
        status: checks.every((row) => row.pass) ? 'PASS' : 'FAIL',
        checks,
        pairedRaw,
        dpr: window.devicePixelRatio,
        canvas: [app.canvas.width, app.canvas.height],
        backend: 'webgl2',
        renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
        version: gl.getParameter(gl.VERSION),
        targets: targets.map((target) => target.info),
        glError: gl.getError(),
        transmissionPixels: 'NOT_RUN: separate capture fixture required',
    };
}
window.__upstreamState = {
    ready: true,
    run,
    async close() {
        clock.end();
        const released = await app.releaseScene();
        const closed = await app.close();
        return { released, closed };
    },
};
