import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareEffectForRegistration, AirEffectLayoutError } from '../../tools/debug/effect-layout';
describe('port effect layout preflight on actual generated JSON', () => {
    let json: any;
    beforeAll(() => {
        const temp = mkdtempSync(join(tmpdir(), 'air-effect-layout-'));
        try {
            const output = join(temp, 'effect.json');
            execFileSync(process.execPath, [
                join(process.cwd(), 'tools/build/effect-json.mjs'),
                join(process.cwd(), 'test/fixtures/effect-layout/spec.json'),
                output,
            ]);
            json = JSON.parse(readFileSync(output, 'utf8'));
        } finally {
            rmSync(temp, { recursive: true, force: true });
        }
    });
    function copy(): any {
        return JSON.parse(JSON.stringify(json));
    }
    function reject(value: any, code: string): void {
        try {
            prepareEffectForRegistration(value);
            throw new Error('accepted invalid input');
        } catch (error) {
            expect(error).toBeInstanceOf(AirEffectLayoutError);
            expect((error as AirEffectLayoutError).issues.some((i) => i.code === code)).toBe(true);
        }
    }
    test('generated two-sampler UBO shader passes; implicit allocation avoids explicit UBO/peer slots without mutating input', () => {
        const input = copy(),
            snapshot = JSON.stringify(input);
        delete input.shaders[0].samplerTextures[0].binding;
        delete input.shaders[0].samplerTextures[0].set;
        const changed = JSON.stringify(input),
            result = prepareEffectForRegistration(input);
        expect(result.effect.shaders[0].samplerTextures.map((r: any) => r.binding)).toEqual([1, 2]);
        expect(JSON.stringify(input)).toBe(changed);
        expect(prepareEffectForRegistration(json).effect).toEqual(result.effect);
        expect(JSON.stringify(json)).toBe(snapshot);
        expect(Object.isFrozen(result.bindings)).toBe(true);
    });
    test('rejects sampler overlap with UBO and duplicate samplers before registration', () => {
        const a = copy();
        a.shaders[0].samplerTextures[0].binding = 0;
        reject(a, 'BINDING_COLLISION');
        const b = copy();
        b.shaders[0].samplerTextures[1].binding = 1;
        reject(b, 'BINDING_COLLISION');
    });
    test('rejects reflected binding mismatch against actual GLSL and missing declarations', () => {
        const a = copy();
        a.shaders[0].glsl4.frag = a.shaders[0].glsl4.frag.replace('binding = 2', 'binding = 3');
        reject(a, 'REFLECTION_MISMATCH');
        const b = copy();
        b.shaders[0].glsl4.frag = b.shaders[0].glsl4.frag.replace(/layout\([^)]*\) uniform sampler2D mapB;/, '');
        reject(b, 'DECLARATION_MISSING');
    });
    test('count/type/set and finite binding errors cannot escape as valid layouts', () => {
        for (const [key, value, code] of [
            ['count', 2, 'COUNT'],
            ['type', 29, 'TYPE'],
            ['set', 2, 'BINDING_INVALID'],
            ['binding', -1, 'BINDING_INVALID'],
        ] as const) {
            const a = copy();
            a.shaders[0].samplerTextures[0][key] = value;
            reject(a, code);
        }
    });
    test('stage flags must include actual uniform usage in each stage', () => {
        const a = copy();
        a.shaders[0].blocks[0].stageFlags = 16;
        reject(a, 'STAGE_MISMATCH');
        const b = copy();
        b.shaders[0].samplerTextures[0].stageFlags = 0;
        reject(b, 'STAGES');
    });
    test('unknown pass program and repeated shader name are rejected', () => {
        const a = copy();
        a.techniques[0].passes[0].program = 'unknown';
        reject(a, 'PROGRAM_MISSING');
        const b = copy();
        b.shaders.push(JSON.parse(JSON.stringify(b.shaders[0])));
        reject(b, 'PROGRAM_DUPLICATE');
    });
    test('conditional/array layouts require a macro-aware compiler rather than a guessed PASS', () => {
        const a = copy();
        a.shaders[0].samplerTextures[0].defines = ['USE_MAP'];
        reject(a, 'UNSUPPORTED');
        const b = copy();
        b.shaders[0].blocks[0].members[0].count = 2;
        reject(b, 'UNSUPPORTED');
        const c = copy();
        c.shaders[0].glsl4.frag = c.shaders[0].glsl4.frag.replace(
            'layout(set = 1, binding = 2) uniform sampler2D mapB;',
            '#ifdef USE_MAP\nlayout(set = 1, binding = 2) uniform sampler2D mapB;\n#endif',
        );
        reject(c, 'DECLARATION_UNSUPPORTED');
    });
    test('UBO member type and order must match the actual GLSL block in both stages', () => {
        const a = copy();
        a.shaders[0].blocks[0].members.reverse();
        reject(a, 'MEMBERS_MISMATCH');
        const b = copy();
        b.shaders[0].glsl4.vert = b.shaders[0].glsl4.vert.replace('vec4 tint;', 'mat4 tint;');
        reject(b, 'MEMBERS_MISMATCH');
    });
});
