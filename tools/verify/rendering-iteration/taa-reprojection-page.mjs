import { Mat4 } from '/sdk.mjs';

const response = await fetch('/taa.effect');
if (!response.ok) throw new Error('Missing frozen TAA shader');
const source = await response.text();
function extract(signature) {
    const start = source.indexOf(signature);
    const end = source.indexOf('\n  }', start);
    if (start < 0 || end < 0) throw new Error('TAA helper missing: ' + signature);
    return source.slice(start, end + '\n  }'.length);
}
const old = [extract('vec3 screen2WS(vec3 screenPos) {'), extract('vec2 NDCScToUV(vec4 ndc) {')].join('\n');
if (!old.includes('screenPos.xyz * 2. - 1.0') || !old.includes('uv.y = -uv.y'))
    throw new Error('Unexpected saved shader convention');

const canvas = document.createElement('canvas');
canvas.width = 3;
canvas.height = 1;
const gl = canvas.getContext('webgl2');
if (!gl || !gl.getExtension('EXT_color_buffer_float')) throw new Error('WebGL2 float target is required');
function compile(type, code) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, '#version 300 es\nprecision highp float;\n' + code);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
}

const program = gl.createProgram();
gl.attachShader(
    program,
    compile(
        gl.VERTEX_SHADER,
        `
    void main(){
        vec2 p=vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
        gl_Position=vec4(p*2.-1.,0.,1.);
    }`,
    ),
);
gl.attachShader(
    program,
    compile(
        gl.FRAGMENT_SHADER,
        `
    uniform mat4 cc_matViewProjInv, previousProjection;
    uniform vec4 cc_cameraPos;
    uniform vec3 screenPoint;
    uniform float uvYSign, clipMinZ;
    uniform int correctDepth, correctRow;
    uniform sampler2D stripes;
    out vec4 result;
    ${old}
    vec3 candidateWorld(vec3 p) {
        vec2 xy = vec2(p.x * 2. - 1., (p.y * 2. - 1.) * uvYSign);
        vec4 h = cc_matViewProjInv * vec4(xy, mix(clipMinZ, 1., p.z), 1.);
        return h.xyz / h.w;
    }
    void main() {
        vec3 world = correctDepth == 1 ? candidateWorld(screenPoint) : screen2WS(screenPoint);
        vec4 h = previousProjection * vec4(world, 1.);
        vec2 uv = correctRow == 1 ?
            vec2(h.x, h.y * uvYSign) / h.w * 0.5 + 0.5 : NDCScToUV(h);
        int column = int(gl_FragCoord.x);
        if (column == 0) result = vec4(world, 1.);
        else if (column == 1) result = vec4(uv, 0., 1.);
        else result = texture(stripes, uv);
    }`,
    ),
);
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
gl.useProgram(program);
gl.disable(gl.DITHER);
const get = (u) => gl.getUniformLocation(program, u);
const stripePixels = new Uint8Array(16 * 16 * 4);
for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) stripePixels.set([11 * (x + 1), 13 * (y + 1), (y % 3) * 51, 255], 4 * (x + y * 16));
}
function texture(internal, width, height, type, bytes) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, width, height, 0, gl.RGBA, type, bytes);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
}
const output = texture(gl.RGBA32F, 3, 1, gl.FLOAT, null);
const fbo = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, output, 0);
if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Bad float framebuffer');
texture(gl.RGBA8, 16, 16, gl.UNSIGNED_BYTE, stripePixels);
gl.uniform1i(get('stripes'), 0);

function draw(profile, depth, row, moved, policy) {
    const model = profile === 'modeled-webgpu';
    const minZ = model ? 0 : -1;
    const ySign = model ? -1 : 1;
    const p = Mat4.perspective(new Mat4(), Math.PI / 3, 4 / 3, 1, 100, true, minZ);
    const view = Mat4.fromTranslation(new Mat4(), { x: moved ? -0.25 : 0, y: moved ? 0.5 : 0, z: 0 });
    const inv = Mat4.invert(new Mat4(), Mat4.multiply(new Mat4(), p, view));
    const depthBuffer = ((p.m10 * -depth + p.m14) / depth - minZ) / (1 - minZ);
    gl.uniformMatrix4fv(get('cc_matViewProjInv'), false, Mat4.toArray(new Float32Array(16), inv));
    gl.uniformMatrix4fv(get('previousProjection'), false, Mat4.toArray(new Float32Array(16), p));
    gl.uniform4f(get('cc_cameraPos'), 0, 0, 0, model ? 1 : 3);
    gl.uniform3f(get('screenPoint'), 0.33, row, depthBuffer);
    gl.uniform1f(get('uvYSign'), ySign);
    gl.uniform1f(get('clipMinZ'), minZ);
    gl.uniform1i(get('correctDepth'), Number(policy !== 'frozen'));
    gl.uniform1i(get('correctRow'), Number(policy === 'explicit'));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const out = new Float32Array(12);
    gl.readPixels(0, 0, 3, 1, gl.RGBA, gl.FLOAT, out);
    if (gl.getError() !== gl.NO_ERROR) throw new Error('Reprojection GL error');
    return {
        profile,
        policy,
        depth,
        row,
        moved,
        current: [0.33, row, depthBuffer],
        world: Array.from(out.slice(0, 3)),
        prior: Array.from(out.slice(4, 6)),
        stripe: Array.from(out.slice(8, 11), (x) => Math.round(x * 255)),
    };
}

window.probeJitter = () => {
    const samples = [];
    for (const profile of ['webgl2', 'modeled-webgpu'])
        for (const policy of ['frozen', 'depth-only', 'explicit']) {
            for (const depth of [4, 8])
                for (const row of [0.24, 0.74])
                    for (const moved of [false, true]) {
                        samples.push(draw(profile, depth, row, moved, policy));
                    }
        }
    return { webgl: gl.getParameter(gl.VERSION), samples };
};
