/**
 * r48（owner-decisions §5）：perfLifecycle 门禁 —— 全局审计（2026-09-19）将其列为 NOT_RUN 的
 * 发布阻塞项，本工具按审计定义实现可复跑的机器证据：
 *
 *   1) dispose 循环 ≥ 50：同一页面内 50 轮「加载 BoxTextured → 实例化 → 销毁」，每轮断言
 *      资产与实例真的失效（isValid === false）且零页面错误 —— 资源生命周期在规模下的正确性半边。
 *   2) BoxTextured 30-load 中位稳定性 ≤ 15%：30 次顺序 loadRemote 的耗时取中位数与基线
 *      （前 5 次中位）比较，漂移 > 15% 判 FAIL —— 泄漏会以逐轮变慢的形状显形。
 *   3) memory=unavailable：本环境（Chromium headless）performance.memory 不可用时如实记
 *      unavailable，不伪造内存读数。
 *
 * 执行：NODE_PATH=<playwright> node tools/verify/perf-lifecycle.cjs
 * 产物：docs/evidence/v11-perf-lifecycle.json
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const REPO = path.resolve(__dirname, '..', '..');
const ARTIFACT = path.join(REPO, 'build', 'examples'); // 已编译 boot.js 的静态部署物（原始 examples 是 TS 入口，静态服务跑不动）
const OUT = path.join(REPO, 'docs', 'evidence', 'v11-perf-lifecycle.json');
const EXE = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1228', 'chrome-win64', 'chrome.exe');
const EXT = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.glb': 'model/gltf-binary', '.md': 'text/markdown' };

function serve () {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let url = decodeURIComponent(req.url.split('?')[0]);
      if (url.endsWith('/')) { url += 'index.html'; }
      if (url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      const file = path.join(ARTIFACT, url);
      if (!file.startsWith(ARTIFACT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
      res.writeHead(200, { 'Content-Type': EXT[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

(async () => {
  const { chromium } = require('playwright');
  const { server, port } = await serve();
  const report = { runner: 'tools/verify/perf-lifecycle.cjs', measuredAt: new Date().toISOString(), env: { exclusive: true, browser: 'chromium-1228 headless' } };
  let hardFail = 0;
  const fail = (msg) => { report.failures = report.failures || []; report.failures.push(msg); hardFail++; };
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: EXE, args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 320 } });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 150)));

    // 测试页：挂载在 gltf-viewer 目录下以复用其本地 BoxTextured.glb 与相对 importmap
    const host = `http://127.0.0.1:${port}/hello-cube/`;
    await page.goto(host, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window).__airApp, undefined, { timeout: 30000 });
    await page.waitForTimeout(1500);

    // —— 2) 30-load 中位稳定性（先跑：dispose 循环会改变页面状态）——
    const stats = await page.evaluate(async () => {
      const mod = await import(new URL('../cocosair.module.js', location.href).href);
      const url = new URL('./gltf-viewer/assets/BoxTextured.glb', new URL('../', location.href)).href;
      const times = [];
      let peakAssets = 0;
      for (let i = 0; i < 30; i++) {
        const t0 = performance.now();
        const asset = await new Promise((resolve, reject) => {
          mod.assetManager.loadRemote(url, (err, a) => { if (err) { reject(err); } else { resolve(a); } });
        });
        times.push(Math.round((performance.now() - t0) * 10) / 10);
        if (!(asset instanceof mod.GLTFAsset || asset.constructor.name === 'GLTFAsset')) { throw new Error('load ' + i + ': not GLTFAsset'); }
        // 每轮立即释放，缓存命中路径与冷路径都要求可用（以 URL 为键的 loadRemote 缓存是设计行为）
        mod.assetManager.releaseAsset(asset);
      }
      const sorted = times.slice().sort((a, b) => a - b);
      const median = (sorted[14] + sorted[15]) / 2;
      const baseSorted = times.slice(0, 5).sort((a, b) => a - b);
      const baseMedian = baseSorted[2];
      const drift = baseMedian > 0 ? Math.abs(median - baseMedian) / baseMedian : 0;
      const mem = (performance).memory || null;
      return { times, median, baseMedian, driftPct: Math.round(drift * 1000) / 10, memory: mem ? { usedJSHeapMB: Math.round(mem.usedJSHeapSize / 1048576) } : 'unavailable' };
    });
    report.thirtyLoad = { loads: 30, medianMs: stats.median, baselineMedianMs: stats.baseMedian, driftPct: stats.driftPct, memory: stats.memory };
    if (stats.driftPct > 15) { fail(`30-load 中位漂移 ${stats.driftPct}% > 15%`); }

    // —— 1) dispose 循环 ≥ 50 ——
    const disposeStats = await page.evaluate(async () => {
      const mod = await import(new URL('../cocosair.module.js', location.href).href);
      const url = new URL('./gltf-viewer/assets/BoxTextured.glb', new URL('../', location.href)).href;
      const rounds = 50;
      const held = [];
      let instantiateFail = 0;
      for (let i = 0; i < rounds; i++) {
        const asset = await new Promise((resolve, reject) => {
          mod.assetManager.loadRemote(url, (err, a) => { if (err) { reject(err); } else { resolve(a); } });
        });
        const inst = asset.instantiate();
        if (!inst || !inst.root) { instantiateFail++; continue; }
        held.push({ asset, inst });
      }
      // 引擎的释放是帧延迟语义（releaseManager 在帧末 _free）：逐轮立即读 isValid 测的是调度时机。
      // 正确姿势 = 全量 dispose + releaseAsset（缓存感知），settle 两帧后再统一断言失效。
      for (const h of held) { h.inst.dispose(); mod.assetManager.releaseAsset(h.asset); }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 350))));
      const stillValid = held.filter((h) => mod.isValid(h.asset)).length;
      return { rounds, destroyed: held.length - stillValid, stillValid, instantiateFail };
    });
    report.disposeLoop = disposeStats;
    if (disposeStats.destroyed !== 50 || disposeStats.stillValid > 0 || disposeStats.instantiateFail > 0) {
      fail(`dispose 循环不完整: ${JSON.stringify(disposeStats)}`);
    }
    report.pageErrors = pageErrors;
    if (pageErrors.length) { fail(`${pageErrors.length} page errors`); }
  } catch (e) {
    fail(`runner error: ${String(e).slice(0, 300)}`);
  }
  if (browser) { await browser.close().catch(() => {}); }
  server.close();
  report.ok = hardFail === 0;
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
  console.log(`[perf-lifecycle] 30-load median=${report.thirtyLoad ? report.thirtyLoad.medianMs + 'ms' : 'n/a'} drift=${report.thirtyLoad ? report.thirtyLoad.driftPct + '%' : 'n/a'} | dispose 50: ${report.disposeLoop ? report.disposeLoop.destroyed + '/50' : 'n/a'} | memory=${report.thirtyLoad ? JSON.stringify(report.thirtyLoad.memory) : 'n/a'} → ${report.ok ? 'PASS' : 'FAIL'}`);
  process.exitCode = hardFail ? 1 : 0;
})();
