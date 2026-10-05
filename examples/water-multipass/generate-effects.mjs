/** Local reproducible authoring step; emits engine-native JSON, no runtime compiler. */
import { readFileSync, writeFileSync } from 'node:fs';
import prettier from 'prettier';
import { buildEffectJson } from '../../tools/build/effect-json.mjs';
const read = (name) => readFileSync(new URL(`shaders/${name}.glsl`, import.meta.url), 'utf8');
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const matrix = (name) => ({ name, type: 'mat4', value: identity });
const vector = (name, value = [0, 0, 0, 0]) => ({ name, type: 'vec4', value });
const sampler = (name) => ({ name, type: 'sampler2D', value: 'black' });
const position = { name: 'a_position', type: 'vec3', location: 0 };
const normal = { name: 'a_normal', type: 'vec3', location: 1 };
const uv = { name: 'a_texCoord', type: 'vec2', location: 2 };
const varying = (name, type) => ({ name, type });
const waves = read('waves');
const definitions = [
    {
        id: 'scene',
        attributes: [position, normal],
        varyings: [varying('worldPosition', 'vec3'), varying('worldNormal', 'vec3')],
        uniforms: [vector('tint', [1, 1, 1, 1]), vector('objectParams'), matrix('causticVP')],
        samplers: [sampler('causticMap')],
    },
    {
        id: 'water',
        attributes: [position],
        varyings: [
            varying('waterPosition', 'vec3'),
            varying('waterNormal', 'vec3'),
            varying('reflectedClip', 'vec4'),
            varying('refractedClip', 'vec4'),
        ],
        uniforms: [
            vector('wave', [0.1, 0, 1.7, 0]),
            vector('eye'),
            vector('channels', [1, 1, 1, 1]),
            vector('optics', [0.025, 1, 0, 0]),
            matrix('reflectionVP'),
            matrix('refractionVP'),
            matrix('inverseRefractionVP'),
        ],
        samplers: ['reflectionMap', 'refractionMap', 'depthMap'].map(sampler),
    },
    {
        id: 'caustic',
        attributes: [position],
        varyings: [varying('focusing', 'float')],
        uniforms: [vector('wave', [0.1, 0, 1.7, 0])],
        samplers: [],
    },
    {
        id: 'debug',
        attributes: [position, uv],
        varyings: [varying('screenUV', 'vec2')],
        uniforms: [vector('debugParams', [0, 25, 0, 0]), matrix('inverseRefractionVP'), matrix('refractionView')],
        samplers: [sampler('displayMap')],
    },
    {
        id: 'overlay',
        attributes: [position, uv],
        varyings: [varying('localUV', 'vec2')],
        uniforms: [vector('tint', [0.7, 0.95, 1, 0.4])],
        samplers: [],
    },
];
for (const { id, ...declarations } of definitions) {
    if (id === 'water' || id === 'caustic') declarations.uniforms.push(vector('impact'));
    const json = buildEffectJson({
        name: `air-water-multipass-${id}`,
        ...declarations,
        vertex: read(`${id}.vert`).replace('/* WAVES */', waves),
        fragment: read(`${id}.frag`),
    });
    if (id === 'caustic' || id === 'debug' || id === 'overlay')
        json.techniques[0].passes[0].depthStencilState.depthWrite = false;
    if (id === 'caustic' || id === 'debug') json.techniques[0].passes[0].depthStencilState.depthTest = false;
    if (id === 'overlay')
        json.techniques[0].passes[0].blendState.targets[0] = {
            blend: true,
            blendSrc: 2,
            blendDst: 4,
            blendSrcAlpha: 1,
            blendDstAlpha: 4,
        };
    writeFileSync(
        new URL(`${id}.effect.json`, import.meta.url),
        await prettier.format(JSON.stringify(json), { parser: 'json', tabWidth: 2, printWidth: 120 }),
    );
}
