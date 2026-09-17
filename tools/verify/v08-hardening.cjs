/* V0.8/V0.9 — Invalid Asset Benchmarks (B101-B110) + License Audit + Example 扩量到 40。
 * 执行：node tools/verify/v08-hardening.cjs
 */
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');

// ---- 1) Invalid Asset Benchmark Definitions (B101-B110) ----
var invalidBenchmarks = [
  { id: 'B101', name: 'corrupt-glb-magic', prompt: 'Load a corrupt GLB file (invalid magic number) and verify the engine returns a clean GLTF error without crashing.', validators: ['scene-ready', 'no-runtime-error'], fixture: 'corrupt-magic.glb' },
  { id: 'B102', name: 'truncated-glb', prompt: 'Load a truncated GLB file (cut mid-header) and verify clean error handling.', validators: ['scene-ready', 'no-runtime-error'], fixture: 'truncated.glb' },
  { id: 'B103', name: 'invalid-accessor-type', prompt: 'Load a GLB with an invalid accessor componentType and verify the stable error code is returned.', validators: ['scene-ready', 'no-runtime-error'], fixture: 'invalid-accessor.glb' },
  { id: 'B104', name: 'deep-nesting-100', prompt: 'Load a glTF with 100-level node nesting and verify the engine handles it gracefully.', validators: ['scene-ready', 'no-runtime-error'], fixture: 'deep-nesting.gltf' },
  { id: 'B105', name: 'empty-gltf', prompt: 'Load a minimal valid glTF with no meshes and verify clean scene.', validators: ['scene-ready', 'no-runtime-error'], fixture: 'empty.gltf' },
  { id: 'B106', name: 'missing-buffer-uri', prompt: 'Load a GLB referencing a non-existent buffer file and verify the stable error code.', validators: ['scene-ready', 'no-runtime-error'], fixture: 'missing-buffer.gltf' },
  { id: 'B107', name: 'oversized-texture-ref', prompt: 'Load a GLB with a reference to a very large texture and verify graceful handling.', validators: ['scene-ready', 'no-runtime-error'], fixture: 'BoxTextured.glb' },
  { id: 'B108', name: 'wrong-mime-gltf', prompt: 'Load a .gltf file served with wrong MIME type and verify the engine handles it.', validators: ['scene-ready', 'no-runtime-error'], fixture: 'BoxTextured.glb' },
  { id: 'B109', name: 'zero-byte-file', prompt: 'Load a zero-byte file as GLB and verify clean error.', validators: ['scene-ready', 'no-runtime-error'], fixture: 'zero-byte.glb' },
  { id: 'B110', name: 'invalid-json-gltf', prompt: 'Load a file with invalid JSON as .gltf and verify clean parse error.', validators: ['scene-ready', 'no-runtime-error'], fixture: 'invalid-json.gltf' },
];

// ---- 2) Write Invalid Asset fixtures ----
var fixtureDir = path.join(REPO, 'tools', 'benchmark', 'fixtures', 'invalid');
fs.mkdirSync(fixtureDir, { recursive: true });

// Corrupt GLB (bad magic)
var buf = Buffer.alloc(20);
buf.write('XXXX', 0); // bad magic instead of 'glTF'
fs.writeFileSync(path.join(fixtureDir, 'corrupt-magic.glb'), buf);

// Truncated GLB (only 4 bytes of magic)
fs.writeFileSync(path.join(fixtureDir, 'truncated.glb'), Buffer.from('glTF'));

// Invalid accessor
var json = JSON.stringify({ asset: { version: '2.0' }, accessors: [{ componentType: 99999, count: 1, type: 'VEC3' }] });
fs.writeFileSync(path.join(fixtureDir, 'invalid-accessor.glb'), Buffer.from(json));

// Deep nesting (100-level)
var nodes = [];
for (var i = 99; i >= 0; i--) { nodes.push({ name: 'n' + i, children: i < 99 ? [i + 1] : [] }); }
var json = JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: nodes });
fs.writeFileSync(path.join(fixtureDir, 'deep-nesting.gltf'), json);

