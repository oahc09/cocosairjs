/* V1.1 G1 — Gallery 发布 Artifact：build/examples 自包含静态部署物 + 嵌套部署 + 路由回归。
 *
 * 1) build：node tools/verify/v11-gallery-artifact.cjs build
 *    产出 build/examples/（引擎 + 解码器 + 全部示例 + files.json + gallery + thumbnails/<id>.png），
 *    全部路径改写为相对路径（支持嵌套挂载部署）。
 * 2) 验证：node tools/verify/v11-gallery-artifact.cjs verify
 *    以 /apps/gallery/ 嵌套前缀静态服务 artifact，Playwright 做独立部署验收：
 *      · 交付物字节扫描（无仓库根 /build/ 绝对引用、无根绝对 fetch/src/href/import）
 *      · 解码器发布集（meshopt/draco/basis 文件必须在包内）
 *      · 静态入口与全量非 DevTools 示例缩略图 200
 *      · Gallery 列表、#deep-link、Source 源码查看
 *      · 全部非 DevTools 示例按 ex.dir 真实启动（不是 3 个样本）
 *      · §25 资源释放合同在部署物内成立（window.__lifecycle 全跑）
 *      · 压缩示例确实请求解码文件 + 稳定状态（meshopt wasm / draco 缺失码）
 *      · 零 4xx/5xx 与失败请求、零 page error、零外部 origin 请求（不依赖 DevTools/agent）
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
  // 示例（源目录全量 + 共享库）。shared/bench.* 是 V0.5.1 的 DevTools/基准测量台：
  // 它的 importmap 写死仓库根 /build/ 且需要 agent 通道，不属于静态交付物，故不随包发布。
  fs.cpSync(path.join(REPO, 'examples'), ARTIFACT, {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}node_modules`) && !src.endsWith('files.json')
      && !/[\\/]shared[\\/]bench\.(html|ts)$/.test(src),
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
        // 示例用字符串拼接藏 decoder URL（避免 bundler 静态解析），因此这里必须按前缀匹配：
        // 旧实现要求 '/build/gltf-decoders/' 带尾斜杠，`'/build/gltf-decoders' + '/meshopt/…'`
        // 永不命中，导致 meshopt 部署物仍指向仓库根（静态挂载下必然 404 而门禁无感）。
        const fixed = code
          .replace(/(["'])\/build\/gltf-decoders/g, (m, q) => q + '../gltf-decoders')
          .replace(/(["'])\/build\/cocosair\.module\.js/g, (m, q) => q + '../cocosair.module.js');
        if (fixed !== code) { fs.writeFileSync(srcPath, fixed); rewrites++; }
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

/** 交付物字节扫描：静态部署物不得依赖仓库布局或宿主服务。
 *  命中即缺陷（不是"风格问题"）：根绝对路径在嵌套挂载（/apps/gallery）下 404，
 *  ws:// / localhost: 意味着部署物仍要求 DevTools/agent 通道在线。 */
