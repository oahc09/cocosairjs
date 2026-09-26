/* V1.1 — Example Specification 符合性核查（对照《Example Specification 补充执行规范》§1-§25）。
 *
 * 与 spec-validate.cjs 的分工：
 *   spec-validate = 结构门禁（字段存在性 / API 精确绑定 / 行号漂移），决定 specStatus frozen；
 *   本工具        = 证据链门禁（§9 Ready 是否空转、§10 functional 是否实质定义、§11 Stable
 *                   公式的 Screenshot / License / API Evidence 三项、§12 evidence↔validator
 *                   闭环、§19-§23 Gallery 与 Manifest 一致性），回答"规范是否真的被执行"。
 * 只报告、不改写：每条 finding 带规则号（含 § 条款）与示例 id，可定位复核。
 *
 * 执行：node tools/examples/spec-compliance-audit.cjs [--warn-ok]
 *   默认任何 severity=fail 使退出码为 1；--warn-ok 仅报告不失败。
 * 产出：docs/evidence/v11-spec-compliance.json
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..', '..');
const EXAMPLES_DIR = path.join(REPO, 'examples');
const OUT_PATH = path.join(REPO, 'docs', 'evidence', 'v11-spec-compliance.json');
const { specFingerprintOf, listAssetTree, readEvidence } = require(path.join(REPO, 'tools', 'verify', 'v11-spec-common.cjs'));
const { findSymbolLine } = require(path.join(__dirname, 'spec-evidence.cjs'));

const EVIDENCE_FILES = ['docs/evidence/v11-examples-verified.json', 'docs/evidence/v11-devtools-examples.json'];
const DEVTOOLS_UNITS = new Set([
  'DevToolsSession.inspectScene', 'DevToolsSession.inspectNode', 'DevToolsSession.inspectAsset',
  'DevToolsSession.dispatch', 'DevToolsSession.captureFrame', 'DevToolsSession.getRuntimeErrors',
]);
// §19-§22 Gallery 展示所需的 Manifest 字段（§23 允许外溢的最小集）
const MANIFEST_ALLOWED = new Set(['dir', 'id', 'version', 'title', 'category', 'status', 'specStatus', 'requiresDevTools',
  'learning', 'effect', 'api', 'capabilities', 'scene', 'interaction', 'ready', 'validation', 'promotion', 'bench', 'screenshot']);
// §10/§25：仅证明"跑起来没报错"的 validator 不算实质性功能验证
const TRIVIAL = new Set(['scene-ready', 'no-runtime-error', 'node-count']);

function readJson (abs) { return JSON.parse(fs.readFileSync(abs, 'utf8')); }

/** 交付自带的出处清单：assets/SHA256.json（{file,sha256}）与 assets/**\/manifest.json
 *  （{name,file,revision,url,sha256,bytes}）→ { '<rel from exampleDir>': { sha256, bytes } }。
 *  每示例只读一次；坏 JSON 或结构不合返回空表（缺出处不是 fail，出处对不上才是）。 */
const upstreamCache = new Map();
const UPSTREAM_FILES = /(^|\/)(SHA256|manifest)\.json$/;
function upstreamManifest (exampleDir) {
  if (upstreamCache.has(exampleDir)) { return upstreamCache.get(exampleDir); }
  const map = {};
  try {
    for (const rel of listAssetTree(exampleDir)) {
      if (!UPSTREAM_FILES.test(rel)) { continue; }
      const entries = readJson(path.join(exampleDir, rel));
      if (!Array.isArray(entries)) { continue; }
      const base = path.posix.dirname(rel);
      for (const e of entries) {
        if (!e || !e.file || !e.sha256) { continue; }
        map[(base === '.' ? '' : base + '/') + String(e.file).replace(/\\/g, '/')] = { sha256: String(e.sha256).toLowerCase(), bytes: e.bytes };
      }
    }
  } catch (err) { /* 出处清单不可用：本示例不启用出处核对 */ }
  upstreamCache.set(exampleDir, map);
  return map;
}

function upstreamDigest (exampleDir, rel) {
  return upstreamManifest(exampleDir)[rel] || null;
}

/** 收集两份门禁的当期证据（按示例类型选用）：requiresDevTools 走 DevTools 会话门禁，
 *  其余走浏览器矩阵；取不到对应门禁时退回另一份（指纹核对仍会揭穿失配）。 */
