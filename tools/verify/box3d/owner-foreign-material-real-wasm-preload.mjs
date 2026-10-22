/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/
// Production Node loader/facade, strict current artifact. No fake native values or historical fallback.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import inputs from './owner-foreign-material-real-wasm-inputs.cjs';
const { root, sourceHashes, qualify } = inputs;
const directory = process.env.AIR_BOX3D_FOREIGN_MATERIAL_DIR,
    out = process.env.AIR_BOX3D_FOREIGN_MATERIAL_OUT;
assert(directory && out, 'Use the collector entry, not this preload directly');
const qualified = qualify(directory),
    buildPaths = qualified.buildInputHashes.map((entry) => entry.path);
const before = sourceHashes(buildPaths);
const [{ createBox3DSTLoader }, { createBox3DBinding }] = await Promise.all([
    import(pathToFileURL(join(root, 'src/air/physics/box3d/loader/st-loader.mjs')).href),
    import(pathToFileURL(join(root, 'src/air/physics/box3d/binding/facade.mjs')).href),
]);
const report = {
    status: 'RUNNING',
    expected: process.env.AIR_BOX3D_FOREIGN_MATERIAL_EXPECT,
    deliberateFault: 'NONE',
    artifact: qualified,
    sourceHashesBefore: before,
    transport: [],
    calls: [],
    checkpoints: [],
    observationErrors: [],
    moduleCreated: false,
};
const serial = (value) =>
    value === undefined
        ? null
        : JSON.parse(
              JSON.stringify(value, (_key, item) =>
                  typeof item === 'bigint' ? item.toString() : ArrayBuffer.isView(item) ? Array.from(item) : item,
              ),
          );
const flush = () => writeFileSync(join(out, 'native-and-app.raw.json'), JSON.stringify(serial(report), null, 2) + '\n');
function checkpoint(name, data) {
    assert.deepEqual(sourceHashes(buildPaths), before, 'Source changed during collection');
    report.checkpoints.push({ name, data: serial(data), at: new Date().toISOString() });
    flush();
}
let binding;
const worlds = [],
    bodies = [],
    shapes = [],
    liveShapes = new Set();
const base = 'https://box3d-node-fixture.invalid/foreign-material-owner/';
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
            report.initialBridge = serial(real.bridgeMemory());
            const observed = { ...real };
            for (const name of Object.keys(real).filter((name) => typeof real[name] === 'function')) {
                const original = real[name];
                observed[name] = function (...args) {
                    const row = { name, args: serial(args), returned: false };
                    report.calls.push(row);
                    if (name === 'dispose') {
                        try {
                            report.beforeBindingDispose = {
                                coreBytes: String(real.liveBytes()),
                                bridge: serial(real.bridgeMemory()),
                            };
                        } catch (error) {
                            report.observationErrors.push(String(error));
                        }
                    }
                    try {
                        const result = Reflect.apply(original, this, args);
                        row.returned = true;
                        row.result = serial(result);
                        if (name === 'createWorld') worlds.push(result);
                        if (name === 'createBody') bodies.push(result);
                        if (name === 'createOffsetBox' || name === 'createOffsetSphere') {
                            shapes.push(result);
                            liveShapes.add(result);
                        }
                        if (name === 'destroyShape') liveShapes.delete(args[1]);
                        return result;
                    } catch (error) {
                        row.error = String(error);
                        row.mutationOutcome = error?.mutationOutcome ?? 'unknown';
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
        assert(binding, 'Real binding not acquired');
        return binding;
    },
    token: () => {
        assert.equal(worlds.length, 1);
        return worlds[0];
    },
    bodies: () => [...bodies],
    shapes: () => [...shapes],
    liveShapes: () => [...liveShapes],
    observations: () => serial(report),
    complete(status) {
        assert.equal(status, 'PASS_LIMITED_FOREIGN_MATERIAL');
        report.status = status;
        flush();
    },
    fail(error) {
        report.status = error?.code === 'PENDING_FIXTURE_SEAM' ? 'PENDING_FIXTURE_SEAM' : 'FAIL';
        report.error = String(error?.stack ?? error);
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
globalThis[Symbol.for('cocosair.box3d.foreign-material-fixture')] = fixture;
flush();
