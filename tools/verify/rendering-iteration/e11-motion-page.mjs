import * as m from '/build/cocosair.module.js';
import { glassEffectDefinition, patternEffectDefinition } from '/glass-effects.mjs';

const canvas = document.querySelector('canvas');
const fixed = new URL(location.href).searchParams.has('fixed');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const host = document.querySelector('#E11Host');
const app = await m.createAirApp({
    canvas,
    renderer: 'webgl2',
    pixelRatioCap: 2,
    screenMode: 'container',
    container: host,
});
const initial = m.screen.windowSize;
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
const hudCamera = camera(m.Layers.Enum.UI_2D, 2);
hudCamera.clearFlags = m.Camera.ClearFlag.DEPTH_ONLY;
const hud = new m.Node('E11 HUD');
hud.layer = m.Layers.Enum.UI_2D;
hud.addComponent(m.RenderRoot2D);
scene.addChild(hud);

const hudSwatch = document.createElement('canvas');
hudSwatch.width = hudSwatch.height = 8;
const swatchContext = hudSwatch.getContext('2d');
swatchContext.fillStyle = '#ff4dd2';
swatchContext.fillRect(0, 0, 8, 8);
const swatchImage = new m.ImageAsset(hudSwatch);
const swatchTexture = new m.Texture2D();
swatchImage.addRef();
swatchTexture.addRef();
swatchTexture.image = swatchImage;
const badge = m.createAirTextureSprite(hud, swatchTexture, {
    name: 'E11 opacity badge',
    size: [0.38, 0.15],
    position: [-0.82, 0.719],
});
const opacity = badge.node.addComponent(m.UIOpacity);
const target = m.createAirRenderTarget({
    name: 'E11-motion-background',
    width: initial.width,
    height: initial.height,
    colorFormat: 'rgba8',
    depthFormat: 'none',
    samples: 1,
    filter: 'linear',
    sampleFallback: 'error',
});
const detach = target.attachCamera(sourceCamera);

