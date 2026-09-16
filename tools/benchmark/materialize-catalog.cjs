/* V0.6 §48-§50 — 物化 100 Benchmark 的 fixtures 与冻结参考实现。
 * 运行：node tools/benchmark/materialize-catalog.cjs
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const esbuild = require('esbuild');

const REPO = path.resolve(__dirname, '..', '..');
const DIR = path.join(REPO, 'tools', 'benchmark');

esbuild.buildSync({
  entryPoints: [path.join(DIR, 'catalog', 'catalog100.ts')],
  bundle: true, format: 'cjs', platform: 'node', target: 'node18',
  outfile: path.join(REPO, 'build', '.cat100.cjs'), write: true,
});
const { CATALOG_BENCHMARKS, SPECS, REF_CODES } = require(path.join(REPO, 'build', '.cat100.cjs'));
esbuild.buildSync({
  entryPoints: [path.join(DIR, 'references', 'golden10-assets.ts')],
  bundle: true, format: 'cjs', platform: 'node', target: 'node18',
  outfile: path.join(REPO, 'build', '.golden-assets.cjs'), write: true,
});
const { REFERENCES: GOLDEN_REFERENCES } = require(path.join(REPO, 'build', '.golden-assets.cjs'));

const HTML = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script type="importmap">{"imports":{"cocosair":"/build/cocosair.module.js"}}</script>'
  + '<script src="/__bench-prelude.js"></script>'
  + '</head><body style="margin:0"><canvas id="GameCanvas" width="480" height="360"></canvas>'
  + '<script type="module" src="./src/main.ts"></script></body></html>';

const IMPORTS = "import { createAirApp, Scene, Node, MeshRenderer, Material, Animation, Camera, DirectionalLight, Layers, Vec3, Color, utils, primitives, builtinResMgr } from 'cocosair';";

function scaffold (spec) {
  const p = spec.params;
  const cubes = p.cubes || [];
  const cubeCode = cubes.map((c) => {
    const base = `spawnCube(${JSON.stringify(c.name)}, [${c.pos.join(', ')}]${c.scale ? `, [${c.scale.join(', ')}]` : ''});`;
    return base;
  }).join('\n');
  const cam = p.camera || {};
  const camSetup = [
    'const cameraNode = new Node(\'camera\');',
    'scene.addChild(cameraNode);',
    cam.pos ? `cameraNode.setPosition(new Vec3(${cam.pos.join(', ')}));` : 'cameraNode.setPosition(new Vec3(0, 3, 9));',
    cam.euler ? `cameraNode.setRotationFromEuler(${cam.euler.join(', ')});` : 'cameraNode.setRotationFromEuler(-18, 0, 0);',
    'const camera = cameraNode.addComponent(Camera);',
    'camera.visibility = Layers.Enum.DEFAULT;',
    "camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;",
    "camera.clearColor = new Color(30, 40, 60, 255);",
    cam.fov ? `camera.fov = ${cam.fov};` : '',
    cam.far ? `camera.far = ${cam.far};` : '',
    cam.ortho ? `camera.projection = Camera.ProjectionType.ORTHO;\ncamera.orthoHeight = ${cam.ortho};` : '',
  ].filter(Boolean).join('\n');
  const light = p.light || { kind: 'directional' };
  let lightCode = '';
  if (light.kind !== 'none') {
    if (light.kind === 'two-directional') {
      lightCode = [
        "const key = new Node('key-light'); scene.addChild(key);",
        'key.setPosition(new Vec3(0, 8, 0)); key.setRotationFromEuler(-45, -30, 0);',
        'const keyLight = key.addComponent(DirectionalLight); keyLight.illuminance = 2;',
        "const fill = new Node('fill-light'); scene.addChild(fill);",
        'fill.setPosition(new Vec3(-6, 4, 4)); fill.setRotationFromEuler(-30, 40, 0);',
        'const fillLight = fill.addComponent(DirectionalLight); fillLight.illuminance = 1;',
      ].join('\n');
    } else if (light.kind === 'spot') {
      lightCode = "const spotNode = new Node('spot'); scene.addChild(spotNode);\nspotNode.setPosition(new Vec3(0, 6, 3)); spotNode.setRotationFromEuler(-60, 0, 0);\nspotNode.addComponent(SpotLight);";
    } else if (light.kind === 'sphere') {
      lightCode = "const sphereLightNode = new Node('sphere-light'); scene.addChild(sphereLightNode);\nsphereLightNode.setPosition(new Vec3(0, 5, 2));\nsphereLightNode.addComponent(SphereLight);";
    } else if (light.kind === 'ranged-directional') {
      lightCode = "const rangedNode = new Node('ranged'); scene.addChild(rangedNode);\nrangedNode.setRotationFromEuler(-45, -30, 0);\nrangedNode.addComponent(RangedDirectionalLight);";
    } else {
      lightCode = [
        "const lightNode = new Node('light');",
        'scene.addChild(lightNode);',
        light.pos ? `lightNode.setPosition(new Vec3(${light.pos.join(', ')}));` : 'lightNode.setPosition(new Vec3(0, 8, 0));',
        light.euler ? `lightNode.setRotationFromEuler(${light.euler.join(', ')});` : 'lightNode.setRotationFromEuler(-45, -30, 0);',
        `const light = lightNode.addComponent(DirectionalLight);`,
        light.illuminance !== undefined ? '' : 'light.illuminance = 2;',
        light.illuminance !== undefined ? `light.illuminance = ${light.illuminance};` : '',
      ].filter(Boolean).join('\n');
    }
  }
  const meshKind = p.mesh;
  const spawnBody = meshKind === 'torus' ? 'utils.createMesh(primitives.torus(0.6, 0.18))'
    : meshKind === 'cylinder' ? 'utils.createMesh(primitives.cylinder(0.5, 0.5, 1.5))'
    : meshKind === 'mixed-plane' && false ? '' : 'utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }))';
  const planeSpawn = meshKind === 'mixed-plane'
    ? `spawnCube('ground', [0, -0.5, 0]);
const groundRenderer = scene.getChildByName('ground')!.getComponent(MeshRenderer)!;
groundRenderer.mesh = utils.createMesh(primitives.plane({ width: 8, length: 8, widthSegments: 1, lengthSegments: 1 }));
groundRenderer.node.setRotationFromEuler(-90, 0, 0);`
    : '';
  const material = p.material === 'builtin-unlit-material' ? 'builtin-unlit-material'
    : p.material === 'builtin-transparent-material' ? 'builtin-transparent-material'
    : 'builtin-standard-material';
  const materialAssign = p.independentMaterials
    ? `    const material = new Material();\n    material.initialize({ effectName: 'builtin-standard' });\n    renderer.material = material;`
    : `    renderer.material = builtinResMgr.get<import('cocosair').Material>('${material}');`;
  const cubeFn = [
    'function spawnCube (name: string, pos: number[], scale?: number[]): void {',
    '    const node = new Node(name);',
    '    node.layer = Layers.Enum.DEFAULT;',
    '    node.setPosition(new Vec3(pos[0], pos[1], pos[2]));',
    '    if (scale) { node.setScale(new Vec3(scale[0], scale[1], scale[2])); }',
    '    scene.addChild(node);',
    '    const renderer = node.addComponent(MeshRenderer);',
    `    renderer.mesh = ${spawnBody};`,
    materialAssign,
    '}',
  ].join('\n');
  const extraImport = meshKind === 'mixed-plane' ? '' : '';
  return [
    IMPORTS + (p.light && ['spot', 'sphere', 'ranged-directional', 'two-directional'].includes(p.light.kind)
      ? "import { SpotLight, SphereLight, RangedDirectionalLight } from 'cocosair';" : ''),
    '',
    "const app = await createAirApp({ canvas: '#GameCanvas' });",
    "(window as unknown as { __airApp: unknown }).__airApp = app;",
    `const scene = new Scene('${p.id || 'catalog'}');`,
    camSetup,
    lightCode,
    cubeFn,
    cubeCode,
    planeSpawn,
    p.extra ? String(p.extra) : '',
    '',
    'app.run(scene);',
    '',
  ].filter((l) => l !== null).join('\n');
}

const manifestPath = path.join(DIR, 'references', 'frozen', 'MANIFEST.json');
let manifest = { revision: 'catalog100-r2-typechecked', fixtures: {}, references: {} };
try { manifest = { ...JSON.parse(fs.readFileSync(manifestPath, 'utf8')), revision: 'catalog100-r2-typechecked' }; } catch { }
let refCount = 0;
for (const def of CATALOG_BENCHMARKS) {
  const spec = SPECS.get(def.id);
  if (spec.template === 'golden') { continue; } // golden 段由 materialize-golden10.cjs 全权负责
  const fixtureDir = path.join(DIR, 'fixtures', def.id);
  fs.mkdirSync(path.join(fixtureDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(fixtureDir, 'index.html'), HTML, 'utf8');
  const files = { 'index.html': HTML, 'src/main.ts': `// TODO (${def.id}): ${def.prompt.slice(0, 120)}\n` };
  if (def.benchmarkType === 'runtime-control' && REF_CODES.get(def.id)) {
    // runtime-control 的起点 = 可运行的预 attached 应用（参考实现即起点）
    files['src/main.ts'] = REF_CODES.get(def.id);
  }
  manifest.fixtures[def.id] = { files: Object.keys(files) };
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(fixtureDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }
  // 冻结参考实现（source 类型）
  if (def.referenceImplementation) {
    let code = REF_CODES.get(def.id) ?? (spec.template === 'golden' ? GOLDEN_REFERENCES[def.id] : undefined);
    if (!code && spec.template === 'scene-cubes') { code = scaffold(spec); }
    if (!code) { throw new Error(`missing reference code for ${def.id}`); }
    code = code.replace(/\$\{id\}/g, def.id);
    const refAbs = path.join(DIR, 'references', 'frozen', def.referenceImplementation);
    fs.mkdirSync(path.dirname(refAbs), { recursive: true });
    fs.writeFileSync(refAbs, code, 'utf8');
    manifest.references[def.id] = crypto.createHash('sha256').update(fs.readFileSync(refAbs)).digest('hex');
    refCount++;
  }
  // 资产副本
  const assets = [];
  if (/BoxTextured|boxtextured/i.test(def.prompt)) { assets.push(['examples/gltf-viewer/assets/BoxTextured.glb', 'assets/BoxTextured.glb']); }
  if (/compressed\.glb/i.test(def.prompt)) { assets.push(['tools/benchmark/fixtures/B051/assets/compressed.glb', 'assets/compressed.glb']); }
  if (/sequential-draco\.glb/i.test(def.prompt)) { assets.push(['tools/benchmark/fixtures/B051/assets/compressed.glb', 'assets/sequential-draco.glb']); }
  if (/SimpleSkin\.gltf/i.test(def.prompt)) {
    assets.push(['examples/gltf-viewer/assets/SimpleSkin.gltf', 'assets/SimpleSkin.gltf']);
    for (const f of ['SimpleSkin_geometry.bin', 'SimpleSkin_skinningData.bin', 'SimpleSkin_inverseBindMatrices.bin', 'SimpleSkin_animation.bin']) {
      assets.push([path.join('examples/gltf-viewer/assets', f), path.join('assets', f)]);
    }
  }
  if (/AnimatedMorphCube\.glb/i.test(def.prompt)) { assets.push(['examples/gltf-viewer/assets/AnimatedMorphCube.glb', 'assets/AnimatedMorphCube.glb']); }
  for (const [srcRel, dstRel] of assets) {
    const src = srcRel.startsWith('tools/') || srcRel.startsWith('examples/') ? path.join(REPO, srcRel) : srcRel;
    const dst = path.join(fixtureDir, dstRel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}
fs.writeFileSync(path.join(DIR, 'references', 'frozen', 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('[catalog100] fixtures:', Object.keys(manifest.fixtures).length, 'references:', refCount);
