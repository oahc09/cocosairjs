const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('node:assert/strict');
const root = process.cwd();
const source = __dirname;
const target = path.join(root, 'docs/evidence/release-refresh-windows');
assert.equal(fs.existsSync(target), false, 'refuse to replace an existing evidence archive');
assert.equal(target.startsWith(path.join(root, 'docs/evidence') + path.sep), true);
const report = JSON.parse(fs.readFileSync(path.join(source, 'report.json'), 'utf8'));
assert.equal(report.gallery.pass, 303);
assert.equal(report.browserMatrix.pass, 78);
assert.equal(report.api.runtimeEvidence, 'BLOCKED');
fs.cpSync(source, target, { recursive: true, errorOnExist: true, force: false });
const files = {};
function walk(directory, prefix = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        const relative = prefix ? prefix + '/' + entry.name : entry.name;
        assert.equal(entry.isSymbolicLink(), false);
        if (entry.isDirectory()) walk(file, relative);
        else if (entry.isFile()) {
            const bytes = fs.readFileSync(file);
            files[relative] = { bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
        }
    }
}
walk(target);
for (const [relative, expected] of Object.entries(files)) {
    const original = fs.readFileSync(path.join(source, relative));
    assert.equal(original.length, expected.bytes);
    assert.equal(crypto.createHash('sha256').update(original).digest('hex'), expected.sha256);
}
const manifest = { schema: 'cocos-air.evidence-files/v1', createdAt: new Date().toISOString(),
    report: 'report.json', apiStatus: 'BLOCKED', releaseReady: false, files };
fs.writeFileSync(path.join(target, 'files-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ target: path.relative(root, target).replace(/\\/g, '/'), files: Object.keys(files).length,
    bytes: Object.values(files).reduce((sum, entry) => sum + entry.bytes, 0), copyHashesVerified: true }));
