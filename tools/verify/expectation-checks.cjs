/* 期望值驱动的合同检查（总审查 item 2）。
 *
 * 三个 validator 的名字各自承诺了一种行为，检查必须真的对上那个行为：
 *   asset-loaded      → 声明的资产文件被浏览器真实取到（字节>0、状态<400），且指定 kind 的资源数达门槛、
 *                       资产报告无阻断诊断；不再只看"资产总数>0"。
 *   material-property → 声明节点的 effect 名与材质属性值与期望一致；不再只看"存在材质"。
 *   transform-equals  → 声明节点的 position/rotationEuler/scale 与期望一致（精确数组或 {range,vary}）；
 *                       不再只看"坐标有限"。
 * 没有 validationExpectations 的声明一律 FAIL：宁可红，也不给名不副实的绿。
 *
 * Example 验证器与 DevTools 验证器共用本模块，避免两份实现漂移。
 */
const path = require('path');
const { nearly } = require(path.join(__dirname, 'runtime-readback.cjs'));

/** 欧拉角允许 ±360° 回绕（-180 与 180 是同一姿态）。 */
function nearlyAxis (actual, expected, tol, wrapDegrees) {
  if (!Array.isArray(actual) || actual.length < expected.length) { return false; }
  return expected.every((v, i) => {
    const a = actual[i];
    if (!Number.isFinite(a)) { return false; }
    let d = Math.abs(a - v);
    if (wrapDegrees) { d = Math.min(d, 360 - d); }
    return d <= tol;
  });
}

/** 材质属性值比较：期望带源码单位（encoding），运行期 getProperty 原样读回。 */
function compareColorProperty (decl, got) {
  if (!decl || !Array.isArray(decl.value)) { return 'expectation has no value[]'; }
  if (!Array.isArray(got) || got.length === 0) { return 'getProperty returned nothing'; }
  const tol = typeof decl.tolerance === 'number' ? decl.tolerance : 2e-3;
  const exp = decl.value;
  if (got.length < exp.length) { return `component count differs (${got.length} < ${exp.length})`; }
  const raw = nearly(got, exp, Math.max(tol, 1e-3));
  const normalized = nearly(got, exp.map((v) => v / 255), tol);
  if (decl.encoding === '0-1') { return raw ? 'ok' : `mismatch (0-1): runtime ${JSON.stringify(got)}`; }
  if (decl.encoding === '0-255') { return (raw || normalized) ? 'ok' : `mismatch (0-255): runtime ${JSON.stringify(got)}`; }
  if (raw || normalized) { return 'ok'; }
  return `mismatch: runtime ${JSON.stringify(got)} vs ${JSON.stringify(exp)}`;
}

function declared (spec, key) {
  const exp = (spec.validationExpectations || {})[key];
  return exp && Object.keys(exp).length > 0 ? exp : null;
}

const BLOCKING_DIAGNOSTICS = ['MISSING_DEPENDENCY', 'DESTROYED_RESOURCE', 'TYPE_MISMATCH', 'MISSING_EFFECT'];

