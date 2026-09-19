const fs = require('fs');
const path = require('path');
const SR = 'docs/audits/global-quality-audit-2026-09-19/raw/scratch-recovery';
const rows = JSON.parse(fs.readFileSync(SR + '/RECOVERY-MANIFEST.json', 'utf8')).rows;
const rec = new Set(rows.map(r => r.src));
const SRCS = ['E:/qoder-r7i-2026-09-19', 'E:/qoder-frozen-2026-09-19', 'E:/qoder-negctl-audit-2026-09-19',
  'E:/qoder-negctl2-2026-09-19', 'E:/qoder-negctl3-2026-09-19', 'E:/qoder-cleanroom-audit-2026-09-19',
  'E:/qoder-rebuild-audit-2026-09-19', 'E:/qoder-fixwave-2026-09-19'];
const byTop = new Map();
function norm (p) { return p.split(path.sep).join('/'); }
function walk (d) {
  let bytes = 0, n = 0;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = norm(path.join(d, e.name));
    if (e.isDirectory()) { const r = walk(p); bytes += r[0]; n += r[1]; continue; }
    if (rec.has(p)) continue;
    let sz = 0; try { sz = fs.statSync(p).size; } catch { }
    n++; bytes += sz;
    const top = norm(d);
    if (!byTop.has(top)) byTop.set(top, [0, 0]);
    const v = byTop.get(top); v[0]++; v[1] += sz;
  }
  return [bytes, n];
}
let totN = 0, totB = 0;
for (const t of SRCS) {
  if (!fs.existsSync(t)) { console.log('absent:', t); continue; }
  const [b, n] = walk(t);
  if (n) console.log('NOT recovered:', t, 'files=' + n, 'MB=' + (b / 1048576).toFixed(1));
  totN += n; totB += b;
}
console.log('TOTAL unrecovered:', totN, 'files,', (totB / 1073741824).toFixed(2), 'GB');
console.log('top unrecovered dirs:');
[...byTop.entries()].sort((a, b) => b[1][1] - a[1][1]).slice(0, 12)
  .forEach(([d, v]) => console.log('  ', d, 'files=' + v[0], (v[1] / 1048576).toFixed(1) + 'MB'));
const recFiles = rows.map(r => path.basename(r.src));
for (const must of ['MANIFEST.json', 'MANIFEST.txt', 'SHA256MANIFEST-postv06.txt', 'SHA256MANIFEST-final-committed.txt'])
  console.log('recovered contains ' + must + ':', recFiles.includes(must));
