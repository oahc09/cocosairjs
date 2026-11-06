const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const { screenshotPath, resolveScreenshot } = require('./browser-matrix-paths.cjs');
const root = path.resolve(__dirname, '../..');

test('new matrix paths use portable separators and retain before/after identities', () => {
    assert.equal(
        screenshotPath('profiler-overlay', 'chromium'),
        'docs/evidence/browser-matrix/profiler-overlay/matrix-chromium.png',
    );
    assert.equal(
        screenshotPath('profiler-overlay', 'webkit', true),
        'docs/evidence/browser-matrix/profiler-overlay/matrix-webkit-before.png',
    );
});

test('Windows and POSIX historical spellings resolve to the same repository artifact', () => {
    const relative = screenshotPath('profiler-overlay', 'firefox');
    assert.equal(resolveScreenshot(root, relative.replace(/\//g, '\\')), path.join(root, relative));
    assert.equal(resolveScreenshot(root, relative), path.join(root, relative));
});

function fixture(t) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'air-matrix-paths-'));
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
    const repo = path.join(temp, 'repo');
    const outside = path.join(temp, 'repo-other');
    const directory = path.join(repo, 'docs/evidence/browser-matrix');
    fs.mkdirSync(directory, { recursive: true });
    fs.mkdirSync(outside);
    return { repo, outside, directory };
}

test('missing screenshots and intermediate directories retain normal presence-check behavior', (t) => {
    const f = fixture(t);
    const relative = screenshotPath('example', 'chromium');
    const expected = path.join(f.repo, relative);
    assert.equal(resolveScreenshot(f.repo, relative), expected);
    assert.equal(fs.existsSync(expected), false);
    fs.mkdirSync(path.dirname(expected));
    assert.equal(resolveScreenshot(f.repo, relative), expected);
    assert.equal(fs.existsSync(expected), false);
});

test(
    'existing file symlinks cannot escape through a syntactically valid artifact name',
    { skip: process.platform === 'win32' },
    (t) => {
        const f = fixture(t);
        const relative = screenshotPath('example', 'chromium');
        fs.mkdirSync(path.join(f.directory, 'example'));
        const target = path.join(f.outside, 'matrix-chromium.png');
        fs.writeFileSync(target, 'outside fixture');
        fs.symlinkSync(target, path.join(f.repo, relative), 'file');
        assert.throws(() => resolveScreenshot(f.repo, relative), /escapes repository/);
    },
);

for (const exists of [false, true]) {
    test(`intermediate directory links cannot escape when the screenshot exists=${exists}`, (t) => {
        const f = fixture(t);
        if (exists) fs.writeFileSync(path.join(f.outside, 'matrix-chromium.png'), 'outside fixture');
        fs.symlinkSync(f.outside, path.join(f.directory, 'example'), process.platform === 'win32' ? 'junction' : 'dir');
        assert.throws(() => resolveScreenshot(f.repo, screenshotPath('example', 'chromium')), /escapes repository/);
    });
}

test('directory links whose real target remains inside the repository retain valid artifacts', (t) => {
    const f = fixture(t);
    const target = path.join(f.repo, 'retained-matrix');
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'matrix-chromium.png'), 'retained fixture');
    fs.symlinkSync(target, path.join(f.directory, 'example'), process.platform === 'win32' ? 'junction' : 'dir');
    const file = resolveScreenshot(f.repo, screenshotPath('example', 'chromium'));
    assert.equal(fs.readFileSync(file, 'utf8'), 'retained fixture');
});

for (const invalid of [
    '../outside.png',
    '/docs/evidence/browser-matrix/example/matrix-chromium.png',
    'C:\\docs\\evidence\\browser-matrix\\example\\matrix-chromium.png',
    '\\\\host\\docs\\evidence\\browser-matrix\\example\\matrix-chromium.png',
    'docs/evidence/browser-matrix/../matrix-chromium.png',
    'docs/evidence/browser-matrix/example/../../outside.png',
    'docs/evidence/browser-matrix/example/matrix-chromium.png/../../outside',
    'docs/evidence/browser-matrix/example/matrix-chromium.png\0',
    'docs/evidence/browser-matrix/example/matrix-chromium.png?other',
    'docs/evidence/browser-matrix/example/matrix-unknown.png',
    null,
]) {
    test(`artifact paths fail closed for ${JSON.stringify(invalid)}`, () => {
        assert.throws(() => resolveScreenshot(root, invalid), /Invalid matrix artifact path/);
    });
}

test('all retained screenshot bytes still match original hashes and sizes after path normalization', () => {
    const report = JSON.parse(fs.readFileSync(path.join(root, 'docs/evidence/browser-matrix/browser-matrix.json')));
    for (const record of report.records) {
        const bytes = fs.readFileSync(resolveScreenshot(root, record.png));
        assert.equal(bytes.length, record.pngBytes);
        assert.equal(crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16), record.pngSha256_16);
    }
});
