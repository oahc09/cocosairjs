const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const root = '/workspace/cocosairjs';
const requireProject = createRequire(root + '/package.json');
const esbuild = requireProject('esbuild');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
(async () => {
    const file = 'examples/box3d-compound-bowling/src/main.ts';
    const source = fs.readFileSync(root + '/' + file);
    const options = { loader: 'ts', format: 'esm', target: 'es2022', sourcefile: file };
    const result = await esbuild.transform(source.toString(), options);
    await esbuild.transform(result.code, { loader: 'js', format: 'esm', target: 'es2022' });
    const bin = root + '/node_modules/@esbuild/linux-x64/bin/esbuild';
    const version = spawnSync(bin, ['--version'], { encoding: 'utf8' });
    if (version.status !== 0) throw Error('binary version failed');
    const response = await fetch('http://127.0.0.1:7473/box3d-compound-bowling/src/main.ts');
    const http = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(__dirname + '/main-http-response.js', http);
    const summary = {
        at: new Date().toISOString(), status: 'PASS_TRANSFORM_AND_HTTP_ONLY',
        esbuild: esbuild.version, sourceSha256: hash(source),
        transform: { bytes: Buffer.byteLength(result.code), sha256: hash(result.code), warnings: result.warnings },
        binary: { bytes: fs.statSync(bin).size, sha256: hash(fs.readFileSync(bin)), version: version.stdout.trim() },
        http: { url: response.url, status: response.status, contentType: response.headers.get('content-type'), bytes: http.length, sha256: hash(http), matchesDirectTransform: http.toString() === result.code },
    };
    fs.writeFileSync(__dirname + '/transform.json', JSON.stringify(summary, null, 2) + '\n');
    if (response.status !== 200 || http.toString() !== result.code) throw Error('HTTP mismatch');
    console.log(JSON.stringify(summary));
})().catch((e) => { console.error(e); process.exitCode = 1; });
