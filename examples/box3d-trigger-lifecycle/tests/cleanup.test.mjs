import {test} from 'node:test';import assert from 'node:assert/strict';
import {releaseOwned,attemptStops,CloseOnce,mountOwned} from '../src/cleanup.mjs';
function fixture({unmounted=false,orphan=false,failFirst=false,assetThrows=false,flushStuck=false,sceneStuck=false}={}) {
 const calls=[],rows=[],pending=new Set();let releases=0;
 const object=(label)=>({isValid:true,parent:null,destroy(){calls.push(label+'.destroy');if(label==='asset'&&assetThrows)throw Error('destroy failure');pending.add(this);}});
 const scene=object('scene'),node=object('node'),asset=object('asset');node.parent=orphan?null:scene;
 let current=unmounted?null:scene;
 const app={getScene:()=>current,async releaseScene(){calls.push('release');releases++;
  if(releases===1&&failFirst)return {status:'failed'};
  if(current?.isValid){current.destroy();current=null;}
  if(!(flushStuck&&releases===2))for(const item of [...pending]){
   if(item===scene&&sceneStuck)continue;
   item.isValid=false;pending.delete(item);if(item===scene&&node.parent===scene)node.isValid=false;
  }
  return {status:'released'};
 }};
 return {app,scene,nodes:[node],assets:[asset],record:row=>rows.push(row),calls,rows,pending,node,asset};
}
test('mounted release -> owned assets destroy -> second public flush; no pending asset at completion',async()=>{
 const f=fixture();await releaseOwned(f);assert.deepEqual(f.calls,['release','scene.destroy','asset.destroy','release']);
 assert.equal(f.pending.size,0);assert.equal(f.assets.length,0);assert.equal(f.nodes.length,0);
});
test('pre-run Scene and unattached Node are explicitly destroyed then public-flushed',async()=>{
 const f=fixture({unmounted:true,orphan:true});await releaseOwned(f);
 assert.deepEqual(f.calls,['scene.destroy','node.destroy','release','asset.destroy','release']);assert.equal(f.scene.isValid,false);assert.equal(f.node.isValid,false);
});
test('run failure after app takes ownership uses public scene release, not separate mounted destruction',async()=>{
 const f=fixture();await releaseOwned(f);assert.equal(f.calls[0],'release');assert.equal(f.calls.filter(x=>x==='scene.destroy').length,1);
});
test('failed first receipt or still-valid scene retains node/asset identities and avoids premature asset destruction',async()=>{
 for(const options of [{failFirst:true},{sceneStuck:true}]){const f=fixture(options);await assert.rejects(releaseOwned(f),/Scene\/node cleanup/);
  assert.equal(f.nodes[0],f.node);assert.equal(f.assets[0],f.asset);assert.ok(!f.calls.includes('asset.destroy'));}
});
test('asset destroy failure still public-flushes other requests and retains valid identity',async()=>{
 const f=fixture({assetThrows:true});await assert.rejects(releaseOwned(f),/Asset cleanup/);assert.equal(f.assets[0],f.asset);assert.equal(f.calls.at(-1),'release');
 assert.deepEqual(f.rows.find(row=>row.phase==='scene-and-unowned-nodes').destroyErrors,[]);
});
test('second released receipt cannot conceal still-valid deferred asset',async()=>{
 const f=fixture({flushStuck:true});await assert.rejects(releaseOwned(f),/Asset cleanup/);assert.equal(f.assets[0],f.asset);assert.equal(f.pending.size,1);
});
test('a refused stop does not skip remaining stops or public teardown',async()=>{
 const calls=[],errors=attemptStops([()=>{calls.push('hook');throw Error('owner fault');},()=>calls.push('target')]);
 assert.deepEqual(calls,['hook','target']);assert.equal(errors.length,1);const f=fixture();await releaseOwned(f);assert.equal(f.assets.length,0);
});
test('SDK close is terminal after failed receipt, rejection, or synchronous throw; never retried',async()=>{
 for(const close of [()=>({status:'failed'}),()=>Promise.reject(Error('rejected')),()=>{throw Error('sync');}]){
  const gate=new CloseOnce();let calls=0;const app={close(){calls++;return close();}};
  await assert.rejects(gate.invoke(app,()=>{}));assert.equal(gate.started,true);
  await assert.rejects(gate.invoke(app,()=>{}),/already invoked/);assert.equal(calls,1);
 }
});
test('pre-SDK cleanup failure leaves Close admission available; success invokes SDK once after two releases',async()=>{
 const gate=new CloseOnce(),failed=fixture({failFirst:true});await assert.rejects(releaseOwned(failed));assert.equal(gate.started,false);
 const f=fixture();f.app.close=async()=>{f.calls.push('close');return {status:'released'};};
 await releaseOwned(f);await gate.invoke(f.app,f.record);assert.equal(gate.started,true);
 assert.deepEqual(f.calls,['release','scene.destroy','asset.destroy','release','close']);
 await assert.rejects(gate.invoke(f.app,f.record),/already invoked/);
});
test('missing public close does not falsely mark a cached SDK call',async()=>{
 const gate=new CloseOnce();await assert.rejects(gate.invoke({},()=>{}),/unavailable/);assert.equal(gate.started,false);
});

test('construction and app.run failures immediately clean tracked allocations while preserving original error',async()=>{
 for(const unmounted of [true,false]) {
  const f=fixture({unmounted,orphan:unmounted});
  await assert.rejects(mountOwned(()=>{throw Error('construction/onLoad');},()=>releaseOwned(f),f.record),/construction\/onLoad/);
  assert.equal(f.scene.isValid,false);assert.equal(f.node.isValid,false);assert.equal(f.asset.isValid,false);
  assert.equal(f.rows[0].kind,'mount-failed');
 }
});
test('construction plus cleanup failures both retained and owned references preserved',async()=>{
 const f=fixture({unmounted:true,failFirst:true});
 await assert.rejects(mountOwned(()=>{throw Error('construction');},()=>releaseOwned(f),f.record),error=>error instanceof AggregateError&&error.errors.length===2);
 assert.equal(f.rows.at(-1).kind,'mount-cleanup-failed');assert.equal(f.assets[0],f.asset);
});
import {readFileSync} from 'node:fs';
test('live wiring registers Node/Material/Mesh before fallible setup and uses public cleanup helpers',()=>{
 const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8'),cleanup=readFileSync(new URL('../src/cleanup.mjs',import.meta.url),'utf8');
 assert.match(main,/new Material\(\); assets\.push\(m\); m\.initialize/);
 assert.match(main,/new Mesh\(\); assets\.push\(mesh\);/);
 assert.match(main,/new Node\(name\);ownedNodes\.push\(node\);node\.active=false/);
 assert.equal((main.match(/new Node\(/g)??[]).length,1);
 assert.match(main,/await mountOwned\(/);assert.match(main,/nodes:ownedNodes,assets/);
 assert.ok(main.indexOf('await release(true); // scene')<main.indexOf('await closeOnce.invoke'));
 assert.doesNotMatch(main+cleanup,/\._deferredDestroy\(|\._flushAirReleaseQueue\(/);
 assert.doesNotMatch(main,/failed.*retry Close/i);
});
