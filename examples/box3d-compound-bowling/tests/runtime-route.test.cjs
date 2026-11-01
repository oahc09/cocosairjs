/** CPU route contracts, not a browser, network server, native engine, or visual acceptance test. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRuntimeRoute, createGalleryRuntimeRoute } = require('../runtime-route.cjs');
const hash = (v) => crypto.createHash('sha256').update(v).digest('hex');
function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ex02-route-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const st = path.join(root, 'physics/box3d/st');
    fs.mkdirSync(st, { recursive: true });
    fs.writeFileSync(path.join(root, 'cocosair.module.js'), '// CPU fixture only');
    const artifacts = ['box3d-st.mjs', 'box3d-st.wasm', 'facade.mjs'].map((name) => {
        const bytes = Buffer.from('CPU fixture ' + name);
        fs.writeFileSync(path.join(st, name), bytes);
        return { path: name, bytes: bytes.length, sha256: hash(bytes) };
    });
    const identity = {
        coreSha: 'core',
        bindingBaseSha: 'binding',
        patchChainSha256: 'patch',
        abiVersion: 1,
        variant: 'st-simd',
        schemaSha256: 'schema',
    };
    const manifest = JSON.stringify({ ...identity, artifacts });
    fs.writeFileSync(path.join(st, 'manifest.json'), manifest);
    fs.writeFileSync(
        path.join(st, 'distribution-receipt.json'),
        JSON.stringify({
            feature: 'physics-box3d',
            descriptor: { identity, manifestSha256: hash(manifest), facadeSha256: artifacts[2].sha256 },
            artifacts,
        }),
    );
    return { root, st };
}
function request(route, url) {
    const result = {};
    result.handled = route(url, {
        writeHead(status, headers) {
            result.status = status;
            result.headers = headers;
        },
        end(body) {
            result.body = Buffer.from(body);
        },
    });
    return result;
}
test('standalone and Gallery share exact identity and runtime bytes; no fallback', (t) => {
    const { root } = fixture(t);
    const standalone = createRuntimeRoute({ runtime: root });
    const gallery = createGalleryRuntimeRoute({ runtime: root });
    const a = request(standalone, '/identity.json');
    const b = request(gallery, '/box3d-compound-bowling/identity.json');
    assert.equal(a.status, 200);
    assert.deepEqual(a.body, b.body);
    const identity = JSON.parse(a.body);
    for (const relative of [
        'cocosair.module.js',
        ...Object.keys(identity.runtimeAssets).map((name) => 'physics/box3d/st/' + name),
    ]) {
        const x = request(standalone, '/runtime/' + relative);
        const y = request(gallery, '/box3d-compound-bowling/runtime/' + relative);
        assert.equal(x.status, 200);
        assert.deepEqual(x.body, y.body);
        assert.equal(
            hash(x.body),
            relative === 'cocosair.module.js'
                ? identity.runtimeSha256
                : identity.runtimeAssets[path.basename(relative)].sha256,
        );
    }
    assert.equal(request(gallery, '/runtime/cocosair.module.js').handled, false);
    assert.equal(request(gallery, '/starter/').handled, false);
    for (const suffix of ['../cocosair.module.js', '%2e%2e/cocosair.module.js', 'cocosair.module.js.map', 'unknown'])
        assert.equal(request(standalone, '/runtime/' + suffix).status, 404);
    // Runtime response must not silently change after identity was captured.
    fs.writeFileSync(path.join(root, 'cocosair.module.js'), '// altered fixture');
    assert.equal(hash(request(standalone, '/runtime/cocosair.module.js').body), identity.runtimeSha256);
});
test('missing explicit runtime fails closed without breaking unrelated Gallery routes', () => {
    assert.throws(() => createRuntimeRoute({}), /Set BOX3D_RUNTIME/);
    assert.throws(() => createRuntimeRoute({ runtime: 'build' }), /Set BOX3D_RUNTIME/);
    const route = createGalleryRuntimeRoute({});
    assert.equal(request(route, '/starter/').handled, false);
    const redirect = request(route, '/box3d-compound-bowling');
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.Location, '/box3d-compound-bowling/');
    const result = request(route, '/box3d-compound-bowling/identity.json');
    assert.equal(result.status, 503);
    assert.match(result.body.toString(), /BOX3D_RUNTIME/);
});
test('tampered ST asset and mismatched receipt are rejected before serving', (t) => {
    const { root, st } = fixture(t);
    const wasm = path.join(st, 'box3d-st.wasm');
    const original = fs.readFileSync(wasm);
    fs.writeFileSync(wasm, 'tampered');
    assert.throws(() => createRuntimeRoute({ runtime: root }), /Mismatched EX02 ST asset/);
    fs.writeFileSync(wasm, original);
    const file = path.join(st, 'distribution-receipt.json');
    const receipt = JSON.parse(fs.readFileSync(file));
    receipt.descriptor.manifestSha256 = 'wrong';
    fs.writeFileSync(file, JSON.stringify(receipt));
    assert.throws(() => createRuntimeRoute({ runtime: root }), /Invalid EX02 ST distribution/);
});
test('symlink outside selected runtime is rejected', (t) => {
    const { root, st } = fixture(t);
    const outside = path.join(path.dirname(root), path.basename(root) + '-outside');
    fs.writeFileSync(outside, 'outside');
    t.after(() => fs.rmSync(outside, { force: true }));
    const wasm = path.join(st, 'box3d-st.wasm');
    fs.unlinkSync(wasm);
    fs.symlinkSync(outside, wasm);
    assert.throws(() => createRuntimeRoute({ runtime: root }), /Outside runtime mount/);
});
test('both entry points retain shared routing and scoped relative browser URLs', () => {
    const root = path.resolve(__dirname, '../../..');
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    const main = fs.readFileSync(path.join(__dirname, '../src/main.ts'), 'utf8');
    const standalone = fs.readFileSync(path.join(__dirname, '../serve.cjs'), 'utf8');
    const gallery = fs.readFileSync(path.join(root, 'tools/dev/dev-server.cjs'), 'utf8');
    assert.match(html, /\.\/runtime\/cocosair.module.js/);
    assert.match(main, /new URL\(['"]\.\.\/identity.json['"], import.meta.url\)/);
    assert.match(main, /new URL\(['"]\.\.\/runtime\/physics\/box3d\/st\/['"], import.meta.url\)/);
    assert.match(standalone, /createRuntimeRoute\(/);
    assert.match(standalone, /runtimeRoute\(decodeURIComponent\(url.pathname\), res\)/);
    assert.match(gallery, /createGalleryRuntimeRoute\(/);
    assert.match(gallery, /if \(ex02RuntimeRoute\(p, res\)\) return/);
    for (const page of ['http://localhost:7472/', 'http://localhost:7454/box3d-compound-bowling/']) {
        const script = new URL('src/main.ts', page);
        assert.equal(new URL('../identity.json', script).href, new URL('identity.json', page).href);
        assert.equal(
            new URL('../runtime/physics/box3d/st/', script).href,
            new URL('runtime/physics/box3d/st/', page).href,
        );
    }
});

test('Gallery metadata remains draft and agrees with its manifest projection', () => {
    const root = path.resolve(__dirname, '../../..');
    const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '../example.json')));
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'examples/files.json')));
    const rows = manifest.examples.filter((entry) => entry.id === spec.id);
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.equal(spec.status, 'draft');
    assert.equal(spec.specStatus, 'draft');
    assert.equal(row.status, 'draft');
    assert.equal(row.specStatus, 'draft');
    assert.equal(spec.promotion, undefined);
    assert.equal(row.promotion, undefined);
    assert.equal(row.dir, 'box3d-compound-bowling');
    for (const key of ['title', 'learning', 'effect', 'validation', 'ready']) assert.deepEqual(row[key], spec[key]);
    assert.deepEqual(row.api, { primary: spec.api.primary, supporting: spec.api.supporting, claims: spec.api.claims });
    assert.ok(manifest.categories[spec.category].includes(spec.id));
    assert.match(spec.effect.functional, /NOT_RUN/);
});
