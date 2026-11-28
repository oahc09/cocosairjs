import * as m from '/build/cocosair.module.js';
import { glassEffectDefinition, patternEffectDefinition } from '/glass-effects.mjs';

const canvas = document.querySelector('canvas');
const fixed = new URL(location.href).searchParams.has('fixed');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const app = await m.createAirApp({ canvas, renderer: 'webgl2', pixelRatioCap: 1 });
const scene = new m.Scene('E11 liquid glass motion proof');
const mainLayer = 1 << 20;
const sourceLayer = 1 << 21;
const mesh = m.utils.createMesh(
    {
        positions: [-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0],
        uvs: [0, 0, 1, 0, 0, 1, 1, 1],
        indices: [0, 1, 2, 1, 3, 2],
    },
    undefined,
    { calculateBounds: true },
);
mesh.addRef();

function camera(layer, priority) {
    const node = new m.Node('camera');
    scene.addChild(node);
    node.setPosition(0, 0, 4);
    const result = node.addComponent(m.Camera);
    result.projection = m.Camera.ProjectionType.ORTHO;
    result.orthoHeight = 1;
    result.near = 0.1;
    result.far = 10;
    result.priority = priority;
    result.visibility = layer;
    result.clearFlags = m.Camera.ClearFlag.SOLID_COLOR;
    result.clearColor = new m.Color(6, 13, 22, 255);
    return result;
}
const sourceCamera = camera(sourceLayer, 0);
camera(mainLayer, 1);
const target = m.createAirRenderTarget({
    name: 'E11-motion-background',
    width: 384,
    height: 256,
    colorFormat: 'rgba8',
    depthFormat: 'none',
    samples: 1,
    filter: 'linear',
    sampleFallback: 'error',
});
const detach = target.attachCamera(sourceCamera);

function makeMaterial(definition, glass) {
    const effect = Object.assign(new m.EffectAsset(), JSON.parse(JSON.stringify(definition)));
    effect.addRef();
    effect.onLoaded();
    const material = new m.Material();
    material.initialize({
        effectAsset: effect,
        defines: glass ? { SHAPE_BOX: true, USE_BLUR: true, USE_ABERRATION: true } : undefined,
        states: {
            rasterizerState: { cullMode: m.gfx.CullMode.NONE },
            depthStencilState: { depthTest: false, depthWrite: false },
            blendState: {
                targets: [
                    {
                        blend: glass,
                        blendSrc: m.gfx.BlendFactor.SRC_ALPHA,
                        blendDst: m.gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
                        blendSrcAlpha: m.gfx.BlendFactor.ONE,
                        blendDstAlpha: m.gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
                    },
                ],
            },
        },
    });
    material.addRef();
    return { material, effect };
}

function quad(name, material, layer, z, scaleX, scaleY) {
    const node = new m.Node(name);
    scene.addChild(node);
    node.layer = layer;
    node.setPosition(0, 0, z);
    node.setScale(scaleX, scaleY, 1);
    const renderer = node.addComponent(m.MeshRenderer);
    renderer.mesh = mesh;
    renderer.setSharedMaterial(material, 0);
    return renderer;
}
const pattern = makeMaterial(patternEffectDefinition, false);
pattern.material.setProperty('pattern0', new m.Vec4(0, 0, 0, 0));
quad('source pattern', pattern.material, sourceLayer, 0, 1.5, 1);
quad('visible pattern', pattern.material, mainLayer, 0, 1.5, 1);
const glass = makeMaterial(glassEffectDefinition, true);
const lens = quad('interactive glass', glass.material, mainLayer, 0.1, 1.5, 1);
const node = lens.node;
const opacity = node.addComponent(m.UIOpacity);
const parent = glass.material;
function initialize(mat) {
    const params = [
        [1, 0, 0.3, 0.4],
        [1.9, 0.8, 1.12, 0.4],
        [45, 0.26, 0.55, 0.4],
        [0.4, 0.15, 0, 1],
        [0.18, 0.6, 0.72, 0],
        [384, 256, 0, 0],
    ];
    params.forEach((args, i) => mat.setProperty('glass' + i, new m.Vec4(...args)));
}
initialize(parent);
const material = lens.getMaterialInstance(0);
initialize(material);
const unbind = target.bindColor(material, 'childTexture');
app.run(scene);

const driver = m.attachAirMotionDriver(scene, app.session);
const channels = {
    x: m.bindAirMotionNode(node, 'position.x'),
    y: m.bindAirMotionNode(node, 'position.y'),
    alpha: m.bindAirMotionOpacity(opacity),
    refraction: m.bindAirMotionUniform(material, 'glass0', { component: 'z' }),
};
let timeline;
let completions = 0;
let writes = 0;
let drag = null;
let lastContinuity;
const listeners = new AbortController();
const listen = { signal: listeners.signal };

