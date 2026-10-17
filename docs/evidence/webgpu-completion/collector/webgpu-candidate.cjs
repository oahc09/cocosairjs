/* Shared read-only WebGPU candidate identity and source-map checks. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

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
        if (fs.existsSync(absolute) && fs.statSync(absolute).isFile())
            hash.update(file).update(fs.readFileSync(absolute));
    }
    return hash.digest('hex');
}
function checkBuildSources(root, bundleName) {
    const filename = path.join(root, 'build', bundleName + '.map');
    const map = JSON.parse(fs.readFileSync(filename, 'utf8'));
    let compared = 0;
    const mismatches = [];
    map.sources.forEach((source, index) => {
        const file = path.resolve(root, 'build', source);
        if (!/\.[jt]s$/.test(source) || !fs.existsSync(file) || !map.sourcesContent?.[index]) return;
        compared++;
        if (fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== map.sourcesContent[index].replace(/\r\n/g, '\n'))
            mismatches.push(source);
    });
    return {
        compared,
        mismatches,
        sha256: crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex'),
    };
}
module.exports = { sourceFingerprint, checkBuildSources };