function loadRuns (globalFindings) {
  const byId = {};
  const sourceKind = (rel) => (rel.indexOf('devtools') >= 0 ? 'devtools' : 'browser');
  for (const rel of EVIDENCE_FILES) {
    const abs = path.join(REPO, rel);
    // F-72：证据必须是 completed:true 的整轮测量。半成品（被 kill 的进度快照、旧版产线）
    // 整份按 NOT_RUN 处理，行不得被采纳，同时在全局发现里点名，避免"批量缺证据"被误读成"批量失败"。
    const ev = readEvidence(abs);
    if (ev.status !== 'COMPLETE') {
      if (globalFindings) {
        globalFindings.push({ rule: 'S11-EVIDENCE-NOT-RUN', severity: 'fail',
          detail: `§11：${rel} 非当期完整测量（${ev.reason}）→ 整份按 NOT_RUN 处理，需重跑对应门禁` });
      }
      continue;
    }
    for (const r of ev.data.results || []) {
      (byId[r.id] = byId[r.id] || []).push(Object.assign({ source: rel, kind: sourceKind(rel) }, r));
    }
  }
  return byId;
}

function runFor (spec, runs) {
  const all = runs[spec.id] || [];
  if (all.length === 0) { return undefined; }
  const wantKind = spec.requiresDevTools ? 'devtools' : 'browser';
  const matched = all.filter((r) => r.kind === wantKind);
  const pool = matched.length ? matched : all;
  return pool.find((r) => r.result === 'PASS') || pool[0];
}

/** 收集示例目录内的源码文件（含相对路径与行数组），供实现级静态检查复用。 */
function collectSources (absDir, rootForRel) {
  const out = [];
  const walk = (abs) => {
    for (const item of fs.readdirSync(abs, { withFileTypes: true })) {
      if (item.name === 'node_modules') { continue; }
      const full = path.join(abs, item.name);
      if (item.isDirectory()) { walk(full); } else if (/\.(ts|js)$/.test(item.name)) {
        const code = fs.readFileSync(full, 'utf8');
        out.push({ file: full, rel: path.relative(rootForRel, full), lines: code.split(/\r?\n/) });
      }
    }
  };
  walk(absDir);
  return out;
}

