/* Prepare npm runtime copies without source maps.
 * Local build/cocosair.module*.js files keep their maps for development and browser evidence.
 * npm's prepack hook copies those bundles and strips only the trailing sourceMappingURL.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const buildDir = path.join(root, 'build');
const packageDir = path.join(buildDir, 'npm');
const { runtimeBundles: bundles, removeRetiredEntries } = require('./runtime-layout.cjs');
removeRetiredEntries(buildDir);
const sourceMapComment = /(?:\r?\n)?\/\/# sourceMappingURL=[^\r\n]*(?:\r?\n)?$/;

async function preparePackage() {
    for (const bundle of bundles) {
        const source = path.join(buildDir, bundle);
        const map = `${source}.map`;
        if (!fs.existsSync(source)) {
            throw new Error(`Missing ${path.relative(root, source)}; run npm run build:all before packaging.`);
        }
        if (!fs.existsSync(map)) {
            throw new Error(`Missing ${path.relative(root, map)}; the development build must retain its source map.`);
        }
        const code = fs.readFileSync(source, 'utf8');
        const releaseCode = code.replace(sourceMapComment, '\n');
        if (releaseCode === code || /\/\/# sourceMappingURL=/.test(releaseCode)) {
            throw new Error(`${path.relative(root, source)} has no removable trailing sourceMappingURL.`);
        }
        fs.mkdirSync(packageDir, { recursive: true });
        fs.writeFileSync(path.join(packageDir, bundle), releaseCode);
        console.error(
            `[package] ${path.relative(root, bundle)} -> ${path.relative(root, packageDir)}/${bundle} (source map omitted)`,
        );
    }

    await require('./math-module.cjs').buildMathModule(root, buildDir);
    fs.copyFileSync(path.join(buildDir, 'cocosair.math.js'), path.join(packageDir, 'cocosair.math.js'));

    const unexpected = fs
        .readdirSync(packageDir)
        .filter((name) => !bundles.includes(name) && !['webgpu', 'box2d3', 'cocosair.math.js'].includes(name));
    if (unexpected.length) {
        throw new Error(`Unexpected files in ${path.relative(root, packageDir)}: ${unexpected.join(', ')}`);
    }

    require('./webgpu-assets.cjs').copy(root, packageDir);
    require('./box2d3.cjs').copy(packageDir);
}
preparePackage().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
