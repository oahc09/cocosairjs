const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { sourceFingerprint } = require(path.join(process.cwd(), 'tools/verify/webgpu-candidate.cjs'));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'cocosair-webgpu-identity-'));
try {
    execFileSync('git', ['init', '--quiet', temporary]);
    const dir = path.join(temporary, 'examples/webgpu-basic');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'example.json');
    const spec = { validation: { visual: ['visible-frame'] }, status: 'stable' };
    fs.writeFileSync(file, JSON.stringify(spec));
    const before = sourceFingerprint(temporary);
    fs.writeFileSync(file, JSON.stringify({ ...spec, status: 'draft', promotion: { candidate: 'new' }, promotionEvidence: {}, stableReview: {} }, null, 4));
    const bookkeepingExcluded = sourceFingerprint(temporary) === before;
    spec.validation.visual.push('frame-diff');
    fs.writeFileSync(file, JSON.stringify(spec));
    const realSpecBound = sourceFingerprint(temporary) !== before;
    const beforeCode = sourceFingerprint(temporary);
    fs.writeFileSync(path.join(dir, 'main.js'), 'export const changed = true;\n');
    const realSourceBound = sourceFingerprint(temporary) !== beforeCode;
    const result = { bookkeepingExcluded, realSpecBound, realSourceBound };
    result.passed = Object.values(result).every(Boolean);
    fs.writeFileSync(path.join(__dirname, 'identity-check.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(result);
    process.exitCode = result.passed ? 0 : 1;
} finally {
    const checked = path.resolve(temporary);
    if (!checked.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(checked).startsWith('cocosair-webgpu-identity-')) throw Error('Unexpected scratch path');
    fs.rmSync(checked, { recursive: true, force: true });
}
