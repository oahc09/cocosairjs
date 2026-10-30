/** Protected AU12 preparation/collection. Importing never installs, executes a consumer, or launches a browser. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { spawnSync } = require('node:child_process');
const SCHEMA = 'upstream-agent-observation/1';
const MODES = Object.freeze([
    { id: '4.9.5/node', tool: 'legacy', module: 'ESNext', moduleResolution: 'node' },
    { id: '4.9.5/node16', tool: 'legacy', module: 'Node16', moduleResolution: 'node16' },
    { id: '5.9.3/node16', tool: 'modern', module: 'Node16', moduleResolution: 'node16' },
    { id: '5.9.3/bundler', tool: 'modern', module: 'ESNext', moduleResolution: 'bundler' },
]);
const TYPE_CONTRACT = 'upstream-sdk-types/3';
const COMMON_SCOPE = 'paired-common/1';
const EXTENSION_SCOPE = 'candidate-u06-extension/1';
const COMMON_MODE_IDS = Object.freeze(['5.9.3/node16', '5.9.3/bundler']);
const LEGACY_MODE_IDS = Object.freeze(['4.9.5/node', '4.9.5/node16']);
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const slash = (value) => value.split(path.sep).join('/');
const json = (value) => JSON.stringify(value, null, 2) + '\n';
function inside(root, file) {
    const relative = path.relative(root, file);
    assert(
        relative && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative),
        'path escapes root',
    );
    return relative;
}
function shaInput(value, label) {
    assert(/^[0-9a-f]{64}$/.test(value || ''), `${label}: frozen SHA256 required`);
}
function treeEntries(root, allowLinks = false) {
    root = fs.realpathSync(root);
    const rows = [];
    function walk(directory) {
        for (const name of fs.readdirSync(directory).sort()) {
            const file = path.join(directory, name),
                relative = slash(inside(root, file)),
                stat = fs.lstatSync(file);
            if (stat.isSymbolicLink()) {
                assert(allowLinks, `installed engine/archive trees must not contain symlinks: ${relative}`);
                inside(root, fs.realpathSync(file));
                rows.push({ path: relative, type: 'symlink', target: fs.readlinkSync(file) });
            } else if (stat.isDirectory()) walk(file);
            else {
                assert(stat.isFile(), `not a regular file: ${relative}`);
                rows.push({ path: relative, bytes: stat.size, sha256: sha(fs.readFileSync(file)) });
            }
        }
    }
    walk(root);
    return rows.sort((a, b) => a.path.localeCompare(b.path));
}
/** SHA256 of JSON.stringify(sorted tree entries); symlinks may only remain inside the tool installation. */
function treeDigest(root, allowLinks = false) {
    return sha(JSON.stringify(treeEntries(root, allowLinks)));
}
function parsePax(bytes) {
    const values = {};
    for (let offset = 0; offset < bytes.length;) {
        const space = bytes.indexOf(32, offset),
            size = Number(bytes.subarray(offset, space).toString());
        assert(
            space >= offset && Number.isSafeInteger(size) && size > 0 && offset + size <= bytes.length,
            'invalid PAX record',
        );
        const record = bytes.subarray(space + 1, offset + size - 1).toString();
        const equals = record.indexOf('=');
        assert(equals > 0, 'invalid PAX field');
        values[record.slice(0, equals)] = record.slice(equals + 1);
        offset += size;
    }
    return values;
}
function archiveEntries(archivePath, archivePrefix = 'package/') {
    const bytes = zlib.gunzipSync(fs.readFileSync(archivePath), { maxOutputLength: 512 * 1024 * 1024 });
    const entries = new Map();
    let pax = {},
        longName = null;
    const field = (header, start, length) =>
        header
            .subarray(start, start + length)
            .toString()
            .replace(/\0.*$/s, '')
            .trim();
    for (let offset = 0; offset + 512 <= bytes.length;) {
        const header = bytes.subarray(offset, offset + 512);
        offset += 512;
        if (header.every((byte) => byte === 0)) break;
        const expected = parseInt(field(header, 148, 8), 8);
        const checksum = header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
        assert.equal(checksum, expected, 'tar checksum mismatch');
        const size = parseInt(field(header, 124, 12) || '0', 8);
        assert(Number.isSafeInteger(size) && size >= 0 && offset + size <= bytes.length, 'invalid tar member size');
        const content = bytes.subarray(offset, offset + size);
        offset += Math.ceil(size / 512) * 512;
        const type = field(header, 156, 1);
        if (type === 'x') {
            pax = parsePax(content);
            continue;
        }
        if (type === 'L') {
            longName = content.toString().replace(/\0.*$/s, '');
            continue;
        }
        const prefix = field(header, 345, 155);
        const name = pax.path || longName || (prefix ? prefix + '/' : '') + field(header, 0, 100);
        pax = {};
        longName = null;
        assert(type === '' || type === '0' || type === '5', `unsupported tar member type ${type}: ${name}`);
        assert(name.startsWith(archivePrefix), `archive member outside frozen prefix: ${name}`);
        const relative = name.slice(archivePrefix.length).replace(/\/$/, '');
        if (type === '5' && !relative) continue;
        assert(
            relative &&
                !relative.startsWith('/') &&
                !relative.split('/').some((part) => ['..', '.', ''].includes(part)),
            'unsafe archive path',
        );
        if (type === '5') continue;
        assert(!entries.has(relative), `duplicate archive member ${relative}`);
        entries.set(relative, { path: relative, bytes: content.length, sha256: sha(content) });
    }
    assert(entries.has('package.json'), 'archive contains no package.json');
    return [...entries.values()].sort((a, b) => a.path.localeCompare(b.path));
}
function verifyInstalledArtifact(input, consumerDir, expectedName, expectedVersion) {
    shaInput(input?.sha256, 'package archive');
    const archivePath = fs.realpathSync(input.archivePath),
        installedPath = fs.realpathSync(input.installedPath);
    inside(path.join(fs.realpathSync(consumerDir), 'node_modules'), installedPath);
    assert.equal(sha(fs.readFileSync(archivePath)), input.sha256, 'archive SHA256 differs from frozen input');
    assert.deepEqual(
        treeEntries(installedPath),
        archiveEntries(archivePath, input.archivePrefix),
        'installed bytes differ from exact archive',
    );
    const metadata = JSON.parse(fs.readFileSync(path.join(installedPath, 'package.json'), 'utf8'));
    assert.equal(metadata.name, expectedName);
    if (expectedVersion) assert.equal(metadata.version, expectedVersion);
    return {
        archivePath,
        archivePrefix: input.archivePrefix || 'package/',
        installedPath,
        sha256: input.sha256,
        name: metadata.name,
        version: metadata.version,
        metadata,
        treeSha256: treeDigest(installedPath),
    };
}
function verifyTool(input, name, version) {
    assert(input, `${name}@${version}: frozen installed tooling required`);
    shaInput(input.installationSha256, `${name} installation`);
    const installationRoot = fs.realpathSync(input.installationRoot),
        packageDir = fs.realpathSync(input.packageDir);
    inside(installationRoot, packageDir);
    assert.equal(treeDigest(installationRoot, true), input.installationSha256, `${name}: tool installation changed`);
    const metadata = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
    assert.equal(metadata.name, name);
    assert.equal(metadata.version, version);
    return { ...input, packageDir, installationRoot, name, version };
}
/** Verify only the exact declaration dependency closure, never trust all node_modules. */
function verifyDeclarationClosure(config, declarations, consumerDir) {
    if (config.engine !== 'three') return { dependencies: [], lock: null };
    shaInput(config.declarationLock?.sha256, 'declaration dependency lock');
    const lockPath = fs.realpathSync(config.declarationLock.path);
    const lockBytes = fs.readFileSync(lockPath);
    assert.equal(sha(lockBytes), config.declarationLock.sha256, 'declaration lock changed');
    const lock = JSON.parse(lockBytes);
    assert.equal(lock.lockfileVersion, 3, 'exact npm v3 lock required');
    const dependencies = (config.declarationDependencies || []).map((entry) =>
        verifyInstalledArtifact(entry, consumerDir, entry.name, entry.version),
    );
    const byPath = new Map([declarations, ...dependencies].map((entry) => [entry.installedPath, entry]));
    assert.equal(byPath.size, dependencies.length + 1, 'duplicate declaration dependency');
    const seen = new Set();
    const queue = [declarations];
    while (queue.length) {
        const artifact = queue.shift();
        if (seen.has(artifact.installedPath)) continue;
        seen.add(artifact.installedPath);
        const key = slash(inside(consumerDir, artifact.installedPath));
        const row = lock.packages?.[key];
        assert(
            row && row.version === artifact.version,
            'declaration dependency absent or wrong version in lock: ' + key,
        );
        assert.deepEqual(
            row.dependencies || {},
            artifact.metadata.dependencies || {},
            'dependency edges differ: ' + key,
        );
        assert(
            /^https:\/\/registry\.npmjs\.org\//.test(row.resolved || ''),
            'official frozen registry artifact required',
        );
        const match = /^(sha512|sha1)-([A-Za-z0-9+/=]+)$/.exec(row.integrity || '');
        assert(match, 'locked archive integrity required');
        assert.equal(
            crypto.createHash(match[1]).update(fs.readFileSync(artifact.archivePath)).digest('base64'),
            match[2],
            'locked archive integrity differs',
        );
        for (const [name, range] of Object.entries(artifact.metadata.dependencies || {})) {
            let cursor = artifact.installedPath,
                resolved;
            while (cursor.startsWith(consumerDir + path.sep) || cursor === consumerDir) {
                const candidate = path.join(cursor, 'node_modules', name);
                if (fs.existsSync(path.join(candidate, 'package.json'))) {
                    resolved = fs.realpathSync(candidate);
                    break;
                }
                cursor = path.dirname(cursor);
            }
            const dependency = byPath.get(resolved);
            assert(dependency && dependency.name === name, 'unfrozen declaration dependency: ' + name);
            assert(
                require('semver').satisfies(dependency.version, range),
                'declaration dependency version does not satisfy ' + name,
            );
            queue.push(dependency);
        }
    }
    assert.equal(seen.size, byPath.size, 'unrelated package in declaration allowlist');
    return { dependencies, lock: { path: lockPath, sha256: config.declarationLock.sha256 } };
}
function selectExport(metadata, request, conditions) {
    const key = request === '.' ? '.' : './' + request;
    let selected = metadata.exports?.[key];
    if (!selected && request === '.')
        selected = typeof metadata.exports === 'string' ? metadata.exports : metadata.module || metadata.main;
    if (!selected && metadata.exports) {
        for (const [pattern, target] of Object.entries(metadata.exports)) {
            if (!pattern.includes('*')) continue;
            const [start, end] = pattern.split('*');
            if (key.startsWith(start) && key.endsWith(end)) {
                const token = key.slice(start.length, end ? -end.length : undefined);
                selected = typeof target === 'string' ? target.replaceAll('*', token) : undefined;
            }
        }
    }
    while (selected && typeof selected === 'object') {
        const key = Object.keys(selected).find((value) => conditions.includes(value) || value === 'default');
        selected = key ? selected[key] : undefined;
    }
    assert(typeof selected === 'string' && selected.startsWith('./'), `public export ${request} did not resolve`);
    return selected.slice(2);
}
function writeNew(file, contents) {
    fs.writeFileSync(file, contents, { flag: 'wx' });
}
function requireFresh(directory) {
    assert(!fs.existsSync(directory), 'output exists; preserve all earlier attempts');
    fs.mkdirSync(directory, { recursive: true });
}

