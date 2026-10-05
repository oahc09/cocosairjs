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
const { execSync, execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const root = path.resolve(__dirname, '../..');
const failures = [];
const browserOut = process.argv.find((arg) => arg.startsWith('--browser-out='))?.slice(14);
const modernTsArg = process.argv.find((arg) => arg.startsWith('--modern-ts='))?.slice(12);
const modernTsPath = modernTsArg && path.resolve(root, modernTsArg);
if (process.argv.includes('--bootstrap-browser') && (!browserOut || fs.existsSync(path.resolve(root, browserOut)))) {
    throw new Error('--bootstrap-browser requires --browser-out=<new.json>');
}
let bundledConsumer;

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
    'build/npm/cocosair.module.js',
    'build/npm/cocosair.module.min.js',
    'build/cocosair.module.d.ts',
    'build/npm/bootstrap.js',
    'build/bootstrap.d.ts',
    'build/bootstrap.legacy.d.ts',
    'build/cocosair.legacy.d.ts',
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
// The safe package subpath must resolve and evaluate before any browser globals exist.
try {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e',
        "import { createAirApp } from 'cocosair/bootstrap'; if (typeof createAirApp !== 'function' || typeof document !== 'undefined') throw new Error('eager bootstrap'); console.log('BOOTSTRAP_NO_DOM_PASS');"],
        { cwd: consumerDir, encoding: 'utf8', timeout: 30000 });
    if (!output.includes('BOOTSTRAP_NO_DOM_PASS')) failures.push('safe bootstrap package subpath did not evaluate independently');
} catch (error) { failures.push(`safe bootstrap package subpath failed: ${String(error.message).slice(0, 300)}`); }
try {
    const built = require('esbuild').buildSync({ stdin: {
        contents: "export { createAirApp } from 'cocosair/bootstrap'; export function loadRuntime() { return import('cocosair'); }", resolveDir: consumerDir, sourcefile: 'bootstrap-consumer.js' },
        bundle: true, write: false, format: 'esm', splitting: true, platform: 'browser', target: 'es2020',
        outdir: path.join(packDir, 'bundled-consumer'), metafile: true });
    bundledConsumer = built;
    const inputs = Object.keys(built.metafile.inputs);
    if (!inputs.some((file) => /build[\\/]npm[\\/]cocosair\.module\.js$/.test(file)) || built.outputFiles.length < 2) {
        failures.push('safe bootstrap dynamic runtime import is not resolvable by a real consumer bundler');
    }
} catch (error) { failures.push(`safe bootstrap consumer bundling failed: ${String(error.message).slice(0, 300)}`); }
// The engine evaluates browser globals at module scope (SystemInfo reads window.navigator);
// that is a documented runtime characteristic — the consumer gate must still perform the
// actual import instead of patching or skipping it.
let exportCount = 0;
const entryPath = path.join(nodeModules, 'build', 'npm', 'cocosair.module.js');
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
        'Camera', 'DirectionalLight', 'Animation', 'AnimationClip', 'Layers', 'Material', 'Texture2D',
        'AssetBank', 'createActionState', 'createActionInput', 'createPrimitiveGeometry', 'AirAppImpl',
        'parseFnt', 'createBitmapFont', 'loadBitmapFont', 'Billboard', 'AirUIMesh',
        'parseAtlasText', 'createAtlasHandle', 'createAtlasSpriteFrame', 'loadAtlas',
        'AirRenderTarget', 'createAirRenderTarget', 'resolveAirTextureFormat', 'validateAirTextureColorContract',
        'validateAirPrefilteredEnvironment', 'bindAirPrefilteredEnvironment', 'inspectAirMaterial', 'describeAirTextureFormat'];
    for (const name of expected) {
        if (typeof mod[name] === 'undefined') { failures.push(`cocosair.${name} is missing from the installed module`); }
    }
    for (const name of ['prepareEffectForRegistration', 'createAirDepthSamplerTemplate', 'locateAirEffectBinding',
        'inspectAirRenderQueues', 'attachAirRenderQueueObserver']) {
        if (typeof mod[name] !== 'undefined') failures.push(`development-only ${name} leaked into the installed runtime`);
    }
    const hdrFormat = mod.Texture2D.PixelFormat.RGBA16F;
    if (!Number.isInteger(hdrFormat) || mod.resolveAirTextureFormat({ format: hdrFormat }) !== hdrFormat)
        failures.push('installed RGBA16F alias/format contract is missing or changes the format');
    if (mod.validateAirTextureColorContract({ format: hdrFormat, usage: 'linear-data', decode: 'none' }).format !== hdrFormat)
        failures.push('installed color preflight silently replaces HDR format');
    try { mod.resolveAirTextureFormat({ format: undefined }); failures.push('installed explicit undefined format was accepted'); }
    catch (error) { if (error.code !== 'AIR_E_TEXTURE_FORMAT') failures.push('installed invalid format diagnostic is missing'); }
    if (mod.inspectAirMaterial(new mod.Material()).length !== 0)
        failures.push('installed material inspector fabricates passes on an uninitialized native material');
    if (typeof mod.utils?.MeshUtils?.createDynamicMesh !== 'function') { failures.push('official dynamic mesh entry utils.MeshUtils.createDynamicMesh is missing from the installed module'); }
    for (const type of ['box', 'sphere', 'cylinder', 'cone']) {
        if (!require('node:util').isDeepStrictEqual(mod.createPrimitiveGeometry({ type }), mod.primitives[type]())) {
            failures.push('installed primitive descriptor differs from native geometry: ' + type);
        }
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
    "  configureGLTFLoaderDefaults, utils, createPrimitiveGeometry, createActionState, AssetBank, AudioService, TiledObjectGroup, parseFnt, createBitmapFont, loadBitmapFont, SpriteFrame, Billboard, AirUIMesh,",
    "} from 'cocosair';",
    "import { parseAtlasText, createAtlasHandle, createAtlasSpriteFrame, loadAtlas } from 'cocosair';",
    "import { AirRenderTarget, createAirRenderTarget, Texture2D, TextureCube, Material, resolveAirTextureFormat, validateAirTextureColorContract, validateAirPrefilteredEnvironment, bindAirPrefilteredEnvironment, inspectAirMaterial } from 'cocosair';",
    "import type { AirRenderTargetOptions, AirPrefilteredEnvironmentContract } from 'cocosair';",
    "// @ts-expect-error developer tools are not default runtime exports",
    "import { attachAirRenderQueueObserver } from 'cocosair';",
    "import type { GLTFLoaderOptions, AirAtlasDocument, AirAtlasHandle, AirAtlasLoadOptions } from 'cocosair';",
    "import { createAirApp as createSafeAirApp } from 'cocosair/bootstrap';",
    "const safeInit = createSafeAirApp({ canvas: '#GameCanvas', pixelRatioCap: 1.5, designResolution: { width: 640, height: 480, policy: 0 } });",
    "safeInit.then(app => { const token = app.session?.token(); void app.releaseScene?.(); void app.close?.(); });",
    "const decompression = new DecompressionStream('gzip');",
    "const renderOptions: AirRenderTargetOptions = { width: 640, height: 480, scale: 0.5, colorFormat: 'rgba16f', depthFormat: 'depth24-stencil8', samples: 4, filter: 'nearest', sampleFallback: 'lower' };",
    "const renderingTarget: AirRenderTarget = createAirRenderTarget(renderOptions);",
    "declare const offscreenCamera: Camera; declare const renderingMaterial: Material; declare const renderingScene: Scene; declare const renderingEnvironment: TextureCube;",
    "const detachTarget = renderingTarget.attachCamera(offscreenCamera, () => {}); const detachColor = renderingTarget.bindColor(renderingMaterial, 'sceneColor'); const detachDepth = renderingTarget.bindDepth(renderingMaterial, 'sceneDepth');",
    "renderingTarget.resize(800, 600); renderingTarget.resolve(); const actualTargetColor: Float32Array | Uint8Array = renderingTarget.readColor({ width: 1, height: 1 });",
    "const chosenSamples: number = renderingTarget.info.effective.samples; detachColor(); detachDepth(); detachTarget(); renderingTarget.dispose();",
    "resolveAirTextureFormat({ format: Texture2D.PixelFormat.RGBA16F }); validateAirTextureColorContract({ usage: 'linear-data', decode: 'none' });",
    "const envContract: AirPrefilteredEnvironmentContract = { distribution: 'ggx', roughnessLevels: [0, 0.5], encoding: 'rgbe', source: 'offline asset recipe' };",
    "validateAirPrefilteredEnvironment(renderingEnvironment, envContract); bindAirPrefilteredEnvironment(renderingScene, renderingEnvironment, envContract); const actualPasses = inspectAirMaterial(renderingMaterial);",
    "// @ts-expect-error target format is an explicit name, not a native numeric enum",
    "createAirRenderTarget({ width: 1, height: 1, colorFormat: Texture2D.PixelFormat.RGBA16F });",
    "void actualTargetColor; void chosenSamples; void actualPasses;",
    "const readable: ReadableStream<Uint8Array> = decompression.readable;",
    "const writable: WritableStream<BufferSource> = decompression.writable;",
    "const primitive = createPrimitiveGeometry({ type: 'cylinder', radiusTop: 0, radiusBottom: 1, height: 2 });",
    "const mesh = utils.createMesh(primitive);",
    "// @ts-expect-error box has dimensions, not a radius",
    "createPrimitiveGeometry({ type: 'box', radius: 1 });",
    "// @ts-expect-error geometry is not Mesh",
    "const wrongMesh: import('cocosair').Mesh = primitive;",
    "const actionState = createActionState({ actions: { jump: { mode: 'button', sources: [{ backend: 'dom', physicalCode: 'Space' }] } } });",
    "const bank = new AssetBank(); bank.load('/no-suffix', { ext: 'json', signal: new AbortController().signal });",
    "declare const audio: AudioService; audio.stopBgm(); audio.setBgmVolume(0.5);",
    "declare const objectGroup: TiledObjectGroup; objectGroup.getRawObjects(); objectGroup.getObjectsByType('Solid');",
    "declare const page: SpriteFrame; const data = parseFnt(''); const fontHandle = createBitmapFont(data, page);",
    "const atlasDoc: AirAtlasDocument = parseAtlasText('page.png\\nsize:16,16\\nblob\\nbounds:0,0,4,4\\n');",
    "declare const atlasPages: import('cocosair').Texture2D[]; const atlasHandle: AirAtlasHandle = createAtlasHandle(atlasDoc, atlasPages);",
    "const atlasFrame = createAtlasSpriteFrame(atlasDoc, atlasPages, atlasDoc.regions[0]); atlasHandle.getFrames('walk'); atlasHandle.dispose();",
    "const atlasOptions: AirAtlasLoadOptions = { bank, signal: new AbortController().signal, pageExt: 'png' }; void loadAtlas('/art/pack.atlas', atlasOptions);",
    "// @ts-expect-error atlas page textures must be Texture2D, not SpriteFrame",
    "createAtlasHandle(atlasDoc, [page]);",
    "fontHandle.dispose(); void loadBitmapFont('/font.fnt', { bank, signal: new AbortController().signal });",
    "declare const billboard: Billboard; billboard.width = 2; billboard.height = 1; billboard.rotation = 90; billboard.technique = 0;",
    "declare const viewportCamera: Camera; viewportCamera.orthoWidth = 489; viewportCamera.orthoHeight = 423; viewportCamera.orthoWidth = 0;",
    "declare const uiMesh: AirUIMesh; uiMesh.spriteFrame = page; uiMesh.setGeometry({ positions: [0,0,1,0,0,1], uvs: [0,0,1,0,0,1], indices: [0,1,2] }); uiMesh.dispose();",
    "void readable; void writable; void mesh; void actionState;",
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
    "const createDynamic = utils.MeshUtils.createDynamicMesh;",
    "void createDynamic;",
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
    const classicSource = path.join(consumerDir, 'type-classic.ts');
    fs.writeFileSync(classicSource, "import { createPrimitiveGeometry } from 'cocosair';\nconst decoder = new DecompressionStream('gzip');\nvoid decoder; void createPrimitiveGeometry;\n");
    execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict',
        '--skipLibCheck', '--target', 'es2020', '--module', 'commonjs', '--moduleResolution', 'node', classicSource],
        { cwd: consumerDir, encoding: 'utf8' });
} catch (error) {
    failures.push(`consumer typecheck failed: ${String(error.stdout || error.message).slice(0, 300)}`);
}
if (modernTsPath) {
    try {
        if (!fs.existsSync(modernTsPath)) throw new Error('compiler not found: ' + modernTsPath);
        const compilerVersion = execFileSync(process.execPath, [modernTsPath, '--version'], { encoding: 'utf8' }).trim();
        // The existing SDK contract uses skipLibCheck. File-list acceptance also
        // proves the legacy global augmentation was never loaded by this compiler.
        const resolved = execFileSync(process.execPath, [modernTsPath, '-p', consumerTsconfig, '--listFiles'],
            { cwd: consumerDir, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
        if (/cocosair\.legacy\.d\.ts|bootstrap\.legacy\.d\.ts/.test(resolved)) {
            failures.push('modern compiler incorrectly selected the TS4.9 ambient fallback');
        }
        if (!/cocosair\.module\.d\.ts/.test(resolved) || !/lib\.dom\.d\.ts/.test(resolved)) {
            failures.push('modern compiler did not load the SDK and native lib.dom declarations');
        }
        console.log('[t1] modern type consumer: ' + compilerVersion + ' PASS (native DOM entry)');
    } catch (error) { failures.push(`modern consumer typecheck failed: ${String(error.stdout || error.message).slice(0, 600)}`); }
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

if (process.argv.includes('--bootstrap-browser')) {
    try {
        const report = await require('./bootstrap-consumer-browser.cjs').verify({ root, built: bundledConsumer,
            out: path.resolve(root, browserOut), tarballPath });
        if (!report.scopePassed) failures.push('installed bundled bootstrap browser verification failed; see ' + browserOut);
    } catch (error) { failures.push('installed bundled bootstrap browser verification: ' + String(error.stack || error)); }
}
// 7. Cleanup
fs.rmSync(packDir, { recursive: true, force: true });
fs.rmSync(tarballPath, { force: true });

const report = { ok: failures.length === 0, failures, exportCount };
console.log(JSON.stringify(report, null, 2));
process.exit(failures.length ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
