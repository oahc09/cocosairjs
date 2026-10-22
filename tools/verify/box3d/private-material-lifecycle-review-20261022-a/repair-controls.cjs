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
