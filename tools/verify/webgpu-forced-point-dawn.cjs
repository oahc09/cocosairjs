// Native Dawn validation of the exact engine descriptor/sampler hot path, not a browser.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const prefix = 'src/cocos/gfx/';
const sources = {};
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const snapshot = (file) => {
    const name = prefix + file;
    const bytes = readFileSync(path.join(root, name));
    sources[name] = sha(bytes);
    return ts.createSourceFile(name, bytes.toString('utf8'), ts.ScriptTarget.Latest, true).statements;
};
function pick(nodes, name) {
    const matches = nodes.filter(
        (node) =>
            node.name?.getText() === name ||
            (ts.isVariableStatement(node) && node.declarationList.declarations.some((v) => v.name.getText() === name)),
    );
    assert.equal(matches.length, 1, name);
    return matches[0];
}
function sourceBridge(nativeDevice, descriptors) {
    const commands = snapshot('webgpu/webgpu-commands.ts');
    const sampler = snapshot('webgpu/webgpu-sampler.ts');
    const set = snapshot('webgpu/webgpu-descriptor-set.ts');
    const define = snapshot('base/define.ts');
    const part = (stmts, names) =>
        names.map((name) =>
            pick(stmts, name)
                .getText()
                .replace(/^export[ \t]+/, ''),
        );
    const fixture = [
        ...part(define, ['Format', 'Filter', 'Address', 'ComparisonFunc']),
        ...part(commands, [
            'WebGPUAdressMode',
            'WebGPUCompareFunc',
            'SEPARATE_SAMPLER_BINDING_OFFSET',
            'TextureSampleTypeTrait',
            'FormatToWGPUFormatType',
            'WebGPUCmdFuncCreateSampler',
            'WebGPUCmdFuncDestroySampler',
        ]),
        ...part(sampler, ['samplerCaches', 'WebGPUSampler']),
        'class Binder {',
        pick(pick(set, 'WebGPUDescriptorSet').members, '_bindSamplerEntry').getText(),
        '}',
        '({ WebGPUSampler, Binder, Format, Filter, Address, ComparisonFunc, SEPARATE_SAMPLER_BINDING_OFFSET });',
    ].join('\n');
    const js = ts.transpileModule(fixture, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText;
    return vm.runInNewContext(js, {
        Sampler: class {
            constructor(info) {
                this._info = { ...info };
            }
        },
        FormatInfos: new Proxy({}, { get: () => ({ hasDepth: false }) }),
        warn: (msg) => assert.fail(msg),
        WebGPUDeviceManager: {
            instance: {
                // Deliberately never request float32-filterable on this device.
                floatFilterable: false,
                nativeDevice: {
                    createSampler: (desc) => {
                        descriptors.push({ ...desc });
                        return nativeDevice.createSampler(desc);
                    },
                },
            },
        },
    });
}

async function main() {
    const [mode, addon, ...rest] = process.argv.slice(2);
    assert.ok(
        ['baseline', 'fixed'].includes(mode) && path.isAbsolute(addon) && rest.length === 0,
        'usage: <baseline|fixed> <absolute node-webgpu entry>',
    );
    const meta = JSON.parse(readFileSync(path.join(path.dirname(addon), 'package.json'), 'utf8'));
    assert.equal(meta.name, 'webgpu');
    assert.match(meta.repository.url, /github\.com[:/]dawn-gpu\/node-webgpu(?:\.git)?$/);
    const { create, globals } = await import(pathToFileURL(addon).href);
    const gpu = create(['backend=vulkan']);
    const adapter = await gpu.requestAdapter();
    assert.ok(adapter, 'Dawn Vulkan adapter required');
    const device = await adapter.requestDevice();
    const report = {
        status: 'RUNNING',
        mode,
        softwareAPI: 'Dawn Vulkan/node-webgpu',
        nodeWebGPU: meta.version,
        browser: false,
        adapter: { description: adapter.info.description, architecture: adapter.info.architecture },
        float32FilterableAdvertised: adapter.features.has('float32-filterable'),
        float32FilterableEnabled: device.features.has('float32-filterable'),
        sources,
        harnessSha256: sha(readFileSync(__filename)),
        orders: [],
    };
    assert.equal(report.float32FilterableEnabled, false);
    const uncaptured = [];
    device.addEventListener('uncapturederror', ({ error }) => uncaptured.push(error.message));
    const formatName = { rgba8: 'rgba8unorm', rgba32f: 'rgba32float' };
    try {
        for (const kinds of [
            ['rgba8', 'rgba32f', 'rgba8'],
            ['rgba32f', 'rgba8', 'rgba32f'],
        ]) {
            const descriptors = [];
            const { WebGPUSampler, Binder, Format, Filter, Address, ComparisonFunc, SEPARATE_SAMPLER_BINDING_OFFSET } =
                sourceBridge(device, descriptors);
            const requested = {
                minFilter: Filter.LINEAR,
                magFilter: Filter.LINEAR,
                mipFilter: Filter.LINEAR,
                addressU: Address.CLAMP,
                addressV: Address.CLAMP,
                addressW: Address.CLAMP,
                maxAnisotropy: 4,
                cmpFunc: ComparisonFunc.ALWAYS,
            };
            const sampler = new WebGPUSampler(requested, 0);
            const binder = new Binder();
            binder._gpuDescriptorSet = { gpuDescriptors: [{}] };
            binder._bindGroupEntries = new Map();
            const row = { kinds, steps: [], cacheRestored: false };
            report.orders.push(row);
            const seen = new Map();
            for (const kind of kinds) {
                const point = kind === 'rgba32f';
                const tex = device.createTexture({
                    format: formatName[kind],
                    size: [4, 4],
                    mipLevelCount: 2,
                    usage: globals.GPUTextureUsage.TEXTURE_BINDING,
                });
                binder.getTexture = () => ({ levelCount: 2, format: point ? Format.RGBA32F : Format.RGBA8 });
                const old = descriptors.length;
                try {
                    device.pushErrorScope('validation');
                    binder._bindSamplerEntry({ binding: 0 }, sampler);
                    const allocationError = await device.popErrorScope();
                    const native = binder._bindGroupEntries.get(SEPARATE_SAMPLER_BINDING_OFFSET).resource;
                    const repeat = seen.has(kind);
                    const desc = repeat ? seen.get(kind).desc : descriptors.at(-1);
                    assert.equal(descriptors.length - old, repeat ? 0 : 1);
                    if (repeat) {
                        assert.equal(native, seen.get(kind).native);
                        row.cacheRestored = true;
                    }
                    const fail = mode === 'baseline' && point;
                    assert.equal(desc.minFilter, point ? 'nearest' : 'linear');
                    assert.equal(desc.magFilter, desc.minFilter);
                    assert.equal(desc.mipmapFilter, desc.minFilter);
                    assert.equal(desc.maxAnisotropy, point && !fail ? 1 : 4);
                    if (!repeat) {
                        if (fail) assert.match(allocationError?.message ?? '', /anisotrop/i);
                        else assert.equal(allocationError, null);
                        seen.set(kind, { native, desc, rejected: !!allocationError });
                    } else assert.equal(allocationError, null);
                    let bindValidated = null;
                    if (!seen.get(kind).rejected) {
                        device.pushErrorScope('validation');
                        const layout = device.createBindGroupLayout({
                            entries: [
                                {
                                    binding: 0,
                                    visibility: globals.GPUShaderStage.FRAGMENT,
                                    texture: { sampleType: point ? 'unfilterable-float' : 'float' },
                                },
                                {
                                    binding: SEPARATE_SAMPLER_BINDING_OFFSET,
                                    visibility: globals.GPUShaderStage.FRAGMENT,
                                    sampler: { type: point ? 'non-filtering' : 'filtering' },
                                },
                            ],
                        });
                        device.createBindGroup({
                            layout,
                            entries: [
                                { binding: 0, resource: tex.createView() },
                                { binding: SEPARATE_SAMPLER_BINDING_OFFSET, resource: native },
                            ],
                        });
                        const error = await device.popErrorScope();
                        assert.equal(error, null);
                        bindValidated = true;
                    }
                    row.steps.push({
                        texture: formatName[kind],
                        filters: desc.minFilter,
                        anisotropy: desc.maxAnisotropy,
                        allocationRejected: seen.get(kind).rejected,
                        cached: repeat,
                        bindValidated,
                    });
                } finally {
                    tex.destroy();
                }
            }
            assert.notEqual(seen.get('rgba8').native, seen.get('rgba32f').native);
            assert.equal(sampler.samplerInfo.maxAnisotropy, 4);
            assert.equal(sampler.samplerInfo.minFilter, Filter.LINEAR);
            assert.equal(sampler.gpuSampler.maxAnisotropy, 4);
            assert.equal(sampler.gpuSampler.minFilter, Filter.LINEAR);
        }
        assert.deepEqual(uncaptured, []);
        report.status = 'PASS';
        console.log(JSON.stringify(report, null, 2));
    } finally {
        device.destroy();
    }
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
