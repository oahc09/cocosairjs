// Source-level native WebGPU diagnostic. No browser, DOM shim, hardware or complete engine run.
// Run with an externally installed official node-webgpu package and optionally a software Vulkan ICD.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const commandsPath = 'src/cocos/gfx/webgpu/webgpu-commands.ts';
const commandBufferPath = 'src/cocos/gfx/webgpu/webgpu-command-buffer.ts';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function sourceSnapshot(name) {
    const bytes = readFileSync(path.join(root, name));
    const committed = execFileSync('git', ['show', 'HEAD:' + name], { cwd: root });
    assert.deepEqual(bytes, committed, 'diagnostic requires committed engine sources');
    return {
        sha256: digest(bytes),
        ast: ts.createSourceFile(name, bytes.toString('utf8'), ts.ScriptTarget.Latest, true),
    };
}

function getNamed(nodes, name) {
    const found = nodes.filter((node) => node.name?.getText() === name);
    assert.equal(found.length, 1, 'expected exactly one source declaration for ' + name);
    return found[0].getText();
}

function sourceBridge(nativeDevice, globals) {
    const commands = sourceSnapshot(commandsPath);
    const commandBuffer = sourceSnapshot(commandBufferPath);
    const methods = commandBuffer.ast.statements.find(
        (node) => ts.isClassDeclaration(node) && node.name?.text === 'WebGPUCommandBuffer',
    )?.members;
    assert(methods, 'WebGPUCommandBuffer was not found');
    const clearPasses = commands.ast.statements.find(
        (node) =>
            ts.isVariableStatement(node) &&
            node.declarationList.declarations.some((declaration) => declaration.name.getText() === 'clearPasses'),
    );
    assert(clearPasses, 'clear pipeline cache was not found');
    const source = [
        clearPasses.getText(),
        getNamed(commands.ast.statements, 'clearRect').replace(/^export\s+/, ''),
        'let samples = 1;',
        'class NativePassBridge {',
        '_renderPassFuncQueue = []; submitComputePass() {}',
        getNamed(methods, 'beginRenderPass'),
        getNamed(methods, 'endRenderPass'),
        '}',
        'NativePassBridge;',
    ].join('\n');
    const compiled = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText;
    const locals = {
        WebGPUDeviceManager: { instance: { nativeDevice, isLost: false, getSwapchains: () => [] } },
        Rect: class {
            constructor(x, y, width, height) {
                Object.assign(this, { x, y, width, height });
            }
        },
        Format: { UNKNOWN: 'unused-depth' },
        LoadOp: { CLEAR: 'clear' },
        GFXFormatToWGPUFormat: (format) => format,
        beginWebGPUResourceUse: () => () => {},
        GPUShaderStage: globals.GPUShaderStage,
        GPUBufferUsage: globals.GPUBufferUsage,
    };
    return {
        NativePassBridge: vm.runInNewContext(compiled, locals),
        sources: { [commandsPath]: commands.sha256, [commandBufferPath]: commandBuffer.sha256 },
    };
}

