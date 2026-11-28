/* Geometry and current-color sampling controls, not the native TAA resolve. */
import { Mat4 } from '/sdk.mjs';

const source = await (await fetch('/taa.effect')).text();
const formulas = source.match(/^\s*vec2 unjittedUV = uv - taaParams1\.xy \/ 2\.;$/gm);
if (formulas?.length !== 1) throw new Error('Frozen TAA current-color expression changed');
const canvas = document.createElement('canvas');
canvas.width = 384;
canvas.height = 256;
const gl = canvas.getContext('webgl2', { antialias: false, depth: false, stencil: false });
if (!gl) throw new Error('WebGL2 required');
gl.disable(gl.DITHER);

function program(vs, fs) {
    const result = gl.createProgram();
    for (const [type, text] of [
        [gl.VERTEX_SHADER, vs],
        [gl.FRAGMENT_SHADER, fs],
    ]) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, '#version 300 es\nprecision highp float;\n' + text);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        gl.attachShader(result, shader);
        gl.deleteShader(shader);
    }
    gl.linkProgram(result);
    if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(result));
    return result;
}
const geometry = program(
    'layout(location=0) in vec3 eye; uniform mat4 projection; void main(){gl_Position=projection*vec4(eye,1);}',
    'uniform vec4 color; out vec4 result; void main(){result=color;}',
);
const sample = program(
    `out vec2 uv; void main(){
        vec2 corner=vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
        uv=corner; gl_Position=vec4(corner*2.-1.,0.,1.);
    }`,
    `in vec2 uv; uniform sampler2D inputTexture; uniform vec4 taaParams1;
      out vec4 result; void main(){${formulas[0]}
      result=texture(inputTexture, unjittedUV);}`,
);
const projectionLocation = gl.getUniformLocation(geometry, 'projection');
const colorLocation = gl.getUniformLocation(geometry, 'color');
const taaParams = gl.getUniformLocation(sample, 'taaParams1');
const samplerLocation = gl.getUniformLocation(sample, 'inputTexture');
const vertexData = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vertexData);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

function renderTarget(width, height) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Bad probe framebuffer');
    return { texture, framebuffer };
}
const phaseCount = 64;
const samplePixels = [0.5, -0.5];
const cases = [
    { projection: 'perspective', width: 160, height: 96, scale: 1 },
    { projection: 'perspective', width: 176, height: 100, scale: 0.75 },
    { projection: 'orthographic', width: 160, height: 96, scale: 1 },
    { projection: 'orthographic', width: 176, height: 100, scale: 0.75 },
];

function run(entry) {
    const width = Math.floor(entry.width * entry.scale);
    const height = Math.floor(entry.height * entry.scale);
    const projection = new Mat4();
    if (entry.projection === 'perspective') Mat4.perspective(projection, Math.PI / 3, width / height, 0.1, 30);
    else Mat4.ortho(projection, -4, 4, -3, 3, 0.1, 30);
    const p = Mat4.toArray(new Float32Array(16), projection);
    const old = p.slice();
    old[12] += samplePixels[0] / canvas.width;
    old[13] += samplePixels[1] / canvas.height;
    const ndc = [(2 * samplePixels[0]) / width, (2 * samplePixels[1]) / height];
    const shifted = p.slice();
    for (const col of [0, 4, 8, 12]) {
        shifted[col] += ndc[0] * p[col + 3];
        shifted[col + 1] += ndc[1] * p[col + 3];
    }
    const color = renderTarget(width, height);
    const resolved = renderTarget(width, height);
    const raw = new Uint8Array(width * height * 4);
    gl.viewport(0, 0, width, height);
    function center() {
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
        const accum = [
            [0, 0, 0],
            [0, 0, 0],
        ];
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                let pos = (x + y * width) * 4;
                for (const a of accum) {
                    const c = raw[pos++];
                    a[0] += c;
                    a[1] += (x + 0.5) * c;
                    a[2] += (y + 0.5) * c;
                }
            }
        }
        return accum.map(([m, x, y]) => {
            if (m <= 0) throw new Error('Missing near or far edge in readback');
            return [x / m, y / m];
        });
    }

    function paint(matrix, phase) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, color.framebuffer);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(geometry);
        gl.enableVertexAttribArray(0);
        gl.uniformMatrix4fv(projectionLocation, false, matrix);
        for (const [i, depth] of [2, 8].entries()) {
            // Project equally sized rectangles in disjoint regions, one at each view-space depth.
            const clipW = p[11] * -depth + p[15];
            const x = Math.floor(width * (i ? 0.62 : 0.22)) + phase;
            const y = Math.floor(height * (i ? 0.63 : 0.23)) + phase;
            const points = [
                [x, y],
                [x + 12, y],
                [x, y + 10],
                [x + 12, y + 10],
            ];
            const positions = points
                .map(([px, py]) => [
                    (((px * 2) / width - 1) * clipW) / p[0],
                    (((py * 2) / height - 1) * clipW) / p[5],
                    -depth,
                ])
                .flat();
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);
            gl.uniform4f(colorLocation, i ? 0 : 1, i ? 1 : 0, 0, 1);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        return center();
    }
    function filter(sign) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, resolved.framebuffer);
        gl.useProgram(sample);
        gl.disableVertexAttribArray(0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, color.texture);
        gl.uniform1i(samplerLocation, 0);
        gl.uniform4f(taaParams, sign * ndc[0], sign * ndc[1], 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        return center();
    }
    const tracks = Object.fromEntries(
        ['legacy', 'clipW', 'sampleSigned', 'sampleWrongSign'].map((k) => [
            k,
            [
                [0, 0],
                [0, 0],
            ],
        ]),
    );
    try {
        for (let phase = 0; phase < phaseCount; phase++) {
            const subpixel = (phase + 0.5) / phaseCount;
            const base = paint(p, subpixel);
            const legacy = paint(old, subpixel);
            const clipW = paint(shifted, subpixel);
            const sampleSigned = filter(-1);
            const sampleWrongSign = filter(1);
            for (const [key, result] of Object.entries({ legacy, clipW, sampleSigned, sampleWrongSign })) {
                for (let i = 0; i < 2; i++) {
                    for (let axis = 0; axis < 2; axis++)
                        tracks[key][i][axis] += (result[i][axis] - base[i][axis]) / phaseCount;
                }
            }
        }
        const error = gl.getError();
        if (error !== gl.NO_ERROR) throw new Error(`GL error ${error}`);
    } finally {
        for (const target of [color, resolved]) {
            gl.deleteFramebuffer(target.framebuffer);
            gl.deleteTexture(target.texture);
        }
    }
    return { ...entry, passPixels: [width, height], tracks };
}
window.probeJitter = () => ({
    canvasPixels: [canvas.width, canvas.height],
    phases: phaseCount,
    samplePixels,
    depthOrder: [2, 8],
    webgl: gl.getParameter(gl.VERSION),
    floatColor: !!gl.getExtension('EXT_color_buffer_float'),
    results: cases.map(run),
});