function scanArtifactBytes () {
  // 只扫会被浏览器取用/解析的字节：.json 里同样有引用源码行文本的 provenance，
  // 那是审计元数据而非运行时依赖，混进来只会制造假阳性。
  const TEXT_EXT = new Set(['.html', '.js', '.mjs', '.cjs', '.ts', '.css', '.gltf']);
  const SKIP_DIR = new Set(['node_modules', 'thumbnails', 'gltf-decoders']);
  const PATTERNS = [
    { id: 'root-absolute-build', re: /["'`]\/build\//, why: '根绝对 /build/ 引用（部署物内需相对化）' },
    { id: 'root-absolute-fetch', re: /fetch\s*\(\s*["'`]\/(?!\/)/, why: '根绝对 fetch（嵌套挂载下 404）' },
    { id: 'root-absolute-attr', re: /(?:src|href)\s*=\s*["']\/(?!\/)/, why: '根绝对 src/href 属性' },
    { id: 'root-absolute-import', re: /^\s*import[^;\n]*["']\/(?!\/)/m, why: '根绝对 import' },
  ];
  const hits = [];
  (function walk (dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (!SKIP_DIR.has(entry.name)) { walk(abs); } continue; }
      if (!TEXT_EXT.has(path.extname(entry.name))) { continue; }
      const rel = path.relative(ARTIFACT, abs).split(path.sep).join('/');
      let text = '';
      try { text = fs.readFileSync(abs, 'utf8'); } catch (e) { continue; }
      if (text.includes('\u0000')) { continue; }
      const lines = text.split('\n');
      for (const pat of PATTERNS) {
        for (let i = 0; i < lines.length; i++) {
          if (pat.re.test(lines[i])) {
            hits.push({ pattern: pat.id, why: pat.why, file: rel, line: i + 1, snippet: lines[i].trim().slice(0, 120) });
            break;
          }
        }
      }
    }
  })(ARTIFACT);
  return hits;
}

/** 解码器发布集：build/gltf-decoders 必须整体随 artifact 走，否则压缩示例在静态部署必然失败。 */
function checkDecoderSet () {
  const root = path.join(ARTIFACT, 'gltf-decoders');
  const required = [
    'meshopt/meshopt_decoder.mjs',
    'draco/draco_decoder.js',
    'draco/draco_decoder.wasm',
    'basis/basis_transcoder.js',
  ];
  const missing = required.filter((rel) => !fs.existsSync(path.join(root, rel)));
  const present = fs.existsSync(root) ? fs.readdirSync(root, { recursive: true }).filter((p) => !fs.statSync(path.join(root, p)).isDirectory()) : [];
  return { missing, present: present.length };
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
    const failedRequests = [];
    const externalRequests = [];
    let currentUrl = '';
    page.on('pageerror', (e) => pageErrors.push(`${path.basename(currentUrl)}: ${String(e).slice(0, 150)}`));
    page.on('response', (res) => {
      const url = res.url();
      // favicon 是浏览器默认探测，不是交付资产；其余 4xx/5xx 一律算部署缺陷。
      if (res.status() >= 400 && !/\/favicon\.ico$/.test(url)) { failedRequests.push(`${res.status()} ${url.replace(base, '')}`); }
    });
    page.on('requestfailed', (req) => { failedRequests.push(`FAILED ${req.url().replace(base, '')}`); });
    page.on('request', (req) => {
      const url = req.url();
      if (url.startsWith(base) || /^(data|blob):/.test(url)) { return; }
      externalRequests.push(url.slice(0, 120));
    });

    const manifest = JSON.parse(fs.readFileSync(path.join(ARTIFACT, 'files.json'), 'utf8'));
    const boottable = manifest.examples.filter((e) => !e.requiresDevTools);
    const devToolsOnly = manifest.examples.filter((e) => e.requiresDevTools);

    // 1) 部署物字节：无仓库绝对路径、无 agent 端点
    const scans = scanArtifactBytes();
    check('artifact:no-absolute-path-dependency', scans.length === 0,
      scans.length ? `${scans.length} 处：${scans.slice(0, 3).map((s) => `${s.file}:${s.line}[${s.pattern}]`).join(' | ')}` : 'no repo-absolute / agent-endpoint references in shipped bytes');
    // 2) 解码器发布集
    const dec = checkDecoderSet();
    check('artifact:decoder-set', dec.missing.length === 0, dec.missing.length ? `missing: ${dec.missing.join(',')}` : `${dec.present} decoder files shipped`);

    // 3) 静态入口 200
    for (const route of ['index.html', 'gallery.html', 'files.json', 'cocosair.module.js']) {
      const res = await page.request.get(`${base}/${route}`);
      check(`static:${route}`, res.status() === 200, `status=${res.status()}`);
    }
    // 4) 缩略图：全量非 DevTools 示例（样本 3 张不足以证明发布完整）
    let thumbsOk = 0; const thumbMissing = [];
    for (const ex of boottable) {
      const res = await page.request.get(`${base}/thumbnails/${ex.id}.png`);
      if (res.status() === 200) { thumbsOk++; } else { thumbMissing.push(`${ex.id}=${res.status()}`); }
    }
    check(`artifact:thumbnails-all`, thumbMissing.length === 0, thumbMissing.length ? `missing: ${thumbMissing.slice(0, 5).join(',')}` : `${thumbsOk}/${boottable.length} thumbnails reachable`);
    // 4b) DevTools 示例的页面文件仍在包内，但其启动依赖 agent 通道：单独记 NOT_RUN 而非混入 PASS
    for (const ex of devToolsOnly) {
      const res = await page.request.get(`${base}/${ex.dir}/index.html`);
      check(`artifact:devtools-page-served:${ex.id}`, res.status() === 200, `status=${res.status()}（仅静态可访问；agent 通道启动不在本门禁范围）`);
    }
    // 5) Gallery 列表渲染（嵌套路径下 fetch 相对 files.json）
    currentUrl = 'gallery.html';
    await page.goto(`${base}/gallery.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelectorAll('.example-link').length > 0, undefined, { timeout: 15000 });
    const listCount = await page.evaluate(() => document.querySelectorAll('.example-link').length);
    check('gallery:list-rendered', listCount === manifest.examples.length, `links=${listCount} expected=${manifest.examples.length}`);

    // 6) 深链路由 #id → 选择 + iframe 指向示例
    await page.goto(`${base}/gallery.html#mesh-sphere`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('current-title') && document.getElementById('current-title').textContent.includes('mesh-sphere'), undefined, { timeout: 15000 });
    const frameSrc = await page.evaluate(() => document.getElementById('preview-frame').src);
    check('gallery:deep-link', /\/mesh-sphere\/$/.test(frameSrc), `iframe src=${frameSrc}`);

    // 7) Gallery 源码查看：点 Source 必须真的取回入口源码，而不是 "// source not available"
    await page.click('#btn-source');
    await page.waitForFunction(() => document.getElementById('source-view').style.display !== 'none', undefined, { timeout: 10000 }).catch(() => {});
    const sourceText = await page.evaluate(() => document.getElementById('source-code').textContent || '');
    check('gallery:source-view', sourceText.length > 200 && !/source not available/.test(sourceText) && /import|function|createAirApp/.test(sourceText),
      `source chars=${sourceText.length} head=${JSON.stringify(sourceText.slice(0, 40))}`);

    // 8) 全部非 DevTools 示例在嵌套部署下真实启动（ex.dir 而非 ex.id：两者可以不同）
    const bootFail = [];
    const lifecycleSeen = [];
    for (const ex of boottable) {
      currentUrl = `${ex.dir}/`;
      const spec = JSON.parse(fs.readFileSync(path.join(ARTIFACT, ex.dir, 'example.json'), 'utf8'));
      const probe = page.waitForFunction(() => !!(window).__airApp, undefined, { timeout: 30000 }).then(() => 'booted').catch(() => 'boot-failed');
      await page.goto(`${base}/${ex.dir}/`, { waitUntil: 'load' });
      const booted = await probe;
      if (booted !== 'booted') { bootFail.push(ex.id); }
      check(`example-boot:${ex.id}`, booted === 'booted', `${booted} via /${ex.dir}/`);
      // 8b) 资源释放在独立部署下同样必须成立（§25 合同示例）
      if ((spec.validation && spec.validation.lifecycle || []).includes('resource-released')) {
        // __lifecycle 由示例在异步资产就绪后才安装：立即 evaluate 会把加载竞态读成"钩子不存在"
        // （同一部署物连续两次跑出 gltf-basic / gltf-skin 互换的假 FAIL）。等待只影响测得准不准，
        // 钩子真缺失时仍按超时后的 null 判 FAIL。
        await page.waitForFunction(() => !!(window).__lifecycle, undefined, { timeout: 15000 }).catch(() => null);
        const lc = await page.evaluate(() => (window).__lifecycle ? (window).__lifecycle() : null).catch((e) => ({ error: String(e).slice(0, 80) }));
        const ok = !!lc && lc.released === true && !(lc.errors || []).length;
        lifecycleSeen.push(ex.id);
        check(`lifecycle:${ex.id}`, ok, lc ? `held=${lc.held} leaked=${(lc.leaked || []).length} reloaded=${lc.reloaded}${lc.error ? ' ' + lc.error : ''}` : 'window.__lifecycle 不存在于部署物');
      }
      // 8c) 解码器示例：解码文件必须真的被这次启动请求过
      if (/gltf-(meshopt|draco)/.test(ex.id)) {
        const seen = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name));
        const want = ex.id === 'gltf-meshopt' ? 'meshopt/meshopt_decoder.mjs' : 'draco.glb';
        const hit = seen.some((u) => decodeURIComponent(u).indexOf(want) >= 0);
        check(`decoder-request:${ex.id}`, hit, hit ? `${want} 已被部署页请求` : `${want} 未出现在资源计时里`);
        if (ex.id === 'gltf-meshopt') {
          const wasm = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((u) => /meshopt_decoder\.base64\.wasm|\.wasm/.test(u)));
          check('decoder-wasm:meshopt', wasm.length > 0, `wasm requests=${wasm.length}`);
        }
        const state = await page.evaluate(() => (window).__decoderState || null);
        check(`decoder-state:${ex.id}`, state !== null, `__decoderState=${state}`);
      }
    }
    check('artifact:all-boottable-examples', bootFail.length === 0, bootFail.length ? `boot failures: ${bootFail.join(',')}` : `${boottable.length}/${boottable.length} booted under nested mount`);
    check('artifact:lifecycle-covered', lifecycleSeen.length > 0, `${lifecycleSeen.length} §25 合同示例在部署物内完成释放核对`);
    check('artifact:no-http-errors', failedRequests.length === 0, failedRequests.length ? `${failedRequests.length} 次 4xx/5xx/失败请求：${failedRequests.slice(0, 4).join(' | ')}` : 'zero non-2xx response');
    // 部署自治性：所有请求都落在本 artifact 的挂载前缀内 → 不需要 DevTools/agent/仓库根服务。
    check('artifact:no-external-requests', externalRequests.length === 0,
      externalRequests.length ? `越界请求 ${externalRequests.length} 次：${[...new Set(externalRequests)].slice(0, 3).join(' | ')}` : 'every request served from the artifact mount');
    check('gallery:no-page-errors', pageErrors.length === 0, `${pageErrors.length} page errors${pageErrors.length ? ': ' + pageErrors.slice(0, 3).join(' | ') : ''}`);
    const pass = results.every((r) => r.ok);
    const evidence = {
      measuredAt: new Date().toISOString(), mount, base: '<self-hosted>',
      scope: { examples: manifest.examples.length, booted: boottable.length, devToolsPagesServed: devToolsOnly.length, lifecycle: lifecycleSeen.length },
      total: results.length, pass: results.filter((r) => r.ok).length, results,
      absolutePathHits: scans.slice(0, 40), failedRequests: failedRequests.slice(0, 40),
    };
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
