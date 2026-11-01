import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createAirApp, director, Mat4, Material } from '../../src';
import { DepthStencilState, ComparisonFunc } from '../../src/cocos/gfx';
import { Camera as NativeCamera } from '../../src/cocos/render-scene/scene/camera';
import { transparentCompareFn } from '../../src/cocos/rendering/render-queue';
import { createAirDepthSamplerTemplate, prepareEffectForRegistration } from '../../tools/debug/effect-layout';
import { fragmentSource } from '../fixtures/upstream-color-contract/final-source';
const { requireDepthPrecision } = require('../../tools/verify/upstream-depth-source-audit.cjs');

// Load test-only ESM through a bounded syntax transform, not a runtime bundle build.
function fixture(path: string): any {
    const Module = require('node:module');
    const filename = resolve(__dirname, '../fixtures', path);
    const ts = require('typescript');
    const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    });
    const loaded = new Module(filename, module);
    loaded.filename = filename;
    loaded._compile(compiled.outputText, filename);
    return loaded.exports;
}
const reference = fixture('upstream-depth-experiments/model.mjs');
const { makeDepthEffect } = fixture('upstream-experiments-transparency/effect.mjs');

describe('U08 actual engine contracts versus independent research math (no GPU)', () => {
    beforeAll(async () => {
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    test('current perspective and orthographic projection map near/far convention without Reverse-Z', () => {
        for (const { near, far } of reference.ranges)
            for (const clipMin of [-1, 0]) {
                const current = new Mat4();
                Mat4.perspective(current, Math.PI / 2, 1, near, far, true, clipMin);
                const expected = reference.projection(near, far, 'normal', clipMin);
                Mat4.toArray([], current).forEach((value, i) =>
                    expect(Math.abs(value - expected[i])).toBeLessThan(1e-10),
                );
                Mat4.ortho(current, -1, 1, -1, 1, near, far, clipMin);
                for (const [distance, expectedNdc] of [
                    [near, clipMin],
                    [far, 1],
                ]) {
                    expect(Math.abs(-distance * current.m10 + current.m14 - expectedNdc)).toBeLessThan(1e-10);
                }
            }
    });
    test('current clear and default pipeline comparison remain 1 / LESS', () => {
        const camera = new NativeCamera(director.root!.device);
        expect(camera.clearDepth).toBe(1);
        expect(new DepthStencilState().depthFunc).toBe(ComparisonFunc.LESS);
        const material = new Material();
        material.initialize({ effectName: 'builtin-unlit' });
        expect(material.passes[0].depthStencilState.depthFunc).toBe(ComparisonFunc.LESS);
        expect(material.passes[0].depthStencilState.depthWrite).toBe(true);
        material.destroy();
    });
    test('current transparent comparator honors model/pass priority before back-to-front depth', () => {
        const row = (depth: number, priority = 0, hash = 0) => ({ depth, priority, hash, shaderId: 1 }) as any;
        expect(transparentCompareFn(row(1), row(10))).toBeGreaterThan(0);
        expect(transparentCompareFn(row(10, 1), row(1, 0))).toBeGreaterThan(0);
        expect(transparentCompareFn(row(10, 0, 1), row(1, 0, 0))).toBeGreaterThan(0);
        // Ordinary source-over is order dependent, not an OIT invariant.
        const over = (s: number[], d: number[]) => s.slice(0, 3).map((v, i) => v * s[3] + d[i] * (1 - s[3]));
        expect(over([1, 0, 0, 0.5], [0, 0, 0.5])).not.toEqual(over([0, 0, 1, 0.5], [0.5, 0, 0]));
    });
    test('native attachment experiment retains highp sampler through real final-source lowering', () => {
        const effect = prepareEffectForRegistration(
            makeDepthEffect(createAirDepthSamplerTemplate({ name: 'sceneDepth', binding: 1, mode: 'manual-compare' })),
        ).effect;
        const source = fragmentSource(effect.shaders[0]);
        expect(requireDepthPrecision(source, ['sceneDepth'])[0].precision).toBe('highp');
        expect(source).toContain('precision highp int;');
        expect(source).toContain('floatBitsToUint(value)');
        expect(source).toContain('step(referenceDepth - bias, texture(sceneDepth, uv).r)');
        expect(() =>
            requireDepthPrecision(source.replace('highp sampler2D', 'mediump sampler2D'), ['sceneDepth']),
        ).toThrow(/DEPTH_PRECISION/);
    });
});
