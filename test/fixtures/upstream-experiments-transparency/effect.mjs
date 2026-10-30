// Opt-in experiment effect. Uses the production depth sampler template supplied by the caller.
export function makeDepthEffect(template) {
    const name = 'upstream-experiments-native-depth';
    const block = 'uniform Constants { highp vec4 compareParams; highp vec4 rangeParams; };';
    const body = `
void main() {
    float d = texture(sceneDepth, vec2(0.5)).r;
    if (compareParams.z > 0.5 && compareParams.z < 1.5) {
        color = vec4(sceneDepthVisibility(vec2(0.5), compareParams.x, compareParams.y), d, 0.0, 1.0);
    } else {
        float value = compareParams.z > 1.5 ? rangeParams.x * rangeParams.y / (rangeParams.y - d * (rangeParams.y - rangeParams.x)) : d;
        uint bits = floatBitsToUint(value);
        color = vec4(uvec4(bits, bits >> 8u, bits >> 16u, bits >> 24u) & 255u) / 255.0;
    }
}`;
    const shader = {
        name,
        hash: 0x8e0b0a1,
        defines: [],
        builtins: { globals: { blocks: [], samplerTextures: [] }, locals: { blocks: [], samplerTextures: [] } },
        attributes: [{ name: 'a_position', format: 32, location: 0, defines: [] }],
        blocks: [
            {
                name: 'Constants',
                set: 1,
                binding: 0,
                stageFlags: 16,
                defines: [],
                members: [
                    { name: 'compareParams', type: 16, count: 1 },
                    { name: 'rangeParams', type: 16, count: 1 },
                ],
            },
        ],
        samplerTextures: [template.resource],
        buffers: [],
        images: [],
        textures: [],
        samplers: [],
        subpassInputs: [],
        glsl3: {
            vert: 'precision highp float;\nin vec3 a_position;\nvoid main() { gl_Position = vec4(a_position.xy, 0.0, 1.0); }',
            frag: `precision highp float;\nprecision highp int;\n${block}\n${template.glsl3}\nout vec4 color;\n${body}`,
        },
        glsl4: {
            vert: 'precision highp float;\nlayout(location = 0) in vec3 a_position;\nvoid main() { gl_Position = vec4(a_position.xy, 0.0, 1.0); }',
            frag: `precision highp float;\nprecision highp int;\nlayout(set = 1, binding = 0) ${block}\n${template.glsl4}\nlayout(location = 0) out vec4 color;\n${body}`,
        },
    };
    return {
        name,
        shaders: [shader],
        combinations: [],
        techniques: [
            {
                passes: [
                    {
                        program: name,
                        rasterizerState: { cullMode: 0 },
                        depthStencilState: { depthTest: false, depthWrite: false },
                        blendState: { targets: [{ blend: false }] },
                        properties: {
                            compareParams: { type: 16, value: [0, 0, 0, 0] },
                            rangeParams: { type: 16, value: [1, 100, 0, 0] },
                            sceneDepth: { type: 28, value: 'black' },
                        },
                    },
                ],
            },
        ],
    };
}
