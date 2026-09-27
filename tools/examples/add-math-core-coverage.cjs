/* Bind Core Mat4, Vec4, and Color probes to their runnable examples. */
const fs = require('fs');
const path = require('path');
const { findSymbolLine } = require('./spec-evidence.cjs');

const root = path.resolve(__dirname, '../..');
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'docs/example-api-inventory.json'), 'utf8'));
const targets = [
    {
        example: 'math-mat4-basics',
        units: [
            'math.Mat4.IDENTITY',
            'math.Mat4.clone',
            'math.Mat4.copy',
            'math.Mat4.rotateX',
            'math.Mat4.rotateY',
            'math.Mat4.rotateZ',
            'math.Mat4.fromTranslation',
            'math.Mat4.fromScaling',
            'math.Mat4.fromRotation',
            'math.Mat4.fromXRotation',
            'math.Mat4.fromYRotation',
            'math.Mat4.fromZRotation',
            'math.Mat4.fromRT',
            'math.Mat4.getScaling',
            'math.Mat4.toSRT',
            'math.Mat4.toEuler',
            'math.Mat4.fromSRTOrigin',
            'math.Mat4.frustum',
            'math.Mat4.perspective',
            'math.Mat4.ortho',
            'math.Mat4.lookAt',
            'math.Mat4.toArray',
            'math.Mat4.fromArray',
            'math.Mat4.multiplyScalarAndAdd',
            'math.Mat4.m01',
            'math.Mat4.m02',
            'math.Mat4.m04',
            'math.Mat4.m06',
            'math.Mat4.m08',
            'math.Mat4.m09',
            'math.Mat4.m12',
            'math.Mat4.m13',
            'math.Mat4.m14',
            'math.Mat4.constructor',
        ],
    },
    {
        example: 'math-vec4-arithmetic',
        units: [
            'math.Vec4.ZERO',
            'math.Vec4.ONE',
            'math.Vec4.NEG_ONE',
            'math.Vec4.UNIT_X',
            'math.Vec4.UNIT_Y',
            'math.Vec4.UNIT_Z',
            'math.Vec4.UNIT_W',
            'math.Vec4.clone',
            'math.Vec4.copy',
            'math.Vec4.fromColor',
            'math.Vec4.angle',
            'math.Vec4.ceil',
            'math.Vec4.floor',
            'math.Vec4.min',
            'math.Vec4.max',
            'math.Vec4.round',
            'math.Vec4.scaleAndAdd',
            'math.Vec4.distance',
            'math.Vec4.squaredDistance',
            'math.Vec4.len',
            'math.Vec4.negate',
            'math.Vec4.inverse',
            'math.Vec4.inverseSafe',
            'math.Vec4.random',
            'math.Vec4.transformAffine',
            'math.Vec4.transformQuat',
            'math.Vec4.toArray',
            'math.Vec4.fromArray',
            'math.Vec4.add4f',
            'math.Vec4.subtract4f',
            'math.Vec4.multiply4f',
            'math.Vec4.divide4f',
        ],
    },
    {
        example: 'math-color-models',
        units: [
            'math.Color.WHITE',
            'math.Color.GRAY',
            'math.Color.BLACK',
            'math.Color.TRANSPARENT',
            'math.Color.RED',
            'math.Color.GREEN',
            'math.Color.BLUE',
            'math.Color.CYAN',
            'math.Color.MAGENTA',
            'math.Color.YELLOW',
            'math.Color.clone',
            'math.Color.copy',
            'math.Color.add',
            'math.Color.subtract',
            'math.Color.divide',
            'math.Color.scale',
            'math.Color.toArray',
            'math.Color.fromArray',
            'math.Color.fromUint32',
            'math.Color.strictEquals',
            'math.Color.hex',
            'math.Color.r',
            'math.Color.g',
            'math.Color.b',
            'math.Color.a',
            'math.Color.x',
            'math.Color.y',
            'math.Color.z',
            'math.Color.w',
            'math.Color.constructor',
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

console.log(`[math-core] ${targets.reduce((sum, target) => sum + target.units.length, 0)} required math APIs bound`);
