const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const files = [
    'build/cocosair.module.js',
    'build/cocosair.module.js.map',
    'build/cocosair.module.min.js',
    'build/cocosair.module.min.js.map',
    'build/cocosair.module.d.ts',
    'build/cocosair.legacy.d.ts',
    'tools/build/build-number.json',
];
const fingerprint = (name) => {
    const bytes = fs.readFileSync(path.join(root, name));
    return { path: name, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
};
const receipt = {
    schema: 1,
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    createdAt: new Date().toISOString(),
    workflowRunId: process.env.GITHUB_RUN_ID || null,
    source: fingerprint('src/cocos/gfx/webgl2/webgl2-commands.ts'),
    files: files.map(fingerprint),
};
const out = path.join(root, 'output/audit-runtime');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'provenance.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
