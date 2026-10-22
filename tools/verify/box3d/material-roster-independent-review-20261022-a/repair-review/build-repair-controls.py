from pathlib import Path
root=Path(__file__).resolve().parent
original=(root/'inputs/controls.cjs').read_text()
helpers=original[:original.index("test('no owner fast path")].replace("require('./compiled/physics-material-values-transaction.js')", "require('./inputs/compiled/physics-material-values-transaction.js')")
tests=r'''
test('repair: owner commit falsy primary survives recovery read, reporter and independent cleanup failures',()=>{
 const s=setup();let actualReads=0,ownerMutation=0;
 s.bind(s.addOwner({commit(){ownerMutation++;throw undefined;},fault(){throw false;},dispose(){throw '';}}));
 s.bind(s.addOwner({dispose(){throw null;}}));
 const t=s.registry.begin(s.asset);t.prepare(s.source([.5,.1,0,0],{changed:false,actual(){if(++actualReads>1)throw 0;}}));caught(()=>t.apply(),undefined);
 const d=t.diagnostics();assert.equal(ownerMutation,1);assert.equal(d.hasFailure,true);assert.equal(d.error,undefined);assert.deepEqual(d.secondaryErrors,[0,false,'',null]);assert.deepEqual(d.ownerCommitStates,['entered-unknown','not-entered']);assert.equal(d.faultAttemptedOwners,2);assert.equal(d.cleanupUnresolvedOwners,2);assert.equal(s.native,0);caught(()=>s.registry.begin(s.asset));
});
test('repair: no-change completed owner commits followed by caught cleanup reentry remain effectful and faulted',()=>{
 const s=setup();s.bind(s.addOwner({dispose(){caught(()=>s.registry.begin(s.asset));}}));s.bind(s.addOwner());
 const t=s.registry.begin(s.asset);t.prepare(s.source([.5,.1,0,0],{changed:false}));caught(()=>t.apply());const d=t.diagnostics();
 assert.deepEqual(d.ownerCommitStates,['returned','returned']);assert.equal(d.committedOwners,2);assert.equal(d.cleanupCompletedOwners,2);assert.equal(d.cleanupUnresolvedOwners,0);assert.equal(d.faultAttemptedOwners,2);assert.equal(s.native,0);assert(s.owners.every(o=>o.lease.diagnostics().state==='faulted'));
});
test('repair: first commit normal return after caught foreign roster reentry is returned, later commit is unentered',()=>{
 const s=setup(),other={};s.bind(s.addOwner({commit(){caught(()=>s.registry.begin(other));}}));s.bind(s.addOwner());s.bind(s.addOwner(),'explicit',true,other);
 const t=s.registry.begin(s.asset);t.prepare(s.source([.5,.1,0,0],{changed:false}));caught(()=>t.apply());const d=t.diagnostics();
 assert.deepEqual(d.ownerCommitStates,['returned','not-entered']);assert.equal(d.committedOwners,1);assert.equal(d.faultAttemptedOwners,2);assert.equal(s.native,0);assert.equal(s.owners[2].lease.diagnostics().state,'live');
});
test('repair: successful no-change actual commits are returned and retain execution for a subsequent change',()=>{
 const s=setup();s.bind(s.addOwner());s.bind(s.addOwner());const first=apply(s,s.source([.5,.1,0,0],{changed:false}));
 assert.deepEqual(first.diagnostics().ownerCommitStates,['returned','returned']);assert.equal(first.diagnostics().faultAttemptedOwners,0);assert.equal(s.native,0);apply(s);assert.equal(s.native,2);
});
test('repair: pre-commit no-change actual mismatch is not falsely relabeled owner effect',()=>{
 const s=setup();s.bind(s.addOwner());s.bind(s.addOwner());const source=s.source([.5,.1,0,0],{changed:false});source.readActual=()=>[.6,.1,0,0];
 const t=s.registry.begin(s.asset);t.prepare(source);caught(()=>t.apply());const d=t.diagnostics();
 assert.deepEqual(d.ownerCommitStates,['not-entered','not-entered']);assert.equal(d.faultAttemptedOwners,0);assert.equal(d.cleanupCompletedOwners,2);assert(s.owners.every(o=>o.lease.diagnostics().state==='live'));assert.equal(s.native,0);
});
const summary={schema:'independent-repair-controls/1',qualification:'ISOLATED_PURE_PROTOCOL_ONLY',total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results};
require('node:fs').writeFileSync(process.argv[2],JSON.stringify(summary,null,2)+'\n');if(summary.failed)process.exitCode=1;
'''
(root/'repair-controls.cjs').write_text(helpers+tests)
