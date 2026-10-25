import {test} from 'node:test';
import assert from 'node:assert/strict';
import {predictEndpoints,canAvoidAllSubstepEndpoints,nativeExtent,DT32,SUBSTEP_DT32} from '../src/thin-path.mjs';
test('sealed 3b path is a discrete-overlap negative control, not transient proof',()=>{
 const p=predictEndpoints({speed:30,start:-2});
 assert.equal(p.displacement32,.125);assert.deepEqual(p.tickOverlaps.map(s=>s.substep),[16]);
 assert.deepEqual(p.substepOverlaps.map(s=>s.substep),[15,16,17]);assert.equal(p.samples[16].x,0);
});
test('keeping 30 and shifting start removes tick overlap but cannot eliminate substep confound',()=>{
 const p=predictEndpoints({speed:30,start:-2.25});assert.equal(p.tickOverlaps.length,0);
 assert.deepEqual(p.substepOverlaps.map(s=>s.substep),[17,18,19]);
 assert.equal(canAvoidAllSubstepEndpoints(30),false);assert.ok(.125 < 2*nativeExtent());
});
test('explicit 120 diagnostic shifted path avoids all ideal float32 substep endpoints',()=>{
 const p=predictEndpoints({speed:120,start:-8.25});assert.equal(p.displacement32,.5);
 assert.equal(p.traverses,true);assert.equal(p.tickOverlaps.length,0);assert.equal(p.substepOverlaps.length,0);
 assert.equal(p.samples.length,97);assert.equal(p.samples[16].x,-.25);assert.equal(p.samples[17].x,.25);
 assert.equal(p.minimumClearance,.25-nativeExtent());assert.ok(p.minimumClearance>0);
 assert.equal(canAvoidAllSubstepEndpoints(120),true);
});
test('120 alone is insufficient: unshifted start still admits discrete overlap',()=>{
 const p=predictEndpoints({speed:120,start:-8});assert.equal(p.samples[16].x,0);assert.equal(p.tickOverlaps.length,1);
});
test('exact f32 timestep/geometry contract, no widened overlap tolerance',()=>{
 assert.equal(DT32,.01666666753590107);assert.equal(SUBSTEP_DT32,.004166666883975267);
 assert.equal(nativeExtent(),.15500000584870577);
 assert.throws(()=>predictEndpoints({speed:NaN,start:-2}));
});
import {predictTargetEndpoints,qualifyThinTick,pathFor,qualifyThinBefore} from '../src/thin-path.mjs';
import {MODES} from '../src/protocol.mjs';
test('source-derived target velocity rounding still clears every diagnostic substep',()=>{
 const p=predictTargetEndpoints(MODES['moving-sensor-transient120']);
 assert.equal(p.samples.length,97);assert.equal(p.tickOverlaps.length,0);assert.equal(p.substepOverlaps.length,0);
 assert.equal(Math.min(...p.samples.map(s=>Math.abs(s.x))),.2499995231628418);
 assert.equal(p.minimumClearance,.2499995231628418-nativeExtent());
 assert.equal(Math.min(...p.samples.slice(1).map(s=>s.velocity)),119.99999237060547);
 assert.equal(Math.max(...p.samples.slice(1).map(s=>s.velocity)),120.00010681152344);
});
test('new modes are explicit: baseline 30/start -2 not silently overwritten',()=>{
 assert.equal(MODES['fast-solid'].speed,30);assert.equal(MODES['fast-solid'].start,-2);assert.equal(MODES['fast-solid'].diagnostic,false);
 assert.equal(MODES['moving-sensor'].speed,30);assert.equal(MODES['moving-sensor'].start,-2);
 for(const name of ['fast-solid-transient120','moving-sensor-transient120']) {
  assert.equal(MODES[name].speed,120);assert.equal(MODES[name].start,-8.25);assert.equal(MODES[name].ticks,24);
  assert.equal(MODES[name].thickness,.01);assert.equal(MODES[name].diagnostic,true);assert.equal(pathFor(MODES[name]).substepOverlaps.length,0);
 }
});
const config=MODES['fast-solid-transient120'];
const observed={step:4,generation:2,hookTick:123,hookAttempt:125,beforeQualification:{step:4,generation:2,hookTick:123,hookAttempt:125,status:'MATCHES_SOURCE_MODEL'},priorTicksQualified:true,movingX:-.25,movingVelocityX:120,staticX:0,staticVelocityX:0,
 axisAligned:true,configurationMatches:true,nativeMotionMatches:true,committedGeometryMatches:true,unexpectedPeer:false};