/** asset-loaded：paths（浏览器资源计时）+ kinds（唯一资源计数）+ 零阻断诊断。 */
function evalAssetLoaded (spec, exp, assetReport, resources) {
  if (!exp) { return { ok: false, detail: 'declared without validationExpectations["asset-loaded"]（需 paths 或 kinds）' }; }
  const problems = [];
  const counts = (assetReport && assetReport.counts) || {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  for (const [kind, min] of Object.entries(exp.kinds || {})) {
    if ((counts[kind] || 0) < min) { problems.push(`${kind}=${counts[kind] || 0} < ${min}`); }
  }
  const blocking = (((assetReport || {}).diagnostics) || []).filter((d) => BLOCKING_DIAGNOSTICS.includes(d.code));
  if (blocking.length > 0) { problems.push('diagnostics: ' + [...new Set(blocking.map((d) => d.code))].join(',')); }
  const fetched = [];
  for (const entry of exp.paths || []) {
    const rel = String(entry.path || entry).replace(/^\.?\//, '');
    const hit = resources.find((r) => r.decoded.endsWith('/' + rel) || r.decoded === rel);
    if (!hit) { problems.push(`asset ${rel} never fetched by the browser`); continue; }
    if (hit.status && hit.status >= 400) { problems.push(`asset ${rel} HTTP ${hit.status}`); continue; }
    if (!(hit.size > 0)) { problems.push(`asset ${rel} fetched with 0 bytes`); continue; }
    fetched.push(`${rel}=${hit.size}B`);
  }
  if (!exp.paths && !exp.kinds) { problems.push('expectation has neither paths nor kinds'); }
  return { ok: problems.length === 0, detail: problems.length ? problems.join('; ') : `${fetched.join(',')} counts=${total}` };
}

/** material-property：逐节点比对 effect/材质名 与属性值（数值或对象型如贴图）。 */
function evalMaterialProperty (exp, read, findNode) {
  if (!exp) { return { ok: false, detail: 'declared without validationExpectations["material-property"]（需逐节点 effect/props）' }; }
  const problems = [];
  const rows = [];
  for (const [name, nodeExp] of Object.entries(exp)) {
    const node = findNode(read, name);
    if (!node) { problems.push(`${name}: absent at readback`); continue; }
    const renderer = (node.renderers || [])[0];
    const materials = (renderer && (renderer.materials || [])) || [];
    if (!materials.length) { problems.push(`${name}: no renderer material (expect effect ${nodeExp.effect || '-'})`); continue; }
    // 一个网格多个图元 ⇒ 每个材质槽都要各自成立；slots 逐项列出，单槽写法（slot 缺省 0）仍兼容。
    const cases = Array.isArray(nodeExp.slots) && nodeExp.slots.length ? nodeExp.slots : [Object.assign({ slot: 0 }, nodeExp)];
    for (const c of cases) {
    const slotIndex = typeof c.slot === 'number' ? c.slot : 0;
    const tag = Array.isArray(nodeExp.slots) ? `${name}[slot ${slotIndex}]` : name;
    // slot：多材质网格的期望要指明比对哪个材质槽（缺省 0）
    const mat = materials[slotIndex];
    if (!mat) { problems.push(`${tag}: material slot ${slotIndex} absent at readback (observed ${materials.length})`); continue; }
    if (c.effect && mat.effect !== c.effect) {
      problems.push(`${tag}: effect=${mat.effect} expected ${c.effect}`);
      continue;
    }
    if (c.materialName && String(mat.name || '') !== c.materialName) {
      problems.push(`${tag}: material.name=${mat.name} expected ${c.materialName}`);
    }
    const props = [];
    for (const [propName, decl] of Object.entries(c.props || {})) {
      const got = mat.props ? mat.props[propName] : null;
      if (decl && decl.expect === 'object') {
        const kind = mat.propKinds ? mat.propKinds[propName] : null;
        if (kind !== 'object') { problems.push(`${tag}.${propName}: getProperty returned kind=${kind} (expect a bound object, e.g. texture)`); continue; }
        if (decl.name) {
          const observed = mat.textureNames ? mat.textureNames[propName] : null;
          if (!observed || !String(observed).includes(decl.name)) { problems.push(`${tag}.${propName}: bound object name=${observed} expected to contain ${decl.name}`); continue; }
          props.push(`${propName}=${observed}`);
        } else { props.push(`${propName}:object`); }
        continue;
      }
      if (decl && decl.expect === 'unset') {
        // 源码声明该属性"不该存在"（如 clearcoatFactor=0 不走 physical 通道）：
        // 反向断言同样可判定，缺它就把"扩展只在 >0 时生效"这一合同丢掉。
        const kind = mat.propKinds ? mat.propKinds[propName] : null;
        if (got !== null && got !== undefined) { problems.push(`${tag}.${propName}: expected unset, runtime ${JSON.stringify(got)}`); continue; }
        if (kind !== 'null') { problems.push(`${tag}.${propName}: expected unset, kind=${kind}`); continue; }
        props.push(`${propName}:unset`);
        continue;
      }
      const verdict = compareColorProperty(decl, got);
      if (verdict !== 'ok') { problems.push(`${tag}.${propName}: ${verdict} (runtime=${JSON.stringify(got)} expected=${JSON.stringify(decl && decl.value)})`); }
      else { props.push(propName); }
    }
    rows.push(`${tag}=${mat.effect}${props.length ? '{' + props.join(',') + '}' : ''}`);
    }
  }
  return { ok: problems.length === 0, detail: problems.length ? problems.join('; ') : rows.join(', ') };
}

const TRANSFORM_KEYS = ['position', 'rotationEuler', 'scale'];

/** 从 material-property 期望收集需要读回的属性名（含多槽 slots 形式）。
 *  漏看 slots 会让多材质示例读回空 props，把"两槽各自生效"误判成"属性取不到"。 */
function materialPropNames (spec) {
  const exp = ((spec || {}).validationExpectations || {})['material-property'] || {};
  return [...new Set(Object.values(exp).flatMap((n) => Object.keys((n && n.props) || {})
    .concat(Array.isArray(n && n.slots) ? n.slots.flatMap((s) => Object.keys((s && s.props) || {})) : [])))];
}

/** transform-equals：数组=精确比较，{range,vary}=区间 + 两次采样必须真的变化。 */
function evalTransformEquals (exp, read, second, findNode, graphNodeCount) {
  if (!exp) { return { ok: false, detail: 'declared without validationExpectations["transform-equals"]（需逐节点期望变换）' }; }
  const problems = [];
  const rows = [];
  for (const [name, nodeExp] of Object.entries(exp)) {
    const node = findNode(read, name);
    const other = findNode(second, name);
    if (!node) { problems.push(`${name}: absent at readback`); continue; }
    for (const key of TRANSFORM_KEYS) {
      const decl = nodeExp[key];
      if (!decl) { continue; }
      const actual = node[key];
      if (Array.isArray(decl)) {
        const tol = typeof nodeExp.tolerance === 'number' ? nodeExp.tolerance : (key === 'rotationEuler' ? 1e-2 : 1e-3);
        if (!nearlyAxis(actual, decl, tol, key === 'rotationEuler')) {
          problems.push(`${name}.${key}=${JSON.stringify(actual)} expected ${JSON.stringify(decl)} (±${tol})`);
        } else { rows.push(`${name}.${key}`); }
        continue;
      }
      if (!decl.range && !decl.vary) { problems.push(`${name}.${key}: expectation is neither a vector nor {range,vary}`); continue; }
      if (decl.deferTo === 'interaction-window') {
        // 静置采样证明不了交互驱动的变化；本条目交由交互窗口判定器（runInteractionChecks 的
        // 交互前/后两次读回）负责，此处不判、也不冒充已证。
        rows.push(`${name}.${key}→interaction-window`);
        continue;
      }
      if (decl.range) {
        const inRange = decl.range.every((r, i) => Number.isFinite(actual[i]) && actual[i] >= r[0] - 1e-6 && actual[i] <= r[1] + 1e-6);
        if (!inRange) { problems.push(`${name}.${key}=${JSON.stringify(actual)} outside ${JSON.stringify(decl.range)}`); continue; }
      } else if (!actual.every((v) => Number.isFinite(v))) {
        problems.push(`${name}.${key}=${JSON.stringify(actual)} not finite`); continue;
      }
      if (decl.vary) {
        const delta = typeof decl.minDelta === 'number' ? decl.minDelta : 1e-4;
        const moved = other && TRANSFORM_KEYS.indexOf(key) >= 0
          && actual.some((v, i) => Number.isFinite(v) && Number.isFinite(other[key][i]) && Math.abs(v - other[key][i]) > delta);
        if (!moved) { problems.push(`${name}.${key} declared vary but identical across samples`); continue; }
        rows.push(`${name}.${key}~range`);
      } else { rows.push(`${name}.${key}∈range`); }
    }
  }
  return { ok: problems.length === 0, detail: problems.length ? problems.join('; ')
    : `${rows.length} declared components matched (nodes ${Object.keys(exp).length}/${graphNodeCount} in graph)` };
}

function needsSecondSample (exp) {
  return Object.values(exp || {}).some((n) => TRANSFORM_KEYS.some((k) => n && n[k] && n[k].vary && n[k].deferTo !== 'interaction-window'));
}

const fs = require('fs');
const ENTRY_SOURCES = ['src/main.ts', 'src/main.js', 'main.ts', 'main.js'];

function entrySourceOf (exampleDir) {
  for (const rel of ENTRY_SOURCES) {
    const abs = path.join(exampleDir, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) { return abs; }
  }
  return null;
}

/** 出处解析：`source` 依次按 示例目录 → examples/ → 仓库根 解析（入口源码 / shared 库 / 引擎源码三类引用）。
 *  与 tools/examples/spec-evidence.cjs 的 api.evidence 约定保持同向，只是多了引擎层。
 *  全都落空即假出处；绝对路径与 `..` 逃逸一律不接受。 */
function resolveProvenanceSource (exampleDir, source) {
  if (typeof source !== 'string' || !source.trim()) { return null; }
  if (path.isAbsolute(source) || /^[A-Za-z]:[\\/]/.test(source) || source.split(/[\\/]/).includes('..')) { return null; }
  const roots = [['example', exampleDir], ['examples', path.dirname(exampleDir)], ['repo', path.resolve(__dirname, '..', '..')]];
  for (const [root, base] of roots) {
    const abs = path.join(base, source);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) { return { abs, root }; }
  }
  return null;
}

const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** 逐条核对 validationExpectations 里的出处：文件可定位 ⇒ 行可定位 ⇒ 引文与行号不得互相打脸。
 *  引文在本文件里存在但落在别的行 ⇒ 判漂移（生成器重排过行号就会在这里红，不会静默放行）。 */
function provenanceIssues (exampleDir, spec) {
  const issues = [];
  const fileCache = new Map();
  const linesOf = (abs) => {
    if (!fileCache.has(abs)) { fileCache.set(abs, fs.readFileSync(abs, 'utf8').split(/\r?\n/)); }
    return fileCache.get(abs);
  };
  const seen = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (!v || typeof v !== 'object') { return; }
    if (typeof v.source === 'string') {
      const hit = resolveProvenanceSource(exampleDir, v.source);
      const key = `${v.source}#${v.line}`;
      if (!hit) {
        if (!seen.has(key)) { seen.add(key); issues.push(`出处无法定位：${squash(v.source) || '(空 source)'}`); }
      } else if (v.line !== undefined) {
        const n = Number(v.line);
        const text = squash(linesOf(hit.abs)[n - 1] || '');
        if (!Number.isInteger(n) || n < 1 || !text) {
          if (!seen.has(key)) { seen.add(key); issues.push(`出处行不存在：${v.source}:L${v.line}`); }
        } else if (/^(\/\/|\*|\/\*)/.test(text)) {
          if (!seen.has(key)) { seen.add(key); issues.push(`出处指向注释行：${v.source}:L${v.line}`); }
        } else if (typeof v.text === 'string' && v.text.length >= 16) {
          const quote = squash(v.text);
          if (quote !== text && !text.startsWith(quote)) {
            const at = linesOf(hit.abs).findIndex((l) => squash(l).includes(quote));
            if (at >= 0 && at + 1 !== n) {
              if (!seen.has(key)) { seen.add(key); issues.push(`出处行号与引文不符：${v.source} 引文实际在 L${at + 1}，出处写 L${n}`); }
            }
          }
        }
      }
    }
    for (const child of Object.values(v)) { walk(child); }
  };
  walk((spec || {}).validationExpectations);
  return issues;
}

