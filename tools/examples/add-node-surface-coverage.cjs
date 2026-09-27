/* Bind core Node property/method probes to the hierarchy example. */
const fs = require('fs');
const path = require('path');
const { findSymbolLine } = require('./spec-evidence.cjs');

const root = path.resolve(__dirname, '../..');
const exampleDir = path.join(root, 'examples/node-hierarchy');
const specPath = path.join(exampleDir, 'example.json');
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'docs/example-api-inventory.json'), 'utf8'));
const units = [
    'Node.components',
    'Node.name',
    'Node.uuid',
    'Node.children',
    'Node.active',
    'Node.activeInHierarchy',
    'Node.parent',
    'Node.scene',
    'Node.EventType',
    'Node.NodeSpace',
    'Node.TransformBit',
    'Node.isNode',
    'Node.position',
    'Node.x',
    'Node.y',
    'Node.z',
    'Node.worldPosition',
    'Node.worldPositionX',
    'Node.worldPositionY',
    'Node.worldPositionZ',
    'Node.rotation',
    'Node.eulerAngles',
    'Node.angle',
    'Node.worldRotation',
    'Node.scale',
    'Node.worldScale',
    'Node.matrix',
    'Node.worldMatrix',
    'Node.forward',
    'Node.up',
    'Node.right',
    'Node.mobility',
    'Node.layer',
    'Node.hasChangedFlags',
    'Node.attr',
    'Node.invalidateChildren',
    'Node.isTransformDirty',
    'Node.pauseSystemEvents',
    'Node.resumeSystemEvents',
    'Node.resetHasChangedFlags',
    'Node.clearNodeArray',
];

for (const unit of units) {
    if (!inventory.units[unit] || !inventory.units[unit].coverageRequired) {
        throw new Error(`Missing required inventory unit: ${unit}`);
    }
    const source = 'src/transform-contract.ts';
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

fs.writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');
console.log(`[node-surface] ${units.length} required Node APIs bound to the hierarchy behavior contract`);
