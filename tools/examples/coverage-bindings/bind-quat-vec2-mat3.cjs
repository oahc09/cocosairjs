/* Bind Core Quat, Vec2, and Mat3 probes to their runnable examples. */
const fs = require('fs');
const path = require('path');
const { findSymbolLine } = require('../spec-evidence.cjs');

const root = path.resolve(__dirname, '../../..');
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'docs/example-api-inventory.json'), 'utf8'));
const targets = [
    {
        example: 'math-quat-applied',
        units: [
            'math.Quat.IDENTITY',
            'math.Quat.clone',
            'math.Quat.copy',
            'math.Quat.identity',
            'math.Quat.rotationTo',
            'math.Quat.getAxisAngle',
            'math.Quat.multiply',
            'math.Quat.multiplyScalar',
            'math.Quat.scaleAndAdd',
            'math.Quat.rotateX',
            'math.Quat.rotateY',
            'math.Quat.rotateZ',
            'math.Quat.rotateAround',
            'math.Quat.rotateAroundLocal',
            'math.Quat.calculateW',
            'math.Quat.dot',
            'math.Quat.sqlerp',
            'math.Quat.invert',
            'math.Quat.conjugate',
            'math.Quat.len',
            'math.Quat.normalize',
            'math.Quat.fromAxes',
            'math.Quat.fromViewUp',
            'math.Quat.fromAxisAngle',
            'math.Quat.fromMat3',
            'math.Quat.fromEuler',
            'math.Quat.fromAngleZ',
            'math.Quat.toArray',
        ],
    },
    {
        example: 'math-vec2-arithmetic',
        units: [
            'math.Vec2.ZERO',
            'math.Vec2.ONE',
            'math.Vec2.NEG_ONE',
            'math.Vec2.UNIT_X',
            'math.Vec2.UNIT_Y',
            'math.Vec2.clone',
            'math.Vec2.copy',
            'math.Vec2.ceil',
            'math.Vec2.floor',
            'math.Vec2.min',
            'math.Vec2.max',
            'math.Vec2.round',
            'math.Vec2.scaleAndAdd',
            'math.Vec2.distance',
            'math.Vec2.squaredDistance',
            'math.Vec2.len',
            'math.Vec2.negate',
            'math.Vec2.inverse',
            'math.Vec2.inverseSafe',
            'math.Vec2.random',
            'math.Vec2.transformMat3',
            'math.Vec2.str',
            'math.Vec2.toArray',
            'math.Vec2.fromArray',
        ],
    },
    {
        example: 'math-mat3-basics',
        units: [
            'math.Mat3.IDENTITY',
            'math.Mat3.clone',
            'math.Mat3.copy',
            'math.Mat3.multiplyMat4',
            'math.Mat3.translate',
            'math.Mat3.fromMat4',
            'math.Mat3.fromViewUp',
            'math.Mat3.fromTranslation',
            'math.Mat3.fromScaling',
            'math.Mat3.fromRotation',
            'math.Mat3.inverseTransposeMat4',
            'math.Mat3.toArray',
            'math.Mat3.fromArray',
            'math.Mat3.multiplyScalarAndAdd',
            'math.Mat3.toEuler',
            'math.Mat3.constructor',
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
    for (const entry of spec.api.evidence) {
        if (entry.source !== 'src/main.ts') continue;
        const found = findSymbolLine(exampleDir, entry.source, entry.api);
        if (found.error) throw new Error(`[${example}] ${found.error}`);
        entry.sourceLocation = `L${found.line}`;
    }
    fs.writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');
}

console.log(
    `[math-core-wave11] ${targets.reduce((sum, target) => sum + target.units.length, 0)} required math APIs bound`,
);
