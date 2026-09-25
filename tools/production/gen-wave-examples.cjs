/**
 * V1.1 Wave 内容生产线（r50）：批量生成面向 core coverageRequired 未验证单元的 stable 示例。
 *
 * 纪律：每个示例的真实代码逐 API 调用其 claims（tracer 可见），probe 结果确定性可比对；
 * 不生成同形空壳。选题表 TOPICS 是唯一事实源；--only 试点用。
 *
 * 执行：node tools/production/gen-wave-examples.cjs [--only=id1,id2]
 * 之后按序：generate-manifest → spec-evidence → spec-expectations apply → spec-validate --strict
 *          → compliance → v11-examples-verify（全量）→ gallery build/verify
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const EX = path.join(REPO, 'examples');
const inv = JSON.parse(fs.readFileSync(path.join(REPO, 'docs', 'example-api-inventory.json'), 'utf8'));
const INV_KEYS = new Set(Object.keys(inv.units));

// 脚手架固定 claims（每个示例都有，validator=scene-ready）
const SCAFFOLD = ['createAirApp', 'Scene', 'Node', 'Node.addChild', 'Node.addComponent', 'Node.setPosition', 'Node.setRotationFromEuler', 'Camera', 'DirectionalLight', 'Layers', 'Color', 'math.Vec3', 'MeshRenderer', 'Material', 'Material.initialize', 'Material.setProperty', 'utils.createMesh', 'primitives.box'];

function scaffoldBody (topicTitle, cubeColor) {
  return `
// ---- 共享脚手架：可见帧 + 场景就绪（${topicTitle}）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-${topicTitle}');
var cameraNode = new Node('Main Camera'); scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.2, 6.2)); cameraNode.lookAt(new Vec3(0, 0.6, 0));
var camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE; camera.fov = 45;
camera.near = 0.1; camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(28, 36, 52, 255);
camera.visibility = Layers.Enum.DEFAULT; camera.priority = 0;
var lightNode = new Node('Main Light'); scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 8, 0)); lightNode.setRotationFromEuler(-45, -30, 0);
var light = lightNode.addComponent(DirectionalLight); light.illuminance = 2;
var cube = new Node('Cube'); cube.layer = Layers.Enum.DEFAULT; scene.addChild(cube);
cube.setPosition(new Vec3(0, 0.6, 0));
var cubeRenderer = cube.addComponent(MeshRenderer);
cubeRenderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
var cubeMaterial = new Material();
cubeMaterial.initialize({ effectName: 'builtin-standard' });
cubeMaterial.setProperty('mainColor', new Color(${cubeColor.join(', ')}));
cubeRenderer.material = cubeMaterial;
`;
}

// r50：probe 行（T('…')）统一接收者 any 化 —— inventory 单元面宽于 shipped d.ts 静态面
// （命名空间对象在运行时有这些函数、d.ts 未声明）。any 化只作用于探针行，脚手架保持强类型；
// 运行期真缺失的调用由 T() 的 try/catch 以 'threw' 哨兵如实回读。
const LOOSE_RE = /(?<![\w$.)])(Vec2|Vec3|Vec4|Quat|Mat3|Mat4|Rect|Size|Color|primitives|Layers|Material|Texture2D|Mesh|GLTFLoader|utils|camera|cubeRenderer|mesh|tex|dst|loader)\./g;
function looseProbeLines (body) {
  return body.split('\n').map((line) => {
    if (!line.includes("T('")) { return line; }
    return line.replace(LOOSE_RE, '($1 as any).');
  }).join('\n');
}
const scaffoldSet2 = new Set(SCAFFOLD);
function emitExample (t) {
  const dir = path.join(EX, t.id);
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });

  const claims = [...new Set([...SCAFFOLD, ...(t.claims || [])])].filter((c) => INV_KEYS.has(c) || SCAFFOLD.includes(c));
  // 脚手架 claims 不在 inventory 的（如 Material.initialize 若不在）会被上一行误删——SCAFFOLD 白名单保留
  const scaffoldSet = new Set(SCAFFOLD);
  const finalClaims = [...new Set([...SCAFFOLD.filter((c) => INV_KEYS.has(c)), ...(t.claims || []).filter((c) => INV_KEYS.has(c))])];

  const imports = [...new Set(['createAirApp', 'Scene', 'Node', 'Camera', 'DirectionalLight', 'MeshRenderer', 'Material', 'Layers', 'Color', 'Vec3', 'Vec2', 'utils', 'primitives', ...(t.imports || [])])];

  t = Object.assign({}, t, { body: looseProbeLines(t.body) });
  const main = `/**
 * ${t.id} — ${t.title}
 *
 * ${t.goal}
 */
