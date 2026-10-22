// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import inputs from './coexist-real-wasm-inputs.cjs';
const { root, qualifyThreeD, qualifyTwoD, sourceHashes, twoDModuleUrl, twoDWasmUrl, twoDDirectory, scenarios } = inputs;
const directory = process.env.AIR_COEXIST_DIR,
    out = process.env.AIR_COEXIST_OUT,
    scenario = process.env.AIR_COEXIST_CASE;
assert(directory && out && scenarios.includes(scenario));
const threeD = qualifyThreeD(directory),
    twoD = qualifyTwoD(),
    before = sourceHashes(threeD, twoD);
const [{ createBox3DSTLoader }, { createBox3DBinding }] = await Promise.all([
    import(pathToFileURL(join(root, 'src/air/physics/box3d/loader/st-loader.mjs')).href),
    import(pathToFileURL(join(root, 'src/air/physics/box3d/binding/facade.mjs')).href),
]);
const report = {
    status: 'RUNNING',
    scenario,
    qualifications: { threeD, twoD },
    sourceHashesBefore: before,
    calls: [],
    checkpoints: [],
    requests2D: [],
    requests3D: [],
    module2D: false,
    module3D: false,
    observationErrors: [],
};
const serial = (value) =>
    JSON.parse(
        JSON.stringify(value, (_key, item) =>
            typeof item === 'bigint'
                ? String(item)
                : typeof item === 'function'
                  ? '[native callback]'
                  : ArrayBuffer.isView(item)
                    ? Array.from(item)
                    : item,
        ),
    );
const flush = () => writeFileSync(join(out, 'native-and-app.raw.json'), JSON.stringify(serial(report), null, 2) + '\n');
let binding2D, binding3D;
const worlds2D = [],
    worlds3D = [];
function observe(real, backend, names, worlds) {
    const observed = { ...real };
    for (const name of names) {
        const original = real[name];
        observed[name] = function (...args) {
            const row = { backend, name, args: serial(args), returned: false };
            report.calls.push(row);
            if (backend === '3d' && name === 'dispose') {
                try {
                    report.before3DDispose = {
                        coreBytes: String(real.liveBytes()),
                        bridge: serial(real.bridgeMemory()),
                    };
                } catch (error) {
                    report.observationErrors.push(String(error));
                }
            }
            try {
                const value = Reflect.apply(original, this, args);
                row.returned = true;
                if (name === 'createWorld') worlds.push(value);
                return value;
            } catch (error) {
                row.error = String(error);
                throw error;
            }
        };
    }
    return observed;
}
const base = 'https://coexist-box3d.invalid/st/';
const loader = createBox3DSTLoader(
    threeD.descriptor,
    { defaultAssetBaseUrl: base },
    {
        async fetch(url, init) {
            assert(!init.signal.aborted && url.startsWith(base));
            const name = url.slice(base.length);
            assert(['manifest.json', 'box3d-st.mjs', 'box3d-st.wasm'].includes(name));
            report.requests3D.push(name);
            if (scenario === '3d-failure') return new Response('fixture transport failure', { status: 503 });
            return new Response(readFileSync(join(directory, name)), {
                headers: {
                    'content-type': name.endsWith('.wasm')
                        ? 'application/wasm'
                        : name.endsWith('.json')
                          ? 'application/json'
                          : 'text/javascript',
                },
            });
        },
        async loadModule(url) {
            assert.equal(url, base + 'box3d-st.mjs');
            return import(pathToFileURL(join(directory, 'box3d-st.mjs')).href);
        },
        createBinding(module, identity) {
            const real = createBox3DBinding(module, identity);
            binding3D = real;
            report.module3D = true;
            report.initial3DBytes = String(real.liveBytes());
            return Object.freeze(observe(real, '3d', ['createWorld', 'step', 'destroyWorld', 'dispose'], worlds3D));
        },
    },
);
const fixture = {
    loader,
    scenario,
    twoDAssetBase: pathToFileURL(twoDDirectory + '/').href,
    async fetchTwoD(url) {
        assert.equal(String(url), twoDWasmUrl, 'No network or unbounded resource fallback');
        report.requests2D.push({ kind: 'wasm', url: String(url) });
        return scenario === '2d-failure'
            ? new Response('fixture transport failure', { status: 503 })
            : new Response(readFileSync(join(twoDDirectory, 'air-box2d.wasm')));
    },
    async createTwoDModule(...args) {
        report.requests2D.push({ kind: 'module', url: twoDModuleUrl });
        const { default: factory } = await import(twoDModuleUrl);
        const real = await Reflect.apply(factory, this, args);
        binding2D = real;
        report.module2D = true;
        return observe(real, '2d', ['createWorld', 'step', 'destroyWorld'], worlds2D);
    },
    twoD() {
        assert(binding2D && worlds2D.length === 1);
        return { api: binding2D, world: worlds2D[0] };
    },
    threeD() {
        assert(binding3D && worlds3D.length === 1);
        return { api: binding3D, world: worlds3D[0] };
    },
    observations: () => serial(report),
    checkpoint(name, data) {
        assert.deepEqual(sourceHashes(threeD, twoD), before, 'Coexistence source changed');
        report.checkpoints.push({ name, data: serial(data), at: new Date().toISOString() });
        flush();
    },
    complete(status) {
        assert(['PASS_LIMITED_NODE_COEXIST', 'EXPECTED_REJECTION'].includes(status));
        report.status = status;
        flush();
    },
    fail(error) {
        report.status = 'FAIL';
        report.error = String(error.stack ?? error);
        flush();
    },
    async shutdown() {
        report.loaderBeforeFallback = loader.diagnostics();
        if (report.module3D && loader.diagnostics().status !== 'DISPOSED') {
            report.fallback3DCleanup = true;
            await loader.dispose();
        }
        report.loaderAfter = loader.diagnostics();
        report.sourceHashesAfter = sourceHashes(threeD, twoD);
        if (JSON.stringify(before) !== JSON.stringify(report.sourceHashesAfter)) report.status = 'STALE_INPUT';
        report.completedAt = new Date().toISOString();
        flush();
    },
};
globalThis[Symbol.for('cocosair.box3d.coexist-real-wasm')] = fixture;
flush();
