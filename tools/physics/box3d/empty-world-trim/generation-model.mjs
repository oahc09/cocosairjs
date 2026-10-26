/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Pure finite model: no native binding, core import, allocator, WASM, step or filesystem access.
// issued is proof-only ghost history. Production must NOT store this growing collection.
import assert from 'node:assert/strict';

export function initialState({ bits = 2, maxSlots = 2 } = {}) {
    assert(Number.isInteger(bits) && bits >= 1 && bits <= 32);
    assert(Number.isInteger(maxSlots) && maxSlots >= 1);
    return {
        maxGeneration: (1n << BigInt(bits)) - 1n,
        maxSlots, // Finite proof bound, not a proposed production object limit.
        worldId: 17,
        worldGeneration: 9,
        stepIndex: 58n,
        floor: 0n,
        highWater: 0n,
        slots: [],
        free: [],
        issued: [],
        locked: false,
        pendingTasks: 0,
        eventsAcknowledged: true,
        faulted: false,
    };
}
export function stateKey(state) {
    return JSON.stringify(state, (_key, value) => (typeof value === 'bigint' ? value.toString() : value));
}
export function valid(state, id) {
    const slot = state.slots[id.slot];
    return Boolean(slot?.live && slot.generation === id.generation);
}
const copied = (state) => structuredClone(state);
const rejected = (state, status) => ({ state, status, id: null });
const unavailable = (state) => state.faulted || state.locked || state.pendingTasks !== 0;

export function create(state, { failure = null, internalContact = false, wrongSeedForHighSlots = false } = {}) {
    if (unavailable(state)) return rejected(state, 'UNAVAILABLE');
    const index = state.free.length ? state.free.at(-1) : state.slots.length;
    if (index >= state.maxSlots) return rejected(state, 'MODEL_SLOT_BOUND');
    const old = state.slots[index]?.generation ?? (wrongSeedForHighSlots && index > 0 ? 0n : state.floor);
    // Preflight BEFORE ID-pool edits, array growth, sim allocation or insertion.
    if (old >= state.maxGeneration) {
        if (!internalContact) return rejected(state, 'GENERATION_EXHAUSTED');
        const faulted = copied(state);
        faulted.faulted = true;
        return rejected(faulted, 'CONTACT_EXHAUSTION_FAULT');
    }
    if (failure === 'preflight') return rejected(state, 'INJECTED_PREFLIGHT_FAILURE');
    const staged = copied(state);
    // Abstract allocation/initialization staging, NOT a model of actual C allocator rollback.
    if (staged.free.length) staged.free.pop();
    const generation = old + 1n;
    staged.slots[index] = { generation, live: true };
    staged.highWater = generation > staged.highWater ? generation : staged.highWater;
    staged.issued.push({ slot: index, generation });
    staged.issued.sort(
        (a, b) => a.slot - b.slot || (a.generation < b.generation ? -1 : a.generation > b.generation ? 1 : 0),
    );
    if (failure === 'staging') return rejected(state, 'INJECTED_STAGING_FAILURE');
    return { state: staged, status: 'OK', id: { slot: index, generation } };
}

export function destroy(state, id) {
    // Faulted-world teardown remains possible. No new object creation is allowed after fault.
    if (!valid(state, id)) return rejected(state, 'INVALID_ID');
    const result = copied(state);
    result.slots[id.slot].live = false;
    result.free.push(id.slot);
    return { state: result, status: 'OK', id: null };
}

export function trim(state, { failure = null, wrongFloor = null } = {}) {
    if (unavailable(state)) return rejected(state, 'UNAVAILABLE');
    if (state.slots.some((slot) => slot.live)) return rejected(state, 'NOT_EMPTY');
    if (!state.eventsAcknowledged) return rejected(state, 'EVENTS_NOT_ACKNOWLEDGED');
    // H == MAX is refused before changing anything: there is no fresh generation for reuse.
    if (state.highWater >= state.maxGeneration) return rejected(state, 'GENERATION_EXHAUSTED');
    if (failure === 'preflight') return rejected(state, 'INJECTED_PREFLIGHT_FAILURE');
    const staged = copied(state);
    staged.floor = wrongFloor === 'zero' ? 0n : wrongFloor === 'floor-plus-one' ? state.floor + 1n : state.highWater;
    staged.slots = [];
    staged.free = [];
    if (failure === 'staging') return rejected(state, 'INJECTED_STAGING_FAILURE');
    return { state: staged, status: 'OK', id: null };
}

