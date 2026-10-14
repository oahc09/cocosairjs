/* CPU-only preparation for startup-browser-supervisor.cjs.
 * --out=<new-directory> creates an installed real tarball, real esbuild split consumer,
 * and a labelled five-entry Gallery subset. Does not rebuild runtime JS or launch a browser.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const value = process.argv.find((arg) => arg.startsWith('--out='))?.slice(6);
if (!value) throw Error('--out=<new-directory> required');
const out = path.resolve(root, value);
if (fs.existsSync(out)) throw Error('Refusing to overwrite existing fixtures');
fs.mkdirSync(out, { recursive: true });
const run = (command, args, cwd = root, env = process.env) =>
    cp.execFileSync(command, args, { cwd, env, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
const tarball = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', out]))[0].filename;
const installed = path.join(out, 'installed');
fs.mkdirSync(installed);
fs.writeFileSync(path.join(installed, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
run('npm', ['install', '--ignore-scripts', '--offline', '--no-audit', '--no-fund', path.join(out, tarball)], installed);
const built = require('esbuild').buildSync({
    stdin: {
        contents:
            "export * from 'cocosair.js/bootstrap'; export function loadRuntime() { return import('cocosair.js'); }",
        resolveDir: installed,
        sourcefile: 'entry.js',
    },
    bundle: true,
    format: 'esm',
    splitting: true,
    outdir: path.join(out, 'bundled'),
    platform: 'browser',
    target: 'es2020',
    metafile: true,
});
fs.writeFileSync(path.join(out, 'bundled-metafile.json'), JSON.stringify(built.metafile, null, 2));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'air-startup-gallery-'));
try {
    run(process.execPath, ['tools/verify/gallery-artifact.cjs', 'build'], root, {
        ...process.env,
        COCOSAIR_GALLERY_EXAMPLES:
            'starter,dom-overlay-texture,graphics-svg-paints,html-texture-experimental,sprite-mask-blend',
        COCOSAIR_GALLERY_ARTIFACT: path.join(temporary, 'artifact'),
    });
    fs.cpSync(path.join(temporary, 'artifact'), path.join(out, 'gallery'), { recursive: true });
} finally {
    fs.rmSync(temporary, { recursive: true, force: true });
}
for (const name of ['cocosair.module.js', 'bootstrap.js', 'html-source.js']) {
    if (!fs.readFileSync(path.join(root, 'build', name)).equals(fs.readFileSync(path.join(out, 'gallery', name))))
        throw Error('Gallery byte drift: ' + name);
}
const report = {
    ok: true,
    tarball,
    tarballSha256: crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(out, tarball)))
        .digest('hex'),
    gallerySubset: true,
    galleryExamples: 5,
    startedFromCommit: run('git', ['rev-parse', 'HEAD']).trim(),
    sourceStatus: run('git', ['status', '--short']).trim(),
};
fs.writeFileSync(path.join(out, 'fixtures.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
