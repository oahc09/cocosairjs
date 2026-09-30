/* Bind Important animation and tween surface probes to their executed examples. */
const fs = require('fs');
const path = require('path');
const { findSymbolLine } = require('../spec-evidence.cjs');

const root = path.resolve(__dirname, '../../..');
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'docs/example-api-inventory.json'), 'utf8'));
const targets = [
    {
        example: 'anim-position',
        source: 'src/animation-contract.ts',
        units: [
            'Animation.EventType',
            'Animation.playOnLoad',
            'Animation.onLoad',
            'Animation.start',
            'Animation.onEnable',
            'Animation.onDisable',
            'Animation.onDestroy',
            'AnimationClip.WrapMode',
            'AnimationClip.createWithSpriteFrames',
            'AnimationClip.sample',
            'AnimationClip.speed',
            'AnimationClip.wrapMode',
            'AnimationClip.isAdditive_experimental',
            'AnimationClip.onLoaded',
            'AnimationClip.auxiliaryCurveCount_experimental',
            'AnimationClip.getAuxiliaryCurveNames_experimental',
            'AnimationClip.hasAuxiliaryCurve_experimental',
            'AnimationClip.addAuxiliaryCurve_experimental',
            'AnimationClip.getAuxiliaryCurve_experimental',
            'AnimationClip.renameAuxiliaryCurve_experimental',
            'AnimationClip.removeAuxiliaryCurve_experimental',
        ],
    },
    {
        example: 'tween-basic',
        source: 'src/tween-contract.ts',
        units: [
            'Tween',
            'Tween.constructor',
            'TweenSystem',
            'TweenSystem.ID',
            'TweenSystem.instance',
            'TweenSystem.ActionManager',
            'TweenSystem.constructor',
            'TweenSystem.update',
        ],
    },
];

let bound = 0;
for (const { example, source, units } of targets) {
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
            spec.api.evidence.push({
                api: unit,
                source,
                validator: 'no-runtime-error',
                sourceLocation: `L${found.line}`,
            });
        }
        bound++;
    }
    for (const entry of spec.api.evidence) {
        if (entry.source !== source) continue;
        const found = findSymbolLine(exampleDir, source, entry.api);
        if (found.error) throw new Error(`[${example}] ${found.error}`);
        entry.sourceLocation = `L${found.line}`;
    }
    fs.writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');
}

console.log(`[wave14-animation] ${bound} required Important API units bound`);
