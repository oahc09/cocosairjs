/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Candidate pure/source controls. NOT_RUN at source delivery. No native or browser evidence.
 * Run only after review, Git source checkpoint and actual Library restoration.
 */
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const neutralPath = 'src/cocos/game/game-clock-control.ts';
const neutralSource = read(neutralPath);
const compiled = ts.transpileModule(neutralSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    fileName: neutralPath,
}).outputText;
const local = { exports: {} };
Function('exports', 'module', 'require', compiled)(local.exports, local, require);
const { GameClockControlRegistry, gameClockSemanticPause } = local.exports;
function thrown(run) {
    try {
        run();
    } catch (error) {
        return { threw: true, error };
    }
    return { threw: false };
}
function harness(initial = false) {
    const registry = new GameClockControlRegistry(),
        game = {},
        director = {};
    const h = {
        registry,
        game,
        director,
        paused: initial,
        reads: 0,
        effects: 0,
        log: [],
        hook: null,
        admitHook: null,
        commitHook: null,
        disposeHook: null,
        failure: null,
        observation: null,
    };
    const source = {
        readPaused() {
            assert.equal(this, source);
            h.reads++;
            h.log.push('source-read');
            return h.paused;
        },
        applyPaused(paused) {
            assert.equal(this, source);
            h.effects++;
            h.log.push('effect');
            h.paused = paused;
        },
    };
    registry.install(game, director, source, initial);
    const observer = {
        admit(initialState) {
            assert.equal(this, observer);
            h.log.push('admit');
            h.admitHook?.(initialState);
        },
        assertLive() {
            assert.equal(this, observer);
            h.log.push('live');
        },
        prepare(before, next, initialState) {
            assert.equal(this, observer);
            h.log.push('prepare');
            h.hook?.(before, next, initialState);
            return {
                commit() {
                    h.log.push('commit');
                    h.commitHook?.();
                },
                fail(failure) {
                    h.log.push('fail');
                    h.failure = failure;
                },
                dispose() {
                    h.log.push('dispose');
                    h.disposeHook?.();
                },
            };
        },
    };
    h.observe = () => (h.observation = registry.register(game, observer));
    h.clear = () => {
        h.log.length = 0;
        h.reads = h.effects = 0;
    };
    h.reason = (reason, value) => registry.reason(game, reason, value);
    h.client = () => registry.client(game);
    h.frame = (client, action = () => {}) =>
        client.frame(() => {
            const leave = registry.enterFrame(game, director);
            try {
                action();
            } finally {
                leave?.();
            }
        });
    return h;
}
test('startup pause is bootstrapped, never inferred from a manual paused bit', () => {
    const h = harness(true);
    h.observe();
    h.clear();
    const clock = h.client();
    assert.throws(() => clock.begin(), /semantically paused/);
    assert.equal(h.effects, 0);
    assert.equal(h.paused, true);
    assert.equal(h.observation.diagnostics().applicationPaused, true);
});
test('unobserved direct frame behavior remains legacy, and active legacy adoption refuses', () => {
    const h = harness(true),
        clock = h.client();
    assert.equal(clock.owned(), false);
    assert.equal(clock.begin(), false);
    assert.equal(h.registry.enterFrame(h.game, h.director), undefined);
    assert.throws(() => h.observe(), /legacy clock/);
    clock.end();
    h.observe();
    assert.equal(h.observation.diagnostics().applicationPaused, true);
});
test('pre-observation engine tracking does not invent application intent', () => {
    const h = harness();
    assert.equal(h.reason('background', true), undefined);
    h.registry.legacyEngine(h.game, () => h.reason('application', true));
    h.paused = true;
    h.observe();
    assert.equal(h.observation.diagnostics().backgroundPaused, true);
    assert.equal(h.observation.diagnostics().applicationPaused, false);
    assert.throws(() => h.client().begin(), /semantically paused/);
});
test('ambiguous legacy private-cache disagreement fails closed', () => {
    const h = harness();
    h.paused = true;
    assert.throws(() => h.observe(), /reasons disagree/);
    assert.equal(h.effects, 0);
});
test('all preparation precedes source effect, including same-value requests', () => {
    const h = harness();
    h.observe();
    h.clear();
    h.reason('application', false);
    assert.deepEqual(h.log, ['admit', 'source-read', 'prepare', 'commit', 'effect', 'dispose']);
    h.clear();
    const marker = {};
    h.admitHook = () => {
        throw marker;
    };
    assert.equal(thrown(() => h.reason('application', false)).error, marker);
    assert.equal(h.reads, 0);
    assert.equal(h.effects, 0);
});
test('caught nested control during prepare latches before publication', () => {
    const h = harness();
    h.observe();
    h.clear();
    let nested;
    h.hook = () => {
        nested = thrown(() => h.reason('application', true));
    };
    const result = thrown(() => h.reason('application', true));
    assert.equal(result.threw, true);
    assert.equal(result.error, nested.error);
    assert.equal(h.effects, 0);
    assert.equal(h.log.includes('commit'), false);
    assert.equal(h.observation.diagnostics().applicationPaused, false);
});
test('failed preparation has zero source effects and leaves reasons unchanged', () => {
    const h = harness();
    h.observe();
    h.clear();
    const error = {};
    h.hook = () => {
        throw error;
    };
    assert.equal(thrown(() => h.reason('application', true)).error, error);
    assert.equal(h.effects, 0);
    assert.equal(h.observation.diagnostics().applicationPaused, false);
});
test('partial commit retains actual reason, first falsy error and independent disposal', () => {
    const h = harness();
    h.observe();
    h.clear();
    h.commitHook = () => {
        throw undefined;
    };
    h.disposeHook = () => {
        throw new Error('cleanup');
    };
    const result = thrown(() => h.reason('application', true));
    assert.equal(result.threw, true);
    assert.equal(result.error, undefined);
    assert.equal(h.failure.reasonCommitted, true);
    assert.equal(h.failure.effectEntered, false);
    assert.equal(h.observation.diagnostics().applicationPaused, true);
    assert.equal(h.observation.diagnostics().faulted, true);
    assert.equal(h.paused, false);
    assert.equal(h.log.at(-1), 'dispose');
    assert.throws(() => h.client().begin(), /faulted/);
});
test('exact ownership rejects unbegun, foreign, nested, stale and between-frame native steps', () => {
    const h = harness();
    h.observe();
    const a = h.client(),
        b = h.client();
    assert.throws(() => h.frame(a), /requires begin/);
    a.begin();
    assert.throws(() => b.begin(), /Another exact/);
    assert.throws(() => h.registry.beforeStep(h.game, h.director), /unused exact/);
    assert.throws(() => h.observation.assertNativeAdvance(), /exact active/);
    let calls = 0;
    h.frame(a, () => {
        calls++;
        h.observation.assertNativeAdvance();
        assert.throws(() => h.registry.enterFrame(h.game, h.director), /unused exact/);
        assert.throws(() => h.frame(a), /Nested/);
    });
    assert.equal(calls, 1);
    assert.equal(h.observation.diagnostics().frame, 'none');
    a.end();
    assert.throws(() => h.frame(a), /requires begin/);
    a.end();
    b.begin();
    assert.throws(() => a.end(), /no longer owns/);
    assert.equal(h.paused, true);
    b.end();
});
test('captured receiver/source identities cannot borrow leases or a foreign Director', () => {
    const h = harness();
    h.observe();
    const c = h.client();
    c.begin();
    assert.throws(() => c.begin.call({}), /receiver/);
    assert.throws(() => h.observation.dispose.call({}), /receiver/);
    assert.throws(() => c.frame(() => h.registry.enterFrame(h.game, {})), /Foreign Director/);
    assert.equal(h.observation.diagnostics().frame, 'none');
    assert.throws(() => h.registry.install(h.game, h.director, {}, false), /unregistered original/);
    c.end();
});
test('application, background and manual reasons cannot resume each other', () => {
    const h = harness();
    h.observe();
    const c = h.client();
    c.begin();
    h.reason('application', true);
    h.reason('background', true);
    h.reason('application', false);
    assert.equal(h.paused, true);
    assert.throws(() => h.frame(c), /semantically paused/);
    c.end();
    assert.equal(h.paused, true);
    h.reason('background', false);
    assert.equal(h.paused, false);
    assert.equal(gameClockSemanticPause(h.observation.diagnostics()), false);
});
test('ordinary pause inside an active frame does not unwind it but blocks the next frame', () => {
    const h = harness();
    h.observe();
    const c = h.client();
    c.begin();
    h.frame(c, () => h.reason('application', true));
    assert.throws(() => h.frame(c), /semantically paused/);
    h.reason('application', false);
    assert.equal(h.paused, true);
    h.frame(c);
    c.end();
    assert.equal(h.paused, false);
});
test('late synchronous frame errors preserve their identity, release permission and do not replay', () => {
    const h = harness();
    h.observe();
    const c = h.client();
    c.begin();
    const late = {};
    let realWork = 0;
    assert.equal(
        thrown(() =>
            h.frame(c, () => {
                realWork++;
                throw late;
            }),
        ).error,
        late,
    );
    assert.equal(realWork, 1);
    assert.equal(h.observation.diagnostics().frame, 'none');
    h.frame(c, () => {
        realWork++;
    });
    assert.equal(realWork, 2);
    c.end();
});
test('observer loss is fail-closed for all retained/new clocks without legacy fallback', () => {
    const h = harness();
    h.observe();
    const c = h.client();
    c.begin();
    h.observation.dispose();
    assert.throws(() => c.owned(), /detached/);
    assert.throws(() => c.end(), /detached/);
    assert.throws(() => h.client().begin(), /detached/);
    assert.equal(h.paused, true);
});
test('terminal is sticky even when owner admission fails and survives disposal', () => {
    const h = harness();
    h.observe();
    const c = h.client();
    c.begin();
    const fault = {};
    h.admitHook = () => {
        throw fault;
    };
    assert.equal(thrown(() => h.registry.terminate(h.game)).error, fault);
    assert.equal(h.observation.diagnostics().terminal, true);
    assert.equal(h.observation.diagnostics().manual, false);
    assert.equal(h.paused, true);
    h.observation.dispose();
    assert.equal(thrown(() => c.end()).error.code, 'AIR_E_APP_CLOSED');
    assert.equal(thrown(() => h.frame(c)).error.code, 'AIR_E_APP_CLOSED');
    h.registry.terminate(h.game);
    assert.equal(h.paused, true);
});
test('source wiring: guards precede dt/input, tick return precedes Promise success, close precedes callbacks', () => {
    const game = read('src/cocos/game/game.ts'),
        director = read('src/cocos/game/director.ts');
    const air = read('src/air/step-clock.ts'),
        app = read('src/air/app.ts');
    const world = read('src/air/physics/box3d/world.ts'),
        owner = read('src/air/physics/box3d/world-command-owner.ts');
    const step = game.slice(game.indexOf('public step ()'), game.indexOf('private pauseByEngine'));
    assert.ok(step.indexOf('assertGameClockStep') < step.indexOf('_calculateDT'));
    const tick = director.slice(director.indexOf('public tick ('), director.indexOf('public buildRenderPipeline'));
    assert.ok(tick.indexOf('enterGameClockFrame') < tick.indexOf('BEGIN_FRAME'));
    assert.ok(tick.indexOf('enterGameClockFrame') < tick.indexOf('_frameDispatchEvents'));
    const onDraw = air.slice(
        air.indexOf('function onDraw'),
        air.indexOf('timer = setTimeout', air.indexOf('function onDraw')),
    );
    assert.equal(onDraw.includes('resolve('), false);
    assert.equal(onDraw.includes('finish(false)'), false);
    assert.ok(air.indexOf('control.frame(() => director.tick(dt))') < air.indexOf('returned = true;'));
    assert.ok(air.includes('returned && drew'));
    assert.ok(app.indexOf("attempt('game-clock-terminal'") < app.indexOf("attempt('session-deactivate'"));
    assert.ok(app.includes('if (!this._terminalGameClock) game.pause();'));
    assert.ok(world.indexOf('installGameControlObservation') < world.indexOf('installCommandRouting'));
    const worldStep = world.slice(world.indexOf('    step(dt:'), world.indexOf('    getNativeCounts()'));
    assert.ok(worldStep.indexOf('assertNativeClockFrame') < worldStep.indexOf('finiteFloat32(dt'));
    assert.ok(owner.includes('!candidate.enabled || this.#gamePaused'));
    assert.ok(owner.includes('this.#queue.withConfigurationAdmission(() => undefined)'));
    assert.ok(owner.includes('owned.#assertNoClockReentry();'));
    assert.equal(/^import\b/m.test(neutralSource), false);
    assert.equal(read('src/cocos/game/index.ts').includes('game-clock-control'), false);
});

test('never-observed termination preserves the original Game path', () => {
    const h = harness();
    assert.equal(h.registry.terminate(h.game), false);
    assert.equal(h.registry.terminal(h.game), false);
    assert.equal(h.effects, 0);
    assert.equal(h.reason('application', true), undefined);
});
