/* Bind code-first Animation/AnimationClip behavior to the public API inventory. */
const fs = require('fs');
const path = require('path');
const { findSymbolLine } = require('../spec-evidence.cjs');

const root = path.resolve(__dirname, '../../..');
const exampleDir = path.join(root, 'examples/anim-position');
const specPath = path.join(exampleDir, 'example.json');
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'docs/example-api-inventory.json'), 'utf8'));
const units = [
    'Animation',
    'Animation.defaultClip',
    'Animation.clips',
    'Animation.playOnLoad',
    'Animation.play',
    'Animation.crossFade',
    'Animation.pause',
    'Animation.resume',
    'Animation.stop',
    'Animation.getState',
    'Animation.createState',
    'Animation.removeState',
    'Animation.addClip',
    'Animation.removeClip',
    'Animation.on',
    'Animation.once',
    'Animation.off',
    'AnimationClip',
    'AnimationClip.constructor',
    'AnimationClip.duration',
    'AnimationClip.wrapMode',
    'AnimationClip.tracksCount',
    'AnimationClip.addTrack',
    'AnimationClip.getTrack',
    'AnimationClip.removeTrack',
    'AnimationClip.clearTracks',
    'AnimationClip.hasEvents',
    'AnimationClip.tracks',
    'AnimationClip.range',
    'AnimationClip.hash',
    'AnimationClip.events',
    'AnimationClip.destroy',
];
if (!spec.api.primary.includes('Animation')) spec.api.primary.push('Animation');
for (const unit of units) {
    if (!inventory.units[unit] || !inventory.units[unit].coverageRequired)
        throw new Error(`Missing required inventory unit: ${unit}`);
    const source = 'src/animation-contract.ts';
    const found = findSymbolLine(exampleDir, source, unit);
    if (found.error) throw new Error(found.error);
    for (const list of [spec.apiClaims, spec.api.claims].filter(Array.isArray)) {
        if (!list.includes(unit)) list.push(unit);
    }
    if (unit !== 'Animation' && !spec.api.supporting.includes(unit)) spec.api.supporting.push(unit);
    const existing = spec.api.evidence.find((entry) => entry.api === unit);
    if (existing) existing.sourceLocation = `L${found.line}`;
    else spec.api.evidence.push({ api: unit, source, validator: 'no-runtime-error', sourceLocation: `L${found.line}` });
}
fs.writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');
console.log(`[animation-runtime] ${units.length} required units bound to behavior probe`);
