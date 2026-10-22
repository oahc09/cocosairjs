from pathlib import Path
import shutil,subprocess,json,hashlib,datetime
base=Path('/workspace/scratch/62d43a81bbde'); old=base/'box3d-private-material-roster-candidate-20261022'; d=base/'box3d-material-roster-commit-repair-20261022'; d.mkdir(exist_ok=False);(d/'src').mkdir();(d/'inputs').mkdir();(d/'evidence').mkdir()
p=old/'src/physics-material-values-transaction.ts';b=p.read_bytes();assert hashlib.sha256(b).hexdigest()=='382c459f2116383d9acd7eddec737d7a9dd213f5a2c1371475aa024020666cd4';shutil.copy2(p,d/'inputs/original.ts')
s=b.decode();s=s.replace("    readonly ownerCacheStates: readonly ('not-entered' | 'entered-unknown' | 'returned')[];", "    readonly ownerCacheStates: readonly ('not-entered' | 'entered-unknown' | 'returned')[];\n    readonly ownerCommitStates: readonly ('not-entered' | 'entered-unknown' | 'returned')[];")
s=s.replace("    cacheState: 'not-entered' | 'entered-unknown' | 'returned';", "    cacheState: 'not-entered' | 'entered-unknown' | 'returned';\n    commitState: 'not-entered' | 'entered-unknown' | 'returned';")
s=s.replace("                    cacheState: 'not-entered' as const,", "                    cacheState: 'not-entered' as const,\n                    commitState: 'not-entered' as const,")
a='''        for (const p of change.participants) {
            this.#boundary(change, () => p.owner.callbacks.commit.call(p.owner.receiver, p.context, change.actual!));
            ++change.committedOwners;
        }'''
z='''        for (const p of change.participants) {
            this.#check(change);
            // Even a scalar no-change call can mutate owner bookkeeping here.
            // Record entry before calling; normal return and a later reentry failure differ.
            change.effectsEntered = true;
            p.commitState = 'entered-unknown';
            p.owner.callbacks.commit.call(p.owner.receiver, p.context, change.actual!);
            p.commitState = 'returned';
            ++change.committedOwners;
            this.#check(change);
        }'''
assert s.count(a)==1;s=s.replace(a,z);s=s.replace('            ownerCacheStates: Object.freeze(change.participants.map((p) => p.cacheState)),','            ownerCacheStates: Object.freeze(change.participants.map((p) => p.cacheState)),\n            ownerCommitStates: Object.freeze(change.participants.map((p) => p.commitState)),');(d/'src/physics-material-values-transaction.ts').write_text(s)
shutil.copy2(old/'controls.cjs',d/'inputs/original-controls.cjs')
s=(old/'controls.cjs').read_text();i=s.index('const summary = {');extra='''
for (const primary of [undefined, null, 0, false, '']) {
    for (const failedOwner of [0, 1]) {
        test(`no-change owner commit failure ${String(primary)} at ${failedOwner} faults all and cannot replay`, () => {
            const s = setup();
            for (let i=0;i<2;i++) s.bind(s.addOwner({commit() { if (i===failedOwner) throw primary; }}));
            const t=s.registry.begin(s.asset);
            t.prepare(s.source([0.5, 0.1, 0, 0], {changed:false}));
            caught(()=>t.apply(),primary);
            const d=t.diagnostics();
            assert.equal(d.faultAttemptedOwners,2);
            assert.equal(d.cleanupCompletedOwners,2);
            assert.equal(d.cacheWriteEntered,false);
            assert.equal(d.cacheWrites,0);
            assert.equal(d.committedOwners,failedOwner);
            assert.deepEqual(d.ownerCommitStates,failedOwner===0?['entered-unknown','not-entered']:['returned','entered-unknown']);
            assert.deepEqual(d.ownerCacheStates,['not-entered','not-entered']);
            assert.deepEqual(d.native,[]);
            assert.equal(s.native,0);assert.equal(s.events,0);
            assert.deepEqual(s.owners.map(o=>o.lease.diagnostics().state),['faulted','faulted']);
            caught(()=>s.registry.begin(s.asset));caught(()=>t.apply());t.dispose();
            assert.equal(s.native,0);
        });
    }
}
test('no-change commit returned after caught reentry stays a returned fact then faults',()=>{
    const s=setup();s.bind(s.addOwner({commit(){caught(()=>s.registry.begin(s.asset));}}));
    const t=s.registry.begin(s.asset);t.prepare(s.source([0.5,0.1,0,0],{changed:false}));caught(()=>t.apply());
    const d=t.diagnostics();assert.equal(d.committedOwners,1);assert.deepEqual(d.ownerCommitStates,['returned']);assert.equal(d.faultAttemptedOwners,1);assert.equal(s.native,0);
});
test('no-change failure during actual read before owner commit does not invent an effect',()=>{
    const s=setup();s.bind(s.addOwner());const t=s.registry.begin(s.asset);t.prepare(s.source([0.5,0.1,0,0],{changed:false,actual(){throw null;}}));caught(()=>t.apply(),null);
    const d=t.diagnostics();assert.equal(d.faultAttemptedOwners,0);assert.deepEqual(d.ownerCommitStates,['not-entered']);assert.equal(d.cleanupCompletedOwners,1);assert.equal(s.owners[0].lease.diagnostics().state,'live');
});
''';(d/'controls.cjs').write_text(s[:i]+extra+s[i:]);print(d)