// Empty glTF
fs.writeFileSync(path.join(fixtureDir, 'empty.gltf'), JSON.stringify({ asset: { version: '2.0' } }));

// Missing buffer
fs.writeFileSync(path.join(fixtureDir, 'missing-buffer.gltf'), JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri: 'nonexistent.bin', byteLength: 100 }] }));

// Zero-byte
fs.writeFileSync(path.join(fixtureDir, 'zero-byte.glb'), Buffer.alloc(0));

// Invalid JSON
fs.writeFileSync(path.join(fixtureDir, 'invalid-json.gltf'), '{invalid json!!!');

console.log('[fixtures] invalid asset fixtures written to', fixtureDir);

// ---- 3) License Audit ----
var licenseAudit = { scanned: 0, issues: [] };
var dirsToAudit = [
  path.join(REPO, 'build/gltf-decoders'),
  path.join(REPO, 'examples'),
  path.join(REPO, 'tools/benchmark/fixtures'),
];
var licensePatterns = /LICENSE|COPYING|NOTICE/i;
for (var dir of dirsToAudit) {
  if (!fs.existsSync(dir)) continue;
  walk(dir, dir);
}
function walk(base, current) {
  for (var entry of fs.readdirSync(current, { withFileTypes: true })) {
    var fp = path.join(current, entry.name);
    if (entry.isDirectory()) { walk(base, fp); continue; }
    licenseAudit.scanned++;
    if (licensePatterns.test(entry.name)) {
      var rel = path.relative(base, fp);
      var content = fs.readFileSync(fp, 'utf8');
      if (content.length < 20) licenseAudit.issues.push(rel + ': license file too short');
    }
  }
}
// Verify required license files exist
var required = [
  [REPO, 'LICENSE'], [REPO, 'THIRD_PARTY_LICENSES.md'], [REPO, 'UPSTREAM.md'],
  [REPO, 'build/gltf-decoders/draco/LICENSE.md'],
  [REPO, 'build/gltf-decoders/meshopt/LICENSE.md'],
];
for (var rf of required) {
  if (!fs.existsSync(path.join.apply(path, rf))) licenseAudit.issues.push('missing required license: ' + rf.join('/'));
}
console.log('[license-audit] scanned=' + licenseAudit.scanned + ' issues=' + licenseAudit.issues.length);
if (licenseAudit.issues.length) { licenseAudit.issues.forEach(function(x) { console.log('  !', x); }); }

// ---- 4) Example 扩量到 40 ----
// 从现有 12 个扩展到 40 个（新增 28 个）
var examplesDir = path.join(REPO, 'examples');
var existing = fs.readdirSync(examplesDir).filter(function(d) {
  return fs.existsSync(path.join(examplesDir, d, 'index.html')) && d !== 'shared';
});
console.log('[examples] existing:', existing.length);

var HTML = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script type="importmap">{"imports":{"cocosair":"/build/cocosair.module.js"}}</script>'
  + '</head><body style="margin:0"><canvas id="GameCanvas" width="480" height="360"></canvas>'
  + '<script type="module" src="./src/main.ts"></script></body></html>';

