/* Reproducible local deployment fixture: only shipping JS, compiled examples and
 * their assets. A plain static server needs no engine source or dev middleware. */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'build', `.tmp-v03-site-${Date.now()}`);
const examples = ['starter', 'hello-cube', 'static-model', 'skinned-animation', 'gltf-viewer', 'shared'];
function copyExample (source, target) {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
        const src = path.join(source, entry.name);
        const dst = path.join(target, entry.name);
        if (entry.isDirectory()) { copyExample(src, dst); continue; }
        if (entry.name.endsWith('.ts')) {
            const result = esbuild.transformSync(fs.readFileSync(src, 'utf8'), { loader: 'ts', format: 'esm', target: 'es2022' });
            fs.writeFileSync(dst.replace(/\.ts$/, '.js'), result.code);
        } else if (entry.name.endsWith('.html')) {
            const html = fs.readFileSync(src, 'utf8').replace(/\/build\/cocosair\.module\.js/g, '../build/cocosair.module.js')
                .replace(/src="\.\/main\.ts"/g, 'src="./main.js"');
            fs.writeFileSync(dst, html);
        } else fs.copyFileSync(src, dst);
    }
}
for (const variant of ['normal', 'minified']) {
    const base = path.join(output, 'nested', 'demo', variant);
    fs.mkdirSync(path.join(base, 'build'), { recursive: true });
    const file = variant === 'normal' ? 'cocosair.module.js' : 'cocosair.module.min.js';
    // Both site variants use the same URL contract, with different actual bytes.
    fs.copyFileSync(path.join(root, 'build', file), path.join(base, 'build', 'cocosair.module.js'));
    fs.copyFileSync(path.join(root, 'build', file + '.map'), path.join(base, 'build', file + '.map'));
    for (const example of examples) copyExample(path.join(root, 'examples', example), path.join(base, example));
    // Decoders are standalone assets (never bundled into the engine module); the static
    // site must ship them so gltf-viewer can load KHR_draco/meshopt/basisu offline.
    copyExample(path.join(root, 'build', 'gltf-decoders'), path.join(base, 'build', 'gltf-decoders'));
    fs.mkdirSync(path.join(base, 'verify'));
    fs.copyFileSync(path.join(__dirname, 'runtime-assets.js'), path.join(base, 'verify', 'runtime-assets.js'));
}
fs.mkdirSync(path.join(root, 'output/playwright'), { recursive: true });
fs.writeFileSync(path.join(root, 'output/playwright/v03-site.json'), JSON.stringify({ root: output }, null, 2));
console.log(output);
