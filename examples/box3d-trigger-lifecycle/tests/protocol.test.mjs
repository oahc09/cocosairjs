import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PairLedger, clock, assertClock, NATIVE_DT, MODES, IdleQueue } from '../src/protocol.mjs';
const setup = () => { const p = new PairLedger(7); p.register('zone#1'); p.register('visitor#2'); return p; };
const event = (kind, hookTick = 1, extra = {}) => ({ kind, channelEpoch:0, hookTick, hookAttempt: hookTick, generation: 7, self: 'zone#1', other: 'visitor#2', ...extra });
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
test('successful disable silently retires app pair; restored overlap enters new application epoch',()=>{
 const p=setup(); let enabled=true;
 const set=(value,tick)=>p.applyEnabled('zone#1',value,()=>enabled,v=>{enabled=v;},{generation:7,hookTick:tick,hookAttempt:tick});
 p.accept(event('enter',609));p.accept(event('stay',610));p.accept(event('stay',611));
 assert.equal(set(false,611),true);assert.equal(p.pairs.size,0);assert.equal(p.channelEpoch('zone#1'),1);
 assert.equal(p.accept(event('stay',612)).reason,'stale-application-channel');
 assert.equal(p.accept(event('enter',612,{channelEpoch:1})).reason,'disabled-application-channel');
 assert.equal(set(true,613),false);
 assert.equal(p.accept(event('enter',614,{channelEpoch:1})).accepted,true);
 assert.equal(p.accept(event('enter',615,{channelEpoch:1})).reason,'duplicate-enter');
 assert.equal(p.accept(event('exit',615)).reason,'stale-application-channel');
 assert.equal(p.accept(event('stay',615,{channelEpoch:1})).accepted,true);
 assert.equal(p.accept(event('exit',616,{channelEpoch:1})).accepted,true);
 assert.equal(p.accept(event('stay',617,{channelEpoch:1})).reason,'orphan-stay');
 assert.deepEqual(p.counts,{enter:2,stay:3,exit:1});
 const invalidation=p.rows.find(r=>r.kind==='application-channel-invalidated');
 assert.equal(invalidation.nativeEvent,false);assert.deepEqual(invalidation.removed,['visitor#2|zone#1']);
});
test('throwing setter or mismatched getter never preemptively invalidates pair',()=>{
 for(const write of [()=>{throw Error('setter fault');},()=>{}]) {
  const p=setup();p.accept(event('enter'));
  assert.throws(()=>p.applyEnabled('zone#1',false,()=>true,write,{generation:7,hookTick:2,hookAttempt:2}));
  assert.equal(p.channelEpoch('zone#1'),0);assert.equal(p.pairs.size,1);
  assert.equal(p.rows.some(r=>r.kind==='application-channel-invalidated'),false);
 }
});
test('no-op and invalid generation never create an epoch; repeated cycles preserve old closure rejection',()=>{
 const p=setup();let enabled=true; const apply=(v,g=7)=>p.applyEnabled('zone#1',v,()=>enabled,n=>{enabled=n;},{generation:g,hookTick:2,hookAttempt:2});
 assert.equal(apply(true),false);assert.equal(p.channelEpoch('zone#1'),0);
 assert.throws(()=>apply(false,6));assert.equal(enabled,true);
 apply(false);assert.equal(apply(false),false);apply(true);apply(false);apply(true);
 assert.equal(p.channelEpoch('zone#1'),2);
 assert.equal(p.accept(event('enter',3,{channelEpoch:1})).reason,'stale-application-channel');
 assert.equal(p.accept(event('stay',3,{channelEpoch:2})).reason,'orphan-stay');
 assert.equal(p.accept(event('enter',3,{channelEpoch:2})).accepted,true);
 assert.equal(p.accept(event('enter',3,{channelEpoch:2})).reason,'duplicate');
 assert.equal(p.accept(event('stay',4,{channelEpoch:undefined})).reason,'stale-application-channel');
});
test('pre-first-hook manual disable uses explicit paired sentinel; malformed sentinel rejected',()=>{
 const p=setup();let enabled=true;
 const apply=(t,a,v)=>p.applyEnabled('zone#1',v,()=>enabled,n=>{enabled=n;},{generation:7,hookTick:t,hookAttempt:a});
 for(const [t,a] of [[-2,-2],[-1,0],[0,-1],[NaN,0]])assert.throws(()=>apply(t,a,false));
 assert.equal(enabled,true);assert.equal(p.channelEpoch('zone#1'),0);
 assert.equal(apply(-1,-1,false),true);assert.equal(p.rows.at(-1).clockAssociation,'PRE_FIRST_HOOK_NO_NATIVE_TICK');
 assert.equal(p.rows.at(-1).hookTick,-1);apply(-1,-1,true);
 assert.equal(p.accept(event('enter',0,{channelEpoch:1})).accepted,true);
});
