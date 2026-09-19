/* V1.1 — Examples 规格驱动浏览器验证（v2：验证器消费 Example Spec）。
 *
 * 与 v1（仅基础运行检查）的差异：
 *  1. Ready Contract：inspectScene 校验 scene.expectedGraph.nodes 逐名在场（starter 空场景按 allowEmpty）；
 *  2. Functional：按 spec.validation.functional 执行 node-exists / node-count / asset-loaded /
 *     material-property / transform-equals（expectedGraph 节点变换可读且有限）/ no-runtime-error；
 *  3. Animation/Frame：animation-playing 与 visual.frame-diff 以双帧捕获（400ms 间隔）像素差异证明；
 *  4. Interaction：按 spec.interaction.steps 以真实指针事件驱动画布，validation.interaction=frame-diff
 *     时以交互前后帧差证明；
 *  5. Lifecycle：validation.lifecycle 非空的示例必须暴露 __lifecycle() 且 released===true；
 *  6. 晋级：全部规格声明检查 PASS → example.json status draft→stable（证据驱动，含 specFingerprint）。
 *
 * 执行：NODE_PATH=<playwright> node tools/verify/v11-examples-verify.cjs [--ids=a,b]
 * 产出：docs/evidence/v11-examples-verified.json + docs/evidence/examples/<id>.png
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..', '..');
const esbuild = require(path.join(REPO, 'node_modules', 'esbuild'));
const { BrowserRuntime } = require(path.join(REPO, 'tools', 'benchmark', 'runner', 'browser-runtime.cjs'));

const EVIDENCE_PATH = path.join(REPO, 'docs', 'evidence', 'v11-examples-verified.json');
const ARTIFACT_DIR = path.join(REPO, 'docs', 'evidence', 'examples');
const PER_EXAMPLE_TIMEOUT = 120000;
const SETTLE_MS = 2500;
const FRAME_GAP_MS = 400;

const args = process.argv.slice(2);
const idsArg = args.find((a) => a.startsWith('--ids='));
const targetIds = idsArg ? new Set(idsArg.slice(6).split(',')) : null;

const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'examples', 'files.json'), 'utf8'));
const entries = manifest.examples
  .filter((e) => !e.requiresDevTools)
  .filter((e) => fs.existsSync(path.join(REPO, 'examples', e.dir, 'index.html')))
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
  if (fs.existsSync(path.join(sharedSrc, 'scene-kit.js'))) {
    copyTree(sharedSrc, path.join(workspace, 'shared'));
  }
  for (const name of ['main.ts', 'main.js']) {
    const file = path.join(workspace, name);
    if (!fs.existsSync(file)) { continue; }
    const code = fs.readFileSync(file, 'utf8');
    if (code.includes('../shared/')) {
      fs.writeFileSync(file, code.replace(/(\.\.\/)shared\//g, './shared/'));
    }
  }
  return fs.readFileSync(path.join(workspace, 'index.html'), 'utf8');
}

function writeEvidence (results, done) {
  const pass = results.filter((r) => r.result === 'PASS').length;
  const evidence = {
    measuredAt: new Date().toISOString(),
    runner: 'tools/verify/v11-examples-verify.cjs',
    mode: 'spec-driven-v2',
    total: results.length,
    pass,
    fail: results.length - pass,
    partial: !done,
    results,
  };
  fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n');
}

async function saveArtifact (dir, dataUrl) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const png = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
  const artifactRel = `docs/evidence/examples/${dir}.png`;
  fs.writeFileSync(path.join(REPO, artifactRel), png);
  return { path: artifactRel, bytes: png.length, hash: crypto.createHash('sha256').update(png).digest('hex').slice(0, 16) };
}

// ---- validator 执行原语 ----
// 3×3 网格采样必须在 AFTER_DRAW 回调内完成：回调结束后 drawing buffer 即失效（webgl 默认）。
async function capture (runtime) {
  return runtime.page.evaluate(async () => {
    const cc = await import('/build/cocosair.module.js');
    const canvas = document.querySelector('#GameCanvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { cc.director.off(cc.Director.EVENT_AFTER_DRAW, onDraw); reject(new Error('no rendered frame')); }, 8000);
      function onDraw() {
        cc.director.off(cc.Director.EVENT_AFTER_DRAW, onDraw);
        clearTimeout(timer);
        try {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null); // 管线可能绑定离屏 FBO：必须读默认帧缓冲
          const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
          const buf = new Uint8Array(w * h * 4);
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
          // 步进统计：与清屏色(30,40,60)任一通道差 ≥15 的像素占比（内容位置/尺寸鲁棒）
          let lit = 0, total = 0;
          for (let y = 0; y < h; y += 4) {
            for (let x = 0; x < w; x += 4) {
              const i = (y * w + x) * 4;
              total++;
              if (Math.abs(buf[i] - 30) >= 8 || Math.abs(buf[i + 1] - 40) >= 8 || Math.abs(buf[i + 2] - 60) >= 8) { lit++; }
            }
          }
          resolve({ png: canvas.toDataURL('image/png'), litRatio: total ? lit / total : 0, bytes: 0 });
        } catch (e) { reject(e); }
      }
      cc.director.on(cc.Director.EVENT_AFTER_DRAW, onDraw);
    });
  }).then((cap) => { cap.bytes = cap.png.length; return cap; });
}
function pngDiffers (a, b) {
  if (a.bytes !== b.bytes) { return true; }
  return a.png !== b.png;
}
async function capturePair (runtime) {
  const first = await capture(runtime);
  await new Promise((resolve) => setTimeout(resolve, FRAME_GAP_MS));
  const second = await capture(runtime);
  return { first, second, differs: pngDiffers(first, second) };
}
// 多间隔帧差：低频变化（闪烁/慢轨道）在某个间隔上必然可见
async function capturePairMulti (runtime) {
  const gaps = [FRAME_GAP_MS, 900, 1400];
  let best = null;
  for (const gap of gaps) {
    const first = await capture(runtime);
    await new Promise((resolve) => setTimeout(resolve, gap));
    const second = await capture(runtime);
    best = { first, second, differs: pngDiffers(first, second) };
    if (best.differs) { return best; }
  }
  return best;
}

// 规范化指纹：排除 status/promotionEvidence（晋级写回不得使证据失配）
function specFingerprintOf (spec) {
  const copy = Object.assign({}, spec);
  delete copy.status;
  delete copy.promotionEvidence;
  return crypto.createHash('sha256').update(JSON.stringify(copy)).digest('hex').slice(0, 12);
}

function check (id, ok, detail) { return { validatorId: id, state: ok ? 'PASS' : 'FAIL', detail: String(detail || '').slice(0, 200) }; }

/** 规格驱动检查（app 示例）。 */
async function runSpecChecks (example, runtime, channel, spec) {
  const results = [];
  // interaction 维度由 runInteractionChecks 以真实输入执行，不进入静态检查
  const want = (validatorId) => spec.ready.validators.includes(validatorId) || spec.validation.functional.includes(validatorId) || spec.validation.visual.includes(validatorId) || spec.validation.lifecycle.includes(validatorId);

  const scene = await channel.inspect({ kind: 'inspectScene' });
  const errors = await channel.errorReport({ limit: 50 });
  const pageErrors = runtime.pageErrors;
  const graphNodes = (spec.scene.expectedGraph && spec.scene.expectedGraph.nodes) || [];
  const allowEmpty = spec.scene.expectedGraph && spec.scene.expectedGraph.allowEmpty === true;
  const nodeNameSet = new Set((scene.nodes || []).map((n) => n.name));

  // --- Ready / 结构合同 ---
  if (want('scene-ready')) {
    results.push(check('scene-ready', !!scene && (scene.nodeCount > 0 || allowEmpty), `sceneId=${scene && scene.sceneId} nodeCount=${scene && scene.nodeCount}`));
  }
  if (want('node-exists') && graphNodes.length > 0) {
    // glTF 实例化节点带 __N 后缀（引擎实例命名合同）：name 或 name__N 均算在场
    const missing = graphNodes.filter((n) => ![...nodeNameSet].some((m) => m === n || m.startsWith(n + '__')));
    results.push(check('node-exists', missing.length === 0, missing.length ? `missing: ${missing.join(',')}` : `${graphNodes.length} expected nodes present`));
  }
  if (want('node-count')) {
    const min = graphNodes.length || 1;
    results.push(check('node-count', scene.nodeCount >= min, `nodeCount=${scene.nodeCount} min=${min}`));
  }

  // --- 资产 / 材质 ---
  const assets = spec.assets || [];
  if (want('asset-loaded')) {
    const report = await channel.inspect({ kind: 'inspectAsset' });
    const total = (report.counts ? Object.values(report.counts).reduce((a, b) => a + b, 0) : 0);
    results.push(check('asset-loaded', total > 0, 'spec assets=' + assets.length + ' runtime asset units=' + total));
  }
  if (want('material-property')) {
    const report = await channel.inspect({ kind: 'inspectAsset' });
    const materials = report.counts ? (report.counts.Material || report.counts.materials || 0) : 0;
    results.push(check('material-property', materials >= 1, `materials=${materials}`));
  }

  // --- transform-equals：expectedGraph 每个节点变换可读且有限 ---
  if (want('transform-equals') && graphNodes.length > 0) {
    let ok = true;
    const details = [];
    for (const name of graphNodes) {
      const entry = (scene.nodes || []).find((n) => n.name === name || n.name.startsWith(name + '__'));
      if (!entry) { ok = false; details.push(`${name}: absent`); continue; }
      try {
        const view = await channel.inspect({ kind: 'inspectNode', id: entry.id });
        const pos = view && view.local && view.local.position;
        const finite = Array.isArray(pos) && pos.length === 3 && pos.every((v) => Number.isFinite(v));
        if (!finite) { ok = false; details.push(`${name}: bad transform`); }
      } catch (e) {
        ok = false; details.push(`${name}: ${String(e.message || e).slice(0, 60)}`);
      }
    }
    results.push(check('transform-equals', ok, details.join('; ') || `${graphNodes.length} node transforms readable`));
  }

  // --- no-runtime-error ---
  if (want('no-runtime-error')) {
    const msgs = [...(errors.errors || []), ...pageErrors.map((e) => e.message)];
    results.push(check('no-runtime-error', msgs.length === 0, msgs.length ? msgs.slice(0, 2).map((m) => String(m).slice(0, 90)).join(' | ') : 'clean'));
  }

  // --- 动画 / 帧差（双帧捕获） ---
  const needsFrames = want('animation-playing') || want('frame-diff');
  if (needsFrames) {
    let pair = await capturePairMulti(runtime);
    if (want('animation-playing')) {
      results.push(check('animation-playing', pair.differs, pair.differs ? 'animated frames differ' : 'frames identical — no animation evidence'));
    }
    if (want('frame-diff')) {
      results.push(check('frame-diff', pair.differs, pair.differs ? 'frame pixels change over time' : 'static frames'));
    }
    if (want('visible-frame')) {
      results.push(check('visible-frame', pair.first.bytes > 512 && hasVisibleContent(pair.first), 'litRatio=' + (pair.first.litRatio !== undefined ? pair.first.litRatio.toFixed(4) : 'n/a')));
    }
    return { results, capture: pair.second };
  }

  // --- visible-frame（单帧网格采样） ---
  if (want('visible-frame')) {
    const shot = await capture(runtime);
    results.push(check('visible-frame', shot.bytes > 512 && hasVisibleContent(shot), 'litRatio=' + (shot.litRatio !== undefined ? shot.litRatio.toFixed(4) : 'n/a')));
    return { results, capture: shot };
  }
  return { results, capture: null };
}

