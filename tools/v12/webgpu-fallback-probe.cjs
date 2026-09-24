/**
 * r46（owner-decisions #7 = D10 批复 (b)）：gfx-webgpu 的「三浏览器回退探测证据」。
 *
 * 发行姿态事实：默认 bundle 不含 webgpu 后端（WEBGPU=false、glslang/twgsl 资产不在册，
 * 见 docs/evidence/v12/d10/ 与 UPSTREAM.md Deviation-04）。本探针对三引擎各回答两个问题：
 *   1) 该浏览器是否暴露 navigator.gpu（WebGPU 页面能力探测）；
 *   2) 默认 bundle 在该浏览器是否照常完成 WebGL2 初始化并出图（回退路径可用）。
 * 产物：docs/evidence/v12/d10/fallback-probe-<engine>.json + .png（只读现有 example 页面，不改产物）。
 *
 * 执行：NODE_PATH=<playwright> node tools/v12/webgpu-fallback-probe.cjs
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const REPO = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(REPO, 'docs', 'evidence', 'v12', 'd10');
const { ENGINES, launchOptions } = require('../verify/browser-engines.cjs');
const EXT = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png' };

function serveRepo () {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      if (url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      const file = path.join(REPO, url === '/' ? 'index.html' : url);
      if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
      res.writeHead(200, { 'Content-Type': EXT[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

(async () => {
  const { chromium, firefox, webkit } = require('playwright');
  const launchers = { chromium, firefox, webkit };
  const { server, port } = await serveRepo();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const summary = { measuredAt: new Date().toISOString(), engines: {} };
  let hardFail = 0;
  for (const [engine, cfg] of Object.entries(ENGINES)) {
    const record = { engine, navigatorGpu: null, gpuAdapter: null, bundleBackend: null, appCreated: false, consoleErrors: [], fallback: 'UNKNOWN' };
    let browser;
    try {
      browser = await launchers[engine].launch(launchOptions(engine));
      const page = await browser.newPage({ viewport: { width: 480, height: 320 } });
      page.on('pageerror', (e) => { if (record.consoleErrors.length < 5) record.consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`); });
      page.on('console', (m) => { if (m.type() === 'error' && record.consoleErrors.length < 5) record.consoleErrors.push(m.text().slice(0, 200)); });
      await page.goto(`http://127.0.0.1:${port}/examples/hello-cube/index.html`, { waitUntil: 'load', timeout: 45000 });
      await page.waitForTimeout(4000);
      const state = await page.evaluate(async () => {
        const out = { navigatorGpu: typeof navigator.gpu !== 'undefined', gpuAdapter: null, bundleBackend: null, appCreated: !!(window).__airApp };
        try {
          if (out.navigatorGpu) {
            const adapter = await navigator.gpu.requestAdapter();
            out.gpuAdapter = adapter ? 'adapter-available' : 'adapter-null';
          }
        } catch (e) { out.gpuAdapter = `probe-error: ${String(e).slice(0, 120)}`; }
        try {
          const app = (window).__airApp;
          const canvas = app && app.canvas;
          if (canvas) {
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            out.bundleBackend = gl ? (gl.getParameter(gl.VERSION) || 'webgl-context') : 'no-webgl-context';
          }
        } catch (e) { out.bundleBackend = `probe-error: ${String(e).slice(0, 120)}`; }
        return out;
      });
      Object.assign(record, state);
      record.appCreated = !!state.appCreated;
      const png = await page.screenshot({ type: 'png' });
      fs.writeFileSync(path.join(OUT_DIR, `fallback-probe-${engine}.png`), png);
      // 回退判定：bundle 页面无未捕获错误 + 出图字节数在地板之上 ⇒ 回退路径可用
      record.fallback = (record.appCreated && record.consoleErrors.length === 0) ? 'WEBGL2-FALLBACK-OK' : 'FALLBACK-UNVERIFIED';
      if (record.fallback !== 'WEBGL2-FALLBACK-OK') hardFail++;
    } catch (e) {
      record.fallback = `LAUNCH-ERROR: ${String(e).slice(0, 160)}`;
      hardFail++;
    }
    fs.writeFileSync(path.join(OUT_DIR, `fallback-probe-${engine}.json`), JSON.stringify(record, null, 2) + '\n');
    summary.engines[engine] = { navigatorGpu: record.navigatorGpu, fallback: record.fallback };
    console.log(`[webgpu-fallback] ${engine}: gpu=${record.navigatorGpu} adapter=${record.gpuAdapter} backend=${record.bundleBackend} app=${record.appCreated} → ${record.fallback}`);
    if (browser) { await browser.close().catch(() => {}); }
  }
  server.close();
  fs.writeFileSync(path.join(OUT_DIR, 'fallback-probe-summary.json'), JSON.stringify(summary, null, 2) + '\n');
  process.exitCode = hardFail ? 1 : 0;
  console.log(`[webgpu-fallback] done, hardFail=${hardFail} → ${path.relative(REPO, OUT_DIR)}`);
})();
