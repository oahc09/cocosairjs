/* V0.5.1 T1 Gate G1: tarball consumer acceptance (async, real import()).
 * 0. Assert every published build/*.js still carries the builtins src/ registers (F-82)
 * 1. `npm pack` the engine
 * 2. Create a standalone consumer package in a temp dir
 * 3. `npm install` the tarball (alias: cocosair) — the installed package is NOT modified
 * 4. Dynamic import() the installed module for real. The engine is browser-first: module
 *    evaluation needs window/navigator/document, so the import runs against a jsdom global
 *    scope (jsdom comes from THIS repo's devDependencies; the consumer tree stays untouched).
 * 5. Assert the exported API surface (createAirApp/GLTFLoader/... and total export count)
 * 6. Assert build/gltf-decoders/{draco,meshopt,basis} + build/package.json are present
 * 7. Validate every relative link in the packaged README resolves inside the package
 * Exit code 0 = pass. Machine-readable JSON on stdout.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { pathToFileURL } = require('url');
const root = path.resolve(__dirname, '../..');
const failures = [];

function run (cmd, opts) {
    return execSync(cmd, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, ...opts });
}

(async () => {
// 0. F-82: every published build/*.js must carry what src/air/builtin/register.ts registers,
//    checked before packing so a stale bundle cannot reach a consumer.
const published = require('./published-artifacts.cjs').check();
for (const failure of published.failures) { failures.push(`published-artifacts: ${failure}`); }
console.log(`[t1] published-artifacts: ${published.markers.length} markers x ${published.checked.length} bundles, ${published.failures.length} fail`);

// 1. Pack the tarball
const tarball = JSON.parse(run('npm pack --json', { cwd: root }))[0].filename;
const tarballPath = path.join(root, tarball);
console.log(`[t1] tarball: ${tarball} (${fs.statSync(tarballPath).size} bytes)`);

// 2. Extract to a clean consumer dir (type: module — the consumer is a real ESM project)
const packDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cocosair-t1-')); // 不进 build/，避免被打入 tarball
const consumerDir = path.join(packDir, 'consumer');
fs.mkdirSync(consumerDir, { recursive: true });
fs.writeFileSync(path.join(consumerDir, 'package.json'), JSON.stringify({
    name: 'cocosair-consumer', version: '1.0.0', private: true,
    type: 'module',
    dependencies: { cocosair: `file:${tarballPath}` },
}, null, 2));
run('npm install --no-audit --no-fund', { cwd: consumerDir, stdio: 'pipe' });

// The installed package is used exactly as npm unpacked it (no type/field patching).
const nodeModules = path.join(consumerDir, 'node_modules', 'cocosair');

// 3. Verify installed tree
const requiredFiles = [
    'package.json',
    'build/package.json', // {"type":"module"} — makes the ESM .js entries resolvable
    'build/cocosair.module.js',
    'build/cocosair.module.min.js',
    'build/cocosair.module.d.ts',
    'build/gltf-decoders/MANIFEST.md',
    'build/gltf-decoders/meshopt/meshopt_decoder.cjs',
    'build/gltf-decoders/draco/draco3d.js',
    'build/gltf-decoders/draco/draco_decoder.wasm',
    'build/gltf-decoders/basis/basis_transcoder.js',
    'build/gltf-decoders/basis/basis_transcoder.wasm',
    'README.md',
    'LICENSE',
    'docs/THIRD_PARTY_LICENSES.md',
];
for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(nodeModules, file))) { failures.push(`missing in installed package: ${file}`); }
}
// Assert no source/test/tools leaked into the package
for (const dir of ['src', 'test', 'tools', 'output']) {
    if (fs.existsSync(path.join(nodeModules, dir))) { failures.push(`installed package should not contain ${dir}/`); }
}
// build/package.json must really declare the module type (R1)
if (fs.existsSync(path.join(nodeModules, 'build', 'package.json'))) {
    const buildPkg = JSON.parse(fs.readFileSync(path.join(nodeModules, 'build', 'package.json'), 'utf8'));
    if (buildPkg.type !== 'module') { failures.push(`build/package.json must declare {"type":"module"}, got ${JSON.stringify(buildPkg)}`); }
}

// 4. Real dynamic import() of the installed entry, with browser globals from jsdom.
// The engine evaluates browser globals at module scope (SystemInfo reads window.navigator);
// that is a documented runtime characteristic — the consumer gate must still perform the
// actual import instead of patching or skipping it.
let exportCount = 0;
const entryPath = path.join(nodeModules, 'build', 'cocosair.module.js');
try {
    const { JSDOM } = require(path.join(root, 'node_modules', 'jsdom'));
    // 引擎 ScreenAdapter 约束：模块求值期即按 id 查找 GameCanvas（docs/06）。
    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><canvas id="GameCanvas"></canvas></body></html>', { url: 'http://localhost/validate/' });
    globalThis.window = dom.window;
    for (const key of ['document', 'navigator', 'location', 'CustomEvent', 'Event', 'HTMLElement', 'HTMLCanvasElement', 'HTMLImageElement', 'HTMLVideoElement', 'MutationObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'matchMedia']) {
        if (dom.window[key] !== undefined && globalThis[key] === undefined) {
            Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
        }
    }
    // jsdom 无 canvas 实现：引擎模块求值（SystemInfo 字节序探测）只调用不消费结果。
    dom.window.HTMLCanvasElement.prototype.getContext = function () { return null; };
    dom.window.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,'; };
    const mod = await import(pathToFileURL(entryPath).href);
    exportCount = Object.keys(mod).length;
    const expected = ['createAirApp', 'GLTFLoader', 'GLTFAsset', 'Node', 'Scene', 'Vec3', 'MeshRenderer',
        'Camera', 'DirectionalLight', 'Animation', 'AnimationClip', 'Layers', 'Material', 'Texture2D'];
    for (const name of expected) {
        if (typeof mod[name] === 'undefined') { failures.push(`cocosair.${name} is missing from the installed module`); }
    }
    if (exportCount < 100) { failures.push(`implausibly low export count: ${exportCount}`); }
} catch (error) {
    failures.push(`dynamic import of installed module failed: ${String(error && error.stack ? error.stack.split('\n').slice(0, 3).join(' | ') : error).slice(0, 400)}`);
}

// 5. TypeScript type consumption (bundler resolution, strict)
const tsOut = path.join(consumerDir, 'type-test.ts');
fs.writeFileSync(tsOut, [
    "import { createAirApp, GLTFLoader, GLTFAsset, Node, Scene, Vec3, MeshRenderer,",
    "  Camera, DirectionalLight, Animation, AnimationClip, Layers,",
    "  configureGLTFLoaderDefaults,",
    "} from 'cocosair';",
    "import type { GLTFLoaderOptions } from 'cocosair';",
    "const loader = new GLTFLoader();",
    "loader.setMeshoptDecoder(null); loader.setDRACODecoder(null); loader.setKTX2Transcoder(null);",
    "loader.register(() => ({ name: 'test', support: () => ({ name: 'test', status: 'supported' as const }) }));",
    "const entries = loader.getExtensionSupport();",
    "if (entries.length === 0) { throw new Error('empty'); }",
    "configureGLTFLoaderDefaults({});",
    "const opts: GLTFLoaderOptions = {};",
    "const scene = new Scene('test');",
    "const node = new Node('n');",
    "scene.addChild(node);",
    "const v = new Vec3(1, 2, 3);",
    "void v; void opts; void scene; void node; void loader;",
    "void createAirApp; void GLTFAsset; void MeshRenderer; void Camera; void DirectionalLight;",
    "void Animation; void AnimationClip; void Layers;",
].join('\n'));
const consumerTsconfig = path.join(consumerDir, 'tsconfig.json');
fs.writeFileSync(consumerTsconfig, JSON.stringify({
    compilerOptions: {
        strict: true, noEmit: true, skipLibCheck: true, target: 'es2020',
        module: 'node16', moduleResolution: 'node16',
        types: [], lib: ['es2020', 'dom'],
    }, include: ['type-test.ts'],
}, null, 2));
try {
    // 临时目录已移到系统 tmp：不能用 npx（会拉到假 tsc 包），直接用仓库内的 typescript。
    run(`node ${path.join(root, 'node_modules', 'typescript', 'bin', 'tsc')} -p ${consumerTsconfig}`, { cwd: consumerDir });
} catch (error) {
    failures.push(`consumer typecheck failed: ${String(error.stdout || error.message).slice(0, 300)}`);
}

// 6. README relative links must resolve inside the package (R7)
const readme = fs.readFileSync(path.join(nodeModules, 'README.md'), 'utf8');
const linkTargets = new Set();
for (const match of readme.matchAll(/\]\(([^)\s]+)\)/g)) { linkTargets.add(match[1]); }
for (const match of readme.matchAll(/`(docs\/[^`\s]+)`/g)) { linkTargets.add(match[1]); }
for (const target of linkTargets) {
    if (/^[a-z]+:|^\/|^#/i.test(target)) { continue; } // absolute URL / root / anchor — out of scope
    const clean = target.split('#')[0];
    if (!clean) { continue; }
    if (!fs.existsSync(path.join(nodeModules, clean))) {
        failures.push(`README links to missing packaged file: ${target}`);
    }
}

// 7. Cleanup
fs.rmSync(packDir, { recursive: true, force: true });
fs.rmSync(tarballPath, { force: true });

const report = { ok: failures.length === 0, failures, exportCount };
console.log(JSON.stringify(report, null, 2));
process.exit(failures.length ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
