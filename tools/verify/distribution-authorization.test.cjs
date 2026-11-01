const test = require('node:test');
const assert = require('node:assert/strict');
const { distributionFailures } = require('./verify-licenses.cjs');
const decisions = require('../../docs/license-decisions.json').decisions;

test('repository scope blocks both pending PAL history and publicly distributed Spark', () => {
    const failures = distributionFailures(decisions, 'repository');
    assert.equal(failures.length, 2);
    assert.match(failures.join('\n'), /PAL/);
    assert.match(failures.join('\n'), /Spark/);
});

test('default SDK isolation never grants permission to distribute Spark or Git history', () => {
    assert.deepEqual(distributionFailures(decisions, 'default'), []);
    assert.equal(distributionFailures(decisions, 'spark').length, 1);
    assert.throws(() => distributionFailures(decisions, 'unknown'), /Unknown license scope/);
});

test('owner risk acceptance does not waive missing Spark authorization', () => {
    const copy = JSON.parse(JSON.stringify(decisions));
    copy['spark-rs WASM 与 wasm-bindgen glue'].riskAccepted = true;
    assert.equal(distributionFailures(copy, 'spark').length, 1);
    copy['spark-rs WASM 与 wasm-bindgen glue'].disposition = 'accepted';
    assert.equal(distributionFailures(copy, 'spark').length, 1);
});

test('Spark builder refuses pending distribution before creating any output', async () => {
    await assert.rejects(require('../build/spark-module.cjs').buildSparkModule(), /Spark distribution blocked/);
});
