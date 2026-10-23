/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// LIMITED_CPU_WIRING only. Instrumented adapter/loader, no native/engine/browser qualification.
// Reads sources and prints results; writes no evidence, runtime outputs, or status records.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const root = path.resolve(process.argv[2] || path.join(__dirname, '../../..'));
const overlay = process.argv[3] && path.resolve(process.argv[3]);
const ts = createRequire(path.join(root, 'package.json'))('typescript');
const hashes = {};
function evaluate(relative, dependencies = {}) {
    const sourcePath =
        overlay && fs.existsSync(path.join(overlay, relative))
            ? path.join(overlay, relative)
            : path.join(root, relative);
    const source = fs.readFileSync(sourcePath, 'utf8');
    hashes[relative] = createHash('sha256').update(source).digest('hex');
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        fileName: relative,
        reportDiagnostics: true,
    });
    assert.deepEqual(compiled.diagnostics, []);
    const module = { exports: {} };
    vm.runInNewContext(
        compiled.outputText,
        {
            module,
            exports: module.exports,
            Object,
            Number,
            Error,
            Promise,
            require(name) {
                assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${relative} -> ${name}`);
                return dependencies[name];
            },
        },
        { filename: relative },
    );
    return module.exports;
}
function fixture() {
    const preparation = evaluate('src/air/physics/preparation.ts').createAirPhysicsPreparation();
    const api = evaluate('src/air/physics/box3d/prepare.ts');
    const calls = [];
    const selector = Object.freeze({ identity: 'canonical-selector-probe' });
    let instance;
    let reads = 0;
    const PhysicsSystem = {
        get instance() {
            reads++;
            return instance;
        },
    };
    let captured;
    const lease = Object.freeze({
        dispose() {
            calls.push('module-dispose');
        },
    });
    const loader = Object.freeze({
        async prepare(options) {
            calls.push(['loader-prepare', options]);
            return lease;
        },
    });
    const dependencies = {
        './loader/st-loader.mjs': {
            createBox3DSTLoader(descriptor, options) {
                calls.push(['loader-create', descriptor, options]);
                return loader;
            },
        },
        './prepare': api,
        './registration': {
            createBox3DWorldAdapter(selected, components, qualification, environment) {
                calls.push('factory');
                captured = { selected, components, qualification, environment };
                return (actualLease, options, owner) => {
                    calls.push('adapter-prepare');
                    assert.equal(actualLease, lease);
                    assert.equal(owner, preparation);
                    assert.equal(options.threading, 'single');
                    assert.equal(owner.diagnostics().acquired[0].resource, 'module');
                    return Object.freeze({
                        select() {
                            calls.push('select');
                        },
                    });
                };
            },
        },
        '../../../cocos/physics/framework/physics-selector': { selector },
        '../../../cocos/physics/framework/physics-system': { PhysicsSystem },
    };
    return {
        preparation,
        api,
        calls,
        selector,
        loader,
        load: () => evaluate('src/air/physics/box3d/feature.ts', dependencies),
        captured: () => captured,
        reads: () => reads,
        instance: (value) => {
            instance = value;
        },
    };
}
const options = Object.freeze({ assetBaseUrl: undefined, threading: 'single', workerCount: 1, solverSubSteps: 4 });
const results = [];
async function test(name, action) {
    await action();
    results.push({ name, status: 'PASS' });
}
(async () => {
    await test('missing feature remains unavailable before loader or adapter', async () => {
        const f = fixture();
        await assert.rejects(f.api.prepareBox3D(options, f.preparation), { code: 'AIR_E_PHYSICS_BACKEND_UNAVAILABLE' });
        assert.equal(f.calls.length, 0);
        assert.equal(f.preparation.diagnostics().acquired.length, 0);
    });
    await test('loader-only registration still fails closed for a missing real adapter', async () => {
        const f = fixture();
        f.api.registerBox3DFeature({
            createLoader() {
                throw new Error('Loader must stay lazy');
            },
        });
        await assert.rejects(f.api.prepareBox3D(options, f.preparation), { code: 'AIR_E_BOX3D_UNSUPPORTED' });
        assert.equal(f.preparation.diagnostics().acquired.length, 0);
    });
    await test('production feature installs canonical lazy readers without acquiring resources', async () => {
        const f = fixture();
        f.load();
        assert.deepEqual(f.calls, ['factory']);
        assert.equal(f.reads(), 0);
        assert.equal(f.preparation.diagnostics().acquired.length, 0);
        const c = f.captured();
        assert.equal(c.selected, f.selector);
        assert.equal(c.qualification, undefined);
        const first = { collisionMatrix: { 4: 10 }, sleepThreshold: 0.125 };
        f.instance(first);
        assert.equal(c.environment.physicsSystem(), first);
        assert.equal(c.components.collisionMask(4), 10);
        assert.equal(c.components.sleepThreshold(), 0.125);
        const second = { collisionMatrix: { 4: 12 }, sleepThreshold: 0.25 };
        f.instance(second);
        assert.equal(c.environment.physicsSystem(), second);
        assert.equal(c.components.collisionMask(4), 12);
        assert.equal(c.components.sleepThreshold(), 0.25);
    });
    await test('unsupported threading rejects before lazy loader construction', async () => {
        const f = fixture();
        f.load();
        await assert.rejects(f.api.prepareBox3D({ ...options, threading: 'multi', workerCount: 2 }, f.preparation), {
            code: 'AIR_E_BOX3D_VARIANT_UNAVAILABLE',
        });
        assert.deepEqual(f.calls, ['factory']);
        assert.equal(f.reads(), 0);
    });
    await test('normal preparation owns module before adapter and leaves synchronous selection to bootstrap', async () => {
        const f = fixture();
        f.load();
        const prepared = await f.api.prepareBox3D(options, f.preparation);
        assert.deepEqual(
            f.calls.map((item) => (Array.isArray(item) ? item[0] : item)),
            ['factory', 'loader-create', 'loader-prepare', 'adapter-prepare'],
        );
        assert.equal(f.reads(), 0);
        prepared.select();
        assert.equal(f.calls.at(-1), 'select');
        const receipt = await f.preparation.dispose();
        assert.equal(receipt.status, 'closed');
        assert.equal(receipt.acquired[0].cleanup, 'released');
        assert.equal(f.calls.at(-1), 'module-dispose');
    });
    console.log(
        JSON.stringify(
            {
                status: 'PASS_LIMITED_CPU_WIRING',
                limitations: [
                    'Adapter factory and loader are instrumented probes.',
                    'No real world/native WASM/browser execution.',
                    'Does not certify API capabilities or alter existing evidence.',
                ],
                hashes,
                results,
            },
            null,
            2,
        ),
    );
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
