/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Public production ESM only. Host DOM/URL adaptation does not alter engine or native behavior.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire, registerHooks } from 'node:module';
import { root, lock, sha, verifyInputs } from '../inputs.mjs';
const [artifactArgument, outputArgument] = process.argv.slice(2);
const artifacts = resolve(artifactArgument),
    out = resolve(outputArgument);
const family = process.env.CONTACT_FAMILY;
assert(['box-box', 'capsule-box', 'capsule-capsule'].includes(family));
const raw = join(out, 'consumer.raw.json');
assert(!existsSync(raw));
const before = verifyInputs(artifacts);
const require = createRequire(join(root, 'package.json'));
const { JSDOM, VirtualConsole } = require('jsdom');
const BASE = 'https://box3d-production-esm.invalid/physics/box3d/st/';
const bundle = pathToFileURL(join(artifacts, 'cocosair.module.js')).href;
const nativeModule = pathToFileURL(join(artifacts, 'physics/box3d/st/box3d-st.mjs')).href;
const report = {
    schema: 'box3d-production-esm-public-collision-consumer-v1',
    status: 'RUNNING',
    cohortIdentity: lock.cohortIdentity,
    cohortCaseFamily: 'contact',
    contactFamily: family,
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
    failure;
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
        'CapsuleCollider',
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
    const { Node, Scene, RigidBody, BoxCollider, CapsuleCollider, PhysicsSystem, Vec3 } = sdk;
    const system = PhysicsSystem.instance;
    system.enable = false;
    system.autoSimulation = true;
    system.fixedTimeStep = 1 / 60;
    system.maxSubSteps = 1;
    system.gravity = new Vec3(0, -10, 0);
    const scene = new Scene('production-esm-public-collision');
    const floorNode = new Node('static-support');
    floorNode.setPosition(0, family === 'capsule-capsule' ? -0.8 : -0.5, 0);
    floorNode.addComponent(RigidBody).type = RigidBody.Type.STATIC;
    const floor = floorNode.addComponent(family === 'capsule-capsule' ? CapsuleCollider : BoxCollider);
    if (family === 'capsule-capsule') {
        floor.radius = 0.5;
        floor.cylinderHeight = 0.6;
    } else floor.size = new Vec3(8, 1, 8);
    scene.addChild(floorNode);
    const sphereNode = new Node('falling-item');
    sphereNode.setPosition(0, 3, 0);
    const body = sphereNode.addComponent(RigidBody);
    body.type = RigidBody.Type.DYNAMIC;
    body.mass = 1;
    body.allowSleep = false;
    body.linearDamping = 0;
    body.angularDamping = 0;
    const sphere = sphereNode.addComponent(family === 'box-box' ? BoxCollider : CapsuleCollider);
    if (family === 'box-box') sphere.size = new Vec3(1, 1, 1);
    else {
        sphere.radius = 0.5;
        sphere.cylinderHeight = 0.6;
    }
    scene.addChild(sphereNode);
    app.run(scene);
    clock = sdk.createStepClock({ frameRate: 60, stepTimeoutMs: 2000 });
    clock.begin();
    const step = async () => {
        tick++;
        const frame = await clock.step(1 / 60);
        assert.deepEqual(frame, { step: tick, dt: 1 / 60, afterDraw: true });
        report.frames.push(frame);
    };
    await step();
    const kinds = ['onCollisionEnter', 'onCollisionStay', 'onCollisionExit'];
    const getters = [
        'getLocalPointOnA',
        'getLocalPointOnB',
        'getWorldPointOnA',
        'getWorldPointOnB',
        'getLocalNormalOnA',
        'getLocalNormalOnB',
        'getWorldNormalOnA',
        'getWorldNormalOnB',
    ];
    const retainedEquations = [];
    const copyEvent = (event, self, other, kind) => {
        assert.equal(event.type, kind);
        assert.equal(event.selfCollider, self);
        assert.equal(event.otherCollider, other);
        assert(Array.isArray(event.contacts));
        if (kind !== 'onCollisionExit') assert(event.contacts.length > 0);
        return {
            tick,
            type: kind,
            self: self.node.name,
            other: other.node.name,
            contacts: event.contacts.map((contact) => {
                assert.equal(typeof contact.isBodyA, 'boolean');
                const copied = { isBodyA: contact.isBodyA };
                retainedEquations.push(contact);
                for (const getter of getters) {
                    const value = new Vec3(Number.NaN, Number.NaN, Number.NaN);
                    contact[getter](value);
                    copied[getter] = point(value);
                    assert(copied[getter].every(Number.isFinite));
                    value.set(111, 222, 333);
                    contact[getter](value);
                    assert.deepEqual(point(value), copied[getter]);
                }
                for (const getter of ['getWorldNormalOnA', 'getWorldNormalOnB'])
                    assert(Math.abs(Math.hypot(...copied[getter]) - 1) < 0.0003);
                for (let axis = 0; axis < 3; axis++) {
                    assert(
                        Math.abs(
                            copied.getWorldNormalOnA[axis] -
                                (contact.isBodyA ? 1 : -1) * copied.getWorldNormalOnB[axis],
                        ) < 0.00002,
                    );
                }
                return copied;
            }),
        };
    };
    for (const [self, other] of [
        [sphere, floor],
        [floor, sphere],
    ])
        for (const kind of kinds) self.on(kind, (event) => report.events.push(copyEvent(event, self, other, kind)));
    let onceEnter = 0,
        onceStay = 0,
        onceExit = 0,
        removedStay = 0;
    const onceStayCallback = (event) => {
        copyEvent(event, sphere, floor, 'onCollisionStay');
        onceStay++;
        assert.equal(sphere.hasEventListener('onCollisionStay', onceStayCallback), false);
    };
    const removeInsideStay = (event) => {
        copyEvent(event, sphere, floor, 'onCollisionStay');
        removedStay++;
        sphere.off('onCollisionStay', removeInsideStay);
        assert.equal(sphere.hasEventListener('onCollisionStay', removeInsideStay), false);
    };
    const onceEnterCallback = (event) => {
        copyEvent(event, sphere, floor, 'onCollisionEnter');
        onceEnter++;
        assert.equal(sphere.hasEventListener('onCollisionEnter', onceEnterCallback), false);
        sphere.once('onCollisionStay', onceStayCallback);
        sphere.on('onCollisionStay', removeInsideStay);
    };
    sphere.once('onCollisionEnter', onceEnterCallback);
    sphere.once('onCollisionExit', (event) => {
        copyEvent(event, sphere, floor, 'onCollisionExit');
        onceExit++;
    });
    system.enable = true;
    const events = (name, kind) => report.events.filter((event) => event.self === name && event.type === kind);
    for (let i = 0; i < 180 && !events('falling-item', 'onCollisionEnter').length; i++) await step();
    check('Actual family item reaches public collision enter', events('falling-item', 'onCollisionEnter').length === 1);
    const retainedCopy = JSON.stringify(report.events[0]);
    for (let i = 0; i < 40; i++) await step();
    for (const name of ['falling-item', 'static-support']) {
        check(
            name + ' real enter/stay without premature exit',
            events(name, 'onCollisionEnter').length === 1 &&
                events(name, 'onCollisionStay').length > 10 &&
                events(name, 'onCollisionExit').length === 0,
        );
    }
    check(
        'Actual family item rests on peer',
        Math.abs(sphereNode.worldPosition.y - (family === 'box-box' ? 0.5 : 0.8)) < 0.08,
        point(sphereNode.worldPosition),
    );
    check('Once auto-off and callback off are effective', onceEnter === 1 && onceStay === 1 && removedStay === 1, {
        onceEnter,
        onceStay,
        removedStay,
    });
    body.setLinearVelocity(new Vec3(0, 5, 0));
    for (let i = 0; i < 90 && !events('falling-item', 'onCollisionExit').length; i++) await step();
    for (const name of ['falling-item', 'static-support'])
        check(name + ' exits after physical velocity separation', events(name, 'onCollisionExit').length === 1);
    const afterExitCount = report.events.length;
    for (let i = 0; i < 12; i++) await step();
    check('No fabricated stay after separation', report.events.length === afterExitCount);
    for (let i = 0; i < 150 && events('falling-item', 'onCollisionEnter').length < 2; i++) await step();
    for (let i = 0; i < 20; i++) await step();
    for (const name of ['falling-item', 'static-support'])
        check(name + ' physically recontacts', events(name, 'onCollisionEnter').length === 2);
    check(
        'Once subscriptions remain once across real recontact',
        onceEnter === 1 && onceStay === 1 && onceExit === 1 && removedStay === 1,
        { onceEnter, onceStay, onceExit, removedStay },
    );
    const keys = report.events.map((event) => `${event.tick}:${event.self}:${event.type}`);
    check('No duplicate public delivery within one game step', new Set(keys).size === keys.length);
    for (const event of report.events) {
        const opposite = report.events.find(
            (other) =>
                other.tick === event.tick &&
                other.type === event.type &&
                other.self === event.other &&
                other.other === event.self,
        );
        assert(opposite, 'Missing reciprocal real public event');
        assert.equal(opposite.contacts.length, event.contacts.length);
    }
    check('Copied contact values remain stable across later steps', JSON.stringify(report.events[0]) === retainedCopy);
    const saved = retainedEquations.slice(0, 8).map((e) => ({
        equation: e,
        values: getters.map((n) => {
            const v = new Vec3();
            e[n](v);
            return point(v);
        }),
    }));
    assert.equal(sphereNode.destroy(), true);
    for (let i = 0; i < 3; i++) await step();
    for (const row of saved)
        for (let k = 0; k < getters.length; k++) {
            const v = new Vec3();
            row.equation[getters[k]](v);
            assert.deepEqual(point(v), row.values[k]);
        }
    check('Actual retained contact equation getters survive public node destruction', saved.length > 0);
    report.family = family;
    report.onceCounts = { onceEnter, onceStay, onceExit, removedStay };
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
            check(
                'Public app.close releases without failures',
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
        assert.deepEqual(verifyInputs(artifacts), before);
        report.inputsUnchanged = true;
    } catch (error) {
        report.inputError = String(error.stack ?? error);
        if (!failure) failure = error;
    }
    hooks?.deregister();
    dom?.window.close();
    report.totalSteps = tick;
    report.status = failure ? 'FAIL' : 'PASS_LIMITED_PRODUCTION_ESM_COLLISION';
    report.completedAt = new Date().toISOString();
    if (failure) process.exitCode = 1;
    flush();
}
console.log(
    JSON.stringify({
        status: report.status,
        totalSteps: tick,
        events: report.events.length,
        error: report.error ?? report.closeError ?? null,
    }),
);
