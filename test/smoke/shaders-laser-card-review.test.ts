// Lead review: independent mother mathematics and observable native wiring, not browser evidence.
import fs from 'node:fs';
import path from 'node:path';
const C = require('../../tools/verify/shaders-laser-card-oracle.cjs');
const H = require('../../tools/verify/shaders-holographic-oracle.cjs');
const E = require('../../tools/verify/shaders-emboss-oracle.cjs');
const S = require('../../tools/verify/shaders-sparkle-oracle.cjs');
const ROOT = path.resolve(__dirname, '../..');
const read = (name: string) => fs.readFileSync(path.join(ROOT, 'examples/shader-laser-card/src', name), 'utf8');
const W = 640,
    V = 400,
    t = 0.25;
const p = C.defaults();
const pixelOf = (fx: number, fy: number) => [(fx / (W / V) + 0.5) * W - 0.5, (fy + 0.5) * V - 0.5];
const fieldOf = (x: number, y: number) => [((x + 0.5) / W - 0.5) * (W / V), (y + 0.5) / V - 0.5];
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const encode = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
function motherHolo(params: any) {
    return {
        ...H.defaults(),
        shape: params.shape,
        roughness: params.holoRoughness,
        crinkle: params.holoCrinkle,
        sparkle: params.holoSparkle,
        foilScale: params.holoFoilScale,
        saturation: params.holoSaturation,
        hueShift: params.holoHueShift,
    };
}
describe('C01 Lead independent algorithm review', () => {
    test.each([
        [320, 80],
        [200, 200],
        [396, 243],
    ])('holo texel (%s,%s) retains full mother normal/light chain', (x, y) => {
        const [fx, fy] = fieldOf(x, y);
        const mother = H.model(x, y, W, V, motherHolo(p), t).straightLinear;
        const expected = mother
            .slice(0, 3)
            .map((v: number) => Math.round(clamp(v) * mother[3] * 255))
            .concat(Math.round(mother[3] * 255));
        expect(C.holoStage(fx, fy, W, V, p, t).premul).toEqual(expected);
    });
    test('declared holoCrinkle actually changes the stage', () => {
        const a = C.holoStage(0.19, 0.11, W, V, p, t);
        const b = C.holoStage(0.19, 0.11, W, V, { ...p, holoCrinkle: 0 }, t);
        expect(a.premul).not.toEqual(b.premul);
    });
    test('all-off retains nonzero neutral card input, not transparent absence', () => {
        const m = C.model(320, 200, W, V, { ...p, holoEnabled: 'off', embossEnabled: 'off', sparkleEnabled: 'off' }, t);
        expect(m.straightLinear[3]).toBeGreaterThan(0);
        expect(m.straightLinear.slice(0, 3).some((v: number) => v > 0)).toBe(true);
    });
    test('Emboss normal is mother central difference eps=.003', () => {
        const [fx, fy] = fieldOf(320, 80),
            [x, y] = pixelOf(fx, fy);
        const mother = E.model(
            x,
            y,
            W,
            V,
            {
                ...E.defaults(),
                shape: p.shape,
                depth: p.embossDepth,
                lightAngle: p.embossLightAngle,
                shadowIntensity: p.embossShadowIntensity,
            },
            t,
        );
        const result = C.embossStage(fx, fy, W, V, p, t, [100, 100, 100, 255]);
        mother.geometry.normal.forEach((v: number, i: number) => expect(result.normal[i]).toBeCloseTo(v, 10));
    });
    test('Emboss two spatial shadow taps produce nonzero frozen cast-shadow', () => {
        const [x, y] = pixelOf(0.29, 0.01);
        const mother = E.model(
            x,
            y,
            W,
            V,
            {
                ...E.defaults(),
                shape: p.shape,
                depth: p.embossDepth,
                lightAngle: p.embossLightAngle,
                shadowIntensity: p.embossShadowIntensity,
            },
            t,
        );
        expect(mother.light.castShadow).toBeGreaterThan(0);
        expect(C.embossStage(0.29, 0.01, W, V, p, t, [100, 100, 100, 255]).totalShadow).toBeCloseTo(
            mother.light.totalShadow,
            10,
        );
    });
    test('Emboss shader actually samples its warped UV', () => {
        expect(read('emboss_stage.frag')).toMatch(/texture\s*\(\s*holoTexture\s*,\s*warped\s*\)/);
    });
    test('linear intermediate input is not EOTF-decoded again', () => {
        const shader = read('sparkle_stage.frag');
        expect(shader.slice(shader.indexOf('void main('))).not.toMatch(/decodeRGB\s*\(/);
    });
    test('Sparkle GLSL helper declaration precedes its first call', () => {
        const shader = read('sparkle_stage.frag');
        if (shader.includes('sparkleRayLength()'))
            expect(shader.indexOf('float sparkleRayLength()')).toBeLessThan(shader.indexOf('float star('));
    });
    test('both native attachCamera detach callbacks are retained', () => {
        const source = read('main.ts');
        for (const target of ['holoTarget', 'embossTarget'])
            expect(source).toMatch(new RegExp('\\w+\\s*=\\s*' + target + '\\.attachCamera\\('));
    });
    test('C01 timed workload does not demand nonexistent C02 layer parameters', () => {
        const collectorSource = fs.readFileSync(path.join(ROOT, 'tools/verify/shaders-laser-card-browser.cjs'), 'utf8');
        expect(collectorSource).not.toMatch(/state\.params\?\.(?:filmEnabled|neonEnabled)/);
    });
    test('C01 collector does not require C02 three-reference release shape', () => {
        const collectorSource = fs.readFileSync(path.join(ROOT, 'tools/verify/shaders-laser-card-browser.cjs'), 'utf8');
        expect(collectorSource).not.toMatch(/(?:relRefs|release\.retirement\??\.refs\??)\.?(?:length)?\s*!==\s*3/);
        expect(collectorSource).not.toContain('relRefs.length !== 3');
    });
    test('last display copy has one independent OETF, with alpha exactly once', () => {
        const m = C.model(320, 200, W, V, { ...p, sparkleEnabled: 'off' }, t);
        const stored = m.emboss.premul,
            alpha = stored[3] / 255;
        const straight = stored.slice(0, 3).map((v: number) => (alpha > 0 ? v / 255 / alpha : 0));
        const once = straight
            .map((v: number, i: number) => Math.round(255 * clamp(encode(v)) * alpha + [8, 9, 12][i] * (1 - alpha)))
            .concat(255);
        const twice = straight.map((v: number, i: number) =>
            Math.round(255 * clamp(encode(clamp(encode(v)))) * alpha + [8, 9, 12][i] * (1 - alpha)),
        );
        expect(m.display).toEqual(once);
        expect(twice.some((v: number, i: number) => Math.abs(v - once[i]) > C.BYTE_TOLERANCE)).toBe(true);
    });
    test('different sparkle seeds are represented in the actual parameter schema', () => {
        expect(p).toHaveProperty('sparkleSeed');
        expect(C.definition.params.sparkleSeed.type).toBe('number');
    });
    test.each([1, 2])('two-grid Sparkle consumes supplied linear source with DPR%s CSS geometry', (dpr) => {
        expect(typeof C.sparkleStage).toBe('function');
        const params = { ...p, sparkleSeed: 0, sparkleThreshold: 0.03, sparkleIntensity: 0.45 };
        const motherParams = {
            ...S.DEFAULTS,
            size: params.sparkleSize,
            intensity: params.sparkleIntensity,
            threshold: params.sparkleThreshold,
            rayLength: params.sparkleRayLength,
            colorize: params.sparkleColorize,
            seed: 0,
            expand: 0,
        };
        const plan = S.samplePoints(W, V, motherParams, t, dpr);
        const pixel = plan[3],
            backing = { width: W * dpr, height: V * dpr };
        const samples: number[][] = [];
        const source = (u: number, v: number) => {
            samples.push([u, v]);
            return [S.decode(64 / 255), S.decode(64 / 255), S.decode(64 / 255), 1];
        };
        const actual = C.sparkleStage(pixel.x, pixel.y, W, V, backing, params, t, source);
        const expected = S.oracle(pixel.x, pixel.y, W, V, backing, motherParams, t, 'gray-64');
        expect(samples.length).toBeGreaterThanOrEqual(9); // base + two grids x four neighbouring candidates
        expected.linear.forEach((v: number, i: number) => expect(actual.straightLinear[i]).toBeCloseTo(v, 10));
    });
    test.each([
        [200, 200],
        [320, 80],
        [420, 200],
    ])('Emboss reads actual nearest Holo texel at warped UV (%s,%s) and adds highlight', (x, y) => {
        const params = { ...p, sparkleEnabled: 'off' };
        const mother = E.model(
            x,
            y,
            W,
            V,
            {
                ...E.defaults(),
                shape: p.shape,
                depth: p.embossDepth,
                lightAngle: p.embossLightAngle,
                shadowIntensity: p.embossShadowIntensity,
            },
            t,
        );
        const [u, v] = mother.geometry.warped;
        const tx = Math.max(0, Math.min(W - 1, Math.floor(u * W)));
        const ty = Math.max(0, Math.min(V - 1, Math.floor(v * V)));
        const h = H.model(tx, ty, W, V, motherHolo(p), t).straightLinear;
        const stored = h
            .slice(0, 3)
            .map((c: number) => Math.round(clamp(c) * h[3] * 255))
            .concat(Math.round(clamp(h[3]) * 255));
        const alpha = stored[3] / 255;
        const expected = stored
            .slice(0, 3)
            .map((c: number) =>
                Math.round(
                    clamp((alpha > 0 ? c / 255 / alpha : 0) * (1 - mother.light.totalShadow) + mother.light.highlight) *
                        alpha *
                        255,
                ),
            )
            .concat(stored[3]);
        expect(C.model(x, y, W, V, params, t).emboss.premul).toEqual(expected);
    });
    test('GPU Holo-off branch does not discard the declared neutral input', () => {
        const shader = read('holo_stage.frag').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
        expect(shader).not.toMatch(/if\s*\(\s*hs1\.w\s*<\s*0\.5\s*\)\s*\{\s*cc_FragColor\s*=\s*vec4\(0\.0\)/);
    });
    test('Emboss warp scale is declared before the warped sampler coordinate', () => {
        const shader = read('emboss_stage.frag');
        expect(shader.indexOf('float dispScale')).toBeGreaterThanOrEqual(0);
        expect(shader.indexOf('float dispScale')).toBeLessThan(shader.indexOf('vec2 warped'));
    });
    test('Sparkle helper has at most one GLSL function definition', () => {
        const shader = read('sparkle_stage.frag');
        expect((shader.match(/float\s+sparkleRayLength\s*\(\s*\)\s*\{/g) || []).length).toBeLessThanOrEqual(1);
    });
    test('declared seed is uploaded to the actual Sparkle uniform', () => {
        expect(read('main.ts')).toMatch(/setProperty\(\s*['"]ss2['"]\s*,\s*new Vec4\([^)]*params\.sparkleSeed/);
    });
    test('Sparkle blink is not squared four times to power sixteen', () => {
        const shader = read('sparkle_stage.frag').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
        expect((shader.match(/blink\s*\*=\s*blink\s*;/g) || []).length).toBeLessThanOrEqual(3);
    });
    test('C01 collector checks the actual plural retirement observations', () => {
        const source = fs.readFileSync(path.join(ROOT, 'tools/verify/shaders-laser-card-browser.cjs'), 'utf8');
        expect(source).not.toMatch(/retirement\.(?:rendererUnbound|nodeRemoved)\b/);
        expect(source).toContain('renderersUnbound');
        expect(source).toContain('nodesRemoved');
    });
    test('identity closure includes all three consumed mother oracles and their definitions', () => {
        const source = fs.readFileSync(path.join(ROOT, 'tools/verify/shaders-laser-card-browser.cjs'), 'utf8');
        for (const id of ['holographic', 'emboss', 'sparkle']) {
            expect(source).toContain(`tools/verify/shaders-${id}-oracle.cjs`);
            expect(source).toContain(`examples/shader-${id}/parameters.json`);
        }
    });
    test('neutral 8x8 checker varies across vertical cells as well as horizontal cells', () => {
        const off = { ...p, holoEnabled: 'off' };
        expect(C.holoStage(0, -0.4, W, V, off, t).premul).not.toEqual(C.holoStage(0, -0.3, W, V, off, t).premul);
    });
});
