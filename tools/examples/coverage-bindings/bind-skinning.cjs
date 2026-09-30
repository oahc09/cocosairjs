/* Bind Important skeletal and skinned-mesh probes to the Code First sample. */
const fs = require('fs');
const path = require('path');
const { findSymbolLine } = require('../spec-evidence.cjs');

const root = path.resolve(__dirname, '../../..');
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'docs/example-api-inventory.json'), 'utf8'));
const example = 'skinned-animation';
const source = 'main.js';
const units = [
    'SkeletalAnimation',
    'SkeletalAnimation.Socket',
    'SkeletalAnimation.sockets',
    'SkeletalAnimation.useBakedAnimation',
    'SkeletalAnimation.onLoad',
    'SkeletalAnimation.onDestroy',
    'SkeletalAnimation.onEnable',
    'SkeletalAnimation.onDisable',
    'SkeletalAnimation.start',
    'SkeletalAnimation.pause',
    'SkeletalAnimation.resume',
    'SkeletalAnimation.stop',
    'SkeletalAnimation.querySockets',
    'SkeletalAnimation.rebuildSocketAnimations',
    'SkeletalAnimation.createSocket',
    'Skeleton',
    'Skeleton.constructor',
    'Skeleton.joints',
    'Skeleton.bindposes',
    'Skeleton.inverseBindposes',
    'Skeleton.hash',
    'Skeleton.destroy',
    'Skeleton.validate',
    'SkinnedMeshRenderer.skeleton',
    'SkinnedMeshRenderer.skinningRoot',
    'SkinnedMeshRenderer.model',
    'SkinnedMeshRenderer.constructor',
    'SkinnedMeshRenderer.onLoad',
    'SkinnedMeshRenderer.onDestroy',
    'SkinnedMeshRenderer.uploadAnimation',
    'SkinnedMeshRenderer.setSharedMaterial',
    'SkinnedMeshUnit',
    'SkinnedMeshUnit.mesh',
    'SkinnedMeshUnit.skeleton',
    'SkinnedMeshUnit.material',
    'SkinnedMeshUnit.offset',
    'SkinnedMeshUnit.size',
    'SkinnedMeshUnit.copyFrom',
];

const exampleDir = path.join(root, 'examples', example);
const specPath = path.join(exampleDir, 'example.json');
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
for (const unit of units) {
    if (
        !inventory.units[unit] ||
        inventory.units[unit].tier !== 'important' ||
        !inventory.units[unit].coverageRequired
    ) {
        throw new Error(`[${example}] Missing required Important inventory unit: ${unit}`);
    }
    const found = findSymbolLine(exampleDir, source, unit);
    if (found.error) throw new Error(`[${example}] ${found.error}`);
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
    if (entry.source !== source) continue;
    const found = findSymbolLine(exampleDir, source, entry.api);
    if (found.error) throw new Error(`[${example}] ${found.error}`);
    entry.sourceLocation = `L${found.line}`;
}
fs.writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');
console.log(`[wave15-skinning] ${units.length} required Important API units bound`);