function browserSource({ engine, specifier, decoderURLs, modelURL }) {
    const setup =
        engine === 'cocosair'
            ? `
    const app = await runtime.createAirApp({ canvas, pixelRatioCap: 1 });
    closeRuntime = async () => ({ release: await app.releaseScene(), close: await app.close() });
    const scene = new runtime.Scene('AU12InstalledConsumer');
    const cameraNode = new runtime.Node('Camera'); scene.addChild(cameraNode);
    cameraNode.setPosition(0, 0, 5); cameraNode.lookAt(new runtime.Vec3());
    const camera = cameraNode.addComponent(runtime.Camera);
    camera.clearFlags = runtime.Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new runtime.Color(8, 16, 32, 255);
    const object = new runtime.Node('NativeControl'); scene.addChild(object);
    const meshRenderer = object.addComponent(runtime.MeshRenderer);
    const mesh = runtime.utils.createMesh(runtime.primitives.box({ width: 2, height: 2, length: 0.2 }));
    const material = new runtime.Material(); material.initialize({ effectName: 'builtin-unlit' });
    material.setProperty('mainColor', new runtime.Color(240, 120, 30, 255));
    meshRenderer.mesh = mesh; meshRenderer.setSharedMaterial(material, 0);
    app.session.own(() => { material.destroy(); mesh.destroy(); }, 'au12-native-control');
    const asset = await new runtime.GLTFLoader().loadAsync(config.modelURL);
    app.session.own(() => asset.destroy(), 'au12-native-asset');
    const instance = asset.instantiate(); scene.addChild(instance.root);
    app.session.own(() => instance.dispose(), 'au12-native-instance');
    app.run(scene);
    const clock = runtime.createStepClock({ stepTimeoutMs: 10000 }); clock.begin();
    await clock.step(0);
    closeRuntime = async () => { clock.end(); return { release: await app.releaseScene(), close: await app.close() }; };
    Loader = runtime.GLTFLoader;
`
            : `
    const renderer = new runtime.WebGLRenderer({ canvas, antialias: false, alpha: false, premultipliedAlpha: false });
    renderer.setSize(640, 360, false); renderer.setPixelRatio(1);
    renderer.outputColorSpace = runtime.LinearSRGBColorSpace; renderer.toneMapping = runtime.NoToneMapping;
    renderer.setClearColor(new runtime.Color().setRGB(8 / 255, 16 / 255, 32 / 255, runtime.LinearSRGBColorSpace), 1);
    closeRuntime = async () => { renderer.dispose(); return { status: 'released' }; };
    const scene = new runtime.Scene();
    const camera = new runtime.OrthographicCamera(-2, 2, 1.125, -1.125, 0.1, 20); camera.position.z = 5;
    const geometry = new runtime.PlaneGeometry(2, 2);
    const material = new runtime.MeshBasicMaterial({ color: new runtime.Color().setRGB(240/255,120/255,30/255,runtime.LinearSRGBColorSpace), toneMapped: false });
    const control = new runtime.Mesh(geometry, material); control.position.z = 1; scene.add(control);
    closeRuntime = async () => { geometry.dispose(); material.dispose(); renderer.dispose(); return { status: 'released' }; };
    const asset = await new GLTFLoader().loadAsync(config.modelURL); scene.add(asset.scene);
    renderer.render(scene, camera);
    closeRuntime = async () => { disposeThree(asset); geometry.dispose(); material.dispose(); renderer.dispose(); return { status: 'released' }; };
    Loader = GLTFLoader;
`;
    return `import * as runtime from ${JSON.stringify(specifier)};
import { loadPeer } from './identity-peer.mjs';
${engine === 'three' ? `import { GLTFLoader } from ${JSON.stringify(specifier + '/addons/loaders/GLTFLoader.js')};` : ''}
const config = ${JSON.stringify({ engine, decoderURLs, modelURL })};
const runtimeErrors = [];
window.addEventListener('error', (event) => runtimeErrors.push(String(event.error || event.message)));
window.addEventListener('unhandledrejection', (event) => runtimeErrors.push(String(event.reason)));
let closeRuntime = async () => ({ status: 'not-initialized' });
const state = window.__sdkReference = { report: null, error: null, close: () => closeRuntime() };
function disposeThree(asset) {
    const resources = new Set();
    asset.scene.traverse((node) => {
        if (node.geometry) resources.add(node.geometry);
        for (const material of Array.isArray(node.material) ? node.material : node.material ? [node.material] : []) {
            resources.add(material); for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
        }
        if (node.skeleton) resources.add(node.skeleton);
    });
    resources.forEach((resource) => resource.dispose());
}
async function digest(bytes) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (value) => value.toString(16).padStart(2, '0')).join(''); }
state.completion = (async () => {
    const peer = await loadPeer();
    const references = [runtime.Scene, peer.Scene];
    if (references.some((value) => typeof value !== 'function')) throw new Error('Native Scene export missing');
    const unique = [...new Set(references)];
    const engineModuleIdentities = unique.map((value, index) => 'native-Scene-constructor:' + index + ':' + value.name);
    const canvas = document.querySelector('canvas'); let Loader;
    ${setup}
    const gl = canvas.getContext('webgl2'); if (!gl) throw new Error('No native WebGL2 context');
    const center = new Uint8Array(4); gl.readPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, center);
    if (gl.getError() !== gl.NO_ERROR) throw new Error('Native GL readback failed');
    const pixels = [...center];
    const defaultRequests = performance.getEntriesByType('resource').map((entry) => entry.name);
    const typeOnlyRuntimeExports = ['GLTFInstance','GLTFLoaderOptions','AirRequestPolicy'].filter((name) => name in runtime);
    const declaredOrigin = location.origin, resources = [], missingFiles = [];
    for (const id of ['draco', 'meshopt', 'basis']) {
        const url = new URL(config.decoderURLs[id], location.href);
        if (url.origin !== declaredOrigin) throw new Error('Decoder escaped explicit local origin');
        const response = await fetch(url.href, { redirect: 'error' }), bytes = await response.arrayBuffer();
        resources.push({ id, url: url.href, origin: url.origin, status: response.status, sha256: await digest(bytes), mime: response.headers.get('content-type') });
        const missing = await fetch('/sdk-missing-decoder/' + id, { redirect: 'error' });
        missingFiles.push({ id, status: missing.status, body: await missing.text() });
    }
    const base = await (await fetch(config.modelURL, { redirect: 'error' })).json();
    const missingProviders = [];
    for (const [id, extension] of [['draco','KHR_draco_mesh_compression'], ['meshopt','EXT_meshopt_compression'], ['basis','KHR_texture_basisu']]) {
        const document = structuredClone(base); document.extensionsUsed = [extension]; document.extensionsRequired = [extension];
        if (id === 'draco') document.meshes[0].primitives[0].extensions = { [extension]: { bufferView: 0, attributes: { POSITION: 0 } } };
        if (id === 'meshopt') document.bufferViews[0].extensions = { [extension]: { buffer: 0, byteOffset: 0, byteLength: 4, byteStride: 12, count: 3, mode: 'ATTRIBUTES' } };
        if (id === 'basis') { document.textures[0] = { extensions: { [extension]: { source: 0 } } }; }
        let failure = null, loaded;
        try { loaded = await new Loader().parseAsync(JSON.stringify(document), new URL('.', new URL(config.modelURL, location.href)).href); }
        catch (error) { failure = error; }
        if (loaded) { if (config.engine === 'cocosair') loaded.destroy(); else disposeThree(loaded); }
        missingProviders.push({ id, rejected: failure !== null, code: failure?.code || null, message: failure?.message || null });
    }
    const report = { schema: 'upstream-sdk-browser-case/1', mode: document.documentElement.dataset.sdkMode,
        engine: config.engine, runtimeExports: Object.keys(runtime).sort(), engineModuleIdentities, pixels, runtimeErrors, defaultRequests, typeOnlyRuntimeExports,
        decoders: { declaredOrigin, resources, missingFiles, missingProviders },
        scope: 'Installed native API render, decoder deployment hashes/404 controls, and real missing-provider parse failures; not compressed-payload decode success.' };
    state.report = report; return report;
})().catch((error) => { state.error = String(error.stack || error); throw error; });
`;
}