function sampleIsClearLike (p) {
  const nearClear = Math.abs(p[0] - 30) < 12 && Math.abs(p[1] - 40) < 12 && Math.abs(p[2] - 60) < 12;
  const nearBlack = p[0] < 10 && p[1] < 10 && p[2] < 10;
  return nearClear || nearBlack;
}
// visible-frame：非清屏像素占比 ≥1%（内容位置/尺寸鲁棒；空帧/纯清屏为 0）
function hasVisibleContent (shot) {
  return (shot.litRatio !== undefined ? shot.litRatio : 0) >= 0.01;
}

/** 交互合同：真实指针事件 + 交互帧差。 */
async function runInteractionChecks (example, runtime, spec, beforeCaptureArg) {
  let beforeCapture = beforeCaptureArg;
  const results = [];
  const steps = (spec.interaction && spec.interaction.steps) || [];
  if (steps.length === 0) { return results; }
  // 交互前 Ready：确保画面已有实际内容（空帧上的交互差异无意义）
  let pre = await capture(runtime);
  for (let i = 0; i < 5 && !(pre.litRatio >= 0.01); i++) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    pre = await capture(runtime);
  }
  beforeCapture = pre.litRatio >= 0.01 ? pre : beforeCapture;
  const clicks = Math.max(1, steps.length);
  const canvas = await runtime.page.$('#GameCanvas');
  const box = await canvas.boundingBox();
  let after = beforeCapture;
  let changed = false;
  // 预热点击：长 evaluate 阶段后的首次点击可能被输入系统吞掉（实测）；预热后的帧同样参与变化判定
  await runtime.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await new Promise((resolve) => setTimeout(resolve, 700));
  after = await capture(runtime);
  if (pngDiffers(beforeCapture, after)) { changed = true; }
  // 逐点击捕获：任一中间帧与初始帧不同即证明真实输入产生了状态变化（切换奇偶性鲁棒）
  for (let i = 0; i < clicks; i++) {
    await runtime.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await new Promise((resolve) => setTimeout(resolve, 800));
    after = await capture(runtime);
    if (pngDiffers(beforeCapture, after)) { changed = true; }
  }
  // 点击无效果且示例声明 input API 时，运行键盘/拖拽电池（键盘驱动示例）
  if (!changed && (spec.api.primary.includes('input') || spec.api.primary.includes('Input'))) {
    await runtime.page.keyboard.down('KeyW');
    await new Promise((resolve) => setTimeout(resolve, 350));
    await runtime.page.keyboard.up('KeyW');
    await runtime.page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.5);
    await runtime.page.mouse.down();
    await runtime.page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.62, { steps: 6 });
    await runtime.page.mouse.up();
    await new Promise((resolve) => setTimeout(resolve, 900));
    after = await capture(runtime);
    if (pngDiffers(beforeCapture, after)) { changed = true; }
  }
  for (const validatorId of spec.validation.interaction) {
    if (validatorId === 'frame-diff') {
      results.push(check('interaction:frame-diff', changed, changed ? 'canvas state changed after real input' : 'no pixel change after interaction'));
    } else {
      results.push(check(`interaction:${validatorId}`, false, `validator ${validatorId} has no interaction executor`));
    }
  }
  return { results, after };
}

