/* V1.1 G1 — Gallery 发布 Artifact：build/examples 自包含静态部署物 + 嵌套部署 + 路由回归。
 *
 * 1) build：node tools/verify/v11-gallery-artifact.cjs build
 *    产出 build/examples/（引擎 + 解码器 + 全部示例 + files.json + gallery + thumbnails/<id>.png），
 *    全部路径改写为相对路径（支持嵌套挂载部署）。
 * 2) 验证：node tools/verify/v11-gallery-artifact.cjs verify
 *    以 /apps/gallery/ 嵌套前缀静态服务 artifact，Playwright 回归：
 *    导航页/Gallery/files.json 200 → Gallery 列表渲染 → #deep-link 路由 → iframe 真实启动示例。
 *    证据：docs/evidence/v11-gallery-artifact.json
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const REPO = path.resolve(__dirname, '..', '..');
const esbuild = require(path.join(REPO, 'node_modules', 'esbuild'));
const ARTIFACT = path.join(REPO, 'build', 'examples');
const EVIDENCE_PATH = path.join(REPO, 'docs', 'evidence', 'v11-gallery-artifact.json');

function buildArtifact () {
  fs.rmSync(ARTIFACT, { recursive: true, force: true });
  fs.mkdirSync(ARTIFACT, { recursive: true });
  // 引擎与解码器（根相对）
  fs.copyFileSync(path.join(REPO, 'build', 'cocosair.module.js'), path.join(ARTIFACT, 'cocosair.module.js'));
  fs.cpSync(path.join(REPO, 'build', 'gltf-decoders'), path.join(ARTIFACT, 'gltf-decoders'), { recursive: true });
  // 示例（源目录全量 + 共享库）
  fs.cpSync(path.join(REPO, 'examples'), ARTIFACT, {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}node_modules`) && !src.endsWith('files.json'),
  });
  fs.copyFileSync(path.join(REPO, 'examples', 'files.json'), path.join(ARTIFACT, 'files.json'));
  // 示例 index.html importmap → 相对引擎；示例源内 /build/ 引用 → 相对
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'examples', 'files.json'), 'utf8'));
  let rewrites = 0;
  for (const ex of manifest.examples) {
    const exDir = path.join(ARTIFACT, ex.dir);
    const htmlPath = path.join(exDir, 'index.html');
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, 'utf8');
      fs.writeFileSync(htmlPath, html.split('"/build/cocosair.module.js"').join('"../cocosair.module.js"'));
      rewrites++;
    }
    for (const entry of ['src/main.ts', 'src/main.js', 'main.ts', 'main.js']) {
      const srcPath = path.join(exDir, entry);
      if (fs.existsSync(srcPath)) {
        const code = fs.readFileSync(srcPath, 'utf8');
        if (code.includes('/build/gltf-decoders/')) {
          fs.writeFileSync(srcPath, code.split("'/build/gltf-decoders").join("'../gltf-decoders"));
          rewrites++;
        }
      }
    }
  }
  // gallery.html → 相对路径 + 缩略图挂载
  const galleryPath = path.join(ARTIFACT, 'gallery.html');
  let gallery = fs.readFileSync(galleryPath, 'utf8');
  gallery = gallery.split("fetch('/files.json')").join("fetch('files.json')");
  gallery = gallery.split("document.getElementById('preview-frame').src = '/' + ex.dir + '/';")
    .join("document.getElementById('preview-frame').src = './' + ex.dir + '/';");
  gallery = gallery.split("    '/' + currentExample.dir + '/src/main.ts',\n    '/' + currentExample.dir + '/src/main.js',\n    '/' + currentExample.dir + '/main.js',\n    '/' + currentExample.dir + '/main.ts'")
    .join("    './' + currentExample.dir + '/src/main.ts',\n    './' + currentExample.dir + '/src/main.js',\n    './' + currentExample.dir + '/main.js',\n    './' + currentExample.dir + '/main.ts'");
  gallery = gallery.split("  <div id=\"spec-panel\">")
    .join("  <img id=\"spec-thumb\" alt=\"\" style=\"display:none;max-height:120px;border:1px solid #334;border-radius:4px;margin:6px 0\">\n  <div id=\"spec-panel\">");
  gallery = gallery.split("  document.getElementById('spec-expected').textContent =")
    .join("  var thumb = document.getElementById('spec-thumb');\n  thumb.src = './thumbnails/' + ex.id + '.png';\n  thumb.style.display = 'none';\n  thumb.onload = function () { thumb.style.display = ''; };\n  document.getElementById('spec-expected').textContent =");
  fs.writeFileSync(galleryPath, gallery);
  // 入口编译：静态部署物无法即时转译 TS —— 每个示例入口 esbuild bundle 成 main.boot.js
  let compiled = 0;
  for (const ex of manifest.examples) {
    const exDir = path.join(ARTIFACT, ex.dir);
    let entry = null;
    for (const cand of ['src/main.ts', 'src/main.js', 'main.ts', 'main.js']) {
      const p = path.join(exDir, cand);
      if (fs.existsSync(p)) { entry = p; break; }
    }
    if (!entry) { continue; }
    esbuild.buildSync({
      entryPoints: [entry], bundle: true, format: 'esm', target: 'es2022',
      platform: 'browser', external: ['cocosair'], loader: { '.ts': 'ts' },
      outfile: path.join(exDir, 'main.boot.js'), logLevel: 'silent',
    });
    const htmlPath = path.join(exDir, 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.split('./src/main.ts').join('./main.boot.js')
      .split('./main.ts').join('./main.boot.js')
      .split('./main.js').join('./main.boot.js');
    fs.writeFileSync(htmlPath, html);
    compiled++;
  }
  console.log('[gallery-artifact] compiled entries:', compiled);

  // 缩略图（截图生命周期：artifact 内随包发布当期验证截图）
  const thumbDir = path.join(ARTIFACT, 'thumbnails');
  fs.mkdirSync(thumbDir, { recursive: true });
  const evidenceDir = path.join(REPO, 'docs', 'evidence', 'examples');
  let thumbs = 0;
  if (fs.existsSync(evidenceDir)) {
    for (const file of fs.readdirSync(evidenceDir)) {
      if (file.endsWith('.png')) {
        fs.copyFileSync(path.join(evidenceDir, file), path.join(thumbDir, file));
        thumbs++;
      }
    }
  }
  console.log(`[gallery-artifact] built ${path.relative(REPO, ARTIFACT)}: ${manifest.examples.length} examples, ${thumbs} thumbnails, ${rewrites} path rewrites`);
  return { examples: manifest.examples.length, thumbnails: thumbs, rewrites };
}

function serve (rootDir, mount) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.ts': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.wasm': 'application/wasm', '.css': 'text/css' };
  const server = http.createServer((req, res) => {
    try {
      let p = decodeURIComponent((req.url || '/').split('?')[0]);
      if (!p.startsWith(mount + '/')) { res.writeHead(404); res.end(); return; }
      p = p.slice(mount.length + 1) || 'index.html';
      let file = path.join(rootDir, p);
      if (!fs.existsSync(file) || !file.startsWith(rootDir)) { res.writeHead(404); res.end(); return; }
      if (fs.statSync(file).isDirectory()) { file = path.join(file, 'index.html'); } // 目录 URL → index.html
      if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(file));
    } catch (e) { try { res.writeHead(500); res.end(); } catch (e2) { /* ignore */ } }
  });
  return new Promise((resolve) => { server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })); });
}

