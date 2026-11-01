import test from 'node:test';
import assert from 'node:assert/strict';
import { selectTransportCandidate, validateTransportCandidate } from '../src/candidate-admission.mjs';
const id = 'integration-20261031';
const select = (q) => selectTransportCandidate(new URLSearchParams(q));
const selection = select(`transport=committed-candidate&candidate=${id}`);
// Synthetic tuple tests admission only; not native or business evidence.
const lock = {
    candidateId: id,
    status: 'READY_FOR_VERIFICATION',
    expectedBuild: 999,
    runtimeSha256: 'a'.repeat(64),
    manifestSha256: 'b'.repeat(64),
    businessStatus: 'NOT_RUN',
    qualificationEvidence: { mapSha256: 'c'.repeat(64) },
    qualification: {
        committedQueries: true,
        committedRay: true,
        kinematicTarget: true,
        fixedAtIdle: true,
        boxSupportDeparture: true,
    },
};
const identity = {
    runtimeSha256: lock.runtimeSha256,
    runtimeAssets: { 'manifest.json': { sha256: lock.manifestSha256 } },
};
test('explicit integration selector admits exact tuple only', () => {
    assert.equal(selection.lockFile, `transport-candidate-${id}-lock.json`);
    validateTransportCandidate(selection, lock, 999, identity);
    assert.throws(() => validateTransportCandidate(selection, lock, 1000, identity));
});
for (const q of [
    `candidate=${id}`,
    `transport=committed-candidate&candidate=${id}&candidate=${id}`,
    `transport=committed-candidate&candidate=${id}&contacts=anything`,
    `transport=committed-candidate&candidate=integration-20261101`,
    `transport=committed-candidate&transport=committed-candidate&candidate=${id}`,
])
    test(`reject ${q}`, () => assert.throws(() => select(q)));
for (const field of [
    'candidateId',
    'status',
    'expectedBuild',
    'runtimeSha256',
    'manifestSha256',
    'businessStatus',
    'qualificationEvidence',
])
    test(`reject wrong integration ${field}`, () =>
        assert.throws(() => validateTransportCandidate(selection, { ...lock, [field]: 'bad' }, 999, identity)));
for (const field of Object.keys(lock.qualification))
    test(`reject unqualified integration ${field}`, () =>
        assert.throws(() =>
            validateTransportCandidate(
                selection,
                { ...lock, qualification: { ...lock.qualification, [field]: false } },
                999,
                identity,
            ),
        ));
test('never admit missing/empty hashes even when identity matches', () =>
    assert.throws(() =>
        validateTransportCandidate(selection, { ...lock, runtimeSha256: '' }, 999, { ...identity, runtimeSha256: '' }),
    ));
test('historical selectors remain exact', () => {
    assert.equal(select('').candidateId, 'legacy-sdk220');
    assert.equal(
        select('transport=committed-candidate&candidate=sdk223').lockFile,
        'transport-candidate-sdk223-lock.json',
    );
    assert.throws(() => select('transport=committed-candidate&candidate=sdk224'));
});
