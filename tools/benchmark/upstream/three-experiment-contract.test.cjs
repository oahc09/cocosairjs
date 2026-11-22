const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const plan = require('./three-experiment-2026-11-18.json');
const root = path.resolve(__dirname, '../../..');

test('experimental arms do not participate in the protected Three score', () => {
    assert.equal(plan.schema, 'three-experiment-contract/1');
    assert.equal(plan.scope, 'exploratory-only');
    assert.equal(plan.measurementStatus, 'not-run');
    assert.equal(plan.updatesProtectedBaseline, false);
    assert.equal(plan.contributesToAgentScore, false);
    const protectedPath = path.join(root, plan.protectedBaseline.lock);
    const locked = fs.readFileSync(protectedPath);
    assert.equal(crypto.createHash('sha256').update(locked).digest('hex'), plan.protectedBaseline.sha256);
    const protectedManifest = JSON.parse(locked);
    assert.equal(protectedManifest.threeArtifact.version, plan.protectedBaseline.version);
    const immutablePublicInput = fs.readFileSync(path.join(root, protectedManifest.publicInputManifest.path));
    assert.equal(
        crypto.createHash('sha256').update(immutablePublicInput).digest('hex'),
        protectedManifest.publicInputManifest.sha256,
    );
});

test('full immutable pins and distinct timing axis identities are required', () => {
    assert.deepEqual(
        plan.measurementAxes.map(({ id }) => id),
        ['cpu-frame', 'gpu-pass-sum', 'gpu-elapsed-span', 'display-present'],
    );
    for (const exp of plan.experiments) {
        const pins = [exp.before, exp.after, ...(exp.introduced ? [exp.introduced] : [])];
        for (const pin of pins) assert.match(pin, /^[0-9a-f]{40}$/);
        assert.equal(new Set(pins).size, pins.length);
        assert.equal(exp.backend, 'webgpu');
        assert.ok(exp.mustObserve.length > 0);
    }
    assert.ok(plan.experiments.find(({ introduced }) => introduced).mustObserve.includes('probe-only'));
    assert.ok(plan.matchAcrossArms.includes('browser-and-driver'));
    assert.ok(plan.matchAcrossArms.includes('color-space-and-tone-mapping'));
});
