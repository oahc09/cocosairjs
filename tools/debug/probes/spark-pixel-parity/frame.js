/**
 * SPK-13 pixel-parity harness — one deterministic page source executed in two documents of the SAME
 * browser engine, so the only variable under test is the rendering implementation:
 *
 *   mode=reference : real three.js + upstream @sparkjsdev/spark 2.3.1 (prebuilt bundles, served
 *                    read-only from the port repo). This is the oracle; nothing in this repo can
 *                    influence it.
 *   mode=target    : this repo's bundle driving the AIR Spark integration layer
 *                    (`cc.CocosSparkLayer` + `cc.CocosRenderer` + `cc.sparkRuntime`).
 *
 * Determinism contract (adapted from the port's `tests/frame.js` and `tests/native-layer.js`):
 *  - drawing buffer from the driver's `width`/`height`/`dpr` query (default 256x256 at pixel ratio 1),
 *    clear colour RGBA(0,0,0,0);
 *  - Spark runs with `enableLod:false`, `autoUpdate:false` and a stubbed timer, so every frame is an
 *    explicit accumulate + sort + render with zero wall-clock input;
 *  - neither document renders on a timer; each draw is preceded by the SAME explicit full-canvas clear
 *    (scissor test temporarily disabled) and then exactly one render with `autoClear:false`;
 *  - the reference document ADOPTS the target's native float32 camera/mesh world matrices, viewport and
 *    scissor. The claim under test is therefore the splat rasterisation/sort/blend path, not
 *    camera-matrix construction (that is SPK-04 math parity). The page still records the three-built
 *    camera matrices so the driver can report the construction delta as a diagnostic;
 *  - no `.spz`/`.ply` fixtures: every scene comes from procedural splat constructors or explicit
 *    seeded records, run through identical code on both sides.
 */
const parameters = new URLSearchParams(location.search);
const mode = window.__SPARK_PARITY_MODE || parameters.get('mode') || 'reference';
/**
 * Drawing-buffer geometry is CLI-overridable (`--width/--height/--dpr` on the driver) so the parity
 * sweep is not trapped in a single 1:1 / DPR-1 window: an aspect that never changes cannot expose a
 * viewport- or projection-shape bug. Both documents evaluate the SAME three expressions below, so
 * any asymmetry shows up as a loud dimension mismatch in the comparator rather than as a silent pass.
 */
const WIDTH = Number.parseInt(parameters.get('width') || '256', 10);
const HEIGHT = Number.parseInt(parameters.get('height') || '256', 10);
const DPR = Number.parseFloat(parameters.get('dpr') || '1');
if (
    !Number.isInteger(WIDTH) ||
    !Number.isInteger(HEIGHT) ||
    WIDTH < 64 ||
    HEIGHT < 64 ||
    WIDTH > 1024 ||
    HEIGHT > 1024
) {
    throw new Error(`unacceptable parity size ${WIDTH}x${HEIGHT}`);
}
if (
    ![1, 1.25, 1.375, 1.5, 2, 3].includes(DPR) ||
    !Number.isInteger(WIDTH * DPR) ||
    !Number.isInteger(HEIGHT * DPR) ||
    WIDTH * DPR > 1024 ||
    HEIGHT * DPR > 1024
) {
    throw new Error(`unacceptable parity devicePixelRatio ${DPR} for ${WIDTH}x${HEIGHT}`);
}
const PHYS_W = Math.round(WIDTH * DPR);
const PHYS_H = Math.round(HEIGHT * DPR);
const ADOPTED_KEYS = ['near', 'far', 'zoom', 'fov', 'aspect', 'left', 'right', 'top', 'bottom'];

window.__sparkParity = { mode, ready: false };
window.__errors = [];
window.__glErrors = [];
addEventListener('error', (event) => window.__errors.push(String(event.message || event)));
addEventListener('unhandledrejection', (event) => window.__errors.push(String(event.reason)));

const canvas = document.querySelector('canvas');
const status = document.getElementById('status');
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const say = (line) => {
    if (status) status.textContent = line;
};

let M; // three-shaped maths/renderer namespace for this document
let S; // Spark runtime (upstream bundle on the reference, vendored+generated on the target)
let cc; // engine namespace, target document only
let app;
let layer;
let nativeScene;
let cameraNode;
let nativeCamera;
let renderer;
let spark;
let scene;
let camera;
let poseCamera; // reference only: three's own camera for the same spec, recorded as a diagnostic
let meshes = [];
let nodes = [];
let specTime = 0;