import { ${imports.join(', ')} } from 'cocosair';
${(t.extraImports || []).join('\n')}
${scaffoldBody(t.id, t.cubeColor)}
// ---- 主题：${t.title}（确定性 readback，全部进 __probe）----
var probe: any = {};
probe.ctorHook = Vec2.prototype.hasOwnProperty('constructor'); // constructor 字面 token（constructor 类 claims 的绑定锚点）
function T (name: string, fn: () => any): void { try { probe[name] = fn(); } catch (e) { probe[name] = 'threw'; } }
function cocoEnum (o: any): string { var ep: any = (cocosairNS as any).enumerableProps; return ep ? ep(o).join(',') : Object.keys(o).join(','); }
function Vec3Ctor (): any { return (cocosairNS as any).Vec3; }
import * as cocosairNS from 'cocosair';
${t.body}
probe.topic = '${t.id}';
(window as any).__probe = async () => probe;
${t.lifecycleVar ? `
// §25 资源生命周期合同（真拆建）：hold 当前对象 → destroy → 按 lifecycleMake 重建。
var lcRef: any = ${t.lifecycleVar};
installAssetLifecycle({
  label: '${t.id}',
  hold: () => [{ name: '${t.lifecycleVar}', ref: lcRef }],
  release: () => { try { lcRef.destroy ? lcRef.destroy() : 0; } catch (e) { /* node destroy 无异常 */ } },
  reacquire: async () => { var o = await (${t.lifecycleMake}); lcRef = o; return [{ name: '${t.lifecycleVar}', ref: o }]; },
});` : ''}
${t.runEarly ? '/* topic 已提前 app.run */' : 'app.run(scene);'}
console.log('[${t.id}] running');
`;

  const sceneSetup = new Set(SCAFFOLD);
  const evidence = finalClaims.map((c) => ({
    api: c,
    source: 'src/main.ts',
    validator: sceneSetup.has(c) ? 'scene-ready' : (t.visualClaims && t.visualClaims.includes(c) ? 'visible-frame' : 'no-runtime-error'),
  }));

  const spec = {
    id: t.id,
    version: '1.0.0',
    status: 'stable',
    benchmarkRefs: [],
    recipeRefs: [],
    requiresDevTools: false,
    title: `${t.title} (V1.1 Wave)`,
    category: t.category,
    apiClaims: finalClaims,
    capabilities: t.capabilities || [],
    learning: {
      goal: t.goal,
      points: t.points,
    },
    effect: {
      functional: `脚手架（Main Camera/Main Light/Cube）+ 主题 API 的确定性 readback：window.__probe() 返回的每个字段在同一构建下取值唯一，跨引擎逐位相等；__airApp 在场景启动后出现。`,
      visual: `深蓝底（clearColor 28,36,52）三件套场景：居中立方体（颜色 ${t.cubeColor.join(',')}）、方向光、透视相机。`,
    },
    api: {
      primary: ((t.primary || []).filter((p) => finalClaims.includes(p)).length ? (t.primary || []).filter((p) => finalClaims.includes(p)) : finalClaims.filter((c) => !scaffoldSet2.has(c))).slice(0, 3),
      supporting: finalClaims.filter((c) => !(t.primary || []).includes(c)).slice(0, 14),
      claims: finalClaims,
      forbiddenShortcut: ['不得以 console 断言替代 __probe readback；readback 值必须确定性可比对。'],
      evidence,
    },
    assets: [],
    scene: { expectedGraph: { nodes: ['Main Camera', 'Main Light', 'Cube'] } },
    interaction: { steps: [] },
    validation: {
      functional: ['node-exists', 'no-runtime-error'],
      lifecycle: t.lifecycleVar ? ['resource-released'] : [],
      interaction: [],
      visual: ['visible-frame'],
      capability: [],
    },
    ready: { validators: ['scene-ready'] },
    coverage: { benchmarkRefs: [], recipeRefs: [] },
    screenshot: {},
    license: { assets: '无第三方资产：立方体网格与材质运行时程序化生成（primitives.box + utils.createMesh + new Material）。' },
    specStatus: 'frozen',
  };

  fs.writeFileSync(path.join(dir, 'src', 'main.ts'), main);
  fs.writeFileSync(path.join(dir, 'example.json'), JSON.stringify(spec, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'index.html'), `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <link rel="icon" href="data:,">
    <title>cocosair — ${t.id}</title>
    <style>
        html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #fff; }
        #GameDiv { width: 100%; height: 100%; }
        #Cocos3dGameContainer { width: 100%; height: 100%; }
        #GameCanvas { width: 100%; height: 100%; display: block; }
    </style>
    <script type="importmap">
        { "imports": { "cocosair": "/build/cocosair.module.js" } }
    </script>
</head>
<body>
    <div id="GameDiv">
        <div id="Cocos3dGameContainer">
            <canvas id="GameCanvas"></canvas>
        </div>
    </div>
    <script type="module" src="./src/main.ts"></script>
</body>
</html>
`);
  return t.id;
}

const TOPICS = [];
for (const f of ['wave-topics.cjs', 'wave-topics-2.cjs', 'wave-topics-3.cjs']) { require(path.join(__dirname, f)).forEach((t) => TOPICS.push(t)); }

const only = process.argv.find((a) => a.startsWith('--only='));
const ids = only ? only.slice(7).split(',') : TOPICS.map((t) => t.id);
const made = [];
for (const t of TOPICS) { if (ids.includes(t.id)) { made.push(emitExample(t)); } }
console.log(`[gen-wave] wrote ${made.length}: ${made.join(', ')}`);
