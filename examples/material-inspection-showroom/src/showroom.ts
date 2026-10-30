import {
    Animation,
    AirTransmissionCapture,
    Camera,
    Color,
    createAirApp,
    createAirRenderTarget,
    createStepClock,
    director,
    Director,
    DirectionalLight,
    geometry,
    GLTFAsset,
    GLTFInstance,
    GLTFLoader,
    Material,
    MeshRenderer,
    Node,
    primitives,
    Scene,
    SkinnedMeshRenderer,
    utils,
    Vec3,
    Vec4,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';
import { canvasToClientPoint, clientToCanvasPoint } from '../../shared/canvas-coordinates.js';
import { MaterialControls, uvRows, validateControls } from './controls.js';

const themes: Record<string, [string, string]> = {
    'asset-request-policy': [
        'Request policy',
        'Real local glTF + image requests. Priority is a browser hint, not a speed guarantee.',
    ],
    'material-contract-lab': [
        'Material contract',
        'Linear data, R intensity / G thickness. Missing film texture uses maximum thickness.',
    ],
    'render-state-isolation': [
        'Render state',
        'Two equal-size native render targets, independent cameras and one transmission capture.',
    ],
    'skinned-instance-lifecycle': [
        'Independent instances',
        'Three native glTF rigs share immutable assets, not animation or material state.',
    ],
    'first-frame-readiness': [
        'First-frame readiness',
        'Scene mounted is not compositor ready. Open the explicit five-stage diagnostic.',
    ],
    'depth-precision-lab': [
        'Depth research',
        'Opt-in diagnostics only. No Reverse-Z or default depth change is implied.',
    ],
    'probe-sh-lab': [
        'Probe / SH research',
        'Independent SH reference and opt-in capture comparison; not a production Web probe baker.',
    ],
    'material-inspection-showroom': [
        'Material inspection',
        'A native scene for materials, animation, loading and resource inspection.',
    ],
};
const assetURL = '/examples/material-inspection-showroom/assets/inspection-rig.gltf';
const crystalURL = '/examples/material-inspection-showroom/assets/crystal.gltf';

export async function runShowroom(theme = 'material-inspection-showroom'): Promise<void> {
    const [title, subtitle] = themes[theme] || themes['material-inspection-showroom'];
    document.title = `${title} · Cocos AIR`;
    document.body.innerHTML = `<header><a href="/examples/">COCOS AIR / LAB 09</a><span class="badge">DRAFT · WEBGL2</span></header>
    <main><section class="stage"><div class="heading"><p>INTERACTIVE MATERIAL ATELIER</p><h1>${title}</h1><p>${subtitle}</p></div>
    <canvas id="GameCanvas" aria-label="Interactive native material scene"></canvas><div id="bounds" aria-hidden="true"></div>
    <div class="stage-note">Drag to orbit · click a rig or sample to select · wheel to zoom</div>
    <div class="previews"><figure><canvas id="preview-a" width="192" height="108"></canvas><figcaption>PREVIEW A / FRONT</figcaption></figure><figure><canvas id="preview-b" width="192" height="108"></canvas><figcaption>PREVIEW B / SIDE</figcaption></figure></div></section>
    <aside><section><h2>01 / Object & animation</h2><label>Selected <select id="selection"></select></label><div class="row"><button id="pause">Pause selected</button><button id="step">Step 1/60s</button></div><label>Morph <input id="morph" type="range" min="-1" max="2" step="0.05" value="0"></label><label>Instance X <input id="position" type="range" min="-5" max="5" step="0.1" value="0"></label><div class="row"><button id="destroy">Destroy selected rig</button><button id="rebuild">Rebuild rig</button></div></section>
    <section><h2>02 / Native material instance</h2><label>Material <select id="material"></select></label><label>Linear RGB <span class="row"><input id="red" type="number" min="0" max="1" step="0.1" value="0.8"><input id="green" type="number" min="0" max="1" step="0.1" value="0.4"><input id="blue" type="number" min="0" max="1" step="0.1" value="0.2"></span></label><label>UV offset U / V <span class="row"><input id="uvU" type="number" step="0.1" value="0"><input id="uvV" type="number" step="0.1" value="0"></span></label><label>UV scale <input id="uvScale" type="number" min="0.01" step="0.1" value="1"></label><label>UV angle (radians) <input id="uvRotation" type="number" step="0.1" value="0"></label><label>Film intensity <input id="iridescence" type="number" min="0" max="1" step="0.1" value="0.7"></label><label>Film IOR <input id="ior" type="number" min="1" step="0.1" value="1.3"></label><label>Film min / max (nm) <span class="row"><input id="thicknessMin" type="number" min="0" value="100"><input id="thicknessMax" type="number" min="0" value="400"></span></label><button id="apply">Apply validated parameters</button><p class="hint">Shader data is linear. IOR ≥ 1; no artificial upper cap. Shared templates stay unchanged.</p></section>
    <section><h2>03 / Loading & ownership</h2><label>Priority <select id="priority"><option>auto</option><option>high</option><option>low</option></select></label><label>HTTP cache <select id="httpCache"><option>default</option><option>no-store</option><option>reload</option><option>force-cache</option></select></label><div class="row"><button id="retry">Reload asset</button><button id="cancel">Cancel current</button></div><button id="cycles">Run 30 ownership cycles</button><p class="hint">Actual engine update/draw settlement, not arbitrary sleeps. Portable total GPU memory: unavailable.</p></section>
    <section><h2>04 / Render controls</h2><label>Camera near / far <span class="row"><input id="near" type="number" min="0.001" step="0.1" value="0.1"><input id="far" type="number" min="1" value="100"></span></label><button id="apply-camera">Apply camera range</button><button id="preview-order">Reverse preview submission order</button><label><input id="show-bounds" type="checkbox"> Show projected world AABB</label></section><section><h2>05 / Explicit diagnostics</h2><label>Diagnostic <select id="diagnostic"><option value="readiness">First-frame stages</option><option value="depth">Depth formats / normal & reverse</option><option value="state">State / target isolation</option><option value="native-depth">Native depth texture</option><option value="probe">SH / probe reference</option></select></label><button id="open-diagnostic">Open isolated diagnostic</button><p class="hint">Separate page, fresh engine. Experiments are not startup dependencies.</p></section>
    <section class="status"><h2>Live observations</h2><pre id="status" aria-live="polite">Creating engine…</pre><p id="error" role="alert"></p></section></aside></main>`;
    const el = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
    const canvas = el<HTMLCanvasElement>('GameCanvas');
    const app = await createAirApp({
        canvas,
        pixelRatioCap: 2,
        diagnostics: 'warnings',
        screenMode: 'container',
        container: canvas.parentElement!,
    });
    if (!app.session || !app.close) throw new Error('This example requires the published app session/close contract.');
    const scope = app.session,
        close = app.close.bind(app);
    const verificationClock = createStepClock({ stepTimeoutMs: 10000 });
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error('WEBGL2_REQUIRED: no EmptyDevice or backend fallback');
    const scene = new Scene('Material inspection showroom');
    scene.globals.ambient.skyIllum = 9000;
    scene.globals.ambient.skyColor = new Vec4(0.45, 0.5, 0.65, 1);
    const cameraNode = new Node('Inspection camera');
    scene.addChild(cameraNode);
    const camera = cameraNode.addComponent(Camera);
    camera.fov = 45;
    camera.near = 0.1;
    camera.far = 100;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(12, 17, 27, 255);
    let yaw = 0,
        pitch = 0.19,
        distance = 14;
    function orbit(): void {
        cameraNode.setPosition(
            Math.sin(yaw) * Math.cos(pitch) * distance,
            Math.sin(pitch) * distance,
            Math.cos(yaw) * Math.cos(pitch) * distance,
        );
        cameraNode.lookAt(new Vec3(0, 0.2, 0));
    }
    orbit();
    const lightNode = new Node('Key light');
    scene.addChild(lightNode);
    lightNode.setRotationFromEuler(-35, -28, 0);
    const light = lightNode.addComponent(DirectionalLight);
    light.illuminance = 65000;
    app.run(scene);
    const log: Array<Record<string, unknown>> = [];
    let phase = 'engine-created',
        error = '',
        generation = 0,
        selected = 'rig-0',
        busy = false,
        closed = false;
    let controller: AbortController | null = null;
    let asset: GLTFAsset | null = null,
        crystal: GLTFAsset | null = null,
        gem: GLTFInstance | null = null;
    let capture: AirTransmissionCapture | null = null;
    const rigs: Array<GLTFInstance | null> = [null, null, null];
    let swatches: MeshRenderer[] = [],
        exhibitNodes: Node[] = [],
        ownedAssets: Array<{ destroy(): unknown }> = [];
    let targets: ReturnType<typeof createAirRenderTarget>[] = [];
    let previewCameras: Camera[] = [];
    const cleanups: Array<() => void> = [];
    let listenerCount = 0;
    function record(event: string, details: Record<string, unknown> = {}): void {
        log.push({ event, generation, time: performance.now(), ...details });
        if (log.length > 180) log.shift();
    }
    function fail(cause: unknown): void {
        error = String(cause);
        el('error').textContent = error;
        record('error', { error });
    }
    function listen(target: EventTarget, type: string, fn: EventListener, options?: AddEventListenerOptions): void {
        target.addEventListener(type, fn, options);
        listenerCount++;
        cleanups.push(() => {
            target.removeEventListener(type, fn, options);
            listenerCount--;
        });
    }
    function activeRenderer(): MeshRenderer | null {
        const [kind, raw] = selected.split('-');
        const index = Number(raw);
        return kind === 'rig'
            ? rigs[index]?.root.getComponentsInChildren(MeshRenderer)[0] || null
            : swatches[index] || null;
    }
    function activeAnimation(): Animation | null {
        return selected.startsWith('rig-')
            ? rigs[Number(selected.slice(4))]?.root.getComponent(Animation) || null
            : null;
    }
    function select(id: string): void {
        selected = id;
        el<HTMLSelectElement>('selection').value = id;
        const r = activeRenderer();
        el<HTMLInputElement>('morph').value = String(r instanceof SkinnedMeshRenderer ? r.getWeight(0, 0) : 0);
        if (id.startsWith('rig-') && rigs[Number(id.slice(4))])
            el<HTMLInputElement>('position').value = String(rigs[Number(id.slice(4))]!.root.position.x);
        record('select', { selected });
    }
    function mountRig(index: number): void {
        if (!asset || rigs[index]) return;
        const instance = asset.instantiate();
        rigs[index] = instance;
        instance.root.name = `Inspection rig ${index + 1}`;
        instance.root.setPosition((index - 1) * 3, 1.1, 0);
        instance.root.setScale(0.8, 0.8, 0.8);
        scene.addChild(instance.root);
        const animation = instance.root.getComponent(Animation)!;
        instance.setAnimationLoop(true, 'move');
        animation.play('move');
        const state = animation.getState('move')!;
        state.time = index * 0.4;
        state.sample();
        const renderer = instance.root.getComponentsInChildren(MeshRenderer)[0];
        renderer.setSharedMaterial(asset.materials[index * 4], 0);
        renderer.getMaterialInstance(0);
    }
    function release(): void {
        controller?.abort();
        controller = null;
        generation++;
        // Restore capture and render-target bindings before destroying native material passes.
        if (capture) capture.enabled = false;
        targets.forEach((target) => target.dispose());
        targets = [];
        previewCameras = [];
        rigs.forEach((rig, i) => {
            rig?.dispose();
            rigs[i] = null;
        });
        gem?.dispose();
        gem = null;
        exhibitNodes.forEach((node) => {
            node.active = false;
            node.destroy();
        });
        exhibitNodes = [];
        swatches = [];
        ownedAssets.forEach((item) => item.destroy());
        ownedAssets = [];
        for (const item of [asset, crystal])
            if (item) {
                item.destroy();
                item.decRef(false);
            }
        asset = crystal = null;
        capture = null;
        phase = 'released';
        record('release');
    }
    function held(): Array<{ name: string; ref: object; released?: () => boolean }> {
        const values: Array<{ name: string; ref: object; released?: () => boolean }> = [];
        for (const [name, item] of [
            ['rig-asset', asset],
            ['crystal-asset', crystal],
        ] as const)
            if (item) values.push({ name, ref: item, released: () => !item.isValid && item.refCount === 0 });
        for (const [name, item] of [
            ['rig', asset],
            ['crystal', crystal],
        ] as const)
            if (item) {
                for (const [kind, list] of [
                    ['mesh', item.meshes],
                    ['material', item.materials],
                    ['texture', item.textures],
                    ['image', item.images],
                    ['skeleton', item.skeletons],
                    ['clip', item.animations],
                ] as const)
                    list.forEach((ref, i) => values.push({ name: `${name}-${kind}-${i}`, ref }));
            }
        exhibitNodes.forEach((ref, i) => values.push({ name: `exhibit-node-${i}`, ref }));
        ownedAssets.forEach((ref, i) => values.push({ name: `procedural-asset-${i}`, ref }));
        const captureTexture = capture?.sceneColor;
        if (captureTexture) values.push({ name: 'capture-scene-color', ref: captureTexture });
        for (const [i, rig] of rigs.entries()) if (rig) values.push({ name: `rig-${i}`, ref: rig.root });
        if (gem) values.push({ name: 'gem', ref: gem.root });
        for (const [i, r] of [
            ...swatches,
            ...(gem?.root.getComponentsInChildren(MeshRenderer) || []),
            ...rigs.flatMap((rig) => rig?.root.getComponentsInChildren(MeshRenderer) || []),
        ].entries()) {
            const material = r.getMaterialInstance(0);
            if (material)
                values.push({
                    name: `instance-material-${i}`,
                    ref: material,
                    released: () => material.passes.length === 0,
                });
        }
        for (const [i, target] of targets.entries())
            values.push({
                name: `target-${i}`,
                ref: target.renderTexture,
                released: () => target.info.disposed && !target.renderTexture.isValid,
            });
        return values;
    }
    async function acquire(): Promise<void> {
        if (closed) throw new Error('The application is closed; reload the document.');
        release();
        const token = ++generation;
        controller = new AbortController();
        const signal = controller.signal;
        phase = 'fetching-gltf-and-image';
        error = '';
        el('error').textContent = '';
        record('request-start');
        const request = {
            priority: el<HTMLSelectElement>('priority').value as 'auto' | 'high' | 'low',
            httpCache: el<HTMLSelectElement>('httpCache').value as RequestCache,
            credentials: 'same-origin' as const,
        };
        let loaded: GLTFAsset | null = null,
            loadedCrystal: GLTFAsset | null = null;
        try {
            loaded = await new GLTFLoader({
                request,
                signal,
                onProgress: (progress) => {
                    if (token === generation) record('loader-progress', { ...progress });
                },
            }).loadAsync(assetURL);
            if (signal.aborted || token !== generation || closed) {
                loaded.destroy();
                throw new DOMException('Superseded load', 'AbortError');
            }
            asset = loaded;
            asset.addRef();
            loaded = null;
            phase = 'mounting';
            record('rig-parsed', { materials: asset.materials.length });
            const captureNode = new Node('Single transmission capture');
            scene.addChild(captureNode);
            exhibitNodes.push(captureNode);
            capture = captureNode.addComponent(AirTransmissionCapture);
            capture.mainCamera = camera;
            // Capture must be armed before parsing a transmission material.
            loadedCrystal = await new GLTFLoader({
                request,
                signal,
                onProgress: (progress) => {
                    if (token === generation) record('loader-progress', { ...progress });
                },
            }).loadAsync(crystalURL);
            if (signal.aborted || token !== generation || closed) {
                loadedCrystal.destroy();
                throw new DOMException('Superseded load', 'AbortError');
            }
            crystal = loadedCrystal;
            crystal.addRef();
            loadedCrystal = null;
            gem = crystal.instantiate();
            gem.root.setPosition(0, -1.25, 0);
            gem.root.setScale(0.55, 0.55, 0.55);
            scene.addChild(gem.root);
            for (let i = 0; i < 3; i++) mountRig(i);
            const sphere = utils.createMesh(primitives.sphere(0.35, { segments: 24 }));
            ownedAssets.push(sphere);
            for (let i = 0; i < 12; i++) {
                const node = new Node(`Material sample ${i + 1}`);
                scene.addChild(node);
                exhibitNodes.push(node);
                node.setPosition(((i % 6) - 2.5) * 1.25, -2.65 + Math.floor(i / 6) * 0.85, 0.4);
                const renderer = node.addComponent(MeshRenderer);
                renderer.mesh = sphere;
                renderer.setSharedMaterial(asset.materials[i], 0);
                renderer.getMaterialInstance(0);
                swatches.push(renderer);
            }
            const floorMesh = utils.createMesh(primitives.box({ width: 12, height: 0.12, length: 6 }));
            ownedAssets.push(floorMesh);
            const floorMaterial = new Material();
            floorMaterial.initialize({ effectName: 'builtin-standard' });
            floorMaterial.setProperty('albedo', new Vec4(0.035, 0.045, 0.065, 1));
            floorMaterial.setProperty('pbrParams', new Vec4(1, 0.8, 0.1, 0.5));
            ownedAssets.push(floorMaterial);
            const floor = new Node('Inspection plinth');
            floor.setPosition(0, -3.2, 0);
            scene.addChild(floor);
            exhibitNodes.push(floor);
            const floorRenderer = floor.addComponent(MeshRenderer);
            floorRenderer.mesh = floorMesh;
            floorRenderer.material = floorMaterial;
            const backdropMesh = utils.createMesh(primitives.box({ width: 0.16, height: 7, length: 0.1 }));
            ownedAssets.push(backdropMesh);
            const backdropMaterial = new Material();
            backdropMaterial.initialize({ effectName: 'builtin-unlit' });
            backdropMaterial.setProperty('mainColor', new Color(113, 133, 158, 255));
            ownedAssets.push(backdropMaterial);
            for (let i = -8; i <= 8; i++) {
                const stripe = new Node(`Refraction backdrop stripe ${i}`);
                scene.addChild(stripe);
                exhibitNodes.push(stripe);
                stripe.setPosition(i * 0.6, -0.2, -2.5);
                const renderer = stripe.addComponent(MeshRenderer);
                renderer.mesh = backdropMesh;
                renderer.material = backdropMaterial;
            }
            ['A', 'B'].forEach((name, i) => {
                const node = new Node(`Preview ${name} camera`);
                scene.addChild(node);
                exhibitNodes.push(node);
                node.setPosition(i ? 9 : -3, 4, i ? 8 : 12);
                node.lookAt(new Vec3(0, -0.3, 0));
                const preview = node.addComponent(Camera);
                preview.fov = 48;
                preview.near = 0.1;
                preview.far = 80;
                preview.priority = -10 + i;
                preview.clearFlags = Camera.ClearFlag.SOLID_COLOR;
                preview.clearColor = i ? new Color(30, 19, 35, 255) : new Color(13, 31, 40, 255);
                const target = createAirRenderTarget({
                    name: `Inspection ${name}`,
                    width: 192,
                    height: 108,
                    colorFormat: 'rgba8',
                    depthFormat: 'depth24-stencil8',
                    samples: 1,
                });
                targets.push(target);
                previewCameras.push(preview);
                target.attachCamera(preview);
            });
            phase = 'scene-mounted';
            controller = null;
            select(selected);
            record('mounted', { instances: 3, samples: 12 });
        } catch (cause) {
            loaded?.destroy();
            loadedCrystal?.destroy();
            if (token === generation) {
                release();
                phase = signal.aborted ? 'cancelled' : 'failed';
                record(phase);
            }
            throw cause;
        }
    }
    for (const [index, label] of [
        'Rig 1',
        'Rig 2',
        'Rig 3',
        ...Array.from({ length: 12 }, (_, i) => `Sample ${i + 1}`),
    ].entries()) {
        const option = new Option(label, index < 3 ? `rig-${index}` : `sample-${index - 3}`);
        el<HTMLSelectElement>('selection').add(option);
    }
    for (let i = 0; i < 12; i++) el<HTMLSelectElement>('material').add(new Option(`Swatch ${i + 1}`, String(i)));
    listen(el('selection'), 'change', () => select(el<HTMLSelectElement>('selection').value));
    listen(el('material'), 'change', () => {
        const renderer = activeRenderer();
        if (!renderer || !asset) return;
        renderer.setSharedMaterial(asset.materials[Number(el<HTMLSelectElement>('material').value)], 0);
        renderer.getMaterialInstance(0);
        record('material-switched', { selected });
    });
    listen(el('apply'), 'click', () => {
        try {
            const value = Object.fromEntries(
                ['uvScale', 'uvRotation', 'iridescence', 'ior', 'thicknessMin', 'thicknessMax'].map((key) => [
                    key,
                    Number(el<HTMLInputElement>(key).value),
                ]),
            ) as unknown as MaterialControls;
            validateControls(value);
            const material = activeRenderer()?.getMaterialInstance(0);
            if (!material) throw new Error('Select a live object.');
            const color = ['red', 'green', 'blue'].map((key) => Number(el<HTMLInputElement>(key).value));
            const offset = ['uvU', 'uvV'].map((key) => Number(el<HTMLInputElement>(key).value));
            if (color.some((v) => !Number.isFinite(v) || v < 0 || v > 1) || offset.some((v) => !Number.isFinite(v)))
                throw new RangeError('RGB must be finite [0,1] linear data; UV offsets must be finite.');
            const rows = uvRows(value);
            rows[0][2] = offset[0];
            rows[1][2] = offset[1];
            material.setProperty('albedo', new Vec4(color[0], color[1], color[2], 1));
            material.setProperty('airAlbedoUV0', new Vec4(...(rows[0] as [number, number, number, number])));
            material.setProperty('airAlbedoUV1', new Vec4(...(rows[1] as [number, number, number, number])));
            material.setProperty(
                'airIridescence',
                new Vec4(value.iridescence, value.ior, value.thicknessMin, value.thicknessMax),
            );
            error = '';
            el('error').textContent = '';
            record('material-applied', { selected, value });
        } catch (cause) {
            fail(cause);
        }
    });
    listen(el('apply-camera'), 'click', () => {
        const near = Number(el<HTMLInputElement>('near').value),
            far = Number(el<HTMLInputElement>('far').value);
        if (!Number.isFinite(near) || !Number.isFinite(far) || near <= 0 || far <= near) {
            fail('Require finite 0 < near < far');
            return;
        }
        camera.near = near;
        camera.far = far;
        record('camera-range', { near, far });
    });
    listen(el('preview-order'), 'click', () => {
        if (previewCameras.length === 2) {
            [previewCameras[0].priority, previewCameras[1].priority] = [
                previewCameras[1].priority,
                previewCameras[0].priority,
            ];
            record('preview-order', { priority: previewCameras.map((c) => c.priority) });
        }
    });
    listen(el('morph'), 'input', () => {
        const r = activeRenderer();
        if (r instanceof SkinnedMeshRenderer) r.setWeight(Number(el<HTMLInputElement>('morph').value), 0, 0);
    });
    listen(el('position'), 'input', () => {
        if (selected.startsWith('rig-')) {
            const rig = rigs[Number(selected.slice(4))];
            if (rig)
                rig.root.setPosition(
                    Number(el<HTMLInputElement>('position').value),
                    rig.root.position.y,
                    rig.root.position.z,
                );
        }
    });
    listen(el('pause'), 'click', () => {
        const animation = activeAnimation();
        const state = animation?.getState('move');
        if (!state) return;
        if (state.isPaused) animation!.resume();
        else animation!.pause();
        record('animation-toggle', { selected, paused: state.isPaused });
    });
    listen(el('step'), 'click', () => {
        const animation = activeAnimation();
        const state = animation?.getState('move');
        if (!state) return;
        animation!.pause();
        state.time += 1 / 60;
        state.sample();
        record('animation-step', { selected, time: state.time });
    });
    listen(el('destroy'), 'click', () => {
        if (!selected.startsWith('rig-')) return;
        const i = Number(selected.slice(4));
        rigs[i]?.dispose();
        rigs[i] = null;
        record('instance-destroyed', { i });
    });
    listen(el('rebuild'), 'click', () => {
        if (selected.startsWith('rig-')) {
            mountRig(Number(selected.slice(4)));
            record('instance-rebuilt', { selected });
        }
    });
    listen(el('retry'), 'click', () => {
        if (!busy) void acquire().catch(fail);
    });
    listen(el('cancel'), 'click', () => {
        controller?.abort();
        record('cancel-requested');
    });
    const diagnosticURLs: Record<string, string> = {
        readiness: '/test/fixtures/upstream-readiness/',
        depth: '/test/fixtures/upstream-depth-experiments/',
        state: '/test/fixtures/upstream-state-isolation/',
        'native-depth': '/test/fixtures/upstream-experiments-transparency/',
        probe: '/test/fixtures/upstream-probe-capture/upstream-probe-capture.html',
    };
    if (theme === 'render-state-isolation') el<HTMLSelectElement>('diagnostic').value = 'state';
    if (theme === 'depth-precision-lab') el<HTMLSelectElement>('diagnostic').value = 'depth';
    if (theme === 'probe-sh-lab') el<HTMLSelectElement>('diagnostic').value = 'probe';
    listen(el('open-diagnostic'), 'click', () => {
        window.open(diagnosticURLs[el<HTMLSelectElement>('diagnostic').value], '_blank', 'noopener');
    });
    let pointer: { id: number; x: number; y: number; moved: boolean } | null = null;
    listen(canvas, 'pointerdown', ((event: PointerEvent) => {
        pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
        canvas.setPointerCapture(event.pointerId);
    }) as EventListener);
    listen(canvas, 'pointermove', ((event: PointerEvent) => {
        if (!pointer || pointer.id !== event.pointerId) return;
        const dx = event.clientX - pointer.x,
            dy = event.clientY - pointer.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) pointer.moved = true;
        yaw -= dx * 0.006;
        pitch = Math.max(-0.5, Math.min(1.2, pitch + dy * 0.006));
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        orbit();
    }) as EventListener);
    listen(canvas, 'pointerup', ((event: PointerEvent) => {
        if (!pointer || pointer.id !== event.pointerId) return;
        if (!pointer.moved) {
            const point = clientToCanvasPoint(canvas, event.clientX, event.clientY);
            if (point) {
                const ray = camera.screenPointToRay(point.x, point.y);
                let nearest = Infinity,
                    hit: string | null = null;
                const objects = [
                    ...rigs.flatMap((rig, i) =>
                        rig
                            ? rig.root
                                  .getComponentsInChildren(MeshRenderer)
                                  .map((renderer) => ({ id: `rig-${i}`, renderer }))
                            : [],
                    ),
                    ...swatches.map((renderer, i) => ({ id: `sample-${i}`, renderer })),
                ];
                for (const { id, renderer } of objects) {
                    const bounds = renderer.model?.worldBounds;
                    if (!bounds) continue;
                    const t = geometry.intersect.rayAABB(ray, bounds);
                    if (t > 0 && t < nearest) {
                        nearest = t;
                        hit = id;
                    }
                }
                if (hit) select(hit);
                record('pointer-pick', { hit, point, method: 'native-world-AABB' });
            }
        }
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        pointer = null;
    }) as EventListener);
    listen(canvas, 'pointercancel', () => {
        pointer = null;
    });
    listen(
        canvas,
        'wheel',
        ((event: WheelEvent) => {
            event.preventDefault();
            distance = Math.max(6, Math.min(24, distance + event.deltaY * 0.01));
            orbit();
        }) as EventListener,
        { passive: false },
    );
    const lifecycle = () =>
        installAssetLifecycle({
            label: theme,
            hold: held,
            release,
            reacquire: async () => {
                await acquire();
                return held();
            },
        });
    const cycleReports: unknown[] = [];
    async function runCycles(): Promise<unknown> {
        if (busy || phase !== 'scene-mounted') throw new Error('Wait for a live idle scene before lifecycle stress.');
        busy = true;
        const baselineListeners = listenerCount,
            baselineOwned = scope.ownedCount;
        cycleReports.length = 0;
        try {
            for (let i = 0; i < 30; i++) {
                select(`rig-${i % 3}`);
                const r = activeRenderer();
                if (r && asset) {
                    r.setSharedMaterial(asset.materials[i % 12], 0);
                    r.getMaterialInstance(0);
                }
                lifecycle();
                const report = await (window as any).__lifecycle();
                const observation = {
                    cycle: i,
                    report: JSON.parse(JSON.stringify(report)),
                    listeners: listenerCount,
                    sessionOwned: scope.ownedCount,
                    models: scene.renderScene?.models.length,
                    held: held().length,
                };
                cycleReports.push(observation);
                if (
                    !report.released ||
                    !report.reloaded ||
                    report.errors.length ||
                    listenerCount !== baselineListeners ||
                    scope.ownedCount !== baselineOwned
                )
                    throw new Error(`Lifecycle cycle ${i} failed`);
            }
            const rows = cycleReports as Array<{ models: number; held: number }>;
            if (rows.some((row) => row.models !== rows[0].models || row.held !== rows[0].held))
                throw new Error('Owned models/resources grew after fixed settlement');
            return { status: 'PASS', cycles: cycleReports, gpuTotalMemory: 'unavailable' };
        } finally {
            busy = false;
        }
    }
    listen(el('cycles'), 'click', () => {
        void runCycles()
            .then(() => record('cycles-complete', { count: 30 }))
            .catch(fail);
    });
    let drawn = 0;
    function state() {
        const renderer = activeRenderer(),
            material = renderer?.getMaterialInstance(0),
            bounds = renderer?.model?.worldBounds;
        return {
            theme,
            phase,
            generation,
            selected,
            backend: app.contextHealth.snapshot().backend,
            renderer: gl!.getParameter(gl!.RENDERER),
            viewport: { width: canvas.width, height: canvas.height, dpr: devicePixelRatio },
            liveInstances: rigs.filter(Boolean).length,
            materialSamples: swatches.length,
            listeners: listenerCount,
            sessionOwned: scope.ownedCount,
            error,
            selectedMaterial: material?.name,
            film: material?.getProperty('airIridescence'),
            uv: material?.getProperty('airAlbedoUV0'),
            camera: { yaw, pitch, distance, near: camera.near, far: camera.far },
            previewPriority: previewCameras.map((c) => c.priority),
            bounds: bounds ? { center: { ...bounds.center }, halfExtents: { ...bounds.halfExtents } } : null,
            instances: rigs.map((rig) =>
                rig
                    ? {
                          position: { ...rig.root.position },
                          time: rig.root.getComponent(Animation)?.getState('move')?.time,
                          paused: rig.root.getComponent(Animation)?.getState('move')?.isPaused,
                          morph: rig.root.getComponentsInChildren(SkinnedMeshRenderer)[0]?.getWeight(0, 0),
                      }
                    : null,
            ),
            targets: targets.map((target) => target.info),
            transmissionBound: !!gem?.root
                .getComponentsInChildren(MeshRenderer)[0]
                ?.getMaterialInstance(0)
                ?.getProperty('cc_sceneColorTex'),
            gpuTotalMemory: 'unavailable',
            cycles: cycleReports.length,
            log: [...log],
        };
    }
    const onDraw = (): void => {
        if (closed) return;
        drawn++;
        const bounds = activeRenderer()?.model?.worldBounds,
            overlay = el('bounds');
        if (bounds && el<HTMLInputElement>('show-bounds').checked) {
            const points: Array<{ x: number; y: number }> = [];
            for (const x of [-1, 1])
                for (const y of [-1, 1])
                    for (const z of [-1, 1]) {
                        const p = new Vec3(
                            bounds.center.x + x * bounds.halfExtents.x,
                            bounds.center.y + y * bounds.halfExtents.y,
                            bounds.center.z + z * bounds.halfExtents.z,
                        );
                        const pixel = camera.worldToScreen(p);
                        const client = canvasToClientPoint(canvas, pixel.x, pixel.y);
                        if (client) points.push(client);
                    }
            const rect = canvas.getBoundingClientRect(),
                xs = points.map((p) => p.x),
                ys = points.map((p) => p.y);
            overlay.style.display = points.length ? 'block' : 'none';
            Object.assign(overlay.style, {
                left: `${Math.min(...xs) - rect.left}px`,
                top: `${Math.min(...ys) - rect.top}px`,
                width: `${Math.max(...xs) - Math.min(...xs)}px`,
                height: `${Math.max(...ys) - Math.min(...ys)}px`,
            });
        } else overlay.style.display = 'none';
        if (drawn % 15 === 0) {
            for (const [i, target] of targets.entries()) {
                try {
                    const data = target.readColor() as Uint8Array,
                        { width, height } = target.info;
                    const pixels = new Uint8ClampedArray(data.length);
                    for (let y = 0; y < height; y++)
                        pixels.set(data.subarray(y * width * 4, (y + 1) * width * 4), (height - 1 - y) * width * 4);
                    el<HTMLCanvasElement>(i ? 'preview-b' : 'preview-a')
                        .getContext('2d')!
                        .putImageData(new ImageData(pixels, width, height), 0, 0);
                } catch (cause) {
                    fail(cause);
                }
            }
            const current = state();
            const { log: ignored, instances, ...summary } = current;
            el('status').textContent = JSON.stringify({ ...summary, instances }, null, 2);
        }
        (window as any).__sceneReadyStatus = {
            id: theme,
            ready: phase === 'scene-mounted' && drawn > 1,
            evidence: 'engine draw only; not compositor presentation',
        };
    };
    const stopHealth = app.contextHealth.onChange((snapshot) => {
        record('context-health', { ...snapshot });
        if (snapshot.state !== 'healthy') {
            phase = 'device-failed';
            fail(`Device state ${snapshot.state}; reload required, no silent recovery.`);
        }
    });
    listenerCount++;
    cleanups.push(() => {
        stopHealth();
        listenerCount--;
    });
    director.on(Director.EVENT_AFTER_DRAW, onDraw);
    listenerCount++;
    cleanups.push(() => {
        director.off(Director.EVENT_AFTER_DRAW, onDraw);
        listenerCount--;
    });
    scope.own(() => {
        closed = true;
        release();
        cleanups.splice(0).forEach((cleanup) => cleanup());
        delete (window as any).__lifecycle;
        delete (window as any).__lifecycleHold;
    }, 'inspection-owned-resources-and-listeners');
    (window as any).__airApp = app;
    (window as any).__inspection = {
        state,
        cycleObservations: () => cycleReports,
        runCycles,
        close: () => close(),
        freeze: () => verificationClock.begin(),
        frame: () => verificationClock.step(0),
        resume: () => verificationClock.end(),
        lifecycle,
        pickPoint: (id: string) => {
            const r = id.startsWith('rig-')
                ? rigs[Number(id.slice(4))]?.root.getComponentsInChildren(MeshRenderer)[0]
                : swatches[Number(id.slice(7))];
            const bounds = r?.model?.worldBounds;
            if (!bounds) return null;
            const screen = new Vec3();
            camera.worldToScreen(bounds.center, screen);
            return canvasToClientPoint(canvas, screen.x, screen.y);
        },
    };
    lifecycle();
    await acquire();
}