function drainGl() {
    const gl = renderer.getContext();
    for (let index = 0; index < 32; index++) {
        const error = gl.getError();
        if (error === gl.NO_ERROR) break;
        window.__glErrors.push(error);
    }
    return window.__glErrors.slice();
}

/** xorshift32 so the random-splat scene is built by identical arithmetic in both documents. */
function randomRecords(count, seed) {
    let state = seed;
    const rand = () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return (state >>> 0) / 4294967296;
    };
    const records = [];
    for (let index = 0; index < count; index++) {
        let quaternion = [rand() - 0.5, rand() - 0.5, rand() - 0.5, rand() - 0.5];
        const length = Math.hypot(...quaternion);
        quaternion = quaternion.map((value) => value / length);
        records.push({
            p: [(rand() - 0.5) * 2, (rand() - 0.5) * 2, (rand() - 0.5) * 2],
            s: [0.005 + rand() * 0.13, 0.005 + rand() * 0.13, 0.005 + rand() * 0.13],
            c: [rand(), rand(), rand()],
            a: 0.05 + rand() * 0.94,
            q: quaternion,
        });
    }
    return records;
}

function addRecord(packed, record) {
    packed.pushSplat(
        new M.Vector3(...record.p),
        new M.Vector3(...record.s),
        new M.Quaternion(...(record.q || [0, 0, 0, 1])),
        record.a,
        new M.Color(...record.c),
    );
}

/**
 * Procedural splat construction. `constructGrid` only reads `extents.min/max`, so a plain object is
 * numerically identical to `new THREE.Box3(min,max)` and keeps both documents on the same code path.
 */
function fillPacked(item) {
    const packed = new S.PackedSplats();
    const records = item.records || (item.count ? randomRecords(item.count, item.seed) : null);
    if (records) for (const record of records) addRecord(packed, record);
    if (item.construct === 'grid') {
        S.constructGrid({
            splats: packed,
            extents: { min: new M.Vector3(-0.6, -0.6, -0.6), max: new M.Vector3(0.6, 0.6, 0.6) },
            stepSize: 0.3,
            pointRadius: 0.03,
        });
    }
    if (item.construct === 'axes') {
        S.constructAxes({ splats: packed, scale: 0.4, axisRadius: 0.035 });
    }
    if (item.construct === 'sphere') {
        S.constructSpherePoints({
            splats: packed,
            radius: 0.7,
            maxDepth: 2,
            pointRadius: 0.06,
            pointThickness: 0.003,
            color: new M.Color(0.3, 0.7, 1),
        });
    }
    return packed;
}

function makeNode(item, index) {
    const node = new cc.Node(`parity-splat-${index}`);
    nativeScene.addChild(node);
    if (item.position) node.setPosition(...item.position);
    if (item.rotation) node.setRotationFromEuler(...item.rotation);
    if (item.scale) node.setScale(...item.scale);
    nodes.push(node);
    return node;
}

/** `textSplats()` returns a finished SplatMesh, so bind it with the same public fields `add()` uses. */
function attachTextMesh(mesh, node) {
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    if (node) layer.bindings.set(mesh, { node, visible: true });
    return mesh;
}

function createMesh(item, node) {
    if (item.construct === 'text') {
        const mesh = S.textSplats({
            text: 'Spark\nCocos',
            font: 'Arial',
            fontSize: 20,
            textAlign: 'center',
            objectScale: 0.025,
            color: new M.Color(0.4, 0.8, 1),
        });
        return attachTextMesh(mesh, node);
    }
    const options = { packedSplats: fillPacked(item) };
    if (node) return layer.add({ node, ...options });
    const mesh = new S.SplatMesh(options);
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    return mesh;
}

function clearCanvas() {
    renderer.setRenderTarget(null);
    renderer.setClearColor(0, 0);
    const scissor = renderer.getScissorTest();
    renderer.setScissorTest(false);
    renderer.clear(true, true, true);
    renderer.setScissorTest(scissor);
    renderer.autoClear = false;
}

function refreshMatrices() {
    if (layer) layer.sync();
    else scene.updateMatrixWorld(true);
}

