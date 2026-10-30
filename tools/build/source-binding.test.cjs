const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSourceBinding, verifySourceBinding } = require('./source-binding.cjs');
const { externalizeSources } = require('./source-map-publication.cjs');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'air-source-binding-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, 'src'));
    fs.mkdirSync(path.join(root, 'build'));
    const source = path.join(root, 'src/entry.ts');
    const bundle = path.join(root, 'build/runtime.js');
    fs.writeFileSync(source, 'export const value = 1;\n');
    fs.writeFileSync(bundle, 'const value = 1;\n');
    const map = {
        version: 3,
        file: 'runtime.js',
        sources: ['../src/entry.ts'],
        sourcesContent: ['export const value = 1;\n'],
        names: [],
        mappings: 'AAAA',
    };
    fs.writeFileSync(bundle + '.map', JSON.stringify(externalizeSources(map)));
    const write = (origin) =>
        fs.writeFileSync(bundle + '.sources.json', JSON.stringify(createSourceBinding(root, bundle, map, origin)));
    return { root, source, bundle, map, write };
}

test('no-sources bundles bind current source and exact JS/map bytes without embedding source', (t) => {
    const f = fixture(t);
    f.write();
    assert.equal(verifySourceBinding(f.root, f.bundle).matches, true);
    assert.equal(JSON.parse(fs.readFileSync(f.bundle + '.map')).sourcesContent, undefined);
    f.write('retained-compiler-map-migration');
    assert.equal(verifySourceBinding(f.root, f.bundle).origin, 'retained-compiler-map-migration');
});

for (const target of ['source', 'bundle', 'map', 'receipt']) {
    test(`binding fails closed for changed or missing ${target}`, (t) => {
        const f = fixture(t);
        f.write();
        const file = {
            source: f.source,
            bundle: f.bundle,
            map: f.bundle + '.map',
            receipt: f.bundle + '.sources.json',
        }[target];
        fs.appendFileSync(file, ' ');
        assert.equal(verifySourceBinding(f.root, f.bundle).matches, target === 'receipt');
        if (target === 'receipt') {
            const r = JSON.parse(fs.readFileSync(file));
            r.sources[0].sha256 = '0'.repeat(64);
            fs.writeFileSync(file, JSON.stringify(r));
            assert.equal(verifySourceBinding(f.root, f.bundle).matches, false);
        }
        fs.unlinkSync(file);
        assert.equal(verifySourceBinding(f.root, f.bundle).matches, false);
    });
}

test('creation rejects absent/stale embedded sources and nonmatching published maps', (t) => {
    const f = fixture(t);
    assert.throws(() => createSourceBinding(f.root, f.bundle, { ...f.map, sourcesContent: undefined }), /content/);
    assert.throws(() => createSourceBinding(f.root, f.bundle, { ...f.map, sourcesContent: ['stale'] }), /mismatch/);
    assert.throws(() => createSourceBinding(f.root, f.bundle, { ...f.map, mappings: 'BBBB' }), /published map/);
});

for (const source of ['../outside.ts', '../src/missing.ts', 'https://host/entry.ts', '../src/alias.ts']) {
    test(`creation rejects unknown or escaped source ${source}`, (t) => {
        const f = fixture(t);
        fs.writeFileSync(path.join(f.root, 'outside.ts'), f.map.sourcesContent[0]);
        fs.symlinkSync(path.join(f.root, 'outside.ts'), path.join(f.root, 'src/alias.ts'));
        f.map.sources = [source];
        fs.writeFileSync(f.bundle + '.map', JSON.stringify(externalizeSources(f.map)));
        assert.throws(() => createSourceBinding(f.root, f.bundle, f.map));
    });
}
