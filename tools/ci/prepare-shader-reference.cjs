const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const reference = path.join(root, 'output/shaders-absorption/reference');
const commit = 'dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a';
const repository = 'https://github.com/shader-effects-inc/shaders';
const actual = execFileSync('git', ['-C', reference, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (actual !== commit) throw new Error(`Shader reference must be pinned to ${commit}; found ${actual}`);
if (!fs.existsSync(path.join(reference, 'LICENSE'))) throw new Error('Pinned reference license is missing');

// These legacy names are inputs of the existing collectors. Reconstruct them from
// actual pinned Git bytes, never synthetic shader bodies or fabricated browser evidence.
for (const [source, name] of [
    ['packages/core/src/gpu/kit/index.ts', 'lead-w2-e03-upstream-kit-index'],
    ['packages/core/src/gpu/kit/materialParts.ts', 'lead-w2-e03-upstream-materialParts'],
    ['packages/core/src/gpu/kit/effects/bevel.ts', 'worker-w3-e07-upstream-bevel'],
]) {
    const bytes = fs.readFileSync(path.join(reference, source));
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const receipt = Buffer.from(
        JSON.stringify(
            { repository, commit, source, sha256, bytes: bytes.length, method: 'PINNED_GIT_CHECKOUT' },
            null,
            2,
        ) + '\n',
    );
    const stem = name.replace(/-(?:index|materialParts)$/, '');
    const receiptName = name.endsWith('-index') ? stem + '-fetch.json' : name + '-fetch.json';
    for (const [file, content] of [
        [name + '.ts', bytes],
        [receiptName, receipt],
    ]) {
        const target = path.join(root, 'output/shaders-absorption', file);
        if (fs.existsSync(target) && !fs.readFileSync(target).equals(content)) {
            throw new Error(`Existing reference input differs; preserve it for review: ${target}`);
        }
        if (!fs.existsSync(target)) fs.writeFileSync(target, content);
    }
}
const materialx = path.join(root, 'output/shaders-absorption/materialx-source');
const materialxCommit = '7b64921ef1d42f2d57871e9d2c43dc11f041f26b';
if (execFileSync('git', ['-C', materialx, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== materialxCommit) {
    throw new Error('MaterialX reference commit differs from the recorded license review');
}
const ancestorRecords = JSON.parse(fs.readFileSync(path.join(root, 'docs/effects/upstream-reference.json'), 'utf8'))
    .ancestorLicenseReview.sources;
for (const source of ['libraries/stdlib/genglsl/lib/mx_noise.glsl', 'LICENSE']) {
    const record = ancestorRecords.find((entry) => entry.url.endsWith('/' + materialxCommit + '/' + source));
    if (!record) throw new Error(`MaterialX source is not registered: ${source}`);
    const bytes = fs.readFileSync(path.join(materialx, source));
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== record.sha256 || bytes.length !== record.bytes) {
        throw new Error(`MaterialX source/license differs from the reviewed bytes: ${source}`);
    }
    const target = path.join(root, record.localCache);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target) && !fs.readFileSync(target).equals(bytes))
        throw new Error(`Preserve differing ancestor cache: ${target}`);
    if (!fs.existsSync(target)) fs.writeFileSync(target, bytes);
}
console.log(`[ci-reference] pinned shader + MaterialX sources, licenses and deterministic fetch receipts ready`);
