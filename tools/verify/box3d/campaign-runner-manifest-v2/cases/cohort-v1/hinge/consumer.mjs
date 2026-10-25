/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Actual production exports only. No source/test adapter, native handle, independent physics loop or pose correction.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire, registerHooks } from 'node:module';
import { root, scope, sha, verifyInputs } from '../inputs.mjs';
import { thresholds as T, unrunGates } from './thresholds.mjs';
const [artifactArgument, lockArgument, outputArgument, mode] = process.argv.slice(2);
assert(
    artifactArgument &&
        lockArgument &&
        outputArgument &&
        ['healthy', 'intentional-fault', 'idle-enabled-reentry'].includes(mode),
);
const artifacts = resolve(artifactArgument),
    lockPath = resolve(lockArgument),
    out = resolve(outputArgument);
const raw = join(out, 'consumer.raw.json');
assert(!existsSync(raw), 'Never replace a raw attempt');
const before = verifyInputs(artifacts, lockPath),
    { lock } = before;
const require = createRequire(join(root, 'package.json'));
const { JSDOM, VirtualConsole } = require('jsdom');
const BASE = 'https://box3d-public-hinge.invalid/physics/box3d/st/';
const bundle = pathToFileURL(join(artifacts, 'cocosair.module.js')).href;
const nativeModule = pathToFileURL(join(artifacts, 'physics/box3d/st/box3d-st.mjs')).href;
const report = {
    schema: 'box3d-production-esm-public-hinge-consumer-v1',
    status: 'RUNNING',
    cohortIdentity: before.lock.cohortIdentity,
    cohortCaseFamily: 'hinge',
    mode,
    scope,
    thresholds: T,
    unrunGates,
    startedAt: new Date().toISOString(),
    hostBoundary:
        'Node registerHooks maps only the real production loader HTTPS native-module request to unchanged locked local bytes. JSDOM/null canvas uses real HEADLESS mode. Not ordinary browser transport or rendering evidence.',
    transport: [],
    moduleResolution: [],
    checks: [],
    observations: [],
    frames: [],
    drift: [],
    angleSamples: [],
    nativeTicks: [],
    hostErrors: [],
};
const flush = () => writeFileSync(raw, JSON.stringify(report, null, 2) + '\n');
const check = (name, condition, detail = null) => {
    report.checks.push({ name, pass: !!condition, detail });
    flush();
    assert(condition, name);
};
const observe = (name, value) => {
    report.observations.push({ tick, name, value });
    flush();
};
let sdk,
    app,
    clock,
    dom,
    hooks,
    postCloseJoint,
    postCloseBody,
    failure,
    intentionalFaultObserved = false,
    tick = 0;
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => report.hostErrors.push(String(error.stack ?? error)));
const point = (v) => [v.x, v.y, v.z];
const expectedTorqueSemantics = Object.freeze({
    quantity: 'angular-constraint-couple',
    coordinates: 'world',
    actsOn: 'B',
    source: 'current-solver-impulse-cache',
    timeBasis: 'latest-world-inverse-substep',
    freshness: 'not-tracked',
    usableForLoadOrBreak: false,
});
// One bounded observer shared by destroyed-component and post-close checks; no product cache access.
const hingeGetterObserver = (joint) => {
    const vectorFields = new Set(['axis', 'pivotA', 'pivotB']);
    const fields = [
        'axis',
        'pivotA',
        'pivotB',
        'motorVelocity',
        'motorForceLimit',
        'motorEnabled',
        'limitEnabled',
        'lowerLimit',
        'upperLimit',
        'enableCollision',
        'connectedBody',
        'enabled',
    ];
    const references = new WeakMap();
    let nextReference = 1;
    const referenceId = (value) => {
        if (!references.has(value)) references.set(value, nextReference++);
        return references.get(value);
    };
    const getterOutcome = (field) => {
        try {
            const value = joint[field];
            if (value === null) return { status: 'returned', type: 'null', value: null };
            if (typeof value === 'object' || typeof value === 'function')
                return vectorFields.has(field)
                    ? { status: 'returned', type: 'vector', reference: referenceId(value), value: point(value) }
                    : { status: 'returned', type: 'reference', reference: referenceId(value) };
            return { status: 'returned', type: typeof value, ...(value === undefined ? {} : { value }) };
        } catch (error) {
            return { status: 'threw', name: error?.name ?? typeof error, code: error?.code ?? null };
        }
    };
    const getterOutcomes = () => Object.fromEntries(fields.map((field) => [field, getterOutcome(field)]));
    return { vectorFields, fields, referenceId, getterOutcomes };
};
const rotation = (q) => [q.x, q.y, q.z, q.w];
const subtract = (a, b) => a.map((v, i) => v - b[i]);
const distance = (a, b) => Math.hypot(...subtract(a, b));
const conjugate = (q) => [-q[0], -q[1], -q[2], q[3]];
const multiply = (a, b) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const rotate = (q, p) => multiply(multiply(q, [...p, 0]), conjugate(q)).slice(0, 3);
const angle = (a, b) =>
    2 *
    Math.acos(
        Math.min(1, Math.abs(a.reduce((sum, v, i) => sum + v * b[i], 0)) / (Math.hypot(...a) * Math.hypot(...b))),
    );
