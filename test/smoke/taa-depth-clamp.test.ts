import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { airWebGL2TAAFragment } from '../../src/air/builtin/taa-depth-clamp';

const effectName = 'pipeline/post-process/taa';
const stockEffects = JSON.parse(
    readFileSync(resolve(__dirname, '../../vendor/builtin-source/generated/custom-effects.json'), 'utf8'),
);
const [shader] = stockEffects.find(({ name }: { name: string }) => name === effectName).shaders;
const source: string = shader.glsl3.frag;
const apply = (frag: string, name = effectName, program = shader.name, hash = shader.hash) =>
    airWebGL2TAAFragment(name, program, hash, frag);

test('the frozen WebGL2 TAA variant adds current-depth clipping without changing its shader interface', () => {
    const changed = apply(source);
    const a = source.indexOf('vec2 getVelocity(');
    const z = source.indexOf('vec4 colorMin, colorMax;');
    expect(changed.startsWith(source.slice(0, a))).toBe(true);
    expect(changed.endsWith(source.slice(z))).toBe(true);
    expect(changed).toContain('texelFetch(depthTex');
    expect(changed).toContain('cc_matProjInv');
    expect(changed).not.toContain('abs(worldPos.x)');
    expect(changed).not.toContain('getVelocity(');
    expect(changed).toContain('taaHistoryUV(scaledUnjittedUV, uv, historyUV)');
    expect(changed).toContain('taaSampleTex(taaPrevTexture, historyUV)');
    expect(changed).not.toContain('depth >= 1.');
    expect(changed).toContain('return vec4(resultColor, color.a)');
    expect(changed.match(/uniform [^;]+;/g)).toEqual(source.match(/uniform [^;]+;/g));
});

test('application replacements and unknown stock compiler fragments retain their original source', () => {
    expect(apply(source, 'custom/taa')).toBe(source);
    expect(apply(source, effectName, 'custom|vs|fs')).toBe(source);
    expect(apply(source, effectName, shader.name, shader.hash + 1)).toBe(source);
    const unknown = source.replace('void minmax(', 'void range(');
    expect(apply(unknown)).toBe(unknown);
    const changedLookup = source.replace('uv + velocity', 'uv + velocity * 2.');
    expect(apply(changedLookup)).toBe(changedLookup);
    const changedVelocity = source.replace('vec2 getVelocity(', 'vec2 velocityOverride(');
    expect(apply(changedVelocity)).toBe(changedVelocity);
});
