// Focused WebGL2 shader probe, not a runtime feature or a multi-GPU certification.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const { launchOptions } = require('./browser-engines.cjs');

const EDGE = 64;
const SEEDS = [0, 1, 0x80000000, 0xffffffff];
function texelHash(x, y, seed) {
    let v = (Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77) ^ seed) >>> 0;
    v = Math.imul(v ^ (v >>> 16), 0x7feb352d) >>> 0;
    v = Math.imul(v ^ (v >>> 15), 0x846ca68b) >>> 0;
    return (v ^ (v >>> 16)) >>> 0;
}

function expected(seed) {
    const bytes = Buffer.alloc(EDGE * EDGE * 4);
    for (let y = 0; y < EDGE; y++) {
        for (let x = 0; x < EDGE; x++) bytes.writeUInt32LE(texelHash(x, y, seed), (y * EDGE + x) * 4);
    }
    return bytes;
}

async function probe({ edge, seeds }) {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { antialias: false });
    if (!gl) throw Error('WebGL2 context unavailable');
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const identity = {
        vendor: gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
        renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
        unmasked: !!debug,
        version: gl.getParameter(gl.VERSION),
    };
    const texture = gl.createTexture();
    const fbo = gl.createFramebuffer();
    const vao = gl.createVertexArray();
    const shaders = [];
    const programs = [];
    try {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8UI, edge, edge);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw Error('incomplete RGBA8UI');
        gl.bindVertexArray(vao);
        gl.viewport(0, 0, edge, edge);
        gl.disable(gl.DITHER);
        const compile = (type, src) => {
            const shader = gl.createShader(type);
            shaders.push(shader);
            gl.shaderSource(shader, src);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
            return shader;
        };
        const vertex = compile(
            gl.VERTEX_SHADER,
            `#version 300 es
            void main() { vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2)); gl_Position=vec4(p*2.-1.,0.,1.); }`,
        );
        const make = (body) => {
            const p = gl.createProgram();
            programs.push(p);
            gl.attachShader(p, vertex);
            gl.attachShader(
                p,
                compile(
                    gl.FRAGMENT_SHADER,
                    `#version 300 es
                    precision highp float;
                    precision highp int;
                    uniform uint seed;
                    layout(location=0) out uvec4 color;
                    void main() { uvec2 p=uvec2(gl_FragCoord.xy); ${body}
                        color=uvec4(v,v>>8u,v>>16u,v>>24u)&255u; }`,
                ),
            );
            gl.linkProgram(p);
            if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
            return p;
        };
        const integer = make(`
            uint v=p.x*0x9e3779b1u ^ p.y*0x85ebca77u ^ seed;
            v=(v^(v>>16u))*0x7feb352du; v=(v^(v>>15u))*0x846ca68bu; v^=v>>16u;`);
        const trig = make(`
            uint v=uint(fract(sin(dot(vec2(p),vec2(12.9898,78.233))+float(seed&65535u))*43758.5453)*16777216.);`);
        function capture(program, seed) {
            gl.useProgram(program);
            gl.uniform1ui(gl.getUniformLocation(program, 'seed'), seed);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            const bytes = new Uint8Array(edge * edge * 4);
            gl.readPixels(0, 0, edge, edge, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, bytes);
            if (gl.getError() !== gl.NO_ERROR) throw Error('WebGL error after draw/readPixels');
            return Array.from(bytes);
        }
        const samples = seeds.map((seed) => ({
            seed,
            integer: capture(integer, seed),
            repeated: capture(integer, seed),
            trig: capture(trig, seed),
        }));
        // Timed only with a supported disjoint-safe GPU query; never relabel CPU submit or readback time.
        const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
        const costs = { status: 'UNSUPPORTED' };
        if (ext) {
            costs.status = 'PASS';
            costs.drawsPerBatch = 64;
            costs.series = { integer: [], trig: [] };
            for (const key of ['integer', 'trig', 'trig', 'integer']) {
                if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
                    costs.status = 'DISJOINT';
                    break;
                }
                const q = gl.createQuery();
                try {
                    const program = key === 'integer' ? integer : trig;
                    gl.useProgram(program);
                    gl.uniform1ui(gl.getUniformLocation(program, 'seed'), 1);
                    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
                    for (let i = 0; i < costs.drawsPerBatch; i++) gl.drawArrays(gl.TRIANGLES, 0, 3);
                    gl.endQuery(ext.TIME_ELAPSED_EXT);
                    const expires = performance.now() + 2000;
                    while (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) && performance.now() < expires) {
                        await new Promise((resolve) => setTimeout(resolve, 10));
                    }
                    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) costs.status = 'DISJOINT';
                    else if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) costs.status = 'TIMEOUT';
                    else {
                        const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
                        if (!Number.isFinite(ns) || ns <= 0 || gl.getError() !== gl.NO_ERROR)
                            costs.status = 'INVALID_QUERY';
                        else costs.series[key].push(ns);
                    }
                } finally {
                    gl.deleteQuery(q);
                }
                if (costs.status !== 'PASS') break;
            }
            if (costs.status !== 'PASS') delete costs.series;
        }
        return { identity, samples, costs };
    } finally {
        for (const program of programs) gl.deleteProgram(program);
        for (const shader of shaders) gl.deleteShader(shader);
        gl.deleteVertexArray(vao);
        gl.deleteFramebuffer(fbo);
        gl.deleteTexture(texture);
    }
}

async function main() {
    const [engine, out] = process.argv.slice(2);
    const pw = require('playwright');
    assert(['chromium', 'firefox', 'webkit'].includes(engine) && out, 'usage: <chromium|firefox|webkit> <new.json>');
    const browser = await pw[engine].launch({ headless: true, ...launchOptions(engine) });
    let report;
    try {
        const page = await browser.newPage();
        try {
            const result = await page.evaluate(probe, { edge: EDGE, seeds: SEEDS });
            const sha = (data) => createHash('sha256').update(Buffer.from(data)).digest('hex');
            const samples = result.samples.map(({ seed, integer, repeated, trig }) => {
                const reference = expected(seed);
                const mismatches = integer.filter((v, i) => v !== reference[i]).length;
                const repeatMismatches = repeated.filter((v, i) => v !== integer[i]).length;
                assert.equal(integer.length, reference.length);
                assert.equal(repeated.length, reference.length);
                return {
                    seed,
                    expected: sha(reference),
                    integer: sha(integer),
                    trig: sha(trig),
                    mismatches,
                    repeatMismatches,
                };
            });
            report = {
                engine,
                version: browser.version(),
                edge: EDGE,
                identity: result.identity,
                status: samples.every((s) => !s.mismatches && !s.repeatMismatches) ? 'PASS' : 'FAIL',
                timing: result.costs,
                samples,
                crossGpu: 'NOT_ESTABLISHED_BY_SINGLE_RUN',
            };
        } finally {
            await page.close();
        }
    } finally {
        await browser.close();
    }
    writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== 'PASS') process.exitCode = 1;
}

module.exports = { expected, texelHash };
if (require.main === module)
    main().catch((e) => {
        console.error(e);
        process.exitCode = 1;
    });
