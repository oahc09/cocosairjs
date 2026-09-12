/* Static verification server, without the development server's WebGL instrumentation/reloader. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const port = Number(process.env.GLTF_PORT || 7462);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.md': 'text/plain; charset=utf-8' };
http.createServer((request, response) => {
    try {
        const url = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        const base = url.startsWith('/build/') ? root : path.join(root, 'examples');
        const file = path.resolve(base, `.${url}${url.endsWith('/') ? 'index.html' : ''}`);
        if (!file.startsWith(`${base}${path.sep}`) || (base === root && !file.startsWith(path.join(root, 'build') + path.sep))) {
            response.writeHead(403); response.end(); return;
        }
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end('Not found'); return; }
        response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        fs.createReadStream(file).pipe(response);
    } catch { response.writeHead(400); response.end(); }
}).listen(port, '127.0.0.1', () => console.log(`glTF viewer: http://127.0.0.1:${port}/gltf-viewer/`));
