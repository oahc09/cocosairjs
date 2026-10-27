/** Read-only EX02 runtime mount shared by standalone and Gallery servers.
 * An explicit runtime is mandatory; no fallback to the developer build directory.
 * Captured bytes bind the identity response and subsequent runtime responses together.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const ST = 'physics/box3d/st/';
const MIME = {
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.wasm': 'application/wasm',
    '.json': 'application/json',
};

function createRuntimeRoute({ runtime, exampleRoot = __dirname, prefix = '/' }) {
    if (!runtime || !path.isAbsolute(runtime))
        throw new Error('Set BOX3D_RUNTIME to the existing qualified runtime directory.');
    if (!prefix.startsWith('/') || !prefix.endsWith('/')) throw new Error('Invalid EX02 mount prefix');
    const root = fs.realpathSync(runtime);
    const files = new Map();
    function capture(relative) {
        const resolved = fs.realpathSync(path.join(root, relative));
        if (!resolved.startsWith(root + path.sep)) throw new Error('Outside runtime mount');
        const bytes = fs.readFileSync(resolved);
        files.set(relative, bytes);
        return { bytes: bytes.length, sha256: hash(bytes) };
    }
    const runtimeIdentity = capture('cocosair.module.js');
    const runtimeAssets = Object.fromEntries(
        ['manifest.json', 'box3d-st.mjs', 'box3d-st.wasm', 'facade.mjs', 'distribution-receipt.json'].map((name) => [
            name,
            capture(ST + name),
        ]),
    );
    const manifest = JSON.parse(files.get(ST + 'manifest.json'));
    const receipt = JSON.parse(files.get(ST + 'distribution-receipt.json'));
    if (
        manifest.variant !== 'st-simd' ||
        receipt.feature !== 'physics-box3d' ||
        receipt.descriptor?.manifestSha256 !== runtimeAssets['manifest.json'].sha256 ||
        receipt.descriptor?.facadeSha256 !== runtimeAssets['facade.mjs'].sha256
    )
        throw new Error('Invalid EX02 ST distribution identity');
    for (const key of ['coreSha', 'bindingBaseSha', 'patchChainSha256', 'abiVersion', 'variant', 'schemaSha256']) {
        if (manifest[key] === undefined || receipt.descriptor?.identity?.[key] !== manifest[key])
            throw new Error('Mismatched EX02 ST identity: ' + key);
    }
    for (const name of ['box3d-st.mjs', 'box3d-st.wasm', 'facade.mjs']) {
        for (const record of [manifest, receipt]) {
            const row = record.artifacts?.find((item) => item.path === name);
            if (row?.sha256 !== runtimeAssets[name].sha256 || row?.bytes !== runtimeAssets[name].bytes)
                throw new Error('Mismatched EX02 ST asset: ' + name);
        }
    }
    const source = Object.fromEntries(
        [
            ...fs
                .readdirSync(path.join(exampleRoot, 'src'))
                .filter((name) => /\.(mjs|ts)$/.test(name))
                .sort()
                .map((name) => 'src/' + name),
            'index.html',
            'style.css',
            'serve.cjs',
            'runtime-route.cjs',
        ].map((name) => [name, hash(fs.readFileSync(path.join(exampleRoot, name)))]),
    );
    const identity = Buffer.from(JSON.stringify({ runtimeSha256: runtimeIdentity.sha256, runtimeAssets, source }));
    return function route(pathname, res) {
        if (pathname === prefix + 'identity.json') {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            res.end(identity);
            return true;
        }
        if (!pathname.startsWith(prefix + 'runtime/')) return false;
        const relative = pathname.slice((prefix + 'runtime/').length);
        const bytes = files.get(relative);
        res.writeHead(bytes ? 200 : 404, {
            'Content-Type': bytes ? MIME[path.extname(relative)] || 'application/octet-stream' : 'text/plain',
            'Cache-Control': 'no-store',
        });
        res.end(bytes || 'Not in the captured EX02 runtime');
        return true;
    };
}

/** Lazy setup keeps unrelated Gallery examples usable when no explicit EX02 runtime was selected. */
function createGalleryRuntimeRoute(options) {
    let route;
    const prefix = '/box3d-compound-bowling/';
    return (pathname, res) => {
        if (pathname === prefix.slice(0, -1)) {
            res.writeHead(302, { Location: prefix, 'Cache-Control': 'no-store' });
            res.end('');
            return true;
        }
        if (pathname !== prefix + 'identity.json' && !pathname.startsWith(prefix + 'runtime/')) return false;
        try {
            route ||= createRuntimeRoute({ ...options, prefix });
            return route(pathname, res);
        } catch (error) {
            res.writeHead(503, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
            res.end('EX02 runtime unavailable: ' + error.message);
            return true;
        }
    };
}
module.exports = { createRuntimeRoute, createGalleryRuntimeRoute };
