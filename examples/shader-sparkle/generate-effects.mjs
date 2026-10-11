import { readFileSync, writeFileSync } from 'node:fs';
import { buildEffectJson } from '../../tools/build/effect-json.mjs';
const spec = {
    name: 'air-e06-sparkle',
    attributes: [
        { name: 'a_position', type: 'vec3', location: 0 },
        { name: 'a_texCoord', type: 'vec2', location: 1 },
    ],
    varyings: [{ name: 'v_uv', type: 'vec2' }],
    uniforms: [
        { name: 'sparkle0', type: 'vec4', value: [0, 0, 0, 0] },
        { name: 'sparkle1', type: 'vec4', value: [0, 0, 0, 0] },
        { name: 'sparkle2', type: 'vec4', value: [0, 0, 0, 0] },
    ],
    samplers: [{ name: 'sourceTexture', type: 'sampler2D', value: 'white' }],
    vertex: 'void main(){gl_Position=vec4(a_position.xy,0.0,1.0);v_uv=a_texCoord;}',
    fragment: readFileSync(new URL('./src/sparkle.frag', import.meta.url), 'utf8'),
};
const effect = buildEffectJson({
    ...spec,
    name: 'air-e06-sparkle-zero',
    fragment: spec.fragment.replace('if(sparkle0.w>0.0){', 'if(false){'),
});
const expanded = buildEffectJson({
    ...spec,
    name: 'air-e06-sparkle-expanded',
    fragment: spec.fragment.replace('if(sparkle0.w>0.0){', 'if(true){'),
});
const output =
    '// Generated from example-local GLSL; GPU compilation is separately measured.\n' +
    'export const effectDefinition = ' +
    JSON.stringify(effect, null, 2) +
    ';\n' +
    'export const expandedEffectDefinition = ' +
    JSON.stringify(expanded, null, 2) +
    ';\n';
const outPath = new URL('./src/effect.generated.ts', import.meta.url);
const prettier = await import('prettier');
const config = await prettier.resolveConfig(outPath, { editorconfig: true });
writeFileSync(outPath, await prettier.format(output, { ...config, parser: 'typescript', filepath: outPath.pathname }));
