// 只读探针：诊断部署物 gltf-catalog 启动失败原因 + mesh-sphere 源码查看 404 的请求方。
const path = require('path');
const http = require('http');
const fs = require('fs');
const pw = require('playwright');
const ART = 'E:/AIProMax/github/cocosair.js/build/examples';
const EXE = ['C:', 'Users', 'caosh', 'AppData', 'Local', 'ms-playwright', 'chromium-1228', 'chrome-win64', 'chrome.exe'].join('\\');

function serve(dir, mount) {
  return new Promise((res) => {
    const srv = http.createServer((req, r) => {
      let rel = decodeURIComponent(req.url.split('?')[0]);
      if (rel.startsWith(mount)) rel = rel.slice(mount.length);
      let abs = path.join(dir, rel);
      if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { r.writeHead(404); r.end('nf'); return; }
      const ext = path.extname(abs);
      r.writeHead(200, { 'content-type': ext === '.js' || ext === '.mjs' ? 'text/javascript' : ext === '.json' ? 'application/json' : 'text/plain' });
      r.end(fs.readFileSync(abs));
    });
    srv.listen(0, '127.0.0.1', () => res({ srv, port: srv.address().port }));
  });
}

(async () => {
  const { srv, port } = await serve(ART, '/apps/gallery');
  const base = `http://127.0.0.1:${port}/apps/gallery`;
  const b = await pw.chromium.launch({ headless: true, executablePath: EXE, args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
  const page = await b.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e.message).slice(0, 260)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 260)); });
  const reqs = [];
  page.on('requestfailed', (r) => reqs.push('FAILED ' + r.url().slice(0, 120)));
  page.on('response', (r) => { if (r.status() >= 400) reqs.push(r.status() + ' ' + r.url().replace(base, '') + ' <- ' + (r.request().headers()['referer'] || '').replace(base, '')); });

  console.log('--- gltf-catalog boot ---');
  const p1 = page.waitForFunction(() => !!window.__airApp, undefined, { timeout: 25000 }).then(() => 'booted').catch(() => 'boot-failed');
  await page.goto(`${base}/gltf-catalog/`, { waitUntil: 'load' });
  console.log('boot =', await p1);
  console.log('errors:', errs.slice(0, 8).join('\n  ') || '(none)');
  const st = await page.evaluate(() => ({ airApp: !!window.__airApp, catalog: !!window.__catalogState, body: document.body.innerText.slice(0, 160) }));
  console.log('state:', JSON.stringify(st));

  console.log('--- mesh-sphere source view 404 source ---');
  errs.length = 0; reqs.length = 0;
  const page2 = await b.newPage();
  page2.on('response', (r) => { if (r.status() >= 400) reqs.push(r.status() + ' ' + r.url().replace(base, '') + ' <- ' + (r.request().headers()['referer'] || '?').replace(base, '').slice(0, 90) + ' type=' + r.request().resourceType()); });
  await page2.goto(`${base}/gallery.html#mesh-sphere`, { waitUntil: 'load' });
  await page2.waitForTimeout(4000);
  const clicked = await page2.evaluate(() => {
    const link = [...document.querySelectorAll('a,button')].find((a) => /source|源码|查看/i.test(a.textContent || a.title || ''));
    if (link) { link.click(); return (link.textContent || link.title).trim().slice(0, 40); }
    return null;
  });
  await page2.waitForTimeout(3000);
  console.log('source control clicked:', clicked);
  console.log('4xx:', reqs.slice(0, 12).join('\n  ') || '(none)');
  await b.close(); srv.close();
})();
