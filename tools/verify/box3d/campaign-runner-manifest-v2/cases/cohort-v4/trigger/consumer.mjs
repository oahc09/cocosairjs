/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Public production ESM only. Host DOM/URL adaptation does not alter engine or native behavior.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire, registerHooks } from 'node:module';
import { root, lock, sha, verifyInputs } from '../../cohort-v1/inputs.mjs';
import { runScenario } from './scenario.mjs';
const [artifactArgument, outputArgument, lockArgument, mode = 'lifecycle'] = process.argv.slice(2);
assert(
    ['admission', 'lifecycle', 'once-only', 'callback-destroy', 'dual-sensor', 'compound', 'callback-fault'].includes(
        mode,
    ),
);

const artifacts = resolve(artifactArgument),
    out = resolve(outputArgument);
const raw = join(out, 'consumer.raw.json');
assert(!existsSync(raw));
const before = verifyInputs(artifacts, lockArgument);
const require = createRequire(join(root, 'package.json'));
const { JSDOM, VirtualConsole } = require('jsdom');
const BASE = 'https://box3d-production-esm.invalid/physics/box3d/st/';
const bundle = pathToFileURL(join(artifacts, 'cocosair.module.js')).href;
const nativeModule = pathToFileURL(join(artifacts, 'physics/box3d/st/box3d-st.mjs')).href;
const report = {
    schema: 'box3d-production-esm-public-trigger-consumer-v1',
    cohortIdentity: lock.cohortIdentity,
    status: 'RUNNING',
    mode,
    scope: lock.scope,
    hostBoundary:
        'Node v24 does not natively load HTTPS ESM. Official registerHooks resolves only the exact requested Box3D module URL to unchanged frozen local bytes. This is not ordinary browser loading evidence.',
    startedAt: new Date().toISOString(),
    transport: [],
    moduleResolution: [],
    checks: [],
    events: [],
    frames: [],
    hostErrors: [],
};
const flush = () => writeFileSync(raw, JSON.stringify(report, null, 2) + '\n');
const check = (name, condition, detail = null) => {
    report.checks.push({ name, pass: !!condition, detail });
    flush();
    assert(condition, name);
};
const point = (value) => [value.x, value.y, value.z];
let sdk,
    app,
    clock,
    dom,
    hooks,
    tick = 0,
    failure,
    verifyRetainedAfterClose;
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => report.hostErrors.push(String(error.stack ?? error)));
flush();
try {
    dom = new JSDOM(
        '<!doctype html><html><body><div id="GameDiv"><div id="Cocos3dGameContainer"><canvas id="GameCanvas"></canvas></div></div></body></html>',
        {
            url: 'https://box3d-production-esm.invalid/',
            pretendToBeVisual: true,
            virtualConsole,
        },
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
            Object.defineProperty(globalThis, key, {
                value: dom.window[key],
                configurable: true,
            });
    }
    for (const key of ['requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle'])
        globalThis[key] = dom.window[key].bind(dom.window);
    dom.window.HTMLCanvasElement.prototype.getContext = function () {
        return null;
    };
    dom.window.HTMLCanvasElement.prototype.toDataURL = function () {
        return '';
    };
    globalThis.fetch = async (input, init) => {
        const url = String(input);
        const name = url.startsWith(BASE) ? url.slice(BASE.length) : null;
        assert(['manifest.json', 'box3d-st.wasm', 'box3d-st.mjs'].includes(name), 'Unexpected fetch: ' + url);
        assert.equal(init?.signal?.aborted, false);
        const relative = 'physics/box3d/st/' + name;
        const bytes = readFileSync(join(artifacts, relative));
        const expected = lock.runtime.find((item) => item.path === relative);
        assert.equal(sha(bytes), expected.sha256);
        assert.equal(bytes.length, expected.bytes);
        report.transport.push({ url, path: relative, sha256: sha(bytes), bytes: bytes.length });
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
    };
    hooks = registerHooks({
        resolve(specifier, context, nextResolve) {
            if (specifier === BASE + 'box3d-st.mjs') {
                assert.equal(context.parentURL, bundle, 'Only the real production loader may request this asset');
                const expected = lock.runtime.find((item) => item.path === 'physics/box3d/st/box3d-st.mjs');
                assert.equal(sha(readFileSync(new URL(nativeModule))), expected.sha256);
                report.moduleResolution.push({
                    requested: specifier,
                    parent: context.parentURL,
                    resolved: nativeModule,
                    sha256: expected.sha256,
                });
                flush();
                return { url: nativeModule, shortCircuit: true };
            }
            assert(!/^https?:/.test(specifier), 'Unexpected network module import: ' + specifier);
            return nextResolve(specifier, context);
        },
    });
    sdk = await import(bundle);
    check(
        'Production entry imports without acquiring native assets',
        report.transport.length === 0 && report.moduleResolution.length === 0,
    );
    check('Exact frozen runtime build', sdk.AIR_BUILD_NUMBER === lock.runtimeBuildNumber, sdk.AIR_BUILD_NUMBER);
    const required = [
        'createAirApp',
        'createStepClock',
        'Node',
        'Scene',
        'RigidBody',
        'SphereCollider',
        'BoxCollider',
        'PhysicsSystem',
        'Vec3',
    ];
    check(
        'Required engine calls are public exports',
        required.every((name) => typeof sdk[name] === 'function'),
        required,
    );
    check('No injected test-only production exports', !Object.keys(sdk).some((name) => name.startsWith('__testOnly')));
    app = await sdk.createAirApp({
        canvas: '#GameCanvas',
        physics: 'box3d',
        renderMode: 3,
        physicsOptions: { box3d: { assetBaseUrl: BASE, threading: 'single', workerCount: 1, solverSubSteps: 4 } },
    });
    check(
        'Public production loader consumes exactly the frozen ST assets',
        report.transport.map((entry) => entry.path).join(',') ===
            ['manifest.json', 'box3d-st.wasm', 'box3d-st.mjs'].map((name) => 'physics/box3d/st/' + name).join(',') &&
            report.moduleResolution.length === 1,
    );
    verifyRetainedAfterClose = await runScenario({ sdk, app, report, mode, flush });
} catch (error) {
    failure = error;
    report.error = String(error.stack ?? error);
    report.errorCode = error.code ?? null;
} finally {
    if (app) {
        try {
            const first = app.close();
            const duplicate = app.close();
            check('Public app.close is idempotent', first === duplicate);
            report.close = await first;
            verifyRetainedAfterClose?.();
            if (mode === 'callback-fault' && report.intentionalFaultObserved) {
                check(
                    'Only deliberate callback fault may retain terminal-clock close failure',
                    (report.close.status === 'released' && report.close.failures.length === 0) ||
                        (report.close.status === 'failed' &&
                            report.close.failures.length === 1 &&
                            report.close.failures[0].label === 'game-clock-terminal' &&
                            report.close.failures[0].message.includes('AIR_E_BOX3D_WORLD_FAULTED')),
                    report.close,
                );
            } else
                check(
                    'Healthy app.close releases without failures',
                    report.close.status === 'released' && report.close.failures.length === 0,
                    report.close,
                );
            check(
                'Public physics preparation reports clean disposal',
                report.close.physicsPreparation?.status === 'closed' &&
                    report.close.physicsPreparation.cleanupErrors.length === 0 &&
                    report.close.physicsPreparation.acquired.length > 0 &&
                    report.close.physicsPreparation.acquired.every(
                        (entry) =>
                            entry.backend === 'box3d' && entry.cleanup === 'released' && entry.retained.length === 0,
                    ),
                report.close.physicsPreparation,
            );
        } catch (error) {
            report.closeError = String(error.stack ?? error);
            if (!failure) failure = error;
        }
    }
    try {
        assert.deepEqual(verifyInputs(artifacts, lockArgument), before);
        report.inputsUnchanged = true;
    } catch (error) {
        report.inputError = String(error.stack ?? error);
        if (!failure) failure = error;
    }
    hooks?.deregister();
    dom?.window.close();
    report.totalSteps ??= tick;
    report.status = failure ? 'FAIL' : 'PASS_LIMITED_PRODUCTION_ESM_TRIGGER';
    report.completedAt = new Date().toISOString();
    if (failure) process.exitCode = 1;
    flush();
}
console.log(
    JSON.stringify({
        status: report.status,
        totalSteps: report.totalSteps,
        events: report.events.length,
        error: report.error ?? report.closeError ?? null,
    }),
);