export function invariant(state) {
    assert(state.floor >= 0n && state.floor <= state.highWater && state.highWater <= state.maxGeneration);
    const identities = state.issued.map((id) => `${id.slot}:${id.generation}`);
    assert.equal(new Set(identities).size, identities.length, 'ABA: an issued (slot,generation) was issued again');
    let maximum = 0n;
    for (const id of state.issued) {
        assert(id.generation > 0n && id.generation <= state.maxGeneration);
        if (id.generation > maximum) maximum = id.generation;
    }
    assert.equal(state.highWater, maximum, 'H is the lifetime maximum, not a resettable current-epoch maximum');
    assert.equal(new Set(state.free).size, state.free.length);
    for (const [index, slot] of state.slots.entries()) {
        assert(slot.generation > state.floor && slot.generation <= state.highWater);
        assert.equal(state.free.includes(index), !slot.live);
        assert(state.issued.some((id) => id.slot === index && id.generation === slot.generation));
    }
    for (const index of state.free) assert(index >= 0 && index < state.slots.length);
    for (const id of state.issued) {
        const latest = state.slots[id.slot];
        if (!latest?.live || latest.generation !== id.generation) assert.equal(valid(state, id), false);
    }
}

export function transitionInvariant(before, result) {
    const after = result.state;
    invariant(after);
    assert.equal(after.worldId, before.worldId);
    assert.equal(after.worldGeneration, before.worldGeneration);
    assert.equal(after.stepIndex, before.stepIndex);
    assert(after.highWater >= before.highWater);
    if (result.status === 'CONTACT_EXHAUSTION_FAULT') {
        assert.equal(stateKey({ ...after, faulted: before.faulted }), stateKey(before));
    } else if (result.status !== 'OK') {
        assert.equal(stateKey(after), stateKey(before), 'Refusal/partial preparation failure must not publish changes');
    }
}

export function explore({ bits, maxSlots, maximumStates = 1000000 }) {
    const initial = initialState({ bits, maxSlots });
    const queue = [initial];
    const seen = new Set([stateKey(initial)]);
    const statuses = {};
    let edges = 0;
    let successfulTrims = 0;
    let reusedCreates = 0;
    let highIndexCreatesAfterTrim = 0;
    for (let next = 0; next < queue.length; next++) {
        const state = queue[next];
        invariant(state);
        const actions = [
            () => create(state),
            () => create(state, { failure: 'preflight' }),
            () => create(state, { failure: 'staging' }),
            () => trim(state),
            () => trim(state, { failure: 'preflight' }),
            () => trim(state, { failure: 'staging' }),
        ];
        for (const [slot, record] of state.slots.entries())
            if (record.live) actions.push(() => destroy(state, { slot, generation: record.generation }));
        for (const action of actions) {
            const result = action();
            transitionInvariant(state, result);
            edges++;
            statuses[result.status] = (statuses[result.status] ?? 0) + 1;
            if (result.status === 'OK' && result.id && state.free.length) reusedCreates++;
            if (result.status === 'OK' && result.id?.slot > 0 && state.floor > 0n && !state.free.length)
                highIndexCreatesAfterTrim++;
            if (result.status === 'OK' && !result.id && !result.state.slots.length && state.slots.length)
                successfulTrims++;
            const key = stateKey(result.state);
            if (!seen.has(key)) {
                assert(seen.size < maximumStates, 'State bound reached: proof is INCOMPLETE, not PASS');
                seen.add(key);
                queue.push(result.state);
            }
        }
    }
    return Object.freeze({
        bits,
        maxSlots,
        states: seen.size,
        edges,
        statuses,
        successfulTrims,
        reusedCreates,
        highIndexCreatesAfterTrim,
    });
}
