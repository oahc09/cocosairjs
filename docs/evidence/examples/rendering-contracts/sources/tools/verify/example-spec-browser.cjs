/* V1.1 — Examples 规格驱动浏览器验证（v2：验证器消费 Example Spec）。
 *
 * 与 v1（仅基础运行检查）的差异：
 *  1. Ready Contract：inspectScene 校验 scene.expectedGraph.nodes 逐名在场（starter 空场景按 allowEmpty）；
 *  2. Functional：按 spec.validation.functional 执行 node-exists / node-count / asset-loaded /
 *     material-property / transform-equals；后三者一律由 Example Spec 的 validationExpectations
 *     驱动（逐节点期望值、逐资产出处），无期望值即 FAIL；声明了的 validator 还必须覆盖作用域内
 *     每个节点（或给出带源码出处的豁免），否则同样 FAIL——"2/5 节点通过"不给整项发绿。
 *  3. Animation/Frame：animation-playing 与 visual.frame-diff 以双帧捕获（400ms 间隔）像素差异证明；
 *  4. Interaction：按 spec.interaction.steps 以真实指针事件驱动画布，validation.interaction=frame-diff
 *     时以交互前后帧差证明；
 *  5. Lifecycle：validation.lifecycle 声明 resource-released 的示例必须暴露 __lifecycle()，
 *     一次调用真实完成 释放→泄漏核对→重新获取，且重载后画面非空、无新增运行期错误、
 *     资产报告无 DESTROYED_RESOURCE 残留；
 *  6. Capability：validation.capability=capability-status 的示例必须给出
 *     validation.capabilityExpectations，运行期以 live getExtensionSupport() 交叉核对状态与 reason；
 *  7. 完备性：任何规格声明但未执行的 validator 记 FAIL（证据缺口不得判 PASS）；
 *  8. 晋级：全部规格声明检查 PASS → example.json status draft→stable（证据驱动，含 specFingerprint）。
 *
 * 执行：NODE_PATH=<playwright> node tools/verify/example-spec-browser.cjs [--ids=a,b]
 *       [--browser=chromium|firefox|webkit] [--out=<证据路径>] [--artifact-dir=<截图目录>]
 * 产出：docs/evidence/examples-verified.json + docs/evidence/examples/<id>.png
 * 三引擎铺开（LV12-01）：默认即上式（chromium 整批口径，且只有写回该路径才做证据驱动晋级）。
 * 非 chromium 必须同时显式 --out=，否则 EXIT=2 —— 否则会把另一种浏览器的结果并进 chromium 的批次字段（F-117 那类自伤）。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..', '..');
const esbuild = require(path.join(REPO, 'node_modules', 'esbuild'));
const { BrowserRuntime } = require(path.join(REPO, 'tools', 'benchmark', 'runner', 'browser-runtime.cjs'));
const specCommon = require(path.join(REPO, 'tools', 'verify', 'example-spec-common.cjs'));
const { specFingerprintOf, promoteFromEvidence, assetDigestsOf } = specCommon;
const apiTrace = require(path.join(REPO, 'tools', 'verify', 'api-trace.cjs'));
const readback = require(path.join(REPO, 'tools', 'verify', 'runtime-readback.cjs'));
const expChecks = require(path.join(REPO, 'tools', 'verify', 'expectation-checks.cjs'));

const CANON_EVIDENCE_PATH = path.join(REPO, 'docs', 'evidence', 'examples-verified.json');
const CANON_ARTIFACT_DIR = path.join(REPO, 'docs', 'evidence', 'examples');
const PER_EXAMPLE_TIMEOUT = 120000;
const SETTLE_MS = 2500;
const FRAME_GAP_MS = 400;

const args = process.argv.slice(2);
const idsArg = args.find((a) => a.startsWith('--ids='));
const targetIds = idsArg ? new Set(idsArg.slice(6).split(',')) : null;
// 插桩是本期 verified 语义的地基；--no-trace 只用于"插桩是否改变结论"的对照运行。
const TRACE_ON = !args.includes('--no-trace');

// 三引擎铺开（LV12-01）：默认仍是 chromium + 当期证据路径，行为逐字节不变。
// 硬守卫：非 chromium 必须显式给 --out= —— 否则 firefox/webkit 的结果会并进 chromium 的整批证据，
// 而 spec-compliance-audit / smoke-29 读的正是那一份（F-117 那类「同一文件两种批次语义」的自伤）。
const BROWSER_ARG = args.find((a) => a.startsWith('--browser='));
const BROWSER = BROWSER_ARG ? BROWSER_ARG.slice(10) : 'chromium';
const OUT_ARG = args.find((a) => a.startsWith('--out='));
if (BROWSER !== 'chromium' && !OUT_ARG) {
  console.error(`--browser=${BROWSER} 必须同时显式指定 --out=<证据路径>：不允许写回 ${path.relative(REPO, CANON_EVIDENCE_PATH)}（该文件是 chromium 整批口径）。`);
  process.exit(2);
}
const { launchOptions } = require(path.join(REPO, 'tools', 'verify', 'browser-engines.cjs'));
const BROWSER_LAUNCH = launchOptions(BROWSER);
const EVIDENCE_PATH = OUT_ARG ? path.resolve(REPO, OUT_ARG.slice(6)) : CANON_EVIDENCE_PATH;
const WRITES_CANONICAL = EVIDENCE_PATH === CANON_EVIDENCE_PATH;
// 截图目录同样可外置：一次「只为测三引擎可行性」的探查跑不应往仓库里落新证据。
const ARTIFACT_ARG = args.find((a) => a.startsWith('--artifact-dir='));
const ARTIFACT_DIR = ARTIFACT_ARG ? path.resolve(REPO, ARTIFACT_ARG.slice(15))
  : (WRITES_CANONICAL ? CANON_ARTIFACT_DIR : path.join(REPO, 'docs', 'evidence', `examples-${BROWSER}`));
const ARTIFACT_REL_DIR = path.relative(REPO, ARTIFACT_DIR).split(path.sep).join('/');

/** 期望值覆盖度：validator 通过不代表 expectedGraph 每个节点都被比对过，缺口必须留痕。 */
function expectationGapNote (spec) {
  const graph = (spec.scene && spec.scene.expectedGraph && spec.scene.expectedGraph.nodes) || [];
  const exp = spec.validationExpectations || {};
  const out = {};
  for (const key of ['transform-equals', 'material-property']) {
    const covered = Object.keys(exp[key] || {});
    out[key] = { compared: covered.length, graph: graph.length, missing: graph.filter((n) => !covered.includes(n)) };
  }
  const assetExp = exp['asset-loaded'] || {};
  out['asset-loaded'] = {
    paths: (assetExp.paths || []).length, specAssets: (spec.assets || []).length,
    kinds: assetExp.kinds ? Object.keys(assetExp.kinds).length : 0,
  };
  return out;
}

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

