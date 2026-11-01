/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Public production ESM only. Host DOM/URL adaptation does not alter engine or native behavior.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire, registerHooks } from 'node:module';
import { root, lock, sha, verifyInputs } from '../../cohort-v1/inputs.mjs';
import { createPublicBeforeStepRegistrar } from '../public-producer-phase.mjs';
import { proveBoxSupportPair, evaluateBoxSupportPairs } from './box-support-policy.mjs';
const [artifactArgument, outputArgument] = process.argv.slice(2);
const artifacts = resolve(artifactArgument),
    out = resolve(outputArgument);
const raw = join(out, 'consumer.raw.json');
assert(!existsSync(raw));
const before = verifyInputs(artifacts);
const require = createRequire(join(root, 'package.json'));
const { JSDOM, VirtualConsole } = require('jsdom');
const BASE = 'https://box3d-production-esm.invalid/physics/box3d/st/';
const bundle = pathToFileURL(join(artifacts, 'cocosair.module.js')).href;
const nativeModule = pathToFileURL(join(artifacts, 'physics/box3d/st/box3d-st.mjs')).href;
const report = {
    schema: 'box3d-production-esm-public-query-target-support-v1',
    status: 'RUNNING',
    cohortIdentity: lock.cohortIdentity,
    cohortCaseFamily: 'query',
    scope: lock.scope,
    hostBoundary:
        'Node v24 does not natively load HTTPS ESM. Official registerHooks resolves only the exact requested Box3D module URL to unchanged frozen local bytes. This is not ordinary browser loading evidence.',
    startedAt: new Date().toISOString(),
    transport: [],
    moduleResolution: [],
    checks: [],
    events: [],
    querySamples: [],
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
    check('Exact shared cohort runtime build', sdk.AIR_BUILD_NUMBER === lock.runtimeBuildNumber, sdk.AIR_BUILD_NUMBER);
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
    const { Node, Scene, RigidBody, BoxCollider, SphereCollider, CapsuleCollider, PhysicsSystem, Vec3 } = sdk;
    const query = sdk.queryBox3DCommittedColliders;
    const ray = sdk.queryBox3DCommittedRay;
    const makeTarget = sdk.createBox3DKinematicTarget;
    check(
        'Query, ray, target and before-step are ordinary production exports',
        [query, ray, makeTarget, sdk.registerBox3DBeforeStep, sdk.readBox3DBodyMotion].every(
            (v) => typeof v === 'function',
        ),
    );
    const options = Object.freeze({ group: -1, mask: -1, queryTrigger: false });
    const near = (name, actual, expected, tolerance = 0.01) =>
        check(name, Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, {
            actual,
            expected,
            tolerance,
        });
    const reject = (name, action) => {
        let error;
        try {
            action();
        } catch (value) {
            error = value;
        }
        check(name, error instanceof Error, { code: error?.code ?? null, message: error?.message ?? null });
    };
    const copy = (value) =>
        JSON.parse(
            JSON.stringify(value, (key, v) => (['collider', 'queryCollider'].includes(key) ? (v?.node?.name ?? v) : v)),
        );
    const system = PhysicsSystem.instance;
    system.enable = false;
    system.autoSimulation = true;
    system.fixedTimeStep = 0.1;
    system.maxSubSteps = 1;
    system.gravity = new Vec3();
    const scene = new Scene('cohort-production-query-target-support');
    app.run(scene);
    clock = sdk.createStepClock({ frameRate: 10, stepTimeoutMs: 2000 });
    clock.begin();
    const step = async () => {
        tick++;
        const frame = await clock.step(0.1);
        assert.deepEqual(frame, { step: tick, dt: 0.1, afterDraw: true });
        report.frames.push(frame);
    };
    const sphere = (name, x, y = 0, z = 0, radius = 0.2, scale = 1, centerX = 0) => {
        const node = new Node(name);
        node.setPosition(x, y, z);
        node.setScale(scale, scale, scale);
        const body = node.addComponent(RigidBody);
        body.type = RigidBody.Type.KINEMATIC;
        body.useGravity = false;
        const collider = node.addComponent(SphereCollider);
        collider.radius = radius;
        collider.center = new Vec3(centerX, 0, 0);
        scene.addChild(node);
        return { node, body, collider };
    };
    const box = (name, p, size) => {
        const node = new Node(name);
        node.setPosition(...p);
        const body = node.addComponent(RigidBody);
        body.type = RigidBody.Type.STATIC;
        const collider = node.addComponent(BoxCollider);
        collider.size = new Vec3(...size);
        scene.addChild(node);
        return { node, body, collider };
    };
    const head = sphere('head', 0),
        held = sphere('held-offset', 1, 0, 0, 0.25, 2, 0.25),
        wall = box('wall', [5, 0, 0], [1, 40, 40]);
    system.syncSceneToPhysics();
    const group = [head.collider, held.collider],
        translation = { x: 10, y: 0, z: 0 };
    reject('Forged context rejected', () => query({ tickIndex: 1, attemptId: 1 }, group, translation, options));
    const retained = [];
    let lastContext;
    const beforeStep = createPublicBeforeStepRegistrar(sdk, system);
    const hook = beforeStep((context) => {
        reject('Cloned context rejected', () => query({ ...context }, group, translation, options));
        if (lastContext) reject('Prior tick context rejected', () => query(lastContext, group, translation, options));
        lastContext = context;
        const sight = ray(context, { x: 0, y: 0, z: 0 }, translation, options);
        check(
            'Complete committed ray ordered real collider roster',
            sight.complete && sight.hits.map((h) => h.collider.node.name).join(',') === 'head,held-offset,wall',
        );
        sight.hits.forEach((hit, i) => near('Ray analytic distance ' + i, hit.distance, [0, 1, 4.5][i]));
        const result = query(context, group, translation, options);
        check(
            'Complete two-child committed group and epoch',
            result.complete &&
                result.children.length === 2 &&
                result.tickIndex === context.tickIndex &&
                result.attemptId === context.attemptId,
        );
        check(
            'Scaled offset collider uses committed center and radius',
            result.children[1].origin.x === 1.5 && result.children[1].dimensions[0] === 0.5,
        );
        check(
            'Self filtered and all held children sweep wall',
            result.hits.length === 2 &&
                result.hits.every((h) => h.collider === wall.collider && group.includes(h.queryCollider)),
        );
        near('Held child analytic wall distance', result.hits[0].distance, 2.5);
        near('Head analytic wall distance', result.hits[1].distance, 4.3);
        near('Nearest swept distance', result.nearestDistance, 2.5);
        check(
            'Copied snapshot is frozen',
            Object.isFrozen(result) &&
                Object.isFrozen(result.children) &&
                Object.isFrozen(result.hits) &&
                Object.isFrozen(result.translation) &&
                result.hits.every((h) => Object.isFrozen(h) && Object.isFrozen(h.point) && Object.isFrozen(h.normal)),
        );
        const frozen = copy(result);
        retained.push({ original: result, copy: frozen });
        const zero = query(context, group, { x: 0, y: 0, z: 0 }, options);
        check(
            'Zero translation retains children without fabricated sweep hits',
            zero.complete && zero.children.length === 2 && zero.hits.length === 0 && zero.nearestDistance === null,
        );
        reject('Invalid group rejected', () => query(context, [head.collider, {}], translation, options));
        reject('Nonfinite translation rejected', () => query(context, group, { x: NaN, y: 0, z: 0 }, options));
        report.querySamples.push({ sweep: frozen, ray: copy(sight), zero: copy(zero) });
        flush();
    });
    system.enable = true;
    await step();
    await step();
    hook.dispose();
    reject('Expired context rejected outside owner callback', () => query(lastContext, group, translation, options));
    check(
        'Native step epoch advances across actual public clock ticks',
        report.querySamples[1].sweep.nativeStepIndex > report.querySamples[0].sweep.nativeStepIndex,
    );
    const largeBoxNode = new Node('large-offset-box');
    largeBoxNode.setPosition(-1e6, 10, 0);
    const largeBoxBody = largeBoxNode.addComponent(RigidBody);
    largeBoxBody.type = RigidBody.Type.KINEMATIC;
    const largeBox = largeBoxNode.addComponent(BoxCollider);
    largeBox.center = new Vec3(1e6, 0, 0);
    largeBox.size = new Vec3(0.08, 0.2, 0.2);
    scene.addChild(largeBoxNode);
    const largeCapsuleNode = new Node('large-offset-capsule');
    largeCapsuleNode.setPosition(-1e6, -10, 0);
    const largeCapsuleBody = largeCapsuleNode.addComponent(RigidBody);
    largeCapsuleBody.type = RigidBody.Type.KINEMATIC;
    const largeCapsule = largeCapsuleNode.addComponent(CapsuleCollider);
    largeCapsule.center = new Vec3(1e6, 0, 0);
    largeCapsule.radius = 0.1;
    largeCapsule.cylinderHeight = 0.08;
    largeCapsule.direction = 0;
    scene.addChild(largeCapsuleNode);
    system.syncSceneToPhysics();
    const largeHook = beforeStep((context) => {
        const result = query(context, [largeBox, largeCapsule], translation, options);
        check(
            'Large offset admitted endpoints use canonical float32 half extent',
            result.children[0].dimensions[0] === 0.0625 && result.children[1].dimensions[1] === 0.0625,
        );
        near(
            'Quantized box analytic wall distance',
            result.hits.find((h) => h.queryCollider === largeBox && h.collider === wall.collider)?.distance,
            4.4375,
        );
        near(
            'Quantized capsule analytic wall distance',
            result.hits.find((h) => h.queryCollider === largeCapsule && h.collider === wall.collider)?.distance,
            4.3375,
        );
        report.largeOffset = copy(result);
        flush();
    });
    await step();
    largeHook.dispose();
    const blocker = sphere('external-overlap', 0, 0, 0, 0.25);
    system.syncSceneToPhysics();
    const overlapHook = beforeStep((context) => {
        const result = query(context, group, { x: 0, y: 0, z: 0 }, options);
        check(
            'Zero sweep reports real external overlap and excludes self roster',
            result.initialOverlap &&
                result.hits.length === 0 &&
                result.overlaps.some((p) => p.queryCollider === head.collider && p.collider === blocker.collider) &&
                result.overlaps.every((p) => !group.includes(p.collider)),
        );
        report.overlap = copy(result);
        flush();
    });
    await step();
    overlapHook.dispose();
    const moving = sphere('target-body', 30),
        dynamic = sphere('invalid-dynamic', 40);
    dynamic.body.type = RigidBody.Type.DYNAMIC;
    system.syncSceneToPhysics();
    reject('Dynamic target owner rejected', () => makeTarget(dynamic.body));
    const target = makeTarget(moving.body);
    reject('Duplicate target owner rejected', () => makeTarget(moving.body));
    const beforeTarget = sdk.readBox3DBodyMotion(moving.body);
    const targetHook = beforeStep(() => {
        target.setTarget({ position: { x: 30.1, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } });
        check(
            'Target submission does not immediately overwrite copied position',
            sdk.readBox3DBodyMotion(moving.body).position.x === beforeTarget.position.x,
        );
    });
    await step();
    targetHook.dispose();
    const afterTarget = sdk.readBox3DBodyMotion(moving.body),
        dt = Math.fround(0.1),
        substeps = 4,
        h = dt / substeps,
        damping = Math.fround(moving.body.linearDamping),
        factor = 1 / (1 + h * damping),
        velocity = (Math.fround(30.1) - beforeTarget.position.x) / dt;
    const sum = factor === 1 ? substeps : (factor * (1 - factor ** substeps)) / (1 - factor),
        predictedX = beforeTarget.position.x + h * velocity * sum;
    report.target = {
        before: copy(beforeTarget),
        after: copy(afterTarget),
        requestedX: 30.1,
        admittedTargetX: Math.fround(30.1),
        admittedDt: dt,
        substeps,
        damping,
        predictedX,
    };
    flush();
    near('Independent damped target geometric-series prediction', afterTarget.position.x, predictedX, 0.00001);
    check('Target produces real native displacement', afterTarget.position.x !== beforeTarget.position.x);
    target.clear();
    await step();
    const afterClear = sdk.readBox3DBodyMotion(moving.body);
    report.target.afterClear = copy(afterClear);
    check(
        'Target clear zeros paired linear and angular velocities at next safe tick',
        [afterClear.linearVelocity, afterClear.angularVelocity].every((v) => v.x === 0 && v.y === 0 && v.z === 0),
    );
    target.dispose();
    const supported = sphere('supported-sphere', 0, 0.499926, 30, 0.5);
    supported.body.linearDamping = 0;
    supported.body.angularDamping = 0;
    const table = box('support-table', [0, -0.5, 30], [4, 1, 4]),
        ceiling = box('support-ceiling', [0, 1.58, 30], [4, 1, 4]),
        side = box('support-side-wall', [1.25, 0.5, 30], [1, 4, 4]);
    system.syncSceneToPhysics();
    const supportTarget = makeTarget(supported.body);
    const supportHook = beforeStep((context) => {
        const up = query(context, [supported.collider], { x: 0, y: 0.1, z: 0 }, options),
            pair = up.overlaps.find((p) => p.collider === table.collider);
        check('Real slight initial table overlap retained', !!pair);
        const proof = proveBoxSupportPair(up, pair);
        check('Upward table departure independently proven from committed geometry', proof.proven);
        near('Support start gap analytic value', proof.startGap, -0.000074, 1e-7);
        near('Support end gap analytic value', proof.endGap, 0.099926, 1e-7);
        check(
            'Proof preserves exact epoch and pair',
            proof.nativeMutationRevision === up.nativeMutationRevision &&
                proof.queryCollider === supported.collider &&
                proof.collider === table.collider &&
                proof.planeNormal.y === 1 &&
                proof.planeOffset === 0,
        );
        check('Copied fake overlap pair cannot obtain proof', !proveBoxSupportPair(up, { ...pair }).proven);
        check('Ceiling prevents whole upward path qualification', !evaluateBoxSupportPairs(up).qualified);
        near(
            'Ceiling analytic cast distance remains visible',
            up.hits.find((hit) => hit.collider === ceiling.collider)?.distance,
            0.080074,
        );
        const down = query(context, [supported.collider], { x: 0, y: -0.1, z: 0 }, options),
            downProof = proveBoxSupportPair(
                down,
                down.overlaps.find((p) => p.collider === table.collider),
            );
        check('Downward penetration departure is denied', !downProof.proven);
        const diagonal = query(context, [supported.collider], { x: 0.4, y: 0.1, z: 0 }, options);
        check(
            'Diagonal departure retains side-wall obstacle',
            proveBoxSupportPair(
                diagonal,
                diagonal.overlaps.find((p) => p.collider === table.collider),
            ).proven && diagonal.hits.some((hit) => hit.collider === side.collider),
        );
        report.support = {
            up: copy(up),
            down: copy(down),
            diagonal: copy(diagonal),
            proof: copy(proof),
            downProof: copy(downProof),
        };
        flush();
        supportTarget.setTarget({ position: { x: 0, y: 0.549926, z: 30 }, rotation: { x: 0, y: 0, z: 0, w: 1 } });
    });
    await step();
    supportHook.dispose();
    report.support.departed = copy(sdk.readBox3DBodyMotion(supported.body));
    near('Verified short upward target has actual native effect', report.support.departed.position.y, 0.549926, 1e-6);
    supportTarget.clear();
    await step();
    report.support.afterClear = copy(sdk.readBox3DBodyMotion(supported.body));
    check(
        'Support target paired clear consumed',
        [report.support.afterClear.linearVelocity, report.support.afterClear.angularVelocity].every(
            (v) => v.x === 0 && v.y === 0 && v.z === 0,
        ),
    );
    supportTarget.dispose();
    check(
        'Copied query results survive later mutations and ticks',
        retained.every((r) => JSON.stringify(copy(r.original)) === JSON.stringify(r.copy)),
    );
    report.healthyComplete = true;
    flush();
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
    report.status = failure ? 'FAIL' : 'PASS_LIMITED_PRODUCTION_QUERY_TARGET_SUPPORT';
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
