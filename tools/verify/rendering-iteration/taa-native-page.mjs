import * as m from '/build/cocosair.module.js';
const mode = new URL(location.href).searchParams.get('mode') || 'both';
if (!['off', 'single', 'both'].includes(mode)) throw new Error('Invalid TAA probe mode');
const response = await fetch('/vendor/builtin-source/generated/custom-effects.json');
if (!response.ok) throw new Error('Could not load the frozen custom effects');
const effects = await response.json();
m.settings.overrideSettings('rendering', 'customPipeline', true);
m.settings.overrideSettings('rendering', 'effectSettingsPath', '/vendor/builtin-source/generated/custom-layout.bin');
m.macro.CUSTOM_PIPELINE_NAME = 'Custom';
const reg = () => {
    for (const data of effects) Object.assign(new m.EffectAsset(), data).onLoaded();
};
m.game.onPreProjectInitDelegate.add(reg);
let app;
try {
    app = await m.createAirApp({ canvas: '#GameCanvas', renderer: 'webgl2', pixelRatioCap: 1 });
} finally {
    m.game.onPreProjectInitDelegate.remove(reg);
}
if (!m.director.root.usesCustomPipeline) throw new Error('Native custom pipeline did not initialize');
const builder = m.rendering.getCustomPipeline('Custom');
const scene = new m.Scene('TAA two cameras');
const tags = new Map();
const mesh = m.utils.createMesh(m.primitives.box());
function lane(name, priority, layer, width, height, tone) {
    const node = new m.Node(name);
    scene.addChild(node);
    node.setPosition(0, 0, 5);
    node.lookAt(m.Vec3.ZERO);
    const camera = node.addComponent(m.Camera);
    camera.priority = priority;
    camera.fov = priority ? 58 : 42;
    camera.visibility = layer;
    camera.clearColor = new m.Color(13, 19, 31, 255);
    const target = new m.RenderTexture();
    target.reset({ width, height });
    camera.targetTexture = target;
    camera.usePostProcess = true;
    const pp = node.addComponent(m.postProcess.PostProcess);
    pp.global = false;
    camera.postProcess = pp;
    const taa = node.addComponent(m.postProcess.TAA);
    taa.enabled = mode === 'both' || (mode === 'single' && name === 'A');
    taa.feedback = priority ? 0.75 : 0.95;
    const object = new m.Node('Color and edges ' + name);
    scene.addChild(object);
    object.layer = layer;
    object.setRotationFromEuler(13, 25, 6);
    const model = object.addComponent(m.MeshRenderer);
    model.mesh = mesh;
    const material = new m.Material();
    material.initialize({ effectName: 'builtin-unlit' });
    material.setProperty('mainColor', new m.Color(...tone, 255));
    model.setMaterial(material, 0);
    // Color patch is intentionally separated by camera visibility, not just by clear color.
    return { camera, node, target, object };
}
const A = lane('A', 0, 1, 160, 96, [240, 42, 31]);
const B = lane('B', 1, 2, 176, 100, [32, 240, 60]);
const draw = [];
const matrix = (m4) => {
    const values = [];
    m.Mat4.toArray(values, m4);
    return values;
};
const uploads = new WeakMap();
const setProperty = m.Material.prototype.setProperty;
m.Material.prototype.setProperty = function (name, value, ...args) {
    if (name === 'taaParams1' || name === 'taaPrevViewProj') {
        const state = uploads.get(this) ?? {};
        if (name === 'taaParams1') state.params = [value.x, value.y, value.z];
        else state.previous = matrix(value);
        uploads.set(this, state);
    }
    return setProperty.call(this, name, value, ...args);
};
const snapshot = (material) => structuredClone(uploads.get(material));
const originalRender = builder.renderCamera;
builder.renderCamera = function (camera, pipeline) {
    const name = tags.get(camera);
    if (!name) return originalRender.call(this, camera, pipeline);
    const undo = [];
    const install = (obj, key, patch) => {
        const own = Object.hasOwn(obj, key);
        const original = obj[key];
        obj[key] = patch(original);
        undo.push(() => {
            if (own) obj[key] = original;
            else delete obj[key];
        });
    };
    const add = pipeline.addRenderPass;
    const ownAdd = Object.hasOwn(pipeline, 'addRenderPass');
    pipeline.addRenderPass = function (width, height, layout, ...args) {
        const pass = add.call(this, width, height, layout, ...args);
        if (!layout.startsWith('DeferredTAA')) return pass;
        const record = { name, layout, width, height, inputs: {}, beforeProj: matrix(camera.matProj), atQueue: null };
        draw.push(record);
        install(
            pass,
            'addTexture',
            (original) =>
                function (resource, sampler, ...rest) {
                    record.inputs[sampler] = resource;
                    return original.call(this, resource, sampler, ...rest);
                },
        );
        install(
            pass,
            'addRenderTarget',
            (original) =>
                function (resource, ...rest) {
                    record.output = resource;
                    return original.call(this, resource, ...rest);
                },
        );
        install(
            pass,
            'addQueue',
            (original) =>
                function (...params) {
                    const queue = original.apply(this, params);
                    install(
                        queue,
                        'addCameraQuad',
                        (original) =>
                            function (drawCamera, material, ...rest) {
                                record.material = material;
                                record.atQueue = snapshot(material);
                                record.current = matrix(camera.matViewProj);
                                return original.call(this, drawCamera, material, ...rest);
                            },
                    );
                    return queue;
                },
        );
        return pass;
    };
    try {
        return originalRender.call(this, camera, pipeline);
    } finally {
        while (undo.length) undo.pop()();
        if (ownAdd) pipeline.addRenderPass = add;
        else delete pipeline.addRenderPass;
    }
};
async function pixels(target) {
    const { width, height } = target;
    const raw = target.readPixels();
    if (!raw || raw.length !== width * height * 4) throw new Error('Invalid offscreen readback');
    const center = ((height >> 1) * width + (width >> 1)) * 4;
    const digest = await crypto.subtle.digest('SHA-256', raw);
    return {
        width,
        height,
        center: Array.from(raw.slice(center, center + 4)),
        sha256: Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(''),
    };
}
const clock = m.createStepClock({ stepTimeoutMs: 5000 });
app.run(scene);
clock.begin();
tags.set(A.camera.camera, 'A');
tags.set(B.camera.camera, 'B');
window.__probe = async () => {
    const records = [];
    try {
        for (let i = 0; i < 5; i++) {
            draw.length = 0;
            A.node.setPosition(i >= 3 ? 1.4 : i * 0.07, 0, 5);
            B.node.setPosition(-i * 0.09, 0, 5);
            if (i === 4) A.target.resize(192, 112);
            const frame = await clock.step();
            const expected = { both: 2, single: 1, off: 0 }[mode];
            if (draw.length !== expected) throw new Error('Wrong native TAA draw count: ' + draw.length);
            const read = async (target) => {
                try {
                    return await pixels(target);
                } catch (e) {
                    return { error: e.message };
                }
            };
            const captures = draw.map(({ material, ...item }) => ({ ...item, afterFrame: snapshot(material) }));
            records.push({
                frame,
                captures,
                alias: draw.length === 2 && draw[0].material === draw[1].material,
                pixels: { A: await read(A.target), B: await read(B.target) },
            });
        }
        const gl = document.getElementById('GameCanvas').getContext('webgl2');
        return { mode, records, webgl2: !!gl, rgba16f: !!gl?.getExtension('EXT_color_buffer_float') };
    } finally {
        builder.renderCamera = originalRender;
        m.Material.prototype.setProperty = setProperty;
        clock.end();
    }
};
