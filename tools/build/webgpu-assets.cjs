/* Frozen Cocos shader translators. --check is read-only; builds copy verified bytes only. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const MagicString = require('magic-string');

function verify(root) {
    const directory = path.join(root, 'vendor/webgpu');
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
    const unexpected = fs.readdirSync(directory).filter((name) => name !== 'manifest.json' && !manifest.files[name]);
    if (unexpected.length) throw Error(`Unregistered WebGPU vendor files: ${unexpected.join(', ')}`);
    for (const [name, expected] of Object.entries(manifest.files)) {
        const bytes = fs.readFileSync(path.join(directory, name));
        if (crypto.createHash('sha256').update(bytes).digest('hex') !== expected.sha256) {
            throw Error(`WebGPU asset hash mismatch: ${name}`);
        }
    }
    return manifest;
}

function copy(root, output) {
    const manifest = verify(root);
    const destination = path.join(output, 'webgpu');
    fs.mkdirSync(destination, { recursive: true });
    const unexpected = fs.readdirSync(destination).filter((name) => name !== 'manifest.json' && !manifest.files[name]);
    if (unexpected.length) throw Error(`Unexpected WebGPU deployment files: ${unexpected.join(', ')}`);
    for (const name of [...Object.keys(manifest.files), 'manifest.json']) {
        fs.copyFileSync(path.join(root, 'vendor/webgpu', name), path.join(destination, name));
    }
}

function webgpuAssetsPlugin(root) {
    const target = path.resolve(root, 'src/cocos/gfx/webgpu/instantiated.ts');
    return {
        name: 'air-webgpu-assets',
        transform(code, id) {
            if (path.resolve(id) !== target) return null;
            const marker = "'__AIR_WEBGPU_ASSET_BASE__'";
            const offset = code.indexOf(marker);
            if (offset < 0) throw Error('Missing WebGPU asset URL marker');
            const source = new MagicString(code);
            source.overwrite(offset, offset + marker.length, "new URL('./webgpu/', import.meta.url).href");
            return { code: source.toString(), map: source.generateMap({ hires: true }) };
        },
    };
}

module.exports = { verify, copy, webgpuAssetsPlugin };
if (require.main === module) {
    if (process.argv.length !== 3 || process.argv[2] !== '--check')
        throw Error('Usage: node tools/build/webgpu-assets.cjs --check');
    verify(path.resolve(__dirname, '../..'));
    console.log('WebGPU translator assets: hashes verified');
}
