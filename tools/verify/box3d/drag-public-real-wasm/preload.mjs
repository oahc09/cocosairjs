// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Real production loader source with local-file transport, receipt-bound full Release candidate descriptor.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import inputs from './inputs.cjs';
const { root, sourceHashes, verifyArtifact } = inputs;
const directory = process.env.DRAG76_ARTIFACT,
    out = process.env.DRAG76_OUT;
assert(directory && out);
const artifact = await verifyArtifact(directory),
    before = sourceHashes();
const [{ createBox3DSTLoader }, { createBox3DBinding }] = await Promise.all([
    import(pathToFileURL(join(root, 'src/air/physics/box3d/loader/st-loader.mjs'))),
    import(pathToFileURL(join(root, 'src/air/physics/box3d/binding/facade.mjs'))),
]);
const report = {
    status: 'RUNNING',
    scope: 'Real EX01 spring controller, native COM, Hull/compound and PhysicsSystem queries in Node/JSDOM HEADLESS, real WASM generation identified by artifact receipt; not browser, production asset loader acceptance, all C26 or Gates',
    artifact,
    sourceHashesBefore: before,
    calls: [],
    nativeQueryCalls: [],
    nativeShapeCreates: [],
    nativeHullCreates: [],
    nativeHullValidations: [],
    nativeShapeDestroys: [],
    case: process.env.DRAG76_CASE,
    category: process.env.DRAG76_CASE === 'physics' ? 'REAL_PHYSICS' : 'REAL_NATIVE_PLUS_BOUNDARY_FAULT',
    checkpoints: [],
    transport: [],
};
const serial = (value) =>
    value === undefined
        ? null
        : JSON.parse(
              JSON.stringify(value, (_k, v) =>
                  typeof v === 'bigint' ? String(v) : ArrayBuffer.isView(v) ? Array.from(v) : v,
              ),
          );
const flush = () => writeFileSync(join(out, 'native-and-cocos.raw.json'), JSON.stringify(report, null, 2) + '\n');
let binding, moduleRef;
let armed = false,
    throwReadback = null;
