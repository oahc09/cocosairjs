/* V0.8 §84 — Browser Matrix 简化版：每浏览器验证引擎启动 + WebGL2 + 场景可见。
 * 执行：NODE_PATH=<playwright> node tools/verify/v08-browser-matrix.cjs
 */
var pw = require(process.env.AIR_PW || 'playwright');
var fs = require('fs');
var path = require('path');
var http = require('http');
var REPO = path.resolve(__dirname, '..', '..');

var BROWSERS = ['chromium', 'firefox', 'webkit'];
var HTML = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script type="importmap">{"imports":{"cocosair":"/build/cocosair.module.js"}}</script>'
  + '</head><body style="margin:0"><canvas id="GameCanvas" width="480" height="360"></canvas>'
  + '<script type="module">\n'
  + "import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Layers, Vec3, utils, primitives, builtinResMgr } from '/build/cocosair.module.js';\n"
  + "const app = await createAirApp({ canvas: '#GameCanvas' });\n"
  + '(window).__airApp = app;\n'
  + "const scene = new Scene('matrix');\n"
  + "const cam = new Node('cam'); scene.addChild(cam);\n"
  + "cam.setPosition(new Vec3(0, 3, 9)); cam.setRotationFromEuler(-18, 0, 0);\n"
  + "cam.addComponent(Camera).visibility = Layers.Enum.DEFAULT;\n"
  + "const light = new Node('light'); scene.addChild(light);\n"
  + "light.setPosition(new Vec3(0, 8, 0)); light.setRotationFromEuler(-45, -30, 0);\n"
  + "light.addComponent(DirectionalLight).illuminance = 2;\n"
  + "const cube = new Node('cube'); cube.layer = Layers.Enum.DEFAULT; scene.addChild(cube);\n"
  + "const r = cube.addComponent(MeshRenderer);\n"
  + 'r.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));\n'
  + "r.material = builtinResMgr.get('builtin-standard-material');\n"
  + 'app.run(scene);\n'
  + '</script></body></html>';

(async () => {
  // 静态服务
  var server = http.createServer(function (req, res) {
    var p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p.startsWith('/build/')) {
      var bf = path.join(REPO, p);
      if (fs.existsSync(bf)) {
        res.writeHead(200, { 'Content-Type': path.extname(bf) === '.js' ? 'text/javascript' : 'application/octet-stream' });
        res.end(fs.readFileSync(bf)); return;
      }
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(HTML);
  });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var port = server.address().port;

  var results = [];
  for (var bi = 0; bi < BROWSERS.length; bi++) {
    var bn = BROWSERS[bi];
    var row = { browser: bn, engineBoot: false, webgl2: false, sceneVisible: false, noErrors: true };
    try {
      var launcher = pw[bn];
      var launchOpts = { headless: true };
      if (bn === 'chromium') { launchOpts.args = ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox']; }
      var browser = await launcher.launch(launchOpts);
      var ctx = await browser.newContext({ viewport: { width: 480, height: 360 } });
      var page = await ctx.newPage();
      var pageErrors = [];
      page.on('pageerror', function (e) { pageErrors.push(String(e).slice(0, 200)); });
      await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(function () { return !!(window).__airApp; }, undefined, { timeout: 30000 });
      row.engineBoot = true;
      var webglVer = await page.evaluate(function () {
        var c = document.querySelector('#GameCanvas');
        var gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
        return gl ? gl.getParameter(gl.VERSION) : 'none';
      });
      row.webgl2 = webglVer.indexOf('2') !== -1;
      await new Promise(function (r) { setTimeout(r, 6000); });
      var pixel = await page.evaluate(function () {
        var c = document.querySelector('#GameCanvas');
        var gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
        if (!gl) return [0, 0, 0];
        var px = new Uint8Array(4);
        gl.readPixels(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return [px[0], px[1], px[2]];
      });
      row.sceneVisible = (pixel[0] + pixel[1] + pixel[2]) > 45;
      row.noErrors = pageErrors.length === 0;
      row.webglVersion = webglVer;
      row.centerPixel = pixel;
      row.pageErrorCount = pageErrors.length;
      await browser.close();
    } catch (e) {
      row.error = String(e).slice(0, 200);
      try { await browser.close(); } catch (e2) { /* ok */ }
    }
    results.push(row);
    console.log(bn + ': boot=' + row.engineBoot + ' webgl2=' + row.webgl2 + ' visible=' + row.sceneVisible + ' clean=' + row.noErrors);
  }
  server.close();

  var pass = results.filter(function (r) { return r.engineBoot && r.sceneVisible && r.noErrors; }).length;
  var evidence = {
    measuredAt: new Date().toISOString(),
    gate: 'V0.8 §84 Browser Matrix',
    browsersTested: BROWSERS,
    passCount: pass,
    total: results.length,
    results: results,
  };
  var evPath = path.join(REPO, 'docs/evidence/v08-browser-matrix.json');
  fs.writeFileSync(evPath, JSON.stringify(evidence, null, 2) + '\n');
  console.log('\nBrowser Matrix: ' + pass + '/' + results.length + ' PASS → ' + evPath);
  process.exit(pass === results.length ? 0 : 1);
})();
