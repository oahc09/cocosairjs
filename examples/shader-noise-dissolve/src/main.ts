import {
    createAirApp,
    createStepClock,
    Scene,
    Node,
    Camera,
    MeshRenderer,
    Material,
    EffectAsset,
    Texture2D,
    Color,
    Vec4,
    utils,
    director,
    Director,
    game,
    gfx,
    Asset,
} from 'cocosair';
import { defaults, definition, validateParameters, type Parameters } from './parameters.js';
import { effectDefinition } from './effect.generated.js';
import { installShaderLifecycle } from '../../shared/shader-lifecycle.js';

const canvas = document.querySelector<HTMLCanvasElement>('#GameCanvas')!;
const test = new URLSearchParams(location.search).has('test');
if (test) document.body.classList.add('test');
const app = await createAirApp({ canvas });
const scene = new Scene('NoiseDissolve');
const layer = 1 << 20;
const camNode = new Node('Camera');
scene.addChild(camNode);
camNode.setPosition(0, 0, 5);
const camera = camNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.ORTHO;
camera.orthoHeight = 1;
camera.near = 0.1;
camera.far = 20;
camera.visibility = layer;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(0, 0, 0, 255);
const registered = Object.assign(new EffectAsset(), JSON.parse(JSON.stringify(effectDefinition)));
registered.addRef();
registered.onLoaded();
const clock = createStepClock();
let parameters: Parameters = { ...defaults },
    mode = 0,
    input = 'checker',
    serial = 0,
    closed = false,
    updates = 0;
type Owned = {
    node: Node;
    renderer: MeshRenderer;
    mesh: ReturnType<typeof utils.createMesh>;
    material: Material;
    texture: Texture2D;
    id: number;
};
let current: Owned | null = null;
const abort = new AbortController(),
    events: Record<string, unknown>[] = [];
const registrations: { target: EventTarget; type: string; callback: EventListener }[] = [];
function listen(target: EventTarget, type: string, callback: EventListener): void {
    target.addEventListener(type, callback, { signal: abort.signal });
    registrations.push({ target, type, callback });
}
let latest: Record<string, unknown> = {};
let performanceCapture = false,
    warmFrames = 0,
    targetFrames = 0,
    resolvePerformance: ((r: unknown) => void) | null = null;
let lastFrameStart = 0,
    frameStart = 0,
    updateMs = 0,
    encodingMs = 0,
    submissionMs = 0,
    dispatchMs = 0,
    encodingStart = 0;
let samples: {
    cpuUpdateMs: number[];
    cpuEncodingMs: number[];
    cpuSubmissionMs: number[];
    cpuDrawDispatchMs: number[];
    frameMs: number[];
    drawCalls: number[];
    frameNumbers: number[];
} = {
    cpuUpdateMs: [],
    cpuEncodingMs: [],
    cpuSubmissionMs: [],
    cpuDrawDispatchMs: [],
    frameMs: [],
    drawCalls: [],
    frameNumbers: [],
};
const device = director.root!.device;
const gl = canvas.getContext('webgl2')!;
const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
const queries: { query: WebGLQuery; frame: number; warmup: boolean }[] = [];
let query: WebGLQuery | null = null;
const undo: (() => void)[] = [];
const restoredChecks: (() => boolean)[] = [];
const shaderCompiles: Record<string, unknown>[] = [];
const programLinks: Record<string, unknown>[] = [];
/** TOOL_DIAGNOSTIC: wrap originals once. WebGL2 CB calls dispatch GL immediately;
 * queue.submit is bookkeeping, NOT GPU command submission. Never issue a custom draw. */
