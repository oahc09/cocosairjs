import {test} from 'node:test';import assert from 'node:assert/strict';import {InZonePreset} from '../src/preset.mjs';
const make=(kind='mask')=>new InZonePreset({kind,generation:2,self:'zone2',other:'visitor2',originalValue:kind==='mask'?1:true});
const event={accepted:true,kind:'enter',generation:2,self:'zone2',other:'visitor2',hookTick:100};
test('anchor only authentic accepted pair enter, once; +2/+4 exact fixed hook ticks',()=>{
 const p=make();for(const e of [{...event,accepted:false},{...event,kind:'stay'},{...event,generation:1},{...event,self:'wrong'},{...event,other:'old'}])assert.equal(p.anchor(e),false);
 assert.equal(p.anchor(event),true);assert.equal(p.anchor({...event,hookTick:101}),false);
 assert.deepEqual(p.due(101,2,true),[]);const [a]=p.due(102,2,true);assert.equal(a.value,0);assert.equal(p.canApply(a,102,2,true),true);
 p.applied(a,102,1,0,{x:-2});assert.deepEqual(p.due(102,2,true),[]);
 const [b]=p.due(104,2,true);assert.equal(b.value,1);p.applied(b,104,0,1,{x:-1.9});
 assert.equal(p.state,'COMPLETE');assert.equal(p.blocksManual,false);assert.equal(p.anchor({...event,hookTick:105}),false);
 assert.deepEqual(p.records.slice(1).map(r=>[r.requestTick,r.dueTick,r.actualIdleHookTick]),[[100,102,102],[100,104,104]]);
});
test('reset/close/retire cancellation prevents queued stale mutation and replay',()=>{
 for(const reason of ['reset','close','actor-retired']){
  const p=make();p.anchor(event);const [a]=p.due(102,2,true);p.cancel(reason,102);
  assert.equal(p.canApply(a,102,2,true),false);assert.deepEqual(p.due(104,2,true),[]);assert.equal(p.state,'CANCELLED');assert.equal(p.anchor(event),false);
 }
});
test('wrong generation, missing due tick, retired actor and delayed idle fail closed',()=>{
 for(const [tick,generation,alive] of [[102,3,true],[103,2,true],[102,2,false]]){
  const p=make();p.anchor(event);assert.deepEqual(p.due(tick,generation,alive),[]);assert.equal(p.state,'CANCELLED');
 }
 const p=make();p.anchor(event);const [a]=p.due(102,2,true);assert.equal(p.canApply(a,103,2,true),false);
});
test('disable/trigger restore original value, never manufacture a new enter',()=>{
 for(const kind of ['enabled','trigger']){
  const p=make(kind);p.anchor(event);assert.equal(p.actions[0].value,false);assert.equal(p.actions[1].value,true);
  for(const tick of [102,104]){const [a]=p.due(tick,2,true);p.applied(a,tick,!a.value,a.value,{x:12});}
  assert.equal(p.state,'COMPLETE');assert.equal(p.records.filter(r=>r.kind==='anchor').length,1);
  assert.equal(p.records.some(r=>r.kind==='enter'),false);
 }
 assert.throws(()=>make('eval'),/Unknown/);
});
import {sphereBoxOverlap} from '../src/preset.mjs';
test('restore-time overlap is geometry observation, not guaranteed native enter',()=>{
 const base={boxPosition:{x:-2,y:0,z:0},radius:.15,halfSize:{x:.5,y:.5,z:.4}};
 assert.equal(sphereBoxOverlap({...base,spherePosition:{x:-2,y:0,z:0}}).intersects,true);
 assert.equal(sphereBoxOverlap({...base,spherePosition:{x:0,y:0,z:0}}).intersects,false);
 assert.equal(sphereBoxOverlap({...base,spherePosition:{x:-2,y:0,z:2}}).intersects,false);
 assert.throws(()=>sphereBoxOverlap({...base,spherePosition:{x:NaN,y:0,z:0}}),/Invalid/);
});
