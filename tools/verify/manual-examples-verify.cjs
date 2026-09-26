/* 开发手册示例验证器 — docs/manual/examples/manual-*
 *
 * 手册示例树与 examples/ 主树解耦（不进 §24 规格、不进 Gallery/覆盖率门禁），
 * 因此可运行性由本验证器独立背书。判定口径（与 v11-examples-verify 同语义）：
 *   1. no-runtime-error：0 console error / 0 pageerror / 0 着色器编译错误
 *   2. visible-frame：画布非背景像素占比 ≥1%（背景以四角采样自适应，不硬编码清屏色）
 *   3. frame-diff（仅动画类示例声明）：相隔 400ms 双帧 PNG 不同
 *   4. app-contract：window.__airApp 必须在超时内出现（每个手册示例末尾固定挂载）
 *   5. state-probe：登记的行为示例必须暴露 window.__manualProbe() → { ready, ok, checks }；
 *      验证器轮询至 ready（30s 上限），ready 后 ok===true 才 PASS。帧差不证明逻辑正确——
 *      回调次序/监听清理/资源释放这类行为断言由示例自证、本检查读回，计划书 §五.3 的最小扩展。
 *
 * 控制台豁免：仅 manual-asset-lifecycle 的 /assets/does-not-exist.json HTTP 404，
 * 同时匹配示例、URL 路径及状态码，计入 detail 与证据；其余 error 仍判 FAIL。
 *
 * 执行：NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs [--ids=manual-a,manual-b]
 * 产出：docs/evidence/manual-examples-verified.json + docs/evidence/examples/manual-<slug>.png
 *
 * 诚实口径：--ids 子集运行会把整份证据标 partial:true 并记录 subset；
 * 对外宣称"全绿"前必须不带 --ids 跑全量。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const esbuild = require('esbuild');
const { evaluateProbe, isAllowedNetworkError } = require('./manual-probe-contract.cjs');

const REPO = path.resolve(__dirname, '..', '..');
const MANUAL_EXAMPLES_DIR = path.join(REPO, 'docs', 'manual', 'examples');
const EVIDENCE_PATH = path.join(REPO, 'docs', 'evidence', 'manual-examples-verified.json');
const ARTIFACT_DIR = path.join(REPO, 'docs', 'evidence', 'examples');

const SETTLE_MS = 2500;
const FRAME_GAP_MS = 400;
const PER_EXAMPLE_TIMEOUT = 120000;
const GRID = 12; // 12×12 采样网格

const args = process.argv.slice(2);
const idsArg = args.find((a) => a.startsWith('--ids='));
const targetIds = idsArg ? new Set(idsArg.slice(6).split(',').map((s) => s.trim()).filter(Boolean)) : null;

// 声明为动画类的示例额外跑 frame-diff；其余只验静态可见帧。
const ANIMATED = new Set([
  'manual-creating-a-scene', 'manual-fundamentals', 'manual-primitives', 'manual-scenegraph',
  'manual-textures', 'manual-lights', 'manual-cameras', 'manual-animation-system', 'manual-color-management',
  'manual-dispose-objects', 'manual-update-things', 'manual-matrix-transformations', 'manual-billboards', 'manual-fog',
  'manual-dynamic-texture', 'manual-render-targets', 'manual-custom-geometry', 'manual-lots-animated', 'manual-transparent', 'manual-voxel',
  'manual-post-processing',
  'manual-tips-keyboard', 'manual-picking', 'manual-align-html', 'manual-mini-game',
  'manual-lots-of-objects', 'manual-rendering-on-demand', 'manual-loading-models',
  'manual-component-lifecycle', 'manual-input-events', 'manual-asset-lifecycle',
]);

let playwright;
try {
  playwright = require('playwright');
} catch (e) {
  console.error('[manual-verify] 需要外部 Playwright：NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs');
  console.error('[manual-verify] require 失败：' + e.message);
  process.exit(2);
}

function listExamples () {
  if (!fs.existsSync(MANUAL_EXAMPLES_DIR)) { return []; }
  return fs.readdirSync(MANUAL_EXAMPLES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((id) => fs.existsSync(path.join(MANUAL_EXAMPLES_DIR, id, 'index.html')))
    .filter((id) => !targetIds || targetIds.has(id))
    .sort();
}

function copyTree (from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) { copyTree(src, dst); } else { fs.copyFileSync(src, dst); }
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream', '.wasm': 'application/wasm', '.css': 'text/css; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

/** 每例独立静态服务：workspace 文件 + /build/*（仓库构建产物）。 */
function startServer (workspaceDir) {
  const server = http.createServer((req, res) => {
    try {
      const p = decodeURIComponent((req.url || '/').split('?')[0]);
      if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      if (p.startsWith('/build/')) {
        const buildFile = path.join(REPO, p);
        if (fs.existsSync(buildFile) && fs.statSync(buildFile).isFile()) {
          res.writeHead(200, { 'Content-Type': MIME[path.extname(buildFile)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
          res.end(fs.readFileSync(buildFile));
          return;
        }
        res.writeHead(404); res.end('not found (build?)'); return;
      }
      let rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
      let file = path.resolve(path.join(workspaceDir, rel));
      if (!file.startsWith(workspaceDir)) { res.writeHead(403); res.end('forbidden'); return; }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) { file = path.join(file, 'index.html'); }
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
      // example .ts 即时编译（与 tools/dev/dev-server.cjs 同款 esbuild transform 配方）
      if (path.extname(file) === '.ts') {
        const result = esbuild.transformSync(fs.readFileSync(file, 'utf8'),
          { loader: 'ts', format: 'esm', target: 'es2022', sourcefile: file });
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(Buffer.from(result.code));
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(file));
    } catch (error) {
      if (!res.headersSent) { res.writeHead(500); res.end(String(error.message || error)); }
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/** AFTER_DRAW 回调内采样：回调结束后 drawing buffer 即失效（webgl 默认）。 */
const CAPTURE_SCRIPT = async (grid) => {
  const cc = await import('/build/cocosair.module.js');
  const canvas = document.querySelector('#GameCanvas');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cc.director.off(cc.Director.EVENT_AFTER_DRAW, onDraw);
      reject(new Error('no rendered frame within 10s'));
    }, 10000);
    function onDraw () {
      cc.director.off(cc.Director.EVENT_AFTER_DRAW, onDraw);
      clearTimeout(timer);
      try {
        const w = canvas.width; const h = canvas.height;
        // 采样必须与工件（canvas.toDataURL）同源：drawImage 到 2D 画布再 getImageData。
        // 直接 gl.readPixels 在 AFTER_DRAW 时读到的 buffer 与合成后的 toDataURL 不一致
        // （full-suite 连跑时 load-gltf 明明画出多色 cube，readPixels 却报 distinctColors=2）。
        const snap = document.createElement('canvas');
        snap.width = w; snap.height = h;
        const sctx = snap.getContext('2d');
        sctx.drawImage(canvas, 0, 0);
        const img = sctx.getImageData(0, 0, w, h).data;
        const read = (x, y) => {
          const cx = Math.max(0, Math.min(w - 1, Math.floor(x)));
          const cy = Math.max(0, Math.min(h - 1, Math.floor(y)));
          const i = (cy * w + cx) * 4;
          return [img[i], img[i + 1], img[i + 2]];
        };
        // 背景参考 = 四角采样（自适应任意清屏色，不硬编码）
        const corners = [read(1, 1), read(w - 2, 1), read(1, h - 2), read(w - 2, h - 2)];
        const isBg = (c) => corners.some((bg) => Math.abs(c[0] - bg[0]) < 8 && Math.abs(c[1] - bg[1]) < 8 && Math.abs(c[2] - bg[2]) < 8);
        // 全像素扫描（stride 2）+ 颜色分桶（每通道 16 级）：稀疏格点会整帧漏过小物体
        // （mini-game 的大片纯色地面让 20×20 格点只采到地面+背景，distinctColors=2 假红），
        // 分桶保证"大片纯色"只计 1 桶、小物体各占 1 桶；阈值判据不变。
        let lit = 0; let total = 0;
        const distinct = new Set();
        for (let y = 0; y < h; y += 2) {
          for (let x = 0; x < w; x += 2) {
            const c = read(x, y);
            distinct.add(((c[0] >> 4) << 8) | ((c[1] >> 4) << 4) | (c[2] >> 4));
            total++;
            if (!isBg(c)) { lit++; }
          }
        }
        resolve({
          png: canvas.toDataURL('image/png'),
          litRatio: lit / total,
          distinctColors: distinct.size,
          width: w,
          height: h,
        });
      } catch (e) { reject(e); }
    }
    cc.director.on(cc.Director.EVENT_AFTER_DRAW, onDraw);
  });
};

async function captureFrame (page) {
  return page.evaluate(CAPTURE_SCRIPT, GRID);
}

function saveArtifact (id, dataUrl) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const png = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
  const rel = `docs/evidence/examples/${id}.png`;
  fs.writeFileSync(path.join(REPO, rel), png);
  return {
    path: rel,
    bytes: png.length,
    hash: crypto.createHash('sha256').update(png).digest('hex').slice(0, 16),
  };
}

function visibleFrameOk (shot) {
  return shot.png.length > 512 && shot.litRatio >= 0.01 && shot.distinctColors >= 3;
}

async function runOne (id, browser) {
  const started = Date.now();
  const srcDir = path.join(MANUAL_EXAMPLES_DIR, id);
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), `manual-verify-${id}-`));
  const checks = [];
  const errors = [];
  const push = (name, pass, detail) => checks.push({ name, result: pass ? 'PASS' : 'FAIL', detail: String(detail || '').slice(0, 240) });
  let artifact = null;
  let server = null;
  let context = null;

  try {
    copyTree(srcDir, workspace);
    const startedServer = await startServer(workspace);
    server = startedServer.server;
    const port = startedServer.port;

    context = await browser.newContext({ viewport: { width: 640, height: 480 } });
    const page = await context.newPage();
    const consoleErrors = [];
    let allowedConsole = 0;
    page.on('console', (m) => {
      if (m.type() !== 'error') { return; }
      const text = m.text().slice(0, 300);
      if (isAllowedNetworkError(id, text, m.location().url)) { allowedConsole++; return; }
      consoleErrors.push(text);
    });
    page.on('pageerror', (e) => { errors.push(String(e && e.message || e).slice(0, 300)); });

    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 30000 });

    // app-contract：window.__airApp 必须出现
    let appReady = false;
    try {
      await page.waitForFunction(() => !!window.__airApp, undefined, { timeout: 45000 });
      appReady = true;
    } catch (e) {
      appReady = false;
    }
    push('app-contract', appReady, appReady ? 'window.__airApp present' : 'window.__airApp missing within 45s');

    await new Promise((r) => setTimeout(r, SETTLE_MS));

    let first = await captureFrame(page);
    // 负载抖动补拍：阈值不变，只是给异步资产（如 glTF 解析+材质编译）多一次 SETTLE 窗口；
    // 真回归补拍后仍 FAIL。full-suite 连跑时 load-gltf 曾稳定在 2.5s 内只画出部分面。
    let retried = false;
    if (!visibleFrameOk(first)) {
      retried = true;
      await new Promise((r) => setTimeout(r, SETTLE_MS));
      const again = await captureFrame(page);
      if (visibleFrameOk(again)) first = again;
    }
    push('visible-frame', visibleFrameOk(first),
      `litRatio=${first.litRatio.toFixed(4)} distinctColors=${first.distinctColors} ${first.width}x${first.height}${retried ? ' (after 1 re-capture)' : ''}`);

    let frameDiffers = null;
    if (ANIMATED.has(id)) {
      await new Promise((r) => setTimeout(r, FRAME_GAP_MS));
      const second = await captureFrame(page);
      frameDiffers = second.png !== first.png;
      push('frame-diff', frameDiffers, frameDiffers ? 'frames differ over 400ms' : 'frames identical — no animation evidence');
      artifact = saveArtifact(id, second.png);
    } else {
      artifact = saveArtifact(id, first.png);
    }

    // 登记的行为示例必须提供探针；未登记的旧示例仍可省略。
    let probePass = true;
    let probeDetail = 'no __manualProbe (skipped)';
    try {
      const hasProbe = await page.evaluate(() => typeof window.__manualProbe === 'function');
      if (!hasProbe) {
        const result = evaluateProbe(id, false);
        probePass = result.pass;
        probeDetail = result.detail;
      }
      if (hasProbe) {
        const deadline = Date.now() + 30000;
        let probe = null;
        while (Date.now() < deadline) {
          probe = await page.evaluate(() => window.__manualProbe());
          if (probe && probe.ready) { break; }
          await new Promise((r) => setTimeout(r, 500));
        }
        if (!probe) {
          probePass = false; probeDetail = 'probe returned nothing';
        } else if (!probe.ready) {
          probePass = false;
          probeDetail = `probe not ready within 30s (phase=${probe.phase || '?'}${probe.driverError ? ' driverError=' + String(probe.driverError).slice(0, 160) : ''}${probe.order ? ' order=' + probe.order.join(',') : ''})`;
        } else {
          const result = evaluateProbe(id, true, probe);
          probePass = result.pass;
          probeDetail = result.detail;
        }
      }
    } catch (e) {
      probePass = false;
      probeDetail = 'probe threw: ' + String(e && e.message || e).slice(0, 120);
    }
    push('state-probe', probePass, probeDetail);

    // 探针执行结束后再检查，避免遗漏异步行为阶段的运行错误。
    const allErrors = [...consoleErrors, ...errors];
    push('no-runtime-error', allErrors.length === 0,
      allErrors.length === 0
        ? (allowedConsole > 0 ? `clean (${allowedConsole} allowed network 404)` : 'clean')
        : allErrors.slice(0, 2).join(' | '));

    const pass = checks.every((c) => c.result === 'PASS');
    return {
      id,
      result: pass ? 'PASS' : 'FAIL',
      checks,
      screenshot: artifact,
      animated: ANIMATED.has(id),
      frameDiffers,
      ms: Date.now() - started,
      measuredAt: new Date().toISOString(),
    };
  } catch (error) {
    push('runner', false, String(error && error.message || error));
    return {
      id,
      result: 'FAIL',
      checks,
      screenshot: artifact,
      animated: ANIMATED.has(id),
      error: String(error && error.message || error).slice(0, 400),
      ms: Date.now() - started,
      measuredAt: new Date().toISOString(),
    };
  } finally {
    try { if (context) { await context.close(); } } catch { /* 已关闭 */ }
    await new Promise((resolve) => {
      if (server) { server.close(resolve); server.closeAllConnections?.(); } else { resolve(); }
    });
    try { fs.rmSync(workspace, { recursive: true, force: true }); } catch { /* 清理失败不致命 */ }
  }
}