function instrument(
    object: object,
    key: string,
    wrap: (original: (...args: unknown[]) => unknown) => (...args: unknown[]) => unknown,
): void {
    const record = object as Record<string, (...args: unknown[]) => unknown>,
        original = record[key];
    if (typeof original !== 'function') throw new Error('E01_DIAGNOSTIC_MISSING_' + key);
    record[key] = wrap(original);
    undo.push(() => {
        record[key] = original;
    });
    restoredChecks.push(() => record[key] === original);
}
instrument(
    gl,
    'compileShader',
    (original) =>
        function (...args) {
            const value = original.apply(gl, args);
            const shader = args[0] as WebGLShader;
            shaderCompiles.push({
                type: gl.getShaderParameter(shader, gl.SHADER_TYPE),
                status: Boolean(gl.getShaderParameter(shader, gl.COMPILE_STATUS)),
                log: gl.getShaderInfoLog(shader),
                source: gl.getShaderSource(shader),
            });
            return value;
        },
);
instrument(
    gl,
    'linkProgram',
    (original) =>
        function (...args) {
            const value = original.apply(gl, args);
            const program = args[0] as WebGLProgram;
            programLinks.push({
                status: Boolean(gl.getProgramParameter(program, gl.LINK_STATUS)),
                log: gl.getProgramInfoLog(program),
            });
            return value;
        },
);
instrument(
    device.commandBuffer,
    'begin',
    (original) =>
        function (...args) {
            encodingStart = performance.now();
            if (performanceCapture && warmFrames === 0 && timer && !query) {
                query = gl.createQuery();
                if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
            }
            return original.apply(device.commandBuffer, args);
        },
);
instrument(
    device.commandBuffer,
    'end',
    (original) =>
        function (...args) {
            const r = original.apply(device.commandBuffer, args);
            encodingMs += performance.now() - encodingStart;
            if (query && timer) {
                gl.endQuery(timer.TIME_ELAPSED_EXT);
                queries.push({ query, frame: director.getTotalFrames(), warmup: false });
                query = null;
            }
            return r;
        },
);
instrument(
    device.queue,
    'submit',
    (original) =>
        function (...args) {
            const start = performance.now();
            try {
                return original.apply(device.queue, args);
            } finally {
                submissionMs += performance.now() - start;
            }
        },
);
for (const key of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced'])
    instrument(
        gl,
        key,
        (original) =>
            function (...args) {
                const start = performance.now();
                try {
                    return original.apply(gl, args);
                } finally {
                    dispatchMs += performance.now() - start;
                }
            },
    );

function inputBytes(kind: string): Uint8Array {
    const bytes = new Uint8Array(16 * 16 * 4);
    for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
            const i = (y * 16 + x) * 4;
            bytes[i] = x % 2 ? 220 : 40;
            bytes[i + 1] = y % 2 ? 180 : 60;
            bytes[i + 2] = (x + y) % 2 ? 200 : 100;
            bytes[i + 3] = kind === 'opaque' ? 255 : [0, 128, 255, 128][(x + 2 * y) % 4];
        }
    return bytes;
}
function createOwned(background = false): Owned {
    if (closed) throw new Error('E01_DISPOSED');
    const node = new Node(background ? 'CheckerBackground' : 'Dissolve-' + ++serial);
    scene.addChild(node);
    node.layer = layer;
    const renderer = node.addComponent(MeshRenderer);
    const mesh = utils.createMesh(
        {
            positions: [-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0],
            uvs: [0, 0, 1, 0, 0, 1, 1, 1],
            indices: [0, 1, 2, 1, 3, 2],
        },
        undefined,
        { calculateBounds: true },
    );
    mesh.addRef();
    const texture = new Texture2D();
    texture.reset({ width: 16, height: 16, format: Texture2D.PixelFormat.RGBA8888 });
    texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
    texture.uploadData(inputBytes(input));
    texture.addRef();
    const material = new Material();
    material.initialize({
        effectName: 'shader-noise-dissolve',
        states: {
            depthStencilState: { depthTest: false, depthWrite: false },
            blendState: {
                targets: [
                    {
                        blend: !background && mode === 0,
                        blendSrc: gfx.BlendFactor.SRC_ALPHA,
                        blendDst: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
                        blendSrcAlpha: gfx.BlendFactor.ONE,
                        blendDstAlpha: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
                    },
                ],
            },
        },
    });
    material.addRef();
    material.setProperty('sourceTexture', texture);
    renderer.mesh = mesh;
    renderer.setSharedMaterial(material, 0);
    const owned = { node, renderer, mesh, material, texture, id: serial };
    if (background) write(owned, 3);
    else write(owned, mode);
    return owned;
}
function write(o: Owned, m: number): void {
    o.material.setProperty(
        'params',
        new Vec4(parameters.progress, parameters.scale, parameters.softness, parameters.seed),
    );
    o.material.setProperty('geometry', new Vec4(canvas.width / canvas.height, parameters.invert ? 1 : 0, m, 0));
}
const background = createOwned(true);
function set(values: unknown): Record<string, unknown> {
    if (closed || !current) throw new Error('E01_DISPOSED');
    parameters = validateParameters(values);
    write(current, mode);
    updates++;
    return snapshot();
}
async function configure(m: number): Promise<void> {
    if (![0, 1, 2].includes(m)) throw new Error('E01_INVALID_MODE');
    mode = m;
    await recreate();
}
function memory(): Record<string, number> {
    return {
        texture: device.memoryStatus.textureSize,
        buffer: device.memoryStatus.bufferSize,
        material: current ? 1 : 0,
        listener:
            (director.hasEventListener(Director.EVENT_BEFORE_UPDATE, beforeUpdate) ? 1 : 0) +
            (director.hasEventListener(Director.EVENT_AFTER_DRAW, afterDraw) ? 1 : 0) +
            (abort.signal.aborted ? 0 : registrations.length),
        raf: 0,
        gpuResource: device.memoryStatus.textureSize + device.memoryStatus.bufferSize,
    };
}
function inventory(): Record<string, unknown> {
    const objects = closed ? [] : [background, ...(current ? [current] : [])],
        buffers = new Set<gfx.Buffer>(),
        textures = new Set<gfx.Texture>();
    let passes = 0;
    for (const o of objects) {
        for (const sub of o.mesh.renderingSubMeshes) {
            for (const buffer of sub.vertexBuffers) buffers.add(buffer);
            if (sub.indexBuffer) buffers.add(sub.indexBuffer);
        }
        for (const pass of o.material.passes) {
            passes++;
            const buffer = pass.descriptorSet?.getBuffer(0);
            if (buffer) buffers.add(buffer);
        }
        if (o.renderer.model?.localBuffer) buffers.add(o.renderer.model.localBuffer);
        const texture = o.texture.getGFXTexture();
        if (texture) textures.add(texture);
    }
    return {
        passCount: passes,
        textureCount: textures.size,
        bufferCount: buffers.size,
        buffers: Array.from(buffers).map((b) => ({ id: b.objectID, size: b.size })),
        textures: Array.from(textures).map((tex) => ({
            id: tex.objectID,
            width: tex.width,
            height: tex.height,
            size: tex.size,
        })),
        textureBytes: Array.from(textures).reduce((sum, tex) => sum + tex.size, 0),
        bufferBytes: Array.from(buffers).reduce((sum, b) => sum + b.size, 0),
    };
}
function snapshot(): Record<string, unknown> {
    const rect = canvas.getBoundingClientRect();
    return {
        parameters: { ...parameters },
        mode,
        input,
        updates,
        inventory: inventory(),
        instance: current?.id ?? null,
        frames: director.getTotalFrames(),
        paused: game.isPaused(),
        closed,
        shaderCompiles: [...shaderCompiles],
        programLinks: [...programLinks],
        canvasCount: document.querySelectorAll('canvas').length,
        backing: { width: canvas.width, height: canvas.height },
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        dpr: devicePixelRatio,
        memory: memory(),
        owned: current
            ? [current.mesh, current.material, current.texture].map((a) => ({
                  id: 'owned-' + current!.id + '-' + a.constructor.name,
                  refCount: a.refCount,
                  isValid: a.isValid,
              }))
            : [],
        events: [...events],
    };
}
function retire(o: Owned): Record<string, unknown> {
    const refs = [o.mesh, o.material, o.texture].map((a) => ({
        id: 'owned-' + o.id + '-' + a.constructor.name,
        kind: a instanceof Material ? 'material' : a instanceof Texture2D ? 'texture' : 'buffer',
        before: a.refCount,
        after: 0,
    }));
    o.renderer.mesh = null;
    o.renderer.setSharedMaterial(null, 0);
    o.material.setProperty('sourceTexture', null);
    const detached = o.renderer.mesh === null && o.renderer.getSharedMaterial(0) === null;
    o.node.removeFromParent();
    o.node.destroy();
    for (let i = 0; i < 3; i++) {
        const a = [o.mesh, o.material, o.texture][i];
        a.decRef();
        a.destroy();
        refs[i].after = a.refCount;
    }
    return { refs, detached, node: o.node };
}
async function destroy(): Promise<Record<string, unknown>> {
    if (!current) return { idempotent: true, refs: [] };
    const o = current;
    current = null;
    const r = retire(o);
    if (clock.stepping) {
        await clock.step(1 / 60);
        await clock.step(1 / 60);
    }
    return { refs: r.refs, detached: r.detached, nodeValid: o.node.isValid, memory: memory() };
}
async function recreate(): Promise<Record<string, unknown>> {
    if (closed) throw new Error('E01_DISPOSED');
    await destroy();
    current = createOwned();
    return snapshot();
}
function beforeUpdate(): void {
    frameStart = performance.now();
    encodingMs = 0;
    submissionMs = 0;
    dispatchMs = 0;
    const start = performance.now();
    if (current) {
        write(current, mode);
    }
    updateMs = performance.now() - start;
}
function afterDraw(): void {
    const raw = [];
    if (test && !performanceCapture) {
        for (let gy = 0; gy < 7; gy++)
            for (let gx = 0; gx < 9; gx++) {
                const x = Math.floor(((gx + 0.5) * canvas.width) / 9),
                    y = Math.floor(((gy + 0.5) * canvas.height) / 7),
                    pixel = new Uint8Array(4);
                gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
                raw.push({ x, y, rgba: Array.from(pixel) });
            }
    }
    latest = {
        raw,
        glError: gl.getError(),
        parameters: { ...parameters },
        mode,
        input,
        contextAlpha: gl.getContextAttributes()?.alpha,
        width: canvas.width,
        height: canvas.height,
        frame: director.getTotalFrames(),
        afterDraw: true,
        stepped: clock.stepped,
    };
    if (performanceCapture) {
        if (warmFrames > 0) warmFrames--;
        else {
            samples.cpuUpdateMs.push(updateMs);
            samples.cpuEncodingMs.push(encodingMs);
            samples.cpuSubmissionMs.push(submissionMs);
            samples.cpuDrawDispatchMs.push(dispatchMs);
            samples.frameMs.push(lastFrameStart ? frameStart - lastFrameStart : 0);
            samples.drawCalls.push(device.numDrawCalls);
            samples.frameNumbers.push(director.getTotalFrames());
        }
        if (samples.frameMs.length >= targetFrames) {
            performanceCapture = false;
            game.pause();
            resolvePerformance?.({ samples, queries: queries.length, snapshot: snapshot() });
            resolvePerformance = null;
        }
    }
    lastFrameStart = frameStart;
}
director.on(Director.EVENT_BEFORE_UPDATE, beforeUpdate);
director.on(Director.EVENT_AFTER_DRAW, afterDraw);
current = createOwned();
app.run(scene);
if (test) {
    clock.begin();
    await clock.step(1 / 60);
    await clock.step(1 / 60);
}
const status = document.querySelector<HTMLOutputElement>('#status')!;
const root = document.querySelector('#parameters')!;
for (const [key, d] of Object.entries(definition.params)) {
    const label = document.createElement('label');
    label.textContent = key;
    const control = document.createElement('input');
    control.id = key;
    control.type = d.type === 'boolean' ? 'checkbox' : 'range';
    if ('min' in d) {
        control.min = String(d.min);
        control.max = String(d.max);
        control.step = String(d.step);
        control.value = String(d.defaultValue);
    } else control.checked = d.defaultValue;
    listen(control, 'input', (event) => {
        events.push({ type: 'input', key, isTrusted: event.isTrusted });
        const values = { ...parameters, [key]: d.type === 'boolean' ? control.checked : Number(control.value) };
        set(values);
        status.textContent = JSON.stringify(parameters);
    });
    label.append(control);
    root.append(label);
}
const button = (id: string, handler: () => unknown) =>
    listen(document.querySelector<HTMLButtonElement>('#' + id)!, 'click', (event) => {
        events.push({ type: id, isTrusted: event.isTrusted });
        Promise.resolve(handler()).then(() => {
            status.textContent = JSON.stringify({ active: !!current, paused: game.isPaused(), updates });
        });
    });
