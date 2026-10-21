/* Build/check the optional pinned Box2D backend. Writes only the selected build directory,
 * vendor/box2d/manifest.json (--record) and build/box2d3/ (--build). No SDK auto-install. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '../..');
const vendor = path.join(root, 'vendor/box2d');
const digest = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function walk(directory) {
    return fs
        .readdirSync(directory, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name, 'en'))
        .flatMap((entry) => {
            const file = path.join(directory, entry.name);
            return entry.isDirectory() ? walk(file) : [file];
        });
}
function sourceFiles() {
    return walk(vendor).filter(
        (file) => !file.endsWith('manifest.json') && !file.includes(`${path.sep}runtime${path.sep}`),
    );
}
function record() {
    const files = Object.fromEntries(
        sourceFiles().map((file) => [path.relative(vendor, file).replaceAll('\\', '/'), digest(file)]),
    );
    const samples = [];
    for (const file of walk(path.join(vendor, 'source/samples')).filter((file) => /sample_.*\.cpp$/.test(file))) {
        const source = fs.readFileSync(file, 'utf8');
        for (const match of source.matchAll(
            /Register(Sample(?:WithCapacity)?|Replay)\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"/g,
        )) {
            samples.push({
                category: match[2],
                name: match[3],
                file: path.relative(vendor, file).replaceAll('\\', '/'),
                line: source.slice(0, match.index).split('\n').length,
                registration: match[1],
            });
        }
    }
    const manifest = {
        schema: 1,
        version: '3.2.0',
        commit: '178495ba35695aefe9c321e569d2277f06db3b90',
        source: 'https://github.com/erincatto/box2d/tree/v3.2.0',
        emscripten: '4.0.21',
        precision: 'float',
        threading: 'single',
        simd: false,
        dependencies: { imgui: 'v1.92.7', implot: 'v0.17' },
        files,
        samples,
    };
    fs.writeFileSync(path.join(vendor, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    return manifest;
}
function check() {
    const manifest = JSON.parse(fs.readFileSync(path.join(vendor, 'manifest.json')));
    const actual = sourceFiles()
        .map((file) => path.relative(vendor, file).replaceAll('\\', '/'))
        .sort();
    if (JSON.stringify(actual) !== JSON.stringify(Object.keys(manifest.files).sort()))
        throw Error('Box2D source inventory drift');
    for (const [file, hash] of Object.entries(manifest.files))
        if (digest(path.join(vendor, file)) !== hash) throw Error(`Box2D source drift: ${file}`);
    return manifest;
}
function copy(output) {
    check();
    const from = path.join(vendor, 'runtime');
    const receipt = JSON.parse(fs.readFileSync(path.join(from, 'receipt.json')));
    if (receipt.sourceManifest !== digest(path.join(vendor, 'manifest.json')))
        throw Error('Box2D source receipt is stale');
    for (const [file, hash] of Object.entries(receipt.inputs))
        if (digest(path.join(root, file)) !== hash) throw Error(`Box2D bridge receipt is stale: ${file}`);
    for (const [name, hash] of Object.entries(receipt.files))
        if (digest(path.join(from, name)) !== hash) throw Error(`Box2D binary drift: ${name}`);
    const to = path.join(output, 'box2d3');
    fs.mkdirSync(to, { recursive: true });
    for (const name of [...Object.keys(receipt.files), 'receipt.json'])
        fs.copyFileSync(path.join(from, name), path.join(to, name));
}
function box2dAssetsPlugin() {
    const MagicString = require('magic-string');
    return {
        name: 'air-box2d-assets',
        transform(code, id) {
            if (path.resolve(id) !== path.join(root, 'src/air/physics-2d/box2d3.ts')) return null;
            const token = "'__AIR_BOX2D_ASSET_BASE__'",
                index = code.indexOf(token);
            if (index < 0) throw Error('Missing Box2D asset marker');
            const s = new MagicString(code);
            s.overwrite(index, index + token.length, "new URL('./box2d3/', import.meta.url).href");
            return { code: s.toString(), map: s.generateMap({ hires: true }) };
        },
    };
}
function build() {
    const manifest = check();
    const frozenInputs = Object.fromEntries(
        walk(path.join(__dirname, 'box2d')).map((file) => [
            path.relative(root, file).replaceAll('\\', '/'),
            digest(file),
        ]),
    );
    const sdk = path.resolve(process.env.BOX2D_EMSDK || path.join(root, 'output/box2d/toolchain/emsdk'));
    const windows = process.platform === 'win32';
    const env = { ...process.env, EM_CONFIG: path.join(sdk, '.emscripten') };
    if (windows) env.EMSDK_PYTHON = path.join(sdk, 'python/3.13.3_64bit/python.exe');
    const directory = path.resolve(process.env.BOX2D_BUILD_DIR || path.join(root, 'output/box2d/wasm'));
    const ninja = process.env.NINJA || (windows ? path.join(root, 'output/box2d/toolchain/ninja/ninja.exe') : 'ninja');
    function run(command, args) {
        const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
        if (result.error) throw result.error;
        if (result.status) throw Error(`${command} failed: ${result.status}`);
    }
    run('cmake', [
        '-S',
        'tools/build/box2d',
        '-B',
        directory,
        '-G',
        'Ninja',
        `-DCMAKE_MAKE_PROGRAM=${ninja}`,
        `-DCMAKE_TOOLCHAIN_FILE=${sdk}/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake`,
        '-DCMAKE_BUILD_TYPE=Release',
    ]);
    run('cmake', ['--build', directory, '--target', 'air-box2d', 'air-box2d-samples', '-j', '8']);
    const runtime = path.join(vendor, 'runtime');
    fs.mkdirSync(runtime, { recursive: true });
    const files = {};
    for (const name of ['air-box2d.mjs', 'air-box2d.wasm']) {
        fs.copyFileSync(path.join(directory, name), path.join(runtime, name));
        files[name] = digest(path.join(runtime, name));
    }
    fs.copyFileSync(path.join(vendor, 'source/LICENSE'), path.join(runtime, 'LICENSE.Box2D.txt'));
    files['LICENSE.Box2D.txt'] = digest(path.join(runtime, 'LICENSE.Box2D.txt'));
    const inputs = Object.fromEntries(
        walk(path.join(__dirname, 'box2d')).map((file) => [
            path.relative(root, file).replaceAll('\\', '/'),
            digest(file),
        ]),
    );
    if (JSON.stringify(inputs) !== JSON.stringify(frozenInputs))
        throw Error('Box2D bridge inputs changed during compilation');
    fs.writeFileSync(
        path.join(runtime, 'receipt.json'),
        JSON.stringify(
            {
                version: manifest.version,
                emscripten: manifest.emscripten,
                sourceManifest: digest(path.join(vendor, 'manifest.json')),
                inputs,
                files,
            },
            null,
            2,
        ) + '\n',
    );
    copy(path.join(root, 'build'));
    const samples = path.join(root, 'build/box2d3-samples');
    fs.mkdirSync(samples, { recursive: true });
    for (const name of ['air-box2d-samples.mjs', 'air-box2d-samples.wasm'])
        fs.copyFileSync(path.join(directory, name), path.join(samples, name));
    for (const [source, name] of [
        ['source/LICENSE', 'LICENSE.Box2D.txt'],
        ['imgui/LICENSE.txt', 'LICENSE.ImGui.txt'],
        ['implot/LICENSE', 'LICENSE.ImPlot.txt'],
    ])
        fs.copyFileSync(path.join(vendor, source), path.join(samples, name));
}
module.exports = { check, copy, box2dAssetsPlugin };
if (require.main === module) {
    const command = process.argv[2];
    if (command === '--record') console.log(`Box2D recorded ${record().samples.length} official samples`);
    else if (command === '--check') console.log(`Box2D sources verified: ${check().version}`);
    else if (command === '--build') build();
    else throw Error('Usage: node tools/build/box2d3.cjs --record|--check|--build');
}
