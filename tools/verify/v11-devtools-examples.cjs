/* V1.1 §52/§63 + 补充规范 §13 E012 — DevTools 示例门禁（规格驱动，覆盖全部 requiresDevTools 示例）。
 *
 * 这些示例的教学对象是 V0.5.1 冻结的 DevTools/Agent Session 合同，不是 Runtime Public API
 * Coverage：因此它们不进入普通浏览器矩阵（v11-examples-verify 按 requiresDevTools 跳过），
 * 由本门禁逐项断言合同行为：
 *   attach / inspectScene 结构快照 / inspectNode ID 稳定 / dispatch 写入与稳定错误码 /
 *   captureFrame 受控新帧 / getRuntimeErrors 结构 / 示例页内自检结果 / close 后 SESSION_CLOSED
 *   且业务主循环不受影响。
 * 另含 Runtime 包边界检查：Runtime-only bundle 不得包含 DevTools 会话实现。
 *
 * 执行：NODE_PATH=<playwright> node tools/verify/v11-devtools-examples.cjs [--ids=a,b]
 * 证据：docs/evidence/v11-devtools-examples.json（results 形状与 v11-examples-verified.json 一致，
 *      coverage-report 据此计入 verified）
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const REPO = path.resolve(__dirname, '..', '..');
const esbuild = require(path.join(REPO, 'node_modules', 'esbuild'));
const { BrowserRuntime } = require(path.join(REPO, 'tools', 'benchmark', 'runner', 'browser-runtime.cjs'));
const { specFingerprintOf, promoteFromEvidence, assetDigestsOf } = require(path.join(REPO, 'tools', 'verify', 'v11-spec-common.cjs'));

const EVIDENCE_PATH = path.join(REPO, 'docs', 'evidence', 'v11-devtools-examples.json');
const ARTIFACT_DIR = path.join(REPO, 'docs', 'evidence', 'examples');
const SETTLE_MS = 2000;
const CLEAR_COLOR = [30, 40, 60];

const args = process.argv.slice(2);
const idsArg = args.find((a) => a.startsWith('--ids='));
const targetIds = idsArg ? new Set(idsArg.slice(6).split(',')) : null;

const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'examples', 'files.json'), 'utf8'));
const entries = manifest.examples
  .filter((e) => e.requiresDevTools)
  .filter((e) => !targetIds || targetIds.has(e.id))
  .sort((a, b) => a.id.localeCompare(b.id));

function copyTree (from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) { copyTree(src, dst); } else { fs.copyFileSync(src, dst); }
  }
}

function prepareWorkspace (example, workspace) {
  copyTree(path.join(REPO, 'examples', example.dir), workspace);
  const sharedSrc = path.join(REPO, 'examples', 'shared');
  if (fs.existsSync(path.join(sharedSrc, 'scene-kit.js'))) { copyTree(sharedSrc, path.join(workspace, 'shared')); }
  for (const name of ['main.ts', 'main.js', path.join('src', 'main.ts'), path.join('src', 'main.js')]) {
    const file = path.join(workspace, name);
    if (!fs.existsSync(file)) { continue; }
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/(\.\.\/)shared\//g, './shared/'));
  }
  const htmlPath = path.join(workspace, 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  if (!html.includes('__bench-prelude')) { html = html.replace('</body>', '<script src="/__bench-prelude.js"></script></body>'); }
  fs.writeFileSync(htmlPath, html);
}

function check (id, ok, detail) { return { validatorId: id, state: ok ? 'PASS' : 'FAIL', detail: String(detail || '').slice(0, 200) }; }

function saveArtifact (id, dataUrl) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const png = Buffer.from(String(dataUrl).replace(/^data:image\/png;base64,/, ''), 'base64');
  const rel = `docs/evidence/examples/${id}.png`;
  fs.writeFileSync(path.join(REPO, rel), png);
  return { path: rel, bytes: png.length, hash: crypto.createHash('sha256').update(png).digest('hex').slice(0, 16) };
}

/** Runtime 包边界：DevTools 会话实现不得进入 Runtime-only bundle（§13 验收项）。 */
function checkRuntimeBundleBoundary () {
  const bundle = path.join(REPO, 'build', 'cocosair.module.js');
  if (!fs.existsSync(bundle)) { return check('runtime-bundle-boundary', false, 'build/cocosair.module.js missing'); }
  const text = fs.readFileSync(bundle, 'utf8');
  const leaked = ['createAgentSession', 'agent-session', 'SESSION_CLOSED', 'STALE_TARGET'].filter((token) => text.includes(token));
  return check('runtime-bundle-boundary', leaked.length === 0, leaked.length ? `bundle contains: ${leaked.join(',')}` : 'runtime bundle free of DevTools session implementation');
}

