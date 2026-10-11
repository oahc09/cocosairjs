import { defaults, validateParameters, definition } from '../../examples/shader-noise-dissolve/src/parameters';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const oracle = require('../../tools/verify/shaders-noise-dissolve-oracle.cjs');
const contract = require('../../tools/verify/shaders-effect-contract.cjs');
const runner = require('../../tools/verify/shaders-noise-dissolve.cjs');

describe('E01 example-local contracts (synthetic CPU/PNG only, not browser evidence)', () => {
    test('definition matches executable defaults; continuous seed is never rounded', () => {
        expect(contract.validateDefinition(definition).ok).toBe(true);
        expect(validateParameters({ ...defaults, seed: 0.375 }).seed).toBe(0.375);
        expect(contract.validateParameters(definition, defaults).ok).toBe(true);
    });
    test.each([NaN, Infinity, -Infinity, '0.5', null])('rejects invalid numeric values %s', value => {
        expect(() => validateParameters({ ...defaults, progress: value })).toThrow(/^E01_/);
    });
    test.each(['constructor', 'toString', '__proto__', 'ghost'])('rejects own unknown property %s including prototype names', key => {
        const value = { ...defaults };
        Object.defineProperty(value, key, { value: 1, enumerable: true });
        expect(() => validateParameters(value)).toThrow('E01_UNKNOWN_PARAMETER');
    });
    test('null/array/missing/non-plain/accessor input rejected without executing a getter', () => {
        for (const value of [null, [], {}, Object.create({ ...defaults })]) expect(() => validateParameters(value)).toThrow();
        let called = false;
        const value = { ...defaults };
        Object.defineProperty(value, 'seed', { get: () => { called = true; return 0; } });
        expect(() => validateParameters(value)).toThrow('E01_INVALID_PARAMETERS');
        expect(called).toBe(false);
    });
    test('numeric bounds, boolean and whole-record atomicity', () => {
        for (const [name, d] of Object.entries(definition.params)) {
            if ('min' in d) {
                expect(validateParameters({ ...defaults, [name]: d.min })[name as keyof typeof defaults]).toBe(d.min);
                expect(validateParameters({ ...defaults, [name]: d.max })[name as keyof typeof defaults]).toBe(d.max);
                expect(() => validateParameters({ ...defaults, [name]: d.max + 1 })).toThrow('E01_OUT_OF_RANGE');
            }
        }
        expect(() => validateParameters({ ...defaults, invert: 0 })).toThrow('E01_INVALID_TYPE');
        expect(defaults).toEqual({ progress: 0.5, scale: 3, softness: 0.25, seed: 0, invert: false });
    });
    test('Perlin integer lattice is zero; continuity and fixed known lattice hash', () => {
        expect(oracle.perlin(0, 0)).toBe(0);
        expect(oracle.perlin(-5, 3)).toBe(0);
        expect(oracle.hash(0, 0)).toBe(oracle.hash(0, 0));
        expect(oracle.hash(0, 0)).not.toBe(oracle.hash(1, 0));
        expect(Math.abs(oracle.perlin(1 - 1e-5, 0.4) - oracle.perlin(1 + 1e-5, 0.4))).toBeLessThan(0.0001);
    });
    test('front remap endpoints, hard step, invert coverage and monotonic alpha', () => {
        for (const c of [0, 0.01, 0.25, 0.5, 0.99, 1]) for (const softness of [0, 0.0001, 0.25, 1]) {
            expect(oracle.reveal(c, { ...defaults, progress: 0, softness })).toBe(1);
            expect(oracle.reveal(c, { ...defaults, progress: 1, softness })).toBe(0);
            expect(oracle.reveal(c, { ...defaults, progress: 0.2, softness })).toBeGreaterThanOrEqual(oracle.reveal(c, { ...defaults, progress: 0.8, softness }));
        }
        expect(oracle.reveal(0.4, { ...defaults, softness: 0 })).toBe(0);
        expect(oracle.reveal(0.4, { ...defaults, softness: 0, invert: true })).toBe(1);
    });
    test('same continuous seed repeat, different seed differs, aspect matters', () => {
        const p = { ...defaults, seed: 0.375 };
        expect(oracle.coverage(0.42, 0.37, 1.5, p)).toBe(oracle.coverage(0.42, 0.37, 1.5, p));
        expect(oracle.coverage(0.42, 0.37, 1.5, p)).not.toBe(oracle.coverage(0.42, 0.37, 1.5, { ...p, seed: 0.625 }));
        expect(oracle.coverage(0.42, 0.37, 1.5, p)).not.toBe(oracle.coverage(0.42, 0.37, 1, p));
    });
    test('synthetic PNG oracle accepts numeric contract, rejects altered pixels/black image/missing grid', () => {
        const PNG = require('pngjs').PNG;
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e01-oracle-'));
        try {
            const file = path.join(dir, 'synthetic.png');
            const raw: any = { raw: [], parameters: { ...defaults, seed: 0.375 }, mode: 1, input: 'checker', width: 90, height: 70, glError: 0, afterDraw: true };
            const png = new PNG({ width: 90, height: 70 });
            for (let y = 0; y < 7; y++) for (let x = 0; x < 9; x++) {
                const point: any = { x: Math.floor((x + 0.5) * 90 / 9), y: Math.floor((y + 0.5) * 70 / 7) };
                point.rgba = oracle.expected(point, raw); raw.raw.push(point);
                const i = ((69 - point.y) * 90 + point.x) * 4;
                point.rgba.forEach((value: number, channel: number) => { png.data[i + channel] = value; });
            }
            fs.writeFileSync(file, PNG.sync.write(png));
            expect(oracle.visualErrors(raw, file)).toEqual([]);
            const bad = JSON.parse(JSON.stringify(raw)); bad.raw[1].rgba[0] = 255;
            expect(oracle.visualErrors(bad, file).length).toBeGreaterThan(0);
            fs.writeFileSync(file, PNG.sync.write(new PNG({ width: 90, height: 70 })));
            expect(oracle.visualErrors(raw, file).length).toBeGreaterThan(0);
            expect(oracle.visualErrors({ ...raw, raw: [] }, file).length).toBeGreaterThan(0);
            expect(oracle.visualErrors({ ...raw, parameters: { ...defaults, seed: NaN } }).length).toBeGreaterThan(0);
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
    test('frozen scope includes each parameter boundary, no module side effects', () => {
        const plan = runner.boundaryPlan();
        for (const key of Object.keys(definition.params)) expect(plan.filter((p: any) => p.parameter === key).map((p: any) => p.boundary)).toEqual(expect.arrayContaining(['default', 'invalid']));
        expect(runner.expectedScope().Visual.length).toBe(12);
        expect(runner.validateReport({ engines: [] }).ok).toBe(false);
    });
    test('malformed reports and every oracle are total structured rejections', () => {
        for (const value of [null, undefined, 1, 'invalid', [], {}, { schemaVersion: 'shaders-noise-dissolve-run/1', engines: [null, null, null] }]) {
            expect(() => runner.validateReport(value)).not.toThrow();
            expect(runner.validateReport(value).ok).toBe(false);
        }
        for (const handler of Object.values(runner.oracles()) as any[]) for (const value of [null, {}, { observation: null }]) {
            expect(() => handler(value)).not.toThrow();
            expect(handler(value).errors.length).toBeGreaterThan(0);
        }
    });

    test('scoped normalization and verifier reject malformed structures without throwing', () => {
        const scoped = require('../../tools/verify/shaders-noise-dissolve-normalize-scoped.cjs');
        const verifier = require('../../tools/verify/shaders-noise-dissolve-scoped-gate.cjs');
        for (const value of [null, undefined, [], {}, 1, 'invalid', { engines: [null] }]) {
            expect(() => scoped.validateScoped(value)).not.toThrow();
            expect(scoped.validateScoped(value).ok).toBe(false);
            expect(() => verifier.verify(value, 'chromium', 'Runtime', ['create'])).not.toThrow();
            expect(verifier.verify(value, 'chromium', 'Runtime', ['create']).pass).toBe(false);
        }
    });

});