function renderOnce() {
    if (layer) layer.render();
    else renderer.render(scene, camera);
}

async function settle() {
    await Promise.all(meshes.map((mesh) => mesh.initialized));
    refreshMatrices();
    spark.renderSize.set(PHYS_W, PHYS_H);
    await spark.update({ scene, camera });
    for (let index = 0; index < 900; index++) {
        if (window.__errors.length) throw new Error('page error while sorting: ' + window.__errors.join('\n'));
        if (!spark.sorting && !spark.sortDirty) break;
        await frame();
    }
    clearCanvas();
    renderOnce();
    if (window.__errors.length) throw new Error('page error while rendering: ' + window.__errors.join('\n'));
}

function pixels() {
    const gl = renderer.getContext();
    const width = canvas.width;
    const height = canvas.height;
    const data = new Uint8Array(width * height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    // contextInfo() already reports width/height/errors/glErrors/activeSplats/numSplats.
    const out = contextInfo();
    out.data = Array.from(data);
    return out;
}

function contextInfo() {
    const gl = renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
        mode,
        width: canvas.width,
        height: canvas.height,
        renderer: gl.getParameter(gl.RENDERER),
        vendor: gl.getParameter(gl.VENDOR),
        version: gl.getParameter(gl.VERSION),
        unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
        unmaskedVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
        contextAttributes: gl.getContextAttributes(),
        drawingBufferColorSpace: gl.drawingBufferColorSpace || null,
        activeSplats: spark.geometry.instanceCount,
        numSplats: meshes.map((mesh) => mesh.numSplats),
        errors: window.__errors.slice(),
        glErrors: drainGl(),
    };
}

function matrices() {
    const out = {
        matrixWorld: camera.matrixWorld.toArray(),
        matrixWorldInverse: camera.matrixWorldInverse.toArray(),
        projectionMatrix: camera.projectionMatrix.toArray(),
        projectionMatrixInverse: camera.projectionMatrixInverse.toArray(),
        isPerspectiveCamera: !!camera.isPerspectiveCamera,
        isOrthographicCamera: !!camera.isOrthographicCamera,
    };
    for (const key of ADOPTED_KEYS) if (typeof camera[key] === 'number') out[key] = camera[key];
    return out;
}

function viewportRect() {
    // The target exposes its viewport as a plain record; three keeps it private behind getViewport().
    if (layer) {
        const view = renderer._viewport;
        return { x: view.x, y: view.y, width: view.width, height: view.height };
    }
    const view = renderer.getViewport(new M.Vector4());
    return { x: view.x, y: view.y, width: view.z, height: view.w };
}

function snapshot() {
    refreshMatrices();
    return {
        width: canvas.width,
        height: canvas.height,
        camera: matrices(),
        meshes: meshes.map((mesh) => mesh.matrixWorld.toArray()),
        viewport: viewportRect(),
        nativeView: layer ? cc.Mat4.toArray([], nativeCamera.camera.matView) : null,
        nativeProjection: layer ? cc.Mat4.toArray([], nativeCamera.camera.matProj) : null,
    };
}

function configureNativeCamera(spec) {
    const position = spec.camera || [0, 0, 3];
    cameraNode.setPosition(position[0], position[1], position[2]);
    cameraNode.setRotationFromEuler(...(spec.rotation || [0, 0, 0]));
    nativeCamera.projection = spec.orthographic ? cc.Camera.ProjectionType.ORTHO : cc.Camera.ProjectionType.PERSPECTIVE;
    nativeCamera.fov = spec.fov ?? 55;
    nativeCamera.orthoHeight = spec.orthoHeight ?? 1.5;
    nativeCamera.near = spec.near ?? 0.01;
    nativeCamera.far = spec.far ?? 100;
    const rect = spec.rect || [0, 0, 1, 1];
    nativeCamera.rect = new cc.Rect(rect[0], rect[1], rect[2], rect[3]);
}

function makeReferenceCamera() {
    const camera = new M.Camera();
    camera.matrixAutoUpdate = false;
    camera.matrixWorldAutoUpdate = false;
    return camera;
}