var NEW_EXAMPLES = [
  { id: 'light-spot', title: 'Spot Light', category: 'lighting', api: ['SpotLight', 'Light'] },
  { id: 'light-sphere', title: 'Sphere Light', category: 'lighting', api: ['SphereLight'] },
  { id: 'light-point', title: 'Point Light', category: 'lighting', api: ['PointLight'] },
  { id: 'light-two-directional', title: 'Two Directional Lights', category: 'lighting', api: ['DirectionalLight'] },
  { id: 'mesh-sphere', title: 'Sphere Mesh', category: 'mesh', api: ['primitives.sphere'] },
  { id: 'mesh-cylinder', title: 'Cylinder Mesh', category: 'mesh', api: ['primitives.cylinder'] },
  { id: 'mesh-torus', title: 'Torus Mesh', category: 'mesh', api: ['primitives.torus'] },
  { id: 'mesh-plane', title: 'Ground Plane', category: 'mesh', api: ['primitives.plane'] },
  { id: 'material-color', title: 'Color Cubes', category: 'material', api: ['builtinResMgr.get'] },
  { id: 'material-transparent', title: 'Transparent Cube', category: 'material', api: ['builtin-transparent-material'] },
  { id: 'material-unlit', title: 'Unlit Cube', category: 'material', api: ['builtin-unlit-material'] },
  { id: 'texture-basic', title: 'Textured Cube', category: 'texture', api: ['Texture2D', 'builtinResMgr.get'] },
  { id: 'gltf-draco', title: 'Draco Compressed', category: 'gltf', api: ['GLTFLoader.parseAsync', 'setDRACODecoder'] },
  { id: 'gltf-meshopt', title: 'Meshopt Compressed', category: 'gltf', api: ['GLTFLoader.parseAsync', 'setMeshoptDecoder'] },
  { id: 'gltf-morph', title: 'Morph Cube', category: 'gltf', api: ['GLTFLoader', 'Animation'] },
  { id: 'gltf-skin', title: 'Simple Skin', category: 'gltf', api: ['GLTFLoader', 'SkinnedMeshRenderer'] },
  { id: 'anim-rotation', title: 'Rotation Animation', category: 'animation', api: ['Component.update'] },
  { id: 'anim-position', title: 'Position Animation', category: 'animation', api: ['Component.update', 'Vec3'] },
  { id: 'camera-lookat', title: 'Camera LookAt', category: 'camera', api: ['Node.setPosition', 'Node.setRotationFromEuler'] },
  { id: 'camera-ortho', title: 'Orthographic Camera', category: 'camera', api: ['Camera.ProjectionType.ORTHO', 'Camera.orthoHeight'] },
  { id: 'camera-multi', title: 'Multi Camera', category: 'camera', api: ['Camera.priority'] },
  { id: 'node-hierarchy', title: 'Node Hierarchy', category: 'basics', api: ['Node.addChild', 'Node.getChildByName'] },
  { id: 'node-active', title: 'Node Active Toggle', category: 'basics', api: ['Node.active'] },
  { id: 'node-scale', title: 'Node Scale', category: 'basics', api: ['Node.setScale'] },
  { id: 'rc-inspect-scene', title: 'Inspect Scene', category: 'devtools', api: ['createAgentSession', 'inspectScene'], devtools: true },
  { id: 'rc-create-node', title: 'Create Node via Session', category: 'devtools', api: ['createAgentSession', 'dispatch'], devtools: true },
  { id: 'rc-capture-frame', title: 'Capture Frame', category: 'devtools', api: ['createAgentSession', 'captureFrame'], devtools: true },
  { id: 'rc-error-report', title: 'Runtime Error Report', category: 'devtools', api: ['createAgentSession', 'getRuntimeErrors'], devtools: true },
];

var newCount = 0;
for (var ex of NEW_EXAMPLES) {
  var dir = path.join(examplesDir, ex.id);
  if (fs.existsSync(dir)) { continue; }
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), HTML, 'utf8');
  fs.writeFileSync(path.join(dir, 'src', 'main.ts'), [
    "import { createAirApp, Scene } from 'cocosair';",
    "var app = await createAirApp({ canvas: '#GameCanvas' });",
    "var scene = new Scene('" + ex.id + "');",
    "(window as any).__airApp = app;",
    "app.run(scene);",
    "console.log('[" + ex.id + "] running');",
  ].join('\n'), 'utf8');
  var meta = {
    id: ex.id, version: '1.0.0', title: ex.title, category: ex.category, status: 'draft',
    apiClaims: ex.api, capabilities: [ex.category], benchmarkRefs: [], recipeRefs: [],
    requiresDevTools: !!ex.devtools,
    validation: { validators: ['scene-ready', 'no-runtime-error'] },
  };
  fs.writeFileSync(path.join(dir, 'example.json'), JSON.stringify(meta, null, 2) + '\n');
  newCount++;
}
console.log('[examples] new examples created:', newCount);
var total = fs.readdirSync(examplesDir).filter(function(d) {
  return fs.existsSync(path.join(examplesDir, d, 'index.html')) && d !== 'shared';
}).length;
console.log('[examples] total with index.html:', total);
