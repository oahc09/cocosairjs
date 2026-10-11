// Isolated, diagnostic-only causal controls. Never rewrites source or the shared SDK.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const args = process.argv.slice(2);
assert(args.length === 1 && /^--prefix=[a-zA-Z0-9_-]+$/.test(args[0]), '--prefix=<new-prefix> required');
const prefix = args[0].slice(9);
const sourceFile = 'build/cocosair.module.js';
const source = fs.readFileSync(path.join(root, sourceFile), 'utf8');
const base = source.replace(/^\/\/# sourceMappingURL=.*$/gm, '');
const directory = 'output/webgl2-gfx-contracts/variants';
const controls = [
    {
        name: 'half-float-capability',
        cases: 'WGL-01',
        mechanisms: [
            {
                from: 'const compressedFeature = FormatFeatureBit.SAMPLED_TEXTURE | FormatFeatureBit.LINEAR_FILTER;',
                to: 'formatFeatures[Format.RGBA16F] &= ~FormatFeatureBit.LINEAR_FILTER;\n    const compressedFeature = FormatFeatureBit.SAMPLED_TEXTURE | FormatFeatureBit.LINEAR_FILTER;',
            },
        ],
    },
    {
        name: 'comparison-mode',
        cases: 'WGL-02',
        mechanisms: [
            {
                from: 'glSamplerParameteri(glSampler, WebGLConstants.TEXTURE_COMPARE_MODE, this.cmpFunc === ComparisonFunc.ALWAYS ? WebGLConstants.NONE : WebGLConstants.COMPARE_REF_TO_TEXTURE);',
                to: 'glSamplerParameteri(glSampler, WebGLConstants.TEXTURE_COMPARE_MODE, WebGLConstants.NONE);',
            },
        ],
    },
    {
        name: 'anisotropy-parameter',
        cases: 'WGL-03',
        mechanisms: [
            {
                from: 'glSamplerParameterf(glSampler, extension.TEXTURE_MAX_ANISOTROPY_EXT, Math.max(1, this.maxAnisotropy));',
                to: 'glSamplerParameterf(glSampler, extension.TEXTURE_MAX_ANISOTROPY_EXT, 1);',
            },
        ],
    },
    {
        name: 'bias-enable',
        cases: 'WGL-04',
        mechanisms: [
            {
                from: 'if (rs.depthBiasEnabled) gl.enable(WebGLConstants.POLYGON_OFFSET_FILL);',
                to: 'if (rs.depthBiasEnabled) gl.disable(WebGLConstants.POLYGON_OFFSET_FILL);',
            },
        ],
    },
    {
        name: 'bias-static-order',
        cases: 'WGL-04',
        mechanisms: [
            {
                from: 'gl.polygonOffset(rs.depthBiasSlop, rs.depthBias);',
                to: 'gl.polygonOffset(rs.depthBias, rs.depthBiasSlop);',
            },
        ],
    },
    {
        name: 'bias-dynamic-order',
        cases: 'WGL-04',
        mechanisms: [
            {
                from: 'gl.polygonOffset(dynamicStates.depthBiasSlope, dynamicStates.depthBiasConstant);',
                to: 'gl.polygonOffset(dynamicStates.depthBiasConstant, dynamicStates.depthBiasSlope);',
            },
        ],
    },
    {
        name: 'integer-external-format',
        cases: 'WGL-05',
        mechanisms: [
            {
                from: 'return [0, WebGLConstants.RED_INTEGER, WebGLConstants.RG_INTEGER, WebGLConstants.RGB_INTEGER, WebGLConstants.RGBA_INTEGER][info.count];',
                to: 'return [0, WebGLConstants.RED, WebGLConstants.RG, WebGLConstants.RGB, WebGLConstants.RGBA][info.count];',
            },
        ],
    },
    {
        name: 'integer-clear',
        cases: 'WGL-06',
        mechanisms: [
            {
                from: 'gl.clearBufferiv(WebGLConstants.COLOR, j, _i32v4)',
                to: 'gl.clearBufferfv(WebGLConstants.COLOR, j, new Float32Array(_i32v4))',
            },
            {
                from: 'gl.clearBufferuiv(WebGLConstants.COLOR, j, _u32v4)',
                to: 'gl.clearBufferfv(WebGLConstants.COLOR, j, new Float32Array(_u32v4))',
            },
        ],
    },
    {
        name: 'integer-attribute',
        cases: 'WGL-07',
        mechanisms: [
            {
                from: 'gl.vertexAttribIPointer(location, attrib.count, attrib.glType, attrib.stride, offset);',
                to: 'gl.vertexAttribPointer(location, attrib.count, attrib.glType, false, attrib.stride, offset);',
            },
        ],
    },
    {
        name: 'attachment-layer',
        cases: 'WGL-08',
        mechanisms: [
            {
                from: 'gl.framebufferTextureLayer(target, attachment, tex.glTexture, level, layer);',
                to: 'gl.framebufferTextureLayer(target, attachment, tex.glTexture, level, 0);',
            },
        ],
    },
    {
        name: 'readback-offset',
        cases: 'WGL-09',
        mechanisms: [
            {
                from: 'plan.region.buffOffset + layer * plan.layerBytes + row * plan.rowBytes',
                to: '0 + layer * plan.layerBytes + row * plan.rowBytes',
            },
        ],
    },
];
const generated = [];
for (const control of [{ name: 'base', cases: 'all', mechanisms: [] }, ...controls]) {
    let bundle = base;
    const replacements = [];
    for (const mechanism of control.mechanisms) {
        const count = bundle.split(mechanism.from).length - 1;
        assert.equal(count, 1, `${control.name}: expected exactly one matching mechanism, got ${count}`);
        bundle = bundle.replace(mechanism.from, mechanism.to);
        replacements.push({ ...mechanism, matched: count });
    }
    const file = `${directory}/${prefix}-${control.name}.js`;
    generated.push({ name: control.name, cases: control.cases, file, sha256: hash(bundle), replacements, bundle });
}
// Complete all count checks and collision checks before any writes.
const manifestFile = `${directory}/${prefix}-manifest.json`;
for (const file of [...generated.map((v) => v.file), manifestFile])
    assert(!fs.existsSync(path.join(root, file)), `Refusing to overwrite ${file}`);
fs.mkdirSync(path.join(root, directory), { recursive: true });
for (const item of generated) fs.writeFileSync(path.join(root, item.file), item.bundle, { flag: 'wx' });
const manifest = {
    schemaVersion: 'webgl2-gfx-controls/1',
    createdAt: new Date().toISOString(),
    sourceFile,
    sourceSha256: hash(source),
    baseControlSha256: hash(base),
    generator: { file: 'tools/verify/webgl2-gfx-controls.cjs', sha256: hash(fs.readFileSync(__filename)) },
    commonTransformation: 'Remove sourceMappingURL because diagnostic copies have no adjacent source map',
    scope: 'One mechanism per isolated diagnostic SDK; not production bundles or source patches',
    variants: generated.map(({ bundle, ...item }) => item),
};
fs.writeFileSync(path.join(root, manifestFile), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ manifest: manifestFile, sourceSha256: manifest.sourceSha256, count: generated.length }));
