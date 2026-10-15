// NODE_CONTRACT only: fake GL state exercises restoration, never GPU acceptance.
import { nodeRequire } from '../shims';
const fs = nodeRequire('fs');
const path = nodeRequire('path');
const D = nodeRequire(path.resolve('tools/verify/driver-pixel-diagnostics.cjs'));
const P = nodeRequire(path.resolve('tools/verify/example-specialized-probes.cjs'));
const O = nodeRequire(path.resolve('tools/verify/shaders-driver-pilot-oracle.cjs'));
const B = nodeRequire(path.resolve('tools/verify/shaders-driver-pilot-browser.cjs'));
const fragment = fs.readFileSync('examples/shader-holographic/src/holographic.frag', 'utf8');
const scope = { id: P.ID, mode: 'primary', query: '', viewport: { width: 480, height: 360 } };
function rawPixels() {
    const time = 1 / 60;
    const bindings = B.bindingsFor('holographic', 'time');
    const outputs = Object.fromEntries(bindings.map((p: any) => [p.target, O.computeBinding(p.binding, { time }, {})]));
    const pixels = O.points('holographic', 480, 360).map((p: any) => ({
        ...p,
        rgba: O.linearBytes(O.pixel('holographic', outputs, time, 480, 360, p.x, p.y)),
    }));
    pixels.find((p: any) => p.x === 240 && p.y === 72).rgba[3] += 4;
    return { errors: [], stepped: { time, outputs, canvas: { width: 480, height: 360 } }, probe: { pixels } };
}
function fakeBrowser(fault = '') {
    let serial = 0;
    const resources: any[] = [];
    const trace: any = { observing: 0, calls: { product: 0 }, reads: {}, harnessCalls: {} };
    const calls: any[] = [];
    const resource = (kind: string, original = false) => {
        const value = { id: ++serial, kind, alive: true, original, shaders: [] as any[] };
        resources.push(value);
        return value;
    };
    const originalProgram = resource('Program', true),
        vao = resource('VertexArray', true),
        buffer = resource('Buffer', true),
        ebo = resource('Buffer', true),
        texture = resource('Texture', true),
        framebuffer = resource('Framebuffer', true);
    let triggered = false;
    const fail = (name: string) => {
        if (!triggered && fault === name) {
            triggered = true;
            throw Error('CPU injected ' + name);
        }
    };
    const constants: any = { DRAW_BUFFER0: 100, MAX_DRAW_BUFFERS: 'MAX_DRAW_BUFFERS' };
    const state: any = {
        CURRENT_PROGRAM: originalProgram,
        VERTEX_ARRAY_BINDING: vao,
        ELEMENT_ARRAY_BUFFER_BINDING: ebo,
        DRAW_FRAMEBUFFER_BINDING: framebuffer,
        READ_FRAMEBUFFER_BINDING: framebuffer,
        READ_BUFFER: 'COLOR_ATTACHMENT0',
        100: 'COLOR_ATTACHMENT0',
        MAX_DRAW_BUFFERS: 1,
        UNIFORM_BUFFER_BINDING: buffer,
        PIXEL_PACK_BUFFER_BINDING: null,
        VIEWPORT: [0, 0, 480, 360],
        SCISSOR_BOX: [0, 0, 480, 360],
        COLOR_WRITEMASK: [true, true, true, true],
        COLOR_CLEAR_VALUE: [0, 0, 0, 0],
        ACTIVE_TEXTURE: 'TEXTURE3',
        PACK_ALIGNMENT: 4,
        PACK_ROW_LENGTH: 0,
        PACK_SKIP_PIXELS: 0,
        PACK_SKIP_ROWS: 0,
        SAMPLES: 0,
        VERSION: 'CPU fake WebGL2',
        SHADING_LANGUAGE_VERSION: 'CPU fake GLSL',
        VENDOR: 'CPU fixture',
        RENDERER: 'CPU fixture',
    };
    const enabled = new Set(['DITHER', 'SCISSOR_TEST']);
    const textures: any = { TEXTURE0: texture, TEXTURE3: texture };
    const ubos: any = { 2: { buffer, offset: 16, size: 64 } };
    let selector = 0;
    const source: any = {
        getParameter: (name: any) => {
            if (name === 'TEXTURE_BINDING_2D') {
                if (resources.some((r) => r.kind === 'Program' && !r.original)) fail('cleanup-query');
                else if ((window as any)[D.KEY]?.isStopped()) fail('texture-query');
                return textures[state.ACTIVE_TEXTURE] || null;
            }
            return state[name];
        },
        getIndexedParameter: (name: string, binding: number) =>
            ({
                UNIFORM_BUFFER_BINDING: ubos[binding]?.buffer || null,
                UNIFORM_BUFFER_START: ubos[binding]?.offset || 0,
                UNIFORM_BUFFER_SIZE: ubos[binding]?.size || 0,
            })[name],
        getContextAttributes: () => ({ alpha: true }),
        getShaderPrecisionFormat: () => ({ rangeMin: 127, rangeMax: 127, precision: 23 }),
        getProgramParameter: (_p: any, name: string) => {
            if (name === 'LINK_STATUS') return fault !== 'link' || _p.original;
            return { ACTIVE_UNIFORM_BLOCKS: 1, ACTIVE_UNIFORMS: 1, ACTIVE_ATTRIBUTES: 1 }[name];
        },
        getProgramInfoLog: () => 'CPU link log',
        getActiveUniformBlockName: () => 'Constants',
        getActiveUniformBlockParameter: (_p: any, _i: number, name: string) =>
            name === 'UNIFORM_BLOCK_BINDING' ? 2 : 64,
        getActiveUniforms: () => [0],
        getUniformBlockIndex: () => 0,
        getActiveAttrib: () => ({ name: 'a_position', type: 'FLOAT_VEC3', size: 1 }),
        getAttribLocation: () => 0,
        getBufferParameter: () => 128,
        getBufferSubData: (_target: any, _offset: any, bytes: any) => {
            fail('capture');
            bytes.fill(23);
        },
        bindBuffer: (target: string, value: any) => {
            state[target + '_BINDING'] = value;
        },
        bindBufferBase: (_target: string, binding: number, value: any) => {
            ubos[binding] = { buffer: value, offset: 0, size: 0 };
            state.UNIFORM_BUFFER_BINDING = value;
        },
        bindBufferRange: (_target: string, binding: number, value: any, offset: number, size: number) => {
            ubos[binding] = { buffer: value, offset, size };
            state.UNIFORM_BUFFER_BINDING = value;
        },
        bindVertexArray: (value: any) => {
            state.VERTEX_ARRAY_BINDING = value;
        },
        bindFramebuffer: (target: string, value: any) => {
            if (target === 'FRAMEBUFFER' || target === 'DRAW_FRAMEBUFFER') state.DRAW_FRAMEBUFFER_BINDING = value;
            if (target === 'FRAMEBUFFER' || target === 'READ_FRAMEBUFFER') state.READ_FRAMEBUFFER_BINDING = value;
        },
        activeTexture: (value: any) => {
            state.ACTIVE_TEXTURE = value;
        },
        bindTexture: (_target: any, value: any) => {
            textures[state.ACTIVE_TEXTURE] = value;
        },
        useProgram: (value: any) => {
            state.CURRENT_PROGRAM = value;
        },
        viewport: (...value: any[]) => {
            state.VIEWPORT = value;
        },
        scissor: (...value: any[]) => {
            state.SCISSOR_BOX = value;
        },
        colorMask: (...value: any[]) => {
            state.COLOR_WRITEMASK = value;
        },
        clearColor: (...value: any[]) => {
            state.COLOR_CLEAR_VALUE = value;
        },
        isEnabled: (name: string) => enabled.has(name),
        enable: (name: string) => enabled.add(name),
        disable: (name: string) => enabled.delete(name),
        pixelStorei: (name: string, value: any) => {
            state[name] = value;
        },
        texStorage2D: () => fail('allocation'),
        framebufferTexture2D: () => {},
        drawBuffers: () => {},
        readBuffer: () => {},
        checkFramebufferStatus: () => (fault === 'framebuffer' ? 'INCOMPLETE' : 'FRAMEBUFFER_COMPLETE'),
        bufferData: () => {},
        uniformBlockBinding: () => {},
        bindAttribLocation: () => {},
        shaderSource: (shader: any, text: string) => {
            shader.source = text;
        },
        compileShader: () => {},
        getShaderParameter: () => fault !== 'compile',
        getShaderInfoLog: () => 'CPU compile log',
        attachShader: (program: any, shader: any) => program.shaders.push(shader),
        linkProgram: () => {},
        getUniformLocation: () => ({}),
        uniform1i: (_location: any, index: number) => {
            selector = index;
        },
        clear: () => {},
        readPixels: (x: number, y: number, _w: number, _h: number, _format: any, _type: any, bytes: Uint8Array) => {
            fail('readback');
            const instrumented = state.CURRENT_PROGRAM.shaders.some((s: any) =>
                s.source.includes('driverDiagnosticIndex'),
            );
            if (instrumented) new DataView(bytes.buffer).setFloat32(0, selector + 0.25, true);
            else bytes.set(rawPixels().probe.pixels.find((p: any) => p.x === x && p.y === y).rgba);
            if (fault === 'replay-byte') bytes[0] ^= 1;
        },
        getError: () => {
            throw Error('Diagnostic must never consume the original GL error queue');
        },
    };
    for (const kind of ['Program', 'Shader', 'Buffer', 'Texture', 'Framebuffer']) {
        source['create' + kind] = () => resource(kind);
        source['delete' + kind] = (object: any) => {
            object.alive = false;
            if (kind === 'Program') fail('cleanup-delete');
        };
        source['is' + kind] = (object: any) => !!object?.alive;
    }
    source.isVertexArray = (object: any) => !!object?.alive;
    let gl: any;
    for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'])
        source[method] = function (...args: any[]) {
            calls.push({
                method,
                args,
                receiver: this,
                observing: trace.observing,
                product: state.CURRENT_PROGRAM === originalProgram,
            });
            if (state.CURRENT_PROGRAM === originalProgram) trace.calls.product++;
            return 17;
        };
    gl = new Proxy(source, {
        get: (object, prop: string) =>
            prop in object
                ? object[prop]
                : prop in constants
                  ? constants[prop]
                  : typeof prop === 'string' && /^[A-Z0-9_]+$/.test(prop)
                    ? prop
                    : undefined,
    });
    const material = {
        passes: [
            {
                getShaderVariant: () => ({
                    gpuShader: {
                        glProgram: originalProgram,
                        name: 'driver-holographic',
                        gpuStages: [
                            { type: 1, source: 'precision highp float; void main() { gl_Position = vec4(0.0); }' },
                            { type: 16, source: fragment },
                        ],
                    },
                }),
            },
        ],
    };
    const renderer = {
        getSharedMaterial: () => material,
        model: { subModels: [{ shaders: [material.passes[0].getShaderVariant()] }] },
    };
    const hook = { snapshot: () => ({ currentInstance: 1 }) };
    trace.app = { getScene: () => ({ getChildByName: () => ({ getComponent: () => renderer }) }) };
    Object.assign(window, {
        __apiTrace: trace,
        __driverpilot: hook,
        __CPU_DIAGNOSTIC_CC: {
            MeshRenderer: {},
            gfx: { ShaderStageFlagBit: { VERTEX: 1 } },
        },
    });
    const query = jest.spyOn(document, 'querySelector').mockReturnValue({ getContext: () => gl } as any);
    const originalMethods = Object.fromEntries(
        ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'].map((name) => [name, gl[name]]),
    );
    const stateSnapshot = () => JSON.stringify({ state, enabled: [...enabled].sort(), textures, ubos });
    const initial = stateSnapshot();
    const page = {
        evaluate: async (fn: any, arg: any) => {
            const source = fn
                .toString()
                .replace("await import('/build/cocosair.module.js')", 'window.__CPU_DIAGNOSTIC_CC');
            return new Function('arg', 'return (' + source + ')(arg)')(arg);
        },
    };
    return {
        gl,
        trace,
        calls,
        resources,
        page,
        originalMethods,
        stateSnapshot,
        initial,
        cleanup: () => {
            query.mockRestore();
            for (const key of ['__apiTrace', '__driverpilot', '__CPU_DIAGNOSTIC_CC', D.KEY])
                delete (window as any)[key];
        },
    };
}
describe('Driver pixel diagnostic replay (synthetic CPU only)', () => {
    test('labels source reconstruction and does not alter the shader before its instrumentation point', () => {
        const output = D.instrumentFragment(fragment);
        expect(output.split(D.ANCHOR)[0].replace('uniform highp int driverDiagnosticIndex;\n', '')).toBe(
            fragment.split(D.ANCHOR)[0],
        );
        expect(output).toContain('floatBitsToUint(driverDiagnosticValue)');
        expect(D.FIELDS).toContain('dot(f, f)');
        expect(D.FIELDS).toContain('length(f)');
        expect(() => D.instrumentFragment(fragment + fragment)).toThrow(/not unique/);
        expect(() => D.instrumentFragment('void main() {}')).toThrow(/not unique/);
    });
    test('diagnostic mismatch selection keeps original point, bytes and tolerance', () => {
        const raw = rawPixels(),
            before = JSON.stringify(raw);
        expect(D.mismatchDetails(raw)).toEqual([
            {
                x: 240,
                y: 72,
                actual: [240, 255, 235, 70],
                expected: [240, 255, 235, 66],
                delta: [0, 0, 0, 4],
                tolerance: 2,
            },
        ]);
        expect(JSON.stringify(raw)).toBe(before);
        raw.probe.pixels.find((p: any) => p.x === 240 && p.y === 72).rgba[3] = 68;
        expect(D.mismatchDetails(raw)).toEqual([]);
    });
    test('diagnostics cannot promote incomplete or original failed canonical evidence', () => {
        const raw: any = rawPixels();
        const expected = P.validateProbe(raw, scope);
        raw.pixelDiagnostics = {
            schema: D.SCHEMA,
            diagnosticOnly: true,
            status: 'PASS',
            canonicalEffect: 'none',
            unchangedReplay: { exact: true },
            intermediates: [{ field: 'transition', value: 66 / 255 }],
        };
        expect(P.validateProbe(raw, scope)).toEqual(expected);
        expect(expected.ok).toBe(false);
        expect(fs.readFileSync('tools/verify/driver-pixel-diagnostics.cjs', 'utf8')).not.toMatch(/\.getError\s*\(/);
    });
    test('observes actual callback synchronously, replays unchanged bytes first, and restores every owned state', async () => {
        const f = fakeBrowser(),
            token = D.createToken(),
            raw = rawPixels(),
            canonicalBefore = JSON.stringify(raw);
        try {
            await D.prepare(f.page, token);
            expect(f.gl.drawElements('TRIANGLES', 6, 'UNSIGNED_SHORT', 0)).toBe(17);
            expect({ ...f.calls[0], receiver: undefined }).toEqual({
                method: 'drawElements',
                args: ['TRIANGLES', 6, 'UNSIGNED_SHORT', 0],
                receiver: undefined,
                observing: 0,
                product: true,
            });
            expect(f.calls[0].receiver).toBe(f.gl);
            const result = await D.finish(f.page, raw, false, token);
            expect(result.status).toBe('observed');
            expect(result.diagnosticOnly).toBe(true);
            expect(result.canonicalEffect).toBe('none');
            expect(result.sourceProvenance.independentGetShaderSource).toBe(false);
            expect(result.sourceProvenance.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
            expect(result.unchangedReplay.exact).toBe(true);
            expect(result.intermediates).toHaveLength(D.FIELDS.length);
            expect(result.intermediates[0].pixels[0]).toMatchObject({ value: 0.25, bits: '3e800000' });
            expect(result.glErrorQueue).toBe('unread-preserved');
            expect(result.glErrorFreeClaim).toBe(false);
            expect(Object.values(result.cleanup)).not.toContain(false);
            expect(result.trace.executionCountsUnchanged).toBe(true);
            expect(f.calls.slice(1).every((c: any) => c.observing === 1 && !c.product)).toBe(true);
            expect(f.trace.observing).toBe(0);
            expect(f.trace.calls.product).toBe(1);
            expect(f.stateSnapshot()).toBe(f.initial);
            expect(JSON.stringify(raw)).toBe(canonicalBefore);
            expect(f.resources.filter((r: any) => !r.original).every((r: any) => !r.alive)).toBe(true);
            for (const [name, method] of Object.entries(f.originalMethods)) expect(f.gl[name]).toBe(method);
            expect((window as any)[D.KEY]).toBeUndefined();
        } finally {
            f.cleanup();
        }
    });
    test.each([
        'capture',
        'texture-query',
        'allocation',
        'compile',
        'link',
        'framebuffer',
        'readback',
        'replay-byte',
        'cleanup-query',
        'cleanup-delete',
    ])('retains %s failure and restores other state/resources without canonical mutation', async (fault) => {
        const f = fakeBrowser(fault),
            token = D.createToken(),
            raw = rawPixels(),
            original = JSON.stringify(raw);
        try {
            await D.prepare(f.page, token);
            f.gl.drawElements('TRIANGLES', 6, 'UNSIGNED_SHORT', 0);
            const result = await D.finish(f.page, raw, false, token);
            expect(result.status).toBe('error');
            expect(result.errors.length).toBeGreaterThan(0);
            if (!fault.startsWith('cleanup-')) expect(result.intermediates).toBeUndefined();
            else expect(result.intermediates).toHaveLength(D.FIELDS.length);
            expect(f.stateSnapshot()).toBe(f.initial);
            expect(f.trace.observing).toBe(0);
            expect(f.trace.calls.product).toBe(1);
            expect(JSON.stringify(raw)).toBe(original);
            expect(f.resources.filter((r: any) => !r.original).every((r: any) => !r.alive)).toBe(true);
            for (const [name, method] of Object.entries(f.originalMethods)) expect(f.gl[name]).toBe(method);
        } finally {
            f.cleanup();
        }
    });
    test.each([0, 2])('requires exactly one canonical matching draw, observed=%i', async (draws) => {
        const f = fakeBrowser(),
            token = D.createToken();
        try {
            await D.prepare(f.page, token);
            for (let i = 0; i < draws; i++) f.gl.drawElements('TRIANGLES', 6, 'UNSIGNED_SHORT', 0);
            const result = await D.finish(f.page, rawPixels(), false, token);
            expect(result.status).toBe('error');
            expect(result.matchingDraws).toBe(draws);
            expect(result.intermediates).toBeUndefined();
            expect(f.resources.filter((r: any) => !r.original)).toHaveLength(0);
        } finally {
            f.cleanup();
        }
    });
    test('rejects silently blocked wrapper installation and rolls back every installed method', async () => {
        const f = fakeBrowser(),
            token = D.createToken();
        try {
            Object.defineProperty(f.gl, 'drawElements', {
                value: f.originalMethods.drawElements,
                writable: false,
                configurable: false,
            });
            await expect(D.prepare(f.page, token)).rejects.toThrow(/wrapper installation failed/);
            expect((window as any)[D.KEY]).toBeUndefined();
            for (const [name, method] of Object.entries(f.originalMethods)) expect(f.gl[name]).toBe(method);
            expect(f.trace.observing).toBe(0);
            expect(f.trace.calls.product).toBe(0);
            expect(f.resources.filter((r: any) => !r.original)).toHaveLength(0);
            expect(f.stateSnapshot()).toBe(f.initial);
        } finally {
            f.cleanup();
        }
    });
    test('rejects an existing undefined non-writable session slot before installing any wrapper', async () => {
        const f = fakeBrowser(),
            token = D.createToken();
        const key = '__CPU_UNWRITABLE_DIAGNOSTIC_' + token;
        Object.defineProperty(window, key, { value: undefined, writable: false, configurable: false });
        const descriptor = Object.getOwnPropertyDescriptor(window, key);
        const page = { evaluate: (fn: any, arg: any) => f.page.evaluate(fn, { ...arg, key }) };
        try {
            await expect(D.prepare(page, token)).rejects.toThrow(/session already exists/);
            expect(Object.getOwnPropertyDescriptor(window, key)).toEqual(descriptor);
            for (const [name, method] of Object.entries(f.originalMethods)) expect(f.gl[name]).toBe(method);
            expect(f.trace.observing).toBe(0);
            expect(f.trace.calls.product).toBe(0);
            expect(f.resources.filter((r: any) => !r.original)).toHaveLength(0);
            expect(f.stateSnapshot()).toBe(f.initial);
        } finally {
            f.cleanup();
        }
    });
    test('does not overwrite a session published during the module-import await', async () => {
        const f = fakeBrowser(),
            token = D.createToken();
        const foreign = { token: 'foreign-session' };
        (window as any).__CPU_FOREIGN_SESSION = foreign;
        const page = {
            evaluate: async (fn: any, arg: any) => {
                const source = fn
                    .toString()
                    .replace(
                        "await import('/build/cocosair.module.js')",
                        'await Promise.resolve().then(() => { window[config.key] = window.__CPU_FOREIGN_SESSION; return window.__CPU_DIAGNOSTIC_CC; })',
                    );
                return new Function('arg', 'return (' + source + ')(arg)')(arg);
            },
        };
        try {
            await expect(D.prepare(page, token)).rejects.toThrow(/session already exists/);
            expect((window as any)[D.KEY]).toBe(foreign);
            for (const [name, method] of Object.entries(f.originalMethods)) expect(f.gl[name]).toBe(method);
            expect(f.trace.observing).toBe(0);
            expect(f.resources.filter((r: any) => !r.original)).toHaveLength(0);
        } finally {
            delete (window as any).__CPU_FOREIGN_SESSION;
            f.cleanup();
        }
    });
    test('does not consume a different session or require a GPU for no-mismatch cleanup', async () => {
        const f = fakeBrowser(),
            token = D.createToken();
        try {
            await D.prepare(f.page, token);
            const session = (window as any)[D.KEY];
            await expect(D.prepare(f.page, 'other')).rejects.toThrow(/already exists/);
            const foreign = await D.finish(f.page, rawPixels(), false, 'other');
            expect(foreign.status).toBe('error');
            expect((window as any)[D.KEY]).toBe(session);
            const raw = rawPixels();
            raw.probe.pixels.find((p: any) => p.x === 240 && p.y === 72).rgba[3] -= 4;
            const result = await D.finish(f.page, raw, false, token);
            expect(result.status).toBe('not-needed');
            expect(result.wrappersRestored).toBe(true);
            expect(f.resources.filter((r: any) => !r.original)).toHaveLength(0);
        } finally {
            f.cleanup();
        }
    });
});
