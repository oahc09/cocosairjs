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
  // 晋级写回字段不得进入指纹（否则每次运行自我失配）；status 同理。
  delete copy.status;
  delete copy.promotionEvidence;
  delete copy.promotion;
  delete copy.stableReview;
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

/** 证据行定位（§12 强化）：api.evidence[].sourceLocation 指向的行必须真的出现该 API 的名字，
 *  否则"行号绑定"只是元数据（改一行注释也能维持指纹）。返回 {ok, reason}。 */
function evidenceLineOk (exampleDir, ev) {
  const { codeLines, resolveSource, evidenceToken } = require(path.join(REPO, 'tools', 'examples', 'spec-evidence.cjs'));
  const file = resolveSource(exampleDir, ev.source);
  if (!file) { return { ok: false, reason: `source ${ev.source} not found` }; }
  const m = /^L(\d+)$/.exec(String(ev.sourceLocation || ''));
  if (!m) { return { ok: false, reason: `sourceLocation ${ev.sourceLocation} 不是 L<行号>` }; }
  const lines = codeLines(fs.readFileSync(file, 'utf8'));
  const line = lines[Number(m[1]) - 1];
  if (line === undefined) { return { ok: false, reason: `${ev.source} 没有第 ${m[1]} 行` }; }
  const token = evidenceToken(ev.api);
  if (!new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(line)) {
    return { ok: false, reason: `L${m[1]} 未出现 ${token}（行内容漂移）` };
  }
  return { ok: true, line: Number(m[1]) };
}

/** 逐 API 证明（总审查 item 1）。verified 必须三条同时成立：
 *    executed（运行期计数器看到该 unit 被调用）
 *  + bound（api.evidence 把该 unit 绑到本次 PASS 的 validator）
 *  + lineOk（证据行号仍指向含该 API 名字的可执行代码）
 *  其余组合只能算 attested（有单一侧面证据）或 unproven（无证据），一律不计入覆盖率 verified。 */
function apiProofOf (spec, exampleDir, traceUnits, passedValidatorIds) {
  // 运行器给检查项加了维度前缀（interaction:frame-diff / lifecycle:resource-released），
  // 而 api.evidence[].validator 按门禁合同只能写注册表裸 id（spec-validate 校验）。
  // 不在此处对齐，前缀维度 PASS 也永远解不开 bound，证据链在这一格静默断裂。
  const passed = new Set();
  for (const id of passedValidatorIds || []) {
    passed.add(id);
    const i = String(id).indexOf(':');
    if (i > 0) { passed.add(String(id).slice(i + 1)); }
  }
  const units = [...new Set([...(spec.api && spec.api.claims || []),
    ...(spec.api && spec.api.evidence || []).map((e) => e && e.api).filter(Boolean)])];
  const out = [];
  for (const unit of units.sort()) {
    const entries = ((spec.api && spec.api.evidence) || []).filter((e) => e && e.api === unit);
    const bindings = entries.map((e) => ({
      validator: e.validator,
      passed: passed.has(e.validator),
      line: evidenceLineOk(exampleDir, e),
    }));
    const bound = bindings.some((b) => b.passed && b.line.ok);
    const trace = traceUnits && traceUnits[unit];
    const state = trace ? trace.state : 'no-trace';
    const executed = state === 'executed';
    const instrumentable = state !== 'not-instrumentable' && state !== 'unresolved' && state !== 'no-trace';
    let proof;
    if (executed && bound) { proof = 'verified'; } else if (executed || (bound && !instrumentable)) { proof = 'attested'; } else { proof = 'unproven'; }
    out.push({
      api: unit, proof, state,
      calls: trace ? trace.calls : 0,
      reads: trace ? trace.reads : 0,
      // 观察通道：call=调用/构造，read=仅读取成员（Layers.Enum 这类命名空间用法）。
      // 报告端必须能区分二者，不得把 read 冒充成调用执行。
      via: trace ? trace.via : null,
      mechanism: trace ? trace.mechanism : null,
      observedVia: trace && trace.observedVia ? trace.observedVia : undefined,
      // 门禁读回窗口内被抑制的调用（见 api-trace.cjs 头）：不披露就无法证明"verified 不是验证器自己盖章"。
      harnessCalls: trace && trace.harnessCalls ? trace.harnessCalls : undefined,
      bound,
      bindings: bindings.map((b) => ({ validator: b.validator, passed: b.passed, ok: b.line.ok, reason: b.line.reason })),
    });
  }
  return out;
}

/** stable 晋级记录（v3）：一次运行必须同时给出
 *  规格指纹 + 当期源码指纹 + 当期候选指纹 + 逐 API 证明（无 unproven），
 *  否则不写 stable；已有的 stable 标记若当期证据不成立则降级为 draft。
 *  旧字段 promotionEvidence（只含规格指纹、示例级 PASS 即写）不再被任何门禁承认。 */
function promotionOf (result) {
  if (!result || result.result !== 'PASS') { return null; }
  const proof = result.apiProof || [];
  const unproven = proof.filter((p) => p.proof === 'unproven');
  if (proof.length === 0 || unproven.length > 0) { return null; }
  if (!result.sourceFingerprint || !result.candidateFingerprint) { return null; }
  return {
    spec: result.specFingerprint,
    source: result.sourceFingerprint,
    candidate: result.candidateFingerprint,
    verified: proof.filter((p) => p.proof === 'verified').length,
    attested: proof.filter((p) => p.proof === 'attested').length,
    units: proof.length,
  };
}

function promoteFromEvidence (results) {
  let promoted = 0;
  let demoted = 0;
  for (const result of results) {
    if (!result || !result.id) { continue; }
    const file = specFileOf(result.id);
    if (!fs.existsSync(file)) { continue; }
    const spec = JSON.parse(fs.readFileSync(file, 'utf8'));
    const record = promotionOf(result);
    const reason = record ? null : (result.result !== 'PASS' ? 'current run FAIL'
      : (result.apiProof || []).length === 0 ? 'no per-API evidence'
        : `${(result.apiProof || []).filter((p) => p.proof === 'unproven').map((p) => p.api).join(',')} unproven`);
    if (!record) {
      if (spec.status === 'stable') {
        spec.status = 'draft';
        spec.stableReview = { demotedAt: new Date().toISOString(), reason };
        fs.writeFileSync(file, JSON.stringify(spec, null, 2) + '\n');
        demoted++;
      }
      continue;
    }
    if (spec.status === 'stable' && spec.promotion && JSON.stringify(spec.promotion) === JSON.stringify(record)) { continue; }
    spec.status = 'stable';
    spec.promotion = record;
    delete spec.promotionEvidence;
    delete spec.stableReview;
    fs.writeFileSync(file, JSON.stringify(spec, null, 2) + '\n');
    promoted++;
  }
  return { promoted, demoted };
}

module.exports = {
  REPO, specFingerprintOf, readFingerprint, promoteFromEvidence, promotionOf, assetDigestsOf, listAssetTree,
  evidenceLineOk, apiProofOf,
};
