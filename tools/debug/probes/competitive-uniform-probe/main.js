import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Color,
    Vec4,
    Material,
    EffectAsset,
    MeshRenderer,
    utils,
    primitives,
    director,
    Director,
    gfx,
    game,
} from 'cocosair';

// Isolated development probe: actual engine Material -> Pass -> WebGL2 -> pixels,
// plus a separate raw WebGL2 control to distinguish upload defects from drivers.
const result = { done: false, checks: [], samples: [], reflection: [], errors: [] };
window.__competitiveUniformProbe = result;
const check = (name, ok, detail) => result.checks.push({ name, ok: Boolean(ok), detail });
const near = (a, b, epsilon = 3) => a.length === b.length && a.every((value, i) => Math.abs(value - b[i]) <= epsilon);

function rawControl() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 8;
    const gl = canvas.getContext('webgl2', { antialias: false });
    if (!gl) throw new Error('raw control requires WebGL2');
    const shader = (type, source) => {
        const value = gl.createShader(type);
        gl.shaderSource(value, source);
        gl.compileShader(value);
        if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(value));
        return value;
    };
    const vert = shader(
        gl.VERTEX_SHADER,
        `#version 300 es
precision highp float;
layout(std140) uniform Constants { vec4 u_value; };
out highp vec4 v_value;
void main(){ vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2); gl_Position=vec4(p*2.0-1.0,0.0,1.0); v_value=u_value; }`,
    );
    const frag = shader(
        gl.FRAGMENT_SHADER,
        `#version 300 es
precision highp float;
in highp vec4 v_value;
out vec4 outputColor;
void main(){ outputColor=vec4(v_value.x,v_value.z,v_value.w,1.0); }`,
    );
    const program = gl.createProgram();
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
    gl.bufferData(gl.UNIFORM_BUFFER, 16, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, buffer);
    gl.uniformBlockBinding(program, gl.getUniformBlockIndex(program, 'Constants'), 0);
    gl.useProgram(program);
    gl.bindVertexArray(gl.createVertexArray());
    const pixels = [];
    for (const values of [
        [0.125, 0.25, 0.5, 0.75],
        [0.75, 0.5, 0.25, 0.125],
    ]) {
        gl.bufferSubData(gl.UNIFORM_BUFFER, 0, new Float32Array(values));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const pixel = new Uint8Array(4);
        gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        pixels.push(Array.from(pixel));
        check(
            'raw WebGL2 vertex UBO xyzw update',
            near(Array.from(pixel), [values[0] * 255, values[2] * 255, values[3] * 255, 255]),
            Array.from(pixel),
        );
    }
    result.rawControl = { pixels, renderer: gl.getParameter(gl.RENDERER), vendor: gl.getParameter(gl.VENDOR) };
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
}

function effectFor(stage, channel) {
    const name = `competitive-uniform-${stage}-${channel}`;
    const constants = 'layout(set = 1, binding = 0) uniform Constants { highp vec4 u_value; };';
    const global = `layout(set = 0, binding = 0) uniform CCGlobal {
highp vec4 cc_time; highp vec4 cc_screenSize; highp vec4 cc_nativeSize; highp vec4 cc_debug_view_mode;
};`;
    const vert = `precision highp float;
${stage === 'vertex' ? constants : ''}
${stage === 'global' ? global : ''}
in vec3 a_position;
out highp vec4 v_value;
void main(){ gl_Position=vec4(a_position.xy*2.0,0.0,1.0); v_value=${stage === 'vertex' ? 'u_value' : stage === 'global' ? 'cc_screenSize' : 'vec4(0.0)'}; }`;
    const value = stage === 'fragment' ? 'u_value' : 'v_value';
    const color =
        stage === 'global'
            ? `${value}.z*100.0,${value}.w*100.0,0.5`
            : channel === 0
              ? `${value}.x,${value}.z,${value}.w`
              : `${value}.y,${value}.z,${value}.w`;
    const frag = `precision highp float;
${stage === 'fragment' ? constants : ''}
in highp vec4 v_value;
layout(location=0) out vec4 outputColor;
void main(){ outputColor=vec4(${color},1.0); }`;
    const json = {
        name,
        techniques: [
            {
                passes: [
                    {
                        program: name,
                        rasterizerState: { cullMode: 0 },
                        depthStencilState: { depthTest: false, depthWrite: false },
                        properties:
                            stage === 'global'
                                ? {}
                                : { u_value: { value: [0.125, 0.25, 0.5, 0.75], type: gfx.Type.FLOAT4 } },
                    },
                ],
            },
        ],
        shaders: [
            {
                name,
                hash: 947100 + channel + (stage === 'vertex' ? 2 : stage === 'global' ? 4 : 0),
                defines: [],
                builtins: {
                    statistics: {},
                    globals: {
                        blocks: stage === 'global' ? [{ name: 'CCGlobal', defines: [], set: 0, binding: 0 }] : [],
                        samplerTextures: [],
                        buffers: [],
                        images: [],
                    },
                    locals: { blocks: [], samplerTextures: [], buffers: [], images: [] },
                },
                attributes: [{ name: 'a_position', defines: [], format: gfx.Format.RGB32F, location: 0 }],
                blocks:
                    stage === 'global'
                        ? []
                        : [
                              {
                                  name: 'Constants',
                                  defines: [],
                                  binding: 0,
                                  stageFlags:
                                      stage === 'vertex'
                                          ? gfx.ShaderStageFlagBit.VERTEX
                                          : gfx.ShaderStageFlagBit.FRAGMENT,
                                  members: [{ name: 'u_value', type: gfx.Type.FLOAT4, count: 1 }],
                              },
                          ],
                samplerTextures: [],
                buffers: [],
                images: [],
                textures: [],
                samplers: [],
                subpassInputs: [],
                glsl4: { vert, frag },
                glsl3: {
                    vert: vert.replace(/layout\s*\([^)]*\)\s*/g, ''),
                    frag: frag.replace(/layout\s*\([^)]*\)\s*/g, ''),
                },
            },
        ],
        combinations: [],
    };
    const effect = Object.assign(new EffectAsset(), json);
    effect.onLoaded();
    return effect;
}