async function verifyOne (example) {
  const spec = JSON.parse(fs.readFileSync(path.join(REPO, 'examples', example.dir, 'example.json'), 'utf8'));
  const sessionUnits = new Set([...(spec.api.primary || []), ...(spec.api.supporting || []), ...(spec.api.claims || [])]
    .filter((u) => String(u).startsWith('DevToolsSession.')));
  const uses = (unit) => sessionUnits.has(`DevToolsSession.${unit}`);
  const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v11-devtools-'));
  const workspace = path.join(workRoot, 'workspace');
  const runtime = new BrowserRuntime({ esbuild, repo: REPO });
  const results = [];
  try {
    prepareWorkspace(example, workspace);
    const channel = await runtime.start({ paths: { workspace } });
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

    const benchError = await runtime.page.evaluate(() => (window.__benchError ? String(window.__benchError).slice(0, 160) : null));
    const attached = await runtime.page.evaluate(() => !!window.__benchSession);
    results.push(check('attach', attached && !benchError, benchError ? `bench prelude failed: ${benchError}` : `__benchSession=${attached}`));

    const graphNodes = (spec.scene && spec.scene.expectedGraph && spec.scene.expectedGraph.nodes) || [];
    const allowEmpty = !!(spec.scene && spec.scene.expectedGraph && spec.scene.expectedGraph.allowEmpty);
    const scene = await channel.inspect({ kind: 'inspectScene' });
    const names = (scene.nodes || []).map((n) => n.name);
    const missing = graphNodes.filter((g) => !names.some((n) => n === g || n.startsWith(g + '__')));
    results.push(check('node-exists', missing.length === 0 && (scene.nodeCount > 0 || allowEmpty),
      missing.length ? `missing: ${missing.join(',')}` : `sceneId=${scene.sceneId} nodeCount=${scene.nodeCount} expected=${graphNodes.length}`));
    results.push(check('node-count', scene.nodeCount >= (graphNodes.length || 1), `nodeCount=${scene.nodeCount} min=${graphNodes.length || 1}`));
    // scene-ready（§9 Ready Contract）：会话必须观察到可命名的运行中场景，而非仅 DOM 就绪
    results.push(check('scene-ready', !!scene && !!(scene.sceneId || scene.name), `scene=${(scene && (scene.name || scene.sceneId)) || '—'} nodeCount=${scene && scene.nodeCount}`));

    // inspectNode：session 内 ID 稳定 + 可序列化 transform 读取（E012「Node ID session 内稳定」）
    // 无条件执行：所有会话示例都要能读出稳定的节点视图，且 validator 声明必须有执行器
    {
      const again = await channel.inspect({ kind: 'inspectScene' });
      const idStable = graphNodes.length > 0
        ? graphNodes.every((g) => {
          const a = (scene.nodes || []).find((n) => n.name === g || n.name.startsWith(g + '__'));
          const b = (again.nodes || []).find((n) => n.name === g || n.name.startsWith(g + '__'));
          return !!a && !!b && a.id === b.id;
        })
        : (again.nodes || []).length === (scene.nodes || []).length && scene.sceneId === again.sceneId;
      results.push(check('inspectNode:id-stable', idStable, idStable ? 'node ids identical across snapshots' : 'ids changed between inspectScene calls'));
      const firstExpected = graphNodes.length > 0 ? graphNodes[0] : null;
      const target = (scene.nodes || []).find((n) => (firstExpected ? n.name === firstExpected || n.name.startsWith(firstExpected + '__') : true));
      if (target) {
        const view = await channel.inspect({ kind: 'inspectNode', id: target.id });
        const pos = view && view.local && view.local.position;
        const finite = Array.isArray(pos) && pos.length === 3 && pos.every((v) => Number.isFinite(v));
        results.push(check('transform-equals', finite && view.name === target.name, finite ? `${target.name} local.position=[${pos}]` : `bad node view: ${JSON.stringify(view).slice(0, 120)}`));
      } else {
        results.push(check('transform-equals', false, 'no node to inspect'));
      }
    }

    // dispatch：受控写入 + 非法目标的稳定错误码与零副作用（§6.2 合同）
    if (uses('dispatch')) {
      const parent = (scene.nodes || []).find((n) => n.name === 'Main Camera') || (scene.nodes || [])[scene.nodes.length - 1];
      const created = await channel.inspect({
        kind: 'dispatch', requestId: `devtools-${example.id}-1`, action: 'createNode', targetId: parent && parent.id, params: { name: 'devtools-evidence-node' },
      });
      const afterCreate = await channel.inspect({ kind: 'inspectScene' });
      const present = (afterCreate.nodes || []).some((n) => n.name === 'devtools-evidence-node');
      results.push(check('dispatch:createNode', !!created && !!created.nodeId && present,
        `nodeId=${created && created.nodeId} present=${present} nodeCount ${(scene.nodes || []).length}→${(afterCreate.nodes || []).length}`));
      const beforeCount = (await channel.inspect({ kind: 'inspectScene' })).nodeCount;
      const rejected = await runtime.page.evaluate(async () => (window.__benchSession.dispatch({
        requestId: 'devtools-negative', action: 'createNode', targetId: 'node-424242', params: { name: 'must-not-exist' },
      })));
      const afterCount = (await channel.inspect({ kind: 'inspectScene' })).nodeCount;
      const leaked = (await channel.inspect({ kind: 'inspectScene' })).nodes.some((n) => n.name === 'must-not-exist');
      const code = rejected && rejected.error && rejected.error.code;
      results.push(check('dispatch:error-code', rejected && rejected.ok === false
        && ['STALE_TARGET', 'INVALID_ARGUMENT', 'OUT_OF_SCOPE'].includes(code)
        && afterCount === beforeCount && !leaked,
      `ok=${rejected && rejected.ok} code=${code} nodeCount ${beforeCount}→${afterCount} leaked=${leaked}`));
    }

    // captureFrame：受控时机新帧（同时作为 Gallery 缩略图，避免 stale 截图冒充证据）
    let artifact = { path: `docs/evidence/examples/${example.id}.png`, bytes: 0 };
    if (uses('captureFrame') || uses('inspectScene') || (spec.validation.visual || []).length > 0) {
      const cap = await runtime.page.evaluate(() => window.__benchSession.capture());
      const size = await runtime.page.evaluate(() => window.__benchSession.canvasSize());
      const isPng = typeof cap.png === 'string' && cap.png.startsWith('data:image/png;base64,');
      results.push(check('captureFrame', isPng && cap.png.length > 512 && size.width > 0, `bytes=${isPng ? cap.png.length : 0} viewport=${size.width}x${size.height}`));
      const center = cap.center || [];
      const lit = center.length >= 3 && center.some((v, i) => Math.abs(v - CLEAR_COLOR[i]) >= 8);
      results.push(check('visible-frame', isPng && lit, lit ? `center rgb=[${center.slice(0, 3)}] differs from clear color` : `center rgb=[${center.slice(0, 3)}] equals clear color — empty frame`));
      if (isPng) { artifact = saveArtifact(example.id, cap.png); }
    }

    // 资产报告合同（与浏览器矩阵同语义）：Material 在场且无致命诊断，资源计数达标
    const functionalDeclared = spec.validation.functional || [];
    if (functionalDeclared.includes('material-property') || functionalDeclared.includes('asset-loaded')) {
      const assets = await channel.inspect({ kind: 'inspectAsset' });
      const counts = (assets && assets.counts) || {};
      const blocking = ((assets && assets.diagnostics) || [])
        .filter((d) => d.code === 'MISSING_DEPENDENCY' || d.code === 'DESTROYED_RESOURCE' || d.code === 'TYPE_MISMATCH');
      const total = Object.values(counts).reduce((s, n) => s + n, 0);
      if (functionalDeclared.includes('material-property')) {
        results.push(check('material-property', (counts.Material || 0) >= 1 && blocking.length === 0,
          assets ? `Material=${counts.Material || 0}${blocking.length ? ' diagnostics: ' + blocking.map((d) => d.code).join(',') : ''}` : 'inspectAsset reported nothing'));
      }
      if (functionalDeclared.includes('asset-loaded')) {
        results.push(check('asset-loaded', total >= 1 && blocking.length === 0,
          assets ? `assets total=${total}${blocking.length ? ' diagnostics: ' + blocking.map((d) => d.code).join(',') : ''}` : 'inspectAsset reported nothing'));
      }
    }

    // §11 Screenshot Current：交付示例必须有当期帧，旧截图不得冒充（bytes=0 的占位记录一律 FAIL）
    if (!artifact.bytes) {
      try {
        const shot = await runtime.page.screenshot({ type: 'png' });
        artifact = saveArtifact(example.id, 'data:image/png;base64,' + shot.toString('base64'));
      } catch (e) { /* 下面以 bytes=0 记录为 FAIL 依据 */ }
    }
    if (!artifact.bytes) { results.push(check('screenshot-current', false, 'no frame captured this run (§11 Screenshot Current)')); }

    // getRuntimeErrors：结构合同 + 零运行时错误
    const errors = await channel.errorReport({ limit: 50 });
    const structured = Array.isArray(errors.errors) && typeof errors.dropped === 'number';
    const pageErrors = runtime.pageErrors.map((e) => e.message);
    results.push(check('getRuntimeErrors', structured, structured ? `schema ok, ${errors.errors.length} entries, dropped=${errors.dropped}` : JSON.stringify(errors).slice(0, 120)));
    results.push(check('no-runtime-error', structured && errors.errors.length === 0 && pageErrors.length === 0,
      [...(errors.errors || []).slice(0, 2).map((e) => e.message), ...pageErrors.slice(0, 2)].join(' | ') || 'clean'));

    // 示例页内自检：教学闭环必须自己报告全绿（console.log 的 FAIL 不会被浏览器错误捕获）
    const selfReport = await runtime.page.evaluate(() => (window.__rcState === undefined ? null : window.__rcState));
    if (!selfReport || typeof selfReport !== 'object') {
      results.push(check('session-self-report', false, `example publishes no window.__rcState (got ${JSON.stringify(selfReport)})`));
    } else {
      const bad = Object.entries(selfReport).filter(([k, v]) => (k === 'fail' ? v !== 0 : v === false));
      results.push(check('session-self-report', bad.length === 0, bad.length ? `${JSON.stringify(selfReport)}` : `in-page checks green: ${JSON.stringify(selfReport)}`));
    }

    // close/detach：之后请求 SESSION_CLOSED，且业务主循环继续渲染（E012 验收项）
    await runtime.page.evaluate(async () => {
      const cc = await import('/build/cocosair.module.js');
      window.__frames = 0;
      cc.director.on(cc.Director.EVENT_AFTER_DRAW, () => { window.__frames++; });
    });
    const closed = await runtime.page.evaluate(async () => {
      window.__benchSession.close();
      const response = await window.__benchSession.dispatch({ requestId: 'devtools-after-close', action: 'createNode', targetId: 'node-1', params: {} });
      return { code: response && response.error && response.error.code, ok: response && response.ok };
    });
    results.push(check('detach:SESSION_CLOSED', closed.ok === false && closed.code === 'SESSION_CLOSED', `ok=${closed.ok} code=${closed.code}`));
    const framesBefore = await runtime.page.evaluate(() => Number(window.__frames) || 0);
    await new Promise((resolve) => setTimeout(resolve, 900));
    const framesAfter = await runtime.page.evaluate(() => Number(window.__frames) || 0);
    results.push(check('detach:loop-alive', framesAfter > framesBefore,
      `Director.EVENT_AFTER_DRAW frames ${framesBefore}→${framesAfter} after session close (must keep growing)`));

    // 完备性（§10/§11）：规格声明却没有 DevTools 执行器跑过的 validator 是证据缺口，不得静默判 PASS
    const declared = new Set([...((spec.ready && spec.ready.validators) || []), ...functionalDeclared,
      ...(spec.validation.visual || []), ...(spec.validation.lifecycle || []), ...(spec.validation.capability || [])]);
    for (const id of (spec.validation.interaction || [])) { declared.add(`interaction:${id}`); }
    const executed = new Set(results.map((r) => r.validatorId));
    for (const id of declared) {
      if (!executed.has(id)) { results.push(check(id, false, 'declared in Example Spec but no DevTools executor ran it')); }
    }

    const failed = results.filter((r) => r.state !== 'PASS');
    return {
      id: example.id,
      requiresDevTools: true,
      result: failed.length === 0 ? 'PASS' : 'FAIL',
      specFingerprint: specFingerprintOf(spec),
      sessionUnits: [...sessionUnits],
      specDimensions: {
        ready: spec.ready.validators || [], functional: spec.validation.functional || [],
        interaction: spec.validation.interaction || [], visual: spec.validation.visual || [],
        lifecycle: spec.validation.lifecycle || [], capability: spec.validation.capability || [],
      },
      validatorResults: results,
      artifact,
      assetDigests: assetDigestsOf(path.join(REPO, 'examples', example.dir), spec.assets),
      errors: failed.slice(0, 3).map((r) => `${r.validatorId}: ${r.detail}`),
    };
  } finally {
    await runtime.stop().catch(() => {});
    fs.rmSync(workRoot, { recursive: true, force: true });
  }
}

