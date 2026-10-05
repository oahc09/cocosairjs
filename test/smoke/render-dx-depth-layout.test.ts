import {
    AirEffectLayoutError,
    createAirDepthSamplerTemplate,
    locateAirEffectBinding,
    prepareEffectForRegistration,
} from '../../tools/debug/effect-layout';

function effect() {
    const template = createAirDepthSamplerTemplate({ name: 'sceneDepth', binding: 0, mode: 'manual-compare' });
    return {
        name: 'depth-test',
        techniques: [{ passes: [{ program: 'depth' }] }],
        shaders: [
            {
                name: 'depth',
                samplerTextures: [template.resource],
                glsl4: { vert: '', frag: '/* comment\nspans two lines */\n' + template.glsl4 },
                glsl3: { vert: '', frag: template.glsl3 },
            },
        ],
    };
}
describe('render DX raw-depth effect template and binding locator', () => {
    test('manual depth sampler validates generated precision declarations and locates exact lines', () => {
        const input = effect(),
            before = JSON.stringify(input);
        expect(prepareEffectForRegistration(input).bindings[0]).toMatchObject({
            name: 'sceneDepth',
            set: 1,
            binding: 0,
        });
        expect(locateAirEffectBinding(input, 'depth', 'sceneDepth').declarations).toEqual([
            { stage: 'frag', line: 3, source: 'layout(set = 1, binding = 0) uniform highp sampler2D sceneDepth;' },
        ]);
        expect(input.shaders[0].glsl4.frag).toContain('step(referenceDepth - bias, texture(sceneDepth, uv).r)');
        expect(JSON.stringify(input)).toBe(before);
    });
    test('hardware comparison fails explicitly and cannot pass by hiding shadow sampler in a source', () => {
        expect(() => createAirDepthSamplerTemplate({ name: 'depth', binding: 0, mode: 'hardware-compare' })).toThrow(
            /DEPTH_COMPARISON_UNAVAILABLE/,
        );
        for (const dialect of ['glsl4', 'glsl3'] as const) {
            const input = effect();
            input.shaders[0][dialect].frag = input.shaders[0][dialect].frag.replace('sampler2D ', 'sampler2DShadow ');
            try {
                prepareEffectForRegistration(input);
                throw new Error('accepted shadow sampler');
            } catch (error) {
                expect(error).toBeInstanceOf(AirEffectLayoutError);
                expect(
                    (error as AirEffectLayoutError).issues.some(
                        (entry) => entry.code === 'DEPTH_COMPARISON_UNAVAILABLE',
                    ),
                ).toBe(true);
            }
        }
    });
    test('invalid name/binding and unknown resource report exact diagnostic identity', () => {
        expect(() => createAirDepthSamplerTemplate({ name: 'gl_Depth', binding: 0 })).toThrow(/DEPTH_NAME/);
        expect(() => createAirDepthSamplerTemplate({ name: 'depth', binding: -1 })).toThrow(/BINDING_INVALID/);
        expect(() => locateAirEffectBinding(effect(), 'depth', 'missing')).toThrow(/RESOURCE_MISSING/);
    });
});