function prepareWorkspace (example, workspace, spec, options = {}) {
  copyTree(path.join(REPO, 'examples', example.dir), workspace);
  const sharedSrc = path.join(REPO, 'examples', 'shared');
  if (fs.existsSync(path.join(sharedSrc, 'scene-kit.js'))) {
    copyTree(sharedSrc, path.join(workspace, 'shared'));
  }
  // 暂存工作区把示例目录展平到根，shared 库落在 <workspace>/shared：按文件层级重算 shared 说明符。
  // （真实布局 examples/<dir>/src/main.ts 必须写 ../../shared/，与展平后的 ../shared/ 层级不同；
  //   只在这里改名，运行内容不变——否则验证器绿而 Gallery/静态部署 404。）
  for (const rel of ['main.ts', 'main.js', 'src/main.ts', 'src/main.js']) {
    const file = path.join(workspace, rel);
    if (!fs.existsSync(file)) { continue; }
    const depth = path.relative(workspace, path.dirname(file)).split(path.sep).filter(Boolean).length;
    const code = fs.readFileSync(file, 'utf8');
    const fixed = code.replace(/(\.\.\/)+shared\//g, './' + '../'.repeat(depth) + 'shared/');
    if (fixed !== code) { fs.writeFileSync(file, fixed); }
  }
  let html = fs.readFileSync(path.join(workspace, 'index.html'), 'utf8');
  if (options.trace) {
    const bypass = traceBypasses(workspace, html);
    if (bypass.length > 0) {
      // 示例绕过 importmap 直连真实 bundle 时，计数器看不到它的调用：
      // 与其产出一份"看起来没执行"的假证据，不如拒绝插桩并让门禁显式失败。
      throw new Error(`trace-bypass: 源码直连 /build/cocosair.module.js (${bypass.join(', ')})，逐 API 证据不可信`);
    }
    const tracedHtml = html.replace('"/build/cocosair.module.js"', `"./${apiTrace.TRACE_FILE_NAME}"`);
    if (tracedHtml === html) {
      throw new Error('trace-importmap-rewrite-failed: index.html 没有 "/build/cocosair.module.js" importmap 项，插桩未生效');
    }
    fs.writeFileSync(path.join(workspace, 'index.html'), tracedHtml);
    const units = apiTrace.claimedUnits([example], () => spec);
    return { html: tracedHtml, units, trace: apiTrace.writeTraceWorkspace(workspace, units) };
  }
  return { html, trace: null };
}

/** 找出直连真实 bundle（绕过 importmap）的文件——那样计数器看不到示例侧调用。 */
function traceBypasses (workspace, html) {
  const hits = [];
  const scan = (file, text) => {
    if (/from\s+['"][^'"]*cocosair\.module\.js['"]/.test(text) || /import\(\s*['"][^'"]*cocosair\.module\.js['"]/.test(text)) { hits.push(file); }
  };
  for (const rel of ['main.ts', 'main.js', 'src/main.ts', 'src/main.js']) {
    const file = path.join(workspace, rel);
    if (fs.existsSync(file)) { scan(rel, fs.readFileSync(file, 'utf8')); }
  }
  if (/src=["'][^"']*cocosair\.module\.js/.test(html)) { hits.push('index.html'); }
  return hits;
}

function writeEvidence (results, done) {
  // --ids 子集运行不得整体覆盖证据文件（否则未跑示例的记录凭空消失，coverage/audit 失真）：
  // 保留旧记录、按 id 覆盖本次运行结果，并把整份文件标为 partial 以提示非全量。
  const ran = new Set(results.map((r) => r.id));
  let merged = results;
  if (targetIds && fs.existsSync(EVIDENCE_PATH)) {
    try {
      const prior = JSON.parse(fs.readFileSync(EVIDENCE_PATH, 'utf8')).results || [];
      merged = [...prior.filter((r) => !ran.has(r.id)), ...results];
    } catch (e) { /* 旧文件损坏时按本次结果重写 */ }
  }
  const pass = merged.filter((r) => r.result === 'PASS').length;
  const proofTotals = { verified: 0, attested: 0, unproven: 0 };
  for (const r of merged) { for (const p of (r.apiProof || [])) { proofTotals[p.proof] = (proofTotals[p.proof] || 0) + 1; } }
  const evidence = {
    measuredAt: new Date().toISOString(),
    runner: 'tools/verify/example-spec-browser.cjs',
    browser: BROWSER,
    mode: 'spec-driven-v3',
    instrumentation: TRACE_ON ? 'per-api-execution-trace (cocosair.traced.js via importmap)' : 'NONE (--no-trace control run：逐 API 状态不可用)',
    candidateFingerprint: apiTrace.candidateFingerprint(),
    apiProofTotals: proofTotals,
    total: merged.length,
    pass,
    fail: merged.length - pass,
    partial: !done || !!targetIds,
    // A finished --ids run remains a subset. Retained rows are historical,
    // rather than proof that the current full candidate was executed.
    completed: done === true && !targetIds && results.every((r) => r.result === 'PASS'),
    scopePassed: done === true && results.every((r) => r.result === 'PASS'),
    subset: targetIds ? [...ran].sort() : undefined,
    runPass: results.filter((r) => r.result === 'PASS').length,
    runTotal: results.length,
    results: merged,
  };
  specCommon.writeJsonAtomic(EVIDENCE_PATH, evidence);
}

async function saveArtifact (dir, dataUrl) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const png = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
  const artifactRel = `${ARTIFACT_REL_DIR}/${dir}.png`;
  fs.writeFileSync(path.join(ARTIFACT_DIR, `${dir}.png`), png);
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

// 规范化指纹实现集中在 tools/verify/example-spec-common.cjs（与 coverage-report 共用，避免漂移）
function check (id, ok, detail) { return { validatorId: id, state: ok ? 'PASS' : 'FAIL', detail: String(detail || '').slice(0, 200) }; }

/** URL 解码仅用于路径比对；非法转义（示例文件名里的裸 %）按原文处理。 */
function safeDecode (url) { try { return decodeURIComponent(url); } catch (e) { return url; } }

/** 规格驱动检查（app 示例）。 */
async function runSpecChecks (example, runtime, channel, spec) {
  const results = [];
  // interaction 维度由 runInteractionChecks 以真实输入执行；capability 维度由 runCapabilityChecks 执行
  const dims = spec.validation || {};
  const want = (validatorId) => spec.ready.validators.includes(validatorId) || dims.functional.includes(validatorId)
    || dims.visual.includes(validatorId) || dims.lifecycle.includes(validatorId) || (dims.capability || []).includes(validatorId);

  const scene = await channel.inspect({ kind: 'inspectScene' });
  const errors = await channel.errorReport({ limit: 50 });
  const pageErrors = runtime.pageErrors;
  const graphNodes = (spec.scene.expectedGraph && spec.scene.expectedGraph.nodes) || [];
  const allowEmpty = spec.scene.expectedGraph && spec.scene.expectedGraph.allowEmpty === true;
  const nodeNameSet = new Set((scene.nodes || []).map((n) => n.name));

  // 场景数值读回（一次即可，material/transform 共用）与浏览器资源计时（asset paths 证明）
  const propNames = expChecks.materialPropNames(spec);
  let readCache = null;
  const ensureRead = async (delay) => {
    if (delay) { readCache = null; await new Promise((resolve) => setTimeout(resolve, delay)); }
    if (!readCache) {
      const out = await readback.readScene(runtime.page, propNames);
      if (out.error) { throw new Error('scene readback failed: ' + out.error); }
      readCache = out;
    }
    return readCache;
  };
  const findNode = (read, name) => read.nodes.find((n) => n.name === name) || read.nodes.find((n) => n.name.startsWith(name + '__'));
  const resources = (await runtime.page.evaluate(() => performance.getEntriesByType('resource')
    .map((e) => ({ url: e.name, status: e.responseStatus || 0, size: e.transferSize || 0, duration: Math.round(e.duration) }))))
    .map((r) => ({ ...r, decoded: safeDecode(r.url.split('?')[0]) }));
  for (const response of runtime.resourceResponses || []) {
    const decoded = safeDecode(response.url.split('?')[0]);
    const timing = resources.find((r) => r.decoded === decoded);
    if (!timing) { resources.push({ ...response, decoded }); }
    else if (!(timing.size > 0)) { Object.assign(timing, response); }
  }

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

  // --- 期望值驱动的合同（总审查 item 2）---
  // 旧实现只查"资产总数>0 / 存在材质 / 坐标有限"，与 validator 名称无关，PASS 不构成行为证据。
  // 现在必须比对 example.json 的 validationExpectations：期望值来自示例源码字面量（provenance 记录出处），
  // 没有期望值的声明一律 FAIL——宁可红，也不给"名字对应行为"的假绿。
  const declaredExpectations = (key) => expChecks.declared(spec, key);
  const exampleDir = path.join(REPO, 'examples', example.dir);
  const baseName = (n) => n.replace(/__[^_]*$/, '');

  if (want('asset-loaded')) {
    const report = await channel.inspect({ kind: 'inspectAsset' });
    const exp = declaredExpectations('asset-loaded');
    const r = expChecks.evalAssetLoaded(spec, exp, report, resources);
    const cov = expChecks.evalAssetCoverage(exampleDir, 'asset-loaded', spec, exp);
    results.push(check('asset-loaded', r.ok && cov.ok, [r.detail, cov.detail].join(' | ')));
  }
  if (want('material-property')) {
    const exp = declaredExpectations('material-property');
    const read = await ensureRead();
    const r = expChecks.evalMaterialProperty(exp, read, findNode);
    // 覆盖作用域 = 带渲染组件的节点（相机/灯天然无材质；有渲染器却没材质是真缺口，不能豁免）
    const withRenderer = new Set(read.nodes.filter((n) => (n.renderers || []).length > 0).map((n) => baseName(n.name)));
    const cov = expChecks.evalCoverage(exampleDir, 'material-property', spec, graphNodes.filter((n) => withRenderer.has(n)), exp);
    results.push(check('material-property', r.ok && cov.ok, [r.detail, cov.detail].join(' | ')));
  }

  // --- transform-equals：与声明的期望值逐量比较（数组=精确，{range/vary}=动态）---
  if (want('transform-equals')) {
    const exp = declaredExpectations('transform-equals');
    const read = await ensureRead();
    const second = expChecks.needsSecondSample(exp) ? await ensureRead(900) : read;
    const r = expChecks.evalTransformEquals(exp, read, second, findNode, graphNodes.length);
    const cov = expChecks.evalCoverage(exampleDir, 'transform-equals', spec, graphNodes, exp);
    results.push(check('transform-equals', r.ok && cov.ok, [r.detail, cov.detail].join(' | ')));
  }

  // --- no-runtime-error ---
  if (want('no-runtime-error')) {
    const msgs = [...(errors.errors || []), ...pageErrors.map((e) => e.message)];
    results.push(check('no-runtime-error', msgs.length === 0, msgs.length ? msgs.slice(0, 2).map((m) => String(m).slice(0, 90)).join(' | ') : 'clean'));
  }

  // --- capability-status：以 live getExtensionSupport() 与规格期望交叉核对（§64） ---
  if (want('capability-status')) {
    const expectations = dims.capabilityExpectations || [];
    if (expectations.length === 0) {
      results.push(check('capability-status', false, 'declared but validation.capabilityExpectations is missing'));
    } else {
      const observed = await runtime.page.evaluate(async (expected) => {
        const cc = await import('/build/cocosair.module.js');
        const support = new cc.GLTFLoader().getExtensionSupport();
        return expected.map((e) => {
          const hit = support.filter((s) => s.name === e.extension)[0] || null;
          return {
            extension: e.extension,
            status: hit ? hit.status : null,
            reason: hit ? String(hit.reason || '') : 'loader did not report this extension',
          };
        });
      }, expectations);
      const problems = [];
      for (let i = 0; i < expectations.length; i++) {
        const e = expectations[i];
        const o = observed[i];
        const allowed = e.statuses || [];
        if (allowed.length === 0) { problems.push(`${o.extension}: expectation has no statuses`); continue; }
        if (!o.status) { problems.push(`${o.extension}: ${o.reason}`); continue; }
        if (!allowed.includes(o.status)) { problems.push(`${o.extension}: status=${o.status}, expected ${allowed.join('|')}`); continue; }
        if (o.status !== 'supported' && !o.reason) { problems.push(`${o.extension}: ${o.status} reported without reason`); }
      }
      results.push(check('capability-status', problems.length === 0,
        problems.length ? problems.join('; ') : observed.map((o) => `${o.extension}=${o.status}`).join(', ')));
    }
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
  // 交互驱动的 {vary} 期望必须跨"交互前/交互后"两次读回判定：
  // transform-equals 在主检查阶段只采样静置帧，点击/按键带来的变化那时还不存在。
  const varyExp = varyOnlyExpectations(spec);
  const propNames = expChecks.materialPropNames(spec);
  const findReadNode = (read, name) => read.nodes.find((n) => n.name === name) || read.nodes.find((n) => n.name.startsWith(name + '__'));
  if (steps.length === 0) {
    // 期望把判定权交给交互窗口，但没有任何交互步骤会跑 → 无人判定，必须显式红。
    const orphan = Object.entries(varyExp).flatMap(([node, decl]) => Object.keys(decl).map((k) => `${node}.${k}`));
    if (orphan.length > 0) {
      results.push(check('transform-equals:interaction-driven', false, `deferTo=interaction-window 但示例无 interaction.steps，无人判定：${orphan.join(',')}`));
    }
    return { results, after: null };
  }
  let readBefore = null;
  if (Object.keys(varyExp).length > 0) {
    readBefore = await readback.readScene(runtime.page, propNames);
    if (readBefore.error) { results.push(check('transform-equals:interaction-driven', false, `交互前读回失败：${readBefore.error}`)); readBefore = null; }
  }
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
  // 声明了 buttonText 的步骤必须真实点击 DOM 控件：按钮不存在即 FAIL，
  // 绝不静默跳过后让 claim 的 API 靠"示例级 PASS"顶包（frameObject 这类只挂在按钮上的 API）。
  let buttonSteps = 0; let buttonMisses = 0;
  for (const step of steps.filter((s) => s && s.buttonText)) {
    const label = String(step.buttonText);
    buttonSteps++;
    const locator = runtime.page.getByRole('button', { name: label, exact: true });
    if ((await locator.count()) === 0) {
      buttonMisses++;
      results.push(check('interaction:button-click', false, `DOM 按钮不存在，步骤未执行：${label}`));
      continue;
    }
    await locator.first().click();
    await new Promise((resolve) => setTimeout(resolve, 800));
    const shot = await capture(runtime);
    if (pngDiffers(beforeCapture, shot)) { changed = true; }
    after = shot;
    results.push(check('interaction:button-click', true,
      `点击「${label}」已执行 lit=${shot.litRatio.toFixed(4)} differs=${pngDiffers(beforeCapture, shot)}`));
  }
  // 声明了 selectId/optionValue 的步骤必须真实切换 DOM <select> 并触发 change：
  // 选项不存在或加载不完成即 FAIL——gltf-viewer 的 AnimationClip 等 API 只在换模型后才执行，
  // 静默跳过会让"示例级 PASS"替未执行的 API 顶包。
  let selectMisses = 0;
  for (const step of steps.filter((s) => s && s.selectId)) {
    const switched = await runtime.page.evaluate((arg) => {
      const el = document.getElementById(arg.selectId);
      if (!el) { return { ok: false, why: `DOM 控件 #${arg.selectId} 不存在` }; }
      const opt = [...(el.options || [])].find((o) => o.value === arg.optionValue);
      if (!opt) { return { ok: false, why: `#${arg.selectId} 无选项 ${arg.optionValue}` }; }
      el.value = opt.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, why: `#${arg.selectId}=${opt.value}` };
    }, { selectId: String(step.selectId), optionValue: String(step.optionValue) });
    if (!switched.ok) {
      selectMisses++;
      results.push(check('interaction:select-option', false, `步骤未执行：${switched.why}`));
      continue;
    }
    // 换模型是异步加载：等状态行脱离"加载中"再取帧，否则差异可能来自空档而非新模型
    let settled = true;
    try {
      await runtime.page.waitForFunction(() => {
        const s = document.querySelector('#status');
        return !s || !/加载中/.test(s.textContent || '');
      }, { timeout: 15000 });
    } catch (err) { settled = false; }
    const shot = await capture(runtime);
    if (pngDiffers(beforeCapture, shot)) { changed = true; }
    after = shot;
    selectMisses += settled ? 0 : 1;
    results.push(check('interaction:select-option', settled, settled
      ? `切换「${switched.why}」加载完成 lit=${shot.litRatio.toFixed(4)} differs=${pngDiffers(beforeCapture, shot)}`
      : `${switched.why} 切换后 15s 内未完成加载`));
  }
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
    } else if (validatorId === 'button-click') {
      // 上方已逐个按钮点击并各自记 check；这里汇总声明本身是否被兑现：
      // 声明了 button-click 却没有任何 buttonText 步骤可执行 → 该验证器等于没跑，必须红。
      const ok = buttonSteps > 0 && buttonMisses === 0;
      results.push(check('interaction:button-click', ok, ok
        ? `${buttonSteps} 个 DOM 按钮步骤全部真实点击`
        : (buttonSteps === 0 ? 'validation.interaction 声明 button-click，但 interaction.steps 无 buttonText 步骤' : `${buttonMisses}/${buttonSteps} 个按钮步骤未执行`)));
    } else {
      results.push(check(`interaction:${validatorId}`, false, `validator ${validatorId} has no interaction executor`));
    }
  }
  if (readBefore) {
    const readAfter = await readback.readScene(runtime.page, propNames);
    if (readAfter.error) {
      results.push(check('transform-equals:interaction-driven', false, `交互后读回失败：${readAfter.error}`));
    } else {
      const r = expChecks.evalTransformEquals(varyExp, readBefore, readAfter, findReadNode, 0);
      results.push(check('transform-equals:interaction-driven', r.ok, `跨交互两次读回：${r.detail}`));
    }
  }
  return { results, after };
}

/** 摘出交给交互窗口判定的 vary 期望（deferTo: 'interaction-window'）。 */
function varyOnlyExpectations (spec) {
  const exp = (spec.validationExpectations || {})['transform-equals'] || {};
  const out = {};
  for (const [node, decl] of Object.entries(exp)) {
    const keys = Object.entries(decl || {}).filter(([, v]) => v && v.vary && v.deferTo === 'interaction-window');
    if (keys.length === 0) { continue; }
    out[node] = Object.fromEntries(keys);
  }
  return out;
}

/**
 * Lifecycle 合同（§25）：示例必须暴露 window.__lifecycle()，一次调用即真实走完
 * 释放 → 延迟销毁落地 → 泄漏核对 → 重新获取，回报 {held, released, leaked, reloaded, errors}。
 * 仅 released===true 不足以证明生命周期闭合：拆完建不回来、或重载后画面为空同样是缺口。
 */
async function runLifecycleChecks (example, runtime, channel, spec) {
  const results = [];
  const declared = spec.validation.lifecycle || [];
  for (const validatorId of declared) {
    if (validatorId !== 'resource-released') {
      results.push(check(`lifecycle:${validatorId}`, false, `validator ${validatorId} has no lifecycle executor`));
    }
  }
  if (!declared.includes('resource-released')) { return { results, after: null }; }
  const contractPresent = await runtime.page.evaluate(() => typeof window.__lifecycle === 'function');
  if (!contractPresent) {
    results.push(check('resource-released', false, 'validation.lifecycle 声明了 resource-released，但页面无 window.__lifecycle() 合同'));
    return { results, after: null };
  }
  const errorsBefore = ((await channel.errorReport({ limit: 50 })) || {}).errors || [];
  let report = null;
  try {
    report = await runtime.page.evaluate(() => window.__lifecycle());
  } catch (error) {
    results.push(check('resource-released', false, '__lifecycle() threw: ' + String(error.message || error).slice(0, 120)));
    return { results, after: null };
  }
  const problems = [];
  if (!report) { problems.push('contract returned no report'); } else {
    if (!(report.held > 0)) { problems.push(`contract owns 0 resources (held=${report.held})`); }
    if (report.released !== true) { problems.push(`leaked after release: ${(report.leaked || []).join(',') || 'released!=true'}`); }
    if (report.reloaded !== true) { problems.push('reacquire did not restore valid resources'); }
    for (const message of report.errors || []) { problems.push(message); }
  }
  // 释放后画面：证明重新获取真的重新渲染，而不是只把节点挂在隐藏状态
  let post = null;
  try { post = await capture(runtime); } catch (e) { problems.push('post-release capture failed: ' + String(e.message || e).slice(0, 60)); }
  if (post && !(post.litRatio >= 0.01)) { problems.push(`post-release frame empty (litRatio=${post.litRatio.toFixed(4)})`); }
  const errorsAfter = ((await channel.errorReport({ limit: 50 })) || {}).errors || [];
  const newErrors = errorsAfter.slice(errorsBefore.length);
  if (newErrors.length > 0) { problems.push(`${newErrors.length} runtime errors during release/reload: ${String(newErrors[0].message || '').slice(0, 160)}`); }
  // 与 Reference Track 的 resource-released 同语义：资产报告不得残留 DESTROYED_RESOURCE
  const assetReport = await channel.inspect({ kind: 'inspectAsset' });
  const dangling = ((assetReport || {}).diagnostics || []).filter((d) => d.code === 'DESTROYED_RESOURCE');
  if (dangling.length > 0) { problems.push(`${dangling.length} DESTROYED_RESOURCE diagnostics after reload`); }
  results.push(check('resource-released', problems.length === 0, problems.length ? problems.join('; ')
    : `held=${report.held} leaked=0 reloaded=true litRatio=${(post ? post.litRatio : 0).toFixed(4)} assetUnits=${Object.values(assetReport.counts || {}).reduce((a, b) => a + b, 0)}`));
  // 合同跑完后的画面即"当期"截图：验收者看到的与验证器最后一次渲染一致
  return { results, after: post };
}

/** ui-shell（目录页）合同：DOM 选择器渲染 + 零页面错误。 */
async function verifyUiShell (example, workspace, html, specArg) {
  const runtime = new BrowserRuntime({ esbuild, repo: REPO, browserType: BROWSER, browserLaunch: BROWSER_LAUNCH });
  try {
    const probe = `<script>document.addEventListener('DOMContentLoaded',function(){window.__benchReady=true;});window.addEventListener('error',function(e){(window.__uiErrors=window.__uiErrors||[]).push(String(e.message).slice(0,200));});</script>`;
    fs.writeFileSync(path.join(workspace, 'index.html'), html.replace('</body>', probe + '</body>'));
    await runtime.start({ paths: { workspace } });
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    const spec = specArg || JSON.parse(fs.readFileSync(path.join(REPO, 'examples', example.dir, 'example.json'), 'utf8'));
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
      sourceFingerprint: apiTrace.sourceFingerprint(path.join(REPO, 'examples', example.dir)),
      candidateFingerprint: apiTrace.candidateFingerprint(),
      apiProof: specCommon.apiProofOf(spec, path.join(REPO, 'examples', example.dir), {}, new Set(results.filter((r) => r.state === 'PASS').map((r) => r.validatorId))),
      validatorResults: results, artifact,
      assetDigests: assetDigestsOf(path.join(REPO, 'examples', example.dir), spec.assets),
      errors: [...ui.uiErrors, ...runtime.pageErrors.map((e) => e.message)].slice(0, 3),
    };
  } finally {
    await runtime.stop().catch(() => {});
  }
}

async function verifyApp (example, workspace, html, spec, prepared) {
  const runtime = new BrowserRuntime({ esbuild, repo: REPO, browserType: BROWSER, browserLaunch: BROWSER_LAUNCH });
  try {
    if (!html.includes('__bench-prelude')) {
      fs.writeFileSync(path.join(workspace, 'index.html'), html.replace('</body>', '<script src="/__bench-prelude.js"></script></body>'));
    }
    const channel = await runtime.start({ paths: { workspace } });
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

    // 页面自报就绪门（r53）：暴露 __trialProbe 的示例以 probe.ready 为功能读回前置
    // （main() 末尾置位 = 场景已到达规格读回的目标状态）。消除「节点计数稳定」启发式与
    // 页内长采样链的竞态——r53 教训：render-composite 光度断言链拉长 RTQuad 创建时点，
    // 稳定启发式提前 break，读回落在全功能场景之前（node-exists/material-property/transform 假红）。
    // 未暴露探针的示例走原启发式不变；本门只增加等待、不减少后续检查。
    const probeDir = path.join(REPO, 'examples', example.dir);
    const hasProbeContract = fs.readdirSync(probeDir, { recursive: true })
      .some((f) => /\.(ts|js)$/.test(String(f))
        && fs.readFileSync(path.join(probeDir, String(f)), 'utf8').includes('__trialProbe'));
    let scenarioProbe = null;
    if (hasProbeContract) {
      await runtime.page.waitForFunction(
        () => !!(window.__trialProbe && window.__trialProbe.ready === true),
        null, { timeout: 60000 },
      );
      scenarioProbe = await runtime.page.evaluate(() => window.__trialProbe);
      if (scenarioProbe.ok !== true || !Array.isArray(scenarioProbe.checks)
        || scenarioProbe.checks.length === 0 || scenarioProbe.checks.some((c) => c.ok !== true)) {
        const failedCheck = scenarioProbe.checks && scenarioProbe.checks.find((c) => c.ok !== true);
        throw new Error('scenario probe did not complete all behavioral assertions: '
          + (failedCheck ? `${failedCheck.name}: ${failedCheck.detail || ''}` : JSON.stringify({ ready: scenarioProbe.ready, ok: scenarioProbe.ok, checks: scenarioProbe.checks && scenarioProbe.checks.length, error: scenarioProbe.error })));
      }
    }

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

    const { results, capture: specCapture } = await runSpecChecks(example, runtime, channel, spec);

    let interaction = [];
    let finalCapture = specCapture;
    if ((spec.interaction && spec.interaction.steps || []).length > 0) {
      const out = await runInteractionChecks(example, runtime, spec, specCapture);
      interaction = out.results;
      finalCapture = out.after || specCapture;
    }
    const lifecycleOut = await runLifecycleChecks(example, runtime, channel, spec);
    const lifecycle = lifecycleOut.results;
    finalCapture = lifecycleOut.after || finalCapture;

    const all = [...results, ...interaction, ...lifecycle];
    // 规格声明却没有执行器跑过的 validator 是证据缺口：必须显式 FAIL，不得静默省略后判 PASS
    const validation = spec.validation || {};
    const declared = new Set([
      ...(spec.ready.validators || []), ...(validation.functional || []), ...(validation.visual || []),
      ...(validation.lifecycle || []), ...(validation.capability || []),
    ]);
    for (const validatorId of (validation.interaction || [])) { declared.add(`interaction:${validatorId}`); }
    const executed = new Set(all.map((r) => r.validatorId));
    for (const validatorId of declared) {
      if (!executed.has(validatorId)) { all.push(check(validatorId, false, 'declared in Example Spec but no executor ran it')); }
    }

    // 逐 API 运行期证据：插桩计数器看到 claim 的 unit 一次都没执行 → 该 claim 不成立，FAIL。
    // 投影由包装模块的 snapshot() 给出（通道清单在此各写一份会漏 alias/reads）。
    const traceRaw = await runtime.page.evaluate(apiTrace.snapshotInPage);
    if (prepared.trace && !traceRaw) {
      all.push(check('api-instrumented', false, '页面无 window.__apiTrace：包装模块未加载（importmap 改写失效或被缓存）'));
    }
    const trace = apiTrace.normalizeTrace(traceRaw, prepared.units || []);
    const traceUnits = trace.units;
    const passedValidators = new Set(all.filter((r) => r.state === 'PASS').map((r) => r.validatorId));
    const proof = specCommon.apiProofOf(spec, path.join(REPO, 'examples', example.dir), traceUnits, passedValidators);
    const neverRan = proof.filter((p) => p.state === 'not-observed');
    if (neverRan.length > 0) {
      all.push(check('api-executed', false, `${neverRan.length}/${proof.length} claimed APIs never executed: `
        + neverRan.slice(0, 4).map((p) => p.api).join(',')));
    }
    // 期望值覆盖度：validator PASS 了但只比对了部分声明节点，剩余仍是缺口（不 FAIL，如实计数）
    const gapNote = expectationGapNote(spec);
    // §11 Stable 公式含 Screenshot Current：无视觉 validator 的示例也必须当期取帧，
    // 否则旧截图会被当成当期证据（bytes:0 的占位记录不得存在）
    if (!finalCapture) {
      try { finalCapture = await capture(runtime); } catch (e) { /* 取帧失败时下面以 bytes=0 记录为 FAIL 依据 */ }
    }
    const artifact = finalCapture ? await saveArtifact(example.id, finalCapture.png) : { path: `docs/evidence/examples/${example.id}.png`, bytes: 0 };
    if (artifact.bytes === 0) { all.push(check('screenshot-current', false, 'no frame captured this run (§11 Screenshot Current)')); }
    const exampleDir = path.join(REPO, 'examples', example.dir);
    const failed = all.filter((r) => r.state !== 'PASS');
    return {
      id: example.id,
      result: failed.length === 0 ? 'PASS' : 'FAIL',
      specFingerprint: specFingerprintOf(spec),
      sourceFingerprint: apiTrace.sourceFingerprint(exampleDir),
      candidateFingerprint: apiTrace.candidateFingerprint(),
      instrumentation: prepared.trace ? { ...prepared.trace, notes: trace.notes, observed: trace.instrumentedCount, total: (prepared.units || []).length } : null,
      apiProof: proof,
      expectationGaps: gapNote,
      specDimensions: {
        ready: spec.ready.validators, functional: validation.functional,
        interaction: validation.interaction, visual: validation.visual,
        lifecycle: validation.lifecycle, capability: validation.capability,
      },
      validatorResults: all,
      scenarioProbe,
      networkAssets: (runtime.resourceResponses || []).map((r) => ({
        path: new URL(r.url).pathname, status: r.status, bytes: r.size, observation: r.observation,
      })),
      artifact,
      assetDigests: assetDigestsOf(exampleDir, spec.assets),
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
    const spec = JSON.parse(fs.readFileSync(path.join(REPO, 'examples', example.dir, 'example.json'), 'utf8'));
    const isShell = example.bench && example.bench.mode === 'ui-shell';
    const prepared = prepareWorkspace(example, workspace, spec, { trace: TRACE_ON && !isShell });
    return isShell ? verifyUiShell(example, workspace, prepared.html, spec) : verifyApp(example, workspace, prepared.html, spec, prepared);
  })();
  let timeoutHandle;
  const timer = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => { timedOut = true; reject(new Error(`timeout after ${PER_EXAMPLE_TIMEOUT}ms`)); }, PER_EXAMPLE_TIMEOUT);
  });
  return Promise.race([run, timer]).catch((error) => ({
    id: example.id, result: 'FAIL',
    reason: timedOut ? `timeout after ${PER_EXAMPLE_TIMEOUT}ms` : String(error && error.message || error).slice(0, 300),
  })).then(async (result) => {
    clearTimeout(timeoutHandle);
    fs.rmSync(workRoot, { recursive: true, force: true });
    return result;
  });
}

/** 规格驱动浏览器验证主流程（晋级由 promoteFromEvidence 完成）。 */
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
  let promoted = { promoted: 0, demoted: 0 };
  if (WRITES_CANONICAL) {
    // 证据驱动晋级（实现在 example-spec-common.cjs，与 DevTools 运行器共用）。
    // 晋级合同只属于 chromium 整批口径：探查跑（--out=）不得回写 example.json / files.json。
    promoted = promoteFromEvidence(results);
    require('child_process').execFileSync('node', [path.join(REPO, 'tools', 'examples', 'generate-manifest.cjs')], { cwd: REPO });
  } else {
    console.log(`[skip-promote] 本次写入 ${path.relative(REPO, EVIDENCE_PATH)}（非当期证据路径）⇒ 不回写 example.json / files.json`);
  }
  const pass = results.filter((r) => r.result === 'PASS').length;
  console.log(`\n== Examples spec-driven verify: ${pass}/${results.length} PASS, ${promoted.promoted} promoted / ${promoted.demoted} demoted ==`);
  process.exitCode = pass === results.length ? 0 : 1;
})().catch((error) => {
  console.error('FATAL:', String(error && error.stack || error).slice(0, 600));
  process.exit(1);
});
