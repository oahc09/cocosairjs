// F-34 repro: serve the GALLERY ARTIFACT from its own root only (no dev-server /build/, no /__debug/)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('E:/AIProMax/github/cocosair.js/build/examples');
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.ts': 'text/plain', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary' };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const probe = async url => {
  const res = await fetch(base + url);
  await res.arrayBuffer();
  return `${res.status}  ${url}`;
};

console.log('# gallery-root =', ROOT, '(plain static server; NO /build/ route, NO /__debug/)');
console.log(await probe('/gltf-meshopt/main.boot.js'));
console.log(await probe('/build/gltf-decoders/meshopt/meshopt_decoder.mjs'));
console.log(await probe('/gltf-decoders/meshopt/meshopt_decoder.mjs'));
console.log(await probe('/gltf-meshopt/assets/meshopt-khr.glb'));
console.log(await probe('/cocosair.module.js'));
console.log(await probe('/mesh-sphere/main.boot.js'));

const urls = new Map();
for (const f of fs.readdirSync(ROOT)) {
  const boot = path.join(ROOT, f, 'main.boot.js');
  if (!fs.existsSync(boot)) continue;
  const code = fs.readFileSync(boot, 'utf8');
  for (const m of code.matchAll(/["'`](\/(?:build|__debug)\/[^"'`]+)["'`]/g)) {
    if (code.includes('__debugBase')) continue;
    urls.set(m[1], f);
  }
}
console.log('# absolute /build|/__debug URLs in shipped boot.js (excluding guarded __debugBase uses):', JSON.stringify([...urls.entries()]));
server.close();
