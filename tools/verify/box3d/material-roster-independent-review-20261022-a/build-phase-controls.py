from pathlib import Path
root=Path(__file__).resolve().parent
original=(root/'inputs/controls.cjs').read_text()
helpers=original[:original.index("test('no owner fast path")].replace("require('./compiled/physics-material-values-transaction.js')", "require('./inputs/compiled/physics-material-values-transaction.js')")
tests=r'''
test('phase: owner prepare returned then native-plan getter throws is pre-effect with independently cleaned scopes',()=>{
 const r=new Registry(),asset={},trace=[],leases=[];let writes=0,natives=0;
 for(let i=0;i<2;i++) {
  const lease=r.registerOwner({},1,{admitAsset(){},open(){trace.push('open:'+i);},prepare(){trace.push('prepare-return:'+i);return {get native(){trace.push('native-get:'+i);if(i===1)throw 0;return [{target:{},invoke(){natives++;},verify(){}}];},commitCaches(){}};},commit(){},fault(){trace.push('fault:'+i);},dispose(){trace.push('dispose:'+i);}});
  lease.prepareMembership({binding:{},before:null,after:asset,role:'explicit',initialized:true}).publish(asset);leases.push(lease);
 }
 const t=r.begin(asset);caught(()=>t.prepare({read(){return{before:[.5,.1,0,0],candidate:[.7,.2,0,0],changed:true,writeOnNoChange:false};},write(){writes++;},emit(){},readActual(){return[.5,.1,0,0];}}),0);
 assert.equal(writes,0);assert.equal(natives,0);assert.deepEqual(trace,['open:0','open:1','prepare-return:0','native-get:0','prepare-return:1','native-get:1','dispose:0','dispose:1']);
 assert.equal(t.diagnostics().faultAttemptedOwners,0);assert.equal(t.diagnostics().cleanupCompletedOwners,2);assert(leases.every(l=>l.diagnostics().state==='live'));
});
test('phase: owner prepare return after caught reentry is refused before material effects',()=>{
 const s=setup(),first=s.addOwner(),second=s.addOwner({prepare(){caught(()=>s.registry.begin(s.asset));}});s.bind(first);s.bind(second);
 const t=s.registry.begin(s.asset);caught(()=>t.prepare(s.source()));const d=t.diagnostics();
 assert.equal(s.native,0);assert.equal(d.cacheWriteEntered,false);assert.equal(d.cleanupCompletedOwners,2);assert.equal(d.faultAttemptedOwners,0);assert.equal(first.lease.diagnostics().state,'live');assert.equal(second.lease.diagnostics().state,'live');
});
test('phase: dispose throws after actual release is conservatively unresolved, never retried, all owners fault',()=>{
 const s=setup();let scopeLive=false,disposals=0;
 const first=s.addOwner({open(){scopeLive=true;},dispose(){disposals++;scopeLive=false;throw false;}});s.bind(first);s.bind(s.addOwner());
 const t=s.registry.begin(s.asset);t.prepare(s.source());caught(()=>t.dispose(),false);const d=t.diagnostics();
 assert.equal(scopeLive,false);assert.equal(disposals,1);assert.equal(d.cleanupCompletedOwners,1);assert.equal(d.cleanupUnresolvedOwners,1);assert.equal(d.faultAttemptedOwners,2);assert.equal(s.native,0);t.dispose();assert.equal(disposals,1);
});
test('phase: cleanup normal return after caught reentry retains completed cleanup but faults changed transaction',()=>{
 const s=setup(),first=s.addOwner({dispose(){caught(()=>s.registry.begin(s.asset));}});s.bind(first);s.bind(s.addOwner());
 const t=s.registry.begin(s.asset);t.prepare(s.source());caught(()=>t.apply());const d=t.diagnostics();
 assert.equal(d.publicReturned,true);assert.equal(d.cleanupCompletedOwners,2);assert.equal(d.cleanupUnresolvedOwners,0);assert.equal(d.faultAttemptedOwners,2);assert.equal(s.native,2);
});
test('phase: commitCaches normal return after caught reentry retains returned fact and stops later owner',()=>{
 const s=setup();let ownerCacheWrites=0;
 s.bind(s.addOwner({cache(){ownerCacheWrites++;caught(()=>s.registry.begin(s.asset));}}));s.bind(s.addOwner());
 const t=s.registry.begin(s.asset);t.prepare(s.source());caught(()=>t.apply());const d=t.diagnostics();
 assert.equal(ownerCacheWrites,1);assert.deepEqual(d.ownerCacheStates,['returned','not-entered']);assert.equal(d.native[0].state,'returned');assert.equal(d.native[0].readback,'verified');assert.equal(d.native[1].state,'not-entered');assert.equal(d.faultAttemptedOwners,2);
});
test('phase: commitCaches partial write then throw stays entered-unknown and stops later owner',()=>{
 const s=setup();let ownerCacheWrites=0;
 s.bind(s.addOwner({cache(){ownerCacheWrites++;throw '';}}));s.bind(s.addOwner());
 const t=s.registry.begin(s.asset);t.prepare(s.source());caught(()=>t.apply(),'');const d=t.diagnostics();
 assert.equal(ownerCacheWrites,1);assert.deepEqual(d.ownerCacheStates,['entered-unknown','not-entered']);assert.equal(d.native[0].state,'returned');assert.equal(d.native[0].readback,'verified');assert.equal(d.native[1].state,'not-entered');assert.equal(d.faultAttemptedOwners,2);
});
const summary={schema:'independent-phase-review-controls/1',qualification:'ISOLATED_PURE_PROTOCOL_ONLY',total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results};
require('node:fs').writeFileSync(process.argv[2],JSON.stringify(summary,null,2)+'\n');if(summary.failed)process.exitCode=1;
'''
(root/'phase-controls.cjs').write_text(helpers+tests)
