from pathlib import Path
root=Path(__file__).resolve().parent
original=(root/'inputs/controls.cjs').read_text()
helpers=original[:original.index("test('no owner fast path")].replace("require('./compiled/physics-material-values-transaction.js')", "require('./inputs/compiled/physics-material-values-transaction.js')")
tests=r'''
test('review: unobserved Proxy has zero reads during source copy, write, emit and cleanup', () => {
  const s = setup(), unobserved = new Proxy({}, { get() { throw Error('asset read'); }});
  const fast = () => { assert.equal(s.registry.begin(unobserved), undefined); s.registry.assertDestroyable(unobserved); };
  s.bind(s.addOwner({dispose: fast}));
  const t = apply(s,s.source(undefined,{read:fast,beforeWrite:fast,emit:fast}));
  assert.equal(t.diagnostics().phase,'committed');
});
test('review: full roster opens before any source getter, including later partial failure', () => {
  const s=setup(); s.bind(s.addOwner()); s.bind(s.addOwner({open(){throw false;}}));
  let sourceReads=0;
  const source=new Proxy({}, {get(){sourceReads++;throw Error('too late');}});
  const t=s.registry.begin(s.asset); caught(()=>t.prepare(source),false);
  assert.equal(sourceReads,0); assert.equal(s.native,0); assert.equal(t.diagnostics().cleanupCompletedOwners,2);
});
test('review: later owner plan getter caught foreign-asset reentry stops all native effects', () => {
  const s=setup(), other={}; const first=s.addOwner();s.bind(first);
  const second=s.addOwner({prepare(){caught(()=>s.registry.begin(other));}});s.bind(second);
  s.bind(s.addOwner(),'explicit',true,other);
  const t=s.registry.begin(s.asset);caught(()=>t.prepare(s.source()));
  assert.equal(s.native,0);assert.equal(s.events,0);assert.equal(t.diagnostics().cacheWrites,0);
});
test('review: copied ticket diagnostic wrong receiver poisons only nonterminal exact ticket', () => {
  const s=setup();s.bind(s.addOwner());const t=s.registry.begin(s.asset);t.prepare(s.source());
  caught(()=>t.diagnostics.call({...t}));caught(()=>t.apply());assert.equal(s.native,0);
  const next=apply(s);assert.equal(next.diagnostics().phase,'committed');assert.equal(s.native,1);
});
test('review: repeated prepare consumes no extra scope or native authority', () => {
  const s=setup(),o=s.addOwner();s.bind(o);const t=s.registry.begin(s.asset);t.prepare(s.source());
  caught(()=>t.prepare(s.source()));caught(()=>t.apply());assert.equal(o.open,1);assert.equal(o.dispose,1);assert.equal(s.native,0);
});
test('review: actual membership identity uses no Proxy reads and no object id coercion', () => {
  const s=setup(),o=s.addOwner();let gets=0;
  const a=new Proxy({}, {get(){gets++;throw Error('untrusted actual property');}});
  o.delegate.admitAsset=()=>{};
  const r=new Registry(), lease=r.registerOwner({},1,{admitAsset(){},open(){},prepare(){return {native:[],commitCaches(){}}},commit(){},fault(){},dispose(){}});
  const p=lease.prepareMembership({binding:{},before:null,after:a,role:'explicit',initialized:true});
  p.publish(a);assert.equal(gets,0);caught(()=>r.assertDestroyable(a));lease.close('released');r.assertDestroyable(a);assert.equal(gets,0);
});
test('review: cancel and publish permutations preserve remaining pending same-owner groups', () => {
  for(const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]) {
    const s=setup(),o=s.addOwner();
    const ps=[0,1,2].map(()=>o.lease.prepareMembership({binding:{},before:null,after:s.asset,role:'explicit',initialized:true}));
    ps[order[0]].cancel();ps[order[1]].publish(s.asset);caught(()=>s.registry.begin(s.asset));ps[order[2]].publish(s.asset);
    assert.equal(o.lease.diagnostics().bindings,2);const t=apply(s);assert.equal(t.diagnostics().ownerCount,1);
    o.lease.close('released');s.registry.assertDestroyable(s.asset);
  }
});
test('review: release one owner with old and two pending assets preserves other owner pending', () => {
  const s=setup(),a=s.addOwner(),b=s.addOwner(),x={},y={};const old=s.bind(a);
  a.lease.prepareMembership({binding:old,before:s.asset,after:x,role:'explicit',initialized:true});
  a.lease.prepareMembership({binding:{},before:null,after:y,role:'explicit',initialized:true});
  const keep=b.lease.prepareMembership({binding:{},before:null,after:x,role:'explicit',initialized:true});
  a.lease.close('released');s.registry.assertDestroyable(s.asset);s.registry.assertDestroyable(y);caught(()=>s.registry.assertDestroyable(x));
  keep.publish(x);assert.equal(b.lease.diagnostics().bindings,1);b.lease.close('released');s.registry.assertDestroyable(x);
});
test('review: unknown teardown retains pending-only asset after newer generation and cannot cancel', () => {
  const s=setup(),id={},a=s.addOwner({identity:id});const p=a.lease.prepareMembership({binding:{},before:null,after:s.asset,role:'explicit',initialized:true});
  a.lease.close('unknown');const b=s.addOwner({identity:id,generation:2});s.bind(b);b.lease.close('released');
  caught(()=>p.cancel());caught(()=>p.publish(s.asset));caught(()=>a.lease.close('released'));caught(()=>s.registry.assertDestroyable(s.asset));caught(()=>s.registry.begin(s.asset));
});
test('review: native return retained when setter catches registry reentry but verify never enters', () => {
  const s=setup(),o=s.addOwner({invoke(){caught(()=>s.registry.begin(s.asset));}});s.bind(o);
  const t=s.registry.begin(s.asset);t.prepare(s.source());caught(()=>t.apply());
  const d=t.diagnostics();assert.equal(d.native[0].state,'returned');assert.equal(d.native[0].readback,'not-entered');assert.equal(d.faultAttemptedOwners,1);
});
test('review: verified native retained when readback catches reentry, owner cache stays unentered', () => {
  const s=setup(),o=s.addOwner({verify(){caught(()=>s.registry.begin(s.asset));}});s.bind(o);
  const t=s.registry.begin(s.asset);t.prepare(s.source());caught(()=>t.apply());
  const d=t.diagnostics();assert.equal(d.native[0].state,'returned');assert.equal(d.native[0].readback,'verified');assert.deepEqual(d.ownerCacheStates,['not-entered']);assert.equal(d.faultAttemptedOwners,1);
});
test('review: first falsy failure from setter survives actual read, reporter and every disposal', () => {
 for(const primary of [undefined,null,0,false,'']) {
  const s=setup(),o=s.addOwner({invoke(){throw primary;},fault(){throw Error('fault');},dispose(){throw Error('dispose1');}});s.bind(o);s.bind(s.addOwner({dispose(){throw Error('dispose2');}}));
  const t=s.registry.begin(s.asset);t.prepare(s.source(undefined,{actual(){throw Error('actual');}}));caught(()=>t.apply(),primary);
  const d=t.diagnostics();assert.equal(d.hasFailure,true);assert.equal(d.error,primary);assert.equal(d.secondaryErrors.length,4);assert.equal(d.cleanupAttemptedOwners,2);assert.equal(d.cleanupUnresolvedOwners,2);
 }
});
test('review: expired cache recorder cannot increment counters or replay writes', () => {
  const s=setup();s.bind(s.addOwner());const source=s.source();let held;const old=source.write;
  source.write=function(candidate,recorder){held=recorder;return old.call(this,candidate,recorder);};const t=apply(s,source);
  caught(()=>held.written());assert.equal(t.diagnostics().cacheWrites,4);assert.equal(s.native,1);
});
const summary={schema:'independent-protocol-review-controls/1',qualification:'ISOLATED_PURE_PROTOCOL_ONLY',total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results};
require('node:fs').writeFileSync(process.argv[2],JSON.stringify(summary,null,2)+'\n');
if(summary.failed)process.exitCode=1;
'''
(root/'reviewer-controls.cjs').write_text(helpers+tests)
