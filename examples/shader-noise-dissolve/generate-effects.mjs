import fs from 'node:fs';
import { buildEffectJson } from '../../tools/build/effect-json.mjs';
const effect = buildEffectJson({
    name: 'shader-noise-dissolve',
    attributes: [
        { name: 'a_position', type: 'vec3', location: 0 },
        { name: 'a_texCoord', type: 'vec2', location: 2 },
    ],
    varyings: [{ name: 'v_uv', type: 'vec2' }],
    uniforms: [
        { name: 'params', type: 'vec4', value: [0.5, 3, 0.25, 0] },
        { name: 'geometry', type: 'vec4', value: [1, 0, 0, 0] },
    ],
    samplers: [{ name: 'sourceTexture', type: 'sampler2D', value: 'white' }],
    vertex: 'void main(){ v_uv=a_texCoord; gl_Position=vec4(a_position,1.0); }',
    fragment: fs.readFileSync(new URL('./src/noise.frag', import.meta.url), 'utf8'),
});
effect.techniques[0].passes[0].depthStencilState = { depthTest: false, depthWrite: false };
const output =
    '// Generated from noise.frag and generate-effects.mjs; retain THIRD_PARTY_NOTICES.txt.\n' +
    'export const effectDefinition = ' +
    JSON.stringify(effect, null, 2) +
    ' as const;\n';
const outPath = new URL('./src/effect.generated.ts', import.meta.url);
const prettier = await import('prettier');
const config = await prettier.resolveConfig(outPath, { editorconfig: true });
fs.writeFileSync(
    outPath,
    await prettier.format(output, { ...config, parser: 'typescript', filepath: outPath.pathname }),
);
console.log('E01 effect JSON generated: ' + effect.shaders[0].name);
