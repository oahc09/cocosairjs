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
    const descriptorHelper = commands.some((node) => node.name?.text === 'WebGPUCmdFuncGetSamplerDescriptor')
        ? part(commands, ['WebGPUCmdFuncGetSamplerDescriptor'])
        : [];
    const fixture = [
        ...descriptorHelper,
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
    const wrap = (device) => ({
        createSampler: (descriptor) => {
            descriptors.push({ ...descriptor });
            return device.createSampler(descriptor);
        },
    });
    const manager = { instance: { floatFilterable: false, nativeDevice: wrap(nativeDevice) } };
    return {
        ...vm.runInNewContext(js, {
            Sampler: class {
                constructor(info) {
                    this._info = { ...info };
                }
            },
            FormatInfos: new Proxy({}, { get: () => ({ hasDepth: false }) }),
            warn: (msg) => assert.fail(msg),
            WebGPUDeviceManager: manager,
        }),
        changeDevice: (device) => {
            manager.instance.nativeDevice = wrap(device);
        },
    };
}

async function underValidation(device, fn) {
    device.pushErrorScope('validation');
    let result, error;
    try {
        result = fn();
    } finally {
        error = await device.popErrorScope();
    }
    return { result, error };
}

function samplerBind(device, globals, type, sampler) {
    return underValidation(device, () => {
        const layout = device.createBindGroupLayout({
            entries: [{ binding: 0, visibility: globals.GPUShaderStage.FRAGMENT, sampler: { type } }],
        });
        return device.createBindGroup({ layout, entries: [{ binding: 0, resource: sampler }] });
    });
}

async function verifyCache(gpu, device, globals, broken, uncaptured) {
    const receipt = { comparison: [], anisotropy: [], deviceOwnership: null, normalizedReuse: null };
    for (const mips of [1, 2, 3])
        for (const reverse of [false, true]) {
            const descs = [];
            const { WebGPUSampler, Filter, Address, ComparisonFunc } = sourceBridge(device, descs);
            const point = {
                minFilter: Filter.POINT,
                magFilter: Filter.POINT,
                mipFilter: Filter.POINT,
                addressU: Address.CLAMP,
                addressV: Address.CLAMP,
                addressW: Address.CLAMP,
                maxAnisotropy: 1,
            };
            const arms = [
                ['non-filtering', new WebGPUSampler({ ...point, cmpFunc: ComparisonFunc.ALWAYS }, 0)],
                ['comparison', new WebGPUSampler({ ...point, cmpFunc: ComparisonFunc.LESS_EQUAL }, 1)],
            ];
            if (reverse) arms.reverse();
            const row = { mips, order: arms.map(([type]) => type), accepted: [], compareFields: [], allocated: 0 };
            let previous;
            for (const [type, request] of arms) {
                const { result, error } = await underValidation(device, () => request.createGPUSampler(mips));
                assert.equal(error, null);
                const same = previous === result;
                const rejected = broken && mips % 2 === 1 && !!previous;
                assert.equal(same, rejected);
                const bind = await samplerBind(device, globals, type, result);
                if (rejected) assert.match(bind.error?.message ?? '', /sampler|comparison/i);
                else assert.equal(bind.error, null);
                const repeated = request.createGPUSampler(mips);
                assert.equal(repeated, result);
                row.accepted.push(!bind.error);
                row.compareFields.push(descs.at(-1).compare ?? null);
                previous = result;
            }
            row.allocated = descs.length;
            receipt.comparison.push(row);
        }
    for (const order of [
        [0, 16],
        [16, 0],
    ]) {
        const descs = [];
        const { WebGPUSampler, Filter, Address, ComparisonFunc } = sourceBridge(device, descs);
        const linear = {
            minFilter: Filter.LINEAR,
            magFilter: Filter.LINEAR,
            mipFilter: Filter.LINEAR,
            addressU: Address.CLAMP,
            addressV: Address.CLAMP,
            addressW: Address.CLAMP,
            cmpFunc: ComparisonFunc.ALWAYS,
        };
        const items = [];
        for (const maxAnisotropy of order) {
            const { result, error } = await underValidation(device, () =>
                new WebGPUSampler({ ...linear, maxAnisotropy }, 0).createGPUSampler(1),
            );
            assert.equal(error, null);
            items.push(result);
        }
        assert.equal(items[0] === items[1], broken);
        const native = descs.map((desc) => desc.maxAnisotropy);
        assert.deepEqual(
            native,
            (broken ? order.slice(0, 1) : order).map((value) => value || 1),
        );
        receipt.anisotropy.push({ order, native });
        if (!broken) {
            const zero = new WebGPUSampler({ ...linear, maxAnisotropy: 0 }, 0).createGPUSampler(1);
            const one = new WebGPUSampler({ ...linear, maxAnisotropy: 1 }, 1).createGPUSampler(1);
            receipt.normalizedReuse = zero === one;
            assert.equal(receipt.normalizedReuse, true);
            assert.equal(descs.length, 2);
        }
    }
    const secondAdapter = await gpu.requestAdapter();
    assert.ok(secondAdapter);
    const second = await secondAdapter.requestDevice();
    const onError = ({ error }) => uncaptured.push(error.message);
    second.addEventListener('uncapturederror', onError);
    try {
        const descs = [];
        const { WebGPUSampler, Filter, Address, ComparisonFunc, changeDevice } = sourceBridge(device, descs);
        const request = new WebGPUSampler(
            {
                minFilter: Filter.POINT,
                magFilter: Filter.POINT,
                mipFilter: Filter.POINT,
                addressU: Address.CLAMP,
                addressV: Address.CLAMP,
                addressW: Address.CLAMP,
                maxAnisotropy: 1,
                cmpFunc: ComparisonFunc.ALWAYS,
            },
            0,
        );
        const first = request.createGPUSampler(1);
        changeDevice(second);
        const other = request.createGPUSampler(1);
        assert.equal(first === other, broken);
        const bind = await samplerBind(second, globals, 'non-filtering', other);
        if (broken) assert.match(bind.error?.message ?? '', /device/i);
        else assert.equal(bind.error, null);
        receipt.deviceOwnership = { reusedAcrossDevices: first === other, acceptedByOwner: !bind.error };
    } finally {
        second.destroy();
    }
    return receipt;
}

async function main() {
    const [mode, addon, ...rest] = process.argv.slice(2);
    assert.ok(
        ['baseline', 'fixed', 'cache-baseline', 'cache-fixed'].includes(mode) &&
            path.isAbsolute(addon) &&
            rest.length === 0,
        'usage: <baseline|fixed|cache-baseline|cache-fixed> <absolute node-webgpu entry>',
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
        if (mode.startsWith('cache-'))
            report.cache = await verifyCache(gpu, device, globals, mode === 'cache-baseline', uncaptured);
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
