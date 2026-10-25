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
assert(artifactArgument && lockArgument && outputArgument && ['healthy', 'intentional-fault'].includes(mode));
const artifacts = resolve(artifactArgument),
    lockPath = resolve(lockArgument),
    out = resolve(outputArgument);
const raw = join(out, 'consumer.raw.json');
assert(!existsSync(raw), 'Never replace a raw attempt');
const before = verifyInputs(artifacts, lockPath),
    { lock } = before;
const require = createRequire(join(root, 'package.json'));
const { JSDOM, VirtualConsole } = require('jsdom');
const BASE = 'https://box3d-public-point-to-point.invalid/physics/box3d/st/';
const bundle = pathToFileURL(join(artifacts, 'cocosair.module.js')).href;
const nativeModule = pathToFileURL(join(artifacts, 'physics/box3d/st/box3d-st.mjs')).href;
const report = {
    schema: 'box3d-production-esm-public-point-to-point-consumer-v1',
    status: 'RUNNING',
    cohortIdentity: before.lock.cohortIdentity,
    cohortCaseFamily: 'p2p',
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
// One bounded observer shared by destroyed-component and post-close checks; no product cache access.
const getterObserver = (joint) => {
    const vectorFields = new Set(['pivotA', 'pivotB']);
    const fields = ['pivotA', 'pivotB', 'enableCollision', 'connectedBody', 'enabled'];
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
        { url: 'https://box3d-public-point-to-point.invalid/', pretendToBeVisual: true, virtualConsole },
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
        'Exact fresh runtime build, not pre-P2P builds through 215',
        sdk.AIR_BUILD_NUMBER === lock.runtimeBuildNumber && sdk.AIR_BUILD_NUMBER >= 216,
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
        'PointToPointConstraint',
        'PhysicsSystem',
        'Vec3',
        'Quat',
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
    const { Node, Scene, RigidBody, BoxCollider, PointToPointConstraint, PhysicsSystem, Vec3 } = sdk;
    const system = PhysicsSystem.instance;
    system.enable = false;
    system.autoSimulation = true;
    system.fixedTimeStep = T.fixedDtSeconds;
    system.maxSubSteps = 1;
    system.gravity = new Vec3(0, -10, 0);
    const scene = new Scene('public-point-to-point-' + mode);
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
        collider.size = new Vec3(...(options.size ?? [0.5, 0.5, 0.5]));
        scene.addChild(node);
        return { node, body, collider, initialScale: options.scale ?? [1, 1, 1] };
    };
    const copyDiagnostic = (value) => {
        assert(Object.isFrozen(value) && Object.isFrozen(value.requested));
        assert(Object.isFrozen(value.requested.pivotA) && Object.isFrozen(value.requested.pivotB));
        const n = value.native;
        if (n) {
            assert(Object.isFrozen(n) && Object.isFrozen(n.frameA) && Object.isFrozen(n.frameB));
            assert.equal(n.kind, 'point-to-point');
            assert(
                [n.springEnabled, n.motorEnabled, n.coneLimitEnabled, n.twistLimitEnabled].every((v) => v === false),
            );
            assert(!('force' in n) && !('torque' in n), 'Do not fabricate unsupported reaction diagnostics');
            assert([...n.frameA, ...n.frameB, n.linearSeparation].every(Number.isFinite));
        }
        // No native endpoint identities are retained or used as capabilities.
        return {
            backend: value.backend,
            kind: value.kind,
            state: value.state,
            requestedEnabled: value.requestedEnabled,
            pending: value.pending,
            requested: { pivotA: point(value.requested.pivotA), pivotB: point(value.requested.pivotB) },
            captureVersion: value.captureVersion,
            appliedCaptureVersion: value.appliedCaptureVersion,
            native: n
                ? {
                      kind: n.kind,
                      collideConnected: n.collideConnected,
                      frameA: [...n.frameA],
                      frameB: [...n.frameB],
                      springEnabled: n.springEnabled,
                      motorEnabled: n.motorEnabled,
                      coneLimitEnabled: n.coneLimitEnabled,
                      twistLimitEnabled: n.twistLimitEnabled,
                      linearSeparation: n.linearSeparation,
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
        pivotA: point(joint.pivotA),
        pivotB: point(joint.pivotB),
    });
    const reject = (name, joint, owners, action, code = 'AIR_E_BOX3D_CONFIG') => {
        const previous = caches(joint),
            prior = state(joint),
            world = copiedWorld();
        const poses = owners.map((owner) => motion(owner.body));
        let caught;
        try {
            action();
        } catch (error) {
            caught = error;
        }
        check(
            name + ' rejects before cache, native counts or body pose publication',
            caught &&
                !(caught instanceof RangeError) &&
                (typeof code === 'function' ? code(caught) : caught.code === code),
            caught ? { name: caught.name, code: caught.code ?? null, message: caught.message } : null,
        );
        assert.deepEqual(caches(joint), previous, name + ' public cache mutation');
        assert.deepEqual(state(joint), prior, name + ' admitted/native state mutation');
        assert.deepEqual(copiedWorld(), world, name + ' world/count/step mutation');
        assert.deepEqual(
            owners.map((owner) => motion(owner.body)),
            poses,
            name + ' body pose mutation',
        );
    };
    const sameFrames = (actual, expected) => {
        assert.deepEqual(actual.native.frameA, expected.native.frameA, 'frameA must remain bit-for-bit identical');
        assert.deepEqual(actual.native.frameB, expected.native.frameB, 'frameB must remain bit-for-bit identical');
    };
    const scaledPivot = (owner, local) => local.map((value, i) => value * owner.initialScale[i]);
    const worldPivot = (bodyMotion, local) => rotate(bodyMotion.q, local).map((value, i) => value + bodyMotion.p[i]);
    // Independent geometry uses admitted initialScale, never a numerically decomposed live worldScale.
    const capture = (a, b, pivotA, pivotB) => {
        const ma = motion(a.body),
            mb = b ? motion(b.body) : { p: [0, 0, 0], q: [0, 0, 0, 1] };
        return {
            a,
            b,
            ma,
            mb,
            pivotA: scaledPivot(a, pivotA),
            pivotB: b ? scaledPivot(b, pivotB) : worldPivot(ma, scaledPivot(a, pivotA)),
        };
    };
    const captureCheck = (name, joint, reference) => {
        const value = state(joint),
            fa = composeFrame(reference.ma, framePose(value.native.frameA));
        const fb = composeFrame(reference.mb, framePose(value.native.frameB));
        check(
            name,
            value.state === 'connected' &&
                value.kind === 'point-to-point' &&
                !value.pending &&
                distance(fa.p, worldPivot(reference.ma, reference.pivotA)) <= T.captureMetres &&
                distance(fb.p, worldPivot(reference.mb, reference.pivotB)) <= T.captureMetres,
            { state: value, originA: reference.ma, originB: reference.mb, frameWorldA: fa, frameWorldB: fb },
        );
    };
    const sample = (name, joint, reference) => {
        const value = state(joint),
            a = motion(reference.a.body);
        const b = reference.b ? motion(reference.b.body) : { p: [0, 0, 0], q: [0, 0, 0, 1] };
        return {
            tick,
            name,
            bodyA: a,
            bodyB: b,
            nativeSeparation: value.native.linearSeparation,
            independentSeparation: distance(worldPivot(a, reference.pivotA), worldPivot(b, reference.pivotB)),
        };
    };
    const p2p = (owner, connected = null, config = {}) => {
        const joint = owner.node.addComponent(PointToPointConstraint);
        joint.enabled = false; // Active/onLoad owner first, never unsupported pre-onLoad setters.
        joint.connectedBody = connected?.body ?? null;
        joint.pivotA = new Vec3(...(config.pivotA ?? [0, 0, 0]));
        joint.pivotB = new Vec3(...(config.pivotB ?? [0, 0, 0]));
        joint.enableCollision = config.enableCollision ?? false;
        joint.enabled = true;
        return joint;
    };
    system.enable = true;
    const beforeStep = sdk.registerBox3DBeforeStep((context) => {
        report.nativeTicks.push({ frame: tick + 1, ...context });
    });
    const defaultsOwner = box('default-zero-pivots', [-20, 4, 0]);
    const defaults = defaultsOwner.node.addComponent(PointToPointConstraint);
    postCloseJoint = defaults;
    postCloseBody = defaultsOwner.body;
    check(
        'Public zero pivots/null B/collision true are valid enabled pending defaults',
        defaults.enabled &&
            defaults.enableCollision === true &&
            defaults.connectedBody === null &&
            point(defaults.pivotA).every((v) => v === 0) &&
            point(defaults.pivotB).every((v) => v === 0) &&
            state(defaults).state === 'pending' &&
            state(defaults).native === null,
        state(defaults),
    );
    const defaultReference = capture(defaultsOwner, null, [0, 0, 0], [0, 0, 0]);
    system.syncSceneToPhysics();
    captureCheck('Zero-pivot defaults commit a real native spherical joint without repair', defaults, defaultReference);
    check(
        'Real spherical joint has no springs, motors, cone or twist limits',
        state(defaults).native.collideConnected,
        state(defaults),
    );
    await step();
    if (mode === 'intentional-fault') {
        const floor = box('expected-callback-fault-floor', [50, -0.5, 0], {
            type: RigidBody.Type.STATIC,
            size: [4, 1, 4],
        });
        const ballNode = new Node('expected-callback-fault-ball');
        ballNode.setPosition(50, 0.48, 0);
        const body = ballNode.addComponent(RigidBody);
        body.type = RigidBody.Type.DYNAMIC;
        body.allowSleep = false;
        const ball = ballNode.addComponent(sdk.SphereCollider);
        ball.radius = 0.5;
        scene.addChild(ballNode);
        const marker = new Error('intentional-public-point-to-point-collision-callback-fault');
        let calls = 0,
            caught;
        ball.once('onCollisionEnter', () => {
            calls++;
            defaults.pivotA = new Vec3(0.1, 0.2, 0.3);
            throw marker;
        });
        try {
            for (let i = 0; i < 30 && calls === 0; i++) await step();
        } catch (error) {
            caught = error;
        }
        check(
            'Real collision callback preserves the deliberate exact Error identity',
            caught === marker && calls === 1,
            { calls, message: caught?.message, code: caught?.code ?? null },
        );
        check(
            'Copied P2P request was staged before deliberate callback throw',
            point(defaults.pivotA).every((v, i) => v === [0.1, 0.2, 0.3][i]),
        );
        intentionalFaultObserved = true;
        const prior = caches(defaults);
        let guardError;
        try {
            defaults.pivotB = new Vec3(3, 4, 5);
        } catch (error) {
            guardError = error;
        }
        check(
            'Terminal callback guard rejects subsequent setter before public cache publication',
            guardError?.code === 'AIR_E_BOX3D_WORLD_FAULTED' && !(guardError instanceof RangeError),
        );
        assert.deepEqual(caches(defaults), prior);
    } else {
        const pivotA = [0.7, 0.1, 0.2],
            pivotB = [-0.8, -0.15, 0.1];
        const a = box('rotated-scaled-dynamic-a', [0, 8, 0], { scale: [1.5, 0.75, 1.25], euler: [17, -29, 41] });
        const bScale = [0.8, 1.4, 1.1],
            bRotation = new sdk.Quat();
        sdk.Quat.fromEuler(bRotation, -23, 13, -37);
        const anchorPoint = worldPivot(motion(a.body), scaledPivot(a, pivotA));
        const bPosition = subtract(
            anchorPoint,
            rotate(
                rotation(bRotation),
                pivotB.map((v, i) => v * bScale[i]),
            ),
        );
        const b = box('rotated-scaled-dynamic-b', bPosition, { scale: bScale, euler: [-23, 13, -37] });
        const unused = box('unused-intermediate-endpoint', [12, 8, 0]);
        const pair = a.node.addComponent(PointToPointConstraint),
            assembly = [state(pair)];
        pair.enabled = false;
        assembly.push(state(pair));
        pair.connectedBody = unused.body;
        assembly.push(state(pair));
        pair.connectedBody = b.body;
        pair.pivotA = new Vec3(...pivotA);
        pair.pivotB = new Vec3(...pivotB);
        pair.enableCollision = false;
        assembly.push(state(pair));
        pair.enabled = true;
        assembly.push(state(pair));
        check(
            'Active add/disable/configure/enable creates no intermediate native constraint',
            assembly.every((entry) => entry.native === null) && pair.connectedBody === b.body,
            assembly,
        );
        const pairReference = capture(a, b, pivotA, pivotB),
            initialA = motion(a.body),
            initialB = motion(b.body);
        system.syncSceneToPhysics();
        captureCheck('First commit uses only final B and scaled body-origin pivots', pair, pairReference);
        assert.deepEqual(motion(a.body), initialA);
        assert.deepEqual(motion(b.body), initialB);
        const pairFrames = state(pair),
            retained = sdk.readBox3DConstraintState(pair),
            retainedProjection = copyDiagnostic(retained);
        for (const field of ['pivotA', 'pivotB']) {
            for (const invalid of [NaN, Infinity, -Infinity, Number.MAX_VALUE])
                reject(field + ' rejects ' + String(invalid), pair, [a, b], () => {
                    pair[field] = { x: invalid, y: 1, z: 2 };
                });
            const marker = new Error(field + '-throwing-caller-getter');
            reject(
                field + ' preserves throwing getter identity',
                pair,
                [a, b],
                () => {
                    pair[field] = Object.defineProperty({ y: 0, z: 0 }, 'x', {
                        get() {
                            throw marker;
                        },
                    });
                },
                (error) => error === marker,
            );
            reject(
                field + ' rejects nested setter from caller getter',
                pair,
                [a, b],
                () => {
                    pair[field] = Object.defineProperty({ y: 0, z: 0 }, 'x', {
                        get() {
                            pair.enableCollision = !pair.enableCollision;
                            return 0;
                        },
                    });
                },
                'AIR_E_BOX3D_REENTRANT',
            );
        }
        reject('Self endpoint', pair, [a, b], () => {
            pair.connectedBody = a.body;
        });
        reject('Non-body endpoint', pair, [a, b], () => {
            pair.connectedBody = {};
        });
        reject('Nonboolean collision flag', pair, [a, b], () => {
            pair.enableCollision = 1;
        });
        // Each local component fits float32, but admitted initialScale makes the complete pivot overflow.
        reject('Scaled attached pivot float32 overflow', pair, [a, b], () => {
            pair.pivotA = new Vec3(3e38, 0, 0);
        });
        reject('Scaled connected pivot float32 overflow', pair, [a, b], () => {
            pair.pivotB = new Vec3(0, 3e38, 0);
        });
        defaults.pivotB = new Vec3(0, 3e38, 0);
        system.syncSceneToPhysics();
        reject(
            'Reconnect rechecks whole stored B pivot against destination admitted scale',
            defaults,
            [defaultsOwner, b],
            () => {
                defaults.connectedBody = b.body;
            },
        );
        defaults.pivotB = new Vec3();
        system.syncSceneToPhysics();
        const unownedNode = new Node('unowned-endpoint');
        const unownedBody = unownedNode.addComponent(RigidBody);
        reject('Unowned real RigidBody cannot join this exact world', pair, [a, b], () => {
            pair.connectedBody = unownedBody;
        });
        unownedNode.destroy();
        const reads = {};
        for (const [field, values] of [
            ['pivotA', pivotA],
            ['pivotB', pivotB],
        ]) {
            const count = { x: 0, y: 0, z: 0 };
            pair[field] = Object.defineProperties(
                {},
                Object.fromEntries(
                    ['x', 'y', 'z'].map((key, i) => [
                        key,
                        {
                            get() {
                                count[key]++;
                                return values[i];
                            },
                            enumerable: true,
                        },
                    ]),
                ),
            );
            assert.deepEqual(count, { x: 1, y: 1, z: 1 });
            reads[field] = count;
        }
        system.syncSceneToPhysics();
        sameFrames(state(pair), pairFrames);
        observe('caller-pivot-getters-read-once', reads);
        pair.enableCollision = true;
        check(
            'Collision-only request remains pending until safe commit',
            state(pair).pending && !state(pair).native.collideConnected,
        );
        system.syncSceneToPhysics();
        sameFrames(state(pair), pairFrames);
        assert(state(pair).native.collideConnected);
        pair.enableCollision = false;
        system.syncSceneToPhysics();
        sameFrames(state(pair), pairFrames);
        assert.deepEqual(copyDiagnostic(retained), retainedProjection, 'Retained copied SDK snapshot must not change');
        const anchored = box('gravity-loaded-rotated-scaled-anchor', [-6, 9, 0], {
            gravity: true,
            scale: [2, 1.5, 0.75],
            euler: [11, 23, 31],
        });
        const anchorPivot = [0.35, 0.05, -0.1],
            anchor = p2p(anchored, null, { pivotA: anchorPivot, pivotB: [900, 800, 700] });
        let anchorReference = capture(anchored, null, anchorPivot, [900, 800, 700]);
        system.syncSceneToPhysics();
        captureCheck('Null B ignores stored pivotB and captures current A world pivot', anchor, anchorReference);
        const anchorFrames = state(anchor),
            startingAnchorQ = motion(anchored.body).q;
        const initialWorldScales = {
            a: point(a.node.worldScale),
            b: point(b.node.worldScale),
            anchored: point(anchored.node.worldScale),
        };
        a.body.applyImpulse(new Vec3(0.4, 0.2, 0.1));
        b.body.applyImpulse(new Vec3(0.4, 0.2, 0.1));
        a.body.applyTorque(new Vec3(0.3, 0.5, 0.7));
        const maxima = { independentSeparation: 0, nativeSeparation: 0 };
        let maxAnchorRotation = 0,
            maxPairRotation = 0;
        for (let i = 0; i < T.enduranceTicks; i++) {
            await step();
            for (const [name, joint, reference, frames] of [
                ['anchor', anchor, anchorReference, anchorFrames],
                ['two-dynamic', pair, pairReference, pairFrames],
            ]) {
                const value = sample(name, joint, reference),
                    current = state(joint);
                value.enduranceTick = i + 1;
                value.frameA = current.native.frameA;
                value.frameB = current.native.frameB;
                value.worldScaleA = point(reference.a.node.worldScale);
                value.worldScaleB = reference.b ? point(reference.b.node.worldScale) : null;
                report.drift.push(value);
                for (const key of Object.keys(maxima)) maxima[key] = Math.max(maxima[key], value[key]);
                // Preserve the actual failure sample before any assertion, never erase a failed run.
                if (
                    value.independentSeparation > T.separationMetres ||
                    value.nativeSeparation > T.separationMetres ||
                    JSON.stringify(current.native.frameA) !== JSON.stringify(frames.native.frameA) ||
                    JSON.stringify(current.native.frameB) !== JSON.stringify(frames.native.frameB)
                )
                    flush();
                sameFrames(current, frames);
                assert(
                    value.independentSeparation <= T.separationMetres && value.nativeSeparation <= T.separationMetres,
                    name + ' exceeded frozen 0.02 m bound',
                );
                if (name === 'anchor')
                    maxAnchorRotation = Math.max(maxAnchorRotation, angle(value.bodyA.q, startingAnchorQ));
                else maxPairRotation = Math.max(maxPairRotation, angle(value.bodyA.q, initialA.q));
            }
            if ((i + 1) % 30 === 0) flush();
        }
        check(
            '600 ticks keep independent/native anchored and two-dynamic pivot error at or below 0.02 m',
            report.drift.length === 2 * T.enduranceTicks,
            maxima,
        );
        check(
            'Rotated nonuniform-scale frames never reset from numerical live worldScale decomposition',
            maxAnchorRotation >= T.rotationMinimumRadians && maxPairRotation >= T.rotationMinimumRadians,
            {
                initialWorldScales,
                maxAnchorRotation,
                maxPairRotation,
                terminalWorldScales: {
                    a: point(a.node.worldScale),
                    b: point(b.node.worldScale),
                    anchored: point(anchored.node.worldScale),
                },
            },
        );
        check(
            'Two real dynamic endpoints translate after public impulses',
            distance(motion(a.body).p, initialA.p) >= T.translationMinimumMetres &&
                distance(motion(b.body).p, initialB.p) >= T.translationMinimumMetres,
        );
        // Three independent, COM-centred isotropic cubes. Quaternion motion, not a zero-valued
        // unsupported joint angular getter, establishes every free rotational axis.
        const rotors = [];
        for (const [i, axis] of [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
        ].entries()) {
            const owner = box('free-COM-rotation-' + i, [20 + i * 3, 8, 0]);
            const joint = p2p(owner);
            system.syncSceneToPhysics();
            const initial = motion(owner.body),
                mass = sdk.readBox3DBodyMotion(owner.body);
            assert.deepEqual(point(mass.localCenter), [0, 0, 0]);
            assert.deepEqual(initial.p, initial.com);
            assert.equal(owner.body.angularDamping, 0);
            assert.equal(owner.body.linearDamping, 0);
            assert.equal(owner.body.useGravity, false);
            owner.body.applyTorque(new Vec3(...axis));
            rotors.push({
                owner,
                joint,
                axis,
                initial,
                frames: state(joint),
                reference: capture(owner, null, [0, 0, 0], [0, 0, 0]),
            });
        }
        await step();
        for (const item of rotors) item.initialSpeed = Math.hypot(...motion(item.owner.body).w);
        for (let i = 1; i < T.rotationTicks; i++) await step();
        for (const item of rotors) {
            const final = motion(item.owner.body),
                delta = multiply(final.q, conjugate(item.initial.q));
            const rotationAngle = angle(final.q, item.initial.q),
                length = Math.hypot(...delta.slice(0, 3));
            const alignment = Math.abs(delta.slice(0, 3).reduce((sum, v, i) => sum + v * item.axis[i], 0)) / length;
            const retention = Math.hypot(...final.w) / item.initialSpeed;
            const drift = sample('COM-free-three-axis', item.joint, item.reference);
            check(
                'Independent body quaternion demonstrates free axis ' + item.axis.join(','),
                rotationAngle >= T.rotationMinimumRadians &&
                    alignment >= T.rotationAxisAlignmentMinimum &&
                    item.initialSpeed >= T.freeAngularSpeedMinimum &&
                    retention >= T.angularSpeedRetentionMinimum &&
                    retention <= T.angularSpeedRetentionMaximum &&
                    drift.independentSeparation <= T.separationMetres,
                { axis: item.axis, initial: item.initial, final, rotationAngle, alignment, retention, drift },
            );
            sameFrames(state(item.joint), item.frames);
        }
        // Actual rotation preceded these geometry changes. No Node/body pose is written back by the fixture.
        const aliases = { a: anchor.pivotA, b: anchor.pivotB },
            beforeAlias = state(anchor);
        aliases.a.x += 0.13;
        aliases.b.y += 1;
        assert.equal(anchor.pivotA, aliases.a);
        assert.equal(anchor.pivotB, aliases.b);
        assert.deepEqual(state(anchor), beforeAlias, 'In-place aliases stage no request');
        anchor.enableCollision = !anchor.enableCollision;
        system.syncSceneToPhysics();
        sameFrames(state(anchor), beforeAlias);
        assert.deepEqual(state(anchor).requested, beforeAlias.requested, 'Scalar request cannot submit staged aliases');
        anchor.pivotA = aliases.a;
        let admittedPivot = point(aliases.a),
            admittedB = [900, 800, 700];
        anchorReference = capture(anchored, null, admittedPivot, admittedB);
        const preCapturePose = motion(anchored.body),
            pendingCapture = state(anchor);
        check(
            'Explicit alias setter requests recapture only at next safe commit',
            pendingCapture.pending && pendingCapture.captureVersion > pendingCapture.appliedCaptureVersion,
        );
        system.syncSceneToPhysics();
        assert.deepEqual(motion(anchored.body), preCapturePose);
        captureCheck('Explicit pivotA alias submission recaptures after real rotation', anchor, anchorReference);
        assert.equal(anchor.pivotA, aliases.a);
        assert.notDeepEqual(
            state(anchor).native.frameB,
            beforeAlias.native.frameB,
            'Changed local pivot needs a new world anchor',
        );
        anchor.pivotB = aliases.b;
        admittedB = point(aliases.b);
        anchorReference = capture(anchored, null, admittedPivot, admittedB);
        system.syncSceneToPhysics();
        captureCheck(
            'Explicit pivotB setter also requests null-B recapture despite ignored stored B geometry',
            anchor,
            anchorReference,
        );
        for (const field of ['pivotA', 'pivotB']) {
            await step(5);
            const beforeSame = state(anchor),
                bodyBefore = motion(anchored.body);
            const version = beforeSame.captureVersion;
            anchor[field] = new Vec3(...point(anchor[field]));
            const staged = state(anchor);
            check(
                'Same-value explicit ' + field + ' increments pending recapture exactly once',
                staged.pending &&
                    staged.captureVersion === version + 1 &&
                    staged.appliedCaptureVersion === beforeSame.appliedCaptureVersion,
            );
            sameFrames(staged, beforeSame);
            anchorReference = capture(anchored, null, admittedPivot, admittedB);
            system.syncSceneToPhysics();
            assert.deepEqual(motion(anchored.body), bodyBefore);
            captureCheck(
                'Same-value ' + field + ' safely captures current anchor after further real motion',
                anchor,
                anchorReference,
            );
            const committed = state(anchor);
            system.syncSceneToPhysics();
            assert.deepEqual(state(anchor), committed);
        }
        const beforeDisable = motion(anchored.body);
        anchor.enabled = false;
        system.syncSceneToPhysics();
        check(
            'Disabling removes native joint at safe point',
            state(anchor).native === null && state(anchor).state === 'disabled',
        );
        await step(T.disabledTicks);
        check(
            'Disabled body physically falls without a hidden anchor',
            distance(motion(anchored.body).p, beforeDisable.p) >= T.translationMinimumMetres,
        );
        anchor.enabled = true;
        anchorReference = capture(anchored, null, admittedPivot, admittedB);
        system.syncSceneToPhysics();
        captureCheck('Re-enable captures the current unrestrained world pivot', anchor, anchorReference);
        // Place a new real B once, before entering the Scene, with caller-defined pivots already coincident.
        const reconnectA = motion(a.body),
            replacementPivot = [-0.4, 0.1, 0.2];
        const replacementPosition = subtract(worldPivot(reconnectA, scaledPivot(a, pivotA)), replacementPivot);
        const replacement = box('live-reconnection-endpoint', replacementPosition);
        pair.connectedBody = replacement.body;
        pair.pivotB = new Vec3(...replacementPivot);
        const reconnectReference = capture(a, replacement, pivotA, replacementPivot),
            beforeReconnect = motion(a.body);
        system.syncSceneToPhysics();
        assert.deepEqual(motion(a.body), beforeReconnect);
        captureCheck('Live B reconnect admits final endpoint and pivot atomically', pair, reconnectReference);
        const reconnectFrames = state(pair);
        pair.enableCollision = true;
        system.syncSceneToPhysics();
        sameFrames(state(pair), reconnectFrames);
        assert(state(pair).native.collideConnected);
        pair.connectedBody = null;
        const worldReference = capture(a, null, pivotA, replacementPivot);
        system.syncSceneToPhysics();
        captureCheck('Live null-B reconnect captures current A world pivot', pair, worldReference);
        pair.connectedBody = replacement.body;
        system.syncSceneToPhysics();
        // Stage a different live endpoint, then retire the old committed B before safe commit.
        // Old-endpoint removal must not erase the already admitted pending replacement.
        const successorPivot = [-0.3, -0.1, 0.15];
        const successorPosition = subtract(worldPivot(motion(a.body), scaledPivot(a, pivotA)), successorPivot);
        const successor = box('pending-reconnect-survives-old-B-removal', successorPosition);
        pair.connectedBody = successor.body;
        pair.pivotB = new Vec3(...successorPivot);
        const successorReference = capture(a, successor, pivotA, successorPivot),
            endpointWorld = copiedWorld();
        assert.equal(replacement.body.destroy(), true);
        system.syncSceneToPhysics();
        captureCheck(
            'Removing committed old B preserves already admitted live pending reconnection',
            pair,
            successorReference,
        );
        check(
            'Old B retirement/reconnect safe commit does not step native simulation',
            copiedWorld().native.nativeStepIndex === endpointWorld.native.nativeStepIndex &&
                copiedWorld().state === 'ready',
        );
        await step(2);
        check(
            'Retired old endpoint retains its unrelated Node and Collider',
            !replacement.body.isValid && replacement.node.isValid && replacement.collider.isValid,
        );
        reject('Explicit dead endpoint rejects atomically', defaults, [defaultsOwner, a], () => {
            defaults.connectedBody = replacement.body;
        });
        // Ordinary Game frames retire the current requested B while the P2P component remains enabled.
        assert.equal(successor.body.destroy(), true);
        await step(2);
        check(
            'Normal Game destruction retires requested B without disabling the P2P component',
            pair.enabled &&
                state(pair).state === 'endpoint-removed' &&
                state(pair).native === null &&
                !successor.body.isValid &&
                successor.node.isValid &&
                successor.collider.isValid &&
                copiedWorld().state === 'ready',
        );
        const beforeRecovery = motion(a.body);
        pair.connectedBody = null;
        const recoveryReference = capture(a, null, pivotA, successorPivot);
        check(
            'Explicit live/null reconnection clears orphan state while still enabled',
            pair.enabled && state(pair).state === 'pending' && state(pair).pending,
        );
        system.syncSceneToPhysics();
        assert.deepEqual(motion(a.body), beforeRecovery);
        captureCheck(
            'Still-enabled orphan reconnects at safe commit without disable/enable workaround',
            pair,
            recoveryReference,
        );
        await step(2);
        const only = box('constraint-only-destruction', [35, 8, 0], { gravity: true }),
            onlyJoint = p2p(only);
        system.syncSceneToPhysics();
        const beforeOnly = motion(only.body);
        assert(onlyJoint.destroy());
        system.syncSceneToPhysics();
        assert.equal(state(onlyJoint).native, null);
        await step(15);
        check(
            'Destroying constraint alone leaves body and collider moving normally',
            !onlyJoint.isValid &&
                only.body.isValid &&
                only.collider.isValid &&
                only.node.isValid &&
                distance(motion(only.body).p, beforeOnly.p) >= T.translationMinimumMetres,
        );
        const destroyedOutcomes = getterObserver(onlyJoint).getterOutcomes,
            destroyedBefore = destroyedOutcomes();
        let destroyedError;
        try {
            onlyJoint.pivotA = new Vec3(3, 4, 5);
        } catch (error) {
            destroyedError = error;
        }
        check(
            'Destroyed component rejects setters without public cache revival',
            destroyedError?.code === 'AIR_E_BOX3D_DISPOSED',
        );
        assert.deepEqual(destroyedOutcomes(), destroyedBefore);
        const removed = box('attached-node-destruction', [40, 8, 0]),
            removedJoint = p2p(removed);
        system.syncSceneToPhysics();
        assert(removed.node.destroy());
        // Ordinary Director destruction precedes PhysicsSystem.postUpdate. Do not manually sync a ToDestroy Node.
        await step(3);
        check(
            'Attached Node and P2P follow normal deferred destruction ordering',
            !removed.node.isValid && !removedJoint.isValid && copiedWorld().state === 'ready',
        );
        const floor = box('healthy-callback-floor', [50, -0.5, 0], { type: RigidBody.Type.STATIC, size: [4, 1, 4] });
        const ballNode = new Node('healthy-callback-ball');
        ballNode.setPosition(50, 0.48, 0);
        const ballBody = ballNode.addComponent(RigidBody);
        ballBody.type = RigidBody.Type.DYNAMIC;
        ballBody.allowSleep = false;
        const ball = ballNode.addComponent(sdk.SphereCollider);
        ball.radius = 0.5;
        scene.addChild(ballNode);
        let callback = null;
        ball.once('onCollisionEnter', (event) => {
            assert.equal(event.selfCollider, ball);
            assert.equal(event.otherCollider, floor.collider);
            const prior = state(defaults);
            defaults.enableCollision = false;
            callback = { prior, staged: state(defaults), tick: tick + 1 };
        });
        for (let i = 0; i < 30 && !callback; i++) await step();
        check(
            'Real collision callback stages P2P request without immediate native mutation',
            callback?.staged.pending &&
                callback.staged.native.collideConnected === true &&
                defaults.enableCollision === false,
            callback,
        );
        await step();
        check(
            'Next ordinary tick commits callback configuration',
            !state(defaults).pending && !state(defaults).native.collideConnected,
        );
        sameFrames(state(defaults), callback.prior);
        observe('healthy-final-world', copiedWorld());
        report.healthyComplete = true;
    }
    if (!intentionalFaultObserved) beforeStep.dispose();
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
                    report.close.status === 'failed' &&
                        report.close.failures.length === 1 &&
                        report.close.failures[0].label === 'game-clock-terminal' &&
                        report.close.failures[0].message.includes('AIR_E_BOX3D_WORLD_FAULTED'),
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
                const { vectorFields, fields, referenceId, getterOutcomes } = getterObserver(postCloseJoint);
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
                    } else {
                        assert(['enableCollision', 'enabled'].includes(field));
                        candidate = current.type === 'boolean' ? !current.value : true;
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
          ? 'PASS_LIMITED_PUBLIC_POINT_TO_POINT'
          : 'PASS_EXPECTED_PUBLIC_POINT_TO_POINT_FAULT';
    report.completedAt = new Date().toISOString();
    if (failure) process.exitCode = 1;
    flush();
}
console.log(
    JSON.stringify({ status: report.status, totalSteps: tick, error: report.error ?? report.closeError ?? null }),
);