function html(imports, mode) {
    return `<!doctype html><html data-sdk-mode="${mode}"><head><meta charset="utf-8">${imports ? `<script type="importmap">${JSON.stringify({ imports }).replaceAll('<', '\\u003c')}</script>` : ''}</head><body style="margin:0"><canvas id="GameCanvas" width="640" height="360" style="width:640px;height:360px"></canvas><script type="module" src="./browser-main.mjs"></script></body></html>\n`;
}
function threeTypeFixture(specifier) {
    return `import { Scene, Object3D, Vector3, Mesh, MeshBasicMaterial } from '${specifier}';
import { Vector3 as CPUVector3 } from '${specifier}/src/math/Vector3.js';
import { GLTFLoader } from '${specifier}/addons/loaders/GLTFLoader.js';
import { MeshBasicMaterialParameters as RuntimeMaterialParameters } from '${specifier}';
const loader = new GLTFLoader().setRequestHeader({ 'X-Consumer': 'frozen' }).setWithCredentials(false);
// @ts-expect-error headers record values are strings
loader.setRequestHeader({ 'X-Consumer': 42 });
// @ts-expect-error credentials setter is boolean
loader.setWithCredentials('include');
// @ts-expect-error interface must not become a runtime export
const runtimeParameters = RuntimeMaterialParameters;
// @ts-expect-error CPU-only math leaf has no renderer export
import { WebGLRenderer as MathRenderer } from '${specifier}/src/math/Vector3.js';
const scene: Scene = new Scene(); const mesh: Mesh = new Mesh(undefined, new MeshBasicMaterial()); scene.add(mesh);
const optional: Object3D | undefined = scene.getObjectByName('missing');
const vector: Vector3 = new Vector3(3, 4, 12); const cpu: CPUVector3 = new CPUVector3(3, 4, 12);
// @ts-expect-error nullable lookup must not be forced to a present object
const required: Object3D = scene.getObjectByName('missing');
// @ts-expect-error numerical vector API rejects strings
new Vector3('three', 4, 12);
// @ts-expect-error disposal is synchronous void
const pending: Promise<void> = mesh.geometry.dispose();
void [optional, vector, cpu, required, pending];
`;
}

