/* Build-layout contract: real tarball, single main entry, old/current TS, clean/upgrade prepack.
 * Writes only temporary consumers, build/npm publish copies and an optional new JSON report.
 * Usage: node tools/verify/build-layout-consumer.cjs --modern-ts=/path/to/tsc [--out=new.json]
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const arg = (name) => process.argv.find((v) => v.startsWith(`--${name}=`))?.slice(name.length + 3);
const modern = arg('modern-ts');
if (!modern || !fs.existsSync(path.resolve(modern))) throw Error('--modern-ts=<real modern tsc> is required');
const out = arg('out') && path.resolve(arg('out'));
if (out && fs.existsSync(out)) throw Error('Refusing to overwrite report: ' + out);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'air-build-layout-'));
const run = (file, args, cwd = root) =>
    execFileSync(file, args, { cwd, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
const checks = [];
const node = (args, cwd) => run(process.execPath, args, cwd);
try {
    // The ignored publication copies are disposable, but preserve any unknown file.
    const npmDir = path.join(root, 'build/npm');
    const bundles = ['cocosair.module.js', 'cocosair.module.min.js'];
    fs.mkdirSync(npmDir, { recursive: true });
    const unknown = fs.readdirSync(npmDir).filter((f) => !bundles.includes(f));
    assert.deepEqual(unknown, [], 'Do not remove unknown publish-directory content');
    for (const file of bundles) fs.rmSync(path.join(npmDir, file), { force: true });
    node(['tools/build/prepare-package.cjs']);
    const clean = bundles.map((f) => fs.readFileSync(path.join(npmDir, f)));
    node(['tools/build/prepare-package.cjs']);
    bundles.forEach((f, i) => assert.ok(clean[i].equals(fs.readFileSync(path.join(npmDir, f))), 'upgrade copy ' + f));
    checks.push('clean-and-upgrade-prepack');
    const packed = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', temp]))[0];
    fs.writeFileSync(path.join(temp, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
    run(
        'npm',
        ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--offline', path.join(temp, packed.filename)],
        temp,
    );
    const installed = path.join(temp, 'node_modules/cocosair.js');
    const manifest = JSON.parse(fs.readFileSync(path.join(installed, 'package.json')));
    const visit = (value) => {
        if (typeof value === 'string') {
            assert.ok(value.startsWith('./'), 'local exports target');
            assert.ok(fs.existsSync(path.join(installed, value)), 'missing exports target ' + value);
        } else for (const child of Object.values(value)) visit(child);
    };
    visit(manifest.exports);
    for (const bundle of bundles) {
        const code = fs.readFileSync(path.join(installed, 'build/npm', bundle), 'utf8');
        assert.ok(!/sourceMappingURL=/.test(code), bundle + ' published without source map URL');
    }
    checks.push('real-installed-exports-and-two-map-free-copies');
    assert.deepEqual(Object.keys(manifest.exports), ['.'], 'only the main package entry');
    const bundled = require('esbuild').buildSync({
        stdin: { contents: "export { createAirApp, createAirHTMLSource, getAirHTMLSourceSupport } from 'cocosair.js';", resolveDir: temp },
        bundle: true, write: false, format: 'esm', platform: 'browser', metafile: true,
    });
    assert.ok(Object.keys(bundled.metafile.inputs).some(file => /cocosair\.module\.js$/.test(file)));
    checks.push('main-entry-bundler-resolution');
    const entries = {
        main: "import { createAirApp, createAirHTMLSource, getAirHTMLSourceSupport } from 'cocosair.js'; import type { AirHTMLSourceOptions, AirHTMLTextureTarget } from 'cocosair.js'; void createAirApp; void createAirHTMLSource; void getAirHTMLSourceSupport; declare const options: AirHTMLSourceOptions; declare const target: AirHTMLTextureTarget; void options; void target; const stream = new DecompressionStream('gzip'); void stream;",
    };
    for (const [name, source] of Object.entries(entries)) {
        const file = path.join(temp, name + '.ts');
        fs.writeFileSync(file, source);
        for (const [label, compiler, module, resolution] of [
            ['ts49-node16', path.join(root, 'node_modules/typescript/bin/tsc'), 'node16', 'node16'],
            ['modern-node16', path.resolve(modern), 'node16', 'node16'],
            ['modern-bundler', path.resolve(modern), 'esnext', 'bundler'],
        ]) {
            const result = node(
                [
                    compiler,
                    '--noEmit',
                    '--strict',
                    '--skipLibCheck',
                    '--target',
                    'es2020',
                    '--module',
                    module,
                    '--moduleResolution',
                    resolution,
                    '--lib',
                    'es2020,dom',
                    '--listFiles',
                    file,
                ],
                temp,
            );
            if (label.startsWith('modern'))
                assert.ok(!/cocosair\.legacy\.d\.ts|bootstrap\.legacy\.d\.ts/.test(result), 'modern excludes legacy');
            if (label === 'ts49-node16' && name !== 'html') assert.match(result, /cocosair\.legacy\.d\.ts/);
            checks.push(`${name}-${label}`);
        }
    }
    const report = { ok: true, checks, modernVersion: node([path.resolve(modern), '--version']).trim() };
    if (out) {
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
    }
    console.log(JSON.stringify(report, null, 2));
} finally {
    fs.rmSync(temp, { recursive: true, force: true });
}
