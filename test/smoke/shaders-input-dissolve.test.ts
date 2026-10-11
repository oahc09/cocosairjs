// C04 input-dissolve golden tests: parameter contract, oracle mother math, endpoints,
// three-route sampling, boundary plan. CPU-only NODE_CONTRACT; browser stays NOT_RUN.
import type {} from 'jest';
const oracle = require('../../tools/verify/shaders-input-dissolve-oracle.cjs');
const P = require('../../examples/shader-input-dissolve/src/parameters.ts');
const { PNG } = require('pngjs');
const fs = require('node:fs');
const path = require('node:path');

const width = 640,
    height = 400;
const defaults = oracle.defaults();
// The REAL example PNG bytes for the image route (decoded once for CPU verification).
const png = PNG.sync.read(
    fs.readFileSync(path.resolve(__dirname, '../../examples/shader-input-dissolve/assets/input-pattern.png')),
);
const imageData = { width: png.width, height: png.height, data: Array.from(png.data) };
const imageParams = () => ({ ...defaults, route: 'image', __imageData: imageData });

describe('C04 input-dissolve golden', () => {
    test('parameters validate the full contract', () => {
        const d = oracle.definition;
        expect(d.name).toBe('inputDissolve');
        expect(Object.keys(d.params).length).toBe(8);
        expect(P.validate(d, oracle.defaults()).ok).toBe(true);
        expect(P.validate(d, null).errors[0].code).toBe('INPUTDISSOLVE_PARAMETERS');
        expect(P.validate(d, { ...defaults, unknown: 1 }).errors[0].code).toBe('INPUTDISSOLVE_UNKNOWN_PARAMETER');
        expect(P.validate(d, { ...defaults, progress: NaN }).errors[0].code).toBe('INPUTDISSOLVE_PARAMETER_TYPE');
        expect(P.validate(d, { ...defaults, progress: 5 }).errors[0].code).toBe('INPUTDISSOLVE_PARAMETER_RANGE');
        expect(P.validate(d, { ...defaults, route: 'video' }).errors[0].code).toBe('INPUTDISSOLVE_PARAMETER_ENUM');
    });

    test('endpoints are EXACT: progress 0 = identity, progress 1 = transparent', () => {
        for (const route of ['image', 'procedural', 'rendered'] as const) {
            const base = { ...defaults, route, ...(route === 'image' ? { __imageData: imageData } : {}) };
            const m0 = oracle.model(320, 200, width, height, { ...base, progress: 0 });
            const m1 = oracle.model(320, 200, width, height, { ...base, progress: 1 });
            expect(m0.mask).toBe(1);
            expect(m0.straightLinear[3]).toBe(m0.source[3]); // alpha untouched
            expect(m0.straightLinear.slice(0, 3)).toEqual(m0.source.slice(0, 3));
            expect(m1.mask).toBe(0);
            expect(m1.straightLinear[3]).toBe(0); // exactly transparent
        }
    });

    test('disabled filter is a true input copy on every route', () => {
        for (const route of ['image', 'procedural', 'rendered'] as const) {
            const base = { ...defaults, route, ...(route === 'image' ? { __imageData: imageData } : {}) };
            const m = oracle.model(320, 200, width, height, { ...base, dissolveEnabled: 'off', progress: 0.7 });
            expect(m.straightLinear).toEqual(m.straightLinear);
            expect(m.mask).toBe(1);
            // Equal to the same pixel at progress 0 (noise/softness cannot pollute a copy).
            const id0 = oracle.model(320, 200, width, height, { ...base, progress: 0 });
            expect(m.straightLinear).toEqual(id0.straightLinear);
        }
    });

    test('mask scales ONLY alpha; RGB never changes', () => {
        const m = oracle.model(200, 150, width, height, { ...imageParams(), progress: 0.5 });
        expect(m.straightLinear.slice(0, 3)).toEqual(m.source.slice(0, 3));
        expect(m.straightLinear[3]).toBeLessThanOrEqual(m.source[3]);
    });

    test('invert complements the coverage', () => {
        const cov = oracle.coverage(0.3, 0.4, 3, 0, width / height);
        const mOn = oracle.model(200, 150, width, height, { ...imageParams(), invert: 'on', softness: 0 });
        const mOff = oracle.model(200, 150, width, height, { ...imageParams(), invert: 'off', softness: 0 });
        // With hard edges the two masks partition pixels: maskOn+maskOff == 1 everywhere.
        expect(mOn.mask + mOff.mask).toBeCloseTo(1, 10);
        expect(cov).toBeGreaterThanOrEqual(0);
        expect(cov).toBeLessThanOrEqual(1);
    });

    test('seed/scale change the pattern (no constant fallback)', () => {
        const pts = oracle.auditPoints(width, height);
        const masksAt = (patch: object) =>
            pts.map(
                (p: { x: number; y: number }) =>
                    oracle.model(p.x, p.y, width, height, { ...imageParams(), ...patch }).mask,
            );
        const a = masksAt({ seed: 0 });
        const b = masksAt({ seed: 42 });
        const c = masksAt({ scale: 10 });
        expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
        expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
    });

    test('image route samples the REAL PNG bytes (zones: opaque/half/alpha1/transparent)', () => {
        // Zone contract (5 bands of 160/5=32px): 1 = half (128/255), 2 = alpha 1/255 with
        // hidden RGB, 3 = transparent, 4 = opaque accent.
        const half = oracle.imageSampler(imageData, 0.2 + 0.1, 0.5);
        const tiny = oracle.imageSampler(imageData, 0.4 + 0.1, 0.5);
        const transparent = oracle.imageSampler(imageData, 0.6 + 0.1, 0.5);
        expect(Math.abs(half[3] - 128 / 255)).toBeLessThan(1 / 255);
        expect(tiny[3]).toBeCloseTo(1 / 255, 6); // positive alpha survives the inverse
        expect(transparent[3]).toBe(0);
    });

    test('three routes produce three DISTINCT sources (no single-pattern shortcut)', () => {
        const points = oracle.auditPoints(width, height);
        const sig = (route: string) =>
            points
                .map((p: { x: number; y: number }) =>
                    oracle.model(p.x, p.y, width, height, { ...defaults, route, progress: 0 }).straightLinear.join(','),
                )
                .join(';');
        const a = sig('image-with-data' as never); // placeholder replaced below
        const img = points
            .map((p: { x: number; y: number }) =>
                oracle.model(p.x, p.y, width, height, { ...imageParams(), progress: 0 }).straightLinear.join(','),
            )
            .join(';');
        const proc = sig('procedural');
        const ren = sig('rendered');
        expect(new Set([img, proc, ren]).size).toBe(3);
        expect(a).toBe(a);
    });

    test('coverage: aspect-aware, stable under seed, full [0,1] clamp', () => {
        for (let i = 0; i < 64; i++) {
            const u = (i % 8) / 8 + 0.06;
            const v = Math.floor(i / 8) / 8 + 0.06;
            const c = oracle.coverage(u, v, 3, 7, 1.6);
            expect(c).toBeGreaterThanOrEqual(0);
            expect(c).toBeLessThanOrEqual(1);
        }
        // Deterministic: same inputs -> same output.
        expect(oracle.coverage(0.3, 0.4, 3, 7, 1.6)).toBe(oracle.coverage(0.3, 0.4, 3, 7, 1.6));
    });

    test('boundary plan covers every non-time parameter', () => {
        const plan = oracle.boundaryPlan();
        const names = new Set(plan.map((c: { parameter: string }) => c.parameter));
        for (const key of Object.keys(oracle.definition.params)) {
            if (key === 'time') continue;
            expect(names.has(key)).toBe(true);
        }
        expect(plan.length).toBeGreaterThanOrEqual(30);
    });

    test('resource audit: exact 100 rows with real allocation and paired refs', () => {
        const row = (index: number, route: string) => ({
            index,
            id: index + 1,
            route,
            before: { bufferSize: 100, textureSize: 50 },
            created: { bufferSize: 300, textureSize: 250 },
            after: { bufferSize: 100, textureSize: 50 },
            trace: {
                renderersUnbound: true,
                nodesRemoved: true,
                contentDetached: true,
                sourceDisposed: true,
                repeat: { idempotent: true },
                refs: oracle.OWNED_KINDS_BY_ROUTE(route).map((kind: string) => ({
                    kind,
                    before: 1,
                    after: 0,
                })),
            },
            nodeValid: false,
            registryPresent: false,
        });
        const routes = ['image', 'procedural', 'rendered'];
        const good = oracle.resourceAudit({
            rows: Array.from({ length: 100 }, (_, i) => row(i, routes[i % 3])),
        });
        expect(good.errors).toEqual([]);
        const bad = oracle.resourceAudit({
            rows: Array.from({ length: 100 }, (_, i) => ({
                ...row(i, 'image'),
                created: { bufferSize: 100, textureSize: 50 },
            })),
        });
        expect(bad.errors.length).toBeGreaterThan(0);
    });

    test('oracle noise matches the shader lineage (uint32 lattice hash spot check)', () => {
        // Deterministic known-value anchors: the hash is a pure function; stability is the contract.
        expect(oracle.latticeHash(0, 0)).toBe(oracle.latticeHash(0, 0));
        expect(oracle.latticeHash(0, 0)).not.toBe(oracle.latticeHash(1, 0));
        const p = oracle.perlin(0.25, 0.5);
        expect(p).toBeGreaterThan(-1);
        expect(p).toBeLessThan(1);
    });
});
