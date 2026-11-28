import * as m from '/build/cocosair.module.js';

const args = new URL(location.href).searchParams;
const mode = args.get('mode');
const transparent = args.get('transparent') === '1';
if (!['plain-off', 'plain-taa', 'fence-off', 'fence-taa', 'fence-zero', 'fence-current', 'fence-union'].includes(mode))
    throw new Error('Invalid motion track');
const response = await fetch('/vendor/builtin-source/generated/custom-effects.json');
if (!response.ok) throw new Error('Missing custom effects');
const effects = await response.json();
if (args.get('stock') === '1') {
    // Keep the exact stock fragment but identify it as a test replacement, not AIR's built-in variant.
    const stock = effects.find(({ name }) => name === 'pipeline/post-process/taa').shaders[0];
    stock.hash ^= 0x40000000;
}
m.settings.overrideSettings('rendering', 'customPipeline', true);
m.settings.overrideSettings('rendering', 'effectSettingsPath', '/vendor/builtin-source/generated/custom-layout.bin');
m.macro.CUSTOM_PIPELINE_NAME = 'Custom';
const register = () => {
    for (const data of effects) Object.assign(new m.EffectAsset(), data).onLoaded();
};
m.game.onPreProjectInitDelegate.add(register);
let app;
try {
    app = await m.createAirApp({ canvas: '#GameCanvas', renderer: 'webgl2', pixelRatioCap: 1 });
} finally {
    m.game.onPreProjectInitDelegate.remove(register);
}
if (!m.director.root.usesCustomPipeline) throw new Error('Native Custom pipeline did not initialize');
const builder = m.rendering.getCustomPipeline('Custom');
const scene = new m.Scene('Native two-frame motion');
const width = 160;
const height = 96;
const node = new m.Node('Fixed orthographic camera');
scene.addChild(node);
node.setPosition(0, 0, 5);
node.lookAt(m.Vec3.ZERO);
const camera = node.addComponent(m.Camera);
camera.projection = m.Camera.ProjectionType.ORTHO;
camera.orthoHeight = height / 2;
camera.clearFlags = m.Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new m.Color(0, 0, 0, 255);
const target = new m.RenderTexture();
target.reset({ width, height });
camera.targetTexture = target;
camera.usePostProcess = true;
const pp = node.addComponent(m.postProcess.PostProcess);
pp.global = false;
camera.postProcess = pp;
const taa = node.addComponent(m.postProcess.TAA);
taa.enabled = !mode.endsWith('-off');
taa.sampleScale = args.get('jitter') === '1' ? 1 : 0;
taa.isolateTransparentHistory = args.get('isolate') === '1';
taa.feedback = mode === 'fence-zero' ? 0 : 0.9;
const mesh = m.utils.createMesh(m.primitives.box());
function rect(name, x, y, z, w, h, tone, alpha = 255) {
    const node = new m.Node(name);
    scene.addChild(node);
    node.setPosition(x, y, z);
    node.setScale(w, h, 0.05);
    const model = node.addComponent(m.MeshRenderer);
    model.mesh = mesh;
    const mat = new m.Material();
    mat.initialize({ effectName: 'builtin-unlit', technique: alpha === 255 ? 0 : 1 });
    mat.setProperty('mainColor', new m.Color(tone, tone, tone, alpha));
    model.setMaterial(mat, 0);
    return node;
}
if (!transparent) rect('Black opaque reference', 0, 0, -1, width, height, 0);
else {
    // Adjacent, non-overlapping tiles in the same opaque depth plane.
    rect('Left black tile', -42.5, 0, -1, 75, height, 0);
    rect('Right black tile', 38, 0, -1, 84, height, 0);
    rect('Same-depth bright stripe', -4.5, 0, -1, 1, height, 236);
}
const mover = rect('Moving bright piece', -7, 0, 0, 4, 20, 236, transparent ? 128 : 255);
if (!transparent && mode.startsWith('fence')) rect('Stationary fence', -4.5, 0, 0, 1, 24, 236);
mover.active = args.get('opaqueOnly') !== '1';
const masked = ['fence-current', 'fence-union'].includes(mode);
let maskTexture;
if (masked) {
    const mask = node.addComponent(m.js.getClassByName('TAAMask'));
    maskTexture = new m.Texture2D();
    maskTexture.reset({ width, height, format: m.Texture2D.PixelFormat.RGBA8888 });
    maskTexture.setFilters(m.Texture2D.Filter.NEAREST, m.Texture2D.Filter.NEAREST);
    // Fixture-owned exact-pixel mask, not the production mask camera path.
    mask.start = () => {};
    Object.defineProperty(mask, 'mask', { get: () => maskTexture });
}
function setMask(frame) {
    if (!masked) return;
    const bytes = new Uint8Array(width * height * 4);
    const mark = (lo, hi) => {
        for (let y = 38; y < 58; y++) for (let x = lo; x < hi; x++) bytes[(y * width + x) * 4] = 255;
    };
    mark(71 + 8 * frame, 75 + 8 * frame);
    if (mode === 'fence-union' && frame === 1) mark(71, 75);
    maskTexture.uploadData(bytes);
}
const uploads = new WeakMap();
const setProperty = m.Material.prototype.setProperty;
m.Material.prototype.setProperty = function (name, value, ...rest) {
    if (name === 'taaParams1') uploads.set(this, [value.x, value.y, value.z]);
    return setProperty.call(this, name, value, ...rest);
};

