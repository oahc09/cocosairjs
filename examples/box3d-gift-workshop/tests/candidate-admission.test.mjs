import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { selectTransportCandidate, validateTransportCandidate } from '../src/candidate-admission.mjs';
const read = (name) => JSON.parse(fs.readFileSync(new URL(`../${name}`, import.meta.url)));
const current = read('transport-candidate-sdk223-lock.json');
const old = read('transport-candidate-lock.json');
const select = (q) => selectTransportCandidate(new URLSearchParams(q));
const legacy = select('transport=committed-candidate');
const sdk223 = select('transport=committed-candidate&candidate=sdk223');
const identity = (lock) => ({
    runtimeSha256: lock.runtimeSha256,
    runtimeAssets: { 'manifest.json': { sha256: lock.manifestSha256 } },
});
test('default entry selects original frozen 220 lock', () => {
    assert.equal(select('').lockFile, 'transport-candidate-lock.json');
    assert.equal(legacy.candidateId, 'legacy-sdk220');
    validateTransportCandidate(legacy, old, 220, identity(old));
    assert.throws(() => validateTransportCandidate(legacy, old, 223, identity(current)));
});
test('exact explicit SDK223 selects new lock and admits matched tuple only', () => {
    assert.equal(sdk223.lockFile, 'transport-candidate-sdk223-lock.json');
    validateTransportCandidate(sdk223, current, 223, identity(current));
    assert.throws(() => validateTransportCandidate(sdk223, old, 220, identity(old)));
});
for (const q of [
    'candidate=',
    'candidate=SDK223',
    'candidate=sdk224',
    'candidate=../transport-candidate-lock.json',
    'candidate=sdk223',
    'transport=committed-candidate&candidate=sdk223&candidate=sdk223',
    'transport=committed-candidate&transport=committed-candidate&candidate=sdk223',
    'transport=committed-candidate&candidate=sdk223&contacts=primitive-candidate',
]) {
    test(`reject selector ${q}`, () => assert.throws(() => select(q)));
}
for (const field of ['status', 'expectedBuild', 'runtimeSha256', 'manifestSha256', 'candidateId', 'businessStatus']) {
    test(`reject mismatched ${field}`, () =>
        assert.throws(() =>
            validateTransportCandidate(sdk223, { ...current, [field]: 'wrong' }, 223, identity(current)),
        ));
}
for (const field of Object.keys(current.qualification)) {
    test(`reject missing ${field} evidence`, () =>
        assert.throws(() =>
            validateTransportCandidate(
                sdk223,
                { ...current, qualification: { ...current.qualification, [field]: false } },
                223,
                identity(current),
            ),
        ));
}
test('missing identity rejects; all admission modules and both locks are in identity source roster', () => {
    assert.throws(() => validateTransportCandidate(sdk223, current, 223, {}));
    const server = fs.readFileSync(new URL('../serve.cjs', import.meta.url), 'utf8');
    for (const name of [
        'transport-candidate-lock.json',
        'contact-candidate-lock.json',
        'transport-candidate-sdk223-lock.json',
    ])
        assert.ok(server.includes(`'${name}'`));
    assert.ok(server.includes("readdirSync(path.join(__dirname, 'src'))"));
});
test('qualification evidence is frozen by the new lock', () => {
    const evidence = fs.readFileSync(
        new URL(
            '../../../tools/verify/box3d/gift-workshop/evidence/sdk223-admission/qualification-map.json',
            import.meta.url,
        ),
    );
    assert.equal(crypto.createHash('sha256').update(evidence).digest('hex'), current.qualificationEvidence.mapSha256);
    assert.equal(JSON.parse(evidence).businessStatus, 'NOT_RUN');
});
