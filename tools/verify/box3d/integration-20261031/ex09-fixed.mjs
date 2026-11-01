/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Actual production exports only. No source/test adapter, native handle, independent physics loop or pose correction.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire, registerHooks } from 'node:module';
import { root, scope, sha, verifyInputs } from './ex09-inputs.mjs';
import { expectedFaultClose } from './ex09-close-policy.mjs';
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
const BASE = 'https://box3d-public-fixed.invalid/physics/box3d/st/';
const bundle = pathToFileURL(join(artifacts, 'cocosair.module.js')).href;
const nativeModule = pathToFileURL(join(artifacts, 'physics/box3d/st/box3d-st.mjs')).href;
const report = {
    schema: 'box3d-production-esm-public-fixed-consumer-v1',
    status: 'RUNNING',
    cohortIdentity: before.lock.cohortIdentity,
    cohortCaseFamily: 'fixed',
    mode,
    scope,
    startedAt: new Date().toISOString(),
    hostBoundary:
        'Node registerHooks maps only the real production loader HTTPS native-module request to unchanged locked local bytes. JSDOM/null canvas uses real HEADLESS mode. Not ordinary browser transport or rendering evidence.',
    transport: [],
    moduleResolution: [],
    checks: [],
    observations: [],
    frames: [],
    drift: [],
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
const relativePose = (a, b) =>
    Object.freeze({
        p: Object.freeze(rotate(conjugate(b.q), subtract(a.p, b.p))),
        q: Object.freeze(multiply(conjugate(b.q), a.q)),
    });
const errorFrom = (current, reference) => ({
    linear: distance(current.p, reference.p),
    angular: angle(current.q, reference.q),
});
const framePose = (frame) => ({ p: frame.slice(0, 3), q: frame.slice(3, 7) });
const composeFrame = (origin, frame) => ({
    p: rotate(origin.q, frame.p).map((v, i) => v + origin.p[i]),
    q: multiply(origin.q, frame.q),
});
flush();
try {
    dom = new JSDOM(
        '<!doctype html><html><body><div id="GameDiv"><div id="Cocos3dGameContainer"><canvas id="GameCanvas"></canvas></div></div></body></html>',
        { url: 'https://box3d-public-fixed.invalid/', pretendToBeVisual: true, virtualConsole },
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
            if (specifier === bundle) {
                // Browser ESM .js lives inside the source repo's CommonJS package.
                // Change Node's format metadata only, never production source bytes.
                const expected = lock.runtime.find((item) => item.path === 'cocosair.module.js');
                assert.equal(sha(readFileSync(new URL(bundle))), expected.sha256);
                report.hostModuleFormat = 'exact-frozen-production-entry-loaded-as-esm';
                return { url: bundle, format: 'module', shortCircuit: true };
            }
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
        'Exact fresh runtime build, not build 211',
        sdk.AIR_BUILD_NUMBER === lock.runtimeBuildNumber && sdk.AIR_BUILD_NUMBER > 211,
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
        'FixedConstraint',
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
        physicsOptions: { box3d: { assetBaseUrl: BASE, threading: 'single', workerCount: 1, solverSubSteps: 4 } },
    });
    check(
        'Production loader uses exactly the locked matching ST assets',
        report.transport.map((entry) => entry.path).join(',') ===
            ['manifest.json', 'box3d-st.wasm', 'box3d-st.mjs'].map((name) => 'physics/box3d/st/' + name).join(',') &&
            report.moduleResolution.length === 1,
    );
    const { Node, Scene, RigidBody, BoxCollider, FixedConstraint, PhysicsSystem, Vec3 } = sdk;
    const system = PhysicsSystem.instance;
    system.enable = false;
    system.autoSimulation = true;
    system.fixedTimeStep = 1 / 60;
    system.maxSubSteps = 1;
    system.gravity = new Vec3(0, -10, 0);
    const scene = new Scene('public-fixed-' + mode);
    app.run(scene);
    clock = sdk.createStepClock({ frameRate: 60, stepTimeoutMs: 2000 });
    clock.begin();
    const step = async (count = 1, dt = 1 / 60) => {
        for (let i = 0; i < count; i++) {
            const frame = await clock.step(dt);
            tick++;
            assert.deepEqual(frame, { step: tick, dt, afterDraw: true });
            report.frames.push(frame);
        }
    };
    await step();
    const box = (name, p, gravity = false) => {
        const node = new Node(name);
        node.setPosition(...p);
        node.setRotationFromEuler(11, 23, 31);
        const body = node.addComponent(RigidBody);
        body.type = RigidBody.Type.DYNAMIC;
        body.mass = 1;
        body.allowSleep = false;
        body.linearDamping = 0;
        body.angularDamping = 0;
        body.useGravity = gravity;
        const collider = node.addComponent(BoxCollider);
        collider.size = new Vec3(0.5, 0.5, 0.5);
        scene.addChild(node);
        return { node, body, collider };
    };
    const copyDiagnostic = (value) => {
        assert(Object.isFrozen(value), 'Diagnostic must be a frozen copy');
        const n = value.native;
        if (n) assert(Object.isFrozen(n) && [n.frameA, n.frameB, n.force, n.torque].every(Object.isFrozen));
        // Project observations only; never inspect or pass native endpoint IDs to any operation.
        return {
            backend: value.backend,
            kind: value.kind,
            state: value.state,
            requestedEnabled: value.requestedEnabled,
            pending: value.pending,
            breakStep: value.breakStep,
            native: n
                ? {
                      kind: n.kind,
                      collideConnected: n.collideConnected,
                      breakForce: n.breakForce,
                      breakTorque: n.breakTorque,
                      frameA: [...n.frameA],
                      frameB: [...n.frameB],
                      force: [...n.force],
                      torque: [...n.torque],
                      linearSeparation: n.linearSeparation,
                      angularSeparation: n.angularSeparation,
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
        for (const key of ['p', 'q', 'com', 'v', 'w']) Object.freeze(result[key]);
        return Object.freeze(result);
    };
    const capturedFrames = (name, jointState, originA, originB = null) => {
        const worldA = composeFrame(originA, framePose(jointState.native.frameA));
        const worldB = originB
            ? composeFrame(originB, framePose(jointState.native.frameB))
            : framePose(jointState.native.frameB);
        const dynamicA = originA.type === 2,
            dynamicB = originB?.type === 2;
        const expectedPosition =
            dynamicA !== dynamicB
                ? dynamicA
                    ? originA.com
                    : originB.com
                : originA.com.map((v, i) => (v + (originB?.com[i] ?? 0)) / 2);
        check(
            name,
            jointState.state === 'connected' &&
                distance(worldA.p, worldB.p) < 0.0001 &&
                angle(worldA.q, worldB.q) < 0.0001 &&
                distance(worldA.p, expectedPosition) < 0.0001 &&
                angle(worldA.q, originA.q) < 0.0001,
            { originA, originB, worldA, worldB, expectedPosition, state: jointState },
        );
    };
    const caches = (joint) => ({
        connectedBody: joint.connectedBody,
        enableCollision: joint.enableCollision,
        breakForce: joint.breakForce,
        breakTorque: joint.breakTorque,
        enabled: joint.enabled,
    });
    const reject = (name, joint, action, code = 'AIR_E_BOX3D_CONFIG', readNative = true) => {
        const previous = caches(joint),
            native = readNative ? state(joint) : null;
        let caught;
        try {
            action();
        } catch (error) {
            caught = error;
        }
        check(
            name + ' rejects with expected error, never recursion RangeError',
            caught &&
                !(caught instanceof RangeError) &&
                (typeof code === 'function' ? caught instanceof code : caught.code === code),
            caught ? { name: caught.name, code: caught.code, message: caught.message } : null,
        );
        assert.deepEqual(caches(joint), previous, name + ' changed public caches');
        if (readNative) assert.deepEqual(state(joint), native, name + ' changed native/pending state');
    };
    const fixed = (owner, connected = null) => {
        const joint = owner.node.addComponent(FixedConstraint);
        joint.enabled = false;
        joint.connectedBody = connected;
        joint.enableCollision = false;
        joint.breakForce = 1e8;
        joint.breakTorque = 1e8;
        joint.enabled = true;
        return joint;
    };
    const anchored = box('anchored', [-6, 3, 0], true);
    const anchor = fixed(anchored);
    // Independent actual body-origin capture before any safe native commit.
    const anchorReference = motion(anchored.body);
    postCloseJoint = anchor;
    postCloseBody = anchored.body;
    system.enable = true;
    await step();
    check(
        'Actual Fixed adapter commits native weld',
        state(anchor).state === 'connected' && state(anchor).native?.kind === 'fixed',
        state(anchor),
    );
    capturedFrames(
        'Anchored local frames compose to the common world frame captured before commit',
        state(anchor),
        anchorReference,
    );
    if (mode === 'idle-enabled-reentry') {
        let armed = false,
            calls = 0,
            innerError,
            outerError;
        class ReenteringFixed extends FixedConstraint {
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
        const target = box('idle-reentry-subclass', [2, 3, 0]);
        postCloseBody = target.body;
        const joint = target.node.addComponent(ReenteringFixed);
        await step();
        check('Public Fixed subclass initially commits an ordinary native weld', state(joint).state === 'connected');
        armed = true;
        // Direct idle public setter, not a before-step/collision callback or adapter invocation.
        try {
            joint.enabled = false;
        } catch (error) {
            outerError = error;
        }
        check(
            'Caught recursive enabled request poisons the exact original idle activity operation',
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
            'Partially published idle activity failure faults instead of fictional rollback',
            anchor,
            () => {
                anchor.breakForce = 999;
            },
            'AIR_E_BOX3D_WORLD_FAULTED',
            false,
        );
    } else if (mode === 'intentional-fault') {
        const floorNode = new Node('intentional-fault-floor');
        floorNode.setPosition(0, -0.5, 0);
        floorNode.addComponent(RigidBody).type = RigidBody.Type.STATIC;
        floorNode.addComponent(BoxCollider).size = new Vec3(8, 1, 8);
        scene.addChild(floorNode);
        const ballNode = new Node('intentional-fault-sphere');
        ballNode.setPosition(0, 2, 0);
        const ballBody = ballNode.addComponent(RigidBody);
        postCloseBody = ballBody;
        ballBody.type = RigidBody.Type.DYNAMIC;
        ballBody.mass = 1;
        ballBody.allowSleep = false;
        const ball = ballNode.addComponent(sdk.SphereCollider);
        ball.radius = 0.5;
        scene.addChild(ballNode);
        const marker = new Error('intentional-public-fixed-collision-callback-fault');
        let calls = 0,
            caught;
        ball.once('onCollisionEnter', () => {
            calls++;
            anchor.breakForce = 4321;
            throw marker;
        });
        try {
            for (let i = 0; i < 90 && calls === 0; i++) await step();
        } catch (error) {
            caught = error;
        }
        check(
            'Isolated deliberate fault preserves original thrown callback identity',
            caught === marker && calls === 1,
            { calls, message: caught?.message, code: caught?.code ?? null },
        );
        check(
            'Real collision callback accepts staged Fixed configuration before its intentional throw',
            anchor.breakForce === 4321,
        );
        intentionalFaultObserved = true;
        reject(
            'Faulted world refuses Fixed threshold before cache write',
            anchor,
            () => {
                anchor.breakForce = 999;
            },
            'AIR_E_BOX3D_WORLD_FAULTED',
            false,
        );
    } else {
        const a = box('pair-a', [2, 3, 0]),
            b = box('pair-b', [4, 3, 0]),
            unused = box('unused-target', [9, 3, 0]);
        postCloseBody = b.body;
        const pair = a.node.addComponent(FixedConstraint);
        const assembly = [state(pair)];
        pair.enabled = false;
        assembly.push(state(pair));
        pair.connectedBody = unused.body;
        assembly.push(state(pair));
        pair.connectedBody = b.body;
        pair.enableCollision = false;
        pair.breakForce = 1e8;
        pair.breakTorque = 1e8;
        assembly.push(state(pair));
        pair.enabled = true;
        assembly.push(state(pair));
        check(
            'Same-turn add-disable-configure-enable has no native weld at the sampled public boundaries',
            assembly.every((entry) => entry.native === null) && pair.connectedBody === b.body,
            assembly,
        );
        const beforePairA = motion(a.body),
            beforePairB = motion(b.body);
        const pairReference = relativePose(beforePairA, beforePairB);
        await step();
        // Retain the actual SDK object, not just a fixture-created projection of it.
        const retainedSdkSnapshot = sdk.readBox3DConstraintState(pair);
        const firstPair = copyDiagnostic(retainedSdkSnapshot);
        capturedFrames(
            'First committed local frames coincide using only the final connected body',
            firstPair,
            beforePairA,
            beforePairB,
        );
        // Freeze the independent expected projection so later checks cannot follow SDK mutations.
        for (const value of Object.values(firstPair.native)) if (Array.isArray(value)) Object.freeze(value);
        Object.freeze(firstPair.native);
        const expectedRetainedSnapshot = Object.freeze(firstPair);
        pair.breakForce = 1234.25;
        pair.breakTorque = 4321.5;
        pair.enableCollision = true;
        const requested = state(pair);
        check(
            'Live setters update caches but stage native writes until safe sync',
            pair.breakForce === 1234.25 &&
                pair.breakTorque === 4321.5 &&
                pair.enableCollision === true &&
                requested.pending &&
                requested.native.breakForce === 1e8 &&
                requested.native.breakTorque === 1e8 &&
                requested.native.collideConnected === false,
            requested,
        );
        await step();
        const applied = state(pair);
        check(
            'Safe sync native readback matches thresholds and collision cache without frame recapture',
            !applied.pending &&
                applied.native.breakForce === 1234.25 &&
                applied.native.breakTorque === 4321.5 &&
                applied.native.collideConnected === true &&
                JSON.stringify(applied.native.frameA) === JSON.stringify(firstPair.native.frameA) &&
                JSON.stringify(applied.native.frameB) === JSON.stringify(firstPair.native.frameB),
            applied,
        );
        check(
            'Retained original SDK snapshot does not track changed live native configuration',
            JSON.stringify(copyDiagnostic(retainedSdkSnapshot)) === JSON.stringify(expectedRetainedSnapshot),
            {
                expected: expectedRetainedSnapshot,
                retainedSdkObservations: copyDiagnostic(retainedSdkSnapshot),
                applied,
            },
        );
        for (const field of ['breakForce', 'breakTorque'])
            for (const value of [NaN, Infinity, -Infinity, -1, -Number.MIN_VALUE, Number.MAX_VALUE])
                reject(field + '=' + String(value), pair, () => {
                    pair[field] = value;
                });
        for (const value of [1, 'true', null])
            reject('nonboolean enableCollision=' + String(value), pair, () => {
                pair.enableCollision = value;
            });
        for (const value of [1, 'true', null])
            reject(
                'nonboolean enabled=' + String(value),
                pair,
                () => {
                    pair.enabled = value;
                },
                TypeError,
            );
        const foreignNode = new Node('uninitialized-endpoint');
        const foreignBody = foreignNode.addComponent(RigidBody);
        for (const [label, body] of [
            ['self', a.body],
            ['plain-object', {}],
            ['uninitialized', foreignBody],
        ])
            reject('invalid endpoint ' + label, pair, () => {
                pair.connectedBody = body;
            });
        check('Endpoint destruction is requested before deferred flush', unused.body.destroy() === true);
        reject('connected ToDestroy endpoint', pair, () => {
            pair.connectedBody = unused.body;
        });
        await step();
        reject('already-destroyed endpoint', pair, () => {
            pair.connectedBody = unused.body;
        });
        foreignNode.destroy();
        pair.breakForce = 1e8;
        pair.breakTorque = 1e8;
        pair.enableCollision = false;
        await step();
        a.body.setLinearVelocity(new Vec3(0.4, 0.1, 0.1));
        b.body.setLinearVelocity(new Vec3(0.4, 0.1, 0.1));
        const startA = motion(a.body);
        for (let i = 0; i < 600; i++) {
            if (i % 60 === 0) {
                anchored.body.applyImpulse(new Vec3(0.1, 0.05, 0));
                anchored.body.applyTorque(new Vec3(0.03, 0, 0));
                a.body.applyForce(new Vec3(0.05, 0.02, 0));
                a.body.applyTorque(new Vec3(0, 0.08, 0.02));
            }
            await step();
            const ma = motion(a.body),
                mb = motion(b.body),
                mh = motion(anchored.body);
            const ps = state(pair),
                hs = state(anchor);
            assert.equal(ps.state, 'connected');
            assert.equal(hs.state, 'connected');
            const pairError = errorFrom(relativePose(ma, mb), pairReference),
                anchorError = errorFrom(mh, anchorReference);
            report.drift.push({
                tick,
                pairError,
                anchorError,
                pairNative: [ps.native.linearSeparation, ps.native.angularSeparation],
                anchorNative: [hs.native.linearSeparation, hs.native.angularSeparation],
                pairA: ma,
                pairB: mb,
                anchored: mh,
            });
            for (const value of [
                pairError.linear,
                pairError.angular,
                anchorError.linear,
                anchorError.angular,
                Math.abs(ps.native.linearSeparation),
                Math.abs(ps.native.angularSeparation),
                Math.abs(hs.native.linearSeparation),
                Math.abs(hs.native.angularSeparation),
            ]) {
                if (!Number.isFinite(value) || value > 0.02) {
                    flush();
                    assert.fail('600-tick drift exceeds 0.02 m/rad');
                }
            }
            if (i % 60 === 59) flush();
        }
        check(
            '600 actual anchored and moving two-dynamic weld samples stay within 0.02 m and 0.02 rad',
            report.drift.length === 600,
            { samples: report.drift.length },
        );
        check(
            'Two-dynamic weld really translates and rotates under public physical commands',
            distance(motion(a.body).p, startA.p) > 0.1 && angle(motion(a.body).q, startA.q) > 0.02,
            { start: startA, end: motion(a.body) },
        );
        check(
            'Retained original SDK diagnostic observations remain unchanged across native updates and 600 ticks',
            JSON.stringify(copyDiagnostic(retainedSdkSnapshot)) === JSON.stringify(expectedRetainedSnapshot),
            { expected: expectedRetainedSnapshot, retainedSdkObservations: copyDiagnostic(retainedSdkSnapshot) },
        );
        anchor.enabled = false;
        await step();
        check(
            'Disable retires the real weld at safe sync',
            state(anchor).state === 'disabled' && state(anchor).native === null,
        );
        const priorAnchor = motion(anchored.body);
        anchored.body.applyImpulse(new Vec3(0.3, 0, 0));
        await step(15);
        const releasedAnchor = motion(anchored.body);
        check(
            'Disabled attached dynamic body moves physically, without pose assignment',
            distance(priorAnchor.p, releasedAnchor.p) > 0.05,
            { priorAnchor, releasedAnchor },
        );
        anchor.enabled = true;
        await step();
        const recaptured = motion(anchored.body),
            recapturedState = state(anchor);
        capturedFrames(
            'Re-enabled frames capture the current world frame before commit',
            recapturedState,
            releasedAnchor,
        );
        check(
            'Re-enable captures current pose rather than restoring old anchor',
            distance(recaptured.p, releasedAnchor.p) <= 0.02 && distance(recaptured.p, anchorReference.p) > 0.05,
            { releasedAnchor, recaptured, state: recapturedState },
        );
        await step(60);
        const recaptureError = errorFrom(motion(anchored.body), releasedAnchor);
        check(
            'Recaptured anchor remains welded for subsequent real ticks',
            recaptureError.linear <= 0.02 && recaptureError.angular <= 0.02,
            recaptureError,
        );
        const beforeReconnect = motion(a.body);
        pair.connectedBody = null;
        check(
            'Live connection change remains staged',
            pair.connectedBody === null && state(pair).pending && state(pair).native !== null,
        );
        await step();
        capturedFrames(
            'Null reconnect local frames compose to the actual captured world frame',
            state(pair),
            beforeReconnect,
        );
        check(
            'Null reconnect captures actual current world pose',
            state(pair).state === 'connected' &&
                distance(motion(a.body).p, beforeReconnect.p) <= 0.02 &&
                angle(motion(a.body).q, beforeReconnect.q) <= 0.02,
            state(pair),
        );
        for (const kind of ['force', 'torque']) {
            const body = box('break-' + kind, [kind === 'force' ? -12 : -16, 3, 0]);
            const joint = fixed(body);
            await step();
            const load = () =>
                kind === 'force' ? body.body.applyForce(new Vec3(20, 0, 0)) : body.body.applyTorque(new Vec3(0, 20, 0));
            load();
            await step();
            check(kind + ' high threshold does not break', state(joint).state === 'connected');
            joint[kind === 'force' ? 'breakForce' : 'breakTorque'] = 0.01;
            for (let i = 0; i < 8 && state(joint).state !== 'broken'; i++) {
                load();
                await step();
            }
            const broken = state(joint);
            check(
                'Actual native ' + kind + ' threshold latches broken and releases the weld',
                broken.state === 'broken' &&
                    broken.native === null &&
                    Number.isInteger(broken.breakStep) &&
                    broken.breakStep > 0,
                broken,
            );
            joint.breakForce = 1e8;
            joint.breakTorque = 1e8;
            joint.enableCollision = !joint.enableCollision;
            joint.connectedBody = null;
            joint.enabled = true;
            await step(4);
            check(
                kind + ' parameter changes and redundant enabled=true cannot revive broken weld',
                state(joint).state === 'broken' &&
                    state(joint).native === null &&
                    state(joint).breakStep === broken.breakStep,
                state(joint),
            );
            joint.enabled = false;
            await step();
            joint.enabled = true;
            await step();
            check(
                kind + ' explicit disable-enable reconnects and clears the broken latch',
                state(joint).state === 'connected' && state(joint).breakStep === null,
                state(joint),
            );
        }
        const left = box('connected-deletion-a', [12, 3, 0]),
            right = box('connected-deletion-b', [14, 3, 0]);
        const endpointJoint = fixed(left, right.body);
        await step();
        check('Destroy connected RigidBody while Collider keeps the Node alive', right.body.destroy() === true);
        observe('connected-body-immediately-after-destroy-before-clock-flush', state(endpointJoint));
        check(
            'Idle destroyed endpoint is still awaiting the normal deferred destruction flush',
            right.body.isValid && right.node.getComponent(RigidBody) === right.body,
        );
        // Public safe sync, deliberately BEFORE any Director/game-frame destruction flush.
        system.syncSceneToPhysics();
        check(
            'Public idle safe sync retires ToDestroy endpoint without waiting for Director flush',
            state(endpointJoint).state === 'endpoint-removed' &&
                state(endpointJoint).native === null &&
                right.body.isValid &&
                right.node.getComponent(RigidBody) === right.body,
            state(endpointJoint),
        );
        await step();
        check(
            'Connected ToDestroy endpoint retires before next native step without fault',
            state(endpointJoint).state === 'endpoint-removed' &&
                state(endpointJoint).native === null &&
                right.node.isValid &&
                right.collider.isValid,
            state(endpointJoint),
        );
        await step(4);
        endpointJoint.enabled = false;
        reject('Cannot enable a dead-endpoint joint', endpointJoint, () => {
            endpointJoint.enabled = true;
        });
        await step(2);
        check(
            'Pre-cache invalid enable preserves a healthy executable world',
            state(anchor).state === 'connected' &&
                state(endpointJoint).native === null &&
                endpointJoint.enabled === false,
        );
        const callbackLeft = box('callback-deletion-a', [26, 3, 0], true),
            callbackRight = box('callback-deletion-b', [28, 3, 0]);
        const callbackJoint = fixed(callbackLeft, callbackRight.body);
        system.syncSceneToPhysics();
        check(
            'Callback test begins with an actual committed two-body Fixed weld',
            state(callbackJoint).state === 'connected',
        );
        const callbackFloorNode = new Node('callback-deletion-floor');
        callbackFloorNode.setPosition(32, -0.5, 0);
        callbackFloorNode.addComponent(RigidBody).type = RigidBody.Type.STATIC;
        const callbackFloor = callbackFloorNode.addComponent(BoxCollider);
        callbackFloor.size = new Vec3(4, 1, 4);
        scene.addChild(callbackFloorNode);
        const callbackBallNode = new Node('callback-deletion-sphere');
        callbackBallNode.setPosition(32, 0.48, 0);
        const callbackBallBody = callbackBallNode.addComponent(RigidBody);
        callbackBallBody.type = RigidBody.Type.DYNAMIC;
        callbackBallBody.mass = 1;
        callbackBallBody.allowSleep = false;
        const callbackBall = callbackBallNode.addComponent(sdk.SphereCollider);
        callbackBall.radius = 0.5;
        scene.addChild(callbackBallNode);
        let contactEnters = 0;
        const primeEnter = (event) => {
            assert.equal(event.selfCollider, callbackBall);
            assert.equal(event.otherCollider, callbackFloor);
            contactEnters++;
        };
        callbackBall.on('onCollisionEnter', primeEnter);
        for (let i = 0; i < 30 && contactEnters === 0; i++) await step();
        check('Real sphere-box contact is established before the multistep destruction frame', contactEnters === 1);
        await step(2);
        const nativeTicks = [];
        let callbackDeletion = null;
        const beforeStep = sdk.registerBox3DBeforeStep((context) => {
            nativeTicks.push({
                frame: tick + 1,
                context: { ...context },
                survivor: motion(callbackLeft.body),
                joint: state(callbackJoint),
            });
        });
        callbackBall.once('onCollisionStay', (event) => {
            assert.equal(event.selfCollider, callbackBall);
            assert.equal(event.otherCollider, callbackFloor);
            const current = nativeTicks.at(-1);
            assert(current, 'Collision must follow a real owner before-step context');
            callbackDeletion = {
                frame: tick + 1,
                nativeTick: current.context.tickIndex,
                eventType: event.type,
                destroyAccepted: callbackRight.body.destroy(),
            };
        });
        system.maxSubSteps = 2;
        const multiFrame = tick + 1;
        await step(1, 1 / 30);
        const afterMultiFrame = motion(callbackLeft.body),
            retiredInFrame = state(callbackJoint);
        observe('callback-destroy-and-next-native-tick-in-one-game-frame', {
            multiFrame,
            callbackDeletion,
            nativeTicks,
            afterMultiFrame,
            retiredInFrame,
        });
        check(
            'Real collision callback destroys connected endpoint during the first native tick of one Game frame',
            callbackDeletion?.eventType === 'onCollisionStay' &&
                callbackDeletion.destroyAccepted === true &&
                callbackDeletion.frame === multiFrame &&
                nativeTicks.length === 2 &&
                nativeTicks[0].frame === multiFrame &&
                nativeTicks[1].frame === multiFrame &&
                nativeTicks[0].context.tickIndex === callbackDeletion.nativeTick &&
                nativeTicks[1].context.tickIndex === callbackDeletion.nativeTick + 1 &&
                nativeTicks[1].context.attemptId === nativeTicks[0].context.attemptId + 1,
            { callbackDeletion, nativeTicks },
        );
        check(
            'Next native tick in that SAME frame observes retired weld and completes real survivor motion',
            nativeTicks[0].joint.state === 'connected' &&
                nativeTicks[1].joint.state === 'endpoint-removed' &&
                nativeTicks[1].joint.native === null &&
                retiredInFrame.state === 'endpoint-removed' &&
                retiredInFrame.native === null &&
                distance(afterMultiFrame.p, nativeTicks[1].survivor.p) > 0.000001 &&
                report.frames.at(-1).step === multiFrame &&
                report.frames.at(-1).dt === 1 / 30 &&
                report.frames.at(-1).afterDraw,
            { beforeSecondNativeTick: nativeTicks[1], afterMultiFrame, frame: report.frames.at(-1) },
        );
        beforeStep.dispose();
        callbackBall.off('onCollisionEnter', primeEnter);
        system.maxSubSteps = 1;
        await step(2);
        check(
            'Callback endpoint deletion also survives subsequent normal frames',
            state(callbackJoint).native === null &&
                callbackLeft.body.isValid &&
                callbackRight.collider.isValid &&
                callbackRight.node.isValid,
        );
        const only = box('component-only-destroy', [18, 3, 0], true),
            onlyJoint = fixed(only);
        await step();
        const beforeOnly = motion(only.body);
        check('Destroy only FixedConstraint component', onlyJoint.destroy() === true);
        await step(15);
        check(
            'Constraint-only destroy retains live body and collider, permits gravity motion',
            only.body.isValid &&
                only.collider.isValid &&
                only.node.isValid &&
                distance(motion(only.body).p, beforeOnly.p) > 0.05,
            { before: beforeOnly, after: motion(only.body) },
        );
        reject(
            'Destroyed component setter keeps caches',
            onlyJoint,
            () => {
                onlyJoint.breakForce = 700;
            },
            'AIR_E_BOX3D_DISPOSED',
            false,
        );
        const attached = box('attached-node-destroy', [22, 3, 0]),
            attachedJoint = fixed(attached);
        await step();
        check('Destroy attached endpoint Node', attached.node.destroy() === true);
        await step(4);
        check(
            'Attached endpoint and constraint follow ordinary deferred destruction',
            !attached.node.isValid && !attachedJoint.isValid,
        );
        observe('healthy-final-surviving-fixed', state(anchor));
        report.healthyComplete = true;
    }
    report.postCloseCaches = {
        breakForce: postCloseJoint.breakForce,
        breakTorque: postCloseJoint.breakTorque,
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
                    'Deliberate fault reports only exact guarded close stages and verified zero terminal resources',
                    expectedFaultClose(report.close, intentionalFaultObserved),
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
                for (const [field, value] of [
                    ['breakForce', postCloseJoint.breakForce === 700 ? 701 : 700],
                    ['breakTorque', postCloseJoint.breakTorque === 800 ? 801 : 800],
                    ['enableCollision', !postCloseJoint.enableCollision],
                    ['connectedBody', postCloseJoint.connectedBody === null ? postCloseBody : null],
                    ['enabled', !postCloseJoint.enabled],
                ]) {
                    const prior = postCloseJoint[field];
                    assert.notEqual(value, prior, 'Post-close oracle must attempt a distinct cache value: ' + field);
                    let caught;
                    try {
                        postCloseJoint[field] = value;
                    } catch (error) {
                        caught = error;
                    }
                    check(
                        'Post-close ' + field + ' rejects before cache write and without RangeError',
                        caught &&
                            !(caught instanceof RangeError) &&
                            caught.code === 'AIR_E_BOX3D_DISPOSED' &&
                            postCloseJoint[field] === prior,
                        caught ? { name: caught.name, code: caught.code, message: caught.message } : null,
                    );
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
          ? 'PASS_LIMITED_PUBLIC_FIXED'
          : 'PASS_EXPECTED_PUBLIC_FIXED_FAULT';
    report.completedAt = new Date().toISOString();
    if (failure) process.exitCode = 1;
    flush();
}
console.log(
    JSON.stringify({ status: report.status, totalSteps: tick, error: report.error ?? report.closeError ?? null }),
);
