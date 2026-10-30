const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readSourceMapSource } = require('./source-map-source.cjs');

test('source map requests return exact original TS/JS bytes, including CRLF', (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'air-map-source-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, 'src/vendor'), { recursive: true });
    const bytes = Buffer.from('export const value: number = 1;\r\n// 中文\r\n');
    fs.writeFileSync(path.join(root, 'src/a.ts'), bytes);
    fs.writeFileSync(path.join(root, 'src/vendor/a.js'), bytes);
    assert.deepEqual(readSourceMapSource(root, '/src/a.ts'), bytes);
    assert.deepEqual(readSourceMapSource(root, '/src/vendor/a.js'), bytes);
});

test('source map route rejects traversal, directories, unknown files and escaping symlinks', (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'air-map-source-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'outside.ts'), 'private');
    fs.symlinkSync(path.join(root, 'outside.ts'), path.join(root, 'src/escape.ts'));
    fs.mkdirSync(path.join(root, 'src/directory.ts'));
    for (const name of [
        '/src/../outside.ts',
        '/src/escape.ts',
        '/src/directory.ts',
        '/src/missing.ts',
        '/src/a.json',
        '/src/a\\b.ts',
        '/src/./a.ts',
        '/src/a\0.ts',
        '/outside.ts',
    ]) {
        assert.equal(readSourceMapSource(root, name), null, name);
    }
});
