/* Ensure value-type constructors are instrumented when examples claim their own data fields. */
const fs = require('fs');
const path = require('path');
const { findSymbolLine } = require('../spec-evidence.cjs');

const root = path.resolve(__dirname, '../../..');
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'docs/example-api-inventory.json'), 'utf8'));
const targets = [
    { example: 'math-mat3-elements', unit: 'math.Mat3' },
    { example: 'math-mat3-transforms', unit: 'math.Mat3' },
    { example: 'math-mat4-transform', unit: 'math.Mat4' },
    { example: 'math-quat-interp', unit: 'math.Quat' },
    { example: 'math-vec2-equality-misc', unit: 'math.Vec2' },
];

for (const { example, unit } of targets) {
    if (!inventory.units[unit] || !inventory.units[unit].coverageRequired) {
        throw new Error(`Missing required inventory unit: ${unit}`);
    }
    const exampleDir = path.join(root, 'examples', example);
    const specPath = path.join(exampleDir, 'example.json');
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
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
        spec.api.evidence.push({ api: unit, source, validator: 'no-runtime-error', sourceLocation: `L${found.line}` });
    }
    fs.writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');
}

console.log(`[math-value-class] ${targets.length} value-type constructor claims bound to their field-access examples`);
