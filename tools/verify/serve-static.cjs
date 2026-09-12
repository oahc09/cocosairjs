/* Generic local static file server. No injection, source lookup or compilation. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = fs.realpathSync(process.argv[2]);
const port = Number(process.argv[3] || 7464);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
    '.map': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary' };
http.createServer((req, res) => {
    try {
        let url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
        if (url.endsWith('/')) url += 'index.html';
        const file = path.resolve(root, '.' + url);
        const relative = path.relative(root, file);
        if (relative.startsWith('..') || path.isAbsolute(relative)) { res.writeHead(403); res.end(); return; }
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
        const actual = fs.realpathSync(file);
        if (path.relative(root, actual).startsWith('..')) { res.writeHead(403); res.end(); return; }
        res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        fs.createReadStream(file).pipe(res);
    } catch { res.writeHead(400); res.end(); }
}).listen(port, '127.0.0.1', () => console.log(`Serving ${root} at http://127.0.0.1:${port}`));
