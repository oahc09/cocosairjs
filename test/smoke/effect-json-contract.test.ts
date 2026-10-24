import { EffectAsset, createAirApp } from '../../src';
import { ProgramLib } from '../../src/cocos/render-scene/core/program-lib';
import { normalizeEffectShader } from '../../src/air/rendering/effect-json-contract';

const optionalArrays = ['samplerTextures', 'samplers', 'textures', 'buffers', 'images', 'subpassInputs'];
function shader(name = 'test-effect') {
    return {
        name,
        glsl3: {
            vert: 'in vec3 a_position; void main(){gl_Position=vec4(a_position,1.0);}',
            frag: 'precision highp float; out vec4 color; void main(){color=vec4(1.0);}',
        },
        attributes: [{ name: 'a_position', format: 32, location: 0, defines: [] }],
    } as unknown as EffectAsset.IShaderInfo;
}

describe('compiled effect registration contract', () => {
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    test('six omitted resource arrays register and do not mutate caller JSON', () => {
        const source = shader();
        const library = new ProgramLib();
        const result = library.define(source);
        for (const key of optionalArrays) {
            expect((result as any)[key]).toEqual([]);
            expect((source as any)[key]).toBeUndefined();
        }
        expect(library.getTemplateInfo(source.name).gfxAttributes[0].name).toBe('a_position');
    });

    test.each(optionalArrays)('explicit invalid %s identifies field before any registration', (key) => {
        const effect = Object.assign(new EffectAsset(), {
            name: `invalid-${key}`,
            shaders: [shader(), { ...shader('bad'), [key]: null }],
        });
        expect(() => EffectAsset.register(effect)).toThrow(
            new RegExp(`AIR_E_EFFECT_JSON_TYPE.*invalid-${key}.*shaders\\[1\\].${key}`),
        );
        expect(EffectAsset.get(effect.name)).toBeNull();
        const library = new ProgramLib();
        expect(() => library.register(effect)).toThrow(/AIR_E_EFFECT_JSON_TYPE/);
        expect(library.getTemplate('test-effect')).toBeUndefined();
        effect.destroy();
    });

    test('missing required name produces a structured field error', () => {
        const source = shader() as any;
        delete source.name;
        try {
            normalizeEffectShader(source, 'owner', 'shaders[0]');
            throw new Error('expected rejection');
        } catch (error) {
            expect(error).toMatchObject({
                code: 'AIR_E_EFFECT_JSON_MISSING_FIELD',
                effect: 'owner',
                path: 'shaders[0].name',
            });
        }
    });

    test('missing hashes isolate different sources and attributes, and repeat registration is stable', () => {
        const library = new ProgramLib();
        const first = shader('first');
        const second = shader('second');
        second.attributes = [{ name: 'a_other', format: 32, location: 3, defines: [] }];
        second.glsl3 = { ...second.glsl3, vert: second.glsl3.vert.replace(/a_position/g, 'a_other') };
        const a = library.define(first);
        const b = library.define(second);
        expect(a.hash).not.toBe(b.hash);
        expect(library.getTemplateInfo('first').gfxAttributes[0].name).toBe('a_position');
        expect(library.getTemplateInfo('second').gfxAttributes[0].name).toBe('a_other');
        expect(library.define(first)).toBe(a);
        expect(normalizeEffectShader({ attributes: first.attributes, glsl3: first.glsl3, name: first.name }).hash).toBe(
            a.hash,
        );
        const normalized = normalizeEffectShader(first);
        normalized.glsl3.frag += '\n// edit after normalization';
        expect(normalizeEffectShader(normalized).hash).not.toBe(a.hash);
        const changedLayout = { ...first, attributes: [{ ...first.attributes[0], location: 2 }] };
        expect(normalizeEffectShader(changedLayout).hash).not.toBe(a.hash);
        expect(
            normalizeEffectShader({
                ...first,
                glsl3: { ...first.glsl3, frag: first.glsl3.frag + '\n// different source' },
            }).hash,
        ).not.toBe(a.hash);
    });

    test('explicit hash collisions reject before replacing a usable template', () => {
        const library = new ProgramLib();
        const first = { ...shader(), hash: 123 };
        const original = library.define(first);
        expect(() => library.define({ ...first, glsl3: { ...first.glsl3, frag: 'different' } })).toThrow(
            /AIR_E_EFFECT_HASH_COLLISION/,
        );
        expect(library.getTemplate(first.name)).toBe(original);
    });

    test('macro preparation does not change input identity on repeated define', () => {
        const library = new ProgramLib();
        const source = { ...shader(), defines: [{ name: 'USE_TEST', type: 'boolean' }] } as EffectAsset.IShaderInfo;
        const before = JSON.stringify(source);
        expect(library.define(source)).toBe(library.define(source));
        expect(JSON.stringify(source)).toBe(before);
    });

    test('onLoaded preserves the previous named effect when a template identity conflict rejects replacement', () => {
        const first = Object.assign(new EffectAsset(), {
            name: 'identity-rollback',
            shaders: [{ ...shader('identity-rollback-program'), hash: 278341279 }],
            techniques: [],
            combinations: [],
        });
        first.onLoaded();
        const next = Object.assign(new EffectAsset(), {
            name: first.name,
            shaders: [{ ...first.shaders[0], glsl3: { ...first.shaders[0].glsl3, frag: 'different source' } }],
            techniques: [],
            combinations: [],
        });
        try {
            expect(() => next.onLoaded()).toThrow(/AIR_E_EFFECT_HASH_COLLISION/);
            expect(EffectAsset.get(first.name)).toBe(first);
        } finally {
            next.destroy();
            first.destroy();
        }
    });
});
