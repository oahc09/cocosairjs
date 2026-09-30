/* V1.1 F2 — API Coverage Report（逐 API 执行证明，不再由示例级 PASS 推导）。
 *
 * 覆盖语义（§12/§25，总审查 item 1 修正）：
 *   claimed   — example.json 的 api.claims 与 inventory 精确匹配（仅声明，零执行证据）
 *   attested  — 当期证据显示该 API 真被执行（trace state=executed），但没有一条仍成立的
 *               证据行把它绑到通过的 validator 上；或不可插桩的别名/数据成员。
 *   verified  — 逐 API 执行证明：example 在 v11-examples-verified.json / v11-devtools-examples.json
 *               中 result=PASS，且证据里该 API 的 apiProof[].proof === 'verified'
 *               （= 运行期被 trace 计到调用次数 ∧ 至少一条 validator PASS ∧ 该 validator 的
 *                 证据行仍能在当前源码里找到该 API token）。
 *               verified 再按观察通道拆分披露：call=被当作函数/构造器执行，read=只观察到顶层
 *               导出的成员读取（命名空间用法），unknown=证据未记录通道。引用 verified 比例时
 *               必须同时给出该拆分，不得把 read 说成"调用执行"。
 *
 *   示例级 PASS 本身不再产生 verified：证据必须携带 mode/spec + source + candidate 指纹与
 *   apiProof 明细；缺任一项 → 该示例的全部 claims 只算 claimed，并列入 evidenceSchemaGaps。
 *
 * 指纹绑定（防陈旧证据冒充，三种失配都要检）：
 *   specFingerprint      — example.json（不含 status/promotion/stableReview）
 *   sourceFingerprint    — example.json + index.html + src/main.* + assets/**
 *   candidateFingerprint — build/cocosair.module.js + .d.ts + examples/shared
 *   源码/引擎改动都会使既有 verified 失效，这是"改动不影响结论"这类说法的反例控制。
 *
 * verified 门禁（§25 增补 + 总审查 item 4 分母修正）：
 *   分母 = inventory 中 coverageRequired=true 的同 tier 单元。库存修订后
 *   Core / Important / Advanced 均须有非空分母，Supporting/Internal 不入门禁。
 *   Core 100% / Important ≥90% / Advanced ≥80%（在其 own required 分母上）。
 * 门禁未达标如实输出 FAIL 并以非零退出码阻断。
 *
 * 执行：node tools/examples/coverage-report.cjs
 * 产出：docs/api-coverage-report.json
 */
var fs = require('fs');
var path = require('path');
var REPO = path.resolve(__dirname, '..', '..');
var specCommon = require(path.join(REPO, 'tools', 'verify', 'example-spec-common.cjs'));
var apiTrace = require(path.join(REPO, 'tools', 'verify', 'api-trace.cjs'));
var INVENTORY_PATH = path.join(REPO, 'docs', 'example-api-inventory.json');
var MANIFEST_PATH = path.join(REPO, 'examples', 'files.json');
var EVIDENCE_PATHS = [
  'docs/evidence/v11-examples-verified.json',
  'docs/evidence/v11-devtools-examples.json',
];
var OUT_PATH = path.join(REPO, 'docs', 'api-coverage-report.json');
var CHECK_ONLY = process.argv.includes('--check');

