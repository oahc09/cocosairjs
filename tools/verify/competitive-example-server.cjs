// Read-only example serving for focused regressions. No watcher, build, or disk JS compilation.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const mime = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.ts': 'text/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.png': 'image/png',
};

exports.startExampleServer = async (root) => {
    const server = http.createServer((req, res) => {
        try {
            let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
            if (!file.startsWith(root + path.sep)) throw new Error('outside workspace');
            if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
            if (!fs.existsSync(file) && file.endsWith('.js') && fs.existsSync(file.slice(0, -3) + '.ts'))
                file = file.slice(0, -3) + '.ts';
            if (!fs.existsSync(file)) {
                res.writeHead(404);
                res.end();
                return;
            }
            const body = file.endsWith('.ts')
                ? esbuild.transformSync(fs.readFileSync(file, 'utf8'), {
                      loader: 'ts',
                      format: 'esm',
                      target: 'es2022',
                  }).code
                : fs.readFileSync(file);
            res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
            res.end(body);
        } catch (error) {
            res.writeHead(500);
            res.end(String(error));
        }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    return {
        origin: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((resolve) => server.close(resolve)),
    };
};