function auditExample (dir, spec, ctx) {
  const findings = [];
  const add = (rule, severity, detail) => findings.push({ rule, severity, detail });
  const exampleDir = path.join(EXAMPLES_DIR, dir);
  const uiShell = spec.bench && spec.bench.mode === 'ui-shell';
  const ready = (spec.ready && spec.ready.validators) || [];
  const validation = spec.validation || {};
  const functional = validation.functional || [];
  const declaredValidators = new Set([...ready, ...functional, ...(validation.interaction || []),
    ...(validation.visual || []), ...(validation.lifecycle || []), ...(validation.capability || [])]);
  const claims = (spec.api && spec.api.claims) || [];
  const evidence = (spec.api && spec.api.evidence) || [];
  const graphNodes = (spec.scene && spec.scene.expectedGraph && spec.scene.expectedGraph.nodes) || [];
  const allowEmpty = !!(spec.scene && spec.scene.expectedGraph && spec.scene.expectedGraph.allowEmpty === true);
  const run = runFor(spec, ctx.runs);
  const isStable = spec.status === 'stable';

  // --- §3 / §14：Exact Public API Binding ---
  if (!uiShell) {
    for (const unit of new Set([...((spec.api && spec.api.primary) || []), ...claims])) {
      if (!ctx.inventory.has(unit) && !DEVTOOLS_UNITS.has(unit)) { add('S3-API-BIND', 'fail', `claim "${unit}" 不在 example-api-inventory（§3/§14 精确绑定）`); }
    }
  }

  // --- §5：1 教学目标 + 1~3 primary API ---
  if (!uiShell) {
    const primary = (spec.api && spec.api.primary) || [];
    if (primary.length < 1 || primary.length > 3) { add('S5-GOAL-SCOPE', 'fail', `api.primary=${primary.length}（§5 要求 1~3）`); }
  }
  if (claims.length > 0 && evidence.length === 0 && !uiShell) { add('S12-EVIDENCE', 'fail', `§12：${claims.length} 条 claim 无一条 api.evidence`); }

  // --- §6：Effect Contract 具体度（functional + visual 均须可判定）---
  const effect = spec.effect || {};
  if (!String(effect.functional || '').trim() || !String(effect.visual || '').trim()) {
    add('S6-EFFECT', 'fail', '§6：effect.functional / effect.visual 必须同时定义');
  } else if (String(effect.visual).trim().length < 16) {
    add('S6-EFFECT', 'warn', `§6：effect.visual 过短，无法据此判定"应该做成什么样"（"${effect.visual}"）`);
  }

  // --- §9：Ready Contract 必须真正等待内容（不得统一 scene-ready 空转）---
  if (ready.length === 0) { add('S9-READY', 'fail', '§9：ready.validators 未定义'); }
  else if (graphNodes.length === 0 && allowEmpty && ready.every((v) => v === 'scene-ready')) {
    add('S9-READY', 'fail', '§9：场景无期望节点且 ready 仅 scene-ready → Ready Contract 空转（等同 DOMContentLoaded 级等待）');
  }

  // --- §10：Validation Contract 至少 ready + functional，且 functional 需有实质断言 ---
  if (functional.length === 0 && !uiShell) { add('S10-VALIDATION', 'fail', '§10：validation.functional 为空（至少 readyValidator + functionalValidators）'); }
  else if (functional.length > 0 && functional.every((v) => TRIVIAL.has(v)) && graphNodes.length === 0 && !uiShell) {
    add('S10-VALIDATION', 'warn', `§10/§25：functional 仅 ${functional.join('/')}，退化为"跑起来没报错"，未验证教学目标行为`);
  }

  // --- §25：资源 Example 的 Lifecycle Contract（DoD 要求 100%）---
  const lifecycle = validation.lifecycle || [];
  const isAssetExample = spec.category === 'gltf' || spec.category === 'asset'
    || claims.some((c) => /Loader|Asset|Texture|decode|release|destroy/i.test(c));
  // 教学前置条件本身不可满足（如 E008 Draco：capability 期望明示 decoder-required/unsupported）
  // 时示例无法持有已解码资产，Lifecycle Contract 无从成立——如实降为 warn 并给原因。
  const expectations = (validation.capabilityExpectations || []);
  const decoderUnavailable = expectations.length > 0
    && expectations.every((e) => !((e.statuses || []).includes('supported')));
  if (isAssetExample && lifecycle.length === 0 && !uiShell) {
    add('S25-LIFECYCLE', decoderUnavailable ? 'warn' : 'fail', decoderUnavailable
      ? `§25：本示例的 capabilityExpectations 明示解码器不可用（${expectations.map((e) => e.extension + '=' + (e.statuses || []).join('|')).join(', ')}），无已解码资产可释放；正向加载路径 BLOCKED，不伪造 Lifecycle Contract`
      : '§25：资源 Example 要求 Lifecycle Contract 100%，本示例 validation.lifecycle 为空（未声明 resource-released / __lifecycle() 合同）');
  }
  if (lifecycle.includes('resource-released')) {
    // 声明必须落到实现：示例自身源码里要安装合同（shared helper 或显式 window.__lifecycle）
    const installed = collectSources(exampleDir, EXAMPLES_DIR)
      .some((s) => s.lines.some((code) => /installAssetLifecycle\s*\(/.test(code) || /__lifecycle\s*=/.test(code)));
    if (!installed) {
      add('S25-LIFECYCLE-IMPL', 'fail', '§25：validation.lifecycle 声明了 resource-released，但示例源码中没有 __lifecycle() 合同安装点');
    }
  }

  // --- 相对 import 必须按真实仓库布局可解析 ---
  // 浏览器矩阵会把示例目录展平到暂存工作区根，展平后恰好可解析的相对路径（如 src/main.ts 里写
  // ../shared/x）在 examples/<dir>/src/ 与 Gallery 部署物里其实 404，属"验证器绿、部署物坏"。
  for (const source of collectSources(exampleDir, EXAMPLES_DIR)) {
    source.lines.forEach((code, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(code)) { return; } // 注释里的示例路径不作判定
      for (const m of code.matchAll(/(?:from|import)\s*\(?\s*['"]((?:\.\.?\/)[^'"]*)['"]/g)) {
        const target = require('../dev/resolve-script.cjs').resolveScript(path.resolve(path.dirname(source.file), m[1]));
        if (!fs.existsSync(target)) {
          add('S-IMPORT-RESOLVE', 'fail', `${source.rel}:L${i + 1} 相对 import "${m[1]}" 在真实仓库布局下不可解析（部署后 404；暂存展平会掩盖它）`);
        }
      }
    });
  }

  // --- §8：Interaction Contract 成对且可执行 ---
  const steps = (spec.interaction && spec.interaction.steps) || [];
  const interactionValidators = validation.interaction || [];
  if ((steps.length > 0) !== (interactionValidators.length > 0)) {
    add('S8-INTERACTION', 'fail', '§8：interaction.steps 与 validation.interaction 必须成对（否则交互无法自动验收）');
  }
  for (const s of steps) {
    if (!s || !String(s.action || '').trim() || !String(s.expected || '').trim()) { add('S8-INTERACTION', 'fail', '§8：interaction.steps 需 {action, expected}'); break; }
  }

  // --- §12：apiEvidence ↔ claim ↔ validator ↔ 源码行 闭环 ---
  if (!uiShell) {
    const claimed = new Set(claims);
    const evidenced = new Set(evidence.map((e) => e.api));
    for (const c of claimed) {
      if (!evidenced.has(c)) { add('S12-CLAIM-ORPHAN', 'fail', `§12：claim "${c}" 无 apiEvidence（apiClaims=声明，apiEvidence+PASS=verified）`); }
    }
    for (const e of evidence) {
      if (!claimed.has(e.api)) { add('S12-EVIDENCE', 'fail', `§12：evidence api "${e.api}" 不在 api.claims`); }
      if (e.validator && !declaredValidators.has(e.validator)) {
        add('S12-VALIDATOR-DETACHED', 'fail', `§12：evidence "${e.api}" 绑定 validator "${e.validator}"，但该 validator 未出现在本示例 ready/validation 声明中 → 永不执行，claim 不能算 verified`);
      }
      const found = findSymbolLine(exampleDir, e.source || '', e.api || '');
      if (!e.source || !e.sourceLocation) { add('S12-LINE', 'fail', `§12：evidence "${e.api}" 缺 source/sourceLocation`); }
      else if (found.error) { add('S12-LINE', 'fail', `§12：evidence "${e.api}" @ ${e.source}:${e.sourceLocation} — ${found.error}`); }
      else if (found.line !== parseInt(String(e.sourceLocation).replace(/^L/, ''), 10)) {
        add('S12-LINE', 'fail', `§12：evidence "${e.api}" @ ${e.source}:${e.sourceLocation} 与实际代码行 L${found.line} 不符（注释/import 或已漂移）`);
      }
    }
  }

  // --- §11：Stable 验收公式（Build/Ready/Functional 证据 + API Evidence + License + Screenshot Current）---
  if (isStable) {
    if (!run) { add('S11-NO-EVIDENCE', 'fail', '§11：status=stable 但两份运行证据中无该示例'); }
    else {
      if (run.result !== 'PASS') { add('S11-NO-EVIDENCE', 'fail', `§11：status=stable 但当期证据 result=${run.result}（${run.source}）`); }
      if (run.specFingerprint !== specFingerprintOf(spec)) {
        add('S11-STALE-EVIDENCE', 'fail', `§11：证据 specFingerprint ${run.specFingerprint} ≠ 当前 example.json ${specFingerprintOf(spec)}（陈旧证据冒充当期通过）`);
      }
      const art = run.artifact || {};
      const pngAbs = art.path ? path.join(REPO, art.path) : null;
      const pngOk = !!pngAbs && fs.existsSync(pngAbs);
      if (!pngOk || !art.bytes) {
        add('S11-SCREENSHOT', 'fail', `§11：Stable 公式要求 Screenshot Current，但 ${art.path || '(无 artifact)'} 当期 bytes=${art.bytes || 0}${pngOk ? '' : '（文件不存在）'}`);
      } else {
        // Screenshot Current 只有在"这张帧就是这次运行产出的那张"时才成立：
        // 存在 + 非零字节不够，必须绑定证据记录的 bytes 与内容哈希（审计 R7f）。
        const png = fs.readFileSync(pngAbs);
        const actualBytes = png.length;
        const actualHash = crypto.createHash('sha256').update(png).digest('hex').slice(0, 16);
        if (actualBytes !== art.bytes) {
          add('S11-SCREENSHOT', 'fail', `§11：${art.path} 实际 ${actualBytes}B ≠ 证据 bytes=${art.bytes}（帧被替换或截断）`);
        } else if (!art.hash) {
          add('S11-SCREENSHOT', 'fail', `§11：${art.path} 的证据 artifact 未记录内容哈希 → 截图本体未绑定，只能验存在；重跑取证工具以记录 hash`);
        } else if (actualHash !== art.hash) {
          add('S11-SCREENSHOT', 'fail', `§11：${art.path} 内容哈希 ${actualHash} ≠ 证据 hash=${art.hash}（旧帧/伪造帧冒充当期画面）`);
        }
      }
    }
    // §11 v3：stable 的"Verified revision"必须是三元组（spec+source+candidate）且逐字等于当期证据。
    // 旧 promotionEvidence 只记规格指纹（示例级 PASS 即写），正是总审查 item 1 要拆掉的口径，
    // 因此它不再能作为晋级依据；同时校验 verified+attested===units 且 unproven===0（§11 公式）。
    const promo = spec.promotion;
    if (isStable) {
      if (!promo) {
        add('S11-PROMOTION-DRIFT', 'fail', '§11：status=stable 但缺 v3 promotion 三元组（promotionEvidence 口径已废弃，不得再作盖章依据）');
      } else if (!run) {
        add('S11-PROMOTION-DRIFT', 'fail', '§11：status=stable 但当期没有任何运行证据行可对照 promotion 三元组');
      } else {
        const drift = [];
        if (promo.spec !== run.specFingerprint) { drift.push(`spec ${promo.spec}≠${run.specFingerprint}`); }
        if (promo.source !== run.sourceFingerprint) { drift.push(`source ${promo.source}≠${run.sourceFingerprint}`); }
        if (promo.candidate !== run.candidateFingerprint) { drift.push(`candidate ${promo.candidate}≠${run.candidateFingerprint}`); }
        if (!(promo.units > 0) || promo.verified + promo.attested !== promo.units) {
          drift.push(`逐 API 证明不完整 verified=${promo.verified} attested=${promo.attested} units=${promo.units}`);
        }
        if (drift.length) { add('S11-PROMOTION-DRIFT', 'fail', `§11：promotion 与当期证据不符 → ${drift.join('；')}`); }
      }
    }
    if (spec.promotionEvidence && run && spec.promotionEvidence !== run.specFingerprint) {
      add('S11-PROMOTION-DRIFT', 'fail', `§11：promotionEvidence ${spec.promotionEvidence} ≠ 当期证据指纹 ${run.specFingerprint}`);
    }
    const license = String((spec.license && (spec.license.assets || spec.license.source)) || '').trim();
    if (!license) { add('S11-LICENSE', 'fail', '§11：License PASS 要求 license 声明资产/来源许可'); }
  }

  // --- 资产内容绑定（§15 Assets complete + 审计 R7g）：存在 / 非零 / 与当期证据 bytes+hash 一致 ---
  // 范围 = spec.assets 声明 ∪ assets/ 目录实际文件。声明清单本身就是可漏项：
  // .gltf 的 .bin 边车、gltf-viewer 的整批 .glb 都可能在清单外，只绑声明路径时
  // 把它们截成 0 字节或换成垃圾，离线门禁依旧 0 fail（副本实测 E1）。
  if (isStable || spec.specStatus === 'frozen') {
    const declaredSet = new Set((spec.assets || []).map((a) => String(a).replace(/\\/g, '/')));
    const digests = (run && run.assetDigests) || [];
    // 磁盘清单与证据清单都要遍历：只在其中一边出现的文件正是漂移所在。
    const targets = new Set(declaredSet);
    for (const rel of listAssetTree(exampleDir)) { targets.add(rel); }
    for (const d of digests) { if (d && d.path) { targets.add(String(d.path).replace(/\\/g, '/')); } }
    for (const rel of [...targets].sort()) {
      const isDeclared = declaredSet.has(rel);
      const rec = digests.find((x) => x && String(x.path).replace(/\\/g, '/') === rel);
      const abs = path.join(exampleDir, rel);
      if (!fs.existsSync(abs)) {
        if (isDeclared) { add('S15-FREEZE', 'fail', `§15：Assets complete 未满足（声明资产缺失 ${rel}）`); }
        else if (rec && rec.present) { add('S15-ASSET-BIND', 'fail', `§15：${rel} 当期证据记录为 ${rec.bytes}B 实存文件，交付目录里已不存在（边车资产被删除）`); }
        continue;
      }
      const bytes = fs.statSync(abs).size;
      if (!bytes) { add(isDeclared ? 'S15-FREEZE' : 'S15-ASSET-ZERO', 'fail', `§15：${rel} 为 0 字节 → Assets complete 未满足${isDeclared ? '' : '（未声明边车，但同属交付资产）'}`); continue; }
      if (!rec || !rec.hash) {
        add('S15-ASSET-BIND', 'fail', `§15：${rel}（${bytes}B，${isDeclared ? '声明资产' : 'assets/ 未声明边车'}）在当期证据中无内容哈希 → 资产被替换/清空时离线不可检（取证工具需记录 assetDigests 并重跑）`);
        continue;
      }
      // 证据自报 0 字节 = 捕获当刻资产就是空的：浏览器合同可能仍然全 PASS
      // （副本实测 NC-E6：gltf-viewer 的 AnimatedMorphCube.glb 截成 0B，7 项 validator 仍绿，
      //  因为它校验的是另一只资产），所以这条只能由离线端断言。
      if (!rec.bytes) { add('S15-ASSET-ZERO', 'fail', `§15：${rel} 当期证据记录为 0 字节（捕获当刻即为空资产）`); continue; }
      const buf = fs.readFileSync(abs);
      const full = crypto.createHash('sha256').update(buf).digest('hex');
      const actual = full.slice(0, 16);
      if (buf.length !== rec.bytes) { add('S15-ASSET-BIND', 'fail', `§15：${rel} 实际 ${buf.length}B ≠ 证据 bytes=${rec.bytes}`); }
      else if (actual !== rec.hash) { add('S15-ASSET-BIND', 'fail', `§15：${rel} 内容哈希 ${actual} ≠ 证据 hash=${rec.hash}（资产内容被替换）`); }
      // 上游出处：证据哈希只能证明"产证之后没被换"，换在产证之前则检不出。
      // 交付里自带的 SHA256.json / official/manifest.json 是可离线核对的出处，按它再比一次。
      const upstream = upstreamDigest(exampleDir, rel);
      if (upstream && full !== upstream.sha256) {
        add('S15-ASSET-PROVENANCE', 'fail', `§15：${rel} 内容哈希 ${full.slice(0, 16)} ≠ 交付自带出处清单记载的 ${upstream.sha256.slice(0, 16)}（资产在产证之前即已被替换，实物与证据一同失真）`);
      }
    }
  }

  // --- §15：frozen 前置（Goal/Effect/API/Scene/Assets/Interaction/Ready/Validators/Visual/Lifecycle/Coverage 全备）---
  if (spec.specStatus === 'frozen') {
    const requiredChecks = [
      ['learning.goal', spec.learning && spec.learning.goal],
      ['effect', spec.effect && spec.effect.visual],
      ['scene.expectedGraph', spec.scene && spec.scene.expectedGraph],
      ['ready.validators', ready.length && ready],
      ['validation', functional.length && functional],
      ['coverage', spec.coverage],
      ['screenshot', spec.screenshot],
      ['license', spec.license],
    ];
    for (const [name, value] of requiredChecks) {
      if (!value) { add('S15-FREEZE', 'fail', `§15：specStatus=frozen 但 ${name} 未完成`); }
    }
  }

  // --- §19-§22 + §23：Manifest 与 Gallery ---
  const entry = ctx.manifestById[spec.id];
  if (!entry) { add('S23-MANIFEST', 'fail', '§23：未出现在 examples/files.json（Gallery 不可见）'); }
  else {
    for (const key of Object.keys(entry)) {
      if (!MANIFEST_ALLOWED.has(key)) { add('S23-MANIFEST', 'warn', `§23：files.json 含非 Gallery 字段 "${key}"`); }
    }
    for (const [field, a, b] of [['status', entry.status, spec.status], ['specStatus', entry.specStatus, spec.specStatus],
      ['promotion', JSON.stringify(entry.promotion), JSON.stringify(spec.promotion)]]) {
      if (a !== b) { add('S23-MANIFEST', 'fail', `§23：files.json 的 ${field}=${a} 与 example.json ${b} 不一致（双份漂移）`); }
    }
    if (uiShell) {
      if (!(spec.bench && spec.bench.uiSelector)) { add('S19-GALLERY', 'fail', '§19-22：ui-shell 示例无 bench.uiSelector，Gallery 校验无从渲染'); }
    } else {
      if (!(entry.learning && entry.learning.points && entry.learning.points.length)) { add('S19-GALLERY', 'fail', '§19：Gallery 需 What you\'ll learn（learning.points 为空）'); }
      if (!((entry.api && entry.api.claims || []).length)) { add('S20-GALLERY', 'fail', '§20：Gallery 需 APIs Used（api.claims 为空）'); }
      if (!(entry.effect && (entry.effect.visual || entry.effect.functional))) { add('S21-GALLERY', 'fail', '§21：Gallery 需 Expected Result'); }
      if (isStable && !entry.promotion) { add('S22-GALLERY', 'fail', '§22：Validation Status 需 Verified revision（Gallery 条目缺 v3 promotion 三元组）'); }
    }
  }
  return findings;
}

function main () {
  const warnOnly = process.argv.includes('--warn-ok');
  const inventory = new Set(Object.keys(readJson(path.join(REPO, 'docs', 'example-api-inventory.json')).units));
  const manifest = readJson(path.join(EXAMPLES_DIR, 'files.json'));
  const manifestById = {};
  for (const e of manifest.examples) { manifestById[e.id] = e; }
  const ctx = { inventory, manifestById };
  const galleryHtml = fs.readFileSync(path.join(EXAMPLES_DIR, 'gallery.html'), 'utf8');
  const globalFindings = [];
  ctx.runs = loadRuns(globalFindings);
  for (const [title, needle] of [[
    '§19 What you\'ll learn', /What you'll learn/,
  ], ['§20 APIs Used', /APIs Used/], ['§21 Expected Result', /Expected Result/], ['§22 Validation Status', /Validation Status/]]) {
    if (!needle.test(galleryHtml)) { globalFindings.push({ rule: 'S19-22-GALLERY', severity: 'fail', detail: `${title} 未在 gallery.html 呈现` }); }
  }

  const dirs = fs.readdirSync(EXAMPLES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'shared' && e.name !== 'node_modules')
    .map((e) => e.name).sort();
  const report = { measuredAt: new Date().toISOString(), tool: 'tools/examples/spec-compliance-audit.cjs', spec: 'ai/Cocos Air V1.1 — Example Specification 补充执行规范.md', total: 0, examples: [], globalFindings };
  for (const dir of dirs) {
    const file = path.join(EXAMPLES_DIR, dir, 'example.json');
    if (!fs.existsSync(file)) { continue; }
    report.total++;
    const spec = readJson(file);
    const findings = auditExample(dir, spec, ctx);
    if (findings.length) { report.examples.push({ id: spec.id || dir, status: spec.status, specStatus: spec.specStatus, findings }); }
  }
  const all = report.examples.reduce((acc, e) => acc.concat(e.findings.map((f) => Object.assign({ example: e.id }, f))), [])
    .concat(globalFindings.map((f) => Object.assign({ example: '(gallery)' }, f)));
  report.summary = {
    examples: report.total,
    withFindings: report.examples.length,
    fail: all.filter((f) => f.severity === 'fail').length,
    warn: all.filter((f) => f.severity === 'warn').length,
    byRule: all.reduce((acc, f) => { acc[f.rule] = (acc[f.rule] || 0) + 1; return acc; }, {}),
    findings: all,
  };
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + '\n');

  for (const f of all) { console.log(`[${f.severity.toUpperCase()}] ${f.example} ${f.rule}: ${f.detail}`); }
  console.log(`[spec-compliance] ${report.summary.examples} examples: ${report.summary.fail} fail / ${report.summary.warn} warn → ${path.relative(REPO, OUT_PATH)}`);
  process.exitCode = !warnOnly && report.summary.fail > 0 ? 1 : 0;
}

main();
