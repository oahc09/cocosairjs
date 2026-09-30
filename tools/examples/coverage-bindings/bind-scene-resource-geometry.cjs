/* Bind remaining Core scene, resource, and geometry probes to runnable examples. */
const fs = require('fs');
const path = require('path');
const { findSymbolLine } = require('../spec-evidence.cjs');

const root = path.resolve(__dirname, '../../..');
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'docs/example-api-inventory.json'), 'utf8'));
const targets = [
    {
        example: 'math-rect-geometry',
        units: [
            'math.Rect.fromMinMax',
            'math.Rect.intersection',
            'math.Rect.union',
            'math.Rect.xMin',
            'math.Rect.yMin',
            'math.Rect.xMax',
            'math.Rect.yMax',
            'math.Rect.center',
            'math.Rect.origin',
            'math.Rect.size',
            'math.Rect.z',
            'math.Rect.w',
        ],
    },
    {
        example: 'math-size-ops',
        units: ['math.Size.ZERO', 'math.Size.ONE', 'math.Size.x', 'math.Size.y'],
    },
    {
        example: 'layers-enum-ops',
        units: [
            'Layers.BitMask',
            'Layers.makeMaskInclude',
            'Layers.makeMaskExclude',
            'Layers.addLayer',
            'Layers.deleteLayer',
            'Layers.nameToLayer',
            'Layers.layerToName',
        ],
    },
    {
        example: 'scene-runtime-ops',
        units: [
            'Scene.renderScene',
            'Scene.globals',
            'Scene.autoReleaseAssets',
            'Scene.dependAssets',
            'Scene.addComponent',
        ],
    },
    {
        example: 'input-queries',
        units: ['Input.EventType', 'Input.constructor', 'Input.on', 'Input.once', 'Input.off'],
    },
    {
        example: 'material-ops',
        units: [
            'Material.constructor',
            'Material.effectAsset',
            'Material.effectName',
            'Material.technique',
            'Material.passes',
            'Material.hash',
            'Material.parent',
            'Material.owner',
        ],
    },
    {
        example: 'mesh-lifecycle-ops',
        units: [
            'Mesh.struct',
            'Mesh.data',
            'Mesh.hash',
            'Mesh.jointBufferIndices',
            'Mesh.renderingSubMeshes',
            'Mesh.morphRendering',
            'Mesh.destroyRenderingMesh',
            'Mesh.initDefault',
            'Mesh.allowDataAccess',
        ],
    },
    {
        example: 'mesh-lifecycle-ops',
        units: ['ModelRenderer', 'ModelRenderer.constructor', 'ModelRenderer.visibility', 'ModelRenderer.priority'],
    },
    {
        example: 'texture2d-ops',
        units: ['Texture2D.mipmaps', 'Texture2D.image', 'Texture2D.description'],
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
    if (example === 'material-ops' || example === 'mesh-lifecycle-ops') {
        spec.validation = spec.validation || {};
        spec.validation.lifecycle = spec.validation.lifecycle || [];
        if (!spec.validation.lifecycle.includes('resource-released')) {
            spec.validation.lifecycle.push('resource-released');
        }
    }
    fs.writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');
}

console.log(`[wave12-core] ${targets.reduce((sum, target) => sum + target.units.length, 0)} required API units bound`);