const THREE_NEGATIVE_CATEGORIES = Object.freeze([
    'nullable',
    'lifecycle-return',
    'native-input-shapes',
    'math-entry-boundary',
    'request-policy',
    'type-only-runtime-export',
]);
const NEGATIVE_CATEGORIES = Object.freeze([
    'nullable',
    'lifecycle-return',
    'request-policy',
    'type-only-runtime-export',
    'error-code',
    'math-entry-boundary',
    'native-input-shapes',
    'ownership-readonly',
]);
const BROWSER_MODES = Object.freeze([
    'importmap-unminified',
    'importmap-minified',
    'vite-development',
    'vite-production',
]);
const VITE_OPTIONS = Object.freeze({
    configFile: false,
    base: './',
    publicDir: false,
    build: { target: 'es2020', minify: false, sourcemap: true, emptyOutDir: false },
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
});
function cocosTypeFixture(source, specifier, extension = false) {
    return (
        source
            .replaceAll("'cocosair'", JSON.stringify(specifier))
            .replaceAll("'cocosair/math'", JSON.stringify(specifier + '/math')) +
        `
import { GLTFInstance as RuntimeGLTFInstance, ${extension ? 'AirRequestPolicy as RuntimeAirRequestPolicy, ' : ''}GLTFLoaderOptions as RuntimeGLTFLoaderOptions } from ${JSON.stringify(specifier)};
// These declarations are type-only, never runtime constructors.
// @ts-expect-error GLTFInstance must not become a runtime export
const runtimeInstance = RuntimeGLTFInstance;
${extension ? '// @ts-expect-error AirRequestPolicy must not become a runtime export\nconst runtimePolicy = RuntimeAirRequestPolicy;' : ''}
// @ts-expect-error GLTFLoaderOptions must not become a runtime export
const runtimeOptions = RuntimeGLTFLoaderOptions;
const errorCodes = ['GLTF_EXTENSION_UNSUPPORTED', 'GLTF_DECODER_MISSING', 'GLTF_DEVICE_UNSUPPORTED',
    'GLTF_EXTENSION_INVALID', 'GLTF_DECODE_FAILED'] as const;
for (const code of errorCodes) new GLTFError(code, 'compile-only positive code case');
void [runtimeInstance, ${extension ? 'runtimePolicy, ' : ''}runtimeOptions];
`
    );
}
function negativeManifest(source) {
    const rows = [];
    source.split('\n').forEach((line, index) => {
        if (!line.includes('@ts-expect-error')) return;
        const description = line.split('@ts-expect-error')[1].trim();
        let category;
        if (/runtime export/.test(description)) category = 'type-only-runtime-export';
        else if (/request|priority|cache|credentials|HeadersInit|headers|policy|AbortSignal/.test(description))
            category = 'request-policy';
        else if (/nullable|empty slot|optional, not null|absent|may omit/.test(description)) category = 'nullable';
        else if (/synchronous|asynchronous|success flag/.test(description)) category = 'lifecycle-return';
        else if (/finite public code/.test(description)) category = 'error-code';
        else if (/CPU-only/.test(description)) category = 'math-entry-boundary';
        else if (/readonly/.test(description)) category = 'ownership-readonly';
        else category = 'native-input-shapes';
        rows.push({ line: index + 2, category, description });
    });
    return rows;
}
function compilerSource() {
    return `const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const [configFile, modeId] = process.argv.slice(2), config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
const mode = config.modes.find((row) => row.id === modeId);
const ts = require(path.join(config.tools[mode.tool].packageDir, 'lib/typescript.js'));
assert.equal(ts.version, mode.id.split('/')[0]);
const options = ts.convertCompilerOptionsFromJson(mode.options, config.outputDir);
assert.equal(options.errors.length, 0);
function diagnostics(program) { return ts.getPreEmitDiagnostics(program).map((item) => ({ code: item.code,
    file: item.file?.fileName || null, line: item.file ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : null,
    message: ts.flattenDiagnosticMessageText(item.messageText, '\\n') })); }
const program = ts.createProgram([config.fixture], options.options);
const actual = diagnostics(program), files = program.getSourceFiles().map((file) => path.resolve(file.fileName));
const installed = files.filter((file) => file.startsWith(config.declarations.installedPath + path.sep));
assert(installed.length, 'No declarations resolved from frozen installed archive');
const permitted = [config.package.installedPath, config.declarations.installedPath, ...config.declarationDependencies.map((entry) => entry.installedPath), config.tools[mode.tool].packageDir];
for (const file of files) assert(file === config.fixture || permitted.some((root) => file.startsWith(root + path.sep)), 'Source/dependency escape: ' + file);
const checker = program.getTypeChecker(), source = program.getSourceFile(config.fixture);
function declaredExports(specifier) {
    const declaration = source.statements.find((statement) => ts.isImportDeclaration(statement) && statement.moduleSpecifier.text === specifier);
    assert(declaration, 'Missing import declaration for ' + specifier);
    const symbol = checker.getSymbolAtLocation(declaration.moduleSpecifier);
    assert(symbol, 'Public declaration did not resolve: ' + specifier);
    return checker.getExportsOfModule(symbol).filter((entry) => {
        if (entry.declarations?.some((declaration) => ts.isExportSpecifier(declaration) && (declaration.isTypeOnly || declaration.parent.parent.isTypeOnly))) return false;
        return !!((entry.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(entry) : entry).flags & ts.SymbolFlags.Value);
    }).map((entry) => entry.name).sort();
}
const declaredValueExports = declaredExports(config.specifier), declaredMathExports = declaredExports(config.mathSpecifier);
if (config.engine === 'cocosair') assert.equal(installed.some((file) => /cocosair(?:\\.math)?\\.legacy\\.d\\.ts$/.test(file)), mode.tool === 'legacy', 'Wrong declaration version selected');
const negative = ts.createProgram([config.negativeFixture], options.options), negativeDiagnostics = diagnostics(negative);
const exercised = config.negativeManifest.map((entry) => ({ ...entry, diagnostics: negativeDiagnostics.filter((d) => d.file === config.negativeFixture && d.line === entry.line) }));
const report = { id: mode.id, compilerVersion: ts.version, strictNullChecks: options.options.strictNullChecks,
    skipLibCheck: options.options.skipLibCheck, diagnostics: actual, negativeCases: exercised.length,
    negativeCategories: [...new Set(exercised.map((entry) => entry.category))].sort(), negativeControls: exercised,
    declarations: installed, declaredValueExports, declaredMathExports, options: mode.options };
console.log('SDK_RESULT ' + JSON.stringify(report));
assert.equal(actual.length, 0, JSON.stringify(actual));
assert(exercised.every((entry) => entry.diagnostics.length > 0), 'A negative case did not actually reject after removing its directive');
`;
}
function mathSource({ specifier, engine }) {
    const math = engine === 'cocosair' ? specifier + '/math' : specifier + '/src/math/Vector3.js';
    return `import assert from 'node:assert/strict';
const names = ['window', 'document', 'cc', 'CocosEngine'];
const descriptors = Object.fromEntries(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
const summary = () => Object.fromEntries(names.map((name) => [name, { present: Object.hasOwn(globalThis, name), type: typeof globalThis[name] }]));
const globalsBefore = summary();
const resolved = import.meta.resolve(${JSON.stringify(math)}), math = await import(${JSON.stringify(math)});
const vectorLength = new math.${engine === 'cocosair' ? 'Vec3' : 'Vector3'}(3, 4, 12).length();
${
    engine === 'cocosair'
        ? `const matrix = new math.Mat4(); math.Mat4.fromTranslation(matrix, new math.Vec3(2, 3, 4));
const translated = math.Vec3.transformMat4(new math.Vec3(), new math.Vec3(3, 4, 12), matrix);`
        : `const matrixModule = await import(${JSON.stringify(specifier + '/src/math/Matrix4.js')});
const matrix = new matrixModule.Matrix4().makeTranslation(2, 3, 4);
const translated = new math.Vector3(3, 4, 12).applyMatrix4(matrix);`
}
const matrixTransformedVector = [translated.x, translated.y, translated.z];
const globalsAfter = summary();
for (const name of names) assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, name), descriptors[name], name);
for (const name of ['createAirApp','Scene','Node','GLTFLoader','WebGLRenderer']) assert.equal(name in math, false, name);
console.log('SDK_RESULT ' + JSON.stringify({ globalsBefore, globalsAfter, vectorLength, matrixTransformedVector, resolved, exports: Object.keys(math).sort() }));
`;
}
/**
 * Source-only. Caller installs exact archives/tooling beforehand. Never npm-install or
 * execute anything here. consumerDir must be outside the source checkout; outputDir must
 * be a NEW child of that consumer so Node/TS/Vite use its real node_modules resolution.
 * tools.{legacy,modern,vite}: {installationRoot,installationSha256,packageDir}.
 * package: {archivePath,sha256,installedPath}; localResources: [{urlPath,file,sha256}].
 */
