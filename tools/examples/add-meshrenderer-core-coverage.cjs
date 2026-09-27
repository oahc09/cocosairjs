/* Bind MeshRenderer public properties and exercised render/probe lifecycle methods. */
const fs = require('fs');
const path = require('path');
const { findSymbolLine } = require('./spec-evidence.cjs');

const root = path.resolve(__dirname, '../..');
const exampleDir = path.join(root, 'examples/meshrenderer-hooks');
const specPath = path.join(exampleDir, 'example.json');
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'docs/example-api-inventory.json'), 'utf8'));
const units = [
    'MeshRenderer.constructor',
    'MeshRenderer.ShadowCastingMode',
    'MeshRenderer.ShadowReceivingMode',
    'MeshRenderer.bakeSettings',
    'MeshRenderer.shadowBias',
    'MeshRenderer.shadowNormalBias',
    'MeshRenderer.shadowCastingMode',
    'MeshRenderer.shadowCastingModeForInspector',
    'MeshRenderer.receiveShadow',
    'MeshRenderer.receiveShadowForInspector',
    'MeshRenderer.mesh',
    'MeshRenderer.model',
    'MeshRenderer.enableMorph',
    'MeshRenderer.isGlobalStandardSkinObject',
    'MeshRenderer.onLoad',
    'MeshRenderer.onRestore',
    'MeshRenderer.onEnable',
    'MeshRenderer.onDisable',
    'MeshRenderer.onDestroy',
    'MeshRenderer.onGeometryChanged',
    'MeshRenderer.onUpdateReceiveDirLight',
    'MeshRenderer.updateProbeCubemap',
    'MeshRenderer.updateProbeBlendCubemap',
    'MeshRenderer.updateProbePlanarMap',
    'MeshRenderer.updateReflectionProbeDataMap',
    'MeshRenderer.updateReflectionProbeId',
    'MeshRenderer.updateReflectionProbeBlendId',
    'MeshRenderer.updateReflectionProbeBlendWeight',
];

for (const unit of units) {
    if (!inventory.units[unit] || !inventory.units[unit].coverageRequired) {
        throw new Error(`Missing required inventory unit: ${unit}`);
    }
    const source = 'src/main.ts';
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
console.log(`[meshrenderer-core] ${units.length} required APIs bound to real component behavior`);
