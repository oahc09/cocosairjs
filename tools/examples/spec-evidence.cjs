/* V1.1 §12 — API Evidence 行号维护工具。
 *
 * 读取每个 examples/<id>/example.json 的 api.evidence[]，在 source 文件中定位
 * 该 API symbol 的首次使用行（跳过 import 行），回填/校正 sourceLocation（如 "L32"）。
 *
 * 执行：
 *   node tools/examples/spec-evidence.cjs            # 回填所有 sourceLocation
 *   node tools/examples/spec-evidence.cjs --check    # 只校验不写入（漂移时 exit 1）
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const EXAMPLES_DIR = path.join(REPO, 'examples');
const INVENTORY_PATH = path.join(REPO, 'docs', 'example-api-inventory.json');
const checkOnly = process.argv.includes('--check');

const inventory = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
const SPEC_TOKEN_HINTS = { 'math.Vec3': 'Vec3', 'math.Color': 'Color' };

function evidenceToken (unit) {
  if (SPEC_TOKEN_HINTS[unit]) { return SPEC_TOKEN_HINTS[unit]; }
  const parts = unit.split('.');
  return parts[parts.length - 1];
}

function findSymbolLine (exampleDir, sourceFile, unit) {
  const file = path.join(exampleDir, sourceFile);
  if (!fs.existsSync(file)) { return { error: `source ${sourceFile} not found` }; }
  const token = evidenceToken(unit);
  const callLike = /^[a-z]/.test(token);
  const callRe = new RegExp(`\\b${token}\\s*\\(`);
  const wordRe = new RegExp(`\\b${token}\\b`);
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (const re of [callLike ? callRe : wordRe, wordRe]) {
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*import\b|^\s*}\s*from\s+['"]/.test(lines[i])) { continue; }
      if (re.test(lines[i])) { return { line: i + 1 }; }
    }
  }
  return { error: `symbol "${token}" (${unit}) not found in ${sourceFile}` };
}

(function main () {
  const dirs = fs.readdirSync(EXAMPLES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'shared' && e.name !== 'node_modules')
    .map((e) => e.name).sort();
  let entries = 0; let drifted = 0; let errors = 0;
  for (const dir of dirs) {
    const file = path.join(EXAMPLES_DIR, dir, 'example.json');
    if (!fs.existsSync(file)) { continue; }
    const spec = JSON.parse(fs.readFileSync(file, 'utf8'));
    const evidence = spec.api && spec.api.evidence;
    if (!Array.isArray(evidence)) { continue; }
    let changed = false;
    for (const ev of evidence) {
      if (!ev.api || !ev.source) { continue; }
      entries++;
      const found = findSymbolLine(path.join(EXAMPLES_DIR, dir), ev.source, ev.api);
      if (found.error) { console.log(`[${dir}] ERROR ${found.error}`); errors++; continue; }
      const loc = `L${found.line}`;
      if (ev.sourceLocation !== loc) {
        drifted++;
        if (checkOnly) { console.log(`[${dir}] DRIFT ${ev.api}: claimed ${ev.sourceLocation || '—'} actual ${loc}`); } else { ev.sourceLocation = loc; changed = true; }
      }
    }
    if (changed) { fs.writeFileSync(file, JSON.stringify(spec, null, 2) + '\n'); }
  }
  const verb = checkOnly ? 'checked' : 'updated';
  console.log(`[spec-evidence] ${entries} evidence entries ${verb}: ${drifted} drifted, ${errors} errors`);
  process.exitCode = errors > 0 || (checkOnly && drifted > 0) ? 1 : 0;
})();
