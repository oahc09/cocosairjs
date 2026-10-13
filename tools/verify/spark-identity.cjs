/**
 * SPK-00 read-only identity collector: freezes the source, build, and Spark port
 * fingerprints this integration round is executed against. Writes a new evidence
 * file; never rewrites historical reports.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = process.env.SPARK_PORT_ROOT || 'E:/AIProMax/github/spark-cocosairjs';
const OUT_DIR = path.join(ROOT, 'docs', 'evidence', 'spark');
const OUT = path.join(OUT_DIR, `identity-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.json`);

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const fileSha = (abs) => {
    if (!fs.existsSync(abs)) return null;
    const st = fs.statSync(abs);
    return { path: abs, size: st.size, sha256: sha256(fs.readFileSync(abs)) };
};
const listFiles = (dir) => {
    const out = [];
    const walk = (d, rel) => {
        if (!fs.existsSync(d)) return;
        for (const ent of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
            const abs = path.join(d, ent.name);
            const r = rel ? `${rel}/${ent.name}` : ent.name;
            if (ent.isDirectory()) walk(abs, r);
            else out.push({ path: r, size: fs.statSync(abs).size, sha256: sha256(fs.readFileSync(abs)) });
        }
    };
    walk(dir, '');
    return out;
};
const treeDigest = (files) => sha256(Buffer.from(files.map((f) => `${f.sha256}  ${f.path}`).join('\n')));
const rel = (abs) => abs.split(path.sep).join('/');

const repoRel = (p) => {
    const abs = path.resolve(p);
    return fs.existsSync(abs) ? { path: rel(abs), size: fs.statSync(abs).size, sha256: sha256(fs.readFileSync(abs)) } : { path: rel(abs), size: null, sha256: null };
};
const engine = ['src/cocos/gfx/webgl2/webgl2-device.ts', 'src/cocos/gfx/webgl2/webgl2-commands.ts',
    'src/cocos/gfx/webgl2/webgl2-gpu-objects.ts', 'src/cocos/gfx/webgl2/webgl2-texture.ts',
    'src/cocos/gfx/base/define.ts', 'build/cocosair.module.js', 'build/cocosair.module.min.js',
    'build/cocosair.module.d.ts', 'tools/build/build-number.json'].map((p) => ({ ...repoRel(path.join(ROOT, p)), path: p }));

const portSrc = listFiles(path.join(PORT, 'src'));
const portDist = listFiles(path.join(PORT, 'dist'));
const portVendor = listFiles(path.join(PORT, 'vendor'));
const upstreamSrc = listFiles(path.join(PORT, 'upstream', 'spark', 'src'));
const upstreamRust = listFiles(path.join(PORT, 'upstream', 'spark', 'rust'));
const upstreamOther = listFiles(path.join(PORT, 'upstream', 'spark')).filter(
    (f) => !f.path.startsWith('src/') && !f.path.startsWith('rust/'),
);
const portTools = listFiles(path.join(PORT, 'tools'));
const portTests = listFiles(path.join(PORT, 'tests'));

let head = null;
try {
    head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
} catch (e) {
    head = `GIT_UNAVAILABLE: ${e.message}`;
}

const result = {
    schema: 'spark-integration-identity/v1',
    collectedAt: new Date().toISOString(),
    task: 'SPK-00',
    notes: [
        'Read-only identity freeze. AVAILABLE/recorded only; no gate PASS implied.',
        'WASM is shipped as a source-equivalent release artifact and was NOT rebuilt from Rust in this environment.',
        'Historical reports are not overwritten by this collector.',
    ],
    repository: {
        root: rel(ROOT),
        gitHead: head,
        files: engine,
    },
    portPackage: {
        root: rel(PORT),
        present: fs.existsSync(PORT),
        srcFiles: portSrc,
        srcTreeDigest: treeDigest(portSrc),
        distFiles: portDist,
        vendorFiles: portVendor,
        toolsFiles: portTools,
        testsFiles: portTests,
        manifests: ['EVIDENCE-MANIFEST.json', 'SOURCE-MANIFEST.json', 'provenance.json', 'package.json']
            .map((name) => ({ ...repoRel(path.join(PORT, name)), path: name })),
    },
    frozenUpstream: {
        srcFileCount: upstreamSrc.length,
        rustFileCount: upstreamRust.length,
        srcTreeDigest: treeDigest(upstreamSrc),
        rustTreeDigest: treeDigest(upstreamRust),
        otherFiles: upstreamOther,
        commitTxt: upstreamOther.find((f) => f.path === 'commit.txt') || null,
        wasmExpectedSha256: '974320be5859f426967a2d9cc237e5eae1aca98b55e35087022d6d884b2dcce7',
        wasmRecorded: portVendor.filter((f) => f.path.endsWith('.wasm')),
    },
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
console.log(`[spark-identity] wrote ${rel(OUT)}`);
console.log(`[spark-identity] gitHead=${head}`);
console.log(`[spark-identity] port.src=${portSrc.length} files digest=${result.portPackage.srcTreeDigest}`);
console.log(`[spark-identity] upstream src=${upstreamSrc.length} rust=${upstreamRust.length} wasm=${JSON.stringify(result.frozenUpstream.wasmRecorded.map((w) => w.sha256))}`);
