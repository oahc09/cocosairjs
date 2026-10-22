'use strict';
const assert = require('node:assert/strict');
const { PhysicsMaterialValuesTransactionRegistry: Registry } = require('./inputs/compiled/physics-material-values-transaction.js');
const registry = new Registry();
const asset = {};
const actual = [0.5, 0.1, 0, 0];
const trace = [];
let failCommit = true;
let changed = false;
let nativeWrites = 0;
const leases = [0,1].map((ownerIndex) => {
  let observedSequence = 0;
  const lease = registry.registerOwner({}, 1, {
    admitAsset() {}, open() {},
    prepare() { return { native: changed ? [{target: {}, invoke() { nativeWrites++; }, verify() {}}] : [], commitCaches() {} }; },
    commit(context) {
      observedSequence = context.sequence;
      trace.push({ event: 'owner-actual-commit', ownerIndex, observedSequence });
      if (ownerIndex === 1 && failCommit) throw null;
    },
    fault() { trace.push({event: 'owner-fault', ownerIndex}); },
    dispose() { trace.push({event: 'owner-dispose', ownerIndex}); }
  });
  lease.prepareMembership({ binding: {}, before: null, after: asset, role: 'explicit', initialized: true }).publish(asset);
  return lease;
});
function source() {
 return { read() { return { before: actual, candidate: changed ? [0.7,0.2,0,0] : actual, changed, writeOnNoChange: false }; }, write(next, recorder) { for(let i=0;i<4;i++){actual[i]=next[i];recorder.written();} }, emit() {}, readActual() { return actual; } };
}
const ticket = registry.begin(asset);
ticket.prepare(source());
let threw = false;
try { ticket.apply(); } catch(error) { threw = true; assert.equal(error,null); }
assert.equal(threw, true);
const failed = ticket.diagnostics();
const afterFailure = leases.map(lease => lease.diagnostics());
const observation = { failed, afterFailure, nativeWrites, trace };
let laterBeginRejected = false;
try { registry.begin(asset); } catch (error) { laterBeginRejected = true; observation.laterBeginError = String(error); }
observation.laterBeginRejected = laterBeginRejected;
require('node:fs').writeFileSync(process.argv[2], JSON.stringify(observation, null, 2)+'\n');
console.log(JSON.stringify(observation, null, 2));
assert.equal(failed.committedOwners, 1);
assert.equal(failed.faultAttemptedOwners, 2);
assert.deepEqual(failed.ownerCommitStates, ['returned','entered-unknown']);
assert(afterFailure.every(lease => lease.state === 'faulted'));
assert.equal(laterBeginRejected,true);
assert.equal(nativeWrites,0);
