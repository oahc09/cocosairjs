/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// CPU proof model only. Passing this file is not evidence that Box3D implements the design.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    create,
    destroy,
    explore,
    initialState,
    invariant,
    stateKey,
    transitionInvariant,
    trim,
    valid,
} from './generation-model.mjs';

const ok = (result) => {
    assert.equal(result.status, 'OK');
    return result.state;
};
function releaseAll(state) {
    for (const [slot, row] of state.slots.entries())
        if (row.live) state = ok(destroy(state, { slot, generation: row.generation }));
    return state;
}
function boundaryState(bits, generation) {
    const state = initialState({ bits, maxSlots: 2 });
    state.slots = [{ generation, live: false }];
    state.free = [0];
    state.issued = [{ slot: 0, generation }];
    state.highWater = generation;
    invariant(state);
    return state;
}

for (const [bits, maxSlots] of [
    [2, 2],
    [2, 3],
    [3, 2],
]) {
    test(`exhaustive reachable finite graph: ${bits}-bit generation, ${maxSlots} slots`, (t) => {
        const result = explore({ bits, maxSlots });
        assert(result.states > 1 && result.edges > result.states);
        assert(result.successfulTrims > 0 && result.reusedCreates > 0 && result.highIndexCreatesAfterTrim > 0);
        assert(result.statuses.GENERATION_EXHAUSTED > 0);
        assert(result.statuses.INJECTED_STAGING_FAILURE > 0);
        t.diagnostic(JSON.stringify(result));
    });
}

test('100 modeled empty-world releases preserve identity/step and retire low and newly regrown high slots', () => {
    let state = initialState({ bits: 16, maxSlots: 3 });
    const identity = [state.worldId, state.worldGeneration, state.stepIndex];
    const retired = [];
    for (let cycle = 0; cycle < 100; cycle++) {
        for (let index = 0; index < 3; index++) {
            const result = create(state);
            assert.equal(result.id.slot, index);
            transitionInvariant(state, result);
            state = ok(result);
            retired.push(result.id);
        }
        state = releaseAll(state);
        const result = trim(state);
        transitionInvariant(state, result);
        state = ok(result);
        for (const id of retired) assert.equal(valid(state, id), false);
        assert.deepEqual([state.worldId, state.worldGeneration, state.stepIndex], identity);
    }
    assert.equal(state.highWater, 100n);
    assert.equal(state.floor, 100n);
    assert.equal(state.issued.length, 300); // Ghost history is proof-only, not production retained storage.
});

test('public create and trim preparation failures publish no ID, free-list, generation or object changes', () => {
    let state = ok(create(initialState()));
    state = releaseAll(state);
    for (const operation of [create, trim])
        for (const failure of ['preflight', 'staging']) {
            const before = stateKey(state);
            const result = operation(state, { failure });
            assert.match(result.status, /^INJECTED_/);
            transitionInvariant(state, result);
            assert.equal(stateKey(result.state), before);
        }
});

test('empty is insufficient: locked, pending-task and unacknowledged-events trim requests are refused unchanged', () => {
    const empty = releaseAll(ok(create(initialState())));
    for (let mask = 1; mask < 8; mask++) {
        const state = {
            ...empty,
            locked: Boolean(mask & 1),
            pendingTasks: mask & 2 ? 1 : 0,
            eventsAcknowledged: !(mask & 4),
        };
        const result = trim(state);
        assert.notEqual(result.status, 'OK');
        transitionInvariant(state, result);
    }
    const live = ok(create(initialState()));
    assert.equal(trim(live).status, 'NOT_EMPTY');
    assert.equal(stateKey(trim(live).state), stateKey(live));
});

for (const bits of [16, 32])
    test(`${bits}-bit boundary: MAX is issued once, increment and H==MAX trim refuse before mutation`, () => {
        const maximum = (1n << BigInt(bits)) - 1n;
        let state = boundaryState(bits, maximum - 1n);
        const created = create(state);
        state = ok(created);
        assert.equal(created.id.generation, maximum);
        state = releaseAll(state);
        for (const operation of [create, trim]) {
            const result = operation(state);
            assert.equal(result.status, 'GENERATION_EXHAUSTED');
            transitionInvariant(state, result);
        }
    });

test('contact arithmetic crosses signed INT_MAX without signed truncation in this unsigned model', () => {
    const state = boundaryState(32, 2147483647n);
    const result = create(state);
    assert.equal(result.status, 'OK');
    assert.equal(result.id.generation, 2147483648n);
    invariant(result.state);
    // Negative arithmetic illustration only: JS coercion is not execution of C signed-overflow UB.
    assert.notEqual(BigInt(Number(result.id.generation) | 0), result.id.generation);
});

test('internal contact exhaustion latches fault, not silent success; existing objects remain teardown-capable', () => {
    let state = boundaryState(2, 3n);
    state.slots.push({ generation: 1n, live: true });
    state.issued.push({ slot: 1, generation: 1n });
    invariant(state);
    const before = stateKey(state);
    const result = create(state, { internalContact: true });
    assert.equal(result.status, 'CONTACT_EXHAUSTION_FAULT');
    transitionInvariant(state, result);
    state = result.state;
    assert.equal(stateKey({ ...state, faulted: false }), before);
    assert.equal(create(state).status, 'UNAVAILABLE');
    assert.equal(trim(state).status, 'UNAVAILABLE');
    assert.equal(valid(state, { slot: 1, generation: 1n }), true);
    state = ok(destroy(state, { slot: 1, generation: 1n }));
    assert(state.faulted && state.slots.every((slot) => !slot.live));
});

test('negative strategy: resetting seed to zero revives a retired ID', () => {
    let state = releaseAll(ok(create(initialState())));
    state = ok(trim(state, { wrongFloor: 'zero' }));
    state = ok(create(state));
    assert.throws(() => invariant(state), /ABA/);
});

test('negative strategy: incrementing only the old trim seed ignores higher in-epoch generations', () => {
    let state = initialState();
    state = releaseAll(ok(create(state)));
    state = releaseAll(ok(create(state))); // Slot 0 reached generation 2, but previous trim floor is still 0.
    state = ok(trim(state, { wrongFloor: 'floor-plus-one' }));
    state = ok(create(state));
    assert.throws(() => invariant(state), /ABA/);
});

test('negative strategy: applying seed only to low slots revives a regrown high-index ID', () => {
    let state = initialState({ bits: 3, maxSlots: 3 });
    for (let i = 0; i < 3; i++) state = ok(create(state));
    state = ok(trim(releaseAll(state)));
    state = ok(create(state));
    state = ok(create(state, { wrongSeedForHighSlots: true }));
    assert.throws(() => invariant(state), /ABA/);
});