/** 豁免是否"有出处"：必须给 reason + 源码行，且该行确实体现派生计算（frameObject/循环/tween/update…）。
 *  没有出处的豁免等于把弱检查换个别名，不接受。 */
function groundingVerdict (exampleDir, excl) {
  if (!excl || typeof excl.reason !== 'string' || excl.reason.trim().length < 12) { return 'exclusion has no reason (≥12 chars describing the derivation path)'; }
  const m = /^L(\d+)$/.exec(String(excl.line || ''));
  if (!m) { return 'exclusion has no line (e.g. "L63")'; }
  const src = entrySourceOf(exampleDir);
  if (!src) { return 'example has no entry source to cite'; }
  const text = (fs.readFileSync(src, 'utf8').split(/\r?\n/)[Number(m[1]) - 1] || '').trim();
  if (!text || /^(\/\/|\*|\/\*)/.test(text)) { return `L${m[1]} is not a code line`; }
  if (!/frameObject|lookAt|tween|update|\bfor\s*\(|\bwhile\s*\(|Math\.|=>|\.set/.test(text)) { return `L${m[1]} shows no derivation (${text.slice(0, 50)})`; }
  return true;
}

/** 覆盖合同：validator 一经声明，作用域内每个节点都要有期望值或有出处的豁免。
 *  transform-equals 作用域 = expectedGraph 全部节点；
 *  material-property 作用域 = 读回带 renderer 材质的节点（相机/灯天然无材质，自动不适用）。
 *  没有本合同，"2/5 节点通过"就能给整个 validator 发绿。 */
function evalCoverage (exampleDir, key, spec, scopeNodes, exp) {
  const excl = ((spec.expectationExclusions || {})[key]) || {};
  const authored = new Set(Object.keys(exp || {}));
  const missing = []; const bad = [];
  for (const node of scopeNodes) {
    if (authored.has(node)) { continue; }
    const e = excl[node];
    if (!e) { missing.push(node); continue; }
    const verdict = groundingVerdict(exampleDir, e);
    if (verdict !== true) { bad.push(`${node}: ${verdict}`); }
  }
  const ok = missing.length === 0 && bad.length === 0 && !(authored.size === 0 && scopeNodes.length > 0);
  let detail;
  if (authored.size === 0 && scopeNodes.length > 0) {
    detail = `vacuous: every in-scope node is excluded, nothing is asserted (${scopeNodes.length} nodes)`;
  } else if (ok) {
    detail = `coverage ${authored.size}/${scopeNodes.length} nodes authored${Object.keys(excl).length ? ` + ${Object.keys(excl).length} grounded exclusions` : ''}`;
  } else {
    detail = `uncovered: ${missing.join(',') || '—'}${bad.length ? '; bad exclusions: ' + bad.join(' | ') : ''}`;
  }
  return { ok, detail, missing };
}

/** asset-loaded 覆盖：spec.assets ∪ 源码字面量路径都要进期望或有豁免。 */
function evalAssetCoverage (exampleDir, key, spec, exp) {
  const declared = (spec.assets || []).map((a) => String(a.path || a).replace(/^\.?\//, ''));
  const authored = new Set(((exp && exp.paths) || []).map((p) => String(p.path || p).replace(/^\.?\//, '')));
  const excl = ((spec.expectationExclusions || {})[key]) || {};
  const missing = []; const bad = [];
  for (const rel of declared) {
    if (authored.has(rel)) { continue; }
    const e = excl[rel];
    if (!e) { missing.push(rel); continue; }
    const verdict = groundingVerdict(exampleDir, e);
    if (verdict !== true) { bad.push(`${rel}: ${verdict}`); }
  }
  const ok = missing.length === 0 && bad.length === 0;
  return { ok, detail: ok ? `${authored.size} asset paths proven fetched` : `assets without fetch evidence: ${missing.join(',') || '—'}${bad.length ? '; bad exclusions: ' + bad.join(' | ') : ''}` };
}

module.exports = {
  nearlyAxis, compareColorProperty, declared, needsSecondSample,
  evalAssetLoaded, evalMaterialProperty, evalTransformEquals, evalCoverage, evalAssetCoverage, groundingVerdict,
  materialPropNames, provenanceIssues, resolveProvenanceSource,
  BLOCKING_DIAGNOSTICS, TRANSFORM_KEYS,
};
