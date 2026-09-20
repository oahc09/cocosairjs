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
    .filter((entry) => /^build\/[^/]+\.js$/.test(entry))
    .map((entry) => entry.replace(/^build\//, ''));
}

function registeredMarkers () {
  const src = fs.readFileSync(SOURCE, 'utf8');
  return [...new Set((src.match(/'builtin-[a-z0-9-]+'/g) || []).map((m) => m.slice(1, -1)))].sort();
}

function check () {
  const markers = registeredMarkers();
  const bundles = publishedBundles();
  const failures = [];
  const checked = [];
  for (const bundle of bundles) {
    const abs = path.join(root, 'build', bundle);
    if (!fs.existsSync(abs)) { failures.push(`${bundle}: listed in package.json files[] but absent from build/`); continue; }
    const text = fs.readFileSync(abs, 'utf8');
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
