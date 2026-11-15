/* Focused opt-in native GPU timing. Retains a new local report; never updates canonical evidence. */
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
const out = path.resolve(root, args.out);
assert(out.startsWith(root + path.sep) && !fs.existsSync(out), 'Use a new workspace output');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(
    path.join(out, 'index.html'),
    '<!doctype html><link rel="icon" href="data:,"><canvas id="GameCanvas" width="64" height="64"></canvas>',
);
const bundle = path.resolve(root, args.bundle || 'build/cocosair.module.js');
const renderer = args.renderer || 'webgpu';
assert(['webgl2', 'webgpu'].includes(renderer), '--renderer=webgl2|webgpu');
const inputs = [
    bundle,
    bundle + '.map',
    __filename,
    path.join(root, 'tools/debug/gpu-pass-timer.mjs'),
    path.join(root, 'tools/verify/performance-axes.cjs'),
];
const report = {
    completed: false,
    subset: true,
    scope: 'Chromium native GPU timing semantics, not CPU or compositor timing',
    renderer,
    errors: [],
    fingerprints: Object.fromEntries(
        inputs.map((file) => [
            path.relative(root, file).replace(/\\/g, '/'),
            crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
        ]),
    ),
};
async function contracts({ sdk }) {
    const m = await import(sdk);
    const { createWebGPUPassTimer, withWebGPUTimingFeature } = await import('/tools/debug/gpu-pass-timer.mjs');
    const app = await withWebGPUTimingFeature(() => m.createAirApp({ canvas: '#GameCanvas', renderer: 'webgpu' }));
    const device = m.director.root.device.nativeDevice;
    const environment = {
        backend: 'webgpu',
        vendor: m.director.root.device.vendor,
        renderer: m.director.root.device.renderer,
        enabledFeatures: [...device.features].sort(),
    };
    const errors = [];
    const controls = {};
    window.__gpuTiming = { controls };
    device.addEventListener('uncapturederror', (event) => errors.push(event.error.message));
    const expect = (value, message) => {
        if (!value) throw Error(message);
    };
    const timer = createWebGPUPassTimer(device);
    const owned = [];
    const own = (value) => (owned.push(value), value);
    try {
        if (timer.state.status !== 'available') return { status: 'unsupported', reason: timer.state.reason };
        const source = own(
            device.createTexture({
                size: [1, 1],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
            }),
        );
        const destination = own(
            device.createTexture({
                size: [1, 1],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC,
            }),
        );
        const data = own(device.createBuffer({ size: 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }));
        const values = own(
            device.createBuffer({ size: 262144 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC }),
        );
        const valueResult = own(
            device.createBuffer({ size: 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }),
        );
        const compute = device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: device.createShaderModule({
                    code: '@group(0) @binding(0) var<storage,read_write> values: array<u32>; @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) { var value = id.x + 1u; for (var i = 0u; i < 256u; i++) { value = value * 1664525u + 1013904223u; } values[id.x] = value; }',
                }),
                entryPoint: 'main',
            },
        });
        const computeBindings = device.createBindGroup({
            layout: compute.getBindGroupLayout(0),
            entries: [{ binding: 0, resource: { buffer: values } }],
        });
        const outer = timer.begin({ regionId: 'frame-7', frame: 7 });
        const encoder = timer.createCommandEncoder();
        const pass = encoder.beginComputePass({ label: 'simulation' });
        pass.setPipeline(compute);
        pass.setBindGroup(0, computeBindings);
        pass.dispatchWorkgroups(4096);
        pass.end();
        const inner = timer.begin({ regionId: 'render-only', frame: 7 });
        encoder
            .beginRenderPass({
                label: 'red',
                colorAttachments: [
                    { view: source.createView(), clearValue: [1, 0, 0, 1], loadOp: 'clear', storeOp: 'store' },
                ],
            })
            .end();
        timer.end(inner);
        encoder.copyTextureToTexture({ texture: source }, { texture: destination }, [1, 1]);
        encoder
            .beginRenderPass({
                label: 'blue',
                colorAttachments: [
                    { view: source.createView(), clearValue: [0, 0, 1, 1], loadOp: 'clear', storeOp: 'store' },
                ],
            })
            .end();
        encoder.copyTextureToBuffer({ texture: destination }, { buffer: data, bytesPerRow: 256 }, [1, 1]);
        encoder.copyBufferToBuffer(values, 0, valueResult, 0, 4);
        timer.end(outer);
        const submissionId = timer.submit([encoder.finish()]);
        await timer.flush();
        await data.mapAsync(GPUMapMode.READ);
        const pixel = Array.from(new Uint8Array(data.getMappedRange(), 0, 4));
        data.unmap();
        await valueResult.mapAsync(GPUMapMode.READ);
        const computed = new Uint32Array(valueResult.getMappedRange())[0];
        valueResult.unmap();
        let expected = 1;
        for (let i = 0; i < 256; ++i) expected = (Math.imul(expected, 1664525) + 1013904223) >>> 0;
        expect(computed === expected, 'Timed compute work did not execute');
        expect(pixel.join() === '255,0,0,255', 'The real copy did not preserve the first render pass');
        const snapshot = timer.snapshot();
        window.__gpuTiming.snapshot = snapshot;
        expect(
            snapshot.passes.length === 3 &&
                snapshot.passes.every((row) => row.status === 'measured' && row.submissionId === submissionId),
            'Pass timestamps lost identity',
        );
        expect(
            snapshot.regions[0].status === 'measured' &&
                snapshot.regions[0].passIds.length === 3 &&
                snapshot.regions[1].passIds.length === 1,
            'Nested regions overwrote outer pass timestamps',
        );
        expect(
            snapshot.regions[0].gpuElapsedSpanMs >= snapshot.regions[0].gpuPassSumMs,
            'Span cannot be smaller than sequential pass sum',
        );
        const limited = createWebGPUPassTimer(device, { capacity: 1 });
        try {
            const region = limited.begin({ regionId: 'capacity', frame: 8 });
            const command = limited.createCommandEncoder();
            for (let i = 0; i < 2; ++i)
                command
                    .beginRenderPass({
                        colorAttachments: [
                            { view: source.createView(), clearValue: [0, 0, 1, 1], loadOp: 'clear', storeOp: 'store' },
                        ],
                    })
                    .end();
            limited.end(region);
            limited.submit([command.finish()]);
            await limited.flush();
            expect(
                limited.snapshot().regions[0].reason === 'query-capacity-exhausted',
                'Capacity failure must not become zero milliseconds',
            );
            const next = limited.begin({ regionId: 'slot-reused', frame: 9 });
            const followup = limited.createCommandEncoder();
            followup.beginComputePass().end();
            limited.end(next);
            limited.submit([followup.finish()]);
            await limited.flush();
            expect(limited.snapshot().regions[1].status === 'measured', 'Mapped timestamp slot was not safely reused');
            controls.capacityAndReuse = limited.snapshot();
        } finally {
            limited.dispose();
        }
        const adapter = await navigator.gpu.requestAdapter();
        const ordinary = await adapter.requestDevice();
        const unsupported = createWebGPUPassTimer(ordinary);
        expect(
            unsupported.state.reason === 'timestamp-query-not-enabled',
            'Unrequested feature must remain unavailable',
        );
        const untimedRegion = unsupported.begin({ regionId: 'untimed', frame: 1 });
        const untimedCommand = unsupported.createCommandEncoder();
        untimedCommand.beginComputePass().end();
        unsupported.end(untimedRegion);
        unsupported.submit([untimedCommand.finish()]);
        await unsupported.flush();
        expect(
            unsupported.snapshot().regions[0].reason === 'timestamp-query-not-enabled',
            'Missing timing must not prevent untimed commands or fabricate zero',
        );
        controls.unsupported = unsupported.snapshot();
        unsupported.dispose();
        ordinary.destroy();
        const cancelled = createWebGPUPassTimer(device);
        const region = cancelled.begin({ regionId: 'abandoned', frame: 9 });
        const command = cancelled.createCommandEncoder();
        command.beginComputePass().end();
        cancelled.end(region);
        cancelled.abandon(command.finish());
        expect(
            cancelled.snapshot().regions[0].reason === 'command-abandoned',
            'Abandoned commands must terminate without a fake measurement',
        );
        controls.abandoned = cancelled.snapshot();
        cancelled.dispose();
        const lostAdapter = await navigator.gpu.requestAdapter();
        const lostDevice = await lostAdapter.requestDevice({ requiredFeatures: ['timestamp-query'] });
        const lostTimer = createWebGPUPassTimer(lostDevice);
        try {
            const pending = lostTimer.begin({ regionId: 'lost-mapping', frame: 10 });
            const pendingCommand = lostTimer.createCommandEncoder();
            pendingCommand.beginComputePass().end();
            lostTimer.end(pending);
            lostTimer.submit([pendingCommand.finish()]);
            lostDevice.destroy();
            const lostInfo = await lostDevice.lost;
            await lostTimer.flush();
            expect(
                lostTimer.state.reason === 'device-lost' && lostTimer.snapshot().regions[0].status === 'unavailable',
                'Device loss must settle pending timestamps without publishing a measurement',
            );
            controls.deviceLoss = {
                ...lostTimer.snapshot(),
                state: lostTimer.state,
                lostInfo: { reason: lostInfo.reason, message: lostInfo.message },
            };
        } finally {
            lostTimer.dispose();
            lostDevice.destroy();
        }
        await device.queue.onSubmittedWorkDone();
        expect(!errors.length, 'GPU validation errors: ' + errors.join('\n'));
        return {
            status: 'measured',
            pixel,
            computed,
            environment,
            snapshot,
            controls,
            gpuErrors: errors,
            featureNegotiation: 'explicit tool-only startup scope',
            copyDuration: 'included only in region span, no per-copy timestamp',
        };
    } finally {
        timer.dispose();
        for (const resource of owned.reverse()) resource.destroy();
        await app.close();
    }
}
async function webglContracts({ sdk, timerFactory }) {
    const m = await import(sdk);
    const app = await m.createAirApp({ canvas: '#GameCanvas', renderer: 'webgl2' });
    const gl = m.director.root.device.gl;
    const timer = (0, eval)('(' + timerFactory + ')')(gl);
    const expect = (value, message) => {
        if (!value) throw Error(message);
    };
    try {
        const outer = timer.begin('scene', 7, { regionId: 'frame-7', submissionIds: [1], passIds: ['red', 'blue'] });
        gl.clearColor(1, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const inner = timer.begin('nested', 7);
        timer.end(inner);
        gl.clearColor(0, 0, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        timer.end(outer);
        const pixel = new Uint8Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        expect(pixel.join() === '0,0,255,255', 'Timed native GL commands did not execute');
        for (let i = 0; timer.pendingCount && i < 120; ++i) {
            await new Promise(requestAnimationFrame);
            timer.poll();
        }
        if (!timer.available) return { status: 'unsupported', reason: timer.state.reason, pixel: [...pixel] };
        expect(inner.reason === 'overlapping-webgl-elapsed-query', 'Nested region must be explicitly rejected');
        const samples = timer.snapshot();
        expect(
            samples.length === 1 &&
                samples[0].regionId === 'frame-7' &&
                samples[0].frame === 7 &&
                samples[0].metric === 'gpu-elapsed-span',
            'Native GL timing result identity lost',
        );
        expect(gl.getError() === gl.NO_ERROR, 'GL timing emitted errors');
        return {
            status: 'measured',
            samples,
            pixel: [...pixel],
            overlap: inner,
            feature: 'EXT_disjoint_timer_query_webgl2',
            environment: {
                backend: 'webgl2',
                version: gl.getParameter(gl.VERSION),
                vendor: gl.getParameter(gl.VENDOR),
                renderer: gl.getParameter(gl.RENDERER),
            },
        };
    } finally {
        timer.dispose();
        await app.close();
    }
}
(async () => {
    let server, browser, page;
    const timeout = setTimeout(async () => {
        report.failure = 'original 90s budget exceeded';
        fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
        process.exitCode = 1;
        setTimeout(() => process.exit(1), 4000).unref();
        await browser?.close({ reason: report.failure }).catch(() => {});
    }, 90000);
    try {
        report.sourceBinding = verifySourceBinding(root, bundle);
        assert.equal(report.sourceBinding.matches, true);
        server = await startExampleServer(root);
        browser = await require('playwright').chromium.launch({
            ...launchOptions('chromium'),
            env: loopbackBrowserEnv(),
            headless: true,
        });
        report.browser = browser.version();
        page = await browser.newPage();
        page.on('console', (message) => {
            if (message.type() === 'error') report.errors.push(message.text());
        });
        page.on('pageerror', (error) => report.errors.push(String(error)));
        await page.goto(server.origin + '/' + path.relative(root, path.join(out, 'index.html')).replace(/\\/g, '/'));
        report.result = await page.evaluate(renderer === 'webgl2' ? webglContracts : contracts, {
            sdk: '/' + path.relative(root, bundle).replace(/\\/g, '/'),
            timerFactory: require('./performance-axes.cjs').createGpuTimerCollector.toString(),
        });
        assert.deepEqual(report.errors, []);
        for (const file of inputs)
            assert.equal(
                crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
                report.fingerprints[path.relative(root, file).replace(/\\/g, '/')],
            );
        report.completed = true;
    } catch (error) {
        report.failure ??= String(error.stack || error);
        if (page) report.observations = await page.evaluate(() => window.__gpuTiming).catch(() => undefined);
        process.exitCode = 1;
    } finally {
        if (browser) await browser.close();
        if (server) await server.close();
        clearTimeout(timeout);
        fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify(report));
    }
})();