const stable =
    args.get('stable') === '1'
        ? rect('Stable depth animated color', 30, 24, -0.5, 24, 12, 236)
              .getComponent(m.MeshRenderer)
              .getMaterialInstance(0)
        : null;
if (stable) rect('Same-depth bright reference', 42.5, 24, -0.5, 1, 12, 236);
const cut = args.get('cut') === '1';
const resize = args.get('resize') === '1';

let active;
const original = builder.renderCamera;
builder.renderCamera = function (targetCamera, pipeline) {
    if (targetCamera !== camera.camera) return original.call(this, targetCamera, pipeline);
    const pipelineAdd = pipeline.addRenderPass;
    const ownAdd = Object.hasOwn(pipeline, 'addRenderPass');
    const undo = [];
    const install = (obj, key, make) => {
        const own = Object.hasOwn(obj, key);
        const old = obj[key];
        undo.push(() => {
            if (own) obj[key] = old;
            else delete obj[key];
        });
        obj[key] = make(old);
    };
    pipeline.addRenderPass = function (w, h, layout, ...args) {
        const job = pipelineAdd.call(this, w, h, layout, ...args);
        if (!active || !layout.startsWith('DeferredTAA')) return job;
        const record = { layout, width: w, height: h, inputs: {} };
        active.push(record);
        install(
            job,
            'addTexture',
            (old) =>
                function (resource, binding, ...args) {
                    record.inputs[binding] = resource;
                    return old.call(this, resource, binding, ...args);
                },
        );
        install(
            job,
            'addRenderTarget',
            (old) =>
                function (resource, ...args) {
                    record.output = resource;
                    return old.call(this, resource, ...args);
                },
        );
        install(
            job,
            'addQueue',
            (old) =>
                function (...args) {
                    const queue = old.apply(this, args);
                    install(
                        queue,
                        'addCameraQuad',
                        (old) =>
                            function (owner, material, ...args) {
                                record.params = uploads.get(material);
                                record.composite = job.name.startsWith('CameraTAAComposite');
                                record.snapshot = job.name.startsWith('CameraTAASnapshot');
                                return old.call(this, owner, material, ...args);
                            },
                    );
                    return queue;
                },
        );
        return job;
    };
    try {
        return original.call(this, targetCamera, pipeline);
    } finally {
        while (undo.length) undo.pop()();
        if (ownAdd) pipeline.addRenderPass = pipelineAdd;
        else delete pipeline.addRenderPass;
    }
};
const clock = m.createStepClock({ stepTimeoutMs: 5000 });
app.run(scene);
clock.begin();
window.__probe = async () => {
    const records = [];
    try {
        for (let i = 0; i < (resize ? 3 : 2); i++) {
            const resized = resize && i === 2;
            const readWidth = resized ? 192 : width;
            const readHeight = resized ? 112 : height;
            if (resized) {
                target.resize(readWidth, readHeight);
                camera.orthoHeight = readHeight / 2;
            }
            mover.setPosition(-7 + Math.min(i, 1) * 8, 0, 0);
            setMask(i);
            if (stable && i === 1) stable.setProperty('mainColor', new m.Color(116, 116, 116, 255));
            if (cut && i === 1) taa.resetHistory();
            active = [];
            const frame = await clock.step();
            const rgba = target.readPixels();
            if (rgba?.length !== readWidth * readHeight * 4) throw new Error('Wrong motion readback size');
            const scan = Array.from({ length: 17 }, (_, n) => {
                const x = (readWidth - width) / 2 + 69 + n;
                const offset = ((readHeight / 2) * readWidth + x) * 4;
                return Array.from(rgba.subarray(offset, offset + 4));
            });
            const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', rgba));
            const rgbaSha256 = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
            const stableScan = Array.from(
                { length: 5 },
                (_, j) => rgba[((readHeight / 2 + 24) * readWidth + (readWidth - width) / 2 + 119 + j) * 4],
            );
            records.push({
                frame,
                draws: active,
                worldX: mover.position.x,
                scan,
                rgbaSha256,
                stableScan,
                extent: [readWidth, readHeight],
            });
        }
        const gl = document.getElementById('GameCanvas').getContext('webgl2');
        return {
            mode,
            records,
            scanFromX: 69,
            scanY: 48,
            extent: [width, height],
            webgl2: !!gl,
            seedUsesZeroFeedback: typeof taa.resetHistory === 'function',
            rgba16f: !!gl?.getExtension('EXT_color_buffer_float'),
        };
    } finally {
        active = undefined;
        builder.renderCamera = original;
        m.Material.prototype.setProperty = setProperty;
        clock.end();
    }
};