function state() {
    return {
        x: channels.x.read(),
        y: channels.y.read(),
        alpha: channels.alpha.read(),
        refraction: channels.refraction.read(),
        shared: parent.getProperty('glass0', 0).z,
        time: timeline?.time ?? null,
        completions,
        writes,
        playing: timeline?.playing ?? false,
        disposed: timeline?.disposed ?? false,
    };
}

function rebound() {
    const previous = state();
    timeline = m.createAirMotionTimeline(
        [
            { label: 'release', at: 0 },
            {
                group: [
                    { channel: 'x', to: 0, duration: 0.65, ease: 'spring', at: 0 },
                    { channel: 'y', to: 0, duration: 0.65, ease: 'spring', at: 0 },
                ],
                at: { label: 'release' },
            },
            { channel: 'refraction', to: 0.3, duration: 0.55, ease: 'outCubic', at: 0 },
            { channel: 'alpha', to: 255, duration: 0.4, ease: 'smooth', at: { label: 'release' } },
        ],
        Object.fromEntries(
            Object.entries(channels).map(([name, channel]) => [
                name,
                {
                    ...channel,
                    write(value) {
                        channel.write(value);
                        writes++;
                    },
                },
            ]),
        ),
        {
            reducedMotion: reduced,
            onFinish: () => {
                completions++;
            },
        },
    );
    driver.setTimeline(timeline);
    timeline.play();
    const current = state();
    lastContinuity = [current.x - previous.x, current.y - previous.y, current.refraction - previous.refraction];
}
canvas.addEventListener(
    'pointerdown',
    (event) => {
        if (drag !== null || event.button !== 0) return;
        timeline?.pause();
        canvas.setPointerCapture(event.pointerId);
        drag = {
            id: event.pointerId,
            clientX: event.clientX,
            clientY: event.clientY,
            x: channels.x.read(),
            y: channels.y.read(),
        };
    },
    listen,
);
canvas.addEventListener(
    'pointermove',
    (event) => {
        if (!drag || drag.id !== event.pointerId) return;
        const height = canvas.getBoundingClientRect().height;
        const x = Math.max(-0.65, Math.min(0.65, drag.x + (2 * (event.clientX - drag.clientX)) / height));
        const y = Math.max(-0.38, Math.min(0.38, drag.y - (2 * (event.clientY - drag.clientY)) / height));
        channels.x.write(x);
        channels.y.write(y);
        channels.refraction.write(0.3 + Math.min(0.65, Math.hypot(x, y)));
        channels.alpha.write(220);
    },
    listen,
);
function release(event) {
    if (!drag || event.pointerId !== drag.id) return;
    drag = null;
    rebound();
}
canvas.addEventListener('pointerup', release, listen);
canvas.addEventListener('pointercancel', release, listen);
canvas.addEventListener('lostpointercapture', release, listen);
const slider = document.querySelector('input');
slider.addEventListener(
    'input',
    () => {
        timeline?.pause();
        timeline?.seek(Number(slider.value));
    },
    listen,
);
document.querySelector('button').addEventListener('click', () => rebound(), listen);
app.session.own(() => listeners.abort(), 'E11-input');

const clock = m.createStepClock();
if (fixed) clock.begin();
const gl = canvas.getContext('webgl2');
async function draw(dt) {
    let pixels;
    const read = () => {
        pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
        gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        if (gl.getError() !== 0) throw new Error('E11 readPixels failed');
    };
    m.director.once(m.Director.EVENT_AFTER_DRAW, read);
    try {
        await clock.step(dt);
    } finally {
        m.director.off(m.Director.EVENT_AFTER_DRAW, read);
    }
    if (!pixels) throw new Error('E11 canvas readback was absent');
    const sha = await crypto.subtle.digest('SHA-256', pixels);
    return {
        state: timeline?.disposed ? null : state(),
        sha: Array.from(new Uint8Array(sha), (byte) => byte.toString(16).padStart(2, '0')).join(''),
    };
}
if (fixed)
    window.e11 = {
        state,
        draw,
        continuity: () => lastContinuity,
        seek: (t) => {
            timeline.pause();
            timeline.seek(t);
        },
        refraction: (value) => channels.refraction.write(value),
        revert: () => timeline.revert(),
        renderer: () => gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL),
        async exit() {
            unbind();
            detach();
            target.dispose();
            mesh.decRef();
            parent.decRef();
            glass.effect.decRef();
            pattern.material.decRef();
            pattern.effect.decRef();
            const before = { completions, writes };
            clock.end();
            const receipt = await app.releaseScene();
            app.run(new m.Scene('E11 scene replacement'));
            clock.begin();
            await clock.step(0.5);
            timeline.advance(1);
            timeline.play();
            return {
                before,
                after: { completions, writes },
                disposed: timeline.disposed,
                receipt,
                scene: app.getScene().name,
            };
        },
    };