function writeEvidence (results, allIds) {
  const ran = new Set(results.map((r) => r.id));
  let merged = results;
  if (targetIds && fs.existsSync(EVIDENCE_PATH)) {
    try {
      const prior = JSON.parse(fs.readFileSync(EVIDENCE_PATH, 'utf8')).results || [];
      merged = [...prior.filter((r) => !ran.has(r.id)), ...results];
    } catch (e) { /* 旧文件损坏时按本次结果重写 */ }
  }
  const pass = merged.filter((r) => r.result === 'PASS').length;
  const evidence = {
    measuredAt: new Date().toISOString(),
    runner: 'tools/verify/manual-examples-verify.cjs',
    mode: 'manual-examples-v1',
    scope: 'docs/manual/examples/manual-*',
    total: merged.length,
    pass,
    fail: merged.length - pass,
    discovered: allIds.length,
    partial: !!targetIds,
    subset: targetIds ? [...ran].sort() : undefined,
    runPass: results.filter((r) => r.result === 'PASS').length,
    runTotal: results.length,
    results: merged,
  };
  fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n');
  return evidence;
}

(async function main () {
  const bundlePath = path.join(REPO, 'build', 'cocosair.module.js');
  if (!fs.existsSync(bundlePath)) {
    console.error('[manual-verify] 缺少 build/cocosair.module.js —— 先跑 npm run build');
    process.exit(2);
  }
  const allIds = fs.existsSync(MANUAL_EXAMPLES_DIR)
    ? fs.readdirSync(MANUAL_EXAMPLES_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];
  const ids = listExamples();
  if (ids.length === 0) {
    console.error('[manual-verify] 没有可验证的手册示例（docs/manual/examples/manual-*/index.html）');
    process.exit(2);
  }
  if (targetIds) {
    const missing = [...targetIds].filter((t) => !allIds.includes(t));
    if (missing.length) { console.error('[manual-verify] --ids 含不存在的示例: ' + missing.join(', ')); process.exit(2); }
  }

  console.log(`[manual-verify] ${ids.length} 例（发现 ${allIds.length}，${targetIds ? '子集' : '全量'}）`);
  const launchOpts = { headless: true };
  const chromiumExe = ['C:', 'Users', 'caosh', 'AppData', 'Local', 'ms-playwright', 'chromium-1228', 'chrome-win64', 'chrome.exe'].join('\\');
  if (fs.existsSync(chromiumExe)) { launchOpts.executablePath = chromiumExe; }
  launchOpts.args = ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'];
  const browser = await playwright.chromium.launch(launchOpts);

  const results = [];
  try {
    for (const id of ids) {
      const t0 = Date.now();
      let timeout;
      const r = await Promise.race([
        runOne(id, browser),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(`timeout after ${PER_EXAMPLE_TIMEOUT}ms`)), PER_EXAMPLE_TIMEOUT); }),
      ]).catch((e) => ({ id, result: 'FAIL', checks: [{ name: 'runner', result: 'FAIL', detail: String(e.message || e).slice(0, 240) }], ms: Date.now() - t0, measuredAt: new Date().toISOString() })).finally(() => clearTimeout(timeout));
      results.push(r);
      const detail = r.checks.map((c) => `${c.name}=${c.result}`).join(' ');
      console.log(`[${r.result}] ${id} (${(r.ms / 1000).toFixed(1)}s) ${detail}${r.error ? ' err=' + r.error : ''}`);
    }
  } finally {
    await browser.close();
  }

  const evidence = writeEvidence(results, allIds);
  console.log(`[manual-verify] ${evidence.pass}/${evidence.total} PASS${evidence.partial ? ` (partial 子集 ${evidence.runPass}/${evidence.runTotal})` : ''} → docs/evidence/manual-examples-verified.json`);
  process.exitCode = evidence.fail > 0 ? 1 : 0;
})();
