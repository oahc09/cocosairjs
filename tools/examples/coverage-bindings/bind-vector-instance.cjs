/* Bind the Vec2/Vec3/Vec4 instance behavior contracts to required API units. */
const fs = require('fs');
const path = require('path');
const { findSymbolLine } = require('../spec-evidence.cjs');

const root = path.resolve(__dirname, '../../..');
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'docs/example-api-inventory.json'), 'utf8'));
const shared = [
    'clone',
    'set',
    'equals',
    'strictEquals',
    'lerp',
    'add',
    'subtract',
    'multiplyScalar',
    'multiply',
    'divide',
    'dot',
    'lengthSqr',
    'normalize',
    'transformMat4',
];
const groups = [
    { name: 'Vec2', id: 'math-vec2-arithmetic', methods: [...shared, 'cross', 'angle'] },
    { name: 'Vec3', id: 'math-vec3-arithmetic', methods: [...shared, 'cross'] },
    { name: 'Vec4', id: 'math-vec4-arithmetic', methods: [...shared, 'scale'] },
    {
        name: 'Quat',
        id: 'math-quat-applied',
        methods: ['clone', 'set', 'equals', 'strictEquals', 'lerp', 'slerp', 'lengthSqr'],
    },
    {
        name: 'Mat3',
        id: 'math-mat3-basics',
        methods: [
            'clone',
            'set',
            'equals',
            'strictEquals',
            'identity',
            'transpose',
            'invert',
            'determinant',
            'add',
            'subtract',
            'multiply',
            'multiplyScalar',
            'scale',
            'rotate',
            'fromQuat',
        ],
    },
    {
        name: 'Mat4',
        id: 'math-mat4-basics',
        methods: [
            'clone',
            'set',
            'equals',
            'strictEquals',
            'identity',
            'zero',
            'transpose',
            'invert',
            'determinant',
            'add',
            'subtract',
            'multiply',
            'multiplyScalar',
            'transform',
            'scale',
            'rotate',
            'getTranslation',
            'getRotation',
            'fromSRT',
            'fromQuat',
        ],
    },
    { name: 'Size', id: 'math-size-ops', methods: ['equals', 'lerp'] },
    { name: 'Rect', id: 'math-rect-ops', methods: ['equals', 'lerp'] },
    { name: 'Color', id: 'math-color-models', methods: ['clone', 'equals', 'lerp', 'fromHEX', 'set', 'multiply'] },
];

for (const group of groups) {
    const exampleDir = path.join(root, 'examples', group.id);
    const specPath = path.join(exampleDir, 'example.json');
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
    for (const method of group.methods) {
        const unit = `math.${group.name}.prototype.${method}`;
        if (!inventory.units[unit] || !inventory.units[unit].coverageRequired)
            throw new Error(`Missing required inventory unit: ${unit}`);
        const source = 'src/instance-contract.ts';
        const found = findSymbolLine(exampleDir, source, unit);
        if (found.error) throw new Error(found.error);
        for (const list of [spec.apiClaims, spec.api.supporting, spec.api.claims]) {
            if (!list.includes(unit)) list.push(unit);
        }
        const existing = spec.api.evidence.find((entry) => entry.api === unit);
        if (existing) {
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
    fs.writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');
    console.log(`[vector-instance] ${group.id}: ${group.methods.length} required units bound`);
}
