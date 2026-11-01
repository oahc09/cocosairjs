/* Design consistency checks only. Not app, browser, loading or package execution. */
const assert = require('node:assert/strict');
const test = require('node:test');
const config = require('../../../docs/physics/box3d/contracts/build-distribution.json');
test('default runtime and unused backend remain free of Box3D resource requests', () => {
    assert.equal(config.singleRuntime, true);
    assert.deepEqual(config.defaultBackendsUnchanged, ['builtin', 'cannon']);
    assert.equal(config.moduleEvaluationAssetRequests, 0);
    assert.equal(config.selectedOtherBackendBox3DRequests, 0);
});
test('thread and substep normalization cannot silently choose another engine', () => {
    const options = config.applicationOptions['physicsOptions.box3d'];
    assert.equal(options.threading.default, 'single');
    assert.deepEqual(options.workerCount.singleAllowed, [1]);
    assert.deepEqual(options.workerCount.multiRangeInclusive, [2, 4]);
    assert.deepEqual(options.solverSubSteps.values, [1, 2, 4, 8]);
    assert.equal(config.autoFallback.neverOtherEngine, true);
    assert.equal(config.autoFallback.sameCoreAndSchemaRequired, true);
    for (const reason of config.autoFallback.forbiddenReasons)
        assert.ok(!config.autoFallback.allowedReasons.includes(reason));
});
test('all selected prepare work stays inside one ordered owned-resource transaction', () => {
    assert.equal(config.prepare.transactionStartsBeforeFirstPrepare, true);
    assert.deepEqual(config.prepare.order.slice(0, 3), [
        'application admission',
        'selected 2D prepare',
        'selected 3D prepare',
    ]);
    assert.match(config.cleanup.gameInitFailed, /both.*even if one fails/);
    assert.equal(config.cleanup.doNotInventReleaseForUncreatedBackend, true);
    assert.match(config.cleanup.lateAsyncCompletion, /generation invalidation/);
});
test('CSP, declaration identity and pack claims remain unexecuted', () => {
    assert.equal(config.status, 'PARTIAL_SOURCE_INTEGRATION');
    assert.equal(config.implementationAcceptance.worldAdapter, 'NOT_IMPLEMENTED');
    assert.equal(config.implementationAcceptance.fullApplicationPhysics, 'NOT_RUN');
    assert.equal(config.implementationAcceptance.variantDeclarations, 'NOT_RUN');
    assert.equal(config.implementationAcceptance.tarball, 'NOT_RUN');
    assert.ok(config.csp.forbidden.includes('unsafe-eval'));
    assert.ok(config.csp.forbidden.includes('unsafe-inline'));
    assert.match(config.packaging.variantDeclarations, /AIR_OUT_DIR/);
    assert.equal(config.packaging.publishAuthorized, false);
    assert.match(config.implementationStatus, /No actual world adapter/);
});
