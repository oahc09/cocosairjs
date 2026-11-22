/* Static preflight versus actual AIR GFX WebGL2 compilation/value semantics. New local evidence only. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');
const { verifySourceBinding } = require('../build/source-binding.cjs');
const root = path.resolve(__dirname, '../..');
const args = Object.fromEntries(process.argv.slice(2).map((value) => value.replace(/^--/, '').split('=')));
assert(args.out, '--out=<new directory> required');
const engine = args.browser || 'chromium';
assert(['chromium', 'firefox', 'webkit'].includes(engine), '--browser=chromium|firefox|webkit');
assert(args['compare-first-frame'] === undefined || args['compare-first-frame'] === '1', '--compare-first-frame=1');
const out = path.resolve(root, args.out);
assert(out.startsWith(root + path.sep) && !fs.existsSync(out), 'Use a new workspace output');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(
    path.join(out, 'index.html'),
    '<!doctype html><link rel="icon" href="data:,"><canvas id="GameCanvas" width="64" height="64"></canvas>',
);
const bundle = path.resolve(root, args.bundle || 'build/cocosair.module.js');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report = {
    completed: false,
    subset: true,
    scope: 'WebGL2 GFX output for struct value semantics, early return and MRT; not full GLSL validation',
    errors: [],
};
async function contracts({ sdk, arm = 'standard' }) {
    const m = await import(sdk),
        g = m.gfx;
    const { preflightEffect } = await import('/build/shader-preflight.js');
    const vertex =
        'precision highp float;precision highp int;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0,1);}';
    const fragment = `precision highp float;
struct Palette { vec3 color; };
vec3 shade(Palette p, bool early) { if(early) return vec3(1,0,0); p.color *= 0.5; return p.color; }
layout(location=0) out vec4 color;
layout(location=1) out vec4 marker;
void main(){Palette p;p.color=vec3(0,1,0);vec3 a=shade(p,false);vec3 b=shade(p,true);color=vec4(a,1);marker=vec4(b,1);if(p.color.g!=1.0){color=vec4(1,0,0,1);marker=vec4(0,0,1,1);}}`;
    const input = {
        name: 'preflight-values',
        shaders: [
            {
                name: 'preflight-values',
                glsl3: { vert: vertex, frag: fragment },
                glsl4: { vert: vertex.replace(/gl_VertexID/g, 'gl_VertexIndex'), frag: fragment },
            },
        ],
        techniques: [{ passes: [{ program: 'preflight-values' }] }],
    };
    const preflight = preflightEffect(input);
    if (preflight.status !== 'passed')
        throw Error('Fixture preflight failed: ' + JSON.stringify(preflight.diagnostics));
    const app = await m.createAirApp({ canvas: '#GameCanvas', renderer: 'webgl2' });
    const device = m.director.root.device,
        owned = [],
        own = (value) => (owned.push(value), value);
    let target;
    try {
        target = m.createAirMRTTarget({
            width: 4,
            height: 4,
            colorAttachments: [{ format: g.Format.RGBA8 }, { format: g.Format.RGBA8 }],
        });
        const setLayout = own(device.createDescriptorSetLayout(new g.DescriptorSetLayoutInfo([])));
        const layout = own(device.createPipelineLayout(new g.PipelineLayoutInfo([setLayout])));
        const descriptors = own(device.createDescriptorSet(new g.DescriptorSetInfo(setLayout)));
        descriptors.update();
        const normalized = preflight.effects[0].normalized.shaders[0];
        const shader = own(
            device.createShader(
                new g.ShaderInfo('preflight-values', [
                    new g.ShaderStage(g.ShaderStageFlagBit.VERTEX, normalized.glsl3.vert),
                    new g.ShaderStage(g.ShaderStageFlagBit.FRAGMENT, normalized.glsl3.frag),
                ]),
            ),
        );
        const pipeline = new g.PipelineStateInfo();
        pipeline.shader = shader;
        pipeline.pipelineLayout = layout;
        pipeline.renderPass = target.renderPass;
        pipeline.depthStencilState.depthTest = pipeline.depthStencilState.depthWrite = false;
        pipeline.rasterizerState.cullMode = g.CullMode.NONE;

        const vertexBuffer = own(
            device.createBuffer(new g.BufferInfo(g.BufferUsageBit.VERTEX, g.MemoryUsageBit.DEVICE, 12, 4)),
        );
        vertexBuffer.update(new Float32Array([0, 0, 0]));
        const assembler = own(device.createInputAssembler(new g.InputAssemblerInfo([], [vertexBuffer])));
        assembler.vertexCount = 3;
        const command = own(device.createCommandBuffer(new g.CommandBufferInfo(device.queue)));
        const region = new g.BufferTextureCopy();
        region.texExtent.width = region.texExtent.height = 1;
        const read = () =>
            target.textures.map((texture) => {
                const bytes = new Uint8Array(4);
                device.copyTextureToBuffers(texture, [bytes], [region]);
                return [...bytes];
            });
        const expected = [
            [0, 128, 0, 255],
            [255, 0, 0, 255],
        ];
        const reportStart = performance.now();
        let state, compileWallMs;
        function prepare() {
            const before = performance.now();
            state = own(device.createPipelineState(pipeline));
            compileWallMs = performance.now() - before;
        }
        if (arm !== 'cold') prepare();
        let pixels;
        const frames = [];
        for (let i = 0; i < (arm === 'standard' ? 1 : 3); i++) {
            if (arm !== 'standard') await new Promise((resolve) => requestAnimationFrame(resolve));
            const before = performance.now();
            if (!state) prepare();
            command.begin();
            target.beginPass(command);
            try {
                command.bindPipelineState(state);
                command.bindDescriptorSet(0, descriptors);
                command.bindInputAssembler(assembler);
                command.draw(assembler);
            } finally {
                target.endPass(command);
            }
            command.end();
            device.queue.submit([command]);
            const submitted = performance.now();
            pixels = read();
            if (device.gl.getError() !== device.gl.NO_ERROR) throw Error('Unexpected GL error');
            const missing = expected.flatMap((marker, index) =>
                marker.join() === pixels[index].join() ? [] : [index],
            );
            frames.push({
                index: i + 1,
                cpuEncodeAndSubmitMs: submitted - before,
                untilReadbackMs: performance.now() - reportStart,
                missingOutputMarkers: missing,
                pixels,
            });
        }
        if (arm === 'standard' && frames[0].missingOutputMarkers.length)
            throw Error('Struct/early-return/MRT output mismatch: ' + JSON.stringify(pixels));
        const comparison =
            arm === 'standard'
                ? null
                : {
                      arm,
                      scope: 'Two offscreen shader output markers, not presented frames, object counts, shadows or post-processing',
                      pipelineCreateWallMs: compileWallMs,
                      prewarmWallMs: arm === 'prewarm' ? compileWallMs : null,
                      longestCpuEncodeAndSubmitMs: Math.max(...frames.map((frame) => frame.cpuEncodeAndSubmitMs)),
                      firstCompleteReadbackMs:
                          frames.find((frame) => frame.missingOutputMarkers.length === 0)?.untilReadbackMs ?? null,
                      frames,
                  };
        return {
            backend: device.gfxAPI,
            expectedBackend: g.API.WEBGL2,
            preflightStatus: preflight.status,
            gpuValidatedByThisProbe: frames.every((frame) => frame.missingOutputMarkers.length === 0),
            pixels,
            sources: normalized.glsl3,
            ...(comparison ? { firstFrameProbe: comparison } : {}),
        };
    } finally {
        for (const value of owned.reverse()) value.destroy();
        target?.dispose();
        await app.close();
    }
}
(async () => {
    let browser, server;
    const timeout = setTimeout(async () => {
        report.failure = 'original 90s budget exceeded';
        process.exitCode = 1;
        fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
        setTimeout(() => process.exit(1), 4000).unref();
        await browser?.close({ reason: report.failure }).catch(() => {});
    }, 90000);
    try {
        report.sourceBinding = verifySourceBinding(root, bundle);
        assert.equal(report.sourceBinding.matches, true);
        const receipt = JSON.parse(fs.readFileSync(path.join(root, 'build/metadata/shader-preflight-build.json')));
        for (const [file, expected] of Object.entries(receipt.inputs))
            assert.equal(hash(path.join(root, file)), expected, file);
        for (const [file, expected] of Object.entries(receipt.outputs))
            assert.equal(hash(path.join(root, 'build', file)), expected, file);
        const inputs = [bundle, bundle + '.map', __filename, path.join(root, 'build/shader-preflight.js')];
        report.fingerprints = Object.fromEntries(
            inputs.map((file) => [path.relative(root, file).replace(/\\/g, '/'), hash(file)]),
        );
        report.preflightBuild = receipt;
        server = await startExampleServer(root);
        browser = await require('playwright')[engine].launch({
            headless: true,
            ...launchOptions(engine),
            env: loopbackBrowserEnv(),
        });
        report.browser = browser.version();
        report.browserEngine = engine;
        const sdk = '/' + path.relative(root, bundle).replace(/\\/g, '/');
        async function run(arm) {
            // Each lane owns a fresh page and context; driver-wide shader caches
            // are not cleared, so this is not a hardware cold-cache benchmark.
            const page = await browser.newPage();
            try {
                page.on('console', (message) => {
                    if (message.type() === 'error') report.errors.push(message.text());
                });
                page.on('pageerror', (error) => report.errors.push(String(error)));
                await page.goto(
                    server.origin + '/' + path.relative(root, path.join(out, 'index.html')).replace(/\\/g, '/'),
                );
                const result = await page.evaluate(contracts, { sdk, arm });
                assert.equal(result.backend, result.expectedBackend);
                return result;
            } finally {
                await page.context().close();
            }
        }
        if (args['compare-first-frame'] === '1') {
            report.firstFrameComparisons = [];
            for (const arm of ['cold', 'prewarm']) {
                const result = await run(arm);
                report.firstFrameComparisons.push(result.firstFrameProbe);
            }
            for (const entry of report.firstFrameComparisons) {
                assert.equal(entry.frames.length, 3);
                for (const frame of entry.frames) assert.deepEqual(frame.missingOutputMarkers, []);
            }
        } else {
            report.result = await run('standard');
        }
        assert.deepEqual(report.errors, []);
        for (const file of inputs)
            assert.equal(hash(file), report.fingerprints[path.relative(root, file).replace(/\\/g, '/')]);
        report.completed = true;
    } catch (error) {
        report.failure ??= String(error.stack || error);
        process.exitCode = 1;
    } finally {
        if (browser) await browser.close();
        if (server) await server.close();
        clearTimeout(timeout);
        fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify(report));
    }
})();