const framePose = (frame) => ({ p: frame.slice(0, 3), q: frame.slice(3, 7) });
const composeFrame = (origin, frame) => ({
    p: rotate(origin.q, frame.p).map((v, i) => v + origin.p[i]),
    q: multiply(origin.q, frame.q),
});
flush();
try {
    dom = new JSDOM(
        '<!doctype html><html><body><div id="GameDiv"><div id="Cocos3dGameContainer"><canvas id="GameCanvas"></canvas></div></div></body></html>',
        { url: 'https://box3d-public-hinge.invalid/', pretendToBeVisual: true, virtualConsole },
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
    ])
        if (dom.window[key] !== undefined)
            Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
    for (const key of ['requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle'])
        globalThis[key] = dom.window[key].bind(dom.window);
    dom.window.HTMLCanvasElement.prototype.getContext = function () {
        return null;
    };
    dom.window.HTMLCanvasElement.prototype.toDataURL = function () {
        return '';
    };
    globalThis.fetch = async (input, init) => {
        const url = String(input),
            name = url.startsWith(BASE) ? url.slice(BASE.length) : null;
        assert(['manifest.json', 'box3d-st.wasm', 'box3d-st.mjs'].includes(name), 'Unexpected fetch: ' + url);
        assert.equal(init?.signal?.aborted, false);
        const path = 'physics/box3d/st/' + name,
            bytes = readFileSync(join(artifacts, path));
        const expected = lock.runtime.find((entry) => entry.path === path);
        assert.equal(sha(bytes), expected.sha256);
        assert.equal(bytes.length, expected.bytes);
        report.transport.push({ url, path, sha256: sha(bytes), bytes: bytes.length });
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
                assert.equal(
                    context.parentURL,
                    bundle,
                    'Only the unchanged real production loader requests this asset',
                );
                const expected = lock.runtime.find((entry) => entry.path === 'physics/box3d/st/box3d-st.mjs');
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
            assert(!/^https?:/.test(specifier), 'Unexpected network module: ' + specifier);
            return nextResolve(specifier, context);
        },
    });
    sdk = await import(bundle);
    check(
        'Production import acquires no native assets',
        report.transport.length === 0 && report.moduleResolution.length === 0,
    );
    check(
        'Exact fresh runtime build, not build 212',
        sdk.AIR_BUILD_NUMBER === lock.runtimeBuildNumber && sdk.AIR_BUILD_NUMBER > 212,
        sdk.AIR_BUILD_NUMBER,
    );
    const required = [
        'createAirApp',
        'createStepClock',
        'Node',
        'Scene',
        'RigidBody',
        'BoxCollider',
        'SphereCollider',
        'HingeConstraint',
        'PhysicsSystem',
        'Vec3',
        'readBox3DBodyMotion',
        'readBox3DConstraintState',
        'registerBox3DBeforeStep',
    ];
    check(
        'Required APIs are ordinary main-entry exports',
        required.every((name) => typeof sdk[name] === 'function'),
        required,
    );
    check('No test-only production exports', !Object.keys(sdk).some((name) => name.startsWith('__testOnly')));
    app = await sdk.createAirApp({
        canvas: '#GameCanvas',
        physics: 'box3d',
        renderMode: 3,
        physicsOptions: {
            box3d: { assetBaseUrl: BASE, threading: 'single', workerCount: 1, solverSubSteps: T.solverSubSteps },
        },
    });
    check(
        'Production loader uses exactly the locked matching ST assets',
        report.transport.map((entry) => entry.path).join(',') ===
            ['manifest.json', 'box3d-st.wasm', 'box3d-st.mjs'].map((name) => 'physics/box3d/st/' + name).join(',') &&
            report.moduleResolution.length === 1,
    );
    const { Node, Scene, RigidBody, BoxCollider, HingeConstraint, PhysicsSystem, Vec3 } = sdk;
    const system = PhysicsSystem.instance;
    system.enable = false;
    system.autoSimulation = true;
    system.fixedTimeStep = T.fixedDtSeconds;
    system.maxSubSteps = 1;
    system.gravity = new Vec3(0, -10, 0);
    const scene = new Scene('public-hinge-' + mode);
    app.run(scene);
    clock = sdk.createStepClock({ frameRate: 60, stepTimeoutMs: 2000 });
    clock.begin();
    const step = async (count = 1, dt = T.fixedDtSeconds) => {
        for (let i = 0; i < count; i++) {
            const frame = await clock.step(dt);
            tick++;
            assert.deepEqual(frame, { step: tick, dt, afterDraw: true });
            report.frames.push(frame);
        }
    };
    await step();
    // All body transforms are set before entering the running Scene. No pose correction is used.
    const box = (name, p, options = {}) => {
        const node = new Node(name);
        node.setPosition(...p);
        node.setRotationFromEuler(...(options.euler ?? [0, 0, 0]));
        node.setScale(...(options.scale ?? [1, 1, 1]));
        const body = node.addComponent(RigidBody);
        body.type = options.type ?? RigidBody.Type.DYNAMIC;
        body.mass = 1;
        body.allowSleep = false;
        body.linearDamping = 0;
        body.angularDamping = 0;
        body.useGravity = options.gravity ?? false;
        const collider = node.addComponent(BoxCollider);
        collider.size = new Vec3(0.5, 0.5, 0.5);
        scene.addChild(node);
        return { node, body, collider, initialScale: options.scale ?? [1, 1, 1] };
    };
    const copyDiagnostic = (value) => {
        assert(Object.isFrozen(value), 'Diagnostic must be a frozen copy');
        assert(Object.isFrozen(value.requested), 'Requested values must be copied/frozen');
        for (const key of ['axis', 'pivotA', 'pivotB'])
            assert(Object.isFrozen(value.requested[key]), 'Requested vector must be copied/frozen');
        const n = value.native;
        if (n) {
            assert(Object.isFrozen(n) && [n.frameA, n.frameB, n.force, n.torque].every(Object.isFrozen));
            assert(Object.isFrozen(n.torqueSemantics), 'Torque cache semantics must be frozen');
            assert.deepEqual(n.torqueSemantics, expectedTorqueSemantics, 'Do not imply fresh/load-safe cached torque');
            assert(
                [
                    ...n.frameA,
                    ...n.frameB,
                    ...n.force,
                    ...n.torque,
                    n.lowerAngleRadians,
                    n.upperAngleRadians,
                    n.motorSpeedRadians,
                    n.maxMotorTorque,
                    n.angleRadians,
                    n.motorTorque,
                    n.linearSeparation,
                    n.axisAlignmentRadians,
                    value.angleDegrees,
                    value.motorTorque,
                ].every(Number.isFinite),
                'Every native/public diagnostic number must be finite',
            );
        }
        // Project only copied observations; no endpoint/native IDs are retained or used as capabilities.
        return {
            backend: value.backend,
            kind: value.kind,
            state: value.state,
            requestedEnabled: value.requestedEnabled,
            pending: value.pending,
            axisConfigured: value.axisConfigured,
            requested: {
                axis: point(value.requested.axis),
                pivotA: point(value.requested.pivotA),
                pivotB: point(value.requested.pivotB),
                lowerLimit: value.requested.lowerLimit,
                upperLimit: value.requested.upperLimit,
                motorVelocity: value.requested.motorVelocity,
                motorForceLimit: value.requested.motorForceLimit,
            },
            angleDegrees: value.angleDegrees,
            motorTorque: value.motorTorque,
            native: n
                ? {
                      kind: n.kind,
                      collideConnected: n.collideConnected,
                      frameA: [...n.frameA],
                      frameB: [...n.frameB],
                      force: [...n.force],
                      torque: [...n.torque],
                      torqueSemantics: n.torqueSemantics,
                      limitEnabled: n.limitEnabled,
                      lowerAngleRadians: n.lowerAngleRadians,
                      upperAngleRadians: n.upperAngleRadians,
                      motorEnabled: n.motorEnabled,
                      motorSpeedRadians: n.motorSpeedRadians,
                      maxMotorTorque: n.maxMotorTorque,
                      angleRadians: n.angleRadians,
                      motorTorque: n.motorTorque,
                      linearSeparation: n.linearSeparation,
                      axisAlignmentRadians: n.axisAlignmentRadians,
                  }
                : null,
        };
    };
    const state = (joint) => copyDiagnostic(sdk.readBox3DConstraintState(joint));
    const motion = (body) => {
        const value = sdk.readBox3DBodyMotion(body);
        const result = {
            p: point(value.position),
            q: rotation(value.rotation),
            com: point(value.worldCOM),
            v: point(value.linearVelocity),
            w: point(value.angularVelocity),
            type: value.type,
            enabled: value.enabled,
        };
        assert([...result.p, ...result.q, ...result.com, ...result.v, ...result.w].every(Number.isFinite));
        return result;
    };
    // Read-only backend copied observations are separately labeled. They do not drive simulation.
    const copiedWorld = () => {
        const value = system.physicsWorld.diagnostics();
        assert(Object.isFrozen(value) && Object.isFrozen(value.native));
        return {
            state: value.state,
            generation: value.generation,
            native: { ...value.native },
            attemptedSteps: value.attemptedSteps,
            sceneSyncCalls: value.sceneSyncCalls,
            hasFailure: value.failure.hasFailure,
        };
    };
    const caches = (joint) => ({
        connectedBody: joint.connectedBody,
        enableCollision: joint.enableCollision,
        enabled: joint.enabled,
        axis: point(joint.axis),
        pivotA: point(joint.pivotA),
        pivotB: point(joint.pivotB),
        lowerLimit: joint.lowerLimit,
        upperLimit: joint.upperLimit,
        limitEnabled: joint.limitEnabled,
        motorEnabled: joint.motorEnabled,
        motorVelocity: joint.motorVelocity,
        motorForceLimit: joint.motorForceLimit,
    });
    const reject = (name, joint, action, code = 'AIR_E_BOX3D_CONFIG', readNative = true) => {
        const previous = caches(joint),
            prior = readNative ? state(joint) : null;
        let caught;
        try {
            action();
        } catch (error) {
            caught = error;
        }
        check(
            name + ' rejects before cache/native publication, never by recursion',
            caught &&
                !(caught instanceof RangeError) &&
                (typeof code === 'function' ? code(caught) : caught.code === code),
            caught ? { name: caught.name, code: caught.code, message: caught.message } : null,
        );
        assert.deepEqual(caches(joint), previous, name + ' changed public caches');
        if (readNative) assert.deepEqual(state(joint), prior, name + ' changed admitted/native state');
    };
    const sameFrames = (actual, expected) => {
        assert.deepEqual(actual.native.frameA, expected.native.frameA, 'Configuration must preserve frameA');
        assert.deepEqual(actual.native.frameB, expected.native.frameB, 'Configuration must preserve frameB');
    };
    const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
    const unit = (v) => v.map((value) => value / Math.hypot(...v));
    const wrap = (value) => Math.atan2(Math.sin(value), Math.cos(value));
    const vectorAngle = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b)))));
    const scaledPivot = (owner, local) => local.map((value, i) => value * owner.initialScale[i]);
    const worldPivot = (bodyMotion, local) => rotate(bodyMotion.q, local).map((value, i) => value + bodyMotion.p[i]);
    // Independent oracle: body-origin quaternions and caller geometry only, never native joint frames/angle.
    const capture = (a, b, pivotA, pivotB, axis) => {
        const ma = motion(a.body),
            mb = b ? motion(b.body) : { p: [0, 0, 0], q: [0, 0, 0, 1] };
        const localAxis = unit(axis),
            worldAxis = rotate(ma.q, localAxis);
        return {
            a,
            b,
            ma,
            mb,
            pivotA: scaledPivot(a, pivotA),
            pivotB: b ? scaledPivot(b, pivotB) : worldPivot(ma, scaledPivot(a, pivotA)),
            axisA: localAxis,
            axisB: rotate(conjugate(mb.q), worldAxis),
            relativeZero: multiply(conjugate(mb.q), ma.q),
        };
    };
    const independent = (reference) => {
        const a = motion(reference.a.body);
        const b = reference.b ? motion(reference.b.body) : { p: [0, 0, 0], q: [0, 0, 0, 1], w: [0, 0, 0] };
        const relative = multiply(conjugate(b.q), a.q);
        const delta = multiply(conjugate(reference.relativeZero), relative);
        const publicRadians = wrap(2 * Math.atan2(dot(delta.slice(0, 3), reference.axisA), delta[3]));
        return {
            a,
            b,
            publicRadians,
            separation: distance(worldPivot(a, reference.pivotA), worldPivot(b, reference.pivotB)),
            alignment: vectorAngle(rotate(a.q, reference.axisA), rotate(b.q, reference.axisB)),
            publicSpeed: dot(subtract(a.w, b.w), rotate(a.q, reference.axisA)),
        };
    };
    const captureCheck = (name, joint, reference) => {
        const value = state(joint),
            a = reference.ma,
            b = reference.mb;
        const fa = composeFrame(a, framePose(value.native.frameA));
        const fb = composeFrame(b, framePose(value.native.frameB));
        check(
            name,
            value.state === 'connected' &&
                value.native.kind === 'hinge' &&
                distance(fa.p, worldPivot(a, reference.pivotA)) <= T.captureMetres &&
                distance(fb.p, worldPivot(b, reference.pivotB)) <= T.captureMetres &&
                vectorAngle(rotate(fa.q, [0, 0, 1]), rotate(a.q, reference.axisA)) <= T.captureRadians &&
                angle(fa.q, fb.q) <= T.captureRadians &&
                Math.abs(value.native.angleRadians) <= T.captureRadians,
            { state: value, originA: a, originB: b, frameWorldA: fa, frameWorldB: fb },
        );
    };
    const sample = (name, joint, reference, retain = true) => {
        const value = state(joint),
            truth = independent(reference);
        const result = {
            tick,
            name,
            state: value,
            bodyA: truth.a,
            bodyB: truth.b,
            publicRadians: truth.publicRadians,
            publicSpeed: truth.publicSpeed,
            independentSeparation: truth.separation,
            independentAlignment: truth.alignment,
            angleDisagreement: Math.abs(wrap(truth.publicRadians + value.native.angleRadians)),
            reference: {
                originA: reference.ma,
                originB: reference.mb,
                pivotA: reference.pivotA,
                pivotB: reference.pivotB,
                axisA: reference.axisA,
                axisB: reference.axisB,
                relativeZero: reference.relativeZero,
            },
        };
        const sampleFails =
            !(result.angleDisagreement <= T.independentAngleAgreementRadians) ||
            !(Math.abs((value.angleDegrees * Math.PI) / 180 + value.native.angleRadians) <= T.nativeScalarTolerance) ||
            !(Math.abs(value.motorTorque + value.native.motorTorque) <= T.nativeScalarTolerance);
        if (retain || sampleFails) report.angleSamples.push(result);
        if (sampleFails) {
            report.failedAngleSample = result;
            flush(); // Preserve the complete offending sample before any assertion, including endurance retain=false.
        }
        assert(result.angleDisagreement <= T.independentAngleAgreementRadians, name + ' body/native sign mismatch');
        assert(Math.abs((value.angleDegrees * Math.PI) / 180 + value.native.angleRadians) <= T.nativeScalarTolerance);
        assert(Math.abs(value.motorTorque + value.native.motorTorque) <= T.nativeScalarTolerance);
        return result;
    };
    const hinge = (owner, connected = null, config = {}) => {
        const joint = owner.node.addComponent(HingeConstraint);
        joint.enabled = false; // Owner must already exist on an active Node: do not use inactive/pre-onLoad setters.
        joint.connectedBody = connected?.body ?? null;
        joint.axis = new Vec3(...(config.axis ?? [0, 0, 1]));
        joint.pivotA = new Vec3(...(config.pivotA ?? [0, 0, 0]));
        joint.pivotB = new Vec3(...(config.pivotB ?? [0, 0, 0]));
        joint.enableCollision = false;
        joint.motorEnabled = false;
        joint.enabled = true;
        return joint;
    };
    // Hook registration requires an unpaused owner. The world is still empty, and
    // no clock.step occurs until the pending-zero direct-sync rejection/recovery is complete.
    system.enable = true;
    const beforeStep = sdk.registerBox3DBeforeStep((context) => {
        report.nativeTicks.push({ frame: tick + 1, ...context });
    });
    const recovered = box('pending-zero-recovered-anchor', [-20, 4, 0]);
    const pending = recovered.node.addComponent(HingeConstraint);
    postCloseJoint = pending;
    postCloseBody = recovered.body;
    const pendingState = state(pending),
        pendingWorld = copiedWorld(),
        pendingMotion = motion(recovered.body);
    check(
        'Default zero axis is an enabled pending owner, not a secretly repaired +Z joint',
        pendingState.state === 'pending' &&
            pendingState.axisConfigured === false &&
            pendingState.native === null &&
            pending.enabled &&
            point(pending.axis).every((value) => value === 0),
        pendingState,
    );
    let pendingError;
    try {
        system.syncSceneToPhysics();
    } catch (error) {
        pendingError = error;
    }
    const rejectedWorld = copiedWorld();
    check(
        'Direct first sync rejects pending zero before native step or world fault',
        pendingError?.code === 'AIR_E_BOX3D_CONFIG' &&
            rejectedWorld.state === 'ready' &&
            !rejectedWorld.hasFailure &&
            rejectedWorld.native.nativeStepIndex === pendingWorld.native.nativeStepIndex &&
            rejectedWorld.attemptedSteps === pendingWorld.attemptedSteps &&
            report.nativeTicks.length === 0,
        { error: pendingError?.message, before: pendingWorld, after: rejectedWorld },
    );
    assert.deepEqual(state(pending), pendingState);
    assert.deepEqual(motion(recovered.body), pendingMotion);
    reject('Explicit zero-axis assignment', pending, () => {
        pending.axis = new Vec3(0, 0, 0);
    });
    pending.enabled = false;
    reject('Effective enable before a valid axis', pending, () => {
        pending.enabled = true;
    });
    const axisReads = { x: 0, y: 0, z: 0 };
    const countedAxis = Object.defineProperties(
        {},
        Object.fromEntries(
            ['x', 'y', 'z'].map((key) => [
                key,
                {
                    get() {
                        axisReads[key]++;
                        return key === 'z' ? 7 : 0;
                    },
                    enumerable: true,
                },
            ]),
        ),
    );
    pending.axis = countedAxis;
    assert.deepEqual(axisReads, { x: 1, y: 1, z: 1 }, 'Axis caller components are read once');
    pending.enabled = true;
    const recoveredReference = capture(recovered, null, [0, 0, 0], [0, 0, 0], [0, 0, 7]);
    system.syncSceneToPhysics();
    captureCheck(
        'Valid nonunit axis recovers in the same world with normalized native frame',
        pending,
        recoveredReference,
    );
    check(
        'Public axis cache and requested copy retain original nonunit values',
        pending.axis.z === 7 && state(pending).requested.axis[2] === 7,
        { reads: axisReads, state: state(pending) },
    );
    check(
        'Recovery sync is ready and still does not step native simulation',
        copiedWorld().state === 'ready' &&
            copiedWorld().generation === pendingWorld.generation &&
            copiedWorld().native.nativeStepIndex === pendingWorld.native.nativeStepIndex &&
            report.nativeTicks.length === 0,
    );
    await step();
    check(
        'The unchanged owned Game clock and same world proceed after direct-sync recovery',
        copiedWorld().state === 'ready' &&
            copiedWorld().native.nativeStepIndex === pendingWorld.native.nativeStepIndex + 1 &&
            report.nativeTicks.length === 1 &&
            report.frames.at(-1).afterDraw,
    );
    if (mode === 'idle-enabled-reentry') {
        let armed = false,
            calls = 0,
            innerError,
            outerError;
        class ReenteringHinge extends HingeConstraint {
            onDisable() {
                super.onDisable();
                if (!armed) return;
                armed = false;
                calls++;
                try {
                    this.enabled = true;
                } catch (error) {
                    innerError = error;
                }
            }
        }
        const target = box('idle-reentry-public-subclass', [-12, 4, 0]);
        const joint = target.node.addComponent(ReenteringHinge);
        joint.enabled = false;
        joint.axis = new Vec3(0, 0, 1);
        joint.enabled = true;
        await step();
        check('Public Hinge subclass commits a real native revolute', state(joint).native?.kind === 'hinge');
        armed = true;
        try {
            joint.enabled = false;
        } catch (error) {
            outerError = error;
        }
        check(
            'Caught recursive enabled setter poisons the exact original idle activity operation',
            calls === 1 &&
                outerError === innerError &&
                outerError instanceof Error &&
                !(outerError instanceof RangeError) &&
                outerError.message === 'Component activity control cannot re-enter an active operation.' &&
                joint.enabled === false,
            { calls, message: outerError?.message, enabledAfterPartialPublication: joint.enabled },
        );
        intentionalFaultObserved = true;
        reject(
            'Partially published activity failure faults instead of fictional rollback',
            pending,
            () => {
                pending.motorVelocity = 99;
            },
            'AIR_E_BOX3D_WORLD_FAULTED',
            false,
        );
    } else if (mode === 'intentional-fault') {
        const floorNode = new Node('intentional-hinge-fault-floor');
        floorNode.setPosition(0, -0.5, 0);
        floorNode.addComponent(RigidBody).type = RigidBody.Type.STATIC;
        floorNode.addComponent(BoxCollider).size = new Vec3(8, 1, 8);
        scene.addChild(floorNode);
        const ballNode = new Node('intentional-hinge-fault-sphere');
        ballNode.setPosition(0, 2, 0);
        const ballBody = ballNode.addComponent(RigidBody);
        ballBody.type = RigidBody.Type.DYNAMIC;
        ballBody.mass = 1;
        ballBody.allowSleep = false;
        const ball = ballNode.addComponent(sdk.SphereCollider);
        ball.radius = 0.5;
        scene.addChild(ballNode);
        const marker = new Error('intentional-public-hinge-collision-callback-fault');
        let calls = 0,
            caught;
        ball.once('onCollisionEnter', () => {
            calls++;
            pending.motorVelocity = 32;
            throw marker;
        });
        try {
            for (let i = 0; i < 90 && calls === 0; i++) await step();
        } catch (error) {
            caught = error;
        }
        check('Actual collision callback preserves exact thrown Error identity', caught === marker && calls === 1, {
            calls,
            message: caught?.message,
            code: caught?.code ?? null,
        });
        check('Callback staged Hinge request before its deliberate throw', pending.motorVelocity === 32);
        intentionalFaultObserved = true;
        reject(
            'Faulted world rejects Hinge request before cache write',
            pending,
            () => {
                pending.motorVelocity = 99;
            },
            'AIR_E_BOX3D_WORLD_FAULTED',
            false,
        );
    } else {
        const a = box('two-dynamic-a', [0, 6, 0]);
        const b = box('two-dynamic-b', [1, 6, 0]);
        const unused = box('unused-intermediate-target', [8, 6, 0]);
        const pair = a.node.addComponent(HingeConstraint);
        const assembly = [state(pair)];
        pair.enabled = false;
        assembly.push(state(pair));
        pair.connectedBody = unused.body;
        assembly.push(state(pair));
        pair.connectedBody = b.body;
        pair.axis = new Vec3(0, 0, 4);
        pair.pivotA = new Vec3(0.5, 0, 0);
        pair.pivotB = new Vec3(-0.5, 0, 0);
        pair.enableCollision = false;
        assembly.push(state(pair));
        pair.enabled = true;
        assembly.push(state(pair));
        check(
            'Supported active-add/disable/configure/enable has no intermediate native joint',
            assembly.every((entry) => entry.native === null) && pair.connectedBody === b.body,
            assembly,
        );
        const pairReference = capture(a, b, [0.5, 0, 0], [-0.5, 0, 0], [0, 0, 4]);
        const beforePairA = motion(a.body),
            beforePairB = motion(b.body);
        system.syncSceneToPhysics();
        captureCheck('First safe commit uses only final B and supplied body-origin pivots', pair, pairReference);
        assert.deepEqual(motion(a.body), beforePairA, 'Joint create must not rewrite pose A');
        assert.deepEqual(motion(b.body), beforePairB, 'Joint create must not rewrite pose B');
        const sdkSnapshot = sdk.readBox3DConstraintState(pair),
            firstPair = state(pair);
        const pairCaptureFrames = Object.freeze({
            frameA: Object.freeze([...firstPair.native.frameA]),
            frameB: Object.freeze([...firstPair.native.frameB]),
        });
        const snapshotProjection = copyDiagnostic(sdkSnapshot);
        // Disabled limits may stage finite extremes. The native state is always inert finite zeros.
        check(
            'Default disabled +/-MAX limits are admitted without entering native active limits',
            pair.lowerLimit === -Number.MAX_VALUE &&
                pair.upperLimit === Number.MAX_VALUE &&
                !pair.limitEnabled &&
                firstPair.native.lowerAngleRadians === 0 &&
                firstPair.native.upperAngleRadians === 0 &&
                !firstPair.native.limitEnabled,
            firstPair,
        );
        pair.lowerLimit = -Number.MAX_VALUE;
        pair.upperLimit = Number.MAX_VALUE;
        system.syncSceneToPhysics();
        reject('Enable staged out-of-domain limits atomically', pair, () => {
            pair.limitEnabled = true;
        });
        pair.lowerLimit = 25;
        pair.upperLimit = -25;
        system.syncSceneToPhysics();
        reject('Enable staged unordered limits atomically', pair, () => {
            pair.limitEnabled = true;
        });
        pair.lowerLimit = 0;
        pair.upperLimit = 75;
        pair.limitEnabled = true;
        const stagedConfig = state(pair);
        check(
            'Public requested limits change before native commit',
            stagedConfig.pending &&
                stagedConfig.requested.lowerLimit === 0 &&
                stagedConfig.requested.upperLimit === 75 &&
                stagedConfig.native.limitEnabled === false,
            stagedConfig,
        );
        system.syncSceneToPhysics();
        const activeConfig = state(pair);
        check(
            'Asymmetric public [0,75] maps to native [-75,0] without sorting the public cache',
            activeConfig.native.limitEnabled &&
                activeConfig.native.lowerAngleRadians === Math.fround((-75 * Math.PI) / 180) &&
                activeConfig.native.upperAngleRadians === 0 &&
                pair.lowerLimit === 0 &&
                pair.upperLimit === 75,
            activeConfig,
        );
        sameFrames(activeConfig, firstPair);
        const bad = [
            ['active lower above upper', 'lowerLimit', 76],
            ['active upper below lower', 'upperLimit', -1],
            ['active lower out of domain', 'lowerLimit', -178.2001],
            ['active upper out of domain', 'upperLimit', 178.2001],
            ['active MAX lower', 'lowerLimit', -Number.MAX_VALUE],
            ['active MAX upper', 'upperLimit', Number.MAX_VALUE],
            ['negative torque cap', 'motorForceLimit', -1],
            ['overflow torque cap', 'motorForceLimit', Number.MAX_VALUE],
            ['overflow motor speed', 'motorVelocity', Number.MAX_VALUE],
            ['nonboolean limit enable', 'limitEnabled', 1],
            ['nonboolean motor enable', 'motorEnabled', 1],
            ['nonboolean collision enable', 'enableCollision', 1],
        ];
        for (const field of ['lowerLimit', 'upperLimit', 'motorVelocity', 'motorForceLimit'])
            for (const value of [NaN, Infinity, -Infinity]) bad.push([field + ' ' + String(value), field, value]);
        for (const [name, field, value] of bad)
            reject(name, pair, () => {
                pair[field] = value;
            });
        for (const field of ['axis', 'pivotA', 'pivotB']) {
            reject(field + ' NaN', pair, () => {
                pair[field] = { x: NaN, y: 1, z: 1 };
            });
            reject(field + ' float32 overflow', pair, () => {
                pair[field] = { x: Number.MAX_VALUE, y: 1, z: 1 };
            });
            const marker = new Error(field + ' getter marker');
            reject(
                field + ' throwing getter exact error',
                pair,
                () => {
                    pair[field] = Object.defineProperty({ y: 0, z: 1 }, 'x', {
                        get() {
                            throw marker;
                        },
                    });
                },
                (error) => error === marker,
            );
        }
        reject('active explicit zero axis', pair, () => {
            pair.axis = new Vec3(0, 0, 0);
        });
        reject('self connected body', pair, () => {
            pair.connectedBody = a.body;
        });
        reject('non-RigidBody endpoint', pair, () => {
            pair.connectedBody = {};
        });
        pair.limitEnabled = false;
        pair.lowerLimit = -Number.MAX_VALUE;
        pair.upperLimit = Number.MAX_VALUE;
        pair.motorEnabled = true;
        pair.motorVelocity = 90;
        pair.motorForceLimit = 3.25;
        pair.enableCollision = true;
        system.syncSceneToPhysics();
        const updatedConfig = state(pair);
        sameFrames(updatedConfig, firstPair);
        check(
            'Configuration-only flags, radians/second and N.m preserve captured frames',
            updatedConfig.native.collideConnected &&
                updatedConfig.native.motorEnabled &&
                updatedConfig.native.motorSpeedRadians === Math.fround(-Math.PI / 2) &&
                updatedConfig.native.maxMotorTorque === 3.25 &&
                !updatedConfig.native.limitEnabled &&
                updatedConfig.native.lowerAngleRadians === 0 &&
                updatedConfig.native.upperAngleRadians === 0,
            updatedConfig,
        );
        pair.motorEnabled = false;
        pair.enableCollision = false;
        system.syncSceneToPhysics();
        sameFrames(state(pair), firstPair);
        assert.deepEqual(
            copyDiagnostic(sdkSnapshot),
            snapshotProjection,
            'Retained SDK snapshot must not follow later writes',
        );
        // Positive initial nonuniform scales are supported. Live scale is rejected, never adopted as native geometry.
        const scaled = box('initial-scaled-anchor', [-10, 5, 0], { scale: [2, 3, 4], euler: [11, 23, 31] });
        const scaledJoint = hinge(scaled, null, {
            axis: [2, 3, 4],
            pivotA: [0.2, -0.1, 0.15],
            pivotB: [900, 800, 700],
        });
        let scaledReference = capture(scaled, null, [0.2, -0.1, 0.15], [900, 800, 700], [2, 3, 4]);
        system.syncSceneToPhysics();
        captureCheck(
            'Initial nonuniform scale scales pivot but not axis; null B ignores stored pivotB',
            scaledJoint,
            scaledReference,
        );
        const scaledBefore = state(scaledJoint);
        // Idle Node setters can change local caches, but existing scene preflight must reject
        // actual scale edits. Restore exactly; this is rejection/recovery, not runtime scale support.
        const admittedLocalScale = point(scaled.node.scale);
        for (const [label, candidateScale] of [
            ['positive changed scale', [3, 3, 4]],
            ['zero scale', [0, 3, 4]],
            ['negative scale', [-2, 3, 4]],
        ]) {
            const beforeScaleWorld = copiedWorld(),
                beforeScaleJoint = state(scaledJoint);
            const beforeScaleMotion = motion(scaled.body);
            let scaleError, cachedScale, rejectedScaleWorld, rejectedScaleJoint;
            try {
                scaled.node.setScale(...candidateScale);
                cachedScale = point(scaled.node.scale);
                try {
                    system.syncSceneToPhysics();
                } catch (error) {
                    scaleError = error;
                }
                rejectedScaleWorld = copiedWorld();
                rejectedScaleJoint = state(scaledJoint);
            } finally {
                scaled.node.setScale(...admittedLocalScale);
            }
            observe('live-scale-direct-sync-rejection-' + label, {
                candidateScale,
                cachedScale,
                error: scaleError
                    ? { name: scaleError.name, code: scaleError.code, message: scaleError.message }
                    : null,
                beforeWorld: beforeScaleWorld,
                rejectedWorld: rejectedScaleWorld,
                beforeJoint: beforeScaleJoint,
                rejectedJoint: rejectedScaleJoint,
            });
            check(
                label + ' direct sync rejects through existing geometry preflight',
                scaleError?.code === 'AIR_E_BOX3D_CONFIG' && scaleError.message.includes('owned writeback'),
            );
            assert.deepEqual(cachedScale, candidateScale, 'Idle setter must actually stage the changed local scale');
            assert.deepEqual(
                rejectedScaleWorld,
                beforeScaleWorld,
                'Rejected scale sync changed world/tick observations',
            );
            assert.deepEqual(
                rejectedScaleJoint,
                beforeScaleJoint,
                'Rejected scale sync changed native joint frames/state',
            );
            // Body motion reads also preflight. Compare after local restoration, before any recovery sync/native step.
            assert.deepEqual(motion(scaled.body), beforeScaleMotion, 'Rejected scale sync changed native body motion');
            system.syncSceneToPhysics();
            const restoredWorld = copiedWorld();
            assert.deepEqual(state(scaledJoint), beforeScaleJoint, 'Scale restoration must preserve original capture');
            check(
                label + ' restores ready ownership without a clock tick or native scale adoption',
                restoredWorld.state === 'ready' &&
                    !restoredWorld.hasFailure &&
                    restoredWorld.generation === beforeScaleWorld.generation &&
                    restoredWorld.native.nativeStepIndex === beforeScaleWorld.native.nativeStepIndex &&
                    restoredWorld.attemptedSteps === beforeScaleWorld.attemptedSteps,
                { originalScale: admittedLocalScale, restoredScale: point(scaled.node.scale), world: restoredWorld },
            );
        }
        // Vector cache objects are stable mutable aliases. Alias writes stage only until an explicit setter.
        const alias = scaledJoint.axis,
            requestedAxis = state(scaledJoint).requested.axis;
        alias.x = 4;
        assert.equal(scaledJoint.axis, alias);
        assert.deepEqual(state(scaledJoint).requested.axis, requestedAxis);
        scaledJoint.motorVelocity = 15;
        system.syncSceneToPhysics();
        sameFrames(state(scaledJoint), scaledBefore);
        assert.deepEqual(
            state(scaledJoint).requested.axis,
            requestedAxis,
            'Scalar setter cannot submit staged alias bytes',
        );
        scaledJoint.axis = alias;
        scaledReference = capture(scaled, null, [0.2, -0.1, 0.15], [900, 800, 700], [4, 3, 4]);
        system.syncSceneToPhysics();
        captureCheck(
            'Explicit alias resubmission applies new axis at safe commit with a fresh zero',
            scaledJoint,
            scaledReference,
        );
        assert.equal(scaledJoint.axis, alias, 'Setter preserves Cocos Vec3 getter alias identity');
        assert.notDeepEqual(state(scaledJoint).native.frameA, scaledBefore.native.frameA);
        const pivotReads = {};
        for (const [field, values] of [
            ['pivotA', [0.1, 0.2, 0.3]],
            ['pivotB', [500, 600, 700]],
        ]) {
            const reads = { x: 0, y: 0, z: 0 };
            scaledJoint[field] = Object.defineProperties(
                {},
                Object.fromEntries(
                    ['x', 'y', 'z'].map((key, i) => [
                        key,
                        {
                            get() {
                                reads[key]++;
                                return values[i];
                            },
                            enumerable: true,
                        },
                    ]),
                ),
            );
            assert.deepEqual(reads, { x: 1, y: 1, z: 1 });
            pivotReads[field] = reads;
        }
        scaledReference = capture(scaled, null, [0.1, 0.2, 0.3], [500, 600, 700], [4, 3, 4]);
        system.syncSceneToPhysics();
        captureCheck(
            'Explicit pivot updates recapture without native stepping or pose rewrites',
            scaledJoint,
            scaledReference,
        );
        observe('vector-getter-read-once-counts', { axis: axisReads, ...pivotReads });
        const committedGeometry = state(scaledJoint);
        system.syncSceneToPhysics();
        assert.deepEqual(state(scaledJoint), committedGeometry, 'Repeated unchanged sync cannot recapture again');
        // Load both real revolutes for 600 owned-clock ticks. Independent positions/axes are sampled every tick.
        const anchored = box('gravity-loaded-anchor', [-5, 8, 0], { gravity: true });
        const anchor = hinge(anchored, null, { pivotA: [0.4, 0, 0] });
        const anchorReference = capture(anchored, null, [0.4, 0, 0], [0, 0, 0], [0, 0, 1]);
        system.syncSceneToPhysics();
        captureCheck('Gravity-loaded anchor begins at its supplied off-centre pivot', anchor, anchorReference);
        const firstAnchor = state(anchor);
        const anchorCaptureFrames = Object.freeze({
            frameA: Object.freeze([...firstAnchor.native.frameA]),
            frameB: Object.freeze([...firstAnchor.native.frameB]),
        });
        a.body.applyImpulse(new Vec3(0.4, 0.2, 0));
        b.body.applyImpulse(new Vec3(0.4, 0.2, 0));
        a.body.applyTorque(new Vec3(0, 0, 0.25));
        let maxAnchorTwist = 0,
            maxPairTwist = 0;
        const maxima = { independentSeparation: 0, independentAlignment: 0, nativeSeparation: 0, nativeAlignment: 0 };
        for (let i = 0; i < T.enduranceTicks; i++) {
            await step();
            for (const [name, joint, reference] of [
                ['anchor', anchor, anchorReference],
                ['two-dynamic', pair, pairReference],
            ]) {
                const expectedFrames = name === 'anchor' ? anchorCaptureFrames : pairCaptureFrames;
                const currentFrames = state(joint).native;
                const framesUnchanged = ['frameA', 'frameB'].every((field) =>
                    currentFrames[field].every((value, index) => Object.is(value, expectedFrames[field][index])),
                );
                if (!framesUnchanged) {
                    report.framePersistenceFailure = {
                        enduranceTick: i + 1,
                        tick,
                        name,
                        expected: expectedFrames,
                        actual: { frameA: currentFrames.frameA, frameB: currentFrames.frameB },
                    };
                    flush();
                }
                assert.deepEqual(
                    currentFrames.frameA,
                    expectedFrames.frameA,
                    name + ' recaptured frameA during ordinary motion',
                );
                assert.deepEqual(
                    currentFrames.frameB,
                    expectedFrames.frameB,
                    name + ' recaptured frameB during ordinary motion',
                );
                const value = sample(name, joint, reference, false);
                const entry = {
                    enduranceTick: i + 1,
                    tick,
                    name,
                    bodyA: value.bodyA,
                    bodyB: value.bodyB,
                    independentSeparation: value.independentSeparation,
                    independentAlignment: value.independentAlignment,
                    nativeSeparation: value.state.native.linearSeparation,
                    nativeAlignment: value.state.native.axisAlignmentRadians,
                    publicRadians: value.publicRadians,
                    nativeRadians: value.state.native.angleRadians,
                };
                report.drift.push(entry);
                for (const key of Object.keys(maxima)) maxima[key] = Math.max(maxima[key], entry[key]);
                assert(
                    entry.independentSeparation <= T.separationMetres && entry.nativeSeparation <= T.separationMetres,
                    name + ' exceeded frozen 0.02m anchor error',
                );
                assert(
                    entry.independentAlignment <= T.axisAlignmentRadians &&
                        entry.nativeAlignment <= T.axisAlignmentRadians,
                    name + ' exceeded frozen 0.02rad axis error',
                );
                if (name === 'anchor') maxAnchorTwist = Math.max(maxAnchorTwist, Math.abs(entry.publicRadians));
                else maxPairTwist = Math.max(maxPairTwist, Math.abs(entry.publicRadians));
            }
            if ((i + 1) % 30 === 0) flush();
        }
        check(
            '600-tick anchored and two-dynamic errors stay within frozen independent/native bounds',
            report.drift.length === T.enduranceTicks * 2,
            maxima,
        );
        check(
            'Revolutes retain a real free rotational degree of freedom, not an accidental weld',
            maxAnchorTwist >= T.freeTwistMinimumRadians && maxPairTwist >= T.freeTwistMinimumRadians,
            { maxAnchorTwist, maxPairTwist },
        );
        check(
            'Two-dynamic pair translates under real public impulses',
            distance(motion(a.body).p, beforePairA.p) >= T.translationMinimumMetres &&
                distance(motion(b.body).p, beforePairB.p) >= T.translationMinimumMetres,
            { beforeA: beforePairA, beforeB: beforePairB, afterA: motion(a.body), afterB: motion(b.body) },
        );
        const driven = box('independent-motor-sign', [20, 6, 0]);
        const motor = hinge(driven);
        const motorReference = capture(driven, null, [0, 0, 0], [0, 0, 0], [0, 0, 1]);
        system.syncSceneToPhysics();
        const motorFrames = state(motor);
        motor.motorVelocity = 90;
        motor.motorForceLimit = 10;
        motor.motorEnabled = true;
        system.syncSceneToPhysics();
        check(
            'Public +90 degrees/second requests native -pi/2 radians/second, without dt scaling',
            state(motor).native.motorSpeedRadians === Math.fround(-Math.PI / 2),
            state(motor),
        );
        sameFrames(state(motor), motorFrames);
        for (let i = 0; i < T.positiveMotorTicks; i++) {
            await step();
            sample('positive-public-motor', motor, motorReference);
        }
        const forward = sample('positive-public-motor-terminal', motor, motorReference);
        const expectedForwardAngle = ((90 * Math.PI) / 180) * T.positiveMotorTicks * T.fixedDtSeconds;
        check(
            'Independent A-relative-world quaternion advances positively at requested degrees/second',
            forward.publicRadians > 0 &&
                forward.state.native.angleRadians < 0 &&
                Math.abs(forward.publicRadians - expectedForwardAngle) <= T.motorAngleErrorRadians &&
                Math.abs(forward.publicSpeed - Math.PI / 2) <= T.motorSpeedErrorRadiansPerSecond,
            { expectedForwardAngle, observation: forward },
        );
        motor.lowerLimit = 0;
        motor.upperLimit = 75;
        motor.limitEnabled = true;
        system.syncSceneToPhysics();
        sameFrames(state(motor), motorFrames);
        const publicUpper = (75 * Math.PI) / 180;
        const travelWithBounds = async (name) => {
            let last;
            for (let i = 0; i < T.limitTravelTicks; i++) {
                await step();
                last = sample(name, motor, motorReference);
                assert(
                    last.publicRadians >= -T.limitOvershootRadians &&
                        last.publicRadians <= publicUpper + T.limitOvershootRadians,
                    name + ' exceeded independent public [0,75] bound plus frozen overshoot',
                );
                assert(
                    last.state.native.angleRadians >= -publicUpper - T.limitOvershootRadians &&
                        last.state.native.angleRadians <= T.limitOvershootRadians,
                    name + ' exceeded native reflected [-75,0] bound plus frozen overshoot',
                );
            }
            return last;
        };
        const atUpper = await travelWithBounds('asymmetric-positive-limit');
        check(
            'Positive public motor physically reaches +75 rather than the reflected negative side',
            Math.abs(atUpper.publicRadians - publicUpper) <= T.limitArrivalRadians && atUpper.publicRadians > 1,
            atUpper,
        );
        motor.motorVelocity = -90;
        system.syncSceneToPhysics();
        sameFrames(state(motor), motorFrames);
        check(
            'Public -90 requests native +pi/2 with the same asymmetric bounds',
            state(motor).native.motorSpeedRadians === Math.fround(Math.PI / 2) &&
                state(motor).native.lowerAngleRadians === Math.fround(-publicUpper) &&
                state(motor).native.upperAngleRadians === 0,
            state(motor),
        );
        const atZero = await travelWithBounds('asymmetric-reverse-to-zero');
        check(
            'Independent body angle reverses from +75 to 0 while preserving its original captured zero',
            Math.abs(atZero.publicRadians) <= T.limitArrivalRadians && atUpper.publicRadians - atZero.publicRadians > 1,
            { upper: atUpper, zero: atZero },
        );
        sameFrames(state(motor), motorFrames);
        motor.motorEnabled = false;
        motor.limitEnabled = false;
        system.syncSceneToPhysics();
        // Torque units and zero-drive behavior are checked on another ordinary body, not reset velocities.
        const coasting = box('torque-units-and-coast', [25, 6, 0]);
        const coast = hinge(coasting);
        const coastReference = capture(coasting, null, [0, 0, 0], [0, 0, 0], [0, 0, 1]);
        coast.motorVelocity = 90;
        coast.motorForceLimit = T.torqueCapNm;
        coast.motorEnabled = true;
        system.syncSceneToPhysics();
        const coastFrames = state(coast);
        const torqueMass = sdk.readBox3DBodyMotion(coasting.body),
            torqueSize = point(coasting.collider.size);
        assert.equal(torqueMass.mass, 1);
        assert.equal(torqueMass.massPending, false);
        assert.deepEqual(point(torqueMass.localCenter), [0, 0, 0]);
        assert.deepEqual(torqueSize, [0.5, 0.5, 0.5]);
        assert.deepEqual(point(coasting.node.scale), [1, 1, 1]);
        assert.equal(coasting.body.useGravity, false);
        assert.equal(coasting.body.angularDamping, 0);
        // Uniform COM-centred cube: isotropic I=m*(side^2+side^2)/12 = 1/24 kg.m^2.
        const torqueInertia = (torqueMass.mass * (torqueSize[0] ** 2 + torqueSize[1] ** 2)) / 12;
        assert.equal(torqueInertia, 1 / 24);
        let previousTorqueMotion = motion(coasting.body),
            maxDrivenTorque = 0;
        for (let i = 0; i < 5; i++) {
            await step();
            const value = sample('finite-torque-cap-Nm', coast, coastReference);
            const actualFrame = report.frames.at(-1),
                actualNativeTick = report.nativeTicks.at(-1);
            const torqueAxis = unit(rotate(value.bodyA.q, coastReference.axisA));
            const torqueFromAcceleration =
                (torqueInertia * dot(subtract(value.bodyA.w, previousTorqueMotion.w), torqueAxis)) /
                actualNativeTick.fixedDt;
            const reportedOnBTorque = dot(value.state.native.torque, torqueAxis);
            const torqueObservation = {
                tick,
                driveTick: i + 1,
                massKg: torqueMass.mass,
                sizeMetres: torqueSize,
                inertiaKgMetresSquared: torqueInertia,
                frame: actualFrame,
                nativeTick: actualNativeTick,
                beforeAngularVelocity: previousTorqueMotion.w,
                afterAngularVelocity: value.bodyA.w,
                worldAxis: torqueAxis,
                torqueFromAccelerationNm: torqueFromAcceleration,
                reportedOnBTorqueNm: reportedOnBTorque,
                reportedWorldTorque: value.state.native.torque,
                requestedCapNm: T.torqueCapNm,
                publicAngularSpeed: value.publicSpeed,
            };
            observe('independent-on-B-reaction-torque', torqueObservation);
            // These five ticks remain below target speed: a constant saturated cap makes the
            // full-frame acceleration torque comparable to the final solver-substep reaction.
            check(
                'Public on-B reaction torque equals independent negative I*domega/dt, not doubled motor torque',
                actualFrame.dt === T.fixedDtSeconds &&
                    actualNativeTick.frame === tick &&
                    actualNativeTick.fixedDt === Math.fround(T.fixedDtSeconds) &&
                    actualNativeTick.solverSubSteps === T.solverSubSteps &&
                    value.publicSpeed < Math.PI / 2 - T.motorSpeedErrorRadiansPerSecond &&
                    Math.abs(torqueFromAcceleration - T.torqueCapNm) <= T.nativeScalarTolerance &&
                    Math.abs(reportedOnBTorque + torqueFromAcceleration) <= T.nativeScalarTolerance,
                torqueObservation,
            );
            previousTorqueMotion = value.bodyA;
            maxDrivenTorque = Math.max(maxDrivenTorque, Math.abs(value.state.native.motorTorque));
            assert(Math.abs(value.state.native.motorTorque) <= T.torqueCapNm + T.nativeScalarTolerance);
            assert(value.state.native.maxMotorTorque === Math.fround(T.torqueCapNm));
            assert(value.state.motorTorque >= -T.nativeScalarTolerance, 'Positive public drive torque direction');
        }
        const drivenCoast = sample('finite-torque-terminal', coast, coastReference);
        check(
            'Legacy motorForceLimit is finite N.m readback with real bounded positive drive torque',
            maxDrivenTorque >= T.drivenTorqueMinimumNm && drivenCoast.publicSpeed >= T.movingAngularSpeedMinimum,
            { maxDrivenTorque, capNm: T.torqueCapNm, observation: drivenCoast },
        );
        const runCoast = async (name, configure) => {
            const beforeMotion = motion(coasting.body),
                speedBefore = independent(coastReference).publicSpeed;
            configure();
            system.syncSceneToPhysics();
            assert.deepEqual(
                motion(coasting.body),
                beforeMotion,
                name + ' configuration may not reset body velocity/pose',
            );
            sameFrames(state(coast), coastFrames);
            for (let i = 0; i < T.coastTicks; i++) {
                await step();
                const value = sample(name, coast, coastReference);
                const retention = value.publicSpeed / speedBefore;
                assert(
                    Math.abs(value.state.native.motorTorque) <= T.nativeScalarTolerance,
                    name + ' must have zero drive torque',
                );
                assert(
                    retention >= T.coastSpeedRetentionMinimum && retention <= T.coastSpeedRetentionMaximum,
                    name + ' must coast, not fabricate a velocity reset',
                );
            }
            check(
                name + ' retains existing angular motion with zero drive',
                independent(coastReference).publicSpeed >= T.movingAngularSpeedMinimum,
                { before: beforeMotion, after: motion(coasting.body), state: state(coast) },
            );
        };
        await runCoast('Zero torque while motor remains enabled', () => {
            coast.motorVelocity = -90;
            coast.motorForceLimit = 0;
        });
        await runCoast('Motor disabled with nonzero stored cap', () => {
            coast.motorEnabled = false;
            coast.motorForceLimit = 2;
        });
        // Exercise a live geometry edit after actual twist: capture is refreshed, never repaired by pose writes.
        const geometryBefore = motion(coasting.body),
            geometryNativeBefore = state(coast);
        check(
            'Geometry recreation case has nonzero prior physical twist',
            Math.abs(independent(coastReference).publicRadians) >= 0.1,
            independent(coastReference),
        );
        coast.pivotA = new Vec3(0.1, 0, 0);
        coast.axis = new Vec3(0, 3, 0);
        const recapturedCoast = capture(coasting, null, [0.1, 0, 0], [0, 0, 0], [0, 3, 0]);
        check(
            'Live geometry request remains pending with old native frames until safe sync',
            state(coast).pending,
            state(coast),
        );
        sameFrames(state(coast), geometryNativeBefore);
        system.syncSceneToPhysics();
        assert.deepEqual(
            motion(coasting.body),
            geometryBefore,
            'Geometry recreation must not rewrite live body pose/velocity',
        );
        captureCheck(
            'Live pivot/axis change captures a new zero and matching world axes at safe sync',
            coast,
            recapturedCoast,
        );
        assert.notDeepEqual(state(coast).native.frameA, geometryNativeBefore.native.frameA);
        const recapturedSnapshot = state(coast);
        system.syncSceneToPhysics();
        assert.deepEqual(state(coast), recapturedSnapshot, 'Unchanged repeated safe sync preserves new capture');
        coast.enabled = false;
        system.syncSceneToPhysics();
        // Disable genuinely retires the joint and allows the old gravity-loaded endpoint to move freely.
        const beforeDisabled = motion(anchored.body);
        anchor.enabled = false;
        check(
            'Disable is requested before native retirement at the safe boundary',
            !anchor.enabled && state(anchor).pending && state(anchor).native !== null,
        );
        system.syncSceneToPhysics();
        check(
            'Disabled Hinge has no participating native joint',
            state(anchor).state === 'disabled' && state(anchor).native === null,
        );
        await step(15);
        check(
            'Disabled anchor permits actual unrestrained gravity translation',
            distance(motion(anchored.body).p, beforeDisabled.p) >= T.disabledTranslationMinimumMetres,
            { before: beforeDisabled, after: motion(anchored.body) },
        );
        anchor.enabled = true;
        const recapturedAnchor = capture(anchored, null, [0.4, 0, 0], [0, 0, 0], [0, 0, 1]);
        system.syncSceneToPhysics();
        captureCheck('Explicit re-enable recaptures the present world anchor', anchor, recapturedAnchor);
        // Reconnect while live to a fresh public endpoint whose initial placement needs no correction.
        const pairA = motion(a.body),
            pairAnchor = worldPivot(pairA, [0.5, 0, 0]);
        const replacement = box('live-reconnect-B', [pairAnchor[0] + 1, pairAnchor[1], pairAnchor[2]], {
            euler: [0, 0, 19],
        });
        const replacementMotion = motion(replacement.body);
        const replacementPivot = rotate(conjugate(replacementMotion.q), subtract(pairAnchor, replacementMotion.p));
        const beforeReconnect = state(pair),
            beforeReconnectMotion = motion(a.body);
        pair.connectedBody = replacement.body;
        pair.pivotB = new Vec3(...replacementPivot);
        const reconnectReference = capture(a, replacement, [0.5, 0, 0], replacementPivot, [0, 0, 4]);
        sameFrames(state(pair), beforeReconnect);
        system.syncSceneToPhysics();
        assert.deepEqual(motion(a.body), beforeReconnectMotion);
        captureCheck(
            'Live connectedBody/pivotB update safely recaptures against the final real endpoint',
            pair,
            reconnectReference,
        );
        pair.connectedBody = null;
        pair.pivotB = new Vec3(900, 800, 700);
        const worldReference = capture(a, null, [0.5, 0, 0], [900, 800, 700], [0, 0, 4]);
        system.syncSceneToPhysics();
        captureCheck(
            'Live null-world reconnect owns a current world anchor and ignores stored pivotB',
            pair,
            worldReference,
        );
        // Reconnect back solely to test connected RigidBody retirement before the next native step.
        pair.connectedBody = replacement.body;
        pair.pivotB = new Vec3(...replacementPivot);
        system.syncSceneToPhysics();
        const endpointWorld = copiedWorld();
        check('Connected RigidBody destroy request is accepted', replacement.body.destroy() === true);
        system.syncSceneToPhysics();
        check(
            'Direct safe sync retires a marked endpoint before any new native tick',
            state(pair).state === 'endpoint-removed' &&
                state(pair).native === null &&
                copiedWorld().native.nativeStepIndex === endpointWorld.native.nativeStepIndex &&
                copiedWorld().state === 'ready',
            state(pair),
        );
        pair.enabled = false;
        reject('Re-enable rejects destroyed endpoint', pair, () => {
            pair.enabled = true;
        });
        reject('Explicit dead endpoint rejects before caches', pending, () => {
            pending.connectedBody = replacement.body;
        });
        pair.connectedBody = null;
        pair.enabled = true;
        const afterDeathReference = capture(a, null, [0.5, 0, 0], replacementPivot, [0, 0, 4]);
        system.syncSceneToPhysics();
        captureCheck(
            'Disabled reconfiguration reconnects a live survivor after old endpoint removal',
            pair,
            afterDeathReference,
        );
        await step(3);
        check(
            'Endpoint body destruction retains its ordinary Node/Collider and a healthy world',
            !replacement.body.isValid &&
                replacement.node.isValid &&
                replacement.collider.isValid &&
                copiedWorld().state === 'ready',
        );
        const only = box('constraint-component-only-destroy', [35, 6, 0], { gravity: true });
        const onlyJoint = hinge(only);
        system.syncSceneToPhysics();
        const beforeOnly = motion(only.body);
        check('Constraint-component-only destroy request is accepted', onlyJoint.destroy() === true);
        system.syncSceneToPhysics();
        check('Marked constraint retires before the next native tick', state(onlyJoint).native === null);
        await step(15);
        check(
            'Destroying only Hinge keeps body/collider and permits actual gravity movement',
            only.body.isValid &&
                only.collider.isValid &&
                only.node.isValid &&
                distance(motion(only.body).p, beforeOnly.p) >= T.translationMinimumMetres,
            { before: beforeOnly, after: motion(only.body) },
        );
        const destroyedGetterOutcomes = hingeGetterObserver(onlyJoint).getterOutcomes;
        const beforeDestroyedSetter = destroyedGetterOutcomes();
        let destroyedSetterError;
        try {
            onlyJoint.motorVelocity = 10;
        } catch (error) {
            destroyedSetterError = error;
        }
        const afterDestroyedSetter = destroyedGetterOutcomes();
        check(
            'Destroyed Hinge rejects setter without reviving public getter state',
            destroyedSetterError?.code === 'AIR_E_BOX3D_DISPOSED' && !(destroyedSetterError instanceof RangeError),
            {
                before: beforeDestroyedSetter,
                after: afterDestroyedSetter,
                error: destroyedSetterError
                    ? { name: destroyedSetterError.name, code: destroyedSetterError.code }
                    : null,
            },
        );
        assert.deepEqual(afterDestroyedSetter, beforeDestroyedSetter, 'Destroyed Hinge changed public getter outcomes');
        const removed = box('attached-node-destroy', [40, 6, 0]);
        const removedJoint = hinge(removed);
        system.syncSceneToPhysics();
        check('Attached Node destroy request is accepted', removed.node.destroy() === true);
        // Match normal Cocos/Fixed ordering: the owned Game frame flushes deferred Node
        // destruction before PhysicsSystem.postUpdate. Direct sync while ToDestroy is unsupported.
        await step(3);
        check(
            'Attached Node and Hinge follow ordinary deferred destruction without world fault',
            !removed.node.isValid && !removedJoint.isValid && copiedWorld().state === 'ready',
        );
        // A real collision callback stages a copied request; the next normal safe sync commits it.
        const callbackFloorNode = new Node('healthy-callback-floor');
        callbackFloorNode.setPosition(50, -0.5, 0);
        callbackFloorNode.addComponent(RigidBody).type = RigidBody.Type.STATIC;
        const callbackFloor = callbackFloorNode.addComponent(BoxCollider);
        callbackFloor.size = new Vec3(4, 1, 4);
        scene.addChild(callbackFloorNode);
        const callbackBallNode = new Node('healthy-callback-sphere');
        callbackBallNode.setPosition(50, 0.48, 0);
        const callbackBody = callbackBallNode.addComponent(RigidBody);
        callbackBody.type = RigidBody.Type.DYNAMIC;
        callbackBody.allowSleep = false;
        const callbackBall = callbackBallNode.addComponent(sdk.SphereCollider);
        callbackBall.radius = 0.5;
        scene.addChild(callbackBallNode);
        let callbackObservation = null;
        callbackBall.once('onCollisionEnter', (event) => {
            assert.equal(event.selfCollider, callbackBall);
            assert.equal(event.otherCollider, callbackFloor);
            const prior = state(pending);
            pending.motorVelocity = 17;
            callbackObservation = { prior, staged: state(pending), tick: tick + 1 };
        });
        for (let i = 0; i < 30 && !callbackObservation; i++) await step();
        check(
            'Actual collision callback admits a copied Hinge request without immediate native write',
            callbackObservation?.staged.pending &&
                callbackObservation.staged.requested.motorVelocity === 17 &&
                callbackObservation.staged.native.motorSpeedRadians ===
                    callbackObservation.prior.native.motorSpeedRadians,
            callbackObservation,
        );
        await step();
        check(
            'Next normal owner tick commits callback configuration with original frames',
            state(pending).native.motorSpeedRadians === Math.fround((-17 * Math.PI) / 180) && !state(pending).pending,
            state(pending),
        );
        sameFrames(state(pending), callbackObservation.prior);
        observe('healthy-final-world-copied-observation', copiedWorld());
        observe('healthy-final-surviving-hinge', state(pending));
        report.healthyComplete = true;
    }
    if (!intentionalFaultObserved) beforeStep.dispose();
    report.postCloseCaches = {
        axis: point(postCloseJoint.axis),
        pivotA: point(postCloseJoint.pivotA),
        pivotB: point(postCloseJoint.pivotB),
        lowerLimit: postCloseJoint.lowerLimit,
        upperLimit: postCloseJoint.upperLimit,
        limitEnabled: postCloseJoint.limitEnabled,
        motorVelocity: postCloseJoint.motorVelocity,
        motorForceLimit: postCloseJoint.motorForceLimit,
        motorEnabled: postCloseJoint.motorEnabled,
        enableCollision: postCloseJoint.enableCollision,
        enabled: postCloseJoint.enabled,
    };
} catch (error) {
    failure = error;
    report.error = String(error.stack ?? error);
    report.errorCode = error.code ?? null;
} finally {
    if (app) {
        try {
            const first = app.close(),
                duplicate = app.close();
            check('Public app.close is idempotent', first === duplicate);
            report.close = await first;
            if (mode !== 'healthy' && intentionalFaultObserved) {
                check(
                    'Only the deliberate fault process may report the existing terminal-clock close failure',
                    (report.close.status === 'released' && report.close.failures.length === 0) ||
                        (report.close.status === 'failed' &&
                            report.close.failures.length === 1 &&
                            report.close.failures[0].label === 'game-clock-terminal' &&
                            report.close.failures[0].message.includes('AIR_E_BOX3D_WORLD_FAULTED')),
                    report.close,
                );
            } else
                check(
                    'Healthy app.close releases with no failure',
                    report.close.status === 'released' && report.close.failures.length === 0,
                    report.close,
                );
            check(
                'Physics preparation releases all acquired owners without cleanup errors',
                report.close.physicsPreparation?.status === 'closed' &&
                    report.close.physicsPreparation.cleanupErrors.length === 0 &&
                    report.close.physicsPreparation.acquired.length > 0 &&
                    report.close.physicsPreparation.acquired.every(
                        (entry) =>
                            entry.backend === 'box3d' && entry.cleanup === 'released' && entry.retained.length === 0,
                    ),
                report.close.physicsPreparation,
            );
            if (postCloseJoint) {
                // Cocos destruction may clear vectors/nested limit/motor data. Observe only public getters:
                // null and a getter's thrown type/code are outcomes, not evidence of a live readable cache.
                const { vectorFields, fields, referenceId, getterOutcomes } = hingeGetterObserver(postCloseJoint);
                report.postCloseGetterOutcomes = getterOutcomes();
                report.postCloseSetterObservations = [];
                for (const field of fields) {
                    const prior = getterOutcomes(),
                        current = prior[field];
                    let candidate;
                    if (vectorFields.has(field)) {
                        const xyz =
                            current.type === 'vector' && current.value.every((value, i) => value === i + 3)
                                ? [4, 5, 6]
                                : [3, 4, 5];
                        candidate = new sdk.Vec3(...xyz);
                    } else if (field === 'connectedBody') {
                        candidate =
                            current.type === 'reference' && current.reference === referenceId(postCloseBody)
                                ? null
                                : postCloseBody;
                    } else if (['motorEnabled', 'limitEnabled', 'enableCollision', 'enabled'].includes(field)) {
                        candidate = current.type === 'boolean' ? !current.value : true;
                    } else {
                        const selected = { motorVelocity: 700, motorForceLimit: 800, lowerLimit: -17, upperLimit: 45 }[
                            field
                        ];
                        candidate = current.type === 'number' && current.value === selected ? selected + 1 : selected;
                    }
                    let caught;
                    try {
                        postCloseJoint[field] = candidate;
                    } catch (error) {
                        caught = error;
                    }
                    const after = getterOutcomes();
                    const observation = {
                        field,
                        before: prior,
                        after,
                        setterError: caught
                            ? { name: caught.name, code: caught.code ?? null, message: caught.message }
                            : null,
                    };
                    report.postCloseSetterObservations.push(observation);
                    flush();
                    check(
                        'Post-close ' + field + ' rejects without reviving public getter state',
                        caught?.code === 'AIR_E_BOX3D_DISPOSED' && !(caught instanceof RangeError),
                        observation,
                    );
                    assert.deepEqual(after, prior, 'Post-close ' + field + ' changed public getter outcomes');
                }
            }
        } catch (error) {
            report.closeError = String(error.stack ?? error);
            if (!failure) failure = error;
        }
    }
    try {
        assert.deepEqual(verifyInputs(artifacts, lockPath), before);
        report.inputsUnchanged = true;
    } catch (error) {
        report.inputError = String(error.stack ?? error);
        if (!failure) failure = error;
    }
    hooks?.deregister();
    dom?.window.close();
    try {
        check('No JSDOM host errors were recorded', report.hostErrors.length === 0, report.hostErrors);
    } catch (error) {
        report.hostErrorFailure = String(error.stack ?? error);
        if (!failure) failure = error;
    }
    report.totalSteps = tick;
    report.status = failure
        ? 'FAIL'
        : mode === 'healthy'
          ? 'PASS_LIMITED_PUBLIC_HINGE'
          : 'PASS_EXPECTED_PUBLIC_HINGE_FAULT';
    report.completedAt = new Date().toISOString();
    if (failure) process.exitCode = 1;
    flush();
}
console.log(
    JSON.stringify({ status: report.status, totalSteps: tick, error: report.error ?? report.closeError ?? null }),
);
