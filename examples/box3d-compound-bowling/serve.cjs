/** Isolated read-only example server. No build, watchers, artifact copying or engine writes. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createRuntimeRoute } = require('./runtime-route.cjs');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '../..');
const runtimeRoute = createRuntimeRoute({ runtime: process.env.BOX3D_RUNTIME });
const mounts = { '/': __dirname };
const types = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.map': 'application/json',
};
http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        if (runtimeRoute(decodeURIComponent(url.pathname), res)) return;
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
}).listen(Number(process.env.PORT || 7472), '127.0.0.1', () =>
    console.log(`EX02 compound bowling candidate: http://127.0.0.1:${process.env.PORT || 7472}/`),
);
