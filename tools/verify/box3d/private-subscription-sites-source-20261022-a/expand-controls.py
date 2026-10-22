# Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
from pathlib import Path
p=Path(__file__).with_name('controls.cjs');s=p.read_text()
s=s.replace("fs.mkdirSync(path.dirname(dest),{recursive:true}); fs.writeFileSync(dest,js);", "fs.mkdirSync(path.dirname(dest),{recursive:true}); fs.writeFileSync(dest,js); fs.writeFileSync(dest.replace(/\\.js$/,'.ts'),source);")
needle="const result={schema:'private-subscription-sites-controls/1'"
added=r'''
control('private/clone-accept-cache-shared-exact-order',()=>{
    const f=setup(candidate,'clone','private');let cached=f.a;const writes=[];
    Object.defineProperty(f.target,'_material',{configurable:true,get(){return cached;},set(value){
        const d=f.diagnostic();writes.push({value,shared:f.target._isSharedMaterial,accepted:d.cloneAccepted,effects:[...d.observer.effects]});cached=value;
    }});
    const cloned=f.run();assert.equal(writes.length,1);assert.equal(writes[0].value,cloned);
    assert.equal(writes[0].shared,true);assert.equal(writes[0].accepted,true);
    assert.deepEqual(writes[0].effects,['clone-allocation-entered','clone-returned']);
    assert.equal(f.target._isSharedMaterial,false);assert.equal(f.commits[0].material,cloned);assert.equal(f.commits[0].shared,false);
    f.target.onDestroy();assert.equal(f.reports.length,1);expectNoListeners(f);
});
for(const [i,error] of falsies.entries())control(`private/falsy-clone-cache-write/${i}`,()=>{
    const f=setup(candidate,'clone','private',{disposeThrow:true,secondary:'cleanup'});
    Object.defineProperty(f.target,'_material',{get(){return f.a;},set(){assert(f.diagnostic().cloneAccepted);throw error;}});
    const a=attempt(()=>f.run());assert(a.threw);assert(Object.is(a.error,error));assert.equal(f.target._isSharedMaterial,true);
    assert.equal(f.target._material,f.a);assert.deepEqual(f.diagnostic().observer.effects,['clone-allocation-entered','clone-returned']);expectNoListeners(f);
    f.target.onDestroy();assert.equal(f.reports.length,1);
});
for(const mode of ['none','default','legacy'])for(const kind of ['set','clone','load','system'])for(const backend of ['box3d','cannon.js'])control(`legacy/access-order/${mode}/${kind}/${backend}`,()=>{
    const make=env=>{
        const f=setup(env,kind,mode,{backend});let cached=f.a;
        Object.defineProperty(f.target,'_material',{configurable:true,get(){f.log.push('cache:get');return cached;},set(v){f.log.push(`cache:set:${v?.label??'null'}`);cached=v;}});
        for(const asset of [f.a,f.b])Object.defineProperty(asset,'id',{get(){f.log.push(`${asset.label}.id:get`);return asset.label;}});
        return f;
    };
    const f=make(original),g=make(candidate),a=attempt(()=>f.run()),b=attempt(()=>g.run());
    assert.equal(a.threw,b.threw);assert.equal(String(a.error),String(b.error));assert.deepEqual(g.log,f.log);
    assert.equal(g.target._isSharedMaterial,f.target._isSharedMaterial);f.dispose();g.dispose();
});
for(const backend of ['box3d','cannon.js'])for(const [i,value] of [undefined,null,false,0,'',NaN].entries())control(`unobserved/falsy-input-order/${backend}/${i}`,()=>{
    const f=setup(original,'set','none',{backend}),g=setup(candidate,'set','none',{backend});
    const a=attempt(()=>{f.target.material=value;}),b=attempt(()=>{g.target.material=value;});
    assert.equal(a.threw,b.threw);assert.equal(String(a.error),String(b.error));assert.deepEqual(g.log,f.log);
    assert(Object.is(f.target._material,g.target._material));assert.equal(g.target._isSharedMaterial,f.target._isSharedMaterial);
});
control('private/system-no-selector-owner-discovery',()=>{
    const f=setup(candidate,'system','private');Object.defineProperty(candidate.selector,'id',{configurable:true,get(){throw Error('selector access');}});
    try{f.run();assert.equal(f.target._material,f.b);expectNoListeners(f);}finally{Object.defineProperty(candidate.selector,'id',{configurable:true,writable:true,value:'box3d'});f.dispose();}
});
control('private/no-public-listener-guard-candidate-adopted',()=>{
    const f=setup(candidate,'set','private');f.run();let calls=0;
    f.target.once('onCollisionEnter',()=>calls++);f.target.emit('onCollisionEnter');f.target.emit('onCollisionEnter');
    assert.equal(calls,1);f.target.onDestroy();assert.equal(f.reports.length,1);expectNoListeners(f);
});
control('registration/cleanup-third-argument-copy-is-unchanged',()=>{
    const registry=new candidate.tx.PhysicsMaterialTransactionRegistry(),target={};const calls=[];
    const delegate={open(){},protectCandidate(){},preflightCopied(){},applyCopied(){},commitActual(){},fail(){},dispose(){}};
    const cleanup={get generation(){calls.push('generation');return 1;},get report(){calls.push('report');return function(report){calls.push(report.generation);};}};
    const lease=registry.register(target,delegate,cleanup,'private');assert.deepEqual(calls,['generation','report']);
    const reporter=registry.captureCleanup(target);lease.dispose();reporter.complete([]);assert.deepEqual(calls,['generation','report',1]);
});
'''
assert needle in s;s=s.replace(needle,added+needle);p.write_text(s)
