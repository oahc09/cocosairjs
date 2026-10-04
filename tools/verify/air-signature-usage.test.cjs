const assert = require('node:assert/strict');
const path = require('node:path');
const { inspect } = require('./air-signature-usage.cjs');
const fixture = (name) => path.resolve(__dirname, '../../test/fixtures/air-signatures', name);
const valid = inspect([fixture('valid.ts')], { types: true });
assert.equal(valid.status, 'PASS', JSON.stringify(valid));
for (const file of ['invalid.ts', 'invalid.js']) {
    const result = inspect([fixture(file)], { types: true });
    assert.equal(result.status, 'FAIL');
    assert.deepEqual(result.findings.map((finding) => finding.code), [
        'AIR_USAGE_SCENE_COMPONENT', 'AIR_USAGE_VOID_CHILD', 'AIR_USAGE_GEOMETRY_MESH',
    ]);
    assert(result.diagnostics.some((entry) => entry.message.includes("type 'void'")), JSON.stringify(result.diagnostics));
    assert(result.diagnostics.some((entry) => entry.message.includes('Mesh')), JSON.stringify(result.diagnostics));
    assert(result.diagnostics.some((entry) => entry.message.includes("type 'number'")), JSON.stringify(result.diagnostics));
}
assert.throws(() => inspect([fixture('missing.ts')]), /input does not exist/);
console.log('PASS: real JS/TS types; Scene compatibility stub; void addChild; geometry/Mesh; primitive argument; native-type provenance; missing file');
