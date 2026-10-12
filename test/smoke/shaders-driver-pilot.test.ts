// W5 Driver Pilot tests: driver contract (validate/compute/frame/atomic reject/release),
// oracle independent replay, pointer→UV math, map-range extremes, auto-animate continuity.
// Pure Node — NODE_CONTRACT, zero browser. The driver TS bundle is built OUTSIDE jsdom.
import type {} from 'jest';
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const oracle = require('../../tools/verify/shaders-driver-pilot-oracle.cjs');

const ROOT = path.resolve(__dirname, '../..');
const tmpBundle = path.join(os.tmpdir(), `driver-pilot-bundle-${process.pid}.cjs`);
const buildScript = `const esbuild=require('esbuild');esbuild.buildSync({entryPoints:['examples/shader-driver-pilot/src/driver.ts'],bundle:true,format:'cjs',platform:'node',outfile:${JSON.stringify(tmpBundle)}});`;
cp.execFileSync(process.execPath, ['-e', buildScript], { cwd: ROOT, stdio: 'pipe', timeout: 30000 });
const driver = require(tmpBundle);
const { validateParams, createDriverState, driverFrame, DRIVER_ERRORS } = driver;
afterAll(() => {
    try {
        fs.unlinkSync(tmpBundle);
    } catch {
        /* ok */
    }
});

describe('W5 driver: validation', () => {
    const valid = () => ({ target: 'neon.intensity', binding: { source: 'pointer', axis: 'x' }, defaultValue: 1 });
    test('valid bindings pass', () => {
        expect(validateParams({ bindings: [valid()] }).ok).toBe(true);
    });
    test.each([
        ['null', null],
        ['undefined', undefined],
        ['string', 'x'],
        ['array', [1, 2]],
        ['missing bindings', {}],
        ['bindings not array', { bindings: 'x' }],
    ])('rejects %s', (_l, input) => expect(validateParams(input).ok).toBe(false));
    test('unknown root key rejects', () => {
        expect(validateParams({ bindings: [valid()], ghost: 1 }).ok).toBe(false);
    });
    test('unknown binding key rejects', () => {
        const r = validateParams({
            bindings: [{ target: 'neon.intensity', binding: { source: 'time', ghost: 1 }, defaultValue: 0 }],
        });
        expect(r.errors[0].code).toBe(DRIVER_ERRORS.UNKNOWN_BINDING_KEY);
    });
    test('non-boolean clamp rejects', () => {
        const r = validateParams({
            bindings: [{ target: 'neon.intensity', binding: { source: 'time', clamp: 'false' }, defaultValue: 0 }],
        });
        expect(r.errors[0].code).toBe(DRIVER_ERRORS.INVALID_CLAMP);
    });
    test('NaN defaultValue rejects', () => {
        const r = validateParams({
            bindings: [{ target: 'neon.intensity', binding: { source: 'time' }, defaultValue: NaN }],
        });
        expect(r.errors[0].code).toBe(DRIVER_ERRORS.NAN);
    });
    test('string default rejects', () => {
        const r = validateParams({
            bindings: [{ target: 'neon.intensity', binding: { source: 'time' }, defaultValue: 'one' }],
        });
        expect(r.errors[0].code).toBe(DRIVER_ERRORS.NAN);
    });
    test('missing default rejects', () => {
        expect(validateParams({ bindings: [{ target: 'neon.intensity', binding: { source: 'time' } }] }).ok).toBe(
            false,
        );
    });
    test('partial map-range rejects', () => {
        const r = validateParams({
            bindings: [{ target: 'neon.intensity', binding: { source: 'time', inputMin: 0 }, defaultValue: 0 }],
        });
        expect(r.errors[0].code).toBe(DRIVER_ERRORS.PARTIAL_RANGE);
    });
    test('duplicate target rejects', () => {
        expect(validateParams({ bindings: [valid(), valid()] }).ok).toBe(false);
    });
    test('backwards range rejects', () => {
        const r = validateParams({
            bindings: [
                {
                    target: 'neon.intensity',
                    binding: { source: 'time', inputMin: 1, inputMax: 0, outputMin: 0, outputMax: 1 },
                    defaultValue: 0,
                },
            ],
        });
        expect(r.errors[0].code).toBe(DRIVER_ERRORS.BACKWARDS_RANGE);
    });
    test('zero range rejects', () => {
        const r = validateParams({
            bindings: [
                {
                    target: 'neon.intensity',
                    binding: { source: 'time', inputMin: 1, inputMax: 1, outputMin: 0, outputMax: 1 },
                    defaultValue: 0,
                },
            ],
        });
        expect(r.errors[0].code).toBe(DRIVER_ERRORS.ZERO_RANGE);
    });
    test('unknown source rejects', () => {
        expect(
            validateParams({ bindings: [{ target: 'neon.intensity', binding: { source: 'gps' }, defaultValue: 0 }] })
                .errors[0].code,
        ).toBe(DRIVER_ERRORS.UNKNOWN_SOURCE);
    });
    test('negative period rejects', () => {
        expect(
            validateParams({
                bindings: [{ target: 'neon.intensity', binding: { source: 'auto', period: -1 }, defaultValue: 0 }],
            }).errors[0].code,
        ).toBe(DRIVER_ERRORS.NEGATIVE_PERIOD);
    });
    test('returned values are deep copies (caller mutation cannot corrupt)', () => {
        const data = { bindings: [valid()] };
        const accepted = validateParams(data);
        data.bindings[0].binding.source = 'corrupted';
        expect(accepted.values[0].binding.source).toBe('pointer');
    });
});

