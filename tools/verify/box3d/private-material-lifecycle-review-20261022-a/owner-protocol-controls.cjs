'use strict';
// Exact frozen owner source, actual B0/identity/value registries. Engine/native/queue/barriers are mocks.
const fs=require('fs'), path=require('path'), vm=require('vm'), crypto=require('crypto'), assert=require('assert/strict');
const base=path.resolve(__dirname,'..'), tree=path.join(base,'box3d-rebuild-20261022'), frozen=path.join(base,'box3d-private-material-integration-20261022/attempt-b-inputs');
const ts=require(path.join(tree,'node_modules/typescript'));
const hashes={}, results=[];
function test(name, fn){try{fn();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:String(error),stack:error.stack});}}
function throws(fn){let threw=false;try{fn();}catch(e){threw=true;}assert(threw,'expected refusal');}
function environment(){
 class Node{}; class Collider{constructor(node){this.node=node;}};class RigidBody{constructor(node){this.node=node;}};
 class PhysicsSystem{};
 class PhysicsMaterial{constructor(){this._objFlags=0;this.friction=.5;this.restitution=.1;this.rollingFriction=0;this.spinningFriction=0;}}
 class Queue{constructor(){this.closed=false;this.bodies=new Set();}registerBody(x){this.bodies.add(x);}releaseBodyAfterTeardown(x){this.bodies.delete(x);}close(){this.closed=true;}diagnostics(){return{pending:[],phase:this.closed?'closed':'ready',preparedControl:false};}}
 const modules=new Map();
 const mock={
  '../../../cocos/scene-graph/node':{Node},
  '../../../cocos/physics/framework/physics-system':{PhysicsSystem},
  '../../../cocos/physics/framework/components/rigid-body':{RigidBody},
  '../../../cocos/physics/framework/components/colliders/collider':{Collider},
  '../../../cocos/physics/framework/assets/physics-material':{PhysicsMaterial},
  '../../../cocos/core/data/object':{CCObjectFlags:{Destroyed:1,ToDestroy:2,Destroying:4}},
  '../../../cocos/scene-graph/node-transform-validation':{registerNodeTransformGuard:()=>({dispose(){},write(){throw Error('not in scope');}})},
  './command-queue':{Box3DCommandQueue:Queue},
  '../../../cocos/physics/framework/physics-system-control':{registerPhysicsSystemControl(){throw Error('not in scope');}},
  './unsupported':{unsupportedBox3D(v){throw Error(v);}},
  './world-binding':{worldError:(code,op,msg)=>Object.assign(Error(op+': '+msg),{code}),copySurfaceMaterial(m){const friction=Math.fround(m.friction),restitution=Math.fround(m.restitution);if(!Number.isFinite(friction)||!Number.isFinite(restitution)||friction<0||restitution<0)throw Error('bad material');return Object.freeze({friction,restitution});}},
 };
 function load(rel){if(modules.has(rel))return modules.get(rel).exports;const file=fs.existsSync(path.join(frozen,rel))?path.join(frozen,rel):path.join(tree,rel);const code=fs.readFileSync(file,'utf8');hashes[rel]=crypto.createHash('sha256').update(code).digest('hex');const mod={exports:{}};modules.set(rel,mod);const out=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},fileName:file}).outputText;const req=(id)=>{if(mock[id])return mock[id];let next=path.posix.normalize(path.posix.join(path.posix.dirname(rel),id));if(!next.endsWith('.ts'))next+='.ts';return load(next);};vm.runInThisContext('(function(require,module,exports){'+out+'\n})',{filename:file})(req,mod,mod.exports);return mod.exports;}
 const {Box3DWorldCommandOwner:Owner}=load('src/air/physics/box3d/world-command-owner.ts');
 const identity=load('src/cocos/physics/framework/physics-material-transaction.ts');
 const values=load('src/cocos/physics/framework/physics-material-values.ts');
 const system=new PhysicsSystem(), world={};PhysicsSystem.instance=system;system.physicsWorld=world;
 const owner=new Owner(1,system,world), cacheCommits=[], faults=[];
 owner.installMaterialObservation(()=>{},e=>{faults.push(e);owner.fault();},(material,includeDefault,components)=>({native:[],commitCaches(){cacheCommits.push({includeDefault,components:components.length});for(const c of components)c.commitCaches();}}));
 const material=()=>new PhysicsMaterial();
 const makeCollider=(asset)=>{const node=new Node(),component=new Collider(node),adapter={};let commits=0;
  const body=owner.adoptBody({node,ancestry:[node],preflight(){},readCommitted(){return{};},resolveNative(){return{};}});
  owner.attachComponent(body,{adapter,component,kind:'collider',material:asset,applyMaterial(authority,copied){owner.consumeMaterialAuthority(authority,adapter,copied);},prepareMaterialValues(authority,copied){const check=owner.consumeMaterialValuesPreparation(authority,adapter,copied);return{shape:null,commitCaches(){check();commits++;}};}});
  let actual=asset;
  const snapshot=()=>({kind:'collider-material',material:actual,shared:true});
  const initialize=()=>{const t=identity.beginPhysicsMaterialChange(component,'collider-material-initialize');try{t.prepare(()=>({before:snapshot(),candidate:snapshot()}));t.commit(snapshot);}catch(e){t.fail(e,snapshot);}finally{t.dispose();}};
  return{component,adapter,initialize,snapshot,setActual(v){actual=v;},commits:()=>commits};
 };
 const setDefault=(asset)=>{const t=identity.beginPhysicsMaterialChange(system,'system-default-material-set');let current=null;const snapshot=()=>({kind:'system-default-material',material:current});try{t.prepare(()=>({before:snapshot(),candidate:{kind:'system-default-material',material:asset}}));t.apply();current=asset;t.effect('cache-written');t.commit(snapshot);}catch(e){t.fail(e,snapshot);}finally{t.dispose();}};
 const tuple=a=>[a.friction,a.restitution,a.rollingFriction,a.spinningFriction];
 const changeValue=(asset, extra={})=>{const t=values.beginPhysicsMaterialValuesChange(asset);assert(t);let reads=0;try{t.prepare({read(){reads++;const before=tuple(asset);return{before,candidate:[.8,.1,0,0],changed:true,writeOnNoChange:false};},write(next,rec){asset.friction=next[0];rec.written();},readActual(){return tuple(asset);},emit(){extra.emit?.();}});t.apply();return{diag:t.diagnostics(),reads};}finally{t.dispose();}};
 return{owner,values,identity,system,world,material,makeCollider,setDefault,changeValue,cacheCommits,faults};
}
test('provisional explicit membership refuses value admission and destruction',()=>{const e=environment(),a=e.material();e.makeCollider(a);throws(()=>e.values.beginPhysicsMaterialValuesChange(a));throws(()=>e.values.assertPhysicsMaterialDestroyable(a));assert.equal(e.owner.diagnostics().privateMaterialValues.roster.bindings,1);});
test('actual initialize publication permits inactive prepared caches without native operation',()=>{const e=environment(),a=e.material(),c=e.makeCollider(a);c.initialize();const r=e.changeValue(a);assert.equal(r.diag.native.length,0);assert.equal(c.commits(),1);assert.equal(r.diag.phase,'committed');assert.equal(e.owner.diagnostics().phase,'idle');});
test('same asset default plus explicit uses one value owner scope and two cache roles',()=>{const e=environment(),a=e.material(),c=e.makeCollider(a);c.initialize();e.setDefault(a);const r=e.changeValue(a);assert.equal(r.diag.ownerCount,1);assert.equal(e.cacheCommits[0].includeDefault,true);assert.equal(e.cacheCommits[0].components,1);assert.equal(c.commits(),1);});
test('clone candidate accepted then failure retains both assets after component cleanup',()=>{const e=environment(),a=e.material(),c=e.makeCollider(a);c.initialize();const b=e.material(),t=e.identity.beginPhysicsMaterialChange(c.component,'collider-material-clone');t.prepare(()=>({before:c.snapshot(),candidate:c.snapshot()}));t.effect('clone-allocation-entered');t.acceptClone(b);throws(()=>t.fail(false,c.snapshot));t.dispose();assert.equal(e.owner.diagnostics().phase,'faulted');e.owner.releaseComponentAfterCleanup(c.adapter);throws(()=>e.values.assertPhysicsMaterialDestroyable(a));throws(()=>e.values.assertPhysicsMaterialDestroyable(b));assert.equal(e.owner.diagnostics().privateMaterialValues.roster.pending,1);e.owner.closeAfterWorldTeardown(true);e.values.assertPhysicsMaterialDestroyable(a);e.values.assertPhysicsMaterialDestroyable(b);});
test('successful clone switches exact membership only after actual identity publication',()=>{const e=environment(),a=e.material(),c=e.makeCollider(a);c.initialize();const b=e.material(),t=e.identity.beginPhysicsMaterialChange(c.component,'collider-material-clone');t.prepare(()=>({before:c.snapshot(),candidate:c.snapshot()}));t.effect('clone-allocation-entered');t.acceptClone(b);throws(()=>e.values.assertPhysicsMaterialDestroyable(b));c.setActual(b);t.effect('cache-written');t.commit(c.snapshot);t.dispose();e.values.assertPhysicsMaterialDestroyable(a);throws(()=>e.values.assertPhysicsMaterialDestroyable(b));e.changeValue(b);assert.equal(c.commits(),1);});
test('world teardown unknown retains initialized and pending asset blockers',()=>{const e=environment(),a=e.material(),c=e.makeCollider(a);c.initialize();e.owner.closeAfterWorldTeardown(false);assert.equal(e.owner.diagnostics().privateMaterialValues.roster.state,'closed-unknown');throws(()=>e.values.assertPhysicsMaterialDestroyable(a));throws(()=>e.values.beginPhysicsMaterialValuesChange(a));});
test('foreign System world binding refuses before source value read or write',()=>{const e=environment(),a=e.material();e.setDefault(a);e.system.physicsWorld={};throws(()=>e.changeValue(a));assert.equal(a.friction,.5);assert.equal(e.cacheCommits.length,0);assert.equal(e.owner.diagnostics().phase,'idle');});
test('idle component release removes only exact explicit membership and leaves default owner',()=>{const e=environment(),a=e.material(),c=e.makeCollider(a);c.initialize();e.setDefault(a);e.owner.releaseComponentAfterCleanup(c.adapter);assert.equal(e.owner.diagnostics().privateMaterialValues.roster.bindings,1);throws(()=>e.values.assertPhysicsMaterialDestroyable(a));e.owner.closeAfterWorldTeardown(true);e.values.assertPhysicsMaterialDestroyable(a);});
const report={schema:'exact-source-owner-protocol-controls/1',qualification:'ACTUAL_OWNER_AND_REGISTRIES_WITH_MOCK_ENGINE_ENVIRONMENT_NO_NATIVE',limitations:['Not actual World construction','No native read/write','Queue, transform barrier, engine classes and material-copy helpers mocked','JavaScript transpile only, not typecheck'],sourceHashes:hashes,total:results.length,passed:results.filter(x=>x.status==='PASS').length,results,formalRequiredCellsUnchanged:{NOT_RUN:2128},passedGates:0,realProducer:'NOT_INTEGRATED',stagedCommandsSupported:false,unifiedTransactionsSupported:false};fs.writeFileSync(path.join(__dirname,'evidence/owner-protocol-controls.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.passed!==report.total)process.exitCode=1;
