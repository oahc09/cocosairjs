// Independent recomputation of V0.6 recipe evidence from RAW artifacts (read-only on repo).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO = 'E:/AIProMax/github/cocosair.js';
const doc = JSON.parse(fs.readFileSync(path.join(REPO, 'docs/evidence/v06-recipes.json'), 'utf8'));

function sha (p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

// Decode PNG IHDR width/height + count distinct RGB pixels, to detect blank/uniform frames.
function pngStats (p) {
  const b = fs.readFileSync(p);
  if (b.slice(1, 4).toString() !== 'PNG') return { ok: false };
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  // decompress IDAT
  const zlib = require('zlib');
  const idat = [];
  let off = 8;
  while (off < b.length) {
    const len = b.readUInt32BE(off);
    const type = b.slice(off + 4, off + 8).toString();
    if (type === 'IDAT') idat.push(b.slice(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride), pos = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[pos++];
    const line = Buffer.from(raw.slice(pos, pos + stride));
    pos += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0, bb = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (ft === 1) v = (v + a) & 255;
      else if (ft === 2) v = (v + bb) & 255;
      else if (ft === 3) v = (v + ((a + bb) >> 1)) & 255;
      else if (ft === 4) {
        const pa = Math.abs(bb - c), pb = Math.abs(a - c), pc = Math.abs(a + bb - 2 * c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? bb : c)) & 255;
      }
      line[x] = v;
    }
    line.copy(out, y * stride);
    prev = line;
  }
  const seen = new Set();
  let nonOpaque = 0;
  const hist = new Map();
  for (let i = 0; i < out.length; i += bpp) {
    const key = (out[i] << 16 | out[i + 1] << 8 | out[i + 2]);
    seen.add(key);
    if (out[i + 3] !== 0) {
      hist.set(key, (hist.get(key) || 0) + 1);
      nonOpaque++;
    }
  }
  let top = 0, topCount = 0;
  for (const [k, c] of hist) if (c > topCount) { topCount = c; top = k; }
  return { ok: true, w, h, colors: seen.size, drawnPct: +(100 * nonOpaque / (w * h)).toFixed(1), dominantPct: +(100 * topCount / Math.max(1, nonOpaque)).toFixed(1) };
}

const rows = [];
let bad = 0;
for (const run of doc.runs) {
  const arts = run.artifacts || [];
  const artInfo = arts.map(a => {
    const abs = path.resolve(REPO, a.path);
    const exists = fs.existsSync(abs);
    const realBytes = exists ? fs.statSync(abs).size : -1;
    const realHash = exists ? sha(abs) : '';
    const bytesOk = exists && realBytes === a.bytes;
    const hashOk = exists && (realHash.startsWith(a.hash) || realHash === a.hash);
    if (!bytesOk || !hashOk) bad++;
    const st = exists && abs.endsWith('.png') ? pngStats(abs) : {};
    return { path: a.path, bytesOk, hashOk, ...(st.ok ? { w: st.w, h: st.h, colors: st.colors, drawnPct: st.drawnPct, dominantPct: st.dominantPct } : {}) };
  });
  const checks = (run.checks || []);
  const states = checks.map(c => c.state || c.status);
  const vr = (run.validatorResults || []);
  rows.push({
    recipeId: run.recipeId,
    result: run.result,
    revision: run.revision,
    sourceHash: run.sourceHash,
    scenarioHash: String(run.scenarioHash).slice(0, 12),
    artifactCount: arts.length,
    artifactsBound: artInfo.every(a => a.bytesOk && a.hashOk),
    png: artInfo.filter(a => a.w).map(a => `${a.w}x${a.h} colors=${a.colors} drawn=${a.drawnPct}% dom=${a.dominantPct}%`),
    checkStates: [...new Set(states)].join('/'),
    failedChecks: checks.filter((c, i) => !/PASS/i.test(String(states[i]))).map(c => c.validatorId || c.id || c.name),
    validators: [...new Set(vr.map(v => v.state || v.status))].join('/'),
  });
}
console.log(JSON.stringify(rows, null, 1));
console.log('TOTAL runs=' + rows.length + ' unbound-artifacts=' + bad);
console.log('all PASS = ' + rows.every(r => r.result === 'PASS' && r.artifactsBound));
console.log('distinct sourceHash = ' + [...new Set(rows.map(r => r.sourceHash))].join(','));
console.log('distinct scenarioHash = ' + new Set(rows.map(r => r.scenarioHash)).size + '/' + rows.length);
// blank-frame detector: any PNG whose dominant colour covers >99.5% of drawn pixels
const suspicious = rows.filter(r => r.png.some(s => /dom=(100|99\.[5-9])%/.test(s)));
console.log('suspect-uniform-frames = ' + JSON.stringify(suspicious.map(r => r.recipeId)));