(function main() {
  var inventory = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
  var manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  // 分母自身的完整性：inventory 是 coverage 的分母来源，若它的汇总字段与 units 不一致
  // （或 units 被人手删改而与派生的 tierSummary 脱钩），所有比例都失去意义 ⇒ 直接 FAIL。
  var inventoryInconsistencies = [];
  var unitCount = Object.keys(inventory.units || {}).length;
  if (inventory.totalUnits !== unitCount) {
    inventoryInconsistencies.push('totalUnits=' + inventory.totalUnits + ' != units ' + unitCount);
  }
  for (var tk in inventory.tierSummary || {}) {
    var actual = Object.keys(inventory.units || {}).filter(function (u) { return inventory.units[u].tier === tk; }).length;
    if (inventory.tierSummary[tk] !== actual) { inventoryInconsistencies.push('tierSummary.' + tk + '=' + inventory.tierSummary[tk] + ' != ' + actual); }
  }
  var actualRequired = Object.keys(inventory.units || {}).filter(function (u) { return inventory.units[u].coverageRequired; }).length;
  if (inventory.coverageRequiredUnits !== actualRequired) {
    inventoryInconsistencies.push('coverageRequiredUnits=' + inventory.coverageRequiredUnits + ' != ' + actualRequired);
  }
  var inventoryFingerprint = apiTrace.sha16(fs.readFileSync(INVENTORY_PATH));

  // 运行验证结果：exampleId -> evidence row（后到的来源不覆盖已有 PASS 记录）
  var runById = {};
  var sources = [];
  for (var rel of EVIDENCE_PATHS) {
    var abs = path.join(REPO, rel);
    // F-72：只有 completed:true 的证据代表"一次跑完的当期测量"。缺标记（被 kill 的进度快照、
    // 旧版产线）整份按 NOT_RUN 处理，不得让半成品里的 FAIL/PASS 行冒充结论。
    var ev = specCommon.readEvidence(abs);
    if (ev.status !== 'COMPLETE') {
      sources.push({ path: rel, present: !!ev.data, status: 'NOT_RUN', reason: ev.reason,
        measuredAt: ev.data && ev.data.measuredAt || null, mode: (ev.data && (ev.data.mode || ev.data.contract)) || 'unknown' });
      continue;
    }
    var evidence = ev.data;
    sources.push({ path: rel, present: true, status: 'COMPLETE', measuredAt: evidence.measuredAt || null, mode: evidence.mode || evidence.contract || 'unknown' });
    for (var r of evidence.results || evidence.examples || []) {
      if (!r || !r.id) { continue; }
      var prev = runById[r.id];
      if (prev && prev.result === 'PASS') { continue; }
      runById[r.id] = r;
    }
  }

  var currentCandidate = apiTrace.candidateFingerprint();

  // 构建冻结清单（分 tier）
  var frozen = {};
  var units = inventory.units || {};
  for (var fq in units) {
    frozen[fq] = { tier: units[fq].tier, coverageRequired: units[fq].coverageRequired, kind: units[fq].kind,
      coverageStatus: units[fq].coverageStatus, coverageReason: units[fq].coverageReason };
  }

  // claimed / attested / verified 覆盖映射（逐 API）
  var claimedBy = {};
  var attestedBy = {};
  var verifiedBy = {};
  // verified 的观察通道拆分（总审查 item 1 的残留披露）：call = 真的被调用/构造，
  // read = 只观察到顶层导出的成员读取（Layers.Enum.DEFAULT 这类命名空间用法）。
  // 两者都算执行过，但强度不同；引用 verified 比例时必须同时给出该拆分。
  var verifiedVia = {};
  var staleEvidence = [];
  var evidenceSchemaGaps = [];
  var unmatchedClaims = [];
  var perExampleProof = [];
  for (var ex of manifest.examples) {
    var claims = (ex.api && ex.api.claims) || ex.apiClaims || [];
    var run = runById[ex.id];
    var exampleDir = path.join(REPO, 'examples', ex.dir);
    var binding = {
      spec: !!run && run.specFingerprint === specCommon.readFingerprint(ex.dir),
      source: !!run && !!run.sourceFingerprint && run.sourceFingerprint === apiTrace.sourceFingerprint(exampleDir),
      candidate: !!run && !!run.candidateFingerprint && run.candidateFingerprint === currentCandidate,
    };
    var pass = !!run && run.result === 'PASS';
    // A DOM-only catalog makes no engine API claims: an explicit empty proof
    // array is a valid schema, not missing evidence. It adds no verified units.
    var hasApiProof = !!run && Array.isArray(run.apiProof)
      && (run.apiProof.length > 0 || (claims.length === 0 && ex.bench && ex.bench.mode === 'ui-shell'));
    var fresh = pass && binding.spec && binding.source && binding.candidate && hasApiProof;
    if (run && pass && (!binding.spec || !binding.source || !binding.candidate)) { staleEvidence.push(ex.id); }
    if (run && pass && !hasApiProof) { evidenceSchemaGaps.push({ id: ex.id, reason: 'evidence row has no apiProof[] (pre-v3 schema): claims cannot be counted as verified' }); }
    var proofById = {};
    if (hasApiProof) {
      for (var p of run.apiProof) { if (p && p.api) { proofById[p.api] = p; } }
    }
    var tally = { verified: 0, attested: 0, claimedOnly: 0, verifiedCall: 0, verifiedRead: 0 };
    for (var claim of claims) {
      if (!frozen[claim]) {
        // 结构门禁允许 DevToolsSession.* 这类清单外单元；coverage 必须显式披露而不是静默丢弃，
        // 否则"示例声明的 API"与"进入分母的 API"两套口径悄悄不一致。
        if (unmatchedClaims.indexOf(claim) < 0) { unmatchedClaims.push(claim); }
        continue;
      }
      if (!claimedBy[claim]) { claimedBy[claim] = []; }
      claimedBy[claim].push(ex.id);
      var pr = fresh ? proofById[claim] : null;
      if (pr && pr.proof === 'verified') {
        (verifiedBy[claim] = verifiedBy[claim] || []).push(ex.id);
        tally.verified++;
        var via = pr.via === 'read' ? 'read' : (pr.via === 'call' ? 'call' : 'unknown');
        if (via === 'call') { tally.verifiedCall++; } else if (via === 'read') { tally.verifiedRead++; }
        if (verifiedVia[claim] !== 'call') { verifiedVia[claim] = via; }
      } else if (pr && pr.proof === 'attested') {
        (attestedBy[claim] = attestedBy[claim] || []).push(ex.id);
        tally.attested++;
      } else { tally.claimedOnly++; }
    }
    perExampleProof.push({ id: ex.id, result: run ? run.result : 'no-evidence', fresh: fresh, binding: binding,
      hasApiProof: hasApiProof, instrumentation: run && run.instrumentation ? { observed: run.instrumentation.observed, total: run.instrumentation.total, hash: run.instrumentation.hash } : null,
      claims: claims.length, tally: tally });
  }

  function rate (n, total) { return total ? Math.round((n / total) * 1000) / 1000 : 0; }
  // Release acceptance uses the V1.1 taskbook targets. The historical r48
  // regression floors remain documented, but cannot grant a release PASS.
  var GATES = {
    core: { label: 'V1.1 Release: 100% verified of coverageRequired', threshold: 1 },
    important: { label: 'V1.1 Release: >=90% verified of coverageRequired', threshold: 0.9 },
    advanced: { label: 'V1.1 Release: >=80% verified of coverageRequired', threshold: 0.8 },
  };

  // 分层统计：required 分母（coverageRequired=true）用于门禁，全量分母仅用于披露
  var tiers = {};
  for (var fq2 in frozen) {
    var tier = frozen[fq2].tier;
    if (!tiers[tier]) { tiers[tier] = { total: 0, required: 0, claimed: 0, attested: 0, verified: 0, requiredClaimed: 0, requiredVerified: 0, verifiedViaCall: 0, verifiedViaRead: 0, verifiedViaUnknown: 0, requiredVerifiedViaCall: 0, requiredVerifiedViaRead: 0, requiredVerifiedViaUnknown: 0 }; }
    var t = tiers[tier];
    t.total++;
    if (frozen[fq2].coverageRequired) { t.required++; }
    if (claimedBy[fq2]) { t.claimed++; if (frozen[fq2].coverageRequired) { t.requiredClaimed++; } }
    if (attestedBy[fq2] && !verifiedBy[fq2]) { t.attested++; }
    if (verifiedBy[fq2]) {
      t.verified++;
      var channel = verifiedVia[fq2] === 'read' ? 'read' : (verifiedVia[fq2] === 'unknown' ? 'unknown' : 'call');
      t['verifiedVia' + channel[0].toUpperCase() + channel.slice(1)]++;
      if (frozen[fq2].coverageRequired) {
        t.requiredVerified++;
        t['requiredVerifiedVia' + channel[0].toUpperCase() + channel.slice(1)]++;
      }
    }
  }

  var tierReport = {};
  for (var name of ['core', 'important', 'advanced']) {
    var s = tiers[name] || { total: 0, required: 0, claimed: 0, attested: 0, verified: 0, requiredClaimed: 0, requiredVerified: 0, verifiedViaCall: 0, verifiedViaRead: 0, verifiedViaUnknown: 0, requiredVerifiedViaCall: 0, requiredVerifiedViaRead: 0, requiredVerifiedViaUnknown: 0 };
    var vr = rate(s.requiredVerified, s.required);
    var requiredNames = Object.keys(frozen).filter(function (u) { return frozen[u].tier === name && frozen[u].coverageRequired; });
    var documentedOnly = requiredNames.filter(function (u) { return !verifiedBy[u] && frozen[u].coverageStatus === 'documented-only'
      && typeof frozen[u].coverageReason === 'string' && frozen[u].coverageReason.trim(); }).length;
    var unstated = requiredNames.filter(function (u) { return !verifiedBy[u] && !frozen[u].coverageStatus; }).length;
    tierReport[name] = {
      denominator: 'coverageRequired',
      total: s.total, required: s.required,
      claimed: s.claimed, attested: s.attested, verified: s.verified,
      requiredClaimed: s.requiredClaimed, requiredVerified: s.requiredVerified,
      documentedOnly: documentedOnly, documentedOnlyRate: rate(documentedOnly, s.required),
      uncovered: s.required - s.requiredVerified - documentedOnly, unstated: unstated,
      // verified 的观察通道拆分：只有 call 是"该 API 被当作函数/构造器执行过"的直接证据。
      verifiedViaCall: s.verifiedViaCall, verifiedViaRead: s.verifiedViaRead, verifiedViaUnknown: s.verifiedViaUnknown,
      requiredVerifiedViaCall: s.requiredVerifiedViaCall, requiredVerifiedViaRead: s.requiredVerifiedViaRead, requiredVerifiedViaUnknown: s.requiredVerifiedViaUnknown,
      requiredVerifiedViaCallRate: rate(s.requiredVerifiedViaCall, s.required),
      claimedRate: rate(s.requiredClaimed, s.required), verifiedRate: vr,
      allUnitsVerifiedRate: rate(s.verified, s.total),
      gate: GATES[name].label, threshold: GATES[name].threshold,
      // required=0 表示该 tier 不进入覆盖义务（如 Advanced 全部可选），门禁不适用而非"通过"
      applicable: s.required > 0,
      pass: s.required > 0 && vr >= GATES[name].threshold,
    };
  }

  var report = {
    generatedAt: new Date().toISOString(),
    evidenceSources: sources,
    semantics: {
      claimed: 'api.claims 与 inventory 精确匹配（仅声明，零执行证据）',
      attested: '当期证据显示 API 被执行（trace executed），但没有仍成立的 validator 绑定；或不可插桩的别名/数据成员',
      verified: '逐 API 执行证明：当期 PASS 证据（spec+source+candidate 指纹一致）中该 API 的 apiProof.proof === "verified"',
      verifiedChannels: 'verified 再按观察通道拆分：call=被当作函数/构造器执行；read=仅观察到顶层导出的成员读取（命名空间用法）；unknown=证据行未记录通道。门禁数字含 read，引用时必须一并给出 call/read 拆分',
      denominator: '门禁分母 = docs/example-api-inventory.json 的 coverageRequired=true 单元；required=0 的 tier 记 NOT_APPLICABLE',
    },
    candidateFingerprint: currentCandidate,
    // 比例必须绑定分母身份：inventory 重新生成（增删单元/改 tier）会让同名指标含义变化，
    // 没有这个哈希就无法判断报告数字对应的是哪一版分母。
    inventoryFingerprint: inventoryFingerprint,
    apiInventoryRevision: inventory.apiInventoryRevision || null,
    inventoryConsistency: inventoryInconsistencies,
    totalUnits: Object.keys(frozen).length,
    totalRequired: Object.keys(frozen).filter(function (u) { return frozen[u].coverageRequired; }).length,
    totalClaimed: Object.keys(claimedBy).length,
    totalAttested: Object.keys(attestedBy).filter(function (u) { return !verifiedBy[u]; }).length,
    totalVerified: Object.keys(verifiedBy).length,
    totalVerifiedViaCall: Object.keys(verifiedBy).filter(function (u) { return verifiedVia[u] === 'call'; }).length,
    totalVerifiedViaRead: Object.keys(verifiedBy).filter(function (u) { return verifiedVia[u] === 'read'; }).length,
    totalVerifiedViaUnknown: Object.keys(verifiedBy).filter(function (u) { return !verifiedVia[u] || verifiedVia[u] === 'unknown'; }).length,
    staleEvidenceExamples: staleEvidence,
    // 声明了但不属于冻结清单的 API（DevToolsSession.* 等）：不进任何分子/分母，仅披露。
    claimsNotInInventory: unmatchedClaims,
    evidenceSchemaGaps: evidenceSchemaGaps,
    examples: perExampleProof,
    tiers: tierReport,
    verifiedList: Object.keys(verifiedBy).map(function (u) { return { unit: u, tier: frozen[u].tier, via: verifiedVia[u] || null, examples: verifiedBy[u] }; }),
    attestedNotVerified: Object.keys(attestedBy).filter(function (u) { return !verifiedBy[u]; }).map(function (u) { return { unit: u, tier: frozen[u].tier, examples: attestedBy[u] }; }),
    claimedNotVerified: Object.keys(claimedBy).filter(function (u) { return !verifiedBy[u]; }).map(function (u) { return { unit: u, tier: frozen[u].tier, examples: claimedBy[u] }; }),
    unclaimedCore: Object.keys(frozen).filter(function (u) { return frozen[u].tier === 'core' && !claimedBy[u]; }),
    unclaimedRequired: Object.keys(frozen).filter(function (u) { return frozen[u].coverageRequired && !claimedBy[u]; }).length,
  };

  var reportMatches = true;
  if (CHECK_ONLY) {
    var existing = fs.existsSync(OUT_PATH) ? JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')) : null;
    var comparable = function (value) { var copy = Object.assign({}, value); delete copy.generatedAt; return JSON.stringify(copy); };
    reportMatches = !!existing && comparable(existing) === comparable(report);
    if (!reportMatches) console.error('[coverage] FAIL checked-in report differs from current inventory, specs or evidence');
  } else {
    fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + '\n');
  }
  for (var t2 of ['core', 'important', 'advanced']) {
    var tr = tierReport[t2];
    console.log('[coverage] ' + t2 + ': required ' + tr.required + '/' + tr.total + ' | claimed ' + tr.requiredClaimed
      + ' | verified ' + tr.requiredVerified + ' (' + tr.verifiedRate + ')'
      + ' [call ' + tr.requiredVerifiedViaCall + ' / read ' + tr.requiredVerifiedViaRead + ' / unknown ' + tr.requiredVerifiedViaUnknown + ']'
      + ' | attested(all-units) ' + tr.attested);
  }
  for (var t3 of ['core', 'important', 'advanced']) {
    var g = tierReport[t3];
    console.log('[coverage] ' + t3 + ' gate (' + GATES[t3].label + '): ' + (g.applicable ? (g.pass ? 'PASS' : 'FAIL') : 'NOT_APPLICABLE'));
  }
  if (staleEvidence.length) { console.log('[coverage] stale evidence (source/candidate/spec changed after run): ' + staleEvidence.length + ' → ' + staleEvidence.join(',')); }
  if (inventoryInconsistencies.length) {
    console.log('[coverage] inventory 自相矛盾（分母不可信，比例全部作废）: ' + inventoryInconsistencies.join(' | '));
  }
  console.log('[coverage] inventory fingerprint: ' + inventoryFingerprint);
  if (evidenceSchemaGaps.length) { console.log('[coverage] evidence without apiProof (counted as claimed only): ' + evidenceSchemaGaps.length); }
  console.log('[coverage] ' + (CHECK_ONLY ? 'checked ' : 'wrote ') + path.relative(REPO, OUT_PATH));
  var gatesPass = reportMatches && inventoryInconsistencies.length === 0
    && staleEvidence.length === 0 && evidenceSchemaGaps.length === 0
    && ['core', 'important', 'advanced'].every(function (n) { return tierReport[n].applicable && tierReport[n].pass; })
    && tierReport.important.unstated === 0
    && tierReport.advanced.documentedOnlyRate <= 0.2 && tierReport.advanced.uncovered === 0;
  process.exitCode = gatesPass ? 0 : 1;
  console.log('[coverage] gate:', gatesPass ? 'PASS' : 'FAIL'
    + ' (V1.1 Release: core=100% important>=90% advanced>=80%;'
    + ' tier pass=' + ['core', 'important', 'advanced'].map(function (n) { return n + ':' + tierReport[n].pass; }).join(',') + ')');
})();
