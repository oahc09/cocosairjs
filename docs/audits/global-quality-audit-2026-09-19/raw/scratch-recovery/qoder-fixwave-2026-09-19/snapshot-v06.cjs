const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO = 'E:/AIProMax/github/cocosair.js';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const DEST = path.join('E:/qoder-fixwave-2026-09-19', 'pre-v06-' + STAMP.slice(11, 19));
fs.mkdirSync(DEST, { recursive: true });

const targets = [];
function push (rel) { targets.push(rel); }

for (const f of ['v06-golden-dual-track.json', 'v06-recipes.json', 'v06-recipes-promoted.json', 'v06-recipes.log',
  'v06-catalog-runtime-gate.json', 'v06-review-gate.json', 'v06-fresh-consumer.json', 'v06-lifecycle-gate.json']) {
  push('docs/evidence/' + f);
}
push('docs/v06-final-gate.md');
const recDir = path.join(REPO, 'docs/evidence/recipes');
if (fs.existsSync(recDir)) {
  for (const f of fs.readdirSync(recDir)) push('docs/evidence/recipes/' + f);
}
const outDir = path.join(REPO, 'output');
if (fs.existsSync(outDir)) {
  for (const f of fs.readdirSync(outDir)) {
    if (fs.statSync(path.join(outDir, f)).isFile()) push('output/' + f);
  }
}
function stat (p) { return fs.statSync(path.join(REPO, p)); }

const rows = [];
for (const rel of targets) {
  const abs = path.join(REPO, rel);
  if (!fs.existsSync(abs) || stat(rel).isDirectory()) continue;
  const buf = fs.statSync(abs);
  const h = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
  const dest = path.join(DEST, rel.replace(/[\/]/g, '_'));
  fs.copyFileSync(abs, dest);
  rows.push({ rel, bytes: buf.size, mtime: buf.mtime.toISOString(), sha256: h });
}
const manifest = {
  purpose: 'Pre-write snapshot before authorized V0.6 full-track re-evidence (F-56).',
  measuredAt: new Date().toISOString(),
  head: 'e06d29880b398c43d318eedee43c32941dd4eb97',
  fileCount: rows.length,
  totalBytes: rows.reduce((a, r) => a + r.bytes, 0),
  rows,
};
fs.writeFileSync(path.join(DEST, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));
console.log('snapshot dir: ' + DEST);
console.log('files=' + rows.length + ' bytes=' + manifest.totalBytes);