function prepareSDKConsumer(config) {
    assert(['cocosair', 'three'].includes(config?.engine), 'engine must be cocosair or three');
    if (config.engine === 'three' && !config.declarations)
        return {
            status: 'BLOCKED',
            taskId: 'AU12',
            engine: 'three',
            referenceReceipt: null,
            code: 'THREE_MATCHING_DECLARATIONS_NOT_FROZEN',
            reason: 'three@0.186.1 ships no declarations. An explicitly frozen compatible declaration archive is required; @types/three@0.180.0 is not a substitute.',
        };
    const fixtureScope = config.fixtureScope || COMMON_SCOPE;
    assert([COMMON_SCOPE, EXTENSION_SCOPE].includes(fixtureScope), 'unknown SDK fixture scope');
    const extension = fixtureScope === EXTENSION_SCOPE;
    assert(!extension || config.engine === 'cocosair', 'U06 extension applies only to Cocos');
    const consumerDir = fs.realpathSync(config.consumerDir),
        repoRoot = path.resolve(__dirname, '../../../..');
    assert(
        !consumerDir.startsWith(repoRoot + path.sep) && consumerDir !== repoRoot,
        'consumer must be outside source checkout',
    );
    const specifier = config.specifier || (config.engine === 'cocosair' ? 'cocosair' : 'three');
    assert(/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/.test(specifier), 'invalid package specifier');
    const pkg = verifyInstalledArtifact(
        config.package,
        consumerDir,
        config.engine === 'cocosair' ? 'cocosair.js' : 'three',
        config.engine === 'three' ? '0.186.1' : config.package.version,
    );
    assert.equal(
        pkg.installedPath,
        fs.realpathSync(path.join(consumerDir, 'node_modules', specifier)),
        'installed alias differs from public specifier',
    );
    let declarations = pkg;
    if (config.engine === 'three') {
        assert.equal(
            config.declarations.compatibleEngineVersion,
            '0.186.1',
            'Declaration compatibility must explicitly freeze three@0.186.1',
        );
        declarations = verifyInstalledArtifact(config.declarations, consumerDir, '@types/three', '0.186.0');
        assert.notEqual(declarations.version, '0.180.0', 'Known mismatched @types/three cannot be adopted');
    }
    const declarationClosure = verifyDeclarationClosure(config, declarations, consumerDir);
    const tools = {
        ...(config.engine === 'cocosair' ? { legacy: verifyTool(config.tools?.legacy, 'typescript', '4.9.5') } : {}),
        modern: verifyTool(config.tools?.modern, 'typescript', '5.9.3'),
        vite: verifyTool(config.tools?.vite, 'vite', '7.1.12'),
    };
    const localResources = (config.localResources || []).map((entry) => {
        assert(/^\/[A-Za-z0-9_./-]+$/.test(entry.urlPath) && !entry.urlPath.includes('..'), 'local route required');
        shaInput(entry.sha256, entry.urlPath);
        const file = fs.realpathSync(entry.file);
        assert.equal(sha(fs.readFileSync(file)), entry.sha256, 'public resource changed');
        return { ...entry, file };
    });
    const modelURL = config.modelURL;
    assert(
        localResources.some((entry) => entry.urlPath === modelURL),
        'modelURL must name a frozen local resource',
    );
    const decoderURLs = config.decoderURLs;
    const decoderArtifacts = (config.decoderArtifacts || []).map((input) => {
        assert(
            typeof input.name === 'string' && typeof input.version === 'string',
            'decoder artifact name/version must be frozen',
        );
        return verifyInstalledArtifact(input, consumerDir, input.name, input.version);
    });
    const decoderProvenance = {};
    for (const id of ['draco', 'meshopt', 'basis']) {
        const resource = localResources.find((entry) => entry.urlPath === decoderURLs?.[id]);
        assert(resource, `${id}: explicit frozen local decoder URL required`);
        const source = [pkg, ...decoderArtifacts].find((artifact) =>
            resource.file.startsWith(artifact.installedPath + path.sep),
        );
        assert(
            source,
            `${id}: decoder must come from the exact installed engine archive or an independently verified decoder artifact; an arbitrary file hash is insufficient`,
        );
        decoderProvenance[id] = {
            kind: source === pkg ? 'engine-archive' : 'decoder-archive',
            packageName: source.name,
            packageVersion: source.version,
            archiveSha256: source.sha256,
            relativePath: slash(inside(source.installedPath, resource.file)),
            sha256: resource.sha256,
        };
    }
    const outputDir = path.resolve(config.outputDir);
    inside(consumerDir, outputDir);
    requireFresh(outputDir);
    writeNew(path.join(outputDir, 'package.json'), json({ private: true, type: 'module' }));
    const fixturePath = 'test/fixtures/upstream-sdk/' + (extension ? 'contracts.ts' : 'paired-common.ts');
    const fixtureOrigin = path.join(repoRoot, fixturePath);
    const original = fs.readFileSync(fixtureOrigin, 'utf8'),
        source =
            config.engine === 'cocosair'
                ? cocosTypeFixture(original, specifier, extension)
                : threeTypeFixture(specifier);
    const categories =
        config.engine === 'cocosair'
            ? NEGATIVE_CATEGORIES.filter((category) => extension || category !== 'request-policy')
            : THREE_NEGATIVE_CATEGORIES;
    const browserModes =
        config.engine === 'cocosair' ? BROWSER_MODES : BROWSER_MODES.filter((mode) => mode !== 'importmap-minified');
    const fixture = path.join(outputDir, 'contracts.ts'),
        negativeFixture = path.join(outputDir, 'negative-controls.ts');
    const negativeCases = negativeManifest(source);
    assert.deepEqual(
        [...new Set(negativeCases.map((entry) => entry.category))].sort(),
        [...categories].sort(),
        'negative category coverage drift',
    );
    writeNew(fixture, source);
    writeNew(negativeFixture, source.replaceAll('@ts-expect-error', 'negative-control'));
    writeNew(path.join(outputDir, 'compiler-probe.cjs'), compilerSource());
    writeNew(path.join(outputDir, 'math-probe.mjs'), mathSource({ specifier, engine: config.engine }));
    writeNew(
        path.join(outputDir, 'trace-loader.mjs'),
        `import { appendFileSync } from 'node:fs';\nexport async function load(url, context, nextLoad) { appendFileSync(process.env.SDK_MODULE_TRACE, JSON.stringify(url) + '\\n'); return nextLoad(url, context); }\n`,
    );
    const mainEntry = selectExport(pkg.metadata, '.', ['import', 'browser']);
    const mathSpecifier = config.engine === 'cocosair' ? specifier + '/math' : specifier + '/src/math/Vector3.js';
    const mathEntry = selectExport(pkg.metadata, config.engine === 'cocosair' ? 'math' : 'src/math/Vector3.js', [
        'import',
        'node',
    ]);
    const minEntry = config.engine === 'cocosair' ? config.minifiedEntry || 'build/npm/cocosair.module.min.js' : null;
    for (const entry of [mainEntry, mathEntry, minEntry].filter(Boolean)) {
        inside(pkg.installedPath, path.resolve(pkg.installedPath, entry));
        assert(fs.statSync(path.join(pkg.installedPath, entry)).isFile());
    }
    writeNew(
        path.join(outputDir, 'resolve-probe.mjs'),
        `console.log('SDK_RESULT ' + JSON.stringify({ main: import.meta.resolve(${JSON.stringify(specifier)}), math: import.meta.resolve(${JSON.stringify(mathSpecifier)}) }));\n`,
    );
    const modes = MODES.filter((mode) => config.engine === 'cocosair' || COMMON_MODE_IDS.includes(mode.id)).map(
        (mode) => ({
            ...mode,
            options: {
                strict: true,
                strictNullChecks: true,
                skipLibCheck: true,
                noEmit: true,
                target: 'ES2020',
                module: mode.module,
                moduleResolution: mode.moduleResolution,
                types: [],
                lib: ['ES2020', 'DOM'],
            },
        }),
    );
    const browserDir = path.join(outputDir, 'browser');
    fs.mkdirSync(browserDir);
    writeNew(
        path.join(browserDir, 'browser-main.mjs'),
        browserSource({ engine: config.engine, specifier, decoderURLs, modelURL }),
    );
    writeNew(
        path.join(browserDir, 'identity-peer.mjs'),
        `export const loadPeer = () => import(${JSON.stringify(specifier)});\n`,
    );
    writeNew(path.join(browserDir, 'index.html'), html(null, 'vite-production'));
    const imports = { [specifier]: '/sdk-installed/' + mainEntry };
    if (config.engine === 'three') {
        imports[specifier + '/addons/'] = '/sdk-installed/examples/jsm/';
        imports[specifier + '/src/'] = '/sdk-installed/src/';
    }
    writeNew(path.join(browserDir, 'importmap.html'), html(imports, 'importmap-unminified'));
    if (minEntry)
        writeNew(
            path.join(browserDir, 'minified.html'),
            html({ ...imports, [specifier]: '/sdk-installed/' + minEntry }, 'importmap-minified'),
        );
    const prepared = {
        status: 'PREPARED_NOT_EXECUTED',
        taskId: extension ? 'U06' : 'AU12',
        fixtureScope,
        engine: config.engine,
        consumerDir,
        outputDir,
        specifier,
        package: pkg,
        declarations,
        declarationDependencies: declarationClosure.dependencies,
        declarationLock: declarationClosure.lock,
        compilerContract: TYPE_CONTRACT,
        commonModeIds: [...COMMON_MODE_IDS],
        compatibilityModeIds: config.engine === 'cocosair' ? [...LEGACY_MODE_IDS] : [],
        tools,
        fixture,
        negativeFixture,
        modes,
        negativeManifest: negativeCases,
        negativeCategories: [...categories],
        categorySemantics:
            config.engine === 'cocosair'
                ? extension
                    ? 'Candidate U06 extension: full native SDK and new request priority/cache. Not paired AU12 evidence.'
                    : 'Paired native SDK: nullable, lifecycle, ownership, finite errors, math and type-only exports; no candidate-only request shape.'
                : 'Native Three nullable lookup, synchronous dispose, vector inputs, CPU math boundary, request header/credential setters and public type-only material interface; no Cocos-specific error code or cache/priority claim.',
        fixtureSource: {
            path: config.engine === 'cocosair' ? fixturePath : 'sdk-reference.cjs#threeTypeFixture',
            sha256: config.engine === 'cocosair' ? sha(original) : sha(threeTypeFixture.toString()),
            verifierPath: 'tools/verify/upstream-sdk-contracts.cjs',
            verifierSha256: sha(fs.readFileSync(path.join(repoRoot, 'tools/verify/upstream-sdk-contracts.cjs'))),
            originalNegativeCases:
                config.engine === 'cocosair'
                    ? (original.match(/@ts-expect-error/g) || []).length
                    : negativeCases.length,
            generatedSha256: sha(source),
        },
        localResources,
        decoderURLs,
        decoderArtifacts,
        decoderProvenance,
        modelURL,
        mainEntry,
        mathEntry,
        mathSpecifier,
        minEntry,
        browserDir,
        browserModes: [...browserModes],
        viteOptions: {
            ...VITE_OPTIONS,
            build: { ...VITE_OPTIONS.build, minify: config.engine === 'three' ? 'esbuild' : false },
        },
        browserAPI: {
            global: '__sdkReference',
            completion: 'completion',
            close: 'close',
            routes: {
                'importmap-unminified': '/sdk/importmap.html',
                'importmap-minified': '/sdk/minified.html',
                'vite-production': '/sdk-dist/',
            },
            development: 'startSDKViteDevelopment(prepared, {execute:true}); returned origin',
            missingDecoderPrefix: '/sdk-missing-decoder/',
        },
        browserExecution: 'NOT_RUN',
        cpuExecution: 'NOT_RUN',
        sourceSha256: sha(fs.readFileSync(__filename)),
    };
    prepared.generatedSources = treeEntries(outputDir);
    writeNew(path.join(outputDir, 'preparation.json'), json(prepared));
    return prepared;
}