/** three's own camera for the same spec: recorded as a diagnostic, never used for the parity gate. */
function makePoseCamera(spec) {
    const near = spec.near ?? 0.01;
    const far = spec.far ?? 100;
    const height = spec.orthoHeight ?? 1.5;
    const poseCamera = spec.orthographic
        ? new M.OrthographicCamera(-height, height, height, -height, near, far)
        : new M.PerspectiveCamera(spec.fov ?? 55, 1, near, far);
    poseCamera.position.set(...(spec.camera || [0, 0, 3]));
    poseCamera.rotation.set(...(spec.rotation || [0, 0, 0]));
    poseCamera.updateMatrixWorld(true);
    poseCamera.updateProjectionMatrix();
    return poseCamera;
}

function clearMeshes() {
    if (layer) {
        for (const mesh of meshes) layer.remove(mesh);
        for (const node of nodes) node.destroy();
    } else {
        for (const mesh of meshes) {
            scene.remove(mesh);
            mesh.dispose();
        }
    }
    meshes = [];
    nodes = [];
}

async function setup(spec) {
    window.__errors = [];
    window.__glErrors = [];
    specTime = spec.time || 0;
    clearMeshes();
    if (layer) {
        configureNativeCamera(spec);
        layer.sync();
    } else {
        camera = makeReferenceCamera();
        poseCamera = makePoseCamera(spec);
    }
    const items = spec.objects || [{ records: [] }];
    for (let index = 0; index < items.length; index++) {
        const node = layer ? makeNode(items[index], index) : null;
        meshes.push(createMesh(items[index], node));
    }
    if (layer) layer.sync();
    await Promise.all(meshes.map((mesh) => mesh.initialized));
    return info();
}

/** Reference side: take the target's native matrices/viewport so only the render path is compared. */
function adopt(ref) {
    if (layer) throw new Error('adopt is reference-only');
    camera.matrix.fromArray(ref.camera.matrixWorld);
    camera.matrixWorld.fromArray(ref.camera.matrixWorld);
    camera.matrixWorldInverse.fromArray(ref.camera.matrixWorldInverse);
    camera.projectionMatrix.fromArray(ref.camera.projectionMatrix);
    camera.projectionMatrixInverse.fromArray(ref.camera.projectionMatrixInverse);
    for (const key of ADOPTED_KEYS) {
        if (typeof ref.camera[key] === 'number') camera[key] = ref.camera[key];
    }
    camera.isPerspectiveCamera = ref.camera.isPerspectiveCamera;
    camera.isOrthographicCamera = ref.camera.isOrthographicCamera;
    ref.meshes.forEach((elements, index) => {
        meshes[index].matrix.fromArray(elements);
        meshes[index].matrixWorld.fromArray(elements);
    });
    const view = ref.viewport;
    // Unit seam: the target reports its viewport in DEVICE pixels (native gfx), while three's
    // setViewport/setScissor take CSS pixels and internally multiply by the renderer pixel ratio
    // (`three-reference.js:15570` and `:17621-17622`). At devicePixelRatio 1 the two agree, so only a
    // DPR>1 sweep exposes it: without this division the reference renders its viewport DPR× too large
    // (a 2x zoom) and every channel below the splat silhouette differs.
    renderer.setViewport(view.x / DPR, view.y / DPR, view.width / DPR, view.height / DPR);
    renderer.setScissor(view.x / DPR, view.y / DPR, view.width / DPR, view.height / DPR);
    renderer.setScissorTest(true);
    return { ok: true, camera: matrices(), viewport: viewportRect() };
}

/**
 * Target-only evidence that the pixels really came out of the engine's own gfx device (no private
 * WebGL context, no fallback renderer): the AIR layer must share the native device, its GL context,
 * the native RenderPipeline and the app main window.
 */
function nativeIdentity() {
    if (!layer) return null;
    const device = cc.director.root.device;
    return {
        rendererClassName: renderer.constructor.name,
        layerClassName: layer.constructor.name,
        cameraComponentClassName: nativeCamera.constructor.name,
        rendererDeviceIsNativeGfxDevice: renderer.device === device,
        webglContextIsNativeDeviceGl: renderer.getContext() === device.gl,
        nativePipelineIsRenderPipeline: cc.director.root.pipeline instanceof cc.RenderPipeline,
        cameraWindowIsAppMainWindow: nativeCamera.camera.window === cc.director.root.mainWindow,
        layerOwnsApp: layer.renderer.ownsApp,
    };
}

