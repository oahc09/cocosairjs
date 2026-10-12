/** NODE_CONTRACT only. Actual rendering is collected by the independent browser tool. */
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(__dirname, '../..');
const G = require('../../examples/shader-uv-fusion-pilot/generate-effect.cjs');
const B = require('../../tools/verify/shaders-uv-fusion-browser.cjs');
import { definitions } from '../../examples/shader-uv-fusion-pilot/src/effect.generated';
import { validateParameters } from '../../examples/shader-uv-fusion-pilot/src/parameters';

describe('W5 UV fusion contracts', () => {
    const glass = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/shader-glass/parameters.json'), 'utf8'));
    test.each([
        null,
        [],
        { tintColor: 'invalid-shape' },
        { scale: NaN },
        { scale: Infinity },
        { scale: -1 },
        { shape: 'bad' },
        { unknown: 3 },
    ])('atomic parameter rejection %p', (v) => {
        const result = validateParameters(glass, v);
        expect(result.ok).toBe(false);
        expect(result.values).toBeUndefined();
    });
    test('getter is rejected without side effects', () => {
        let calls = 0;
        const v = Object.defineProperty({}, 'scale', {
            enumerable: true,
            get() {
                calls++;
                return 1;
            },
        });
        expect(validateParameters(glass, v).ok).toBe(false);
        expect(calls).toBe(0);
    });
    test('hex color and finite uniforms accepted with independent result', () => {
        const input = { tintColor: '#123abc', scale: 1.25 };
        const r = validateParameters(glass, input);
        expect(r.ok).toBe(true);
        input.scale = 2;
        expect(r.values!.scale).toBe(1.25);
    });
    for (const effect of ['emboss', 'glass']) {
        const source = fs.readFileSync(path.join(ROOT, `examples/shader-${effect}/src/${effect}.frag`), 'utf8');
        test(`${effect}: reference preserves complete mother algorithm`, () => {
            expect(G.transformShader(source, effect, false)).toBe(source);
        });
        test(`${effect}: fused only substitutes quantized child reads`, () => {
            const fused = G.transformShader(source, effect, true);
            expect(fused).not.toMatch(/childTexture/);
            expect(fused).toContain('clamp(floor(coords * 256.0)');
            expect(fused).toContain('* 255.0 + 0.5) / 255.0');
            // Strip exactly the added function and restore all child texture calls.
            const restored = fused
                .replace(
                    /vec4 storedPattern\([\s\S]*?\n}\n/,
                    effect === 'emboss'
                        ? 'layout(set = 1, binding = 1) uniform highp sampler2D childTexture;'
                        : 'layout(set = 1, binding = 1) uniform sampler2D childTexture;',
                )
                .replace(/storedPattern\(/g, 'texture(childTexture, ');
            expect(restored).toBe(source);
        });
        test(`${effect}: exact metadata members, sampler elimination, no lost defines`, () => {
            const defs = definitions as any;
            const a = defs[effect + ':reference'].shaders[0],
                b = defs[effect + ':fused'].shaders[0];
            expect(a.blocks[0].members).toEqual(b.blocks[0].members);
            expect(a.defines).toEqual(b.defines);
            expect(a.samplerTextures).toHaveLength(1);
            expect(b.samplerTextures).toEqual([]);
            expect(a.name).not.toBe(b.name);
        });
        test(`${effect}: pure procedural sample honors CLAMP, hidden RGB, half alpha and texel centers`, () => {
            const O = B.ORACLES[effect];
            expect(
                O.rawSample ? O.rawSample(0.75, 0.25, 'standard') : O.sampleChild(0.75, 0.25, 'standard').texel,
            ).toEqual([0, 0, 0, 0]);
            expect(O.childTexel(192, 128, 'standard')[3]).toBe(128);
            expect(O.childTexel(0, 0, 'blank')).toEqual([0, 0, 0, 0]);
            expect(O.sampleChild(-5, 8, 'standard').texel).toEqual(O.childTexel(0, 255, 'standard'));
        });
    }
    test.each([null, 'garbage', [], {}, { schema: 'wrong' }])('total validator rejects malformed input %p', (input) => {
        expect(() => B.validateData(input)).not.toThrow();
        expect(B.validateData(input).ok).toBe(false);
    });
    const retirement = (mode: string) => ({
        refs: ['mesh', 'material', 'effect', ...(mode === 'reference' ? ['childMaterial', 'childEffect'] : [])].map(
            (kind) => ({ kind, before: 1, after: 0 }),
        ),
        renderersUnbound: true,
        nodesRemoved: true,
        detached: true,
        targetDisposed: mode === 'reference' ? true : null,
    });
    for (const mode of ['reference', 'fused']) {
        test(`${mode}: paired ownership accepted`, () => {
            const errors: string[] = [];
            B.checkRetirement(retirement(mode), mode, errors);
            expect(errors).toEqual([]);
        });
        test(`${mode}: material leak rejected`, () => {
            const trace = retirement(mode);
            trace.refs[1].after = 1;
            const errors: string[] = [];
            B.checkRetirement(trace, mode, errors);
            expect(errors).toContain('retirement');
        });
        test(`${mode}: duplicate kind rejected`, () => {
            const trace = retirement(mode);
            trace.refs[1].kind = 'mesh';
            const errors: string[] = [];
            B.checkRetirement(trace, mode, errors);
            expect(errors).toContain('retirement');
        });
    }
    test('reference camera left attached is rejected', () => {
        const trace = retirement('reference');
        trace.detached = false;
        const errors: string[] = [];
        B.checkRetirement(trace, 'reference', errors);
        expect(errors).toContain('retirement');
    });
    test('fused cannot claim a retained render target', () => {
        const trace = retirement('fused');
        trace.targetDisposed = true;
        const errors: string[] = [];
        B.checkRetirement(trace, 'fused', errors);
        expect(errors).toContain('retirement');
    });
    test('missing source sampler is rejected before generation', () =>
        expect(() => G.transformShader('void main(){}', 'emboss', true)).toThrow('Missing mother sampler'));
    test('frozen source closure includes both mother algorithms and SDK', () => {
        const identity = B.currentIdentity();
        expect(identity.files.some((x: any) => x.path === 'examples/shader-glass/src/glass.frag')).toBe(true);
        expect(identity.files.some((x: any) => x.path === 'tools/verify/shaders-emboss-oracle.cjs')).toBe(true);
        expect(identity.sdk).toHaveLength(3);
    });
});
