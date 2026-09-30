/* Bind Core light-family property and lifecycle probes to their runnable examples. */
const fs = require('fs');
const path = require('path');
const { findSymbolLine } = require('../spec-evidence.cjs');

const root = path.resolve(__dirname, '../../..');
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'docs/example-api-inventory.json'), 'utf8'));
const targets = [
    {
        example: 'light-spot',
        units: [
            'Light',
            'Light.constructor',
            'Light.Type',
            'Light.color',
            'Light.useColorTemperature',
            'Light.colorTemperature',
            'Light.staticSettings',
            'Light.type',
            'Light.baked',
            'Light.visibility',
            'Light.onEnable',
            'Light.onDisable',
            'Light.onDestroy',
            'SpotLight.constructor',
            'SpotLight.luminousFlux',
            'SpotLight.luminance',
            'SpotLight.term',
            'SpotLight.size',
            'SpotLight.range',
            'SpotLight.spotAngle',
            'SpotLight.angleAttenuationStrength',
            'SpotLight.shadowEnabled',
            'SpotLight.shadowPcf',
            'SpotLight.shadowBias',
            'SpotLight.shadowNormalBias',
        ],
    },
    {
        example: 'light-two-directional',
        units: [
            'DirectionalLight.illuminance',
            'DirectionalLight.shadowEnabled',
            'DirectionalLight.shadowPcf',
            'DirectionalLight.shadowBias',
            'DirectionalLight.shadowNormalBias',
            'DirectionalLight.shadowSaturation',
            'DirectionalLight.shadowDistance',
            'DirectionalLight.shadowInvisibleOcclusionRange',
            'DirectionalLight.csmLevel',
            'DirectionalLight.enableCSM',
            'DirectionalLight.csmLayerLambda',
            'DirectionalLight.shadowFixedArea',
            'DirectionalLight.shadowNear',
            'DirectionalLight.shadowFar',
            'DirectionalLight.shadowOrthoSize',
            'DirectionalLight.csmAdvancedOptions',
            'DirectionalLight.csmLayersTransition',
            'DirectionalLight.csmTransitionRange',
        ],
    },
    {
        example: 'light-point',
        units: [
            'PointLight.constructor',
            'PointLight.luminousFlux',
            'PointLight.luminance',
            'PointLight.term',
            'PointLight.range',
        ],
    },
    {
        example: 'light-sphere',
        units: [
            'SphereLight',
            'SphereLight.constructor',
            'SphereLight.luminousFlux',
            'SphereLight.luminance',
            'SphereLight.term',
            'SphereLight.size',
            'SphereLight.range',
        ],
    },
];

for (const { example, units } of targets) {
    const exampleDir = path.join(root, 'examples', example);
    const specPath = path.join(exampleDir, 'example.json');
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
    for (const unit of units) {
        if (!inventory.units[unit] || !inventory.units[unit].coverageRequired) {
            throw new Error(`[${example}] Missing required inventory unit: ${unit}`);
        }
        const source = 'src/main.ts';
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
    }
    if (example === 'light-spot') {
        spec.validation = spec.validation || {};
        spec.validation.lifecycle = spec.validation.lifecycle || [];
        if (!spec.validation.lifecycle.includes('resource-released'))
            spec.validation.lifecycle.push('resource-released');
    }
    for (const entry of spec.api.evidence) {
        if (entry.source !== 'src/main.ts') continue;
        const found = findSymbolLine(exampleDir, entry.source, entry.api);
        if (found.error) throw new Error(`[${example}] ${found.error}`);
        entry.sourceLocation = `L${found.line}`;
    }
    fs.writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');
}

console.log(
    `[light-core] ${targets.reduce((sum, target) => sum + target.units.length, 0)} required light-family APIs bound`,
);