test('exact telemetry matches source model without claiming any native hit',()=>{
 const row=qualifyThinTick(observed,config);assert.equal(row.status,'MATCHES_SOURCE_MODEL');
 assert.equal(row.hiddenNativeSubsteps,'NOT_DIRECTLY_OBSERVED');assert.equal(row.nativeEventRequirement,'REVIEW_RAW_EVENTS_SEPARATELY');
 assert.equal(row.observedEndpointClearance,.25-nativeExtent());
});
test('each altered/missing assumption fails closed, no expanded tolerance',()=>{
 const changes=[{step:0},{movingX:-.25+Number.EPSILON},{movingVelocityX:119.99999},{staticX:.001},{staticVelocityX:1},
  {beforeQualification:undefined},{beforeQualification:{step:3,status:'MATCHES_SOURCE_MODEL'}},{beforeQualification:{step:4,status:'INCONCLUSIVE'}},{priorTicksQualified:false},{nativeMotionMatches:false},{nativeMotionMatches:undefined},{axisAligned:false},{configurationMatches:false},{committedGeometryMatches:false},{unexpectedPeer:true},{movingX:NaN}];
 for(const change of changes) assert.equal(qualifyThinTick({...observed,...change},config).status,'INCONCLUSIVE',JSON.stringify(change));
});
test('30 baseline remains classified as substep-overlap confounded even with correct telemetry',()=>{
 const row=qualifyThinTick({...observed,movingX:0,movingVelocityX:30},MODES['fast-solid']);
 assert.equal(row.status,'MATCHES_SOURCE_MODEL');assert.equal(row.predictedSubstepsOverlap,true);assert.ok(row.observedEndpointClearance<0);
});
function beforeFixture(config,step=1) {
 const expected=pathFor(config).samples[(step-1)*4], moving=config.mover==='sensor';
 const vector=(x=0,y=0,z=0)=>({x,y,z}),rotation=()=>({x:0,y:0,z:0,w:1});
 const actor=(id,x,v,kind,bodyType,trigger,ccd)=>({id,state:'live',bodyType,
  body:{enabled:true,massPending:false,type:bodyType==='static'?0:bodyType==='kinematic'?1:2,position:vector(x),linearVelocity:vector(v),angularVelocity:vector(),localCenter:vector(),worldCOM:vector(x),rotation:rotation()},
  geometry:{kind,center:vector(),radius:kind==='sphere'?.15:null,size:kind==='box'?vector(.01,1,.8):null},nodeScale:vector(1,1,1),
  linearDamping:0,angularDamping:0,useGravity:false,allowSleep:false,enabled:true,group:1,mask:1,isTrigger:trigger,ccdReadback:ccd});
 const visitor=actor('visitor',moving?0:expected.x,moving?0:config.speed,'sphere',moving?'static':'dynamic',false,!moving);
 const countZone=actor('sensor',moving?expected.x:0,moving?expected.velocity:0,'box',moving?'kinematic':'static',true,false);
 const child=a=>({id:a.id,kind:a.geometry.kind,origin:{...a.body.position},rotation:{...a.body.rotation},dimensions:a===visitor?[Math.fround(.15)]:[Math.fround(.005),.5,Math.fround(.4)]});
 const stamp={worldGeneration:1,tickIndex:123,attemptId:125,nativeStepIndex:step-1,nativeMutationRevision:20,complete:true};
 return {step,generation:2,hookTick:123,hookAttempt:125,initialMasks:[1,1],pair:{visitor,countZone},
  query:{...stamp,applicationGeneration:2,source:moving?'sensor':'visitor',children:[child(moving?countZone:visitor)],
   pairGeometry:{...stamp,children:[child(visitor),child(countZone)]}}};
}
test('before-step initial and subsequent endpoints qualify both bodies, geometry, phase and clock',()=>{
 for(const name of ['fast-solid-transient120','moving-sensor-transient120'])for(const step of [1,2,5,24]) {
  const config=MODES[name],row=beforeFixture(config,step),result=qualifyThinBefore(row,config);
  assert.equal(result.status,'MATCHES_SOURCE_MODEL',JSON.stringify(result));
  assert.equal(result.expectedVelocityPhase,'PREVIOUS_COMMITTED_TICK_BEFORE_CURRENT_TARGET_APPLY');
 }
 const sensor=qualifyThinBefore(beforeFixture(MODES['moving-sensor-transient120']),MODES['moving-sensor-transient120']);
 assert.equal(sensor.expectedVelocity,0);
});
test('wrong initial pose/config cannot qualify even if a later post endpoint fully recovers',()=>{
 const row=beforeFixture(config);row.pair.visitor.body.position.x=-8;row.pair.visitor.body.worldCOM.x=-8;
 row.query.pairGeometry.children[0].origin.x=-8;row.query.children[0].origin.x=-8;
 const before=qualifyThinBefore(row,config);assert.equal(before.status,'INCONCLUSIVE');assert.ok(before.failures.includes('before-moving-x'));
 const post=qualifyThinTick({...observed,step:1,movingX:-6.25,beforeQualification:before},config);
 assert.equal(post.status,'INCONCLUSIVE');assert.ok(post.failures.includes('before-step-qualification'));
});
test('committed pose/rotation, missing data, changed before config and epochs fail closed',()=>{
 const edits=[
  r=>r.query.pairGeometry.children[0].origin.x+=.01,
  r=>r.query.pairGeometry.children[1].rotation.z=.1,
  r=>r.query.children[0].origin.x+=.01,
  r=>r.pair.visitor.body.rotation.x=.1,
  r=>r.pair.visitor.geometry.center.x=.01,
  r=>r.pair.visitor.ccdReadback=false,
  r=>r.pair.countZone.enabled=false,
  r=>r.pair.visitor.linearDamping=.1,
  r=>r.pair.visitor.bodyType='static',
  r=>delete r.pair.visitor.body.worldCOM,
  r=>delete r.pair.visitor.body.enabled,
  r=>r.pair.countZone.body.enabled=false,
  r=>delete r.pair.countZone.body.massPending,
  r=>r.pair.visitor.body.massPending=true,
  r=>r.pair.visitor.body.type=1,
  r=>delete r.pair.countZone.body.type,
  r=>delete r.query.pairGeometry,
  r=>delete r.initialMasks,
  r=>delete r.pair,
  r=>delete r.generation,
  r=>r.query.pairGeometry.complete=false,
  r=>r.query.pairGeometry.tickIndex++,
  r=>r.query.tickIndex++,
  r=>r.query.applicationGeneration++,
 ];
 for(const edit of edits){const row=beforeFixture(config);edit(row);assert.equal(qualifyThinBefore(row,config).status,'INCONCLUSIVE',String(edit));}
 assert.equal(qualifyThinBefore(undefined,config).status,'INCONCLUSIVE');
});
test('sensor before velocity is previous commit, not pending target velocity; history failure stays latched',()=>{
 const config=MODES['moving-sensor-transient120'];
 const row=beforeFixture(config);row.pair.countZone.body.linearVelocity.x=pathFor(config).samples[4].velocity;
 assert.equal(qualifyThinBefore(row,config).status,'INCONCLUSIVE');
 const later=beforeFixture(config,5),before=qualifyThinBefore(later,config),endpoint=pathFor(config).samples[20];
 const result=qualifyThinTick({...observed,step:5,beforeQualification:before,priorTicksQualified:false,movingX:endpoint.x,movingVelocityX:endpoint.velocity},config);
 assert.equal(result.status,'INCONCLUSIVE');assert.ok(result.failures.includes('prior-ticks-qualified'));
});