button('pause', () => {
    if (game.isPaused()) game.resume();
    else game.pause();
});
button('reset', async () => {
    parameters = { ...defaults };
    await recreate();
});
button('destroy', destroy);
button('recreate', recreate);
listen(document.querySelector<HTMLSelectElement>('#input')!, 'change', (event) => {
    input = (event.target as HTMLSelectElement).value;
    if (current) current.texture.uploadData(inputBytes(input));
});
let releasePromise: Promise<Record<string, unknown>> | null = null;
function release(): Promise<Record<string, unknown>> {
    if (releasePromise) return releasePromise;
    closed = true;
    releasePromise = (async () => {
        clock.begin();
        const own = await destroy();
        const ownedBackground = retire(background);
        const effectBefore = registered.refCount;
        EffectAsset.remove(registered);
        const registryDetached = EffectAsset.get(registered.name) !== registered;
        registered.decRef();
        registered.destroy();
        abort.abort();
        director.off(Director.EVENT_BEFORE_UPDATE, beforeUpdate);
        director.off(Director.EVENT_AFTER_DRAW, afterDraw);
        for (const element of Array.from(
            document.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input,button,select'),
        ))
            element.disabled = true;
        for (const restore of undo) restore();
        for (const q of queries) gl.deleteQuery(q.query);
        queries.length = 0;
        if (!app.close) throw new Error('E01_CLOSE_UNAVAILABLE');
        await app.close();
        return {
            own,
            ownedBackgroundRefs: ownedBackground.refs,
            effect: {
                before: effectBefore,
                after: registered.refCount,
                registryDetached,
                validAfterClose: registered.isValid,
            },
            listeners: memory().listener,
            controlsDisabled: Array.from(document.querySelectorAll<HTMLInputElement>('input,button,select')).every(
                (el) => el.disabled,
            ),
            instrumentsRestored: restoredChecks.every((check) => check()),
            closed,
        };
    })();
    return releasePromise;
}
listen(window, 'pagehide', () => {
    void release();
});
status.textContent = '就绪 · 原生 pacer';
const api = {
    set,
    snapshot,
    latest: () => latest,
    configure,
    defaults,
    definition,
    step: async () => {
        if (closed) throw new Error('E01_DISPOSED');
        clock.begin();
        await clock.step(1 / 60);
        return latest;
    },
    destroy,
    recreate,
    release,
    setInput: (kind: string) => {
        input = kind;
        if (current) current.texture.uploadData(inputBytes(input));
    },
    pause: () => {
        game.pause();
        return snapshot();
    },
    resume: () => {
        clock.end();
        return snapshot();
    },
    resource: async () => {
        clock.begin();
        await destroy();
        const cycles = [];
        for (let index = 0; index < 100; index++) {
            const before = memory();
            current = createOwned();
            await clock.step(1 / 60);
            const created = memory();
            const active = current;
            const retired = await destroy();
            const after = memory();
            const allocations = (retired.refs as { id: string; kind: string; before: number; after: number }[]).map(
                (r) => ({ id: r.id, kind: r.kind, unit: 'refs', baseline: 0, allocated: r.before, released: r.after }),
            );
            cycles.push({
                index,
                before,
                created,
                after,
                allocations,
                detached: retired.detached,
                nodeValid: active.node.isValid,
            });
        }
        current = createOwned();
        return cycles;
    },
    performance: async (warmup = 30, frames = 60) => {
        clock.end();
        samples = {
            cpuUpdateMs: [],
            cpuEncodingMs: [],
            cpuSubmissionMs: [],
            cpuDrawDispatchMs: [],
            frameMs: [],
            drawCalls: [],
            frameNumbers: [],
        };
        warmFrames = warmup;
        targetFrames = frames;
        performanceCapture = true;
        return await new Promise((resolve) => {
            resolvePerformance = resolve;
        });
    },
    timerResults: async () => {
        if (!timer)
            return { status: 'unavailable', reason: 'EXT_disjoint_timer_query_webgl2 absent in engine context' };
        const start = performance.now();
        while (
            queries.some((q) => !gl.getQueryParameter(q.query, gl.QUERY_RESULT_AVAILABLE)) &&
            performance.now() - start < 10000
        )
            await new Promise((r) => setTimeout(r, 20));
        const disjoint = Boolean(gl.getParameter(timer.GPU_DISJOINT_EXT));
        const observations = queries.map((q) => ({
            frame: q.frame,
            warmup: q.warmup,
            available: Boolean(gl.getQueryParameter(q.query, gl.QUERY_RESULT_AVAILABLE)),
            milliseconds: gl.getQueryParameter(q.query, gl.QUERY_RESULT_AVAILABLE)
                ? Number(gl.getQueryParameter(q.query, gl.QUERY_RESULT)) / 1e6
                : null,
            wasQuery: gl.isQuery(q.query),
            deleted: false,
        }));
        queries.forEach((q, i) => {
            gl.deleteQuery(q.query);
            observations[i].deleted = !gl.isQuery(q.query);
        });
        queries.length = 0;
        const values = observations.filter((q) => q.available && !q.warmup).map((q) => q.milliseconds!);
        return {
            status: values.length === targetFrames && !disjoint ? 'measured' : 'unavailable',
            milliseconds: values,
            observations,
            extension: 'EXT_disjoint_timer_query_webgl2',
            disjoint,
            reason: values.length === targetFrames && !disjoint ? '' : 'query results unavailable/timeout/disjoint',
            scope: 'TOOL_DIAGNOSTIC native commandBuffer.begin/end immediate Cocos GL dispatch; no independent draw',
        };
    },
};
(window as unknown as { __e01: typeof api }).__e01 = api;

// Gallery lifecycle: bridge instance-level createOwned/retire into __lifecycle/__lifecycleHold.
installShaderLifecycle({
    label: 'shader-noise-dissolve',
    isDisposed: () => closed,
    getInstance: () => current,
    createInstance: () => {
        if (closed) throw new Error('E01_DISPOSED'); // terminal guard
        current = createOwned();
        return current;
    },
    retireInstance: (target) => {
        const trace = retire(target) as { refs: { before: number; after: number }[] };
        if (current === (target as unknown)) current = null;
        return trace;
    },
    ownedAssets: (item) => [
        { name: 'noise-mesh', ref: item.mesh },
        { name: 'noise-material', ref: item.material },
        { name: 'noise-texture', ref: item.texture },
    ],
    stepClock: clock.stepping
        ? async () => {
              await clock.step(1 / 60);
          }
        : undefined,
});