const worlds = [];
const bodies = [];
const base = 'https://box3d-node-fixture.invalid/drag76-full/';
const loader = createBox3DSTLoader(
    artifact.descriptor,
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
            return import(pathToFileURL(join(directory, 'box3d-st.mjs')));
        },
        createBinding(module, expected) {
            moduleRef = module;
            const proxy = new Proxy(module, {
                get(target, key) {
                    if (throwReadback && key === throwReadback) {
                        throwReadback = null;
                        throw new Error('DRAG76 injected heap readback failure after real native success');
                    }
                    return target[key];
                },
            });
            binding = createBox3DBinding(proxy, expected);
            report.initialCoreBytes = String(binding.liveBytes());
            const native = module._air_b3_ray_query;
            module._air_b3_ray_query = (...args) => {
                const row = {
                    input: Array.from(module.HEAPF32.slice(args[1] >>> 2, (args[1] >>> 2) + 6)),
                    group: args[2],
                    mask: args[3],
                    queryTrigger: args[4],
                    capacityWords: args[6],
                };
                report.nativeQueryCalls.push(row);
                const status = native(...args);
                row.status = status;
                return status;
            };
            const massCreate = module._air_b3_mass_shape_create;
            module._air_b3_mass_shape_create = (...args) => {
                const count = args[3] === 0 ? 5 : args[3] === 1 ? 11 : 7;
                const row = {
                    world: args[0],
                    body: { low: args[1], high: args[2] },
                    kind: args[3],
                    input: Array.from(module.HEAPF32.slice(args[4] >>> 2, (args[4] >>> 2) + count)),
                    sensor: args[5],
                    target: args[6],
                };
                report.nativeShapeCreates.push(row);
                const status = massCreate(...args);
                row.status = status;
                if (status === 0)
                    row.shape = { low: module.HEAPU32[args[7] >>> 2], high: module.HEAPU32[(args[7] >>> 2) + 1] };
                return status;
            };
            const createHull = module._air_b3_mass_hull_create;
            module._air_b3_mass_hull_create = (...args) => {
                const row = {
                    world: args[0],
                    body: { low: args[1], high: args[2] },
                    input: Array.from(module.HEAPF32.slice(args[3] >>> 2, (args[3] >>> 2) + args[5])),
                    pointCount: args[4],
                    floatCount: args[5],
                    density: args[6],
                    sensor: args[7],
                    target: args[8],
                };
                report.nativeHullCreates.push(row);
                const status = createHull(...args);
                row.status = status;
                if (status === 0)
                    row.shape = { low: module.HEAPU32[args[9] >>> 2], high: module.HEAPU32[(args[9] >>> 2) + 1] };
                if (armed && status === 0) {
                    armed = false;
                    row.injection = process.env.DRAG76_CASE;
                    if (process.env.DRAG76_CASE === 'committed-readback') throwReadback = 'HEAPU32';
                    else if (process.env.DRAG76_CASE === 'unknown-after-native')
                        throw new Error('DRAG76 injected boundary throw after actual native creation');
                }
                return status;
            };
            const destroyShape = module._air_b3_mass_shape_destroy;
            module._air_b3_mass_shape_destroy = (...args) => {
                const row = {
                    world: args[0],
                    body: { low: args[1], high: args[2] },
                    shape: { low: args[3], high: args[4] },
                    target: args[5],
                };
                report.nativeShapeDestroys.push(row);
                const status = destroyShape(...args);
                row.status = status;
                if (armed && status === 0 && process.env.DRAG76_CASE === 'destroy-committed-readback') {
                    armed = false;
                    row.injection = process.env.DRAG76_CASE;
                    throwReadback = 'HEAPF32'; // Actual removal succeeded; fail only the facade's next body-state readback.
                }
                return status;
            };
            const validateHull = module._air_b3_hull_validate;
            module._air_b3_hull_validate = (...args) => {
                const row = {
                    world: args[0],
                    pointCount: args[2],
                    floatCount: args[3],
                    input: Array.from(module.HEAPF32.slice(args[1] >>> 2, (args[1] >>> 2) + args[3])),
                };
                report.nativeHullValidations.push(row);
                const status = validateHull(...args);
                row.status = status;
                return status;
            };
            const observed = { ...binding };
            for (const name of [
                'createWorld',
                'createBody',
                'createHull',
                'validateHull',
                'createOffsetBox',
                'destroyShape',
                'destroyWorld',
                'dispose',
                'step',
                'rayAllRaw',
            ]) {
                const real = binding[name];
                observed[name] = (...args) => {
                    const row = { name, args: serial(args), returned: false };
                    report.calls.push(row);
                    if (name === 'dispose')
                        report.beforeDispose = {
                            coreBytes: String(binding.liveBytes()),
                            bridge: serial(binding.bridgeMemory()),
                        };
                    try {
                        const result = real(...args);
                        row.returned = true;
                        row.result = serial(result);
                        if (name === 'createWorld') worlds.push(result);
                        if (name === 'createBody') bodies.push(result);
                        return result;
                    } catch (e) {
                        row.error = String(e);
                        row.mutationOutcome = Object.getOwnPropertyDescriptor(e, 'mutationOutcome')?.value ?? null;
                        throw e;
                    }
                };
            }
            return Object.freeze(observed);
        },
    },
);
const fixture = {
    loader,
    case: process.env.DRAG76_CASE,
    armFault: () => {
        assert(process.env.DRAG76_CASE !== 'physics');
        armed = true;
    },
    binding: () => binding,
    token: () => {
        assert.equal(worlds.length, 1);
        return worlds[0];
    },
    observations: () => serial(report),
    nativeShapeValid: (id) => moduleRef._air_b3_shape_valid(id.low, id.high),
    bodyTransformForNativeId(id) {
        const token = bodies.find((body) => body.low === id.low && body.high === id.high);
        assert(token);
        return Array.from(binding.bodyTransforms(worlds[0], [token]));
    },
    bodyStateForNativeId(id) {
        const token = bodies.find((body) => body.low === id.low && body.high === id.high);
        assert(token, 'Expected an observed, actual native body token');
        assert.equal(worlds.length, 1);
        return binding.bodyState(worlds[0], token);
    },
    checkpoint(name, data) {
        sourceHashes();
        report.checkpoints.push({ name, data: serial(data) });
        flush();
    },
    complete() {
        report.status =
            process.env.DRAG76_CASE === 'physics'
                ? 'PASS_LIMITED_COCOS_DRAG_PHYSICS'
                : 'PASS_LIMITED_COCOS_DRAG_FAULT_BOUNDARY';
        flush();
    },
    fail(error) {
        report.status = 'FAIL';
        report.error = String(error.stack ?? error);
        flush();
    },
    async shutdown() {
        if (loader.diagnostics().status !== 'DISPOSED') {
            report.fallbackCleanup = true;
            await loader.dispose();
        }
        report.loaderAfter = loader.diagnostics();
        report.sourceHashesAfter = sourceHashes();
        assert.deepEqual(report.sourceHashesAfter, before);
        flush();
    },
};
globalThis[Symbol.for('box3d.drag76.cocos-fixture')] = fixture;
flush();
