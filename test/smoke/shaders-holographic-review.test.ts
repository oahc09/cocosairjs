import { effectDefinition } from '../../examples/shader-holographic/src/effect.generated';
import fs from 'node:fs';
import path from 'node:path';

describe('Lead E03 independent native contract review', () => {
    test('generated Constants metadata binds the four actual GLSL holo vec4 uniforms', () => {
        const expected = ['holo0', 'holo1', 'holo2', 'holo3'];
        const shader = effectDefinition.shaders[0];
        const block = shader.blocks.find((entry) => entry.name === 'Constants');
        expect(block).toBeDefined();
        expect(block!.members.map((entry) => entry.name)).toEqual(expected);
        expect(block!.members.map((entry) => entry.count)).toEqual([1, 1, 1, 1]);
        const properties = effectDefinition.techniques[0].passes[0].properties;
        expect(Object.keys(properties).sort()).toEqual(expected);
    });
    test('GLSL 300-degree drift direction uses the same analytic cosine/sine as the reference', () => {
        const source = fs.readFileSync(
            path.resolve(__dirname, '../../examples/shader-holographic/src/holographic.frag'),
            'utf8',
        );
        const constant = (name: string) => {
            const match = source.match(new RegExp(`^const float ${name} = ([-+0-9.eE]+);`, 'm'));
            expect(match).not.toBeNull();
            return Number(match![1]);
        };
        expect(constant('LIGHT_X')).toBeCloseTo(Math.cos((300 * Math.PI) / 180), 12);
        expect(constant('LIGHT_Y')).toBeCloseTo(Math.sin((300 * Math.PI) / 180), 12);
    });
});