function info() {
    const out = contextInfo();
    out.constructed = poseCamera
        ? {
              projectionMatrix: poseCamera.projectionMatrix.toArray(),
              matrixWorldInverse: poseCamera.matrixWorldInverse.toArray(),
          }
        : null;
    out.matrices = layer ? matrices() : null;
    out.nativeIdentity = nativeIdentity();
    return out;
}

function perturbTargetCamera(delta) {
    if (!layer) throw new Error('perturbTargetCamera is target-only');
    const position = cameraNode.position;
    cameraNode.setPosition(position.x + delta, position.y, position.z);
    layer.sync();
    return snapshot();
}

async function boot() {
    if (mode === 'reference') {
        M = await import('/dist/three-reference.js');
        S = await import('/dist/spark-reference.js');
        renderer = new M.WebGLRenderer({
            canvas,
            alpha: true,
            stencil: true,
            antialias: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: true,
        });
        renderer.setPixelRatio(DPR);
        renderer.setSize(WIDTH, HEIGHT, false);
        renderer.setClearColor(0, 0);
        renderer.autoClear = false;
        scene = new M.Scene();
        camera = makeReferenceCamera();
        spark = new S.SparkRenderer({
            renderer,
            enableLod: false,
            autoUpdate: false,
            timer: { update() {}, getElapsed: () => specTime, getDelta: () => 0 },
        });
        scene.add(spark);
    } else if (mode === 'target') {
        const sdk = window.__SPARK_PARITY_SDK || parameters.get('sdk') || '/build/cocosair.module.spark.js';
        if (!/^\/build\/[a-zA-Z0-9_.-]+\.js$/.test(sdk)) throw new Error('unapproved SDK path: ' + sdk);
        // The engine resolves its canvas at import time (same pre-registration CocosRenderer.create uses).
        globalThis.__CC_CANVAS__ = canvas;
        globalThis.__CCDPR_CAP__ = DPR;
        cc = await import(sdk);
        S = cc.sparkRuntime;
        // The adapter deliberately keeps its three-shaped maths off the flat export surface (SPK-05a),
        // so the constructors are taken from a Spark object instance instead.
        const probe = new S.SplatMesh();
        M = {
            Vector3: probe.position.constructor,
            Quaternion: probe.quaternion.constructor,
            Matrix4: probe.matrix.constructor,
            Color: probe.recolor.constructor,
        };
        cc.macro.ENABLE_WEBGL_ANTIALIAS = false;
        cc.macro.ENABLE_TRANSPARENT_CANVAS = true;
        app = await cc.createAirApp({ canvas, pixelRatioCap: DPR, diagnostics: 'warnings' });
        nativeScene = new cc.Scene('SparkPixelParity');
        cameraNode = new cc.Node('parity-camera');
        nativeScene.addChild(cameraNode);
        nativeCamera = cameraNode.addComponent(cc.Camera);
        await app.run(nativeScene);
        cc.game.pause();
        cc.screen.windowSize = new cc.Size(WIDTH, HEIGHT);
        cc.view.setDesignResolutionSize(WIDTH, HEIGHT, cc.ResolutionPolicy.EXACT_FIT);
        canvas.width = PHYS_W;
        canvas.height = PHYS_H;
        cc.director.root.resize(PHYS_W, PHYS_H);
        layer = new cc.CocosSparkLayer({
            cc,
            app,
            camera: nativeCamera,
            canvas,
            autoRender: false,
            sparkOptions: {
                enableLod: false,
                autoUpdate: false,
                timer: { update() {}, getElapsed: () => specTime, getDelta: () => 0 },
            },
        });
        renderer = layer.renderer;
        spark = layer.spark;
        scene = layer.scene;
        camera = layer.camera;
    } else {
        throw new Error('unknown mode: ' + mode);
    }
    clearCanvas();

    Object.assign(window.__sparkParity, {
        mode,
        setup,
        snapshot,
        adopt,
        info,
        draw: async () => {
            await settle();
            return pixels();
        },
        settle: async () => {
            await settle();
            return pixels();
        },
        pixels,
        perturbTargetCamera,
        glErrors: () => drainGl(),
        ready: true,
    });
    say(`ready (${mode})`);
}

boot().catch((error) => {
    window.__sparkParity.fatal = String(error && error.stack ? error.stack : error);
    window.__sparkParity.ready = true;
    say('fatal: ' + window.__sparkParity.fatal);
});