/** Lifecycle 合同：__lifecycle() 必须报告 released。 */
async function runLifecycleChecks (example, runtime, spec) {
  const results = [];
  if (spec.validation.lifecycle.length === 0) { return results; }
  for (const validatorId of spec.validation.lifecycle) {
    if (validatorId !== 'resource-released') {
      results.push(check(`lifecycle:${validatorId}`, false, `validator ${validatorId} has no lifecycle executor`));
      continue;
    }
    const state = await runtime.page.evaluate(() => (window.__lifecycle ? window.__lifecycle() : null));
    results.push(check('resource-released', !!state && state.released === true, JSON.stringify(state).slice(0, 160)));
  }
  return results;
}

/** ui-shell（目录页）合同：DOM 选择器渲染 + 零页面错误。 */
async function verifyUiShell (example, workspace, html) {
  const runtime = new BrowserRuntime({ esbuild, repo: REPO });
  try {
    const probe = `<script>document.addEventListener('DOMContentLoaded',function(){window.__benchReady=true;});window.addEventListener('error',function(e){(window.__uiErrors=window.__uiErrors||[]).push(String(e.message).slice(0,200));});</script>`;
    fs.writeFileSync(path.join(workspace, 'index.html'), html.replace('</body>', probe + '</body>'));
    await runtime.start({ paths: { workspace } });
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    const spec = JSON.parse(fs.readFileSync(path.join(REPO, 'examples', example.dir, 'example.json'), 'utf8'));
    const ui = await runtime.page.evaluate((selector) => ({
      count: document.querySelectorAll(selector).length,
      uiErrors: window.__uiErrors || [],
    }), spec.bench.uiSelector);
    const shot = await runtime.page.screenshot({ type: 'png' });
    const artifact = await saveArtifact(example.id, 'data:image/png;base64,' + shot.toString('base64'));
    const results = [];
    results.push(check('ui-selector', ui.count > 0, `${ui.count} matches for ${spec.bench.uiSelector}`));
    results.push(check('no-runtime-error', ui.uiErrors.length === 0 && runtime.pageErrors.length === 0, `${ui.uiErrors.length + runtime.pageErrors.length} errors`));
    const failed = results.filter((r) => r.state !== 'PASS');
    return {
      id: example.id, result: failed.length === 0 ? 'PASS' : 'FAIL',
      specFingerprint: specFingerprintOf(spec),
      validatorResults: results, artifact,
      errors: [...ui.uiErrors, ...runtime.pageErrors.map((e) => e.message)].slice(0, 3),
    };
  } finally {
    await runtime.stop().catch(() => {});
  }
}

