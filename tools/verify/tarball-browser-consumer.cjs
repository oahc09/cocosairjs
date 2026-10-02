/**
 * r48（owner-decisions §5）：docsConsumer 的剩余半边 —— 全局审计将其列为 PARTIAL 的
 * 「docs-as-run 指南在隔离真实浏览器消费端执行 + runtime 代码（非类型）浏览器执行」。
 * F-32 清洁室已证明 tarball 可 npm install、bare specifier 可解析、.d.ts 可编译；
 * 本工具补最后一环：**从 packed tarball 安装的产物驱动一个真实浏览器页面跑起来**。
 *
 * 步骤：npm pack（临时输出）→ 全新目录 npm install <tarball> --offline → 静态服务该
 * node_modules/cocosair.js/ → Chromium 打开消费页（importmap 指 安装产物）→ 断言
 * createAirApp 启动、Scene/Node/Camera/MeshRenderer API 往返、canvas 有非零像素帧。
 *
 * 执行：node tools/verify/tarball-browser-consumer.cjs
 * 产物：docs/evidence/tarball-browser-consumer.json
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm'; // win32 spawnSync 需要 .cmd 解析

const REPO = path.resolve(__dirname, '..', '..');
const OUT = path.join(REPO, 'docs', 'evidence', 'tarball-browser-consumer.json');

(async () => {
  const report = { runner: 'tools/verify/tarball-browser-consumer.cjs', measuredAt: new Date().toISOString() };
  let hardFail = 0;
  const fail = (m) => { report.failures = report.failures || []; report.failures.push(m); hardFail++; };
  let tmpRoot = null;
  let server;
  try {
    // 1) pack（输出到仓库外临时目录，不污染工作树）
    tmpRoot = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cocosair-tarball-consumer-'));
    execFileSync(NPM, ['pack', '--pack-destination', tmpRoot], { cwd: REPO, stdio: 'pipe', shell: process.platform === 'win32' });
    const tarball = fs.readdirSync(tmpRoot).find((f) => f.endsWith('.tgz'));
    if (!tarball) { throw new Error('npm pack 未产出 tgz'); }
    report.tarball = tarball;

    // 2) 全新目录安装（--offline 只用本地缓存/本地 tarball；零 registry 调用）
    const consumerDir = path.join(tmpRoot, 'consumer');
    fs.mkdirSync(consumerDir, { recursive: true });
    fs.writeFileSync(path.join(consumerDir, 'package.json'), JSON.stringify({ name: 'tarball-consumer', private: true, type: 'module' }, null, 2));
    execFileSync('npm', ['install', path.join(tmpRoot, tarball), '--no-save', '--offline', '--ignore-scripts'], { cwd: consumerDir, stdio: 'pipe', shell: process.platform === 'win32' });
    const pkgDir = path.join(consumerDir, 'node_modules', 'cocosair.js');
    const bundle = path.join(pkgDir, 'build', 'npm', 'cocosair.module.js');
    if (!fs.existsSync(bundle)) { throw new Error('安装产物缺 build/npm/cocosair.module.js'); }
    report.installed = { files: fs.readdirSync(path.join(pkgDir, 'build')).length, entry: 'build/npm/cocosair.module.js' };
    report.installed.bundleSha256_16 = crypto.createHash('sha256').update(fs.readFileSync(bundle)).digest('hex').slice(0, 16);
    const sourceMapPath = bundle + '.map';
    const releaseCode = fs.readFileSync(bundle, 'utf8');
    report.sourceMap = { present: fs.existsSync(sourceMapPath), linked: /\/\/# sourceMappingURL=/.test(releaseCode) };
    if (report.sourceMap.present || report.sourceMap.linked) {
      fail('published bundle must not include or link to a source map');
    }
    const devBundle = path.join(REPO, 'build', 'cocosair.module.js');
    const devMap = `${devBundle}.map`;
    report.developmentSourceMap = {
      present: fs.existsSync(devMap),
      linked: fs.existsSync(devBundle) && /sourceMappingURL=cocosair\.module\.js\.map/.test(fs.readFileSync(devBundle, 'utf8')),
    };
    if (!report.developmentSourceMap.present || !report.developmentSourceMap.linked) {
      fail('local development bundle must retain its linked source map');
    }

    // 3) 静态服务安装产物
    const EXT = { '.js': 'text/javascript', '.html': 'text/html' };
    server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(pkgDir, url === '/' || url === '/nested/' ? 'index.html' : url.replace(/^\//, ''));
      if (!file.startsWith(pkgDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
      res.writeHead(200, { 'Content-Type': EXT[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;

    // 4) 消费页：docs Quick Start 形态的 main.js（对齐 README 手册用法）
    const pageHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'nonce-w14-test'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'">
<script nonce="w14-test" type="importmap">{"imports":{"cocosair":"/build/npm/cocosair.module.js"}}</script></head>
<body style="margin:0"><canvas id="GameCanvas" width="480" height="320" style="width:480px;height:320px"></canvas>
<script nonce="w14-test" type="module">
import { createAirApp, Scene, Node, Camera, MeshRenderer, DirectionalLight, Material, Color, primitives, utils, Vec3 } from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' });
const scene = new Scene('TarballConsumer');
const cam = new Node('Camera'); scene.addChild(cam); cam.setPosition(new Vec3(0, 1.6, 5)); cam.lookAt(new Vec3(0, 0.5, 0));
cam.addComponent(Camera);
const light = new Node('Light'); scene.addChild(light); light.addComponent(DirectionalLight);
const cube = new Node('Cube'); scene.addChild(cube);
const r = cube.addComponent(MeshRenderer);
r.mesh = utils.createMesh(primitives.box({}));
const m = new Material(); m.initialize({ effectName: 'builtin-standard' }); m.setProperty('mainColor', new Color(120, 160, 220, 255));
r.material = m;
window.__consumer = { apiRoundtrip: [typeof createAirApp, Scene.name, Node.name, Camera.name, MeshRenderer.name, Material.name, Color.name].join(',') };
app.run(scene);
</script></body></html>`;
    fs.writeFileSync(path.join(pkgDir, 'index.html'), pageHtml);

    // 5) 真实浏览器执行
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true, executablePath: path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1228', 'chrome-win64', 'chrome.exe'), args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 320 } });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.stack || e).slice(0, 1000)));
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    const booted = await page.waitForFunction(() => !!(window).__consumer, undefined, { timeout: 30000 }).then(() => true).catch(() => false);
    report.booted = booted;
    if (!booted) { fail('消费页未完成启动（__consumer 未出现）'); }
    if (booted) {
      await page.waitForTimeout(2500);
      const probe = await page.evaluate(() => {
        const c = document.getElementById('GameCanvas');
        const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
        const px = gl ? gl.readPixels ? (() => { const b = new Uint8Array(4 * 100); gl.readPixels(200, 150, 10, 10, gl.RGBA, gl.UNSIGNED_BYTE, b); let nz = 0; for (let i = 3; i < b.length; i += 4) { if (b[i] !== 0) { nz++; } } return nz; })() : -1 : -1;
        return { apiRoundtrip: window.__consumer.apiRoundtrip, nonZeroAlphaPixels: px, canvasSize: c ? [c.width, c.height].join('x') : null };
      }).catch((e) => ({ error: String(e).slice(0, 150) }));
      report.probe = probe;
      if (!probe.apiRoundtrip || probe.apiRoundtrip !== 'function,Scene,Node,Camera,MeshRenderer,Material,Color') { fail(`API 往返不符: ${JSON.stringify(probe)}`); }
      if (!probe.nonZeroAlphaPixels || probe.nonZeroAlphaPixels <= 0) { fail(`canvas 无非零像素帧: ${probe.nonZeroAlphaPixels}`); }
    }
    report.pageErrors = pageErrors;
    if (pageErrors.length) { fail(`${pageErrors.length} page errors: ${pageErrors[0]}`); }
    const nested = await browser.newPage({ viewport: { width: 480, height: 320 } });
    const cspErrors = [];
    nested.on('pageerror', (error) => cspErrors.push(String(error).slice(0, 160)));
    nested.on('console', (message) => {
      if (/Content Security Policy|Refused to/.test(message.text())) cspErrors.push(message.text().slice(0, 160));
    });
    await nested.goto(`http://127.0.0.1:${port}/nested/`, { waitUntil: 'load' });
    report.nested = { booted: await nested.waitForFunction(() => !!window.__consumer, undefined, { timeout: 30000 }).then(() => true).catch(() => false), cspErrors };
    if (!report.nested.booted || cspErrors.length) { fail(`nested CSP consumer failed: ${JSON.stringify(report.nested)}`); }
    await nested.close();
    await browser.close();
  } catch (e) {
    fail(`runner error: ${String(e).slice(0, 300)}`);
  }
  if (server) { server.close(); }
  if (tmpRoot) { fs.rmSync(tmpRoot, { recursive: true, force: true }); }
  report.ok = hardFail === 0;
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
  console.log(`[tarball-consumer] boot=${report.booted} api=${report.probe ? report.probe.apiRoundtrip : 'n/a'} pixels=${report.probe ? report.probe.nonZeroAlphaPixels : 'n/a'} → ${report.ok ? 'PASS' : 'FAIL'}`);
  process.exitCode = hardFail ? 1 : 0;
})();