function verifyPrepared(prepared) {
    assert.equal(prepared?.status, 'PREPARED_NOT_EXECUTED', 'A real prepared consumer is required');
    assert.equal(prepared.compilerContract, TYPE_CONTRACT, 'stale compiler contract');
    assert([COMMON_SCOPE, EXTENSION_SCOPE].includes(prepared.fixtureScope), 'SDK fixture scope required');
    assert.equal(prepared.taskId, prepared.fixtureScope === COMMON_SCOPE ? 'AU12' : 'U06');
    assert(prepared.fixtureScope !== EXTENSION_SCOPE || prepared.engine === 'cocosair');
    if (prepared.engine === 'cocosair') {
        const extension = prepared.fixtureScope === EXTENSION_SCOPE;
        assert.equal(
            prepared.fixtureSource.path,
            'test/fixtures/upstream-sdk/' + (extension ? 'contracts.ts' : 'paired-common.ts'),
            'fixture identity differs from scope',
        );
        assert.equal(prepared.negativeManifest.length, extension ? 36 : 23, 'fixture count differs from scope');
    }
    assert.deepEqual(prepared.commonModeIds, [...COMMON_MODE_IDS]);
    assert.deepEqual(prepared.compatibilityModeIds, prepared.engine === 'cocosair' ? [...LEGACY_MODE_IDS] : []);
    assert.deepEqual(
        prepared.modes.map((row) => row.id),
        MODES.filter((row) => prepared.engine === 'cocosair' || COMMON_MODE_IDS.includes(row.id)).map((row) => row.id),
    );
    assert.equal(sha(fs.readFileSync(__filename)), prepared.sourceSha256, 'collector source changed since preparation');
    verifyInstalledArtifact(prepared.package, prepared.consumerDir, prepared.package.name, prepared.package.version);
    if (prepared.engine === 'three')
        verifyInstalledArtifact(
            prepared.declarations,
            prepared.consumerDir,
            prepared.declarations.name,
            prepared.declarations.version,
        );
    verifyDeclarationClosure(prepared, prepared.declarations, prepared.consumerDir);
    for (const artifact of prepared.decoderArtifacts)
        verifyInstalledArtifact(artifact, prepared.consumerDir, artifact.name, artifact.version);
    for (const tool of Object.values(prepared.tools)) verifyTool(tool, tool.name, tool.version);
    for (const entry of prepared.generatedSources)
        assert.equal(
            sha(fs.readFileSync(path.join(prepared.outputDir, entry.path))),
            entry.sha256,
            'generated source changed: ' + entry.path,
        );
    for (const entry of prepared.localResources)
        assert.equal(sha(fs.readFileSync(entry.file)), entry.sha256, 'resource changed: ' + entry.urlPath);
}
function runStage(prepared, attemptDir, id, args, extraEnv = {}) {
    const result = spawnSync(process.execPath, args, {
        cwd: prepared.outputDir,
        encoding: 'utf8',
        timeout: 120000,
        maxBuffer: 32 * 1024 * 1024,
        env: { ...process.env, NODE_PATH: '', ...extraEnv },
    });
    const row = {
        id,
        executable: process.execPath,
        args,
        exitCode: result.status,
        signal: result.signal,
        error: result.error ? String(result.error.stack || result.error) : null,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
    };
    writeNew(path.join(attemptDir, id.replaceAll('/', '-') + '.json'), json(row));
    const payload = row.stdout
        .split('\n')
        .filter((line) => line.startsWith('SDK_RESULT '))
        .at(-1);
    if (payload) row.result = JSON.parse(payload.slice(11));
    return row;
}
/** Explicit opt-in only: executes the frozen installed compilers/Vite and Node consumers, never a browser. */
function collectSDKCPU(prepared, options = {}) {
    assert.equal(options.execute, true, 'CPU consumer execution requires explicit execute:true');
    verifyPrepared(prepared);
    const attemptDir = path.resolve(options.attemptDir || path.join(prepared.outputDir, 'cpu-attempt'));
    inside(prepared.outputDir, attemptDir);
    requireFresh(attemptDir);
    const stages = [];
    const resolve = runStage(prepared, attemptDir, 'resolve', [path.join(prepared.outputDir, 'resolve-probe.mjs')]);
    stages.push(resolve);
    if (resolve.exitCode === 0) {
        assert.equal(
            resolve.result.main,
            pathToFileURL(path.join(prepared.package.installedPath, prepared.mainEntry)).href,
            'public main export resolved outside the exact installed package',
        );
        assert.equal(
            resolve.result.math,
            pathToFileURL(path.join(prepared.package.installedPath, prepared.mathEntry)).href,
            'public math export resolved outside the exact installed package',
        );
    }
    const modes = [];
    for (const mode of prepared.modes) {
        const stage = runStage(prepared, attemptDir, mode.id, [
            path.join(prepared.outputDir, 'compiler-probe.cjs'),
            path.join(prepared.outputDir, 'preparation.json'),
            mode.id,
        ]);
        stages.push(stage);
        if (stage.result) modes.push(stage.result);
    }
    const traceFile = path.join(attemptDir, 'math-module-trace.jsonl');
    const math = runStage(
        prepared,
        attemptDir,
        'dom-free-math',
        [
            '--loader',
            pathToFileURL(path.join(prepared.outputDir, 'trace-loader.mjs')).href,
            path.join(prepared.outputDir, 'math-probe.mjs'),
        ],
        { SDK_MODULE_TRACE: traceFile },
    );
    stages.push(math);
    if (math.result) {
        const urls = fs
            .readFileSync(traceFile, 'utf8')
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line));
        math.result.loadedModuleURLs = urls;
        math.result.renderModuleImported = urls.some(
            (url) => url === resolve.result?.main || /\/renderers\/|\/scenes\//.test(url),
        );
        math.result.moduleTraceSha256 = sha(fs.readFileSync(traceFile));
    }
    const viteBuildFile = path.join(attemptDir, 'vite-build.mjs');
    const distDir = path.join(attemptDir, 'dist');
    writeNew(
        viteBuildFile,
        `import { build } from ${JSON.stringify(pathToFileURL(path.join(prepared.tools.vite.packageDir, 'dist/node/index.js')).href)};
const config = ${JSON.stringify({
            ...prepared.viteOptions,
            root: prepared.browserDir,
            cacheDir: path.join(attemptDir, 'vite-cache'),
            resolve: { dedupe: [prepared.specifier] },
            build: { ...prepared.viteOptions.build, outDir: distDir },
        })};
await build(config); console.log('SDK_RESULT ' + JSON.stringify({ version:'7.1.12', outputDirectory:config.build.outDir }));\n`,
    );
    const vite = runStage(prepared, attemptDir, 'vite', [viteBuildFile]);
    stages.push(vite);
    const report = {
        schema: 'upstream-sdk-cpu/1',
        taskId: prepared.taskId,
        engine: prepared.engine,
        status: stages.every((stage) => stage.exitCode === 0) ? 'CPU_OBSERVED_BROWSER_PENDING' : 'CPU_FAILED',
        packageSha256: prepared.package.sha256,
        declarationPackageSha256: prepared.declarations.sha256,
        compilerContract: prepared.compilerContract,
        fixtureScope: prepared.fixtureScope,
        commonModeIds: prepared.commonModeIds,
        compatibilityModeIds: prepared.compatibilityModeIds,
        preparationSha256: sha(fs.readFileSync(path.join(prepared.outputDir, 'preparation.json'))),
        sourceSha256: prepared.sourceSha256,
        attemptDir,
        distDir,
        stages,
        resolution: resolve.result || null,
        modes,
        math: math.result || null,
        vite: {
            version: '7.1.12',
            exitCode: vite.exitCode,
            options: prepared.viteOptions,
            output: fs.existsSync(distDir) ? treeEntries(distDir) : [],
        },
        browserExecution: 'NOT_RUN',
    };
    writeNew(path.join(attemptDir, 'cpu-report.json'), json(report));
    return report;
}

