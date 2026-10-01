/* Browser probe host: node tools/verify/label-shadow-server.cjs [bundle-path] [port]. */
const fs = require('fs');
const path = require('path');
const http = require('http');
const root = path.resolve(__dirname, '../..');
const probe = path.join(root, 'tools/debug/probes/label-shadow-probe');
const bundle = path.resolve(process.argv[2] || path.join(root, 'build/cocosair.module.js'));
const port = Number(process.argv[3] || 7477);
if (!fs.existsSync(bundle)) throw new Error(`Build the runtime first: ${bundle}`);
http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
    }
    const file =
        url.pathname === '/build/cocosair.module.js'
            ? bundle
            : url.pathname === '/build/cocosair.module.js.map'
              ? bundle + '.map'
              : path.resolve(probe, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!(file === bundle || file === bundle + '.map' || file.startsWith(probe + path.sep)) || !fs.existsSync(file)) {
        res.writeHead(404);
        res.end();
        return;
    }
    res.writeHead(200, {
        'Content-Type': file.endsWith('.html')
            ? 'text/html'
            : file.endsWith('.js')
              ? 'text/javascript'
              : 'application/json',
        'Cache-Control': 'no-store',
    });
    res.end(fs.readFileSync(file));
}).listen(port, '127.0.0.1', () => console.log(`Label shadow probe: http://127.0.0.1:${port}/ (${bundle})`));
