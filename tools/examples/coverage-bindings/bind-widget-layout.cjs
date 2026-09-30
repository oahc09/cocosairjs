/* Bind Widget alignment properties to the responsive Gallery layout example. */
const fs = require('fs');
const path = require('path');
const { findSymbolLine } = require('../spec-evidence.cjs');

const root = path.resolve(__dirname, '../../..');
const exampleDir = path.join(root, 'examples/ui-layout');
const specPath = path.join(exampleDir, 'example.json');
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'docs/example-api-inventory.json'), 'utf8'));
const properties = [
    'isAlignLeft',
    'isAlignRight',
    'isAlignTop',
    'isAlignBottom',
    'left',
    'right',
    'top',
    'bottom',
    'alignMode',
    'isAlignVerticalCenter',
    'verticalCenter',
    'constructor',
    'target',
    'isAlignHorizontalCenter',
    'isStretchWidth',
    'isStretchHeight',
    'horizontalCenter',
    'isAbsoluteTop',
    'isAbsoluteBottom',
    'isAbsoluteLeft',
    'isAbsoluteRight',
    'isAbsoluteHorizontalCenter',
    'isAbsoluteVerticalCenter',
    'alignFlags',
    'updateAlignment',
    'setDirty',
];
for (const property of properties) {
    const unit = `Widget.${property}`;
    if (!inventory.units[unit] || !inventory.units[unit].coverageRequired)
        throw new Error(`Missing required inventory unit: ${unit}`);
    const source = 'main.js';
    const found = findSymbolLine(exampleDir, source, unit);
    if (found.error) throw new Error(found.error);
    for (const list of [spec.apiClaims, spec.api.supporting, spec.api.claims].filter(Array.isArray)) {
        if (!list.includes(unit)) list.push(unit);
    }
    const existing = spec.api.evidence.find((entry) => entry.api === unit);
    if (existing) existing.sourceLocation = `L${found.line}`;
    else spec.api.evidence.push({ api: unit, source, validator: 'transform-equals', sourceLocation: `L${found.line}` });
}
fs.writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');
console.log(`[widget-layout] ${properties.length} required properties bound to responsive layout`);
