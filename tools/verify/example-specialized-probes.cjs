'use strict';
// A bounded ordinary-collector adapter for existing example-owned test controls.
// This primary-session proof is not the dedicated three-engine Driver Pilot gate.
const driver = require('./shaders-driver-pilot-browser.cjs');
const oracle = require('./shaders-driver-pilot-oracle.cjs');
const ID = 'shader-driver-pilot';
const SCHEMA = 'example-driver-primary-probe/1';
const DT = 1 / 60;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const near = (a, b) => finite(a) && finite(b) && Math.abs(a - b) <= 1e-7;
function expectedPlan(scope) {
    if (scope.id !== ID || scope.mode !== 'primary' || scope.query) throw Error('Unsupported specialized probe scope');
    if (
        !Number.isInteger(scope.viewport?.width) ||
        scope.viewport.width < 1 ||
        !Number.isInteger(scope.viewport?.height) ||
        scope.viewport.height < 1
    )
        throw Error('Invalid frozen probe viewport');
    return { consumer: 'holographic', viewport: scope.viewport, dpr: 1 };
}
function validateProbe(data, scope) {
    const errors = [];
    if (scope.id !== ID) return { ok: data == null, errors: data == null ? [] : ['unexpected specialized probe'] };
    try {
        const plan = expectedPlan(scope);
        if (!data || data.schema !== SCHEMA || !same(data.scope, scope) || data.consumer !== plan.consumer)
            throw Error('driver primary probe identity/raw data missing');
        if (!Array.isArray(data.errors) || data.errors.length) throw Error('driver probe retained execution errors');
        const { zero, stepped, afterProbe, resumedBefore, resumedAfter } = data;
        const bindings = driver.bindingsFor(plan.consumer, 'time');
        for (const state of [zero, stepped, afterProbe, resumedBefore, resumedAfter]) {
            driver.checkState(state, plan, bindings, errors);
            if (state.diagnostic !== false || state.driver.paused !== false || state.driver.released !== false)
                errors.push('normal snapshot is not an active native consumer');
        }
        const captured = data.probe?.state;
        driver.checkState(captured, plan, bindings, errors);
        for (const state of [zero, stepped, captured, afterProbe, resumedBefore, resumedAfter]) {
            if (
                !Number.isInteger(state.frame) ||
                state.frame < 0 ||
                state.frameLedger.some((entry) => entry.frame >= state.frame)
            )
                errors.push('ledger extends beyond its snapshot');
        }
        if (
            captured.frame !== stepped.frame + 1 ||
            afterProbe.frame !== stepped.frame + 2 ||
            captured.diagnostic !== true ||
            captured.driver.paused !== true ||
            !same(captured.driver, { ...stepped.driver, paused: true })
        )
            errors.push('diagnostic dt0 frame/state chain mismatch');
        for (const key of [
            'selectedConsumer',
            'currentInstance',
            'time',
            'bindings',
            'outputs',
            'motherParams',
            'nodePosition',
            'uniformReadback',
            'frameLedger',
        ])
            if (!same(captured[key], stepped[key])) errors.push('diagnostic changed consumed state: ' + key);
        if (
            data.dt !== DT ||
            zero.time !== 0 ||
            zero.frameLedger.length !== 0 ||
            !near(stepped.time - zero.time, DT) ||
            stepped.frame !== zero.frame + 1 ||
            stepped.currentInstance !== zero.currentInstance ||
            stepped.driver.generation !== zero.driver.generation ||
            stepped.frameLedger.length !== 1 ||
            stepped.frameLedger[0].dt !== DT ||
            stepped.frameLedger[0].frame !== zero.frame ||
            !near(stepped.frameLedger[0].timeBefore, zero.time) ||
            !near(stepped.frameLedger[0].timeAfter, stepped.time)
        )
            errors.push('driver exact step/ledger mismatch');
        driver.checkProbe({ state: stepped, probe: data.probe }, plan, errors);
        if (!same(data.probe.gpuReceipt.canvas, captured.canvas) || !same(captured.canvas, stepped.canvas))
            errors.push('GPU receipt canvas differs from frozen actual target');
        for (const key of [
            'selectedConsumer',
            'currentInstance',
            'time',
            'driver',
            'bindings',
            'outputs',
            'motherParams',
            'nodePosition',
            'uniformReadback',
            'frameLedger',
        ])
            if (!same(stepped[key], afterProbe[key])) errors.push('probe changed actual state: ' + key);
        if (
            data.renderer?.sameReference !== true ||
            typeof data.renderer.before !== 'string' ||
            data.renderer.after !== data.renderer.before ||
            data.renderer.validBefore !== true ||
            data.renderer.validAfter !== true ||
            !Number.isInteger(data.renderer.refsBefore) ||
            data.renderer.refsBefore < 1 ||
            data.renderer.refsAfter !== data.renderer.refsBefore
        )
            errors.push('renderer material readback not restored');
        if (
            !same(afterProbe, resumedBefore) ||
            resumedAfter.currentInstance !== resumedBefore.currentInstance ||
            resumedAfter.driver.generation !== resumedBefore.driver.generation ||
            resumedAfter.frame < resumedBefore.frame + 2 ||
            !(resumedAfter.time > resumedBefore.time) ||
            resumedAfter.frameLedger.length <= resumedBefore.frameLedger.length ||
            !same(resumedAfter.frameLedger.slice(0, resumedBefore.frameLedger.length), resumedBefore.frameLedger) ||
            resumedAfter.frameLedger
                .slice(resumedBefore.frameLedger.length)
                .some((entry) => entry.frame < resumedBefore.frame || entry.frame >= resumedAfter.frame)
        )
            errors.push('native pacer did not resume');
    } catch (error) {
        errors.push(String(error.message || error));
    }
    return { ok: errors.length === 0, errors };
}
async function collectProbe(page, scope) {
    if (scope.id !== ID) return null;
    const plan = expectedPlan(scope);
    const data = { schema: SCHEMA, scope, consumer: plan.consumer, dt: DT, errors: [] };
    try {
        const states = await page.evaluate(
            async ({ dt, bindings }) => {
                const hook = window.__driverpilot;
                if (!hook?.ready) throw Error('Driver Pilot ready control missing');
                hook.pausePacer();
                hook.__resetSession();
                hook.resume();
                const accepted = hook.setBindings({ bindings });
                if (accepted?.ok !== true) throw Error('Driver time bindings rejected');
                const zero = await hook.step(0);
                const stepped = await hook.step(dt);
                return { zero, stepped };
            },
            { dt: DT, bindings: driver.bindingsFor(plan.consumer, 'time') },
        );
        Object.assign(data, states);
        const points = oracle.points(plan.consumer, data.stepped.canvas.width, data.stepped.canvas.height);
        const readback = await page.evaluate(async (points) => {
            const hook = window.__driverpilot;
            const cc = await import('/build/cocosair.module.js');
            // Keep synchronous harness observations separate from real example actions.
            // Never retain observing across await: linearProbe must remain instrumented.
            function observe(read) {
                const trace = window.__apiTrace;
                if (trace) trace.observing++;
                try {
                    return read();
                } finally {
                    if (trace) trace.observing--;
                }
            }
            const { renderer, before, beforeIdentity } = observe(() => {
                const app = window.__apiTrace?.app || window.__airApp;
                const node = app?.getScene()?.getChildByName('driver-' + hook.snapshot().currentInstance);
                const renderer = node?.getComponent(cc.MeshRenderer);
                const before = renderer?.getSharedMaterial(0);
                if (!before) throw Error('Driver renderer material missing');
                return {
                    renderer,
                    before,
                    beforeIdentity: { uuid: before.uuid, valid: before.isValid, refs: before.refCount },
                };
            });
            const probe = await hook.linearProbe(points);
            return observe(() => {
                const after = renderer.getSharedMaterial(0);
                return {
                    probe,
                    afterProbe: hook.snapshot(),
                    renderer: {
                        before: beforeIdentity.uuid,
                        after: after?.uuid,
                        sameReference: before === after,
                        validBefore: beforeIdentity.valid,
                        validAfter: after?.isValid,
                        refsBefore: beforeIdentity.refs,
                        refsAfter: after?.refCount,
                    },
                };
            });
        }, points);
        Object.assign(data, readback);
    } catch (error) {
        data.errors.push(String(error.stack || error));
    } finally {
        try {
            data.resumedBefore = await page.evaluate(() => {
                const hook = window.__driverpilot;
                if (!hook?.ready) throw Error('Driver restore control missing');
                const trace = window.__apiTrace;
                let before;
                if (trace) trace.observing++;
                try {
                    before = hook.snapshot();
                } finally {
                    if (trace) trace.observing--;
                }
                hook.resumePacer();
                return before;
            });
            await page.waitForFunction(
                ({ frame, time }) => {
                    const trace = window.__apiTrace;
                    if (trace) trace.observing++;
                    try {
                        const state = window.__driverpilot.snapshot();
                        return state.frame >= frame + 2 && state.time > time;
                    } finally {
                        if (trace) trace.observing--;
                    }
                },
                { frame: data.resumedBefore.frame, time: data.resumedBefore.time },
                { timeout: 4000 },
            );
            data.resumedAfter = await page.evaluate(() => {
                const trace = window.__apiTrace;
                if (trace) trace.observing++;
                try {
                    return window.__driverpilot.snapshot();
                } finally {
                    if (trace) trace.observing--;
                }
            });
        } catch (error) {
            data.errors.push('native pacer restore: ' + String(error.stack || error));
        }
    }
    return data;
}
module.exports = { ID, SCHEMA, DT, validateProbe, collectProbe };
