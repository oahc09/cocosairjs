/* V1.1 Example Spec 证据公共实现：规范化指纹 + 证据驱动晋级。
 *
 * 指纹必须与 coverage-report 的判定完全一致，否则 verified 会因实现漂移而失真：
 * 排除 status / promotionEvidence（晋级写回不得使既有证据失配）。
 *
 * 使用方：tools/verify/v11-examples-verify.cjs、tools/verify/v11-devtools-examples.cjs、
 *        tools/examples/coverage-report.cjs。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..', '..');

function specFingerprintOf (spec) {
  const copy = Object.assign({}, spec);
  delete copy.status;
  delete copy.promotionEvidence;
  return crypto.createHash('sha256').update(JSON.stringify(copy)).digest('hex').slice(0, 12);
}

function specFileOf (exampleId) {
  return path.join(REPO, 'examples', exampleId, 'example.json');
}

function readFingerprint (exampleId) {
  const file = specFileOf(exampleId);
  if (!fs.existsSync(file)) { return null; }
  return specFingerprintOf(JSON.parse(fs.readFileSync(file, 'utf8')));
}

/** §15 资产内容绑定（审计 R7g）：把资产字节数与内容哈希写进证据，使离线复核能检出
 *  资产被替换/清空，而不只检"文件在不在"。范围 = 声明资产 ∪ assets/ 目录全部文件：
 *  .gltf 的 .bin 边车与未写进 spec.assets 的加载物同属交付内容，只绑声明路径会留下
 *  整目录盲区（副本实测 E1：SimpleSkin_geometry.bin 截成 0 字节、gltf-viewer 的
 *  BoxTextured.glb 整只换成垃圾，离线门禁仍 0 fail / EXIT 0）。
 *  证据内路径统一为 POSIX 风格相对路径，供离线端按同一键位比对。 */
function listAssetTree (exampleDir) {
  const out = [];
  const assetsDir = path.join(exampleDir, 'assets');
  if (!fs.existsSync(assetsDir)) { return out; }
  (function walk (dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(abs); continue; }
      out.push(path.relative(exampleDir, abs).replace(/\\/g, '/'));
    }
  })(assetsDir);
  return out.sort();
}

function assetDigestsOf (exampleDir, assets) {
  const declaredList = (assets || []).map((rel) => String(rel).replace(/\\/g, '/'));
  const paths = new Set(declaredList);
  for (const rel of listAssetTree(exampleDir)) { paths.add(rel); }
  const declared = new Set(declaredList);
  return [...paths].sort().map((rel) => {
    const abs = path.join(exampleDir, rel);
    const base = { path: rel, declared: declared.has(rel) };
    if (!fs.existsSync(abs)) { return Object.assign(base, { bytes: 0, hash: null, present: false }); }
    const buf = fs.readFileSync(abs);
    return Object.assign(base, { bytes: buf.length, hash: crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16), present: true });
  });
}

/** 证据驱动晋级：PASS 示例的 example.json status → stable，并记录当期规格指纹。 */
function promoteFromEvidence (results) {
  let promoted = 0;
  for (const result of results) {
    if (!result || result.result !== 'PASS' || !result.specFingerprint) { continue; }
    const file = specFileOf(result.id);
    if (!fs.existsSync(file)) { continue; }
    const spec = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (spec.status === 'stable' && spec.promotionEvidence === result.specFingerprint) { continue; }
    spec.status = 'stable';
    spec.promotionEvidence = result.specFingerprint;
    fs.writeFileSync(file, JSON.stringify(spec, null, 2) + '\n');
    promoted++;
  }
  return promoted;
}

module.exports = { REPO, specFingerprintOf, readFingerprint, promoteFromEvidence, assetDigestsOf, listAssetTree };
