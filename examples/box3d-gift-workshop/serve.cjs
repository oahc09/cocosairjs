/** Isolated read-only example server. No build, watchers, artifact copying or engine writes. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '../..');
const runtime = process.env.BOX3D_RUNTIME;
if (!runtime || !path.isAbsolute(runtime))
    throw new Error('Set BOX3D_RUNTIME to the existing qualified runtime directory.');
const runtimeRoot = fs.realpathSync(runtime);
const mounts = {
    '/runtime/': runtimeRoot,
    '/contracts/': path.join(root, 'docs/physics/box3d/contracts/gift-workshop'),
    '/': __dirname,
};
const types = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.map': 'application/json',
};
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/identity.json') {
            const files = [
                'config.json',
                'layouts.json',
                'scenarios.json',
                'input-protocol.json',
                'abnormal-fixtures.json',
            ];
            const identity = {
                runtimeSha256: hash(path.join(runtimeRoot, 'cocosair.module.js')),
                runtimeAssets: Object.fromEntries(
                    ['manifest.json', 'box3d-st.mjs', 'box3d-st.wasm', 'facade.mjs', 'distribution-receipt.json'].map(
                        (name) => {
                            const file = path.join(runtimeRoot, 'physics/box3d/st', name);
                            return [name, { bytes: fs.statSync(file).size, sha256: hash(file) }];
                        },
                    ),
                ),
                contracts: Object.fromEntries(files.map((f) => [f, hash(path.join(mounts['/contracts/'], f))])),
                source: Object.fromEntries(
                    [
                        ...fs
                            .readdirSync(path.join(__dirname, 'src'))
                            .filter((f) => /\.(mjs|ts)$/.test(f))
                            .sort()
                            .map((f) => `src/${f}`),
                        'index.html',
                        'style.css',
                        'serve.cjs',
                        'mechanical-selection.json',
                        'contact-candidate-lock.json',
                        'transport-candidate-lock.json',
                    ].map((f) => [f, hash(path.join(__dirname, f))]),
                ),
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(identity));
        }
        const prefix = Object.keys(mounts).find((p) => url.pathname.startsWith(p));
        const base = fs.realpathSync(mounts[prefix]);
        const requested = path.resolve(
            base,
            '.' + '/' + decodeURIComponent(url.pathname.slice(prefix.length) || 'index.html'),
        );
        const file = fs.realpathSync(requested);
        if (!file.startsWith(base + path.sep)) throw new Error('Outside mount');
        let content = fs.readFileSync(file),
            type = types[path.extname(file)] || 'application/octet-stream';
        if (file.endsWith('.ts')) {
            content = (
                await esbuild.transform(content.toString(), {
                    loader: 'ts',
                    format: 'esm',
                    target: 'es2022',
                    sourcefile: path.relative(root, file),
                })
            ).code;
            type = 'text/javascript';
        }
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
        res.end(content);
    } catch (error) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(String(error.message));
    }
}).listen(Number(process.env.PORT || 7469), '127.0.0.1', () =>
    console.log(`EX09 local slice: http://127.0.0.1:${process.env.PORT || 7469}/`),
);