const MIME = Object.freeze({
    '.html': 'text/html',
    '.mjs': 'text/javascript',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.gltf': 'model/gltf+json',
    '.glb': 'model/gltf-binary',
    '.bin': 'application/octet-stream',
    '.wasm': 'application/wasm',
    '.png': 'image/png',
    '.ktx2': 'image/ktx2',
    '.map': 'application/json',
});
/** Returns an ordinary HTTP middleware; does not listen, fetch, or launch anything. */
function createSDKRequestHandler(prepared, cpu = null) {
    const resources = new Map(prepared.localResources.map((entry) => [entry.urlPath, entry.file]));
    return (request, response, next) => {
        let pathname;
        try {
            pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        } catch {
            response.writeHead(400);
            response.end('invalid URL');
            return;
        }
        if (pathname.startsWith('/sdk-missing-decoder/')) {
            response.writeHead(404, { 'Content-Type': 'text/plain' });
            response.end('missing frozen decoder control');
            return;
        }
        let file = resources.get(pathname);
        for (const [prefix, directory] of [
            ['/sdk-installed/', prepared.package.installedPath],
            ['/sdk/', prepared.browserDir],
            ['/sdk-dist/', cpu?.distDir],
        ]) {
            if (!directory || !pathname.startsWith(prefix)) continue;
            const relative = pathname.slice(prefix.length) || 'index.html';
            const candidate = path.resolve(directory, relative);
            try {
                inside(directory, candidate);
                file = candidate;
            } catch {
                response.writeHead(403);
                response.end('path escape');
                return;
            }
        }
        if (!file) {
            if (next) {
                next();
                return;
            }
            response.writeHead(404);
            response.end('unknown SDK route');
            return;
        }
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
            response.writeHead(404);
            response.end('missing SDK file');
            return;
        }
        response.writeHead(200, {
            'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
            'Cache-Control': 'no-store',
        });
        fs.createReadStream(file).pipe(response);
    };
}
/** Explicit opt-in: opens ONLY a loopback Vite server. Caller owns close(); no browser is launched. */
async function startSDKViteDevelopment(prepared, options = {}) {
    assert.equal(options.execute, true, 'Vite execution requires explicit execute:true');
    verifyPrepared(prepared);
    const { createServer } = await import(
        pathToFileURL(path.join(prepared.tools.vite.packageDir, 'dist/node/index.js')).href
    );
    const server = await createServer({
        ...prepared.viteOptions,
        root: prepared.browserDir,
        cacheDir: path.join(prepared.outputDir, 'vite-development-cache'),
        resolve: { dedupe: [prepared.specifier] },
        plugins: [
            {
                name: 'frozen-sdk-resources',
                configureServer(server) {
                    server.middlewares.use(createSDKRequestHandler(prepared));
                },
                transformIndexHtml(html) {
                    return html.replace('data-sdk-mode="vite-production"', 'data-sdk-mode="vite-development"');
                },
            },
        ],
    });
    await server.listen();
    const address = server.httpServer.address();
    return { origin: 'http://127.0.0.1:' + address.port, version: '7.1.12', close: () => server.close() };
}
/** Combines observations, never supplies missing browser results or interprets oracle thresholds. */
function finalizeSDKObservation(prepared, cpu, browsers) {
    verifyPrepared(prepared);
    assert.equal(prepared.fixtureScope, COMMON_SCOPE, 'U06 extension cannot substitute for paired AU12 evidence');
    assert.equal(cpu?.fixtureScope, COMMON_SCOPE, 'CPU fixture scope differs');
    assert.equal(
        cpu?.status,
        'CPU_OBSERVED_BROWSER_PENDING',
        'CPU failures or NOT_RUN cannot produce a reference receipt',
    );
    assert.equal(cpu.packageSha256, prepared.package.sha256);
    assert.equal(cpu.compilerContract, prepared.compilerContract);
    assert.deepEqual(cpu.commonModeIds, prepared.commonModeIds);
    assert.deepEqual(cpu.compatibilityModeIds, prepared.compatibilityModeIds);
    assert.equal(cpu.sourceSha256, prepared.sourceSha256);
    assert.equal(cpu.preparationSha256, sha(fs.readFileSync(path.join(prepared.outputDir, 'preparation.json'))));
    assert(Array.isArray(browsers), 'All engine-specific independently collected browser modes required');
    assert.deepEqual(browsers.map((row) => row.mode).sort(), [...prepared.browserModes].sort());
    for (const row of browsers) {
        assert.equal(row.schema, 'upstream-sdk-browser-case/1');
        assert.equal(row.engine, prepared.engine);
        assert(
            row.presentation && /^[a-f0-9]{64}$/.test(row.presentation.sha256),
            'External compositor screenshot receipt required',
        );
        assert.equal(row.presentation.source, 'browser-compositor');
        assert.equal(row.presentation.contentValidated, true, 'External screenshot pixels must be checked');
        assert(row.closeReceipt, 'Native browser fixture close receipt required');
        for (const resource of row.decoders.resources)
            assert.equal(
                resource.sha256,
                prepared.decoderProvenance[resource.id]?.sha256,
                'Deployed decoder bytes differ from verified archive',
            );
    }
    const esm = browsers.find((row) => row.mode === 'importmap-unminified'),
        vite = browsers.find((row) => row.mode === 'vite-production');
    const parity = cpu.modes.map((mode) => ({
        id: mode.id,
        missingRuntime: mode.declaredValueExports.filter((name) => !esm.runtimeExports.includes(name)),
        missingDeclaration: esm.runtimeExports.filter((name) => !mode.declaredValueExports.includes(name)),
        missingMathRuntime: mode.declaredMathExports.filter((name) => !cpu.math.exports.includes(name)),
        missingMathDeclaration: cpu.math.exports.filter((name) => !mode.declaredMathExports.includes(name)),
    }));
    const types = {
        id: 'strict-types',
        strictNullChecks: true,
        skipLibCheck: true,
        declarationPackageSha256: prepared.declarations.sha256,
        compilerContract: prepared.compilerContract,
        fixtureScope: prepared.fixtureScope,
        commonModeIds: prepared.commonModeIds,
        compatibilityModeIds: prepared.compatibilityModeIds,
        fixtureSource: prepared.fixtureSource,
        negativeCases: prepared.negativeManifest.length,
        negativeCategories: prepared.negativeCategories,
        modes: cpu.modes,
        diagnostics: cpu.modes.flatMap((mode) => mode.diagnostics),
        parity,
    };
    return {
        schema: SCHEMA,
        taskId: 'AU12',
        engine: prepared.engine,
        status: 'OBSERVED_NOT_VALIDATED',
        cases: [
            {
                id: 'installed-esm',
                packageSha256: prepared.package.sha256,
                resolutionOrigin: 'isolated-installed-package',
                resolution: cpu.resolution,
                engineModuleIdentities: esm.engineModuleIdentities,
                runtimeExports: esm.runtimeExports,
                browserModes: browsers.filter((row) => row.mode.startsWith('importmap')),
                typeOnlyRuntimeExports: esm.typeOnlyRuntimeExports,
            },
            types,
            {
                id: 'vite',
                ...cpu.vite,
                runtimeErrors: browsers.flatMap((row) => row.runtimeErrors),
                pixels: vite.pixels,
                browserModes: browsers.filter((row) => row.mode.startsWith('vite')),
            },
            { id: 'dom-free-math', ...cpu.math },
            { id: 'decoder-paths', ...esm.decoders, artifactProvenance: prepared.decoderProvenance },
        ],
        provenance: {
            sourceSha256: prepared.sourceSha256,
            preparationSha256: cpu.preparationSha256,
            cpuAttempt: cpu.attemptDir,
        },
        scope: 'Independent installed consumer. Local decoder file deployment and missing-provider behavior, not successful compressed decoding.',
    };
}

module.exports = {
    prepareSDKConsumer,
    collectSDKCPU,
    createSDKRequestHandler,
    startSDKViteDevelopment,
    finalizeSDKObservation,
    treeDigest,
    archiveEntries,
    verifyInstalledArtifact,
    verifyDeclarationClosure,
    negativeManifest,
    SDK_COMPILER_MODES: MODES,
    SDK_NEGATIVE_CATEGORIES: NEGATIVE_CATEGORIES,
    SDK_NEGATIVE_CATEGORIES_BY_ENGINE: Object.freeze({
        cocosair: NEGATIVE_CATEGORIES,
        three: THREE_NEGATIVE_CATEGORIES,
    }),
    THREE_SDK_NEGATIVE_CATEGORIES: THREE_NEGATIVE_CATEGORIES,
    SDK_BROWSER_MODES: BROWSER_MODES,
    SDK_VITE_OPTIONS: VITE_OPTIONS,
};
