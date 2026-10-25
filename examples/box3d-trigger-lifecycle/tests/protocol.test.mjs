import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PairLedger, clock, assertClock, NATIVE_DT, MODES, IdleQueue } from '../src/protocol.mjs';
const setup = () => { const p = new PairLedger(7); p.register('zone#1'); p.register('visitor#2'); return p; };
const event = (kind, hookTick = 1, extra = {}) => ({ kind, hookTick, hookAttempt: hookTick, generation: 7, self: 'zone#1', other: 'visitor#2', ...extra });
test('enter/stay/exit correspond exactly to accepted UI counters', () => {
 const p = setup(); ['enter','stay','exit'].forEach((k,i) => assert.equal(p.accept(event(k,i+1)).accepted,true));
 assert.deepEqual(p.counts,{enter:1,stay:1,exit:1}); assert.equal(p.pairs.size,0);
});
test('orphan stays and exits, duplicates, malformed clocks fail closed', () => {
 const p = setup(); assert.equal(p.accept(event('stay')).reason,'orphan-stay');
 assert.equal(p.accept(event('exit')).reason,'orphan-exit');
 p.accept(event('enter')); assert.equal(p.accept(event('enter')).reason,'duplicate');
 assert.equal(p.accept(event('enter',2)).reason,'duplicate-enter');
 assert.equal(p.accept(event('stay',NaN)).reason,'invalid-event');
 assert.deepEqual(p.counts,{enter:1,stay:0,exit:0});
});
test('retired/reused native-like labels cannot contaminate new application identity', () => {
 const p = setup(); p.accept(event('enter')); p.retire('visitor#2'); p.register('visitor#3');
 assert.equal(p.accept(event('stay',2)).reason,'retired-or-unknown-identity');
 assert.equal(p.accept(event('exit',2)).accepted,false);
 assert.equal(p.accept(event('stay',2,{other:'visitor#3'})).reason,'orphan-stay');
 assert.equal(p.accept(event('enter',2,{other:'visitor#3'})).accepted,true);
 assert.equal(p.accept(event('enter',3,{generation:6})).reason,'wrong-generation');
});
test('exact float32 clock and frozen thin comparison configuration', () => {
 assertClock(clock({fixedDt:NATIVE_DT, solverSubSteps:4,tickIndex:0,attemptId:1}));
 assert.throws(() => assertClock(clock({fixedDt:1/60, solverSubSteps:4,tickIndex:0,attemptId:1})));
 assert.throws(() => assertClock(clock({fixedDt:NATIVE_DT, solverSubSteps:1,tickIndex:0,attemptId:1})));
 assert.equal(MODES['fast-solid'].speed,30); assert.equal(MODES['moving-sensor'].thickness,.01);
});
test('failure and queued reset do not hang following close; rejection retained by caller', async () => {
 const q = new IdleQueue(), rows=[];
 const failed=q.enqueue(() => { rows.push('reset'); throw Error('release fault'); });
 const close=q.enqueue(() => rows.push('close'));
 await assert.rejects(failed,/release fault/); await close; assert.deepEqual(rows,['reset','close']);
});
test('application IDs never reused; out-of-order lifecycle rejected', () => {
 const p=setup(); p.accept(event('enter',4)); assert.equal(p.accept(event('stay',3)).reason,'out-of-order');
 p.retire('visitor#2'); assert.throws(()=>p.register('visitor#2'),/Reused/);
});
