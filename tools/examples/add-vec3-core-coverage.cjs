/* Bind the remaining Core Vec3 constants, static functions, and component accessors. */
const fs = require('fs');
const path = require('path');
const { findSymbolLine } = require('./spec-evidence.cjs');

const root = path.resolve(__dirname, '../..');
const exampleDir = path.join(root, 'examples/math-vec3-length-products');
const specPath = path.join(exampleDir, 'example.json');
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'docs/example-api-inventory.json'), 'utf8'));
const units = [
    'math.Vec3.UNIT_X',
    'math.Vec3.UNIT_Y',
    'math.Vec3.UNIT_Z',
    'math.Vec3.RIGHT',
    'math.Vec3.UP',
    'math.Vec3.FORWARD',
    'math.Vec3.ZERO',
    'math.Vec3.ONE',
    'math.Vec3.NEG_ONE',
    'math.Vec3.zero',
    'math.Vec3.clone',
    'math.Vec3.copy',
    'math.Vec3.ceil',
    'math.Vec3.floor',
    'math.Vec3.min',
    'math.Vec3.max',
    'math.Vec3.round',
    'math.Vec3.scaleAndAdd',
    'math.Vec3.negate',
    'math.Vec3.invert',
    'math.Vec3.invertSafe',
    'math.Vec3.slerp',
    'math.Vec3.random',
    'math.Vec3.transformMat4Normal',
    'math.Vec3.transformMat3',
    'math.Vec3.transformAffine',
    'math.Vec3.transformQuat',
    'math.Vec3.transformRTS',
    'math.Vec3.transformInverseRTS',
    'math.Vec3.rotateX',
    'math.Vec3.rotateY',
    'math.Vec3.rotateZ',
    'math.Vec3.rotateN',
    'math.Vec3.toArray',
    'math.Vec3.fromArray',
    'math.Vec3.signedAngle',
    'math.Vec3.projectOnPlane',
    'math.Vec3.project',
    'math.Vec3.moveTowards',
    'math.Vec3.generateOrthogonal',
    'math.Vec3.x',
    'math.Vec3.y',
    'math.Vec3.z',
];

for (const unit of units) {
    if (!inventory.units[unit] || !inventory.units[unit].coverageRequired) {
        throw new Error(`Missing required inventory unit: ${unit}`);
    }
    const source = 'src/vec3-core-contract.ts';
    const found = findSymbolLine(exampleDir, source, unit);
    if (found.error) throw new Error(found.error);
    for (const list of [spec.apiClaims, spec.api.supporting, spec.api.claims].filter(Array.isArray)) {
        if (!list.includes(unit)) list.push(unit);
    }
    const existing = spec.api.evidence.find((entry) => entry.api === unit);
    if (existing) {
        existing.source = source;
        existing.validator = 'no-runtime-error';
        existing.sourceLocation = `L${found.line}`;
    } else {
        spec.api.evidence.push({ api: unit, source, validator: 'no-runtime-error', sourceLocation: `L${found.line}` });
    }
}
for (const entry of spec.api.evidence) {
    if (entry.source !== 'src/main.ts') continue;
    const found = findSymbolLine(exampleDir, entry.source, entry.api);
    if (found.error) throw new Error(found.error);
    entry.sourceLocation = `L${found.line}`;
}

fs.writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');
console.log(`[vec3-core] ${units.length} required Vec3 APIs bound to the deterministic math probe`);
