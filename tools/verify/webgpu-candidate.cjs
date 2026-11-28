/* Shared read-only WebGPU candidate identity and source-map checks. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { verifySourceBinding } = require('../build/source-binding.cjs');

function sourceFingerprint(root) {
    const files = [
        ...new Set(
            execFileSync(
                'git',
                [
                    'ls-files',
                    '-c',
                    '-o',
                    '--exclude-standard',
                    '--',
                    'src',
                    'tools/build',
                    'package.json',
                    'tsconfig.json',
                    'vendor/webgpu/manifest.json',
                    'vendor/builtin-source',
                    ...[
                        'webgpu-basic',
                        'gltf-basic',
                        'gltf-skin',
                        'gltf-morph',
                        'ui-components',
                        'sprite-mask-blend',
                        'render-composite',
                        'shared',
                    ].map((name) => 'examples/' + name),
                ],
                { cwd: root, encoding: 'utf8' },
            )
                .trim()
                .split(/\r?\n/),
        ),
    ].sort();
    const hash = crypto.createHash('sha256');
    for (const file of files) {
        const absolute = path.join(root, file);
        if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) {
            let bytes = fs.readFileSync(absolute);
            if (/^examples\/[^/]+\/example\.json$/.test(file)) {
                // Same generated bookkeeping exclusions as api-trace.cjs. Retain all actual spec fields.
                try {
                    const spec = JSON.parse(bytes.toString('utf8'));
                    for (const key of ['promotion', 'promotionEvidence', 'stableReview', 'status']) delete spec[key];
                    bytes = Buffer.from(JSON.stringify(spec));
                } catch {
                    // Malformed JSON remains byte-bound rather than silently disappearing.
                }
            }
            hash.update(file).update(bytes);
        }
    }
    return hash.digest('hex');
}
function checkBuildSources(root, bundleName, artifact = path.join(root, 'build', bundleName)) {
    const bundle = path.join(root, 'build', bundleName);
    const binding = verifySourceBinding(root, bundle);
    if (path.resolve(artifact) !== path.resolve(bundle)) {
        const { stripRuntimeSourceMap } = require('../build/runtime-layout.cjs');
        const source = fs.readFileSync(bundle, 'utf8');
        const packaged = stripRuntimeSourceMap(source);
        if (source === packaged || !fs.readFileSync(artifact).equals(Buffer.from(packaged))) {
            binding.mismatches.push('package-runtime-bytes');
            binding.matches = false;
        }
    }
    return {
        ...binding,
        sha256: crypto
            .createHash('sha256')
            .update(fs.readFileSync(bundle + '.map'))
            .digest('hex'),
    };
}
module.exports = { sourceFingerprint, checkBuildSources };