function writeEvidence (results, globals) {
  const pass = results.filter((r) => r.result === 'PASS').length;
  const evidence = {
    measuredAt: new Date().toISOString(),
    runner: 'tools/verify/v11-devtools-examples.cjs',
    contract: 'V0.5.1 DevTools/Agent Session 冻结合同（inspectScene/inspectNode/dispatch/captureFrame/getRuntimeErrors/close）',
    examples: results,
    results,
    checks: globals,
    total: results.length,
    pass,
    fail: results.length - pass,
  };
  fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n');
}

(async function main () {
  const globalChecks = [checkRuntimeBundleBoundary()];
  const results = [];
  console.log(`Verifying ${entries.length} DevTools examples (spec-driven session contract)...`);
  for (const example of entries) {
    let result;
    try {
      result = await verifyOne(example);
    } catch (error) {
      result = { id: example.id, requiresDevTools: true, result: 'FAIL', reason: String(error && error.message || error).slice(0, 300) };
    }
    results.push(result);
    console.log(`${result.result} ${result.id}${result.reason ? ' [' + result.reason + ']' : ''} ${(result.validatorResults || []).filter((v) => v.state !== 'PASS').map((v) => v.validatorId).join(',')}`);
    writeEvidence(results, globalChecks);
  }
  writeEvidence(results, globalChecks);
  const promoted = promoteFromEvidence(results);
  require('child_process').execFileSync('node', [path.join(REPO, 'tools', 'examples', 'generate-manifest.cjs')], { cwd: REPO });
  const pass = results.filter((r) => r.result === 'PASS').length;
  const boundary = globalChecks[0];
  console.log(`\n== DevTools examples: ${pass}/${results.length} PASS, runtime bundle boundary ${boundary.state}, ${promoted} promoted to stable ==`);
  process.exitCode = (pass === results.length && boundary.state === 'PASS') ? 0 : 1;
})().catch((error) => {
  console.error('FATAL:', String(error && error.stack || error).slice(0, 600));
  process.exit(1);
});
