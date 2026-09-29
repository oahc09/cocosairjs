/* F-82: every published build/*.js must carry the builtin assets the source registers.
 * `npm run build` only emits cocosair.module.js, so a stale cocosair.module.min.js can ship
 * without the newest registration and no other gate notices.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const SOURCE = path.join(root, 'src', 'air', 'builtin', 'register.ts');

function publishedBundles () {
  const files = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).files || [];
  return files
    .filter((entry) => /^build\/npm\/cocosair\.module(?:\.min)?\.js$/.test(entry));
}

function registeredMarkers () {
  const src = fs.readFileSync(SOURCE, 'utf8');
  return [...new Set((src.match(/'builtin-[a-z0-9-]+'/g) || []).map((m) => m.slice(1, -1)))].sort();
}

function check () {
  const markers = registeredMarkers();
  const packageFiles = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).files || [];
  const bundles = publishedBundles();
  const failures = [];
  const checked = [];
  if (packageFiles.some((entry) => /\.map$/.test(entry))) {
    failures.push('package.json files[] must not publish source maps; local build maps stay in build/');
  }
  if (bundles.length !== 2) { failures.push(`expected two build/npm runtime bundles, found ${bundles.length}`); }
  for (const bundle of bundles) {
    const abs = path.join(root, bundle);
    if (!fs.existsSync(abs)) { failures.push(`${bundle}: listed in package.json files[] but absent`); continue; }
    const text = fs.readFileSync(abs, 'utf8');
    if (/\/\/# sourceMappingURL=/.test(text)) { failures.push(`${bundle}: published runtime still links a source map`); }
    const missing = markers.filter((m) => !text.includes(m));
    checked.push({ bundle, bytes: fs.statSync(abs).size, missing });
    for (const m of missing) { failures.push(`${bundle}: missing registered builtin "${m}" (source has it, shipped bundle does not)`); }
  }
  return { markers, checked, failures };
}

if (require.main === module) {
  const result = check();
  for (const failure of result.failures) { console.log(`[published-artifacts] FAIL ${failure}`); }
  console.log(`[published-artifacts] ${result.markers.length} markers x ${result.checked.length} bundles: `
    + (result.failures.length ? `${result.failures.length} FAIL` : 'PASS')
    + ` (${result.checked.map((c) => `${c.bundle} ${c.bytes}B`).join(', ')})`);
  process.exitCode = result.failures.length ? 1 : 0;
}

module.exports = { check, publishedBundles, registeredMarkers };
