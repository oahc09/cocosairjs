/** Build the original EX01 as static assets using an already-built normal runtime.
 * This does not build the engine, start a browser, publish, or qualify any Gate.
 * Usage: node package-ex01-preview.cjs <worktree> <normal-runtime-dir> <new-output-dir> <verified-runtime-provenance.json>
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const [worktreeArg, runtimeArg, outputArg, provenanceArg] = process.argv.slice(2);
if (!worktreeArg || !runtimeArg || !outputArg || !provenanceArg) throw new Error('Four paths are required.');
const worktree = path.resolve(worktreeArg);
const runtime = path.resolve(runtimeArg);
const output = path.resolve(outputArg);
if (fs.existsSync(output)) throw new Error('Refusing to overwrite an existing preview.');
const example = path.join(worktree, 'examples/box3d-rigidbody-playground');
const esbuild = require(path.join(worktree, 'node_modules/esbuild'));
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const inputs = [];
const outputs = [];
function read(base, relative, role) {
    const filename = path.join(base, relative);
    if (!fs.lstatSync(filename).isFile()) throw new Error(`Not a regular file: ${relative}`);
    const bytes = fs.readFileSync(filename);
    inputs.push({
        role,
        path: relative,
        bytes: bytes.length,
        sha256: sha(bytes),
    });
    return bytes;
}
function write(relative, bytes, provenance) {
    const filename = path.join(output, relative);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, bytes, { flag: 'wx' });
    outputs.push({
        path: relative,
        bytes: Buffer.byteLength(bytes),
        sha256: sha(bytes),
        provenance,
    });
}
const identityBytes = read(example, 'source-identity.json', 'source-identity');
const identity = JSON.parse(identityBytes);
for (const item of identity.files) {
    const bytes = fs.readFileSync(path.join(worktree, item.path));
    if (bytes.length !== item.bytes || sha(bytes) !== item.sha256) throw new Error(`Source drift: ${item.path}`);
}
let html = read(example, 'index.html', 'example-source').toString('utf8');
const sourceEntry = 'src="./src/main.ts"';
if (html.split(sourceEntry).length !== 2) throw new Error('Expected exactly one original TS scene entry.');
html = html.replace(sourceEntry, 'src="./src/main.js"');
write('index.html', html, 'Original HTML; only .ts entry extension changed to emitted .js.');
for (const relative of ['style.css', 'original-requirements.json']) {
    write(relative, read(example, relative, 'example-source'), 'Byte-identical original EX01 asset.');
}
write('source-identity.json', identityBytes, 'Original authored-source identity, not a runtime PASS.');
for (const basename of fs.readdirSync(path.join(example, 'src')).sort()) {
    if (!basename.endsWith('.ts')) throw new Error(`Unexpected example source: ${basename}`);
    const relative = `src/${basename}`;
    const source = read(example, relative, 'example-source').toString('utf8');
    const emitted = esbuild.transformSync(source, {
        loader: 'ts',
        format: 'esm',
        target: 'es2022',
        sourcemap: 'external',
        sourcefile: relative,
    });
    if (emitted.warnings.length) throw new Error(JSON.stringify(emitted.warnings));
    const target = relative.replace(/\.ts$/, '.js');
    write(target, emitted.code + `\n//# sourceMappingURL=${path.basename(target)}.map\n`, 'Scene-only TS transform.');
    write(`${target}.map`, emitted.map, 'Scene-only source map.');
}
const runtimeFiles = [
    'cocosair.module.js',
    'cocosair.module.js.map',
    'box2d3/LICENSE.Box2D.txt',
    'box2d3/air-box2d.mjs',
    'box2d3/air-box2d.wasm',
    'box2d3/receipt.json',
    'physics/box3d/st/LICENSE.Box3D.txt',
    'physics/box3d/st/box3d-st.mjs',
    'physics/box3d/st/box3d-st.wasm',
    'physics/box3d/st/distribution-receipt.json',
    'physics/box3d/st/facade.d.mts',
    'physics/box3d/st/facade.mjs',
    'physics/box3d/st/manifest.json',
    'webgpu/LICENSE-apache.txt',
    'webgpu/LICENSE-dawn.txt',
    'webgpu/LICENSE-glslang.txt',
    'webgpu/NOTICE-babylon.md',
    'webgpu/glslang.js',
    'webgpu/glslang.wasm',
    'webgpu/manifest.json',
    'webgpu/twgsl.js',
    'webgpu/twgsl.wasm',
];
const provenance = JSON.parse(fs.readFileSync(path.resolve(provenanceArg), 'utf8'));
if (
    !/^libfile_[a-zA-Z0-9]+$/.test(provenance.runtimeLibraryFileId) ||
    !/^[a-f0-9]{64}$/.test(provenance.runtimeArchiveSha256)
)
    throw new Error('Expected persisted runtime identity.');
const receiptBytes = read(runtime, 'evidence/build/post-build-inspection.json', 'runtime-build-receipt');
if (sha(receiptBytes) !== provenance.postBuildReceiptSha256) throw new Error('Runtime receipt drift.');
const receipt = JSON.parse(receiptBytes);
if (
    receipt.headAfter !== provenance.producerCommit ||
    receipt.treeAfter !== provenance.producerTree ||
    !/^[a-f0-9]{40}$/.test(receipt.headAfter) ||
    receipt.frozenProductSourceChanges.length
) {
    throw new Error('Unexpected producer source identity.');
}
cp.execFileSync('git', ['merge-base', '--is-ancestor', receipt.headAfter, 'HEAD'], { cwd: worktree });
const sourceBytes = read(runtime, 'evidence/build/source-inputs.json', 'frozen-runtime-source');
if (sha(sourceBytes) !== provenance.sourceInputSha256) throw new Error('Runtime source inventory drift.');
const sourceInputs = JSON.parse(sourceBytes).files;
if (
    !Array.isArray(sourceInputs) ||
    sourceInputs.length !== receipt.sourceFilesChecked ||
    new Set(sourceInputs.map((item) => item.path)).size !== sourceInputs.length
)
    throw new Error('Source inventory mismatch.');
for (const item of sourceInputs) {
    if (typeof item.path !== 'string' || path.isAbsolute(item.path) || item.path.split('/').includes('..'))
        throw new Error('Unsafe source path.');
    const bytes = fs.readFileSync(path.join(worktree, item.path));
    if (bytes.length !== item.bytes || sha(bytes) !== item.sha256)
        throw new Error(`Runtime source drift: ${item.path}`);
}
if (receipt.outputs.length !== runtimeFiles.length) throw new Error('Runtime receipt has an unexpected file set.');
for (const relative of runtimeFiles) {
    const bytes = read(runtime, relative, 'normal-production-runtime');
    const expected = receipt.outputs.find((item) => item.path === relative);
    if (!expected || bytes.length !== expected.bytes || sha(bytes) !== expected.sha256) {
        throw new Error(`Runtime artifact drift: ${relative}`);
    }
    write(`build/${relative}`, bytes, 'Byte-identical normal runtime output.');
}
const result = {
    schema: 'cocosair.box3d.ex01.static-preview.v1',
    createdAt: new Date().toISOString(),
    sourceCommit: cp
        .execFileSync('git', ['rev-parse', 'HEAD'], {
            cwd: worktree,
            encoding: 'utf8',
        })
        .trim(),
    sourceTree: cp
        .execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {
            cwd: worktree,
            encoding: 'utf8',
        })
        .trim(),
    engineSourceCommit: receipt.headAfter,
    runtimeLibraryFileId: provenance.runtimeLibraryFileId,
    runtimeArchiveSha256: provenance.runtimeArchiveSha256,
    esbuildVersion: esbuild.version,
    status: 'STATIC_PACKAGE_ONLY_BROWSER_NOT_RUN_EX01_IN_PROGRESS',
    formalCells: { total: 2128, status: 'NOT_RUN' },
    gates: { total: 9, status: 'NOT_RUN' },
    inputs,
    outputs,
};
write('preview-manifest.json', JSON.stringify(result, null, 2) + '\n', 'Package manifest; self hash is external.');
process.stdout.write(JSON.stringify({ output, files: outputs.length, status: result.status }) + '\n');
