/* Bind additional Tween control APIs to the browser behavior probe. */
const fs = require('fs');
const path = require('path');
const { findSymbolLine } = require('./spec-evidence.cjs');

const root = path.resolve(__dirname, '../..');
const exampleDir = path.join(root, 'examples/tween-basic');
const specPath = path.join(exampleDir, 'example.json');
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'docs/example-api-inventory.json'), 'utf8'));
const units = [
    'Tween.then',
    'Tween.call',
    'Tween.running',
    'Tween.duration',
    'Tween.target',
    'Tween.update',
    'Tween.updateUntil',
    'Tween.hide',
    'Tween.show',
    'Tween.getRunningCount',
    'Tween.pauseAllByTarget',
    'Tween.resumeAllByTarget',
    'Tween.stopAllByTarget',
    'Tween.stopAllByTag',
];
for (const unit of units) {
    if (!inventory.units[unit] || !inventory.units[unit].coverageRequired)
        throw new Error(`Missing required inventory unit: ${unit}`);
    const source = 'src/tween-contract.ts';
    const found = findSymbolLine(exampleDir, source, unit);
    if (found.error) throw new Error(found.error);
    for (const list of [spec.apiClaims, spec.api.supporting, spec.api.claims]) {
        if (!list.includes(unit)) list.push(unit);
    }
    const existing = spec.api.evidence.find((entry) => entry.api === unit);
    if (existing) existing.sourceLocation = `L${found.line}`;
    else spec.api.evidence.push({ api: unit, source, validator: 'no-runtime-error', sourceLocation: `L${found.line}` });
}
fs.writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');
console.log(`[tween-control] ${units.length} required units bound to behavioral contract`);