describe('W5 driver: frame computation', () => {
    const params = [
        { target: 'px', binding: { source: 'pointer', axis: 'x' }, defaultValue: 0 },
        { target: 'py', binding: { source: 'pointer', axis: 'y' }, defaultValue: 0 },
        { target: 'uv', binding: { source: 'pointer', axis: 'uv' }, defaultValue: { x: 0.5, y: 0.5 } },
        { target: 't', binding: { source: 'time' }, defaultValue: 0 },
        { target: 'auto', binding: { source: 'auto', period: 1, amplitude: 1, phase: 0 }, defaultValue: 0 },
    ];
    test('pointer position maps to normalized UV', () => {
        const state = createDriverState();
        const r = driverFrame(state, { pointer: { x: 0.75, y: 0.3 }, deltaTime: 1 / 60 }, params);
        expect(r.px).toBe(0.75);
        expect(r.py).toBe(0.3);
    });
    test('axis=uv preserves both coordinates', () => {
        const state = createDriverState();
        const r = driverFrame(state, { pointer: { x: 0.2, y: 0.8 }, deltaTime: 0.1 }, params);
        expect(r.uv).toEqual({ x: 0.2, y: 0.8 });
    });
    test('time accumulates over frames', () => {
        const state = createDriverState();
        driverFrame(state, { pointer: { x: 0.5, y: 0.5 }, deltaTime: 0.1 }, params);
        driverFrame(state, { pointer: { x: 0.5, y: 0.5 }, deltaTime: 0.2 }, params);
        const r = driverFrame(state, { pointer: { x: 0.5, y: 0.5 }, deltaTime: 0.3 }, params);
        expect(r.t).toBeCloseTo(0.6, 10);
    });
    test('pause freezes time', () => {
        const state = createDriverState();
        driverFrame(state, { pointer: { x: 0.5, y: 0.5 }, deltaTime: 0.1 }, params);
        state.paused = true;
        const r = driverFrame(state, { pointer: { x: 0.5, y: 0.5 }, deltaTime: 0.5 }, params);
        expect(r.t).toBeCloseTo(0.1, 10);
    });
    test('auto-animate is continuous and periodic', () => {
        const state = createDriverState();
        driverFrame(state, { pointer: { x: 0, y: 0 }, deltaTime: 0.25 }, params);
        const r = driverFrame(state, { pointer: { x: 0, y: 0 }, deltaTime: 0 }, params);
        expect(r.auto).toBeCloseTo(1, 5);
    });
    test('released driver throws DRIVER_DISPOSED', () => {
        const state = createDriverState();
        state.released = true;
        expect(() => driverFrame(state, null, params)).toThrow('DRIVER_DISPOSED');
    });
    test('non-finite pointer rejects before state changes', () => {
        const state = createDriverState();
        const before = JSON.stringify(state);
        expect(() => driverFrame(state, { pointer: { x: NaN, y: 0.5 }, deltaTime: 0.1 }, params)).toThrow();
        expect(JSON.stringify(state)).toBe(before);
    });
    test('negative dt rejects', () => {
        const state = createDriverState();
        expect(() => driverFrame(state, { pointer: { x: 0.5, y: 0.5 }, deltaTime: -1 }, params)).toThrow();
    });
});