function sampleFrame() {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            director.off(Director.EVENT_AFTER_DRAW, draw);
            reject(new Error('frame timeout'));
        }, 8000);
        function draw() {
            director.off(Director.EVENT_AFTER_DRAW, draw);
            clearTimeout(timeout);
            const canvas = document.querySelector('#GameCanvas');
            const gl = director.root.device.gl;
            const samples = [];
            for (const [x, y] of [
                [0.5, 0.5],
                [0.4, 0.4],
                [0.6, 0.4],
                [0.4, 0.6],
                [0.6, 0.6],
            ]) {
                const pixel = new Uint8Array(4);
                gl.readPixels(
                    Math.floor(canvas.width * x),
                    Math.floor(canvas.height * y),
                    1,
                    1,
                    gl.RGBA,
                    gl.UNSIGNED_BYTE,
                    pixel,
                );
                samples.push(Array.from(pixel));
            }
            resolve(samples);
        }
        director.on(Director.EVENT_AFTER_DRAW, draw);
    });
}

async function main() {
    rawControl();
    const app = await createAirApp({ canvas: '#GameCanvas' });
    window.__airApp = app;
    const scene = new Scene('competitive-uniform-contract');
    const cameraNode = new Node('Camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(0, 0, 2);
    const camera = cameraNode.addComponent(Camera);
    camera.clearColor = new Color(0, 0, 0, 255);
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    const model = new Node('Quad');
    scene.addChild(model);
    const renderer = model.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.quad());
    app.run(scene);
    for (const stage of ['fragment', 'vertex', 'global']) {
        for (const channel of stage === 'global' ? [0] : [0, 1]) {
            const effect = effectFor(stage, channel);
            const material = new Material();
            material.initialize({ effectAsset: effect });
            renderer.material = material;
            const pass = material.passes[0];
            for (const values of [
                [0.125, 0.25, 0.5, 0.75],
                [0.75, 0.5, 0.25, 0.125],
            ]) {
                if (stage !== 'global') material.setProperty('u_value', new Vec4(...values));
                const pixels = await sampleFrame();
                result.samples.push({ stage, channel, values, pixels });
                check(
                    `${stage} UBO has no vertex-dependent drift`,
                    pixels.every((pixel) => near(pixel, pixels[0], 1)),
                    pixels,
                );
                if (stage !== 'global') {
                    const expected = [values[channel] * 255, values[2] * 255, values[3] * 255, 255];
                    check(
                        `${stage} xyzw shader readback channel ${channel}`,
                        pixels.every((pixel) => near(pixel, expected)),
                        { expected, pixels },
                    );
                } else
                    check(
                        'CCGlobal vertex-stage negative control renders',
                        pixels[0][2] >= 125 && pixels[0][2] <= 130,
                        pixels[0],
                    );
            }
            const gl = director.root.device.gl;
            const program = pass.getShaderVariant().gpuShader.glProgram;
            const blockName = stage === 'global' ? 'CCGlobal' : 'Constants';
            const index = gl.getUniformBlockIndex(program, blockName);
            result.reflection.push({
                stage,
                channel,
                block: blockName,
                index,
                size: gl.getActiveUniformBlockParameter(program, index, gl.UNIFORM_BLOCK_DATA_SIZE),
                binding: gl.getActiveUniformBlockParameter(program, index, gl.UNIFORM_BLOCK_BINDING),
            });
            if (stage !== 'global') {
                const previous = material.getProperty('u_value');
                let caught;
                try {
                    material.setProperty('u_value', [1, 2, 3, 4]);
                } catch (error) {
                    caught = { code: error.code, message: error.message };
                }
                check(
                    'invalid FLOAT4 array rejected with named diagnostic',
                    caught?.code === 'AIR_E_MATERIAL_TYPE' && caught.message.includes('u_value'),
                    caught,
                );
                check(
                    'invalid array leaves GPU pixels intact',
                    near((await sampleFrame())[0], result.samples.at(-1).pixels[0]),
                    material.getProperty('u_value') === previous,
                );
            }
            renderer.material = null;
            material.destroy();
            effect.destroy();
        }
    }
    result.ok = result.checks.every((item) => item.ok);
    result.done = true;
    game.pause();
}
main().catch((error) => {
    result.errors.push(error.stack || String(error));
    result.ok = false;
    result.done = true;
    console.error(error);
});