async function main() {
    const options = process.argv.slice(2);
    assert.equal(options.length, 1, 'usage: --dawn-module=<absolute official webgpu module entry>');
    assert(options[0].startsWith('--dawn-module='));
    const module = options[0].slice('--dawn-module='.length);
    assert(path.isAbsolute(module), 'dawn module entry must be absolute');
    const packageRoot = path.dirname(module);
    const metadata = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    assert.equal(metadata.name, 'webgpu', 'diagnostic requires the official node-webgpu package entry');
    assert.match(metadata.repository.url, /github\.com[:/]dawn-gpu\/node-webgpu(?:\.git)?$/);
    const platformName = process.platform === 'darwin' ? 'darwin-universal' : `${process.platform}-${process.arch}`;
    const dawnBinary = readFileSync(path.join(packageRoot, 'dist', platformName, 'dawn.node'));
    const backendProvenance = {
        packageVersion: metadata.version,
        addonSha256: digest(dawnBinary),
        node: process.version,
        platform: platformName,
    };
    const { create, globals } = await import(pathToFileURL(module).href);
    const gpu = create(['backend=vulkan']);
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
        console.log(JSON.stringify({ status: 'BLOCKED', reason: 'No Dawn Vulkan adapter', browser: false }));
        process.exitCode = 2;
        return;
    }
    const device = await adapter.requestDevice();
    const { NativePassBridge, sources } = sourceBridge(device, globals);
    const { GPUTextureUsage, GPUBufferUsage, GPUMapMode } = globals;
    const uncaptured = [];
    device.addEventListener('uncapturederror', ({ error }) => uncaptured.push(error.message));
    const formats = ['rgba8unorm', 'rgba16float'];
    const colors = {
        blue: { x: 0, y: 0, z: 1, w: 1 },
        red: { x: 1, y: 0, z: 0, w: 1 },
        hdr: { x: -0.5, y: 1.5, z: 2, w: 1 },
    };
    const fixtures = {
        rgba8unorm: { blue: [0, 0, 255, 255], red: [255, 0, 0, 255], hdr: [0, 255, 255, 255] },
        rgba16float: {
            blue: [0, 0, 0x3c00, 0x3c00],
            red: [0x3c00, 0, 0, 0x3c00],
            hdr: [0xb800, 0x3e00, 0x4000, 0x3c00],
        },
    };
    const makeTextures = () =>
        formats.map((format) =>
            device.createTexture({
                size: [4, 4],
                format,
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
            }),
        );
    const a = makeTextures();
    const b = makeTextures();
    const pass = new NativePassBridge();
    const whole = { x: 0, y: 0, width: 4, height: 4 };
    const partial = { x: 1, y: 1, width: 2, height: 2 };
    const run = (textures, loadOps, area, values) => {
        const views = textures.map((texture) => texture.createView());
        const colorAttachments = loadOps.map((loadOp) => ({ loadOp, storeOp: 'store' }));
        const renderPass = {
            gpuRenderPass: { originalRP: { colorAttachments } },
            colorAttachments: formats.map((format, index) => ({ format, loadOp: loadOps[index] })),
            depthStencilAttachment: { format: 'unused-depth' },
        };
        const framebuffer = {
            gpuFramebuffer: {
                isOffscreen: true,
                gpuColorTextures: views.map((view) => ({
                    width: 4,
                    height: 4,
                    samples: 1,
                    getTextureView: () => view,
                })),
            },
        };
        pass.beginRenderPass(
            renderPass,
            framebuffer,
            area,
            values.map((name) => colors[name]),
            1,
            0,
        );
        pass.endRenderPass();
        assert.deepEqual(
            colorAttachments,
            loadOps.map((loadOp) => ({ loadOp, storeOp: 'store' })),
        );
    };
    const cases = [];
    async function capture(name, textures, beforeOutside, afterInside) {
        const pixels = [];
        for (let index = 0; index < textures.length; index++) {
            const buffer = device.createBuffer({
                size: 1024,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });
            try {
                const encoder = device.createCommandEncoder();
                encoder.copyTextureToBuffer(
                    { texture: textures[index] },
                    { buffer, bytesPerRow: 256, rowsPerImage: 4 },
                    [4, 4],
                );
                device.queue.submit([encoder.finish()]);
                await buffer.mapAsync(GPUMapMode.READ);
                const data = new DataView(buffer.getMappedRange());
                const values = [];
                for (let y = 0; y < 4; y++) {
                    for (let x = 0; x < 4; x++) {
                        const at = y * 256 + x * (index ? 8 : 4);
                        const observed = Array.from({ length: 4 }, (_, i) =>
                            index ? data.getUint16(at + i * 2, true) : data.getUint8(at + i),
                        );
                        const inner = x >= 1 && x <= 2 && y >= 1 && y <= 2;
                        assert.deepEqual(
                            observed,
                            fixtures[formats[index]][(inner ? afterInside : beforeOutside)[index]],
                            name + ', ' + formats[index] + ' (' + x + ', ' + y + ')',
                        );
                        values.push(observed);
                    }
                }
                pixels.push(values);
            } finally {
                buffer.destroy();
            }
        }
        cases.push({ name, pixels });
    }

    device.pushErrorScope('validation');
    try {
        run(a, ['clear', 'clear'], whole, ['blue', 'red']);
        run(a, ['clear', 'load'], partial, ['hdr', 'hdr']);
        await capture('A: clear RGBA8 / keep RGBA16F', a, ['blue', 'red'], ['hdr', 'red']);
        run(b, ['clear', 'clear'], whole, ['red', 'blue']);
        run(b, ['load', 'clear'], partial, ['hdr', 'hdr']);
        await capture('B: keep RGBA8 / clear RGBA16F', b, ['red', 'blue'], ['red', 'hdr']);
        run(a, ['load', 'clear'], partial, ['hdr', 'hdr']);
        await capture('A: reuse RGBA16F after B', a, ['blue', 'red'], ['hdr', 'hdr']);
        run(a, ['load', 'load'], partial, ['red', 'blue']);
        await capture('A: LOAD/LOAD preserves both', a, ['blue', 'red'], ['hdr', 'hdr']);
        run(b, ['clear', 'clear'], whole, ['hdr', 'hdr']);
        await capture('B: independent whole-area native HDR clear', b, ['hdr', 'hdr'], ['hdr', 'hdr']);
        const validation = await device.popErrorScope();
        assert.equal(validation, null, validation?.message);
        assert.deepEqual(uncaptured, []);
    } finally {
        for (const texture of [...a, ...b]) texture.destroy();
        device.destroy();
    }
    const info = adapter.info;
    console.log(
        JSON.stringify({
            status: 'PASS',
            browser: false,
            backend: 'node-dawn-vulkan',
            backendProvenance,
            adapter: { vendor: info.vendor, description: info.description, isFallbackAdapter: info.isFallbackAdapter },
            head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
            sources,
            scope: 'Exact committed clear helper and begin/end methods through test host objects; not the browser bundle or full engine.',
            cases,
        }),
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
