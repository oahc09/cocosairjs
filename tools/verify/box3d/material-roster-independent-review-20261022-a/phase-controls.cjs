'use strict';
const assert = require('node:assert/strict');
const {
    PhysicsMaterialValuesTransactionRegistry: Registry,
} = require('./inputs/compiled/physics-material-values-transaction.js');
const results = [];
function test(name, fn) {
    try {
        fn();
        results.push({ name, status: 'PASS' });
        console.log('PASS', name);
    } catch (error) {
        results.push({ name, status: 'FAIL', error: String(error), stack: error?.stack });
        console.error('FAIL', name, error);
    }
}
function caught(fn, expected) {
    let thrown = false,
        actual;
    try {
        fn();
    } catch (error) {
        thrown = true;
        actual = error;
    }
    assert.equal(thrown, true, 'expected a thrown value');
    if (arguments.length > 1) assert.equal(actual, expected);
    return actual;
}
function setup(options = {}) {
    const registry = new Registry(options.qualification),
        asset = {},
        trace = [],
        owners = [];
    let values = [0.5, 0.1, 0, 0],
        events = 0,
        native = 0,
        cache = 0;
    function addOwner(config = {}) {
        const state = { open: 0, prepare: 0, fault: 0, dispose: 0, commit: 0, bindings: [], plans: [], contexts: [] };
        const delegate = {
            admitAsset(a) {
                if (a.destroyed) throw new Error('destroyed asset');
                config.admit?.(a);
            },
            open(context) {
                trace.push('open:' + owners.indexOf(state));
                ++state.open;
                state.contexts.push(context);
                config.open?.(context);
            },
            prepare(context, copied) {
                trace.push('prepare:' + owners.indexOf(state));
                ++state.prepare;
                config.prepare?.(context, copied);
                const count = copied.changed ? (config.nativeCount ?? 1) : 0;
                const operations = Array.from({ length: count }, (_, index) => ({
                    target: config.sameTarget ?? {},
                    invoke() {
                        trace.push('native:' + owners.indexOf(state) + ':' + index);
                        ++native;
                        config.invoke?.(index);
                    },
                    verify() {
                        trace.push('verify:' + owners.indexOf(state) + ':' + index);
                        config.verify?.(index);
                    },
                }));
                const plan = {
                    native: operations,
                    commitCaches() {
                        ++cache;
                        trace.push('cache:' + owners.indexOf(state));
                        config.cache?.();
                    },
                };
                state.plans.push(plan);
                return plan;
            },
            commit(context, actual) {
                ++state.commit;
                config.commit?.(context, actual);
            },
            fault(context, failure) {
                ++state.fault;
                state.failure = failure;
                config.fault?.(context, failure);
            },
            dispose(context) {
                ++state.dispose;
                trace.push('dispose:' + owners.indexOf(state));
                config.dispose?.(context);
            },
        };
        state.lease = registry.registerOwner(config.identity ?? {}, config.generation ?? 1, delegate);
        state.delegate = delegate;
        owners.push(state);
        return state;
    }
    function bind(owner, role = 'explicit', initialized = true, selectedAsset = asset) {
        const binding = {};
        owner.lease
            .prepareMembership({ binding, before: null, after: selectedAsset, role, initialized })
            .publish(selectedAsset);
        owner.bindings.push(binding);
        return binding;
    }
    function source(candidate = [0.7, 0.2, 0, 0], config = {}) {
        return {
            read() {
                trace.push('read');
                config.read?.();
                return {
                    before: values,
                    candidate,
                    changed: config.changed ?? true,
                    writeOnNoChange: config.writeOnNoChange ?? false,
                };
            },
            write(next, recorder) {
                trace.push('write');
                config.beforeWrite?.();
                for (let i = 0; i < 4; ++i) {
                    values[i] = next[i];
                    recorder.written();
                    config.afterWrite?.(i);
                }
            },
            emit() {
                ++events;
                trace.push('emit');
                config.emit?.();
            },
            readActual() {
                config.actual?.();
                return values;
            },
        };
    }
    return {
        registry,
        asset,
        trace,
        owners,
        addOwner,
        bind,
        source,
        get values() {
            return values;
        },
        get events() {
            return events;
        },
        get native() {
            return native;
        },
        get cache() {
            return cache;
        },
    };
}
function apply(s, source = s.source()) {
    const t = s.registry.begin(s.asset);
    t.prepare(source);
    t.apply();
    return t;
}


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
