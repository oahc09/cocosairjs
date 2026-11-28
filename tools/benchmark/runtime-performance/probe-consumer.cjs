/* Build directly from an explicit ESM for the S01/S02 profile experiment. */
const fs = require('node:fs');
const path = require('node:path');
const { digest, identity, writeNew } = require('./evidence.cjs');

function run([manifest, source, out, ...rest]) {
    if (!manifest || !source || !out || rest.length)
        throw new Error('Usage: node probe-consumer.cjs <manifest.json> <runtime-esm> <new-out>');
    const declared = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    if (declared.schemaVersion !== 1 || declared.scope !== 'diagnostic')
        throw new Error('A diagnostic startup manifest is required');
    const esbuild = require('esbuild');
    const runtime = path.resolve(source);
    const bundle = esbuild.buildSync({
        stdin: {
            contents: fs.readFileSync(path.join(__dirname, 'entry-air.mjs'), 'utf8'),
            sourcefile: 'entry-air.mjs',
            resolveDir: path.resolve(__dirname, '../../..'),
        },
        alias: { 'cocosair.js': runtime },
        bundle: true,
        minify: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        legalComments: 'inline',
        write: false,
    }).outputFiles[0].contents;
    fs.mkdirSync(out);
    fs.writeFileSync(path.join(out, 'air.mjs'), bundle, { flag: 'wx' });
    writeNew(path.join(out, 'artifacts.json'), {
        manifestSha256: digest(fs.readFileSync(manifest)),
        esbuild: esbuild.version,
        artifacts: {
            air: {
                file: 'air.mjs',
                scope: 'direct ESM consumer; not an installed SDK or compatibility claim',
                runtime: identity(fs.readFileSync(runtime)),
                app: identity(bundle),
            },
        },
    });
}

try {
    run(process.argv.slice(2));
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
