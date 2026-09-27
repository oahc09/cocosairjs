/* Bind the final Core GLTF, math utility, and runtime singleton probes. */
const fs = require('fs');
const path = require('path');
const { findSymbolLine } = require('./spec-evidence.cjs');

const root = path.resolve(__dirname, '../..');
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'docs/example-api-inventory.json'), 'utf8'));
const targets = [
    {
        example: 'math-bits',
        units: [
            'math.bits.sign',
            'math.bits.abs',
            'math.bits.min',
            'math.bits.max',
            'math.bits.isPow2',
            'math.bits.log2',
            'math.bits.log10',
            'math.bits.popCount',
            'math.bits.countTrailingZeros',
            'math.bits.nextPow2',
            'math.bits.prevPow2',
            'math.bits.parity',
            'math.bits.reverse',
            'math.bits.interleave2',
            'math.bits.deinterleave2',
            'math.bits.interleave3',
            'math.bits.deinterleave3',
            'math.bits.nextCombination',
        ],
    },
    {
        example: 'math-bits-constants',
        units: ['math.bits.INT_BITS', 'math.bits.INT_MAX', 'math.bits.INT_MIN'],
    },
    {
        example: 'math-scalar-utils',
        units: [
            'math.v2',
            'math.v3',
            'math.Vec4',
            'math.v4',
            'math.quat',
            'math.mat4',
            'math.size',
            'math.rect',
            'math.color',
            'math.toRadian',
            'math.toDegree',
            'math.randomRange',
            'math.randomRangeInt',
            'math.pseudoRandom',
            'math.pseudoRandomRange',
            'math.pseudoRandomRangeInt',
            'math.nextPow2',
            'math.repeat',
            'math.pingPong',
            'math.absMaxComponent',
            'math.HALF_PI',
            'math.TWO_PI',
            'math.EPSILON',
            'math.MATH_FLOAT_ARRAY',
        ],
    },
    {
        example: 'math-vec4-arithmetic',
        units: ['math.MathBase', 'math.MathBase.createFloatArray', 'math.MathBase.array'],
    },
    {
        example: 'gltf-asset-readonly',
        units: [
            'GLTFAsset',
            'GLTFAsset.sceneNames',
            'GLTFAsset.document',
            'GLTFAsset.warnings',
            'GLTFAsset.constructor',
        ],
    },
    {
        example: 'gltf-loader-registry',
        units: [
            'GLTFLoader.constructor',
            'GLTFLoader.register',
            'GLTFLoader.unregister',
            'GLTFExtensionRegistry',
            'GLTFExtensionRegistry.size',
        ],
    },
    {
        example: 'scene-runtime-ops',
        units: ['director', 'game', 'instantiate', 'builtinResMgr', 'Vec3'],
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
    for (const entry of spec.api.evidence) {
        if (entry.source !== 'src/main.ts') continue;
        const found = findSymbolLine(exampleDir, entry.source, entry.api);
        if (found.error) throw new Error(`[${example}] ${found.error}`);
        entry.sourceLocation = `L${found.line}`;
    }
    fs.writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');
}

console.log(`[wave13-core] ${targets.reduce((sum, target) => sum + target.units.length, 0)} required API units bound`);
