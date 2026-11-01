/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
import assert from 'node:assert/strict';
export function assertScenario(report) {
    const count = report.configuration.sku.shapes.length;
    assert.equal(count, report.mode === 'C' ? 3 : 2);
    assert.equal(report.identities.length, count * 2);
    assert.equal(new Set(report.identities.map((entry) => entry.label)).size, count * 2);
    const keys = report.events.map((event) => `${event.tick}/${event.self.label}/${event.other.label}/${event.type}`);
    assert.equal(new Set(keys).size, keys.length, 'No duplicate delivery for a public collider pair in one fixed tick');
    const logicalByGeneration = new Map();
    for (const generation of [1, 2]) {
        const logical = [];
        for (let child = 0; child < count; child++) {
            const label = `${report.mode}/item-1/g${generation}/collider-${child}`;
            const events = report.events.filter((event) => event.self.label === label);
            assert.equal(events.filter((event) => event.type === 'onTriggerEnter').length, 1);
            assert.equal(events.filter((event) => event.type === 'onTriggerExit').length, 1);
            const enter = events[0],
                exit = events.at(-1);
            assert.equal(enter.type, 'onTriggerEnter');
            assert.equal(exit.type, 'onTriggerExit');
            assert(exit.tick - enter.tick > 2, 'Every actual collider has persistent ordinary overlap');
            assert.equal(
                events.length,
                exit.tick - enter.tick + 1,
                'Every continuously overlapped fixed tick has exactly one event',
            );
            for (let i = 1; i < events.length - 1; i++) {
                assert.equal(events[i].type, 'onTriggerStay');
                assert.equal(events[i].tick, enter.tick + i);
            }
            assert(events.every((event) => event.impl.logicalPair === enter.impl.logicalPair));
            logical.push(enter.impl.logicalPair);
        }
        assert.equal(new Set(logical).size, count, 'Compound child colliders must not collapse into one body pair');
        logicalByGeneration.set(generation, logical);
        const union = report.itemUnion.filter((event) => event.itemGeneration === generation);
        assert.equal(
            union.filter((event) => event.type === 'enter').length,
            1,
            'Separate diagnostic item union enters once',
        );
        assert.equal(union.filter((event) => event.type === 'exit').length, 1);
        assert(union.every((event) => event.diagnosticOnly === true));
    }
    assert(
        logicalByGeneration.get(2).every((key) => !logicalByGeneration.get(1).includes(key)),
        'Replacement public collider identities must not reuse stale logical pair IDs',
    );
    for (const event of report.events) {
        assert.equal(event.impl.backend, 'box3d');
        assert(Number.isSafeInteger(event.impl.stepIndex));
        assert(
            report.events.some(
                (other) =>
                    other.tick === event.tick &&
                    other.type === event.type &&
                    other.self.label === event.other.label &&
                    other.other.label === event.self.label,
            ),
            'Every actual valid pair is reciprocal',
        );
    }
    assert.equal(report.destroyedFirstGeneration.valid, false);
    assert.equal(report.destroyedFirstGeneration.eventCountAfter, report.destroyedFirstGeneration.eventCountBefore);
    for (const item of report.lifetime) assert.equal(item.after, item.before);
    assert(report.motion.length > 0 && report.motion.every((entry) => entry.massPending === false && entry.type === 2));
}
