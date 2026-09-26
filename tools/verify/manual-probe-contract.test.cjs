const assert = require('node:assert/strict');
const { test } = require('node:test');
const { evaluateProbe, isAllowedNetworkError } = require('./manual-probe-contract.cjs');

const complete = (count) => ({
    ready: true,
    ok: true,
    checks: Array.from({ length: count }, (_, i) => ({ name: `check-${i}`, pass: true })),
});

test('required probes cannot be removed while legacy examples can omit them', () => {
    for (const id of [
        'manual-component-lifecycle',
        'manual-input-events',
        'manual-asset-lifecycle',
        'manual-animation-system',
        'manual-render-targets',
    ]) {
        assert.equal(evaluateProbe(id, false).pass, false, id);
    }
    assert.equal(evaluateProbe('manual-installation', false).pass, true);
});

test('rejects empty, incomplete, malformed, duplicate and failed assertions', () => {
    for (const probe of [complete(0), complete(1), { ready: true, ok: true }, { ...complete(2), ready: false }]) {
        assert.equal(evaluateProbe('manual-animation-system', true, probe).pass, false);
    }
    const probe = complete(2);
    probe.checks[1].name = probe.checks[0].name;
    assert.equal(evaluateProbe('manual-animation-system', true, probe).pass, false);
    probe.checks[1].name = 'other';
    probe.checks[1].pass = 'true';
    assert.equal(evaluateProbe('manual-animation-system', true, probe).pass, false);
    assert.equal(evaluateProbe('manual-installation', true, complete(0)).pass, false);
});

test('accepts all required assertion counts and rejects truncated coverage', () => {
    for (const [id, count] of [
        ['manual-component-lifecycle', 14],
        ['manual-input-events', 11],
        ['manual-asset-lifecycle', 9],
        ['manual-animation-system', 2],
        ['manual-render-targets', 1],
    ]) {
        assert.equal(evaluateProbe(id, true, complete(count)).pass, true);
        assert.equal(evaluateProbe(id, true, complete(count - 1)).pass, false);
    }
});

test('only the intentional missing asset HTTP 404 is exempt', () => {
    const id = 'manual-asset-lifecycle';
    const error = 'Failed to load resource: the server responded with a status of 404 (Not Found)';
    const url = 'http://127.0.0.1:1234/assets/does-not-exist.json';
    assert.equal(isAllowedNetworkError(id, error, url), true);
    assert.equal(isAllowedNetworkError(id, error.replace('404', '500'), url), false);
    assert.equal(isAllowedNetworkError(id, error, url.replace('does-not-exist', 'air-manifest')), false);
    assert.equal(isAllowedNetworkError('manual-installation', error, url), false);
    assert.equal(isAllowedNetworkError(id, error, ''), false);
});
