/* CPU fault-injection tests for the real Spark renderer, not GPU acceptance evidence.
 * Run: node --test tools/verify/spark-renderer-lifecycle.test.cjs
 * Uses installed TypeScript, or Node's built-in type erasure when dependencies are unavailable.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const filename = path.resolve(__dirname, '../../src/air/spark/cocos-renderer.ts');
const source = fs.readFileSync(filename, 'utf8');
let javascript;
try {
    const ts = require('typescript');
    javascript = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
} catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    const { stripTypeScriptTypes } = require('node:module');
    assert.equal(typeof stripTypeScriptTypes, 'function', 'Install the project TypeScript dependency on older Node');
    javascript = stripTypeScriptTypes(source, { mode: 'transform' });
}
// The tested methods need only their explicit device/GL collaborators. Load the complete
// renderer class without importing the browser-only runtime or replacing method bodies.
javascript = javascript
    .replace(/^import\b[\s\S]*?;\s*$/gm, '')
    .replace('export class CocosRenderer', 'class CocosRenderer');
const CocosRenderer = new Function(`${javascript}\nreturn CocosRenderer;`)();

function resource() {
    return {
        destroyed: 0,
        destroy() {
            this.destroyed++;
        },
        update() {},
    };
}

function rendererFixture(failure) {
    const renderer = Object.create(CocosRenderer.prototype);
    const staging = resource();
    const native = { name: 'staging' };
    staging.getGpuBuffer = () => ({ glBuffer: native });
    const fence = {};
    const priorRead = { name: 'read' },
        priorDraw = { name: 'draw' },
        priorPack = { name: 'pack' };
    const state = { read: priorRead, draw: priorDraw, pack: priorPack, align: 8 };
    const calls = { deletedFences: [], reads: 0 };
    const gl = {
        READ_FRAMEBUFFER_BINDING: 1,
        DRAW_FRAMEBUFFER_BINDING: 2,
        PIXEL_PACK_BUFFER_BINDING: 3,
        PACK_ALIGNMENT: 4,
        FRAMEBUFFER: 5,
        READ_FRAMEBUFFER: 6,
        DRAW_FRAMEBUFFER: 7,
        PIXEL_PACK_BUFFER: 8,
        FRAMEBUFFER_COMPLETE: 9,
        COLOR_ATTACHMENT0: 10,
        SYNC_GPU_COMMANDS_COMPLETE: 11,
        WAIT_FAILED: 12,
        TIMEOUT_EXPIRED: 13,
        getParameter(key) {
            return { 1: state.read, 2: state.draw, 3: state.pack, 4: state.align }[key];
        },
        bindFramebuffer(target, value) {
            if (target === this.FRAMEBUFFER || target === this.READ_FRAMEBUFFER) state.read = value;
            if (target === this.FRAMEBUFFER || target === this.DRAW_FRAMEBUFFER) state.draw = value;
        },
        bindBuffer(target, value) {
            state.pack = value;
        },
        pixelStorei(key, value) {
            state.align = value;
        },
        checkFramebufferStatus() {
            return failure === 'framebuffer' ? 0 : this.FRAMEBUFFER_COMPLETE;
        },
        readBuffer() {},
        readPixels() {
            calls.reads++;
            if (failure === 'readPixels') throw new Error(failure);
        },
        fenceSync() {
            if (failure === 'fenceSync') throw new Error(failure);
            return failure === 'nullFence' ? null : fence;
        },
        flush() {
            if (failure === 'flush') throw new Error(failure);
        },
        isContextLost() {
            return failure === 'contextLost';
        },
        clientWaitSync() {
            return failure === 'waitFailed' ? this.WAIT_FAILED : 0;
        },
        getBufferSubData() {
            if (failure === 'getBufferSubData') throw new Error(failure);
        },
        deleteSync(value) {
            calls.deletedFences.push(value);
        },
    };
    const nativeState = {};
    const gpu = { glFramebuffer: {}, gpuColorViews: [] };
    const target = { isCocosRenderTarget: true, _cocosFramebuffer: { colorTextures: [{ gpuTexture: {} }] } };
    Object.assign(renderer, {
        gl,
        _layer: 0,
        _owned: new Set(),
        _liveMaterials: new Set(),
        _liveGeometries: new Set(),
        info: { memory: {} },
        cmd: resource(),
        ownsApp: false,
        setAnimationLoop() {},
        g: {
            BufferInfo: class {},
            BufferUsageBit: { VERTEX: 1, TRANSFER_DST: 2 },
            MemoryUsageBit: { HOST: 1, DEVICE: 2 },
        },
        device: { createBuffer: () => staging, getStateCache: () => nativeState },
        _framebuffer: () => ({ framebuffer: { getGpuFramebuffer: () => gpu } }),
    });
    return { renderer, staging, fence, state, priorRead, priorDraw, priorPack, calls, target };
}

for (const failure of [
    'framebuffer',
    'readPixels',
    'fenceSync',
    'nullFence',
    'flush',
    'contextLost',
    'waitFailed',
    'getBufferSubData',
]) {
    test(`asynchronous readback releases staging and restores bindings after ${failure}`, async () => {
        const f = rendererFixture(failure);
        await assert.rejects(f.renderer.readRenderTargetPixelsAsync(f.target, 0, 0, 1, 1, new Uint8Array(4)));
        assert.equal(f.staging.destroyed, 1, 'staging must be destroyed exactly once');
        assert.equal(f.renderer._owned.size, 0);
        assert.deepEqual(f.state, { read: f.priorRead, draw: f.priorDraw, pack: f.priorPack, align: 8 });
        assert.equal(
            f.calls.deletedFences.length,
            ['framebuffer', 'readPixels', 'fenceSync', 'nullFence'].includes(failure) ? 0 : 1,
        );
    });
}

test('successful asynchronous readback returns the caller buffer and releases owned resources', async () => {
    const f = rendererFixture();
    const buffer = new Uint8Array(4);
    assert.equal(await f.renderer.readRenderTargetPixelsAsync(f.target, 0, 0, 1, 1, buffer), buffer);
    assert.equal(f.staging.destroyed, 1);
    assert.deepEqual(f.calls.deletedFences, [f.fence]);
    assert.equal(f.renderer._owned.size, 0);
    assert.deepEqual(f.state, { read: f.priorRead, draw: f.priorDraw, pack: f.priorPack, align: 8 });
});

test('renderer disposal while readback is pending does not destroy staging twice', async () => {
    const f = rendererFixture();
    let poll;
    f.renderer.gl.clientWaitSync = () => f.renderer.gl.TIMEOUT_EXPIRED;
    const originalTimeout = global.setTimeout;
    global.setTimeout = (callback) => {
        poll = callback;
        return 1;
    };
    try {
        const result = f.renderer.readRenderTargetPixelsAsync(f.target, 0, 0, 1, 1, new Uint8Array(4));
        f.renderer.dispose();
        poll();
        await assert.rejects(result, /Context lost/);
        assert.equal(f.staging.destroyed, 1);
        assert.deepEqual(f.calls.deletedFences, [f.fence]);
    } finally {
        global.setTimeout = originalTimeout;
    }
});

test('disposing each replaced material program releases only its cached geometry allocations', () => {
    const renderer = Object.create(CocosRenderer.prototype);
    Object.assign(renderer, {
        _materials: new WeakMap(),
        _geometries: new WeakMap(),
        _geometryListeners: new WeakSet(),
        _liveMaterials: new Set(),
        _liveGeometries: new Set(),
        _owned: new Set(),
        info: { memory: { geometries: 0 }, programs: [] },
        g: {
            Attribute: class {},
            BufferInfo: class {},
            InputAssemblerInfo: class {},
            Format: { RGB32F: 1 },
            BufferUsageBit: { VERTEX: 1, TRANSFER_DST: 2 },
            MemoryUsageBit: { HOST: 1, DEVICE: 2 },
        },
        device: { createBuffer: () => resource(), createInputAssembler: () => resource() },
    });
    const geometry = { attributes: { position: { array: new Float32Array(9), itemSize: 3, version: 0 } } };
    const makeMaterial = () => {
        const material = {};
        const entry = {
            program: {},
            psos: new Map(),
            ds: resource(),
            pl: resource(),
            layout: resource(),
            shader: { ...resource(), gpuShader: { glInputs: [{ glLoc: 0, name: 'position' }] } },
        };
        for (const value of [entry.ds, entry.pl, entry.layout, entry.shader]) renderer._own(value);
        renderer._materials.set(material, entry);
        renderer._liveMaterials.add(entry);
        return { material, entry, geometryEntry: renderer._geometry(geometry, entry) };
    };
    const retained = makeMaterial();
    for (let i = 0; i < 20; i++) {
        const replaced = makeMaterial();
        renderer._disposeMaterial(replaced.material);
        assert.equal(replaced.geometryEntry.ia.destroyed, 1);
        assert.ok(replaced.geometryEntry.buffers.every((buffer) => buffer.destroyed === 1));
        assert.equal(renderer._liveGeometries.size, 1, 'only the retained program may keep geometry resources');
        assert.equal(renderer._geometries.get(geometry).size, 1, 'retired program keys must leave the cache');
        assert.equal(retained.geometryEntry.ia.destroyed, 0, 'another material using the geometry remains usable');
    }
    renderer._disposeMaterial(retained.material);
    renderer._disposeGeometry(geometry);
    assert.equal(renderer._owned.size, 0);
    assert.equal(renderer.info.memory.geometries, 0);
    assert.equal(retained.geometryEntry.ia.destroyed, 1);
});
