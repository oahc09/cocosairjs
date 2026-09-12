/* T1 回归：静态服务器，按变体（normal/minified）服务 examples 与对应构建产物。
 * 路由：
 *   /nested/demo/{variant}/{example}/**  → examples/{example}/**
 *   /nested/demo/{variant}/build/cocosair.module.js → build/cocosair.module(.min).js
 *   /build/cocosair.module.js → 依 Referer 中的 /minified/ 选择产物 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 7465;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.ts': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg' };

function serve (res, file, label) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('not found: ' + label); return; }
    let data;
    if (file.endsWith('.ts')) {
        // Same on-the-fly transform as the dev server (starter/main.ts is a module script).
        const js = esbuild.transformSync(fs.readFileSync(file, 'utf8'),
            { loader: 'ts', format: 'esm', target: 'es2022', sourcefile: file }).code;
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
        res.end(js);
        return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'build') {
        const min = (req.headers.referer || '').includes('/minified/');
        serve(res, path.join(ROOT, 'build', min ? 'cocosair.module.min.js' : 'cocosair.module.js'), req.url);
        return;
    }
    if (parts[0] === 'nested' && parts[1] === 'demo') {
        const variant = parts[2];
        if (parts[3] === 'build' && parts[4] === 'cocosair.module.js') {
            serve(res, path.join(ROOT, 'build', variant === 'minified' ? 'cocosair.module.min.js' : 'cocosair.module.js'), req.url);
            return;
        }
        let file = path.join(ROOT, 'examples', ...parts.slice(3));
        if (fs.existsSync(file) && fs.statSync(file).isDirectory()) { file = path.join(file, 'index.html'); }
        serve(res, file, req.url);
        return;
    }
    res.writeHead(404); res.end('not found');
}).listen(PORT, '127.0.0.1', () => console.log(`[v05-review] serving on http://127.0.0.1:${PORT}/`));
