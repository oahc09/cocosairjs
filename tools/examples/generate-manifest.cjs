/* V1.1 §28 — Manifest Generator：递归发现 examples/ 下所有 example.json 并生成 files.json。
 * 执行：node tools/examples/generate-manifest.cjs
 * 产出：examples/files.json
 */
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const EXAMPLES_DIR = path.join(REPO, 'examples');

function findExampleJsons(dir, prefix) {
  var results = [];
  for (var entry of fs.readdirSync(dir, { withFileTypes: true })) {
    var full = path.join(dir, entry.name);
    var rel = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.name === 'node_modules' || entry.name === 'shared' || entry.name === 'assets') continue;
    if (entry.isDirectory()) {
      results = results.concat(findExampleJsons(full, rel));
    } else if (entry.name === 'example.json') {
      results.push({ dir: path.dirname(full), relDir: path.dirname(rel), file: full });
    }
  }
  return results;
}

function main() {
  var found = findExampleJsons(EXAMPLES_DIR, '');
  var manifest = { generatedAt: new Date().toISOString(), revision: '', examples: [], categories: {} };
  try { manifest.revision = require('child_process').execSync('git rev-parse --short HEAD', { cwd: REPO }).toString().trim(); } catch(e) {}

  var seen = new Set();
  for (var item of found) {
    var json;
    try { json = JSON.parse(fs.readFileSync(item.file, 'utf8')); }
    catch(e) { console.error('[manifest] WARN: invalid JSON in', item.relDir); continue; }
    if (!json.id) { console.error('[manifest] WARN: missing id in', item.relDir); continue; }
    if (seen.has(json.id)) { console.error('[manifest] WARN: duplicate id', json.id); continue; }
    seen.add(json.id);
    json.dir = item.relDir;
    manifest.examples.push(json);
    var cat = json.category || 'uncategorized';
    if (!manifest.categories[cat]) manifest.categories[cat] = [];
    manifest.categories[cat].push(json.id);
  }
  manifest.examples.sort(function(a, b) { return a.id.localeCompare(b.id); });

  var outPath = path.join(EXAMPLES_DIR, 'files.json');
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log('[manifest] ' + manifest.examples.length + ' examples, ' + Object.keys(manifest.categories).length + ' categories → ' + path.relative(REPO, outPath));
}

main();