async function verifyArtifact () {
  var pw = require('playwright');
  const mount = '/apps/gallery';
  const { server, port } = await serve(ARTIFACT, mount);
  const base = `http://127.0.0.1:${port}${mount}`;
  const results = [];
  const check = (id, ok, detail) => { results.push({ id, ok, detail: String(detail || '').slice(0, 200) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${detail || ''}`); return ok; };
  let browser;
  try {
    browser = await pw.chromium.launch({ headless: true, executablePath: ['C:', 'Users', 'caosh', 'AppData', 'Local', 'ms-playwright', 'chromium-1228', 'chrome-win64', 'chrome.exe'].join('\\'), args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 150)));

    // 1) 静态入口 200
    for (const route of ['index.html', 'gallery.html', 'files.json', 'cocosair.module.js']) {
      const res = await page.request.get(`${base}/${route}`);
      check(`static:${route}`, res.status() === 200, `status=${res.status()}`);
    }
    // 2) 缩略图样本
    const manifest = JSON.parse(fs.readFileSync(path.join(ARTIFACT, 'files.json'), 'utf8'));
    const sampled = manifest.examples.filter((e) => !e.requiresDevTools).slice(0, 3);
    for (const ex of sampled) {
      const res = await page.request.get(`${base}/thumbnails/${ex.id}.png`);
      check(`thumbnail:${ex.id}`, res.status() === 200, `status=${res.status()}`);
    }
    // 3) Gallery 列表渲染（嵌套路径下 fetch 相对 files.json）
    await page.goto(`${base}/gallery.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelectorAll('.example-link').length > 0, undefined, { timeout: 15000 });
    const listCount = await page.evaluate(() => document.querySelectorAll('.example-link').length);
    check('gallery:list-rendered', listCount === manifest.examples.length, `links=${listCount} expected=${manifest.examples.length}`);

    // 4) 深链路由 #id → 选择 + iframe 指向示例
    await page.goto(`${base}/gallery.html#mesh-sphere`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('current-title') && document.getElementById('current-title').textContent.includes('mesh-sphere'), undefined, { timeout: 15000 });
    const frameSrc = await page.evaluate(() => document.getElementById('preview-frame').src);
    check('gallery:deep-link', /\/mesh-sphere\/$/.test(frameSrc), `iframe src=${frameSrc}`);

    // 5) 示例在嵌套部署下真实启动（importmap 相对引擎 → __airApp）
    for (const ex of sampled) {
      const probe = page.waitForFunction(() => !!(window).__airApp, undefined, { timeout: 30000 }).then(() => 'booted').catch(() => 'boot-failed');
      await page.goto(`${base}/${ex.id}/`, { waitUntil: 'load' });
      const booted = await probe;
      check(`example-boot:${ex.id}`, booted === 'booted', booted);
    }
    check('gallery:no-page-errors', pageErrors.length === 0, `${pageErrors.length} page errors`);
    const pass = results.every((r) => r.ok);
    const evidence = { measuredAt: new Date().toISOString(), mount, base: '<self-hosted>', total: results.length, pass: results.filter((r) => r.ok).length, results };
    fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
    fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n');
    console.log(`[gallery-artifact] verify: ${results.filter((r) => r.ok).length}/${results.length} PASS → ${path.relative(REPO, EVIDENCE_PATH)}`);
    return pass;
  } finally {
    if (browser) { await browser.close().catch(() => {}); }
    await new Promise((resolve) => { server.close(resolve); });
  }
}

(async () => {
  const mode = process.argv[2] || 'all';
  if (mode === 'build') { buildArtifact(); return; }
  if (mode === 'verify') { process.exit((await verifyArtifact()) ? 0 : 1); return; }
  buildArtifact();
  process.exit((await verifyArtifact()) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
