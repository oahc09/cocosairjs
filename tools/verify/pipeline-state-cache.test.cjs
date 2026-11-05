/* Execute the real PipelineStateManager and GFX value classes in memory.
 * Only GC registration and the device allocation boundary are replaced.
 * CPU cache identity assertions, not browser draw/pixel or GPU timing evidence.
 * node --test tools/verify/pipeline-state-cache.test.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const managerPath = 'src/cocos/rendering/pipeline-state-manager.ts';

function fixture() {
    const modules = new Map();
    let mapAllocations = 0;
    class CountedMap extends Map {
        constructor(...args) {
            super(...args);
            mapAllocations++;
        }
    }
    function load(file) {
        if (modules.has(file)) return modules.get(file);
        const exports = {};
        modules.set(file, exports);
        const source = fs.readFileSync(path.join(root, file), 'utf8');
        vm.runInNewContext(
            ts.transpileModule(source, {
                compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
            }).outputText,
            {
                exports,
                Map: CountedMap,
                require(name) {
                    if (name === '../../core/data/gc-object') return { GCObject: class {} };
                    if (file === managerPath && name === '../gfx')
                        return {
                            ...load('src/cocos/gfx/base/define.ts'),
                            ...load('src/cocos/gfx/base/pipeline-state.ts'),
                        };
                    assert(name.startsWith('.'), `unexpected dependency ${name}`);
                    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), `${name}.ts`));
                    assert(target.startsWith('src/cocos/gfx/'), `unexpected dependency ${target}`);
                    return load(target);
                },
            },
            { filename: file },
        );
        return exports;
    }
    const { PipelineStateManager: manager } = load(managerPath);
    const gfx = load('src/cocos/gfx/base/define.ts');
    const states = load('src/cocos/gfx/base/pipeline-state.ts');
    const { Shader } = load('src/cocos/gfx/base/shader.ts');
    const { EmptyPipelineState } = load('src/cocos/gfx/empty/empty-pipeline-state.ts');
    class TestShader extends Shader {
        initialize() {}
        destroy() {}
    }
    const allocations = [];
    const device = {
        createPipelineState(info) {
            const pipeline = new EmptyPipelineState();
            pipeline.initialize(info);
            pipeline.info = info;
            pipeline.destroyCalls = 0;
            pipeline.destroy = () => pipeline.destroyCalls++;
            allocations.push(pipeline);
            return pipeline;
        },
    };
    const pass = (hash, primitive = gfx.PrimitiveMode.TRIANGLE_LIST) => ({
        hash,
        primitive,
        pipelineLayout: {},
        rasterizerState: new states.RasterizerState(),
        depthStencilState: new states.DepthStencilState(),
        blendState: new states.BlendState(),
        dynamicStates: gfx.DynamicStateFlagBit.NONE,
    });
    const shaderA = new TestShader(),
        shaderB = new TestShader();
    assert.equal(shaderB.typedID, shaderA.typedID + 1);
    const renderPass = { hash: 0x1020 };
    const ia = { attributesHash: 0x3040, attributes: [new gfx.Attribute('a_position', gfx.Format.RGB32F)] };
    const draw = (p, shader = shaderA, rp = renderPass, input = ia) =>
        manager.getOrCreatePipelineState(device, p, shader, rp, input);
    const compute = (p, shader = shaderA) => manager.getOrCreateComputePipelineState(device, p, shader);
    return {
        manager,
        gfx,
        pass,
        shaderA,
        shaderB,
        renderPass,
        ia,
        allocations,
        draw,
        compute,
        device,
        mapAllocations: () => mapAllocations,
    };
}

for (const reverse of [false, true]) {
    test(`graphics cache separates colliding old XOR tuples in both construction orders (${reverse})`, () => {
        const f = fixture();
        const passA = f.pass(0x10203040);
        const passB = f.pass(passA.hash ^ f.shaderA.typedID ^ f.shaderB.typedID, f.gfx.PrimitiveMode.LINE_LIST);
        passB.depthStencilState.depthWrite = false;
        const oldKey = (pass, shader) => pass.hash ^ shader.typedID ^ f.renderPass.hash ^ f.ia.attributesHash;
        assert.equal(oldKey(passA, f.shaderA), oldKey(passB, f.shaderB));
        const inputs = [
            [passA, f.shaderA],
            [passB, f.shaderB],
        ];
        if (reverse) inputs.reverse();
        const first = f.draw(...inputs[0]),
            second = f.draw(...inputs[1]);
        assert.notEqual(first, second);
        assert.equal(first.shader, inputs[0][1]);
        assert.equal(second.shader, inputs[1][1]);
        assert.equal(f.draw(passA, f.shaderA).primitive, f.gfx.PrimitiveMode.TRIANGLE_LIST);
        assert.equal(f.draw(passB, f.shaderB).primitive, f.gfx.PrimitiveMode.LINE_LIST);
        assert.equal(f.draw(passB, f.shaderB).depthStencilState.depthWrite, false);
        assert.equal(f.draw(...inputs[0]), first);
        assert.equal(f.draw(...inputs[1]), second);
        assert.equal(f.allocations.length, 2);
    });
}

test('render-pass and attribute hashes retain their positions instead of cancelling each other', () => {
    const f = fixture(),
        pass = f.pass(17);
    const first = f.draw(pass, f.shaderA, { hash: 0x1000 }, { ...f.ia, attributesHash: 0x2000 });
    const second = f.draw(pass, f.shaderA, { hash: 0x2000 }, { ...f.ia, attributesHash: 0x1000 });
    assert.notEqual(first, second);
    assert.equal(first.renderPass.hash, 0x1000);
    assert.equal(second.renderPass.hash, 0x2000);
    assert.equal(f.allocations.length, 2);
});

test('each graphics key dimension invalidates independently; unchanged tuples and A-B-A reuse existing PSOs', () => {
    const f = fixture(),
        pass = f.pass(30);
    const original = f.draw(pass);
    pass.hash = 31;
    const changedPass = f.draw(pass);
    assert.notEqual(changedPass, original);
    pass.hash = 30;
    assert.equal(f.draw(pass), original);
    assert.notEqual(f.draw(pass, f.shaderB), original);
    assert.notEqual(f.draw(pass, f.shaderA, { hash: f.renderPass.hash + 1 }), original);
    assert.notEqual(
        f.draw(pass, f.shaderA, f.renderPass, { ...f.ia, attributesHash: f.ia.attributesHash + 1 }),
        original,
    );
    const maps = f.mapAllocations();
    for (let i = 0; i < 1000; i++) assert.equal(f.draw(pass), original);
    assert.equal(f.mapAllocations(), maps, 'cache hits must not allocate map buckets');
    assert.equal(f.allocations.length, 5);
});

for (const reverse of [false, true]) {
    test(`compute cache separates colliding old XOR tuples (${reverse})`, () => {
        const f = fixture(),
            passA = f.pass(0x10203040);
        const passB = f.pass(passA.hash ^ f.shaderA.typedID ^ f.shaderB.typedID);
        assert.equal(passA.hash ^ f.shaderA.typedID, passB.hash ^ f.shaderB.typedID);
        const inputs = [
            [passA, f.shaderA],
            [passB, f.shaderB],
        ];
        if (reverse) inputs.reverse();
        const first = f.compute(...inputs[0]),
            second = f.compute(...inputs[1]);
        assert.notEqual(first, second);
        assert.equal(first.shader, inputs[0][1]);
        assert.equal(second.shader, inputs[1][1]);
        assert.equal(first.pipelineLayout, inputs[0][0].pipelineLayout);
        assert.equal(second.info.bindPoint, f.gfx.PipelineBindPoint.COMPUTE);
        assert.equal(f.compute(...inputs[0]), first);
        assert.equal(f.compute(...inputs[1]), second);
        assert.equal(f.allocations.length, 2);
    });
}

test('compute hash mutation and graphics/compute caches remain independent', () => {
    const f = fixture(),
        pass = f.pass(6);
    const draw = f.draw(pass),
        compute = f.compute(pass);
    assert.notEqual(draw, compute);
    pass.hash = 7;
    assert.notEqual(f.compute(pass), compute);
    pass.hash = 6;
    assert.equal(f.compute(pass), compute);
    assert.equal(f.draw(pass), draw);
    assert.notEqual(f.compute(pass, f.shaderB), compute);
    assert.equal(f.allocations.length, 4);
});

test('cache clear drops nested entries without taking over caller resource destruction', () => {
    const f = fixture(),
        pass = f.pass(123);
    const oldDraw = f.draw(pass),
        oldCompute = f.compute(pass);
    oldDraw.destroy();
    oldCompute.destroy();
    f.manager._PSOHashMap.clear();
    f.manager._computePSOHashMap.clear();
    const newDraw = f.draw(pass),
        newCompute = f.compute(pass);
    assert.notEqual(newDraw, oldDraw);
    assert.notEqual(newCompute, oldCompute);
    assert.equal(oldDraw.destroyCalls, 1);
    assert.equal(oldCompute.destroyCalls, 1);
    assert.equal(newDraw.destroyCalls, 0);
    assert.equal(newCompute.destroyCalls, 0);
    assert.equal(f.allocations.length, 4);
});

test('allocation failure does not poison a graphics or compute tuple', () => {
    for (const branch of ['draw', 'compute']) {
        const f = fixture(),
            pass = f.pass(7);
        const allocate = f.device.createPipelineState;
        const failure = new Error('allocation failed');
        f.device.createPipelineState = () => {
            throw failure;
        };
        assert.throws(
            () => f[branch](pass),
            (error) => error === failure,
        );
        f.device.createPipelineState = allocate;
        const pipeline = f[branch](pass);
        assert.equal(f[branch](pass), pipeline);
        assert.equal(f.allocations.length, 1);
        const maps = f.mapAllocations();
        for (let i = 0; i < 1000; i++) assert.equal(f[branch](pass), pipeline);
        assert.equal(f.mapAllocations(), maps);
    }
});
