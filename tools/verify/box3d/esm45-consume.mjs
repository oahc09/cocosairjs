/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Node+jsdom CPU consumption, NOT a browser/renderer/public integration claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const [root, artifacts, consumer, mode, rawFile] = process.argv.slice(2);
assert(root && artifacts && consumer && mode && rawFile && process.argv.length === 7);
assert(['production-selected', 'TEST-ONLY-explicit-adapter'].includes(mode));
assert(!fs.existsSync(rawFile), 'Never overwrite raw evidence');
const require = createRequire(path.join(root, 'package.json'));
const contract = JSON.parse(fs.readFileSync(new URL('./esm45-contract.json', import.meta.url), 'utf8'));
const { JSDOM } = require('jsdom');
const report = {
    schema: 'box3d-esm45-consumption-v1',
    status: 'RUNNING',
    mode,
    environment: 'Node 24 + jsdom CPU/HEADLESS; not browser transport or rendering',
    productionIntegration: 'UNFINISHED_LOADER_ONLY',
    checks: [],
    transport: [],
    nativeCalls: [],
    moduleImports: [],
    observationErrors: [],
    startedAt: new Date().toISOString(),
};
const serial = (v) =>
    v === undefined
        ? null
        : JSON.parse(
              JSON.stringify(v, (_k, item) =>
                  typeof item === 'bigint' ? String(item) : ArrayBuffer.isView(item) ? Array.from(item) : item,
              ),
          );
const flush = () => fs.writeFileSync(rawFile, JSON.stringify(serial(report), null, 2) + '\n');
const check = (name, value, actual) => {
    report.checks.push({ name, pass: !!value, actual: serial(actual) });
    flush();
    assert(value, name);
};
const sha = (b) => createHash('sha256').update(b).digest('hex');
const BASE = contract.assetBaseUrl;
const n4 = path.join(root, contract.n4RelativeDirectory);
let sdk,
    app,
    clock,
    binding,
    disposed = false,
    world;
