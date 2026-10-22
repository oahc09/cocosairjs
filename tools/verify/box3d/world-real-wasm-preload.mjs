// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Native Node ESM loader; production functions are never replaced by simulated physics.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import inputs from './world-real-wasm-inputs.cjs';
const { root, sourceHashes, qualify } = inputs;
const directory = process.env.AIR_BOX3D_REAL_DIR,
    out = process.env.AIR_BOX3D_REAL_OUT;
assert(directory && out, 'Use the collector entry, not this preload directly');
const qualified = qualify(directory);
const buildPaths = qualified.buildInputHashes.map((entry) => entry.path);
const before = sourceHashes(buildPaths);
const [{ createBox3DSTLoader }, { createBox3DBinding }] = await Promise.all([
    import(pathToFileURL(join(root, 'src/air/physics/box3d/loader/st-loader.mjs')).href),
    import(pathToFileURL(join(root, 'src/air/physics/box3d/binding/facade.mjs')).href),
]);
const report = {
    status: 'RUNNING',
    expected: process.env.AIR_BOX3D_REAL_EXPECT,
    artifact: qualified,
    sourceHashesBefore: before,
    transport: [],
    calls: [],
    checkpoints: [],
    observationErrors: [],
    moduleCreated: false,
};
let binding;
const worldTokens = [];
const base = 'https://box3d-node-fixture.invalid/real-world/';
const serial = (value) =>
    JSON.parse(
        JSON.stringify(value, (_key, item) =>
            typeof item === 'bigint' ? item.toString() : ArrayBuffer.isView(item) ? Array.from(item) : item,
        ),
    );
const flush = () => writeFileSync(join(out, 'native-and-app.raw.json'), JSON.stringify(serial(report), null, 2) + '\n');
function checkpoint(name, data) {
    assert.deepEqual(sourceHashes(buildPaths), before, 'Source changed during real-WASM collection');
    report.checkpoints.push({ name, data: serial(data), at: new Date().toISOString() });
    flush();
}
const loader = createBox3DSTLoader(
    qualified.descriptor,
    { defaultAssetBaseUrl: base },
    {
        async fetch(url, init) {
            assert(!init.signal.aborted && url.startsWith(base));
            const name = url.slice(base.length);
            assert(['manifest.json', 'box3d-st.mjs', 'box3d-st.wasm'].includes(name));
            report.transport.push(name);
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
        createBinding(module, expected) {
            const real = createBox3DBinding(module, expected);
            binding = real;
            report.moduleCreated = true;
            report.moduleHeapBytes = module.HEAPU8.byteLength;
            report.initialCoreBytes = String(real.liveBytes());
            report.initialBridge = typeof real.bridgeMemory === 'function' ? serial(real.bridgeMemory()) : null;
            const observed = { ...real };
            for (const name of ['createWorld', 'step', 'destroyWorld', 'dispose']) {
                const original = real[name];
                observed[name] = function (...args) {
                    const row = { name, args: serial(args), returned: false };
                    report.calls.push(row);
                    if (name === 'dispose') {
                        try {
                            report.beforeBindingDispose = {
                                coreBytes: String(real.liveBytes()),
                                bridge: typeof real.bridgeMemory === 'function' ? serial(real.bridgeMemory()) : null,
                            };
                        } catch (error) {
                            report.observationErrors.push(String(error));
                        }
                    }
                    try {
                        const value = Reflect.apply(original, this, args);
                        row.returned = true;
                        if (name === 'createWorld') worldTokens.push(value);
                        return value;
                    } catch (error) {
                        row.error = String(error);
                        throw error;
                    }
                };
            }
            return Object.freeze(observed);
        },
    },
);
const fixture = {
    loader,
    expected: report.expected,
    checkpoint,
    binding: () => {
        assert(binding, 'No real binding acquired');
        return binding;
    },
    token: () => {
        assert.equal(worldTokens.length, 1, 'Expected exactly one real native world');
        return worldTokens[0];
    },
    observations: () => serial(report),
    complete(status) {
        assert(['EXPECTED_REJECTION', 'PASS_LIMITED_NODE_WORLD'].includes(status));
        report.status = status;
        flush();
    },
    fail(error) {
        report.status = 'FAIL';
        report.error = String(error.stack ?? error);
        flush();
    },
    async shutdown() {
        if (loader.diagnostics().status !== 'DISPOSED') {
            report.fallbackLoaderCleanup = true;
            await loader.dispose();
        }
        report.loaderAfter = loader.diagnostics();
        report.sourceHashesAfter = sourceHashes(buildPaths);
        if (JSON.stringify(report.sourceHashesAfter) !== JSON.stringify(before)) report.status = 'STALE_INPUT';
        report.completedAt = new Date().toISOString();
        flush();
    },
};
globalThis[Symbol.for('cocosair.box3d.real-wasm-fixture')] = fixture;
flush();
