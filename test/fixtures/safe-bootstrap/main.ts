const entry = new URLSearchParams(location.search).get('entry') || '/build/cocosair.module.js';
const safeEntry = await import(entry);
const { createAirApp } = safeEntry;
let app, runtime;
const render = () => {
    const { game, director } = runtime;
    game.pause(); director.tick(0);
    const gl = app.canvas.getContext('webgl2'), bytes = new Uint8Array(app.canvas.width * app.canvas.height * 4);
    gl.readPixels(0, 0, app.canvas.width, app.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    let colored = 0;
    for (let i = 0; i < bytes.length; i += 4) if (bytes[i] > 100 && bytes[i + 1] < 80 && bytes[i + 2] < 80) colored++;
    return { colored, buffer: [app.canvas.width, app.canvas.height], dpr: window.devicePixelRatio,
        focus: document.activeElement === app.canvas, scene: app.getScene()?.name, errors: app.diagnostics.snapshot() };
};
async function invalid() {
    const before = document.body.innerHTML, codes = [];
    for (const options of [{ canvas: '#missing' }, { canvas: document.body }, { canvas: '#missing', pixelRatioCap: 0 }]) {
        try { await createAirApp(options); codes.push('unexpected-pass'); }
        catch (error) { codes.push(error.code); }
    }
    return { unchanged: before === document.body.innerHTML, codes };
}
async function start(fail = false) {
    const canvas = document.createElement('canvas'); canvas.id = 'LateCustomCanvas'; document.body.appendChild(canvas);
    if (fail) {
        const original = canvas.getContext.bind(canvas);
        canvas.getContext = (kind, ...args) => kind === 'webgl2' ? null : original(kind, ...args);
    }
    const options = { canvas, pixelRatioCap: 1.25, diagnostics: 'warnings',
        designResolution: { width: 640, height: 480, policy: 0 } };
    const first = createAirApp(options), second = createAirApp({ ...options, canvas: '#LateCustomCanvas' });
    const sharedPromise = first === second;
    if (fail) {
        const failures = await Promise.allSettled([first, second]);
        let retryCode;
        try { await createAirApp(options); } catch (error) { retryCode = error.code; }
        return { sharedPromise, messages: failures.map((result) => result.status === 'rejected' ? String(result.reason) : 'unexpected-pass'),
            codes: failures.map((result) => result.status === 'rejected' ? result.reason.code : 'unexpected-pass'), retryCode };
    }
    [app] = await Promise.all([first, second]);
    const runtimePath = entry.includes('/npm/') ? '/build/npm/cocosair.module.js' : '/build/cocosair.module.js';
    runtime = safeEntry.loadRuntime ? await safeEntry.loadRuntime()
        : safeEntry.Scene ? safeEntry : await import(runtimePath);
    const { Scene, Node, Camera, Material, MeshRenderer, Color, utils, primitives } = runtime;
    const scene = new Scene('SafeStartup'), cameraNode = new Node('Camera');
    cameraNode.setPosition(0, 0, 10); const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO; camera.orthoHeight = 3;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(20, 40, 100, 255); scene.addChild(cameraNode);
    const node = new Node('Cube'); scene.addChild(node); const renderer = node.addComponent(MeshRenderer);
    const material = new Material(); material.initialize({ effectName: 'builtin-unlit' });
    material.setProperty('mainColor', new Color(230, 30, 20, 255));
    const mesh = utils.createMesh(primitives.box()); renderer.mesh = mesh;
    renderer.setSharedMaterial(material, 0); app.run(scene);
    app.session.own(() => { mesh.destroy(); material.destroy(); }, 'fixture-assets');
    const sameApp = await createAirApp(options) === app;
    let conflictCode;
    try { await createAirApp({ ...options, pixelRatioCap: 2 }); } catch (error) { conflictCode = error.code; }
    return { sharedPromise, sameApp, conflictCode, ...render() };
}
async function release() {
    const token = app.session.token();
    const first = app.releaseScene(), shared = first === app.releaseScene();
    let runCode;
    try { app.run(new runtime.Scene('DuringRelease')); } catch (error) { runCode = error.code; }
    const receipt = await first;
    return { shared, runCode, tokenCurrent: token.isCurrent(), scene: app.getScene(), receipt };
}
async function close() {
    const first = app.close(), shared = first === app.close();
    let code;
    try { await createAirApp({ canvas: app.canvas, pixelRatioCap: 1.25, diagnostics: 'warnings',
        designResolution: { width: 640, height: 480, policy: 0 } }); } catch (error) { code = error.code; }
    return { shared, code, receipt: await first };
}
let viewportState;
let viewportPresentation = 0;
function presentViewport() { runtime.director.tick(0); viewportPresentation = requestAnimationFrame(presentViewport); }
async function viewport() {
    const { Scene, Node, Sprite, SpriteFrame, Texture2D, ImageAsset, Color, UITransform, Canvas, createUICanvas, game } = runtime;
    const scene = new Scene('InstalledDesignViewport'), ui = createUICanvas(scene, 'UI', { designWidth: 640, designHeight: 480 });
    const source = document.createElement('canvas'); source.width = source.height = 2;
    const ctx = source.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 2, 2);
    const image = new ImageAsset(source), texture = new Texture2D(), frame = new SpriteFrame(); texture.image = image; frame.texture = texture;
    const hits = [], targets = [
        { id: 'bottom-left', x: 30, y: 30, color: [255, 0, 0, 255] },
        { id: 'bottom-right', x: 610, y: 30, color: [0, 255, 0, 255] },
        { id: 'top-left', x: 30, y: 450, color: [0, 0, 255, 255] },
        { id: 'top-right', x: 610, y: 450, color: [255, 255, 0, 255] },
    ];
    for (const target of targets) {
        const node = new Node(target.id); node.layer = ui.layer; ui.addChild(node); node.setPosition(target.x - 320, target.y - 240);
        const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.spriteFrame = frame;
        sprite.color = new Color(...target.color); node.getComponent(UITransform).setContentSize(40, 40); target.node = node;
        node.on(Node.EventType.TOUCH_START, (event) => { const p = event.getUILocation(); hits.push({ id: target.id, design: [p.x, p.y] }); });
    }
    app.run(scene); game.pause(); app.session.own(() => { frame.destroy(); texture.destroy(); image.destroy(); }, 'installed-ui-assets');
    viewportState = { ui, targets, hits }; return viewportSample();
}
function viewportSample() {
    const { director, Canvas, UITransform, Vec2 } = runtime; director.tick(0);
    const camera = viewportState.ui.getComponent(Canvas).cameraComponent, gl = app.canvas.getContext('webgl2');
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels); const rect = app.canvas.getBoundingClientRect();
    return { buffer: [w, h], css: [rect.width, rect.height], orthoWidth: camera.orthoWidth, orthoHeight: camera.orthoHeight,
        points: viewportState.targets.map((target) => {
            const expected = [target.x / 640 * w, target.y / 480 * h], p = camera.worldToScreen(target.node.worldPosition);
            const offset = (Math.floor(expected[1]) * w + Math.floor(expected[0])) * 4;
            return { id: target.id, design: [target.x, target.y], expected, projected: [p.x, p.y], color: target.color,
                pixel: Array.from(pixels.slice(offset, offset + 4)), hit: target.node.getComponent(UITransform).hitTest(new Vec2(...expected)),
                click: [rect.left + target.x / 640 * rect.width, rect.top + (1 - target.y / 480) * rect.height] };
        }) };
}
(window as any).__safeBootstrapProbe = { ready: true, invalid, start, render, release, close, viewport, viewportSample,
    startViewportPresentation: () => { if (!viewportPresentation) presentViewport(); },
    stopViewportPresentation: () => { cancelAnimationFrame(viewportPresentation); viewportPresentation = 0; },
    viewportHits: () => viewportState.hits.splice(0) };