flush();
const dom = new JSDOM(
    '<!doctype html><html><head></head><body><div id="GameDiv"><div id="Cocos3dGameContainer"><canvas id="GameCanvas"></canvas></div></div></body></html>',
    { url: 'https://box3d-esm45.invalid/', pretendToBeVisual: true },
);
for (const key of [
    'window',
    'document',
    'navigator',
    'location',
    'screen',
    'HTMLElement',
    'HTMLCanvasElement',
    'HTMLImageElement',
    'HTMLVideoElement',
    'HTMLAudioElement',
    'Element',
    'Event',
    'Image',
    'XMLHttpRequest',
    'DOMParser',
    'MutationObserver',
    'DeviceMotionEvent',
    'DeviceOrientationEvent',
]) {
    if (dom.window[key] !== undefined)
        Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
for (const key of ['requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle'])
    globalThis[key] = dom.window[key].bind(dom.window);
dom.window.HTMLCanvasElement.prototype.getContext = function () {
    return null;
};
dom.window.HTMLCanvasElement.prototype.toDataURL = function () {
    return '';
};
globalThis.fetch = async (url) => {
    report.transport.push({ kind: 'unexpected-global-fetch', url: String(url) });
    flush();
    throw new Error('No network transport is allowed in this bounded consumption fixture');
};
const transport = {
    async fetch(url, init) {
        assert(mode.startsWith('TEST-ONLY'));
        assert.equal(init.signal.aborted, false);
        assert(url.startsWith(BASE));
        const name = url.slice(BASE.length);
        assert(['manifest.json', 'box3d-st.mjs', 'box3d-st.wasm'].includes(name));
        const bytes = fs.readFileSync(path.join(n4, name));
        report.transport.push({
            kind: 'test-only-local-bytes',
            url,
            path: contract.n4RelativeDirectory + '/' + name,
            bytes: bytes.length,
            sha256: sha(bytes),
        });
        flush();
        return new Response(bytes, {
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
        assert.equal(url, BASE + 'box3d-st.mjs');
        const filename = path.join(n4, 'box3d-st.mjs');
        report.moduleImports.push({
            kind: 'exact-local-N4-generated-ESM',
            path: contract.n4RelativeDirectory + '/box3d-st.mjs',
            sha256: sha(fs.readFileSync(filename)),
        });
        flush();
        return import(pathToFileURL(filename).href);
    },
    createBinding(module, expected) {
        assert(sdk && mode.startsWith('TEST-ONLY'));
        const real = sdk.__testOnlyCreateBox3DBinding(module, expected);
        binding = real;
        report.nativeIdentity = serial(real.identity);
        report.heapBytes = module.HEAPU8.byteLength;
        report.initialCoreBytes = String(real.liveBytes());
        const observed = { ...real };
        for (const name of Object.keys(real).filter((key) => typeof real[key] === 'function')) {
            observed[name] = function (...args) {
                const row = { name, args: serial(args), returned: false };
                report.nativeCalls.push(row);
                if (name === 'dispose') {
                    report.beforeBindingDispose = {
                        coreBytes: String(real.liveBytes()),
                        bridge: serial(real.bridgeMemory()),
                    };
                }
                try {
                    const result = Reflect.apply(real[name], real, args);
                    row.returned = true;
                    row.result = serial(result);
                    if (name === 'dispose') disposed = true;
                    return result;
                } catch (error) {
                    row.error = String(error);
                    throw error;
                } finally {
                    flush();
                }
            };
        }
        return Object.freeze(observed);
    },
};
try {
    if (mode.startsWith('TEST-ONLY')) globalThis[Symbol.for(contract.transportSymbol)] = transport;
    const builds = JSON.parse(fs.readFileSync(path.join(artifacts, 'build.raw.json'), 'utf8'));
    const graph = builds.graphs.find((g) => g.mode === mode);
    const entry =
        mode === 'production-selected'
            ? path.join(consumer, 'package-consumer.mjs')
            : path.join(artifacts, mode, graph.entry);
    report.engineEntry = entry;
    report.engineEntrySHA256 = sha(fs.readFileSync(path.join(artifacts, mode, graph.entry)));
    sdk = await import(pathToFileURL(entry).href);
    check(
        'module evaluation requests no Box3D asset',
        report.transport.length === 0 && report.moduleImports.length === 0,
        { transport: report.transport, imports: report.moduleImports },
    );
    const options = {
        canvas: '#GameCanvas',
        renderMode: 3,
        physics: 'box3d',
        physicsOptions: { box3d: { assetBaseUrl: BASE, threading: 'single', workerCount: 1, solverSubSteps: 4 } },
    };
    if (mode === 'production-selected') {
        let rejection;
        try {
            app = await sdk.createAirApp(options);
        } catch (error) {
            rejection = error;
        }
        report.productionRejection = {
            code: rejection?.code ?? null,
            message: String(rejection?.message ?? rejection),
        };
        check(
            'public selected production refuses missing adapter',
            rejection?.code === 'AIR_E_BOX3D_UNSUPPORTED',
            report.productionRejection,
        );
        const receipt = globalThis[Symbol.for('cocosair.bootstrap.v1')]?.physicsPreparation;
        check(
            'production refusal occurs before transport or native acquisition',
            report.transport.length === 0 &&
                report.moduleImports.length === 0 &&
                report.nativeCalls.length === 0 &&
                receipt?.acquired.length === 0 &&
                receipt?.originalError?.code === 'AIR_E_BOX3D_UNSUPPORTED',
            receipt,
        );
        check('public package has no TEST-ONLY export', !('__testOnlyRegisterBox3DAdapter' in sdk), Object.keys(sdk));
        report.status = 'PASS_BOUNDED_PRODUCTION_REFUSAL_NOT_INTEGRATION';
    } else {
        const before = sdk.__testOnlyBox3DGraphIdentity();
        check('TEST-ONLY hook shares actual exported PhysicsSystem class', before.PhysicsSystem === sdk.PhysicsSystem, {
            sameClass: before.PhysicsSystem === sdk.PhysicsSystem,
        });
        sdk.__testOnlyRegisterBox3DAdapter();
        check('explicit adapter registration performs no transport', report.transport.length === 0, report.transport);
        app = await sdk.createAirApp(options);
        const identity = sdk.__testOnlyBox3DGraphIdentity();
        world = identity.system.physicsWorld;
        check(
            'one actual system selector and adapter world',
            identity.system === sdk.PhysicsSystem.instance &&
                world === identity.selector.physicsWorld &&
                world instanceof identity.Box3DPhysicsWorld &&
                identity.selector.id === 'box3d',
            { selectorId: identity.selector.id },
        );
        const scene = new sdk.Scene('esm45-actual-scene');
        clock = sdk.createStepClock({ frameRate: 60, stepTimeoutMs: 2000 });
        app.run(scene);
        clock.begin();
        const system = sdk.PhysicsSystem.instance;
        system.fixedTimeStep = 1 / 60;
        system.maxSubSteps = 1;
        system.autoSimulation = true;
        system.gravity = new sdk.Vec3(0, 0, 0);
        const node = new sdk.Node('esm45-actual-dynamic-body');
        const body = node.addComponent(sdk.RigidBody);
        body.type = sdk.ERigidBodyType.DYNAMIC;
        body.useGravity = false;
        body.linearDamping = 0;
        body.angularDamping = 0;
        node.addComponent(sdk.BoxCollider);
        scene.addChild(node);
        body.setLinearVelocity(new sdk.Vec3(1, 0, 0));
        const start = world.diagnostics().native.nativeStepIndex;
        const observations = [];
        for (let i = 0; i < 3; i++) {
            const frame = await clock.step(1 / 60);
            observations.push({
                frame,
                nativeStep: world.diagnostics().native.nativeStepIndex,
                position: [node.worldPosition.x, node.worldPosition.y, node.worldPosition.z],
            });
        }
        report.stepObservations = observations;
        check(
            'three real fixed-clock steps advance N4 exactly three ticks',
            observations.every((row, i) => row.frame.afterDraw === true && row.nativeStep === start + i + 1),
            observations,
        );
        check(
            'actual engine Node follows native dynamic-body motion',
            Number.isFinite(node.worldPosition.x) &&
                Math.abs(node.worldPosition.x - 3 / 60) <= 1e-4 &&
                Math.abs(node.worldPosition.y) <= 1e-4 &&
                Math.abs(node.worldPosition.z) <= 1e-4,
            observations,
        );
        check(
            'real N4 exact bytes and module import used',
            report.moduleImports.length === 1 &&
                report.transport.filter((r) => r.path?.endsWith('/box3d-st.wasm'))[0]?.sha256 ===
                    contract.n4WasmSHA256 &&
                report.nativeCalls.some((r) => r.name === 'createWorld' && r.returned) &&
                report.nativeCalls.some((r) => r.name === 'createBody' && r.returned) &&
                report.nativeCalls.filter((r) => r.name === 'step' && r.returned).length === 3,
            { transport: report.transport, moduleImports: report.moduleImports },
        );
        report.closeReceipt = await app.close();
        check(
            'actual app close releases world then module without retained resources',
            report.closeReceipt.status === 'released' &&
                report.closeReceipt.failures.length === 0 &&
                report.closeReceipt.retained.length === 0 &&
                report.closeReceipt.physicsPreparation.status === 'closed' &&
                report.closeReceipt.physicsPreparation.acquired.every(
                    (r) => r.cleanup === 'released' && r.retained.length === 0,
                ) &&
                disposed &&
                report.beforeBindingDispose?.coreBytes === '0' &&
                report.beforeBindingDispose?.bridge.liveBytes === '0' &&
                report.nativeCalls.filter((r) => r.name === 'destroyWorld' && r.returned).length === 1,
            { close: report.closeReceipt, beforeBindingDispose: report.beforeBindingDispose },
        );
        report.status = 'PASS_BOUNDED_TEST_ONLY_INTERNAL_ESM_N4_NOT_PUBLIC_INTEGRATION';
    }
} catch (error) {
    report.status = 'FAIL';
    report.error = String(error.stack || error);
    process.exitCode = 1;
} finally {
    if (app && !report.closeReceipt) {
        try {
            report.fallbackClose = await app.close();
        } catch (error) {
            report.observationErrors.push('fallback close: ' + String(error));
            process.exitCode = 1;
        }
    }
    // No clock.end after app.close: close is terminal and must not restart native pacing.
    dom.window.close();
    delete globalThis[Symbol.for(contract.transportSymbol)];
    if (report.observationErrors.length) report.status = 'FAIL';
    report.completedAt = new Date().toISOString();
    flush();
}