function makeMaterial(definition, glass) {
    const effect = Object.assign(new m.EffectAsset(), JSON.parse(JSON.stringify(definition)));
    if (glass) {
        // E09 renders clip-space quads; a Node transform alone cannot move the visible SDF.
        // Keep the fullscreen producer/consumer and center only the E11 lens on the motion pose.
        for (const variant of ['glsl3', 'glsl4']) {
            const shader = effect.shaders[0][variant];
            const domain = 'vec2 d = (v_uv - vec2(0.5)) * vec2(aspect, 1.0);';
            const sample = 'vec2 lensUV = vec2(0.5) + (v_uv - vec2(0.5)) / glass1.z + offset;';
            if (shader.frag.split(domain).length !== 2 || shader.frag.split(sample).length !== 2)
                throw new Error('E11 glass source anchors changed');
            shader.frag = shader.frag
                .replace(
                    domain,
                    'vec2 lensCenter = vec2(0.5) + glass5.zw; vec2 d = (v_uv - lensCenter) * vec2(aspect, 1.0);',
                )
                .replace(sample, 'vec2 lensUV = lensCenter + (v_uv - lensCenter) / glass1.z + offset;');
        }
    }
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
quad('source pattern', pattern.material, sourceLayer, 0, initial.width / initial.height, 1);
quad('visible pattern', pattern.material, mainLayer, 0, initial.width / initial.height, 1);
const glass = makeMaterial(glassEffectDefinition, true);
const lens = quad('interactive glass', glass.material, mainLayer, 0.1, initial.width / initial.height, 1);
const node = lens.node;
const parent = glass.material;
function initialize(mat) {
    const params = [
        [1, 0, 0.3, 0.4],
        [1.9, 0.8, 1.12, 0.4],
        [45, 0.26, 0.55, 0.4],
        [0.4, 0.15, 0, 1],
        [0.18, 0.6, 0.72, 0],
        [initial.width, initial.height, 0, 0],
    ];
    params.forEach((args, i) => mat.setProperty('glass' + i, new m.Vec4(...args)));
}
initialize(parent);
const material = lens.getMaterialInstance(0);
initialize(material);
const unbind = target.bindColor(material, 'childTexture');
let surface = [initial.width, initial.height];
const lensLayout = new m.Vec4(initial.width, initial.height, 0, 0);
function syncLens() {
    const [w, h] = surface;
    const { x, y } = node.position;
    const u = (x * h) / (2 * w);
    const v = y / 2;
    if (lensLayout.x === w && lensLayout.y === h && lensLayout.z === u && lensLayout.w === v) return;
    lensLayout.set(w, h, u, v);
    material.setProperty('glass5', lensLayout);
}
function syncSize() {
    // PAL container mode has already applied the device DPR to windowSize.
    const { width, height } = m.screen.windowSize;
    if (width < 1 || height < 1) return;
    target.resize(width, height);
    const info = target.info;
    surface = [info.width, info.height];
    syncLens();
}
function detachSizing() {
    m.screen.off('window-resize', syncSize);
    m.director.off(m.Director.EVENT_BEFORE_DRAW, syncLens);
}
m.screen.on('window-resize', syncSize);
m.director.on(m.Director.EVENT_BEFORE_DRAW, syncLens);
app.session.own(detachSizing, 'E11-resize');
syncSize();
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
            // One gesture keeps its starting scale even if the container changes size.
            height: canvas.getBoundingClientRect().height,
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
        const height = drag.height;
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
function resizeState() {
    const info = target.info;
    const shaderSize = material.getProperty('glass5', 0);
    const gfx = target.texture.getGFXTexture();
    return {
        buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
        target: [info.width, info.height],
        attachment: [gfx.width, gfx.height],
        shader: [shaderSize.x, shaderSize.y],
        generation: info.generation,
        attached: sourceCamera.targetTexture === target.renderTexture,
        bound: material.getProperty('childTexture', 0) === target.texture,
        shaderCenter: [shaderSize.z, shaderSize.w],
    };
}
const badgeTimeline = m.createAirMotionTimeline([{ channel: 'alpha', to: 0, duration: 1 }], channels);
function region(pixels, x, y) {
    if (x < 3 || y < 3 || x + 3 >= gl.drawingBufferWidth || y + 3 >= gl.drawingBufferHeight) {
        throw new Error('E11 readback region outside the backing buffer');
    }
    const output = [];
    for (let row = y - 3; row <= y + 3; row++) {
        const start = 4 * (row * gl.drawingBufferWidth + x - 3);
        output.push(...pixels.subarray(start, start + 7 * 4));
    }
    return output;
}
let comparisonPixels;
async function draw(dt, compare) {
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
    let difference;
    if (compare === 'remember') comparisonPixels = pixels;
    if (compare === 'compare') {
        if (comparisonPixels?.length !== pixels.length) throw new Error('Missing matching E11 control frame');
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;
        let minX = width,
            minY = height,
            maxX = -1,
            maxY = -1,
            count = 0;
        for (let i = 0; i < pixels.length; i += 4) {
            if (
                Math.abs(pixels[i] - comparisonPixels[i]) +
                    Math.abs(pixels[i + 1] - comparisonPixels[i + 1]) +
                    Math.abs(pixels[i + 2] - comparisonPixels[i + 2]) <=
                6
            )
                continue;
            const x = (i / 4) % width,
                y = Math.floor(i / 4 / width);
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            count++;
        }
        difference = { count, bounds: [minX, minY, maxX, maxY] };
        comparisonPixels = undefined;
    }
    const sha = await crypto.subtle.digest('SHA-256', pixels);
    return {
        state: timeline?.disposed ? null : state(),
        extent: [gl.drawingBufferWidth, gl.drawingBufferHeight],
        badge: region(
            pixels,
            Math.round(gl.drawingBufferWidth / 2 - (0.82 * gl.drawingBufferHeight) / 2),
            Math.round(((1 + 0.719) * gl.drawingBufferHeight) / 2),
        ),
        lens: region(pixels, Math.round(gl.drawingBufferWidth / 2), Math.round(gl.drawingBufferHeight / 2)),
        difference,
        edge: region(pixels, 5, Math.round(gl.drawingBufferHeight / 2)),
        sha: Array.from(new Uint8Array(sha), (byte) => byte.toString(16).padStart(2, '0')).join(''),
    };
}
if (fixed)
    window.e11 = {
        state,
        draw,
        resizeState,
        continuity: () => lastContinuity,
        seek: (t) => {
            timeline.pause();
            timeline.seek(t);
        },
        refraction: (value) => channels.refraction.write(value),
        seekBadge: (seconds) => badgeTimeline.seek(seconds),
        hideBadge: (hidden) => {
            badge.node.active = !hidden;
        },
        revert: () => timeline.revert(),
        renderer: () => gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL),
        async exit() {
            badgeTimeline.dispose();
            badge.dispose();
            swatchTexture.decRef();
            swatchImage.decRef();
            detachSizing();
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