describe('W5 driver: map-range', () => {
    test('clamps out-of-range input', () => {
        const params = [
            {
                target: 'neon.thickness',
                binding: { source: 'pointer', axis: 'x', inputMin: 0, inputMax: 1, outputMin: -2, outputMax: 2 },
                defaultValue: 0,
            },
        ];
        const r = driverFrame(createDriverState(), { pointer: { x: 1.5, y: 0 }, deltaTime: 0 }, params);
        expect(r['neon.thickness']).toBe(2);
    });
    test('extrapolates when clamp is false', () => {
        const params = [
            {
                target: 'neon.thickness',
                binding: {
                    source: 'pointer',
                    axis: 'x',
                    inputMin: 0,
                    inputMax: 1,
                    outputMin: 0,
                    outputMax: 1,
                    clamp: false,
                },
                defaultValue: 0,
            },
        ];
        const r = driverFrame(createDriverState(), { pointer: { x: 2, y: 0 }, deltaTime: 0 }, params);
        expect(r['neon.thickness']).toBe(2);
    });
    test('midpoint maps correctly', () => {
        const params = [
            {
                target: 'neon.thickness',
                binding: { source: 'pointer', axis: 'x', inputMin: 0, inputMax: 1, outputMin: 0, outputMax: 10 },
                defaultValue: 0,
            },
        ];
        const r = driverFrame(createDriverState(), { pointer: { x: 0.5, y: 0 }, deltaTime: 0 }, params);
        expect(r['neon.thickness']).toBe(5);
    });
});

describe('W5 driver: independent oracle replay', () => {
    test('oracle replay matches production driver outputs', () => {
        const params = [
            {
                target: 'rot',
                binding: { source: 'pointer', axis: 'x', inputMin: 0, inputMax: 1, outputMin: 0, outputMax: 360 },
                defaultValue: 0,
            },
            { target: 'int', binding: { source: 'auto', period: 4, amplitude: 0.3 }, defaultValue: 0.5 },
        ];
        const state = createDriverState();
        const frames = [];
        for (let i = 0; i < 5; i++) {
            const pointer = { x: 0.2 + i * 0.15, y: 0.5 };
            const outputs = driverFrame(state, { pointer, deltaTime: 1 / 60 }, params);
            frames.push({ frame: i + 1, dt: 1 / 60, pointer, outputs });
        }
        const replayed = oracle.replay(frames, params);
        for (let i = 0; i < frames.length; i++) {
            expect(replayed[i].outputs.rot).toBeCloseTo(frames[i].outputs.rot, 8);
            expect(replayed[i].outputs.int).toBeCloseTo(frames[i].outputs.int, 8);
        }
    });
    test('oracle pointerToUV matches CSS rect normalization (v-up)', () => {
        const rect = { left: 10, top: 20, width: 620, height: 360 };
        const uv = oracle.pointerToUV(320, 200, rect);
        expect(uv.x).toBeCloseTo((320 - 10) / 620, 10);
        expect(uv.y).toBeCloseTo(1 - (200 - 20) / 360, 10);
    });
    test('oracle validateBindings rejects unknown source', () => {
        expect(oracle.validateBindings([{ target: 'x', binding: { source: 'wifi' } }]).errors.length).toBeGreaterThan(
            0,
        );
    });
});

describe('W5 driver: consumer field separation', () => {
    test('holographic and neon targets receive distinct values', () => {
        const params = [
            { target: 'holographic.rotation', binding: { source: 'pointer', axis: 'x' }, defaultValue: 0 },
            { target: 'neon.intensity', binding: { source: 'pointer', axis: 'y' }, defaultValue: 1 },
        ];
        const r = driverFrame(createDriverState(), { pointer: { x: 0.9, y: 0.1 }, deltaTime: 0 }, params);
        expect(r['holographic.rotation']).toBe(0.9);
        expect(r['neon.intensity']).toBe(0.1);
        expect(r['holographic.rotation']).not.toBe(r['neon.intensity']);
    });
});