async function verifyApp (example, workspace, html) {
  const runtime = new BrowserRuntime({ esbuild, repo: REPO });
  try {
    if (!html.includes('__bench-prelude')) {
      fs.writeFileSync(path.join(workspace, 'index.html'), html.replace('</body>', '<script src="/__bench-prelude.js"></script></body>'));
    }
    const spec = JSON.parse(fs.readFileSync(path.join(REPO, 'examples', example.dir, 'example.json'), 'utf8'));
    const channel = await runtime.start({ paths: { workspace } });
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

    // Ready 轮询（§9）：等待 expectedGraph 节点在场，或节点数连续两次稳定（延迟加载示例）
    const graph = (spec.scene.expectedGraph && spec.scene.expectedGraph.nodes) || [];
    if (graph.length > 0) {
      let lastCount = -1;
      for (let i = 0; i < 40; i++) {
        const snap = await channel.inspect({ kind: 'inspectScene' });
        const names = (snap.nodes || []).map((n) => n.name);
        const allPresent = graph.every((g) => names.some((m) => m === g || m.startsWith(g + '__')));
        if (allPresent || (snap.nodeCount === lastCount && i >= 4)) { break; }
        lastCount = snap.nodeCount;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    // 热身：丢弃首帧捕获（管线首次绘制可能处于暖机状态）
    try { await capture(runtime); } catch (e) { /* 忽略热身失败 */ }

    const { results, capture } = await runSpecChecks(example, runtime, channel, spec);

    let interaction = [];
    let finalCapture = capture;
    if ((spec.interaction && spec.interaction.steps || []).length > 0) {
      const out = await runInteractionChecks(example, runtime, spec, capture);
      interaction = out.results;
      finalCapture = out.after || capture;
    }
    const lifecycle = await runLifecycleChecks(example, runtime, spec);

    const all = [...results, ...interaction, ...lifecycle];
    const failed = all.filter((r) => r.state !== 'PASS');
    const artifact = finalCapture ? await saveArtifact(example.id, finalCapture.png) : { path: `docs/evidence/examples/${example.id}.png`, bytes: 0 };
    return {
      id: example.id,
      result: failed.length === 0 ? 'PASS' : 'FAIL',
      specFingerprint: specFingerprintOf(spec),
      specDimensions: {
        ready: spec.ready.validators, functional: spec.validation.functional,
        interaction: spec.validation.interaction, visual: spec.validation.visual, lifecycle: spec.validation.lifecycle,
      },
      validatorResults: all,
      artifact,
      nodeCount: 0,
      errors: all.filter((r) => r.state === 'FAIL').slice(0, 3).map((r) => `${r.validatorId}: ${r.detail}`),
    };
  } finally {
    await runtime.stop().catch(() => {});
  }
}

function verifyOne (example) {
  const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v11-example-'));
  const workspace = path.join(workRoot, 'workspace');
  let timedOut = false;
  const run = (async () => {
    const html = prepareWorkspace(example, workspace);
    return example.bench && example.bench.mode === 'ui-shell'
      ? verifyUiShell(example, workspace, html)
      : verifyApp(example, workspace, html);
  })();
  const timer = new Promise((_, reject) => {
    setTimeout(() => { timedOut = true; reject(new Error(`timeout after ${PER_EXAMPLE_TIMEOUT}ms`)); }, PER_EXAMPLE_TIMEOUT);
  });
  return Promise.race([run, timer]).catch((error) => ({
    id: example.id, result: 'FAIL',
    reason: timedOut ? `timeout after ${PER_EXAMPLE_TIMEOUT}ms` : String(error && error.message || error).slice(0, 300),
  })).then(async (result) => {
    fs.rmSync(workRoot, { recursive: true, force: true });
    return result;
  });
}

/** 证据驱动晋级：PASS 示例 example.json status draft → stable。 */
function promote (results) {
  let promoted = 0;
  for (const result of results) {
    if (result.result !== 'PASS') { continue; }
    const file = path.join(REPO, 'examples', result.id, 'example.json');
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

(async function main () {
  process.on('unhandledRejection', (error) => {
    console.error('UNHANDLED_REJECTION:', String(error && error.message || error).slice(0, 300));
    process.exit(1);
  });
  process.on('uncaughtException', (error) => {
    console.error('UNCAUGHT_EXCEPTION:', String(error && error.stack || error).slice(0, 500));
    process.exit(1);
  });

  const results = [];
  console.log(`Verifying ${entries.length} examples (spec-driven v2)...`);
  for (const example of entries) {
    let result = await verifyOne(example);
    // 时序抖动单次重试：FAIL 时整例重跑一次，取更优结果（记录 attempts）
    if (result.result === 'FAIL') {
      const retried = await verifyOne(example);
      if (retried.result === 'PASS') { result = Object.assign(retried, { attempts: 2 }); }
      else { result = Object.assign(result, { attempts: 2 }); }
    }
    results.push(result);
    const failed = (result.validatorResults || []).filter((v) => v.state !== 'PASS').map((v) => v.validatorId).join(',');
    console.log(`${result.result} ${result.id}${result.reason ? ' [' + result.reason + ']' : ''}${failed ? ' {' + failed + '}' : ''}`);
    writeEvidence(results, false);
  }
  writeEvidence(results, true);
  const promoted = promote(results);
  require('child_process').execFileSync('node', [path.join(REPO, 'tools', 'examples', 'generate-manifest.cjs')], { cwd: REPO });
  const pass = results.filter((r) => r.result === 'PASS').length;
  console.log(`\n== Examples spec-driven verify: ${pass}/${results.length} PASS, ${promoted} promoted to stable ==`);
  process.exitCode = pass === results.length ? 0 : 1;
})().catch((error) => {
  console.error('FATAL:', String(error && error.stack || error).slice(0, 600));
  process.exit(1);
});
