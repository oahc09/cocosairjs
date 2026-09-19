const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DESTROOT = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19/raw/scratch-recovery';
const SRCS = ['E:/qoder-r7i-2026-09-19', 'E:/qoder-frozen-2026-09-19', 'E:/qoder-negctl-audit-2026-09-19',
  'E:/qoder-negctl2-2026-09-19', 'E:/qoder-negctl3-2026-09-19', 'E:/qoder-cleanroom-audit-2026-09-19',
  'E:/qoder-rebuild-audit-2026-09-19', 'E:/qoder-fixwave-2026-09-19'];
// only these path fragments stay in scratch (bulk / regenerable)
const SKIP_DIR = new Set(['node_modules', '.git', 'build', 'work', 'candidate', 'consumer', 'L1', 'L2',
  'pre-reevidence-200119', 'pre-ledger', 'pre-f54-ledger', 'pre-r7g-ledger', 'r7g-bak', 'verify-current']);
const MAX = 2 * 1024 * 1024;
const EXT_OK = /\.(log|txt|md|json|cjs|mjs|js|ts|jsonl|png|sha256|manifest)$/i;

function walk (dir, out, depth) {
  if (depth > 4) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIR.has(e.name)) walk(abs, out, depth + 1); continue; }
    out.push(abs);
  }
  return out;
}

const manifest = [];
let kept = 0, keptBytes = 0;
for (const src of SRCS) {
  if (!fs.existsSync(src)) continue;
  const base = path.basename(src);
  const files = walk(src, [], 0);
  for (const abs of files) {
    const st = fs.statSync(abs);
    const relFromSrc = path.relative(src, abs).split(path.sep).join('/');
    const inSkip = SKIP_DIR.has(relFromSrc.split('/')[0]);
    if (inSkip || st.size > MAX || !EXT_OK.test(abs)) continue;
    const dest = path.join(DESTROOT, base, relFromSrc);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (!fs.existsSync(dest) || fs.statSync(dest).size !== st.size) fs.copyFileSync(abs, dest);
    const h = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex').slice(0, 16);
    manifest.push({ src: abs.replace(/\\/g, '/'), dest: path.relative(path.dirname(DESTROOT) + '/raw', dest).split(path.sep).join('/'), bytes: st.size, sha256_16: h });
    kept++; keptBytes += st.size;
  }
}
fs.mkdirSync(DESTROOT, { recursive: true });
fs.writeFileSync(path.join(DESTROOT, 'RECOVERY-MANIFEST.json'), JSON.stringify({
  purpose: 'Small unique logs/scripts pulled out of the off-repo scratch dirs before the user-authorized cleanup deleted them.',
  measuredAt: new Date().toISOString(), keptFiles: kept, keptBytes, skippedBulkDirs: [...SKIP_DIR], maxBytes: MAX, rows: manifest,
}, null, 2) + '\n');
console.log('recovered files=' + kept + ' bytes=' + keptBytes);
