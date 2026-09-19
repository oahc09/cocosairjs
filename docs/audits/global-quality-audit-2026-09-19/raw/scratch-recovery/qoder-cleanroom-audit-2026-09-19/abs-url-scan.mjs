import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve('E:/AIProMax/github/cocosair.js/build/examples');
const rows = [];
for (const f of fs.readdirSync(ROOT).sort()) {
  const boot = path.join(ROOT, f, 'main.boot.js');
  if (!fs.existsSync(boot)) continue;
  const code = fs.readFileSync(boot, 'utf8');
  const hits = [];
  for (const m of code.matchAll(/(window\.__debugBase\s*\|\|\s*)?["'`](\/(?:build|__debug)\/[^"'`]*)["'`]/g)) {
    hits.push({ url: m[2], guarded: !!m[1] });
  }
  const spec = path.join(ROOT, f, 'example.json');
  let status = '?', dev = '?';
  if (fs.existsSync(spec)) {
    const j = JSON.parse(fs.readFileSync(spec, 'utf8'));
    status = j.status; dev = j.requiresDevTools;
  }
  if (hits.length) rows.push({ id: f, status, requiresDevTools: dev, hits });
}
console.log('boot.js scanned:', fs.readdirSync(ROOT).filter(f => fs.existsSync(path.join(ROOT, f, 'main.boot.js'))).length);
for (const r of rows) console.log(JSON.stringify(r));
console.log('unguarded absolute-URL examples:', rows.filter(r => r.hits.some(h => !h.guarded)).map(r => r.id).join(', '));
