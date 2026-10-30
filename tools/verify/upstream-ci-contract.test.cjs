const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { classify } = require('./ci-scope.cjs');
const root = path.resolve(__dirname, '../..');
for (const file of [
    'src/cocos/3d/assets/mesh.ts',
    'src/air/assets/gltf/loader.ts',
    'tools/verify/upstream-gates.cjs',
    'tools/benchmark/upstream/public-inputs.json',
    'tools/benchmark/upstream/references/three-reference.mjs',
    'test/smoke/upstream-showroom-contract.test.ts',
    'examples/material-inspection-showroom/src/showroom.ts',
    'examples/files.json',
])
    test('existing fail-closed classifier covers ' + file, () => {
        const plan = classify([file]);
        assert.equal(plan.code, true);
        assert.equal(plan.full, true);
    });
test('original workflow triggers, five browser examples, retention and mandatory core checks remain', () => {
    const text = fs.readFileSync(path.join(root, '.github/workflows/format.yml'), 'utf8'),
        workflow = yaml.load(text),
        steps = workflow.jobs.quality.steps;
    for (const event of ['pull_request', 'push', 'workflow_dispatch', 'workflow_call'])
        assert.ok(Object.hasOwn(workflow.on, event));
    assert.equal(workflow.permissions.contents, 'read');
    const browser = steps.find((step) => step.id === 'core_browser').run;
    assert.match(browser, /for id in shader-driver-pilot glass-refraction gltf-viewer input spark-splats/);
    assert.match(browser, /upstream-state-isolation\.cjs/);
    const core = steps.find((step) => step.id === 'core_cpu').run;
    for (const file of [
        'webgl2-state-audit.test.ts',
        'smoke-01-bootstrap.test.ts',
        'audio-cancellation.test.ts',
        'dynamic-atlas-ownership.test.ts',
        'upstream-request-policy.test.ts',
        'upstream-gates.test.cjs',
        'tools/benchmark/upstream/prepare-inputs.test.cjs',
        'tools/benchmark/upstream/reference-contracts.test.cjs',
        'tools/benchmark/upstream/references/request-reference.test.cjs',
        'tools/benchmark/upstream/references/three-runner.test.cjs',
        'tools/verify/upstream-sdk-compatibility.test.cjs',
    ])
        assert.ok(core.includes(file));
    assert.equal(steps.find((step) => step.id === 'gate').if, 'always()');
    assert.ok(
        steps.some(
            (step) =>
                step.uses === 'actions/upload-artifact@v4' &&
                step.if === 'always()' &&
                step.with.path.includes('core-example-smoke/'),
        ),
    );
    assert.ok(!browser.includes('upstream-experiments') && !browser.includes('upstream-showroom.cjs'));
});
