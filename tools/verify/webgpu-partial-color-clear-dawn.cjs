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
const definePath = 'src/cocos/gfx/base/define.ts';
const lifetimePath = 'src/air/rendering/webgpu-resource-lifetime.ts';
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
    const define = sourceSnapshot(definePath);
    const lifetime = sourceSnapshot(lifetimePath);
    const withoutExport = (code) => code.replace(/^export\s+/, '');
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
        withoutExport(getNamed(commands.ast.statements, 'clearRect')),
        ...['Offset', 'Rect', 'Extent', 'TextureSubresLayers', 'BufferTextureCopy'].map((name) =>
            withoutExport(getNamed(define.ast.statements, name)),
        ),
        withoutExport(getNamed(lifetime.ast.statements, 'assertWebGPUDeviceActive')),
        withoutExport(getNamed(commands.ast.statements, 'WebGPUCmdFuncCopyTextureToBuffer')),
        'let samples = 1;',
        'class NativePassBridge {',
        '_renderPassFuncQueue = []; submitComputePass() {}',
        getNamed(methods, 'beginRenderPass'),
        getNamed(methods, 'endRenderPass'),
        '}',
        '({ NativePassBridge, BufferTextureCopy, WebGPUCmdFuncCopyTextureToBuffer });',
    ].join('\n');
    const compiled = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText;
    const locals = {
        WebGPUDeviceManager: { instance: { nativeDevice, isLost: false, getSwapchains: () => [] } },
        TextureType: { TEX2D: '2d', TEX3D: '3d' },
        FormatInfos: { rgba32uint: { size: 16 }, rgba32sint: { size: 16 } },
        Format: { UNKNOWN: 'unused-depth' },
        LoadOp: { CLEAR: 'clear' },
        GFXFormatToWGPUFormat: (format) => format,
        beginWebGPUResourceUse: () => () => {},
        GPUShaderStage: globals.GPUShaderStage,
        GPUBufferUsage: globals.GPUBufferUsage,
        GPUMapMode: globals.GPUMapMode,
    };
    return {
        ...vm.runInNewContext(compiled, locals),
        sources: {
            [commandsPath]: commands.sha256,
            [commandBufferPath]: commandBuffer.sha256,
            [definePath]: define.sha256,
            [lifetimePath]: lifetime.sha256,
        },
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
    const { NativePassBridge, BufferTextureCopy, WebGPUCmdFuncCopyTextureToBuffer, sources } = sourceBridge(
        device,
        globals,
    );
    const { GPUTextureUsage, GPUBufferUsage, GPUMapMode } = globals;
    const uncaptured = [];
    device.addEventListener('uncapturederror', ({ error }) => uncaptured.push(error.message));
    const normalizedFormats = ['rgba8unorm', 'rgba16float'];
    const integerFormats = ['rgba32uint', 'rgba32sint'];
    const uintClear = [16777217, 2147483649, 4294967295, 1];
    const sintClear = [-16777217, 16777219, -2147483647, 2147483647];
    const color = ([x, y, z, w]) => ({ x, y, z, w });
    const colors = {
        blue: { x: 0, y: 0, z: 1, w: 1 },
        red: { x: 1, y: 0, z: 0, w: 1 },
        hdr: { x: -0.5, y: 1.5, z: 2, w: 1 },
        uintSeed: color([5, 7, 11, 13]),
        sintSeed: color([-3, -7, 17, 19]),
        uintClear: color(uintClear),
        sintClear: color(sintClear),
    };
    const fixtures = {
        rgba8unorm: { blue: [0, 0, 255, 255], red: [255, 0, 0, 255], hdr: [0, 255, 255, 255] },
        rgba16float: {
            blue: [0, 0, 0x3c00, 0x3c00],
            red: [0x3c00, 0, 0, 0x3c00],
            hdr: [0xb800, 0x3e00, 0x4000, 0x3c00],
        },
        rgba32uint: { uintSeed: [5, 7, 11, 13], uintClear },
        rgba32sint: { sintSeed: [-3, -7, 17, 19], sintClear },
    };
    const readChannels = {
        rgba8unorm: { stride: 1, read: (data, at) => data.getUint8(at) },
        rgba16float: { stride: 2, read: (data, at) => data.getUint16(at, true) },
        rgba32uint: { stride: 4, read: (data, at) => data.getUint32(at, true) },
        rgba32sint: { stride: 4, read: (data, at) => data.getInt32(at, true) },
    };
    const makeTextures = (formats) =>
        formats.map((format) =>
            device.createTexture({
                size: [4, 4],
                format,
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
            }),
        );
    const a = makeTextures(normalizedFormats);
    const b = makeTextures(normalizedFormats);
    const integers = makeTextures(integerFormats);
    const pass = new NativePassBridge();
    const whole = { x: 0, y: 0, width: 4, height: 4 };
    const partial = { x: 1, y: 1, width: 2, height: 2 };
    const run = (textures, loadOps, area, values, formats = normalizedFormats) => {
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
    async function verifyPackedIntegerReadback(texture, format, nativePixels) {
        const ArrayType = format === 'rgba32uint' ? Uint32Array : Int32Array;
        // Guards outside the typed view and inside it but outside the
        // requested rows catches incorrect byteOffset, buffOffset and buffStride handling.
        const sentinel = 0x13579bdf;
        const width = 4,
            height = 4,
            stride = 5;
        const full = new ArrayType(stride * height * 4 + 4).fill(sentinel);
        const view = full.subarray(1, full.length - 1);
        const region = new BufferTextureCopy();
        region.buffOffset = ArrayType.BYTES_PER_ELEMENT;
        region.buffStride = stride;
        region.texExtent.width = width;
        region.texExtent.height = height;
        await WebGPUCmdFuncCopyTextureToBuffer(
            { nativeDevice: device, isLost: false },
            { gpuTexture: texture, width, height, samples: 1, mipLevel: 1, arrayLayer: 1, type: '2d', format },
            [view],
            [region],
        );
        const expected = new ArrayType(full.length).fill(sentinel);
        for (let y = 0; y < height; y++) {
            expected.set(nativePixels.slice(y * width, (y + 1) * width).flat(), 2 + y * stride * 4);
        }
        assert.deepEqual(full, expected, 'Cocos typed readback does not match native readback for ' + format);
        return { typedArray: ArrayType.name, pixelCount: nativePixels.length, offsetStrideGuardsIntact: true };
    }
    async function capture(name, textures, beforeOutside, afterInside, formats = normalizedFormats) {
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
                        const { stride, read } = readChannels[formats[index]];
                        const at = y * 256 + x * stride * 4;
                        const observed = Array.from({ length: 4 }, (_, i) => read(data, at + i * stride));
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
        const cocosTypedReadback =
            formats === integerFormats
                ? await Promise.all(
                      formats.map((format, i) => verifyPackedIntegerReadback(textures[i], format, pixels[i])),
                  )
                : undefined;
        cases.push({ name, formats, pixels, cocosTypedReadback });
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
        // Both targets share a pass. Values straddling 2^24 and near the integer
        // limits distinguish exact integer uploads from f32 rounding/saturation.
        assert.notDeepEqual(uintClear.map(Math.fround), uintClear);
        assert.notDeepEqual(sintClear.map(Math.fround), sintClear);
        const seeds = ['uintSeed', 'sintSeed'];
        const integerClears = ['uintClear', 'sintClear'];
        run(integers, ['clear', 'clear'], whole, seeds, integerFormats);
        await capture('Integer: native baseline', integers, seeds, seeds, integerFormats);
        run(integers, ['clear', 'load'], partial, integerClears, integerFormats);
        await capture(
            'Integer: clear RGBA32U / keep RGBA32I',
            integers,
            seeds,
            ['uintClear', 'sintSeed'],
            integerFormats,
        );
        run(integers, ['load', 'clear'], partial, ['uintSeed', 'sintClear'], integerFormats);
        await capture('Integer: keep RGBA32U / clear RGBA32I', integers, seeds, integerClears, integerFormats);
        run(integers, ['load', 'load'], partial, seeds, integerFormats);
        await capture('Integer: LOAD/LOAD preserves both', integers, seeds, integerClears, integerFormats);
        const validation = await device.popErrorScope();
        assert.equal(validation, null, validation?.message);
        assert.deepEqual(uncaptured, []);
    } finally {
        for (const texture of [...a, ...b, ...integers]) texture.destroy();
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
            harnessSha256: digest(readFileSync(__filename)),
            scope: 'Exact committed clear helper, begin/end methods, and integer texture readback through test host objects; not the browser bundle or full engine.',
            cases,
        }),
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
