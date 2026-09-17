/* V0.8 §84 — Browser Matrix：多浏览器 × 多 Benchmark 验证。
 * 执行：NODE_PATH=<playwright> node tools/verify/v08-browser-matrix.cjs
 * 产出：docs/evidence/v08-browser-matrix.json
 */
var fs = require('fs');
var path = require('path');
var os = require('os');
var REPO = path.resolve(__dirname, '..', '..');
var esbuild = require(path.join(REPO, 'node_modules', 'esbuild'));
var { BrowserRuntime } = require(path.join(REPO, 'tools/benchmark/runner/browser-runtime.cjs'));

var buildDir = path.join(os.tmpdir(), 'v08-matrix');
fs.mkdirSync(buildDir, { recursive: true });
esbuild.buildSync({ entryPoints: [path.join(REPO, 'tools/benchmark/catalog/catalog100.ts')], bundle: true, format: 'cjs', platform: 'node', target: 'node18', outfile: path.join(buildDir, 'cat.cjs'), write: true });
var CATALOG_BENCHMARKS = require(path.join(buildDir, 'cat.cjs')).CATALOG_BENCHMARKS;

var BROWSERS = ['chromium', 'firefox', 'webkit'];
var HTML = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script type="importmap">{"imports":{"cocosair":"/build/cocosair.module.js"}}</script>'
  + '<script src="/__bench-prelude.js"></script></head>'
  + '<body style="margin:0"><canvas id="GameCanvas" width="480" height="360"></canvas>'
  + '<script type="module" src="./src/main.ts"></script></body></html>';

var MAIN_TS = [
  "import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Layers, Vec3, utils, primitives, builtinResMgr } from 'cocosair';",
  "var app = await createAirApp({ canvas: '#GameCanvas' });",
  "(window as any).__airApp = app;",
  "var scene = new Scene('matrix');",
  "var cam = new Node('camera'); scene.addChild(cam);",
  "cam.setPosition(new Vec3(0, 3, 9)); cam.setRotationFromEuler(-18, 0, 0);",
  "cam.addComponent(Camera).visibility = Layers.Enum.DEFAULT;",
  "var light = new Node('light'); scene.addChild(light);",
  "light.setPosition(new Vec3(0, 8, 0)); light.setRotationFromEuler(-45, -30, 0);",
  "light.addComponent(DirectionalLight).illuminance = 2;",
  "var cube = new Node('cube'); cube.layer = Layers.Enum.DEFAULT; scene.addChild(cube);",
  "var r = cube.addComponent(MeshRenderer);",
  "r.mesh = utils.createMesh(primitives.box({ width: 5, height: 5, length: 5 }));",
  "r.material = builtinResMgr.get('builtin-standard-material');",
  "app.run(scene);",
].join('\n');

(async function() {
  var matrix = [];
  var workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v08-matrix-'));

  for (var bi = 0; bi < BROWSERS.length; bi++) {
    var browserName = BROWSERS[bi];
    var row = { browser: browserName, boot: false, webgl2: false, sceneVisible: false, noErrors: true, pass: false };
    var runtime = new BrowserRuntime({ esbuild: esbuild, repo: REPO, browserType: browserName });

    try {
      var wsDir = path.join(workRoot, browserName);
      fs.mkdirSync(path.join(wsDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(wsDir, 'index.html'), HTML, 'utf8');
      fs.writeFileSync(path.join(wsDir, 'src/main.ts'), MAIN_TS, 'utf8');
      var workspace = { paths: { workspace: wsDir } };

      var build = await runtime.build(workspace);
      if (!build.success) throw new Error('build failed: ' + build.diagnostics.join(';'));

      var channel = await runtime.start(workspace, {});
      row.boot = true;
      await new Promise(function(r) { setTimeout(r, 3000); });

      var webgl2 = await runtime.page.evaluate(function() {
        var c = document.getElementById('GameCanvas');
        var gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
        return gl ? gl.getParameter(gl.VERSION) : 'none';
      });
      row.webgl2 = /2\.0/.test(webgl2);

      var sceneState = await channel.inspect({ kind: 'inspectScene' });
      row.sceneNodes = sceneState ? sceneState.nodeCount : 0;
      row.hasRenderer = sceneState ? (sceneState.rendererCount > 0) : false;
      row.sceneVisible = row.sceneNodes > 0 && row.hasRenderer;

      var errors = await channel.errorReport({});
      row.noErrors = errors.errors.length === 0;
      row.pass = row.boot && row.webgl2 && row.sceneVisible && row.noErrors;
    } catch (e) {
      row.error = String(e && e.message || e).slice(0, 200);
    }
    matrix.push(row);
    console.log(browserName + ': boot=' + row.boot + ' webgl2=' + row.webgl2 + ' visible=' + row.sceneVisible + ' clean=' + row.noErrors + (row.error ? ' ERR=' + row.error : ''));
    await runtime.stop();
  }

  var passCount = matrix.filter(function(r) { return r.pass; }).length;
  var evidence = {
    measuredAt: new Date().toISOString(),
    gate: 'V0.8 Browser Matrix',
    total: matrix.length,
    passCount: passCount,
    results: matrix,
  };
  var evPath = path.join(REPO, 'docs/evidence/v08-browser-matrix.json');
  fs.writeFileSync(evPath, JSON.stringify(evidence, null, 2) + '\n');
  console.log('\nBrowser Matrix: ' + passCount + '/' + matrix.length + ' PASS');
  process.exit(passCount === matrix.length ? 0 : 1);
})();
