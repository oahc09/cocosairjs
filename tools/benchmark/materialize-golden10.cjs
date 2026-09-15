/* V0.6 §8/§44 — 物化 Golden 10 fixtures 与冻结参考实现。
 * 运行：node tools/benchmark/materialize-golden10.cjs
 * 产物：tools/benchmark/fixtures/B0XX/...（Agent 可见起点）
 *      tools/benchmark/references/frozen/B0XX.main.ts（Agent 不可见，SHA-256 台账）
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..', '..');
const DIR = path.join(ROOT, 'tools', 'benchmark');

const transpiled = esbuild.buildSync({
    entryPoints: [path.join(DIR, 'references', 'golden10-assets.ts')],
    bundle: true, format: 'cjs', write: false, external: ['cocosair'],
});
// eslint-disable-next-line no-eval
const mod = { exports: {} };
new Function('module', 'exports', 'require', transpiled.outputFiles[0].text)(mod, mod.exports, require);
const { GOLDEN10, GOLDEN10_MATERIALS, REFERENCES } = mod.exports;

const manifest = { revision: 'golden10-r1', fixtures: {}, references: {} };
for (const bench of GOLDEN10) {
    const fixtureDir = path.join(DIR, 'fixtures', bench.id);
    fs.mkdirSync(path.join(fixtureDir, 'src'), { recursive: true });
    const files = GOLDEN10_MATERIALS[bench.id].fixtureFiles;
    for (const [rel, content] of Object.entries(files)) {
        const abs = path.join(fixtureDir, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content, 'utf8');
    }
    manifest.fixtures[bench.id] = { files: Object.keys(files) };

    if (bench.referenceImplementation) {
        const refDir = path.join(DIR, 'references', 'frozen');
        fs.mkdirSync(refDir, { recursive: true });
        const refAbs = path.join(refDir, bench.referenceImplementation);
        fs.writeFileSync(refAbs, REFERENCES[bench.id] ?? '', 'utf8');
        manifest.references[bench.id] = crypto.createHash('sha256').update(fs.readFileSync(refAbs)).digest('hex');
    }
}
fs.writeFileSync(path.join(DIR, 'references', 'frozen', 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('[golden10] materialized:', Object.keys(manifest.fixtures).length, 'fixtures,', Object.keys(manifest.references).length, 'references');
