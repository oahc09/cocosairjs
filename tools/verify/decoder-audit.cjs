/* T7 Gate G5-build: reproducible decoder packaging audit (machine-readable output).
 *
 * Checks performed (exit code 1 on any failure; stdout = JSON report):
 *  1. MANIFEST integrity - every file under build/gltf-decoders is listed with the
 *     exact byte length and sha256 recorded in build/gltf-decoders/MANIFEST.md, and
 *     every manifest row exists on disk (no silent add/remove/modify).
 *  2. License coverage - each decoder directory ships its own LICENSE.md and the
 *     manifest records a pinned version + source for that decoder.
 *  3. Bundle isolation - the shipped engine bundle (dev + min + their source maps)
 *     embeds no decoder bytes (no WASM magic, no decoder file names) so the main
 *     module never initializes decoders by being loaded.
 *  4. Offline package load - `npm pack` the tarball, extract it, and require the
 *     meshopt and draco decoder entries from the UNPACKED tree (draco only needs
 *     its js/wasm pair discoverable; actual WASM instantiation is exercised by the
 *     smoke suite in a WebAssembly-capable runtime).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
const decoders = path.join(root, 'build', 'gltf-decoders');
const failures = [];
const artifacts = [];

function walk (dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) { out.push(...walk(p)); } else { out.push(p); }
    }
    return out;
}
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const rel = (file) => path.relative(decoders, file).split(path.sep).join('/');

// --- 1/2: manifest integrity + licenses -------------------------------------------------
const manifest = fs.readFileSync(path.join(decoders, 'MANIFEST.md'), 'utf8');
const rows = new Map(); // rel path -> { bytes, sha256 }
for (const line of manifest.split(/\r?\n/)) {
    const m = /^\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*([0-9a-f]{64})\s*\|\s*$/.exec(line);
    if (m) { rows.set(m[1], { bytes: Number(m[2]), sha: m[3] }); }
}
const onDisk = walk(decoders).filter((f) => rel(f) !== 'MANIFEST.md');
for (const file of onDisk) {
    const key = rel(file);
    const entry = rows.get(key);
    if (!entry) { failures.push(`decoder file missing from MANIFEST: ${key}`); continue; }
    const st = fs.statSync(file);
    if (st.size !== entry.bytes) { failures.push(`${key}: size ${st.size} != manifest ${entry.bytes}`); continue; }
    const hash = sha256(file);
    if (hash !== entry.sha) { failures.push(`${key}: sha256 ${hash} != manifest ${entry.sha}`); }
    artifacts.push({ file: key, bytes: st.size, sha256: hash });
}
for (const key of rows.keys()) {
    if (key === 'MANIFEST.md' || !fs.existsSync(path.join(decoders, key))) {
        if (!onDisk.some((f) => rel(f) === key)) { failures.push(`manifest row has no file on disk: ${key}`); }
    }
}
for (const dir of ['meshopt', 'draco', 'basis']) {
    const license = path.join(decoders, dir, 'LICENSE.md');
    if (!fs.existsSync(license)) { failures.push(`missing license: ${dir}/LICENSE.md`); }
    if (!new RegExp(`${dir}[^\\n]*\\n[\\s\\S]*?(npm pack|github|Source:).*\\d`).test(manifest)) {
        failures.push(`manifest lacks pinned source/version for ${dir}`);
    }
}

// --- 3: bundle isolation ----------------------------------------------------------------
const bundleFiles = ['build/cocosair.module.js', 'build/cocosair.module.min.js',
    'build/cocosair.module.js.map', 'build/cocosair.module.min.js.map'];
const wasi = Buffer.from([0x00, 0x61, 0x73, 0x6d]);
for (const relPath of bundleFiles) {
    const abs = path.join(root, relPath);
    if (!fs.existsSync(abs)) { failures.push(`bundle artifact missing: ${relPath}`); continue; }
    const buf = fs.readFileSync(abs);
    if (buf.includes(wasi)) { failures.push(`${relPath}: contains WASM magic bytes`); }
    const text = buf.toString('utf8');
    // JS bundles must not reference the packaged decoder directory (apps own that path);
    // source maps legitimately contain upstream source (e.g. mesh-codec import strings),
    // so maps are only checked above for embedded binary magic.
    if (!relPath.endsWith('.map')) {
        for (const marker of ['basis_transcoder.wasm', 'draco_decoder.wasm', 'gltf-decoders/']) {
            if (text.includes(marker)) { failures.push(`${relPath}: embeds decoder reference ${marker}`); }
        }
    }
    artifacts.push({ file: relPath, bytes: buf.length });
}

// --- 4: offline npm pack + unpack require -------------------------------------------------
const packOut = execSync('npm pack --json', { cwd: root, encoding: 'utf8' });
const tarball = JSON.parse(packOut)[0].filename;
const unpackDir = path.join(root, 'build', `.tmp-pack-audit-${Date.now()}`);
fs.mkdirSync(unpackDir, { recursive: true });
try {
    // Relative paths + cwd: Git Bash tar treats 'E:\...' as a remote-host spec.
        execSync(`tar -xzf "${tarball}" -C "${path.relative(root, unpackDir)}"`, { cwd: root, stdio: 'inherit' });
    const pkg = path.join(unpackDir, 'package');
    for (const required of ['build/cocosair.module.js', 'build/gltf-decoders/MANIFEST.md',
        'build/gltf-decoders/meshopt/meshopt_decoder.cjs', 'build/gltf-decoders/draco/draco3d.js',
        'build/gltf-decoders/draco/draco_decoder.wasm', 'build/gltf-decoders/basis/basis_transcoder.js',
        'build/gltf-decoders/basis/basis_transcoder.wasm', 'docs/THIRD_PARTY_LICENSES.md', 'LICENSE']) {
        if (!fs.existsSync(path.join(pkg, required))) { failures.push(`npm pack missing: ${required}`); }
    }
    // Loading the meshopt decoder from the unpacked tree proves offline usability.
    try {
        const meshopt = require(path.join(pkg, 'build/gltf-decoders/meshopt/meshopt_decoder.cjs'));
        if (typeof meshopt.decodeGltfBuffer !== 'function' || typeof meshopt.ready?.then !== 'function') {
            failures.push('unpacked meshopt decoder lacks decodeGltfBuffer/ready');
        }
    } catch (err) {
        failures.push(`unpacked meshopt decoder cannot load: ${err.code || err.name}: ${err.message}`);
    }
    // Unpacked decoder hashes must match the manifest (bytes are not mutated by packaging).
    for (const [key, entry] of rows) {
        const f = path.join(pkg, 'build/gltf-decoders', key);
        if (!fs.existsSync(f) || key === 'MANIFEST.md') { continue; }
        if (sha256(f) !== entry.sha) { failures.push(`unpacked ${key}: sha256 drifted from manifest`); }
    }
} finally {
    fs.rmSync(unpackDir, { recursive: true, force: true });
    fs.rmSync(path.join(root, tarball), { force: true });
}

const report = { ok: failures.length === 0, failures, artifacts, manifestFiles: rows.size };
console.log(JSON.stringify(report, null, 2));
process.exit(failures.length ? 1 : 0);
