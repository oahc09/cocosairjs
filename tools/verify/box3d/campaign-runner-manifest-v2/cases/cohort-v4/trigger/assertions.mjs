/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
import assert from 'node:assert/strict';
// Independent observer-only assertions. Never reads engine/native internals or manufactures an event.
export function assertScenario(report) {
    assert.equal(report.listenerAdmission, true);
    const events = report.events;
    const phase = (label) => {
        const value = report.phases.find((entry) => entry.label === label);
        assert(value && value.status === 'COMPLETE', 'Incomplete phase: ' + label);
        return { ...value, events: events.slice(value.startEvent, value.endEvent) };
    };
    const of = (list, self, kind) => list.filter((event) => event.self === self && event.type === kind);
    const unique = events.map((event) => [event.tick, event.self, event.other, event.type].join(':'));
    assert.equal(new Set(unique).size, unique.length, 'One logical pair must not duplicate within a public fixed tick');
    for (const { before, after } of report.lifetime)
        assert.equal(after, before, 'Retained copied public event changed after later steps/destruction');
    for (const event of events) {
        assert(['onTriggerEnter', 'onTriggerStay', 'onTriggerExit'].includes(event.type));
        assert(event.self && event.other && event.self !== event.other);
        assert.equal(event.impl.backend, 'box3d');
        assert(Number.isSafeInteger(event.impl.stepIndex));
    }
    if (report.mode === 'callback-fault') {
        assert.equal(report.counts.faultCalls, 1);
        assert.equal(report.fault.exactErrorIdentity, true);
        assert.equal(report.fault.nextMutationCode, 'AIR_E_BOX3D_WORLD_FAULTED');
        assert.equal(report.intentionalFaultObserved, true);
        return;
    }
    if (report.mode === 'callback-destroy') {
        assert.equal(report.counts.destructionRequests, 1);
        assert.equal(report.destroyedValidAfterSteps, false);
        assert.equal(phase('after-destroy').visitorValidAfter, false);
        assert.equal(
            phase('after-destroy').positionAfter,
            null,
            'Destroyed Node position observation is actual null, never fabricated numeric coordinates',
        );
        assert.equal(
            phase('after-destroy').events.length,
            0,
            'Destruction is not natural separation or continued stay',
        );
        assert.equal(of(phase('replacement-enter').events, 'replacement', 'onTriggerEnter').length, 1);
        assert.equal(of(phase('replacement-stay').events, 'replacement', 'onTriggerStay').length, 6);
        assert(
            !events.some(
                (event) =>
                    event.tick > report.destroyRequestedAt && (event.self === 'visitor' || event.other === 'visitor'),
            ),
        );
        return;
    }
    if (report.mode === 'once-only') {
        assert.equal(events.length, 2, 'Only one once-enter per side across real exit/reentry');
        assert(events.every((event) => event.type === 'onTriggerEnter'));
        assert.deepEqual(report.onceNeedFlags, [false, false]);
        assert(phase('exit').positionAfter[0] > 2.5, 'Once-only visitor actually separated');
        assert(Math.abs(phase('reenter').positionAfter[0]) < 1.5, 'Once-only visitor actually reentered');
        return;
    }
    const children = report.mode === 'compound' ? ['visitor-child-0', 'visitor-child-1'] : ['visitor'];
    for (const child of children) {
        const childEvents = events.filter((event) => event.self === child);
        assert.equal(of(phase('enter').events, child, 'onTriggerEnter').length, 1);
        assert.equal(
            of(phase('stay').events, child, 'onTriggerStay').length,
            12,
            'Continuous overlap needs exactly one stay per fixed tick',
        );
        assert.equal(of(phase('exit').events, child, 'onTriggerExit').length, 1);
        const exit = of(childEvents, child, 'onTriggerExit')[0];
        assert(
            !childEvents.some((event) => event.tick === exit.tick && event.type === 'onTriggerStay'),
            'Natural separation tick must not also stay',
        );
    }
    assert.equal(phase('separated').events.length, 0, 'No fabricated events after natural separation');
    for (const event of events) {
        if (report.mode === 'lifecycle' && phase('visitor-off').events.includes(event)) continue;
        assert(
            events.some(
                (peer) =>
                    peer.tick === event.tick &&
                    peer.type === event.type &&
                    peer.self === event.other &&
                    peer.other === event.self,
            ),
            'Both subscribed valid sides require reciprocal delivery',
        );
    }
    if (report.mode === 'lifecycle') {
        for (const self of ['sensor', 'visitor']) {
            const rebuild = phase('overlapping-size-rebuild').events;
            assert.equal(
                of(rebuild, self, 'onTriggerEnter').length,
                0,
                'Same logical overlapping collider must not reenter merely because native shape rebuilt',
            );
            assert.equal(of(rebuild, self, 'onTriggerExit').length, 0);
            assert.equal(of(rebuild, self, 'onTriggerStay').length, 8);
            assert.equal(of(phase('reenabled').events, self, 'onTriggerEnter').length, 1);
            assert.equal(of(phase('reenabled').events, self, 'onTriggerStay').length, 4);
            assert.equal(of(phase('reenter').events, self, 'onTriggerEnter').length, 1);
        }
        assert.equal(phase('disabled').events.length, 0, 'Disable clears pair without synthetic natural exit');
        assert.deepEqual(report.counts, {
            onceEnter: 1,
            onceStay: 1,
            onceExit: 1,
            offInsideStay: 1,
            removedBeforeEnter: 0,
            destructionRequests: 0,
            faultCalls: 0,
        });
        assert.equal(of(phase('visitor-off').events, 'sensor', 'onTriggerStay').length, 4);
        assert.equal(phase('visitor-off').events.filter((event) => event.self === 'visitor').length, 0);
        assert.equal(phase('both-off').events.length, 0);
        assert.equal(report.visitorNeedTriggerAfterOff, false);
        assert.equal(report.sensorNeedTriggerAfterOff, false);
    }
    if (report.mode === 'compound') {
        const enters = of(phase('enter').events, 'sensor', 'onTriggerEnter');
        assert.deepEqual(
            enters.map((event) => event.other).sort(),
            children,
            'Different public compound children must not collapse to one body pair',
        );
        assert.equal(new Set(enters.map((event) => event.impl.logicalPair)).size, 2);
    }
}
